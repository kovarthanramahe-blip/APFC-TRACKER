// Single source of truth for "how is the student doing on PYQs" — extracted out of PYQTest.tsx so
// both the PYQ Test page's own Performance view and the main Analytics page compute identical
// numbers from identical logic. Everything here is derived entirely from PYQ_BANK + PYQAttempt[];
// nothing is persisted or duplicated.
import type { PYQ, PYQAttempt, SubjectColorKey } from './types';
import { SYLLABUS } from '../data/syllabus';
import { computeRevisionStatusMap, revisionStatusOf } from './pyqFilters';

// APFC 2025 marking scheme: +2.5 for correct, -1/3rd (given as -0.833333) for wrong, 0 for unanswered.
export const MARKS_CORRECT = 2.5;
export const MARKS_WRONG = -0.833333;

// topicId -> topic title / subject, built once from the existing syllabus (not modified).
export const TOPIC_TITLES: Record<string, string> = Object.fromEntries(SYLLABUS.flatMap((s) => s.topics.map((t) => [t.id, t.title])));
export const TOPIC_SUBJECTS: Record<string, SubjectColorKey> = Object.fromEntries(
  SYLLABUS.flatMap((s) => s.topics.map((t) => [t.id, s.colorKey])),
);

export type PyqQuestionStatus = 'correct' | 'wrong' | 'unanswered';

export function pyqQuestionStatus(q: PYQ, answers: Record<string, string | null>): PyqQuestionStatus {
  const ans = answers[q.id];
  if (!ans) return 'unanswered';
  return ans === q.correctOptionId ? 'correct' : 'wrong';
}

export interface PyqOverallPerformance {
  testsCompleted: number;
  totalQuestions: number;
  totalAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalUnanswered: number;
  overallAccuracy: number;
  averageScore: number;
}

export interface PyqSubjectPerformance {
  subject: SubjectColorKey;
  subjectTitle: string;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number;
  testCount: number;
}

export interface PyqTopicPerformance {
  topicId: string;
  topicTitle: string;
  subject: SubjectColorKey | undefined;
  subjectTitle: string;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

export interface PyqYearPerformance {
  year: number;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number;
  score: number;
  testCount: number;
}

export interface PyqPerformanceSnapshot {
  overall: PyqOverallPerformance;
  subjects: PyqSubjectPerformance[];
  topics: PyqTopicPerformance[];
  weakTopics: PyqTopicPerformance[];
  strongestTopics: PyqTopicPerformance[];
  years: PyqYearPerformance[];
  strongestSubject: PyqSubjectPerformance | null;
  weakestSubject: PyqSubjectPerformance | null;
  /** Questions in `bank` that have never been answered by the most recent attempt touching them. */
  unattemptedCount: number;
}

/**
 * The single aggregation pass behind every PYQ performance view (PYQTest's own "Performance"
 * screen and the Analytics "PYQ Performance" section). Returns null when there are no attempts
 * yet, matching the existing "take a test to see analytics" empty state.
 *
 * Subject/topic/year are always resolved per-question from `bank` (never from an attempt's own
 * subject/topicId/year filter fields, which are just the selection used to build that test and
 * are 'all' for mixed tests) — misattributing a mixed test to one subject/topic/year would be
 * a real bug, not a simplification.
 */
export function computePyqPerformance(bank: PYQ[], attempts: PYQAttempt[]): PyqPerformanceSnapshot | null {
  if (attempts.length === 0) return null;

  let totalQuestions = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalUnanswered = 0;
  let totalScore = 0;

  const subjectAgg = new Map<SubjectColorKey, { attempted: number; correct: number; wrong: number; testIds: Set<string> }>();
  const topicAgg = new Map<string, { attempted: number; correct: number; wrong: number }>();
  const yearAgg = new Map<number, { attempted: number; correct: number; wrong: number; testIds: Set<string> }>();

  for (const attempt of attempts) {
    totalQuestions += attempt.questionIds.length;
    totalCorrect += attempt.correctCount;
    totalWrong += attempt.wrongCount;
    totalUnanswered += attempt.unansweredCount;
    totalScore += attempt.score;

    for (const qid of attempt.questionIds) {
      const pyq = bank.find((p) => p.id === qid);
      if (!pyq) continue; // defensive: skip if a question id can't be resolved
      const status = pyqQuestionStatus(pyq, attempt.answers);

      const subjEntry = subjectAgg.get(pyq.subject) ?? { attempted: 0, correct: 0, wrong: 0, testIds: new Set<string>() };
      subjEntry.testIds.add(attempt.id);
      if (status !== 'unanswered') {
        subjEntry.attempted += 1;
        if (status === 'correct') subjEntry.correct += 1;
        else subjEntry.wrong += 1;
      }
      subjectAgg.set(pyq.subject, subjEntry);

      if (status !== 'unanswered') {
        const topicEntry = topicAgg.get(pyq.topicId) ?? { attempted: 0, correct: 0, wrong: 0 };
        topicEntry.attempted += 1;
        if (status === 'correct') topicEntry.correct += 1;
        else topicEntry.wrong += 1;
        topicAgg.set(pyq.topicId, topicEntry);
      }

      const yearEntry = yearAgg.get(pyq.year) ?? { attempted: 0, correct: 0, wrong: 0, testIds: new Set<string>() };
      yearEntry.testIds.add(attempt.id);
      if (status !== 'unanswered') {
        yearEntry.attempted += 1;
        if (status === 'correct') yearEntry.correct += 1;
        else yearEntry.wrong += 1;
      }
      yearAgg.set(pyq.year, yearEntry);
    }
  }

  const totalAttempted = totalCorrect + totalWrong;

  const overall: PyqOverallPerformance = {
    testsCompleted: attempts.length,
    totalQuestions,
    totalAttempted,
    totalCorrect,
    totalWrong,
    totalUnanswered,
    overallAccuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0,
    averageScore: totalScore / attempts.length,
  };

  const subjects: PyqSubjectPerformance[] = Array.from(subjectAgg.entries())
    .map(([subj, v]) => ({
      subject: subj,
      subjectTitle: SYLLABUS.find((s) => s.colorKey === subj)?.shortTitle ?? subj,
      attempted: v.attempted,
      correct: v.correct,
      wrong: v.wrong,
      accuracy: v.attempted > 0 ? (v.correct / v.attempted) * 100 : 0,
      testCount: v.testIds.size,
    }))
    .sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle));

  const allTopics: PyqTopicPerformance[] = Array.from(topicAgg.entries()).map(([topicId, v]) => {
    const subj = TOPIC_SUBJECTS[topicId];
    return {
      topicId,
      topicTitle: TOPIC_TITLES[topicId] ?? topicId,
      subject: subj,
      subjectTitle: subj ? SYLLABUS.find((s) => s.colorKey === subj)?.shortTitle ?? subj : '—',
      attempted: v.attempted,
      correct: v.correct,
      wrong: v.wrong,
      accuracy: v.attempted > 0 ? (v.correct / v.attempted) * 100 : 0,
    };
  });

  const topics = [...allTopics].sort((a, b) => a.topicTitle.localeCompare(b.topicTitle));

  // Weakest first; ties broken alphabetically by topic title for a stable, deterministic order.
  const weakTopics = [...allTopics].sort((a, b) => a.accuracy - b.accuracy || a.topicTitle.localeCompare(b.topicTitle)).slice(0, 6);
  // Strongest first; same tie-break, same "must have at least one attempted question" pool as weakTopics.
  const strongestTopics = [...allTopics].sort((a, b) => b.accuracy - a.accuracy || a.topicTitle.localeCompare(b.topicTitle)).slice(0, 6);

  const years: PyqYearPerformance[] = Array.from(yearAgg.entries())
    .map(([y, v]) => ({
      year: y,
      attempted: v.attempted,
      correct: v.correct,
      wrong: v.wrong,
      accuracy: v.attempted > 0 ? (v.correct / v.attempted) * 100 : 0,
      score: v.correct * MARKS_CORRECT + v.wrong * MARKS_WRONG,
      testCount: v.testIds.size,
    }))
    .sort((a, b) => a.year - b.year);

  // Best/weakest performing subject — only among subjects with at least one attempted question,
  // same tie-break convention as weak/strongest topics.
  const attemptedSubjects = subjects.filter((s) => s.attempted > 0);
  const strongestSubject = attemptedSubjects.length
    ? [...attemptedSubjects].sort((a, b) => b.accuracy - a.accuracy || a.subjectTitle.localeCompare(b.subjectTitle))[0]
    : null;
  const weakestSubject = attemptedSubjects.length
    ? [...attemptedSubjects].sort((a, b) => a.accuracy - b.accuracy || a.subjectTitle.localeCompare(b.subjectTitle))[0]
    : null;

  // Reuses the exact same "unattempted" definition already established by the Revision filter
  // (most recent attempt touching a question decides its status) — never a second, conflicting
  // definition of what counts as "not yet attempted".
  const revisionMap = computeRevisionStatusMap(bank, attempts);
  const unattemptedCount = bank.filter((p) => revisionStatusOf(revisionMap, p.id) === 'unattempted').length;

  return { overall, subjects, topics, weakTopics, strongestTopics, years, strongestSubject, weakestSubject, unattemptedCount };
}

// ============================================================================================
// PYQ Weak Spots & Repeated Mistakes (Phase 6 Step 2) — additive to everything above, never a
// second scoring/accuracy implementation. computeRepeatedMistakes is the one new per-question
// aggregation this stage introduces (neither computePyqPerformance's subjectAgg/topicAgg nor
// computeRevisionStatusMap expose a per-question wrong-count — the former discards question-level
// detail once folded into a subject/topic bucket, and the latter only tracks each question's
// single MOST RECENT status, by design, for the Revision filter). topTopicsByMistakes/
// topSubjectsByMistakes deliberately do NOT rescan attempts — they re-sort the topics[]/subjects[]
// arrays computePyqPerformance already computed (both already carry a full-history `wrong` count),
// so "weak area by mistake volume" reuses that existing aggregation pass verbatim rather than
// duplicating it. This is a different ranking signal from weakTopics/weakestSubject above (which
// rank by lowest accuracy) — a topic attempted 10 times with 4 wrong ranks above a topic attempted
// once and missed, which lowest-accuracy sorting alone would not surface.
// ============================================================================================

export interface PyqRepeatedMistake {
  questionId: string;
  /** correctCount + wrongCount — an attempt where this question was left unanswered doesn't count. */
  totalAttempts: number;
  correctCount: number;
  wrongCount: number;
  /** submittedAt of the most recent attempt that included this question (answered or not). */
  lastAttemptAt: string;
  /** Whether the MOST RECENT attempt got it right — mirrors lib/pyqFilters.ts's revisionStatusOf
   * "latest wins" semantics for display purposes only. wrongCount above is never reduced by a
   * later correct answer — this module's whole point is to preserve that full mistake history. */
  latestCorrect: boolean;
}

/**
 * Full-history per-question mistake tally across every attempt, never just the latest one (see
 * this section's own header). Reuses pyqQuestionStatus for correctness — never a second
 * correct/wrong determination. Only questions that were answered at least once appear in the
 * result; a question never attempted, or only ever left unanswered, is simply absent.
 */
export function computeRepeatedMistakes(bank: PYQ[], attempts: PYQAttempt[]): PyqRepeatedMistake[] {
  const agg = new Map<string, { correctCount: number; wrongCount: number; lastAttemptAt: string; latestCorrect: boolean }>();

  // Oldest first, so each question's entry is simply overwritten as we go — the last write for a
  // given question is always its most recent attempt.
  const chronological = [...attempts].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  for (const attempt of chronological) {
    for (const qid of attempt.questionIds) {
      const pyq = bank.find((p) => p.id === qid);
      if (!pyq) continue; // defensive: skip if a question id can't be resolved, same as computePyqPerformance
      const status = pyqQuestionStatus(pyq, attempt.answers);
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

/** Worst-first view of computeRepeatedMistakes's output — questions with at least one wrong
 * answer, most mistakes first. Ties broken by questionId for a stable, deterministic order. */
export function topRepeatedMistakes(mistakes: PyqRepeatedMistake[], limit = 6): PyqRepeatedMistake[] {
  return [...mistakes]
    .filter((m) => m.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount || a.questionId.localeCompare(b.questionId))
    .slice(0, limit);
}

/** Topics ranked by raw mistake volume (not accuracy) — re-sorts computePyqPerformance's own
 * topics[], never a second attempt scan. See this section's header for why this ranking differs
 * from weakTopics. */
export function topTopicsByMistakes(topics: PyqTopicPerformance[], limit = 6): PyqTopicPerformance[] {
  return [...topics]
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.topicTitle.localeCompare(b.topicTitle))
    .slice(0, limit);
}

/** Same as topTopicsByMistakes, at subject granularity. */
export function topSubjectsByMistakes(subjects: PyqSubjectPerformance[], limit = 6): PyqSubjectPerformance[] {
  return [...subjects]
    .filter((s) => s.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.subjectTitle.localeCompare(b.subjectTitle))
    .slice(0, limit);
}

export type PyqPerformanceTrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

export interface PyqPerformanceTrend {
  recentAttemptCount: number;
  previousAttemptCount: number;
  /** Null only when insufficient_data, or in the edge case where a window's attempts had nothing
   * answered — never fabricated as 0. */
  recentAccuracy: number | null;
  previousAccuracy: number | null;
  direction: PyqPerformanceTrendDirection;
}

/** Test attempts (not questions) per comparison window — small enough to reflect genuinely recent
 * form, large enough that one unusually easy/hard test doesn't swing the whole verdict. Consistent
 * with this app's existing "small N before trusting a signal" convention (see
 * lib/topicStatus.ts's MIN_PYQ_ATTEMPTS_FOR_SIGNAL = 3 for individual questions within a topic). */
export const TREND_WINDOW_SIZE = 5;

/** A recent-vs-previous accuracy swing smaller than this (percentage points) reads as noise, not a
 * genuine trend — no existing constant in this codebase covers a delta band (WEAK_PYQ_ACCURACY_THRESHOLD
 * is an absolute cutoff, a different concept), so this is a new, explicit, documented value. */
export const TREND_STABLE_BAND_PCT = 5;

/**
 * Deterministic recent-vs-previous accuracy comparison, reusing each attempt's OWN already-stored
 * correctCount/wrongCount (never recomputed) — no bank lookup needed at all. Requires a FULL
 * window on both sides (2 * windowSize attempts minimum) before returning anything but
 * 'insufficient_data', per this stage's explicit "never invent a trend from a partial window" rule.
 */
export function computeRecentVsPreviousTrend(attempts: PYQAttempt[], windowSize: number = TREND_WINDOW_SIZE): PyqPerformanceTrend {
  const insufficient: PyqPerformanceTrend = {
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

  const accuracyOf = (window: PYQAttempt[]): number | null => {
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
  const direction: PyqPerformanceTrendDirection = delta > TREND_STABLE_BAND_PCT ? 'improving' : delta < -TREND_STABLE_BAND_PCT ? 'declining' : 'stable';

  return { recentAttemptCount: recent.length, previousAttemptCount: previous.length, recentAccuracy, previousAccuracy, direction };
}
