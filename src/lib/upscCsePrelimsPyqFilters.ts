// Pure, framework-free UPSC CSE Prelims PYQ filtering/aggregation helpers — the UPSC counterpart to
// lib/pyqFilters.ts, same design, adapted to UpscCsePrelimsBatchPyq's shape: `subject` is a
// freeform string (often absent — see lib/upscCsePrelimsPyqBatchImport.ts), not APFC's closed
// SubjectColorKey, and questions are classified by `microsyllabusId` (present only when
// mappingStatus is 'mapped') rather than a mandatory topicId. A question with no subject/
// microsyllabusId is bucketed under the UNCLASSIFIED/UNMAPPED sentinels below for filtering and
// aggregation purposes ONLY — the record's own subject/microsyllabusId fields are never rewritten.
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';

/** Sentinel bucket for a question with no `subject` supplied at all (see
 * data/upscCsePrelimsPyqBatch2026Q51Q100Raw.ts, where every question's subject is null). Never
 * written onto a record — used only as a filter/aggregation key. */
export const UNCLASSIFIED_SUBJECT = 'Unclassified';

/** Sentinel bucket for a question with mappingStatus 'needs_review' (no microsyllabusId). Never
 * written onto a record — used only as a filter/aggregation key. */
export const UNMAPPED_MICROSYLLABUS = 'unmapped';

export function questionSubject(q: UpscCsePrelimsBatchPyq): string {
  return q.subject ?? UNCLASSIFIED_SUBJECT;
}

export function questionMicrosyllabusId(q: UpscCsePrelimsBatchPyq): string {
  return q.microsyllabusId ?? UNMAPPED_MICROSYLLABUS;
}

export function getAvailableYears(bank: readonly UpscCsePrelimsBatchPyq[]): number[] {
  return Array.from(new Set(bank.map((p) => p.year).filter((y): y is number => y !== undefined))).sort((a, b) => a - b);
}

export function getYearCounts(bank: readonly UpscCsePrelimsBatchPyq[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const p of bank) {
    if (p.year === undefined) continue;
    counts[p.year] = (counts[p.year] ?? 0) + 1;
  }
  return counts;
}

export function formatYearLabel(y: number | 'all'): string {
  return y === 'all' ? 'All Years' : String(y);
}

export function getAvailablePapers(bank: readonly UpscCsePrelimsBatchPyq[]): string[] {
  return Array.from(new Set(bank.map((p) => p.paper).filter((p): p is string => p !== undefined))).sort();
}

/** All questions matching the given year (or the whole bank when year === 'all'). */
export function yearPool(bank: readonly UpscCsePrelimsBatchPyq[], year: number | 'all'): UpscCsePrelimsBatchPyq[] {
  return year === 'all' ? [...bank] : bank.filter((p) => p.year === year);
}

/** All questions matching the given year + paper. */
export function paperPool(bank: readonly UpscCsePrelimsBatchPyq[], year: number | 'all', paper: string | 'all'): UpscCsePrelimsBatchPyq[] {
  const byYear = yearPool(bank, year);
  return paper === 'all' ? byYear : byYear.filter((p) => p.paper === paper);
}

/** Per-subject question counts within the given year+paper pool (UNCLASSIFIED_SUBJECT included when
 * present) — only subjects actually present are keyed. */
export function getSubjectCounts(bank: readonly UpscCsePrelimsBatchPyq[], year: number | 'all', paper: string | 'all'): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of paperPool(bank, year, paper)) {
    const subj = questionSubject(p);
    counts[subj] = (counts[subj] ?? 0) + 1;
  }
  return counts;
}

/** All questions matching the given year + paper + subject (subject 'all' includes everything,
 * including UNCLASSIFIED). */
export function subjectPool(bank: readonly UpscCsePrelimsBatchPyq[], year: number | 'all', paper: string | 'all', subject: string | 'all'): UpscCsePrelimsBatchPyq[] {
  const byPaper = paperPool(bank, year, paper);
  return subject === 'all' ? byPaper : byPaper.filter((p) => questionSubject(p) === subject);
}

export interface MicrosyllabusCount {
  id: string;
  count: number;
}

/** Per-microsyllabus-id question counts within the given year+paper+subject pool
 * (UNMAPPED_MICROSYLLABUS included when present) — only ids actually present are returned. */
export function getMicrosyllabusCounts(
  bank: readonly UpscCsePrelimsBatchPyq[],
  year: number | 'all',
  paper: string | 'all',
  subject: string | 'all',
): MicrosyllabusCount[] {
  const counts = new Map<string, number>();
  for (const p of subjectPool(bank, year, paper, subject)) {
    const id = questionMicrosyllabusId(p);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([id, count]) => ({ id, count }));
}

export type UpscCsePrelimsRevisionStatus = 'correct' | 'incorrect' | 'unattempted';
export type UpscCsePrelimsRevisionFilter = 'all' | UpscCsePrelimsRevisionStatus;

/**
 * Per-question revision status, derived entirely from UpscCsePrelimsPyqAttempt[] — no persisted
 * data of its own. For each question, the MOST RECENT attempt that included it decides its status
 * (same rule as lib/pyqFilters.ts's computeRevisionStatusMap).
 */
export function computeRevisionStatusMap(
  bank: readonly UpscCsePrelimsBatchPyq[],
  attempts: readonly UpscCsePrelimsPyqAttempt[],
): Map<string, UpscCsePrelimsRevisionStatus> {
  const map = new Map<string, UpscCsePrelimsRevisionStatus>();
  const sorted = [...attempts].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  for (const attempt of sorted) {
    for (const qid of attempt.questionIds) {
      if (map.has(qid)) continue;
      const ans = attempt.answers[qid];
      if (!ans) {
        map.set(qid, 'unattempted');
        continue;
      }
      const q = bank.find((p) => p.id === qid);
      if (!q) continue;
      map.set(qid, q.correctOptionId !== undefined && ans === q.correctOptionId ? 'correct' : 'incorrect');
    }
  }
  return map;
}

export function revisionStatusOf(map: Map<string, UpscCsePrelimsRevisionStatus>, questionId: string): UpscCsePrelimsRevisionStatus {
  return map.get(questionId) ?? 'unattempted';
}

export interface UpscCsePrelimsPyqFilterOptions {
  year: number | 'all';
  paper: string | 'all';
  subject: string | 'all';
  microsyllabusId: string | 'all';
  revisionFilter: UpscCsePrelimsRevisionFilter;
  revisionStatusMap: Map<string, UpscCsePrelimsRevisionStatus>;
}

/** The single source of truth for "which UPSC CSE Prelims questions match the current filter selection". */
export function filterUpscCsePrelimsPyqs(bank: readonly UpscCsePrelimsBatchPyq[], opts: UpscCsePrelimsPyqFilterOptions): UpscCsePrelimsBatchPyq[] {
  return bank.filter((p) => {
    if (opts.year !== 'all' && p.year !== opts.year) return false;
    if (opts.paper !== 'all' && p.paper !== opts.paper) return false;
    if (opts.subject !== 'all' && questionSubject(p) !== opts.subject) return false;
    if (opts.microsyllabusId !== 'all' && questionMicrosyllabusId(p) !== opts.microsyllabusId) return false;
    if (opts.revisionFilter !== 'all' && revisionStatusOf(opts.revisionStatusMap, p.id) !== opts.revisionFilter) return false;
    return true;
  });
}

/**
 * Question ids eligible for the spaced-repetition revision queue (lib/revisionQueue, reused as-is
 * for UPSC ids too): incorrect OR bookmarked — same rule as lib/pyqFilters.ts's
 * computeEligibleRevisionIds.
 */
export function computeEligibleRevisionIds(
  bank: readonly UpscCsePrelimsBatchPyq[],
  revisionStatusMap: Map<string, UpscCsePrelimsRevisionStatus>,
  bookmarkedIds: readonly string[],
): string[] {
  const incorrectIds = bank.filter((p) => revisionStatusOf(revisionStatusMap, p.id) === 'incorrect').map((p) => p.id);
  return [...new Set([...incorrectIds, ...bookmarkedIds])];
}
