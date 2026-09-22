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
