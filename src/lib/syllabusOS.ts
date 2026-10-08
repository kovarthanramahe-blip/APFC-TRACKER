import type { UnifiedTopicStatus } from './topicStatus';

// Syllabus OS (Phase 18) — a single, small, typed aggregation over the EXISTING
// lib/topicStatus.ts output (computeUnifiedTopicStatus), the same source of truth
// pages/Syllabus.tsx/Dashboard.tsx/Analytics.tsx already share for "is this topic weak". Nothing
// here recomputes topic status or invents a new classification — see lib/topicStatus.ts's own
// TopicStatus union (not_started | needs_coverage | needs_practice | needs_revision | strong) for
// the one real source of per-topic state this module reads.
//
// Deliberately does NOT expose an "in progress" count: this app's data model tracks topic
// coverage as a plain boolean (completedTopics) with no partial/in-progress state recorded
// anywhere — inventing one here would violate the "only display metrics that can actually be
// derived" rule. What IS genuinely derivable and shown instead: completed (covered, any PYQ
// signal), remaining (never marked covered), and weak areas (covered but needs_revision) as a
// distinct, additional signal layered on top of — not instead of — the existing completed count.

export interface SyllabusOverview {
  totalTopics: number;
  /** Marked covered in the Syllabus tracker — status is 'needs_practice', 'needs_revision', or
   * 'strong' for every one of these (see classify() in lib/topicStatus.ts: all three require
   * `covered === true`). */
  completedCount: number;
  /** Never marked covered — status is 'not_started' or 'needs_coverage'. */
  remainingCount: number;
  /** A SUBSET of completedCount: covered, but recent PYQ accuracy is weak (status ===
   * 'needs_revision') — surfaced separately so "completed" never hides a real weak area. */
  weakCount: number;
  /** 0-100; 0 when totalTopics is 0 (never divides by zero). */
  completionPct: number;
}

export function computeSyllabusOverview(statuses: readonly UnifiedTopicStatus[]): SyllabusOverview {
  const totalTopics = statuses.length;
  let completedCount = 0;
  let weakCount = 0;
  for (const s of statuses) {
    if (s.status === 'needs_practice' || s.status === 'needs_revision' || s.status === 'strong') completedCount += 1;
    if (s.status === 'needs_revision') weakCount += 1;
  }
  return {
    totalTopics,
    completedCount,
    remainingCount: totalTopics - completedCount,
    weakCount,
    completionPct: totalTopics ? Math.round((completedCount / totalTopics) * 100) : 0,
  };
}

/** Per-subject rollup of the same overview, for a subject-by-subject breakdown — reuses
 * computeSyllabusOverview per subject rather than a second counting pass. */
export interface SyllabusSubjectOverview extends SyllabusOverview {
  subjectId: string;
  subjectTitle: string;
}

export function computeSyllabusOverviewBySubject(statuses: readonly UnifiedTopicStatus[]): SyllabusSubjectOverview[] {
  const bySubject = new Map<string, { subjectTitle: string; statuses: UnifiedTopicStatus[] }>();
  for (const s of statuses) {
    const entry = bySubject.get(s.subjectId) ?? { subjectTitle: s.subjectTitle, statuses: [] };
    entry.statuses.push(s);
    bySubject.set(s.subjectId, entry);
  }
  return [...bySubject.entries()].map(([subjectId, { subjectTitle, statuses: subjectStatuses }]) => ({
    subjectId,
    subjectTitle,
    ...computeSyllabusOverview(subjectStatuses),
  }));
}
