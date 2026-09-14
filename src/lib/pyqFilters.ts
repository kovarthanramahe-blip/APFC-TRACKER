// Pure, framework-free PYQ filtering/aggregation helpers — extracted out of PYQTest.tsx so the
// core browsing/revision logic is unit-testable without rendering React. Every function here is
// fully data-driven from the `bank` argument (always PYQ_BANK in the app); nothing is hardcoded.
import type { PYQ, PYQAttempt, SubjectColorKey } from './types';

export type RevisionStatus = 'correct' | 'incorrect' | 'unattempted';
export type RevisionFilter = 'all' | RevisionStatus;

export function getAvailableYears(bank: PYQ[]): number[] {
  return Array.from(new Set(bank.map((p) => p.year))).sort((a, b) => a - b);
}

export function getYearCounts(bank: PYQ[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const p of bank) counts[p.year] = (counts[p.year] ?? 0) + 1;
  return counts;
}

export function formatYearLabel(y: number | 'all'): string {
  return y === 'all' ? 'All Years' : String(y);
}

/** All questions matching the given year (or the whole bank when year === 'all'). */
export function yearPool(bank: PYQ[], year: number | 'all'): PYQ[] {
  return year === 'all' ? bank : bank.filter((p) => p.year === year);
}

/** Per-subject question counts within the given year's pool — only subjects actually present are keyed. */
export function getSubjectCounts(bank: PYQ[], year: number | 'all'): Partial<Record<SubjectColorKey, number>> {
  const counts: Partial<Record<SubjectColorKey, number>> = {};
  for (const p of yearPool(bank, year)) counts[p.subject] = (counts[p.subject] ?? 0) + 1;
  return counts;
}

/** All questions matching the given year + subject (year and/or subject may be 'all'). */
export function subjectPool(bank: PYQ[], year: number | 'all', subject: SubjectColorKey | 'all'): PYQ[] {
  const byYear = yearPool(bank, year);
  return subject === 'all' ? byYear : byYear.filter((p) => p.subject === subject);
}

export interface TopicCount {
  id: string;
  count: number;
}

/** Per-topic question counts within the given year + subject pool — only topics actually present are returned. */
export function getTopicCounts(bank: PYQ[], year: number | 'all', subject: SubjectColorKey | 'all'): TopicCount[] {
  const counts = new Map<string, number>();
  for (const p of subjectPool(bank, year, subject)) counts.set(p.topicId, (counts.get(p.topicId) ?? 0) + 1);
  return Array.from(counts.entries()).map(([id, count]) => ({ id, count }));
}

/**
 * Per-question revision status, derived entirely from PYQAttempt[] — no persisted data of its own.
 * For each question, the MOST RECENT attempt that included it decides its status: a null/skipped
 * answer in that attempt still counts as 'unattempted' (it wasn't actually answered), and a
 * question that never appeared in any attempt is 'unattempted' by omission (see lookup below).
 */
export function computeRevisionStatusMap(bank: PYQ[], attempts: PYQAttempt[]): Map<string, RevisionStatus> {
  const map = new Map<string, RevisionStatus>();
  const sorted = [...attempts].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  for (const attempt of sorted) {
    for (const qid of attempt.questionIds) {
      if (map.has(qid)) continue; // already resolved by a more recent attempt
      const ans = attempt.answers[qid];
      if (!ans) {
        map.set(qid, 'unattempted');
        continue;
      }
      const pyq = bank.find((p) => p.id === qid);
      if (!pyq) continue;
      map.set(qid, ans === pyq.correctOptionId ? 'correct' : 'incorrect');
    }
  }
  return map;
}

/** Looks up a question's revision status, defaulting to 'unattempted' when it has no recorded attempt. */
export function revisionStatusOf(map: Map<string, RevisionStatus>, questionId: string): RevisionStatus {
  return map.get(questionId) ?? 'unattempted';
}

export interface PYQFilterOptions {
  year: number | 'all';
  subject: SubjectColorKey | 'all';
  topicId: string | 'all';
  revisionFilter: RevisionFilter;
  revisionStatusMap: Map<string, RevisionStatus>;
}

/** The single source of truth for "which questions match the current filter selection". */
export function filterPYQs(bank: PYQ[], opts: PYQFilterOptions): PYQ[] {
  return bank.filter((p) => {
    if (opts.year !== 'all' && p.year !== opts.year) return false;
    if (opts.subject !== 'all' && p.subject !== opts.subject) return false;
    if (opts.topicId !== 'all' && p.topicId !== opts.topicId) return false;
    if (opts.revisionFilter !== 'all' && revisionStatusOf(opts.revisionStatusMap, p.id) !== opts.revisionFilter) return false;
    return true;
  });
}
