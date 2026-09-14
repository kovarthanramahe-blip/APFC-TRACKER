// Unifies the two previously-separate definitions of "weak" — self-reported syllabus coverage
// (completedTopics) and actual PYQ performance (computePyqPerformance) — into ONE topic-level
// status, so the same topic can't be "Strong" on one screen and "Weak" on another. Pure and
// deterministic: same syllabus + completedTopics + PyqPerformanceSnapshot always produce the
// same result. Nothing here is persisted or hardcoded — topics come entirely from `syllabus`.
import type { SyllabusSubject } from './types';
import type { PyqPerformanceSnapshot } from './pyqPerformance';

// Fewer than this many attempted PYQ questions on a topic isn't enough to call the accuracy
// meaningful (one unlucky guess could otherwise brand a topic "weak"). Chosen to be small enough
// that a single practice set (10+ questions, spread across topics) starts producing real signal,
// while still ruling out 1-2 question flukes.
export const MIN_PYQ_ATTEMPTS_FOR_SIGNAL = 3;

// Reuses the exact accuracy cutoff already established for "good" PYQ performance in the
// Analytics subject-performance view (see Analytics.tsx's subject Badge: accuracy >= 60 => success)
// — never a second, conflicting definition of what counts as weak.
export const WEAK_PYQ_ACCURACY_THRESHOLD = 60;

export type TopicStatus = 'not_started' | 'needs_coverage' | 'needs_practice' | 'needs_revision' | 'strong';

export interface UnifiedTopicStatus {
  topicId: string;
  topicTitle: string;
  subjectId: string;
  subjectTitle: string;
  /** Whether the student has marked this topic covered in the Syllabus tracker. */
  covered: boolean;
  /** Questions actually answered (correct or wrong) across all saved PYQ attempts for this topic. */
  pyqAttempted: number;
  /** null when pyqAttempted === 0 — there is no accuracy to report, never fabricated as 0%. */
  pyqAccuracy: number | null;
  status: TopicStatus;
}

function classify(covered: boolean, pyqAttempted: number, pyqAccuracy: number | null): TopicStatus {
  if (!covered && pyqAttempted === 0) return 'not_started';
  if (!covered) return 'needs_coverage'; // has PYQ activity but was never marked covered
  if (pyqAttempted < MIN_PYQ_ATTEMPTS_FOR_SIGNAL) return 'needs_practice'; // covered, but too little PYQ data to judge
  return (pyqAccuracy ?? 0) < WEAK_PYQ_ACCURACY_THRESHOLD ? 'needs_revision' : 'strong';
}

/**
 * Builds the unified status for every syllabus topic. `pyqPerf` may be null (no PYQ attempts at
 * all yet) — every topic then falls back to syllabus coverage alone, per spec.
 */
export function computeUnifiedTopicStatus(
  syllabus: SyllabusSubject[],
  completedTopics: Record<string, boolean>,
  pyqPerf: PyqPerformanceSnapshot | null,
): UnifiedTopicStatus[] {
  const perfByTopic = new Map((pyqPerf?.topics ?? []).map((t) => [t.topicId, t]));
  const results: UnifiedTopicStatus[] = [];
  for (const subject of syllabus) {
    for (const topic of subject.topics) {
      const covered = !!completedTopics[topic.id];
      const perf = perfByTopic.get(topic.id);
      const pyqAttempted = perf?.attempted ?? 0;
      const pyqAccuracy = pyqAttempted > 0 ? (perf?.accuracy ?? 0) : null;
      results.push({
        topicId: topic.id,
        topicTitle: topic.title,
        subjectId: subject.id,
        subjectTitle: subject.shortTitle,
        covered,
        pyqAttempted,
        pyqAccuracy,
        status: classify(covered, pyqAttempted, pyqAccuracy),
      });
    }
  }
  return results;
}

// Most-urgent-first: real evidence of weakness beats an unstudied gap, which beats "haven't
// touched it at all", which beats "just needs more data", which beats "no attention needed".
const STATUS_PRIORITY: Record<TopicStatus, number> = {
  needs_revision: 0,
  needs_coverage: 1,
  not_started: 2,
  needs_practice: 3,
  strong: 4,
};

/** Sorts statuses by urgency; within the same status, weaker measured accuracy first, then alphabetically. */
export function sortByAttentionPriority(statuses: UnifiedTopicStatus[]): UnifiedTopicStatus[] {
  return [...statuses].sort((a, b) => {
    const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (byStatus !== 0) return byStatus;
    if (a.pyqAccuracy !== null && b.pyqAccuracy !== null && a.pyqAccuracy !== b.pyqAccuracy) return a.pyqAccuracy - b.pyqAccuracy;
    return a.topicTitle.localeCompare(b.topicTitle);
  });
}
