// UPSC CSE "Today's Study" — turns EXISTING, already-persisted user data into a short list of
// actionable study items, each with a direct link into the page that lets the user act on it
// immediately. Never invents content: every item traces to a real, current value already in the
// store (coverage state, PYQ attempts, the revision queue, bookmarks) — an item with nothing behind
// it (e.g. no questions due for revision) is simply omitted, never padded with a placeholder.
//
// Reuses every existing engine as-is: lib/upscCseSyllabusCoverage.ts's getCoverageState for
// syllabus items, lib/upscCsePrelimsPyqFilters.ts's computeRevisionStatusMap/
// computeEligibleRevisionIds for incorrect/unattempted/due-for-revision counts, lib/revisionQueue's
// getDueItems for the spaced-repetition due list, and lib/upscCsePrelimsPyqPerformance.ts's
// computeUpscCsePrelimsPerformance for weak-area detection. No parallel syllabus, practice,
// revision, or analytics logic is created here — this module only SELECTS from what those already
// compute and packages each selection as a navigable item.
import type { UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import type { UpscCseSyllabusTree } from './upscCseSyllabus';
import { effectiveMicrosyllabusCoverageState } from './upscCseGranularCoverage';
import type { UpscCseGranularNode } from './upscCseGranularSyllabus';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import { computeRevisionStatusMap, revisionStatusOf, computeEligibleRevisionIds, UNMAPPED_MICROSYLLABUS } from './upscCsePrelimsPyqFilters';
import { computeUpscCsePrelimsPerformance } from './upscCsePrelimsPyqPerformance';
import { getDueItems, type RevisionQueue } from './revisionQueue';

export type UpscCseTodaysStudyItemKind = 'syllabus' | 'revision' | 'incorrect' | 'unanswered' | 'weak_area';

export interface UpscCseTodaysStudyItem {
  id: string;
  kind: UpscCseTodaysStudyItemKind;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}

export interface GenerateTodaysStudyInput {
  coverage: UpscCseSyllabusCoverage;
  prelimsTree: UpscCseSyllabusTree;
  mainsTree: UpscCseSyllabusTree;
  /** The UPSC CSE Granular Syllabus (lib/upscCseGranularSyllabus.ts / data/upscCseGranularTopics.ts)
   * — an item that has granular children is checked for not_started/learning via its ROLLED-UP
   * effective state (see lib/upscCseGranularCoverage.ts's effectiveMicrosyllabusCoverageState)
   * rather than its own possibly-stale direct coverage entry, since the coverage UI moves the
   * actual picker down to the leaf micro-topics for such an item. An item with no granular children
   * behaves exactly as before (unaffected by this list). Pass `[]` for a tree with no granular data
   * at all — degrades to the original, pre-granular behavior exactly. */
  granularNodes: readonly UpscCseGranularNode[];
  pyqBank: readonly UpscCsePrelimsBatchPyq[];
  attempts: readonly UpscCsePrelimsPyqAttempt[];
  bookmarkedPyqIds: readonly string[];
  revisionQueue: RevisionQueue;
  /** yyyy-mm-dd, local date — supplied by the caller (see lib/revisionQueue.ts's own discipline:
   * never Date.now()/toISOString() inside a "pure" function). */
  today: string;
  /** How many not_started/learning syllabus items to surface — default 5. */
  maxSyllabusItems?: number;
  /** How many weak-microsyllabus items to surface — default 3. */
  maxWeakAreas?: number;
  /** A weak area needs at least this many attempted questions before it's surfaced — avoids
   * flagging a microsyllabus area as "weak" off a single lucky/unlucky guess. Default 2. */
  minWeakAreaAttempts?: number;
  /** A weak area's accuracy must be below this to be surfaced — default 50. */
  weakAreaAccuracyThreshold?: number;
}

/**
 * Builds today's actionable study list, purely from already-persisted data. Deterministic: the
 * same inputs always produce the same items in the same order (syllabus items in their tree's own
 * `order` sequence, Prelims before Mains; the rest in a fixed priority order) — never randomised.
 */
export function generateTodaysStudyItems(input: GenerateTodaysStudyInput): UpscCseTodaysStudyItem[] {
  const items: UpscCseTodaysStudyItem[] = [];
  const maxSyllabusItems = input.maxSyllabusItems ?? 5;
  const maxWeakAreas = input.maxWeakAreas ?? 3;
  const minWeakAreaAttempts = input.minWeakAreaAttempts ?? 2;
  const weakAreaAccuracyThreshold = input.weakAreaAccuracyThreshold ?? 50;

  // 1. Syllabus areas not yet started or still being learned — Prelims first (this app's only
  // populated PYQ source today), each tree in its own stable `order` sequence.
  const allMicrosyllabus = [
    ...[...input.prelimsTree.microsyllabus].sort((a, b) => a.order - b.order),
    ...[...input.mainsTree.microsyllabus].sort((a, b) => a.order - b.order),
  ];
  const toStudy = allMicrosyllabus.filter((m) => {
    const state = effectiveMicrosyllabusCoverageState(m.id, input.coverage, input.granularNodes);
    return state === 'not_started' || state === 'learning';
  });
  for (const m of toStudy.slice(0, maxSyllabusItems)) {
    const state = effectiveMicrosyllabusCoverageState(m.id, input.coverage, input.granularNodes);
    items.push({
      id: `syllabus-${m.id}`,
      kind: 'syllabus',
      title: m.title,
      description: `${m.stage === 'prelims' ? 'Prelims' : 'Mains'} microsyllabus — currently marked "${state === 'not_started' ? 'Not Started' : 'Learning'}".`,
      actionLabel: 'Open Syllabus',
      actionHref: `/upsc-syllabus?microsyllabusId=${encodeURIComponent(m.id)}`,
    });
  }

  const revisionStatusMap = computeRevisionStatusMap(input.pyqBank, input.attempts);

  // 2. Questions due for revision today (spaced repetition + bookmarks).
  const eligibleIds = computeEligibleRevisionIds(input.pyqBank, revisionStatusMap, input.bookmarkedPyqIds);
  const dueCount = getDueItems(input.revisionQueue, eligibleIds, input.today).length;
  if (dueCount > 0) {
    items.push({
      id: 'revision-due',
      kind: 'revision',
      title: `${dueCount} question${dueCount === 1 ? '' : 's'} due for revision`,
      description: 'Questions you marked for revision, or previously got wrong, that are due today.',
      actionLabel: 'Review Revision Questions',
      actionHref: '/upsc-pyq-test?view=revision',
    });
  }

  // 3. Questions answered incorrectly in a past attempt.
  const incorrectCount = input.pyqBank.filter((q) => revisionStatusOf(revisionStatusMap, q.id) === 'incorrect').length;
  if (incorrectCount > 0) {
    items.push({
      id: 'incorrect',
      kind: 'incorrect',
      title: `${incorrectCount} incorrect question${incorrectCount === 1 ? '' : 's'} to review`,
      description: 'Questions you answered incorrectly in a past UPSC CSE PYQ attempt.',
      actionLabel: 'Practice Incorrect',
      actionHref: '/upsc-pyq-test?revisionFilter=incorrect',
    });
  }

  // 4. Questions never attempted at all.
  const unattemptedCount = input.pyqBank.filter((q) => revisionStatusOf(revisionStatusMap, q.id) === 'unattempted').length;
  if (unattemptedCount > 0) {
    items.push({
      id: 'unanswered',
      kind: 'unanswered',
      title: `${unattemptedCount} question${unattemptedCount === 1 ? '' : 's'} not attempted yet`,
      description: 'Questions from the UPSC CSE Prelims 2026 GS Paper I set you have not tried yet.',
      actionLabel: 'Start Practice',
      actionHref: '/upsc-pyq-test?revisionFilter=unattempted',
    });
  }

  // 5. Weak microsyllabus areas — only when real attempt data actually supports it.
  const performance = computeUpscCsePrelimsPerformance(input.pyqBank, input.attempts, input.prelimsTree);
  if (performance) {
    const weak = performance.weakMicrosyllabus.filter(
      (m) => m.microsyllabusId !== UNMAPPED_MICROSYLLABUS && m.attempted >= minWeakAreaAttempts && m.accuracy < weakAreaAccuracyThreshold,
    );
    for (const w of weak.slice(0, maxWeakAreas)) {
      items.push({
        id: `weak-${w.microsyllabusId}`,
        kind: 'weak_area',
        title: `Weak area: ${w.title}`,
        description: `${w.correct}/${w.attempted} correct so far (${w.accuracy.toFixed(0)}% accuracy).`,
        actionLabel: 'Practice This Area',
        actionHref: `/upsc-pyq-test?microsyllabusId=${encodeURIComponent(w.microsyllabusId)}`,
      });
    }
  }

  return items;
}
