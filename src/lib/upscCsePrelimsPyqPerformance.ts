// UPSC CSE Prelims PYQ performance — the UPSC counterpart to lib/pyqPerformance.ts, same
// aggregation pattern, computed entirely from UPSC_CSE_PRELIMS_PYQ_BANK + UpscCsePrelimsPyqAttempt[]
// (never persisted or duplicated). Subject/microsyllabus titles are resolved through the real,
// existing UPSC CSE syllabus tree (lib/upscCseSyllabus.ts / data/upscCsePrelimsSyllabus.ts) — no
// parallel syllabus/title data of its own. A question with no subject or no resolved
// microsyllabusId (mappingStatus 'needs_review') is aggregated under the UNCLASSIFIED_SUBJECT /
// UNMAPPED_MICROSYLLABUS buckets (lib/upscCsePrelimsPyqFilters.ts) rather than silently dropped.
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import { questionSubject, questionMicrosyllabusId, UNMAPPED_MICROSYLLABUS, computeRevisionStatusMap, revisionStatusOf } from './upscCsePrelimsPyqFilters';
import { getMicrosyllabusItemById, type UpscCseSyllabusTree } from './upscCseSyllabus';

export type UpscCsePrelimsQuestionStatus = 'correct' | 'wrong' | 'unanswered';

export function upscCsePrelimsQuestionStatus(q: UpscCsePrelimsBatchPyq, answers: Record<string, string | null>): UpscCsePrelimsQuestionStatus {
  const ans = answers[q.id];
  if (!ans) return 'unanswered';
  return q.correctOptionId !== undefined && ans === q.correctOptionId ? 'correct' : 'wrong';
}

export interface UpscCsePrelimsOverallPerformance {
  testsCompleted: number;
  totalQuestions: number;
  totalAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalUnanswered: number;
  overallAccuracy: number;
}

export interface UpscCsePrelimsSubjectPerformance {
  subject: string;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number;
  testCount: number;
}

export interface UpscCsePrelimsMicrosyllabusPerformance {
  microsyllabusId: string;
  title: string;
  subject: string;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

export interface UpscCsePrelimsYearPaperPerformance {
  year: number;
  paper: string;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number;
  testCount: number;
}

export interface UpscCsePrelimsPerformanceSnapshot {
  overall: UpscCsePrelimsOverallPerformance;
  subjects: UpscCsePrelimsSubjectPerformance[];
  microsyllabus: UpscCsePrelimsMicrosyllabusPerformance[];
  weakMicrosyllabus: UpscCsePrelimsMicrosyllabusPerformance[];
  strongestMicrosyllabus: UpscCsePrelimsMicrosyllabusPerformance[];
  yearPaper: UpscCsePrelimsYearPaperPerformance[];
  /** Questions in `bank` never answered by their most recent attempt. */
  unattemptedCount: number;
}

/**
 * The single aggregation pass behind the UPSC CSE Prelims practice page's Performance view.
 * Returns null when there are no attempts yet — same "take a test to see analytics" empty state as
 * lib/pyqPerformance.ts's computePyqPerformance.
 */
export function computeUpscCsePrelimsPerformance(
  bank: readonly UpscCsePrelimsBatchPyq[],
  attempts: readonly UpscCsePrelimsPyqAttempt[],
  syllabusTree: UpscCseSyllabusTree,
): UpscCsePrelimsPerformanceSnapshot | null {
  if (attempts.length === 0) return null;

  let totalQuestions = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalUnanswered = 0;

  const subjectAgg = new Map<string, { attempted: number; correct: number; wrong: number; testIds: Set<string> }>();
  const microAgg = new Map<string, { attempted: number; correct: number; wrong: number }>();
  const yearPaperAgg = new Map<string, { year: number; paper: string; attempted: number; correct: number; wrong: number; testIds: Set<string> }>();

  for (const attempt of attempts) {
    totalQuestions += attempt.questionIds.length;
    totalCorrect += attempt.correctCount;
    totalWrong += attempt.wrongCount;
    totalUnanswered += attempt.unansweredCount;

    for (const qid of attempt.questionIds) {
      const q = bank.find((p) => p.id === qid);
      if (!q) continue;
      const status = upscCsePrelimsQuestionStatus(q, attempt.answers);

      const subj = questionSubject(q);
      const subjEntry = subjectAgg.get(subj) ?? { attempted: 0, correct: 0, wrong: 0, testIds: new Set<string>() };
      subjEntry.testIds.add(attempt.id);
      if (status !== 'unanswered') {
        subjEntry.attempted += 1;
        if (status === 'correct') subjEntry.correct += 1;
        else subjEntry.wrong += 1;
      }
      subjectAgg.set(subj, subjEntry);

      if (status !== 'unanswered') {
        const microId = questionMicrosyllabusId(q);
        const microEntry = microAgg.get(microId) ?? { attempted: 0, correct: 0, wrong: 0 };
        microEntry.attempted += 1;
        if (status === 'correct') microEntry.correct += 1;
        else microEntry.wrong += 1;
        microAgg.set(microId, microEntry);
      }

      if (q.year !== undefined && q.paper !== undefined) {
        const key = `${q.year}::${q.paper}`;
        const ypEntry = yearPaperAgg.get(key) ?? { year: q.year, paper: q.paper, attempted: 0, correct: 0, wrong: 0, testIds: new Set<string>() };
        ypEntry.testIds.add(attempt.id);
        if (status !== 'unanswered') {
          ypEntry.attempted += 1;
          if (status === 'correct') ypEntry.correct += 1;
          else ypEntry.wrong += 1;
        }
        yearPaperAgg.set(key, ypEntry);
      }
    }
  }

  const totalAttempted = totalCorrect + totalWrong;

  const overall: UpscCsePrelimsOverallPerformance = {
    testsCompleted: attempts.length,
    totalQuestions,
    totalAttempted,
    totalCorrect,
    totalWrong,
    totalUnanswered,
    overallAccuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0,
  };

  const subjects: UpscCsePrelimsSubjectPerformance[] = Array.from(subjectAgg.entries())
    .map(([subject, v]) => ({
      subject,
      attempted: v.attempted,
      correct: v.correct,
      wrong: v.wrong,
      accuracy: v.attempted > 0 ? (v.correct / v.attempted) * 100 : 0,
      testCount: v.testIds.size,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const allMicro: UpscCsePrelimsMicrosyllabusPerformance[] = Array.from(microAgg.entries()).map(([microsyllabusId, v]) => {
    const node = microsyllabusId === UNMAPPED_MICROSYLLABUS ? undefined : getMicrosyllabusItemById(syllabusTree, microsyllabusId);
    return {
      microsyllabusId,
      title: node?.title ?? 'Needs Review / Unmapped',
      subject: node ? '' : '', // resolved below once we know the node's subject, if any
      attempted: v.attempted,
      correct: v.correct,
      wrong: v.wrong,
      accuracy: v.attempted > 0 ? (v.correct / v.attempted) * 100 : 0,
    };
  });
  // Resolve each mapped node's own subject title for display (kept as a second pass so the map
  // above stays a straightforward 1:1 translation of microAgg's keys).
  for (const m of allMicro) {
    if (m.microsyllabusId === UNMAPPED_MICROSYLLABUS) continue;
    const subject = syllabusTree.subjects.find((s) => s.id === syllabusTree.microsyllabus.find((i) => i.id === m.microsyllabusId)?.subjectId);
    m.subject = subject?.title ?? '';
  }

  const microsyllabus = [...allMicro].sort((a, b) => a.title.localeCompare(b.title));
  const weakMicrosyllabus = [...allMicro].sort((a, b) => a.accuracy - b.accuracy || a.title.localeCompare(b.title)).slice(0, 6);
  const strongestMicrosyllabus = [...allMicro].sort((a, b) => b.accuracy - a.accuracy || a.title.localeCompare(b.title)).slice(0, 6);

  const yearPaper: UpscCsePrelimsYearPaperPerformance[] = Array.from(yearPaperAgg.values())
    .map((v) => ({
      year: v.year,
      paper: v.paper,
      attempted: v.attempted,
      correct: v.correct,
      wrong: v.wrong,
      accuracy: v.attempted > 0 ? (v.correct / v.attempted) * 100 : 0,
      testCount: v.testIds.size,
    }))
    .sort((a, b) => a.year - b.year || a.paper.localeCompare(b.paper));

  // Reuses the exact same "unattempted" definition as computeRevisionStatusMap (most recent
  // attempt touching a question wins) — never a second, conflicting definition.
  const revisionMap = computeRevisionStatusMap(bank, attempts);
  const unattemptedCount = bank.filter((p) => revisionStatusOf(revisionMap, p.id) === 'unattempted').length;

  return { overall, subjects, microsyllabus, weakMicrosyllabus, strongestMicrosyllabus, yearPaper, unattemptedCount };
}

// ============================================================================================
// PYQ Weak Spots & Repeated Mistakes (Phase 6 Step 2) — the UPSC CSE counterpart to
// lib/pyqPerformance.ts's own section of the same name; see that module's header for the full
// design rationale (why this is additive, not a second scoring/accuracy implementation, and why
// "weak area by mistake volume" re-sorts the existing microsyllabus[] array rather than rescanning
// attempts). topMicrosyllabusByMistakes/topSubjectsByMistakes preserve the existing
// UNMAPPED_MICROSYLLABUS/UNCLASSIFIED_SUBJECT buckets automatically, simply by re-sorting arrays
// that already fold needs_review questions into those sentinel buckets — a needs_review question's
// mistakes are never dropped and never misattributed to a real microsyllabus/subject.
//
// 2024 answer-key limitation (see data/upscCsePrelimsPyqBatch2024Q1Q100Raw.ts's own header): 2024
// questions have no correctOptionId at all. computeRepeatedMistakes below explicitly skips any
// question with no correctOptionId, so an attempted-but-unkeyed 2024 question contributes to
// NEITHER correctCount nor wrongCount here — never fabricated as a "mistake". This mirrors the
// same caution the batch import pipeline already applies to classification (never guess); this
// module applies it to scoring output instead.
// ============================================================================================

export interface UpscCsePrelimsRepeatedMistake {
  questionId: string;
  /** correctCount + wrongCount — an attempt where this question was left unanswered, or where the
   * question has no correctOptionId at all (see 2024 note above), doesn't count. */
  totalAttempts: number;
  correctCount: number;
  wrongCount: number;
  /** submittedAt of the most recent SCOREABLE attempt that included this question. */
  lastAttemptAt: string;
  /** Whether that most recent attempt got it right — mirrors revisionStatusOf's "latest wins"
   * semantics for display only; wrongCount is never reduced by a later correct answer. */
  latestCorrect: boolean;
}

/**
 * Full-history per-question mistake tally across every attempt (see this section's header).
 * Reuses upscCsePrelimsQuestionStatus for correctness — never a second correct/wrong
 * determination. A question with no correctOptionId (2024, until a key is attached) is skipped
 * entirely, never counted as a fabricated "wrong".
 */
export function computeUpscCsePrelimsRepeatedMistakes(
  bank: readonly UpscCsePrelimsBatchPyq[],
  attempts: readonly UpscCsePrelimsPyqAttempt[],
): UpscCsePrelimsRepeatedMistake[] {
  const agg = new Map<string, { correctCount: number; wrongCount: number; lastAttemptAt: string; latestCorrect: boolean }>();

  const chronological = [...attempts].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  for (const attempt of chronological) {
    for (const qid of attempt.questionIds) {
      const q = bank.find((p) => p.id === qid);
      if (!q) continue; // defensive: skip if a question id can't be resolved
      if (q.correctOptionId === undefined) continue; // no answer key yet (2024) — never fabricate a result
      const status = upscCsePrelimsQuestionStatus(q, attempt.answers);
      if (status === 'unanswered') continue;

      const entry = agg.get(qid) ?? { correctCount: 0, wrongCount: 0, lastAttemptAt: attempt.submittedAt, latestCorrect: false };
      if (status === 'correct') entry.correctCount += 1;
      else entry.wrongCount += 1;
      entry.lastAttemptAt = attempt.submittedAt;
      entry.latestCorrect = status === 'correct';
      agg.set(qid, entry);
    }
  }

  return Array.from(agg.entries()).map(([questionId, v]) => ({
    questionId,
    totalAttempts: v.correctCount + v.wrongCount,
    correctCount: v.correctCount,
    wrongCount: v.wrongCount,
    lastAttemptAt: v.lastAttemptAt,
    latestCorrect: v.latestCorrect,
  }));
}

/** Worst-first view of computeUpscCsePrelimsRepeatedMistakes's output. */
export function topUpscCsePrelimsRepeatedMistakes(mistakes: UpscCsePrelimsRepeatedMistake[], limit = 6): UpscCsePrelimsRepeatedMistake[] {
  return [...mistakes]
    .filter((m) => m.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount || a.questionId.localeCompare(b.questionId))
    .slice(0, limit);
}

/** Microsyllabus areas ranked by raw mistake volume (not accuracy) — re-sorts
 * computeUpscCsePrelimsPerformance's own microsyllabus[], never a second attempt scan. Includes
 * the "Needs Review / Unmapped" bucket exactly as computeUpscCsePrelimsPerformance already built
 * it, never dropped. */
export function topMicrosyllabusByMistakes(microsyllabus: UpscCsePrelimsMicrosyllabusPerformance[], limit = 6): UpscCsePrelimsMicrosyllabusPerformance[] {
  return [...microsyllabus]
    .filter((m) => m.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Same as topMicrosyllabusByMistakes, at subject granularity. */
export function topUpscCsePrelimsSubjectsByMistakes(subjects: UpscCsePrelimsSubjectPerformance[], limit = 6): UpscCsePrelimsSubjectPerformance[] {
  return [...subjects]
    .filter((s) => s.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.subject.localeCompare(b.subject))
    .slice(0, limit);
}

export type UpscCsePrelimsPerformanceTrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

export interface UpscCsePrelimsPerformanceTrend {
  recentAttemptCount: number;
  previousAttemptCount: number;
  recentAccuracy: number | null;
  previousAccuracy: number | null;
  direction: UpscCsePrelimsPerformanceTrendDirection;
}

/** Same window size and reasoning as lib/pyqPerformance.ts's own TREND_WINDOW_SIZE — kept as a
 * separate constant (not imported from that file) to preserve this module's existing "no shared
 * code between the two workspaces' PYQ modules" convention, same as every other export here. */
export const UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE = 5;

/** Same reasoning as lib/pyqPerformance.ts's own TREND_STABLE_BAND_PCT. */
export const UPSC_CSE_PRELIMS_TREND_STABLE_BAND_PCT = 5;

/**
 * Deterministic recent-vs-previous accuracy comparison, reusing each attempt's OWN already-stored
 * correctCount/wrongCount (never recomputed). Requires a FULL window on both sides before
 * returning anything but 'insufficient_data'.
 */
export function computeUpscCsePrelimsRecentVsPreviousTrend(
  attempts: readonly UpscCsePrelimsPyqAttempt[],
  windowSize: number = UPSC_CSE_PRELIMS_TREND_WINDOW_SIZE,
): UpscCsePrelimsPerformanceTrend {
  const insufficient: UpscCsePrelimsPerformanceTrend = {
    recentAttemptCount: Math.min(attempts.length, windowSize),
    previousAttemptCount: Math.max(0, Math.min(attempts.length - windowSize, windowSize)),
    recentAccuracy: null,
    previousAccuracy: null,
    direction: 'insufficient_data',
  };
  if (attempts.length < windowSize * 2) return insufficient;

  const newestFirst = [...attempts].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  const recent = newestFirst.slice(0, windowSize);
  const previous = newestFirst.slice(windowSize, windowSize * 2);

  const accuracyOf = (window: readonly UpscCsePrelimsPyqAttempt[]): number | null => {
    const correct = window.reduce((sum, a) => sum + a.correctCount, 0);
    const wrong = window.reduce((sum, a) => sum + a.wrongCount, 0);
    const attemptedQuestions = correct + wrong;
    return attemptedQuestions > 0 ? (correct / attemptedQuestions) * 100 : null;
  };

  const recentAccuracy = accuracyOf(recent);
  const previousAccuracy = accuracyOf(previous);
  if (recentAccuracy === null || previousAccuracy === null) {
    return { recentAttemptCount: recent.length, previousAttemptCount: previous.length, recentAccuracy, previousAccuracy, direction: 'insufficient_data' };
  }

  const delta = recentAccuracy - previousAccuracy;
  const direction: UpscCsePrelimsPerformanceTrendDirection =
    delta > UPSC_CSE_PRELIMS_TREND_STABLE_BAND_PCT ? 'improving' : delta < -UPSC_CSE_PRELIMS_TREND_STABLE_BAND_PCT ? 'declining' : 'stable';

  return { recentAttemptCount: recent.length, previousAttemptCount: previous.length, recentAccuracy, previousAccuracy, direction };
}

// ============================================================================================
// Revise My Repeated Mistakes (Phase 6 Step 3) — the UPSC CSE counterpart to
// lib/pyqPerformance.ts's own selectRepeatedMistakePracticeIds, same design: turns
// computeUpscCsePrelimsRepeatedMistakes's worst-first ranking into a session-ready list of
// question ids, launched through the EXISTING revision session (pages/UpscCsePyqTest.tsx's
// startRevision, backed by the unmodified lib/revisionQueue.ts). Since
// computeUpscCsePrelimsRepeatedMistakes already skips any question with no correctOptionId (the
// 2024 set, until a real answer key is attached — see that function's own header), a 2024
// question can never appear in this selector's output either.
// ============================================================================================

/** Same reasoning as lib/pyqPerformance.ts's own DEFAULT_REPEATED_MISTAKE_PRACTICE_CAP. */
export const DEFAULT_UPSC_CSE_PRELIMS_REPEATED_MISTAKE_PRACTICE_CAP = 20;

/**
 * Selects question ids for a "Revise My Repeated Mistakes" session: the worst-first ranking
 * topUpscCsePrelimsRepeatedMistakes already computes, capped to a session-sized list — order
 * preserved exactly, ids defensively de-duplicated via a Set. Never mutates `mistakes`. Returns
 * [] when there are no repeated mistakes yet, or when `cap` is zero or negative.
 */
export function selectUpscCsePrelimsRepeatedMistakePracticeIds(
  mistakes: UpscCsePrelimsRepeatedMistake[],
  cap: number = DEFAULT_UPSC_CSE_PRELIMS_REPEATED_MISTAKE_PRACTICE_CAP,
): string[] {
  if (cap <= 0) return [];
  const ranked = topUpscCsePrelimsRepeatedMistakes(mistakes, cap);
  return [...new Set(ranked.map((m) => m.questionId))];
}
