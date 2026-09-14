// Pure, deterministic selector for a "Practice My Weak Topics" session: given the app's already-
// computed unified topic statuses (lib/topicStatus) and the PYQ bank, picks a capped list of PYQ
// ids drawn only from topics that need action. This module NEVER recomputes topic strength itself
// — it reuses computeUnifiedTopicStatus's output and sortByAttentionPriority's own ordering
// verbatim, exactly like lib/pyqFilters and lib/revisionQueue reuse it elsewhere. No store/UI code
// here; the caller supplies statuses + bank and gets back plain PYQ ids.
import type { PYQ } from './types';
import { sortByAttentionPriority, type TopicStatus, type UnifiedTopicStatus } from './topicStatus';

/** The three statuses that mean "this topic needs action". Deliberately excludes 'strong' (nothing
 * to do) and 'not_started' (zero syllabus coverage AND zero PYQ activity — the Syllabus page, not
 * a PYQ session, is the right next step for a topic nobody has touched at all yet). */
export const WEAK_TOPIC_STATUSES: readonly TopicStatus[] = ['needs_revision', 'needs_coverage', 'needs_practice'];

/** Roughly one focused practice session's worth of questions. */
export const DEFAULT_WEAK_TOPIC_PRACTICE_CAP = 20;

/** Topics needing action, in the app's existing urgency order (lib/topicStatus's
 * sortByAttentionPriority) — never a second priority ranking. */
export function selectWeakTopics(statuses: UnifiedTopicStatus[]): UnifiedTopicStatus[] {
  const weakStatuses = new Set<TopicStatus>(WEAK_TOPIC_STATUSES);
  return sortByAttentionPriority(statuses.filter((s) => weakStatuses.has(s.status)));
}

/**
 * Selects PYQ ids for a targeted weak-topic practice session.
 *
 * - Topics are limited to WEAK_TOPIC_STATUSES, ordered by sortByAttentionPriority (urgency, then
 *   weaker measured accuracy, then alphabetical topic title) — fully deterministic.
 * - PYQs are gathered topic-by-topic in that priority order, so when `cap` truncates the list, the
 *   most urgent topics' questions are kept over less-urgent ones.
 * - Within a topic, PYQs keep the bank's own existing order (never reshuffled or re-ranked).
 * - Ids are de-duplicated defensively via a Set (the bank is never expected to contain a duplicate
 *   id, but the result is guaranteed duplicate-free regardless).
 * - Never mutates `statuses` or `bank`.
 */
export function selectWeakTopicPracticeIds(statuses: UnifiedTopicStatus[], bank: PYQ[], cap: number = DEFAULT_WEAK_TOPIC_PRACTICE_CAP): string[] {
  if (cap <= 0) return [];
  const weakTopics = selectWeakTopics(statuses);
  if (weakTopics.length === 0) return [];

  const pyqsByTopic = new Map<string, PYQ[]>();
  for (const pyq of bank) {
    const existing = pyqsByTopic.get(pyq.topicId);
    if (existing) existing.push(pyq);
    else pyqsByTopic.set(pyq.topicId, [pyq]);
  }

  const seenIds = new Set<string>();
  const result: string[] = [];
  for (const topic of weakTopics) {
    if (result.length >= cap) break;
    for (const pyq of pyqsByTopic.get(topic.topicId) ?? []) {
      if (result.length >= cap) break;
      if (seenIds.has(pyq.id)) continue;
      seenIds.add(pyq.id);
      result.push(pyq.id);
    }
  }
  return result;
}
