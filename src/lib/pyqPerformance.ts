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
