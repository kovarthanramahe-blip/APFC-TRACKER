import type { UpscCseExamStage, UpscCseSyllabusTree } from './upscCseSyllabus';

// UPSC CSE Granular Syllabus — a study-unit hierarchy layered BELOW the existing, unaltered
// microsyllabus tree (lib/upscCseSyllabus.ts / data/upscCsePrelimsSyllabus.ts /
// data/upscCseMainsSyllabus.ts). Nothing here modifies those files or their 97 microsyllabus nodes:
// this module is purely additive, joining onto a microsyllabus item ONLY by its existing, stable
// `microsyllabusId` — never renaming, merging, or restructuring anything upstream.
//
// Hierarchy added beneath a microsyllabus item: Topic -> Subtopic -> Micro-topic. Every node's
// `title`/`description` is a DERIVED STUDY UNIT — a reasonable breakdown of the official syllabus
// clause into things a candidate actually studies and revises — never official UPSC wording itself
// (that remains solely on the microsyllabus item's own `description`, untouched). Each node's
// `origin` field makes this explicit and machine-checkable, so a consumer can never mistake a
// derived label for the official syllabus text.
//
// Not every microsyllabus item has granular children yet (see data/upscCseGranularTopics.ts for
// which ones do, and why) — an item with none simply has no rows in UPSC_CSE_GRANULAR_NODES, and
// every function here treats that as a legitimate, honest "not yet broken down further" state, not
// an error. Coverage roll-up (lib/upscCseGranularCoverage.ts) degrades gracefully for such items:
// their own microsyllabus-level coverage entry keeps working exactly as it always has.

export type UpscCseGranularLevel = 'topic' | 'subtopic' | 'microtopic';

/**
 * A single granular study node. Every node carries its COMPLETE ancestor chain (not just its
 * immediate parent) — stage/paperId/subjectId/microsyllabusId always resolve to a real node in the
 * (untouched) existing tree, and topicId/subtopicId/microTopicId are populated from the node's own
 * level downward: topicId is always present (a node's own id, if it IS the topic); subtopicId only
 * from 'subtopic' level down; microTopicId only at 'microtopic' level (always equal to `id` there).
 * This lets any consumer holding just one node resolve its full breadcrumb — and build a stable
 * deep link — without walking the array.
 */
export interface UpscCseGranularNode {
  id: string;
  level: UpscCseGranularLevel;
  /** Immediate parent's id: the microsyllabusId (topic level), the parent topic's id (subtopic
   * level), or the parent subtopic's id (microtopic level). */
  parentId: string;
  stage: UpscCseExamStage;
  paperId: string;
  subjectId: string;
  microsyllabusId: string;
  topicId: string;
  subtopicId?: string;
  microTopicId?: string;
  /** Derived study label — see this module's header. Never official UPSC syllabus wording. */
  title: string;
  /** Derived elaboration of `title` — same "never official wording" rule as `title`. */
  description: string;
  /** Always 'derived_study_unit' today (every node here) — an explicit, checkable marker
   * distinguishing this from the microsyllabus item's own `description`, which carries
   * 'official_upsc_wording'. Kept as a real field (not a comment) so a UI can render a "derived"
   * badge without guessing, and so a test can assert the distinction holds for every node. */
  origin: 'derived_study_unit';
  /** Deterministic display order among siblings (topics under the same microsyllabus, subtopics
   * under the same topic, micro-topics under the same subtopic). */
  order: number;
}

export function getTopicsForMicrosyllabus(nodes: readonly UpscCseGranularNode[], microsyllabusId: string): UpscCseGranularNode[] {
  return nodes.filter((n) => n.level === 'topic' && n.microsyllabusId === microsyllabusId).sort((a, b) => a.order - b.order);
}

export function getSubtopicsForTopic(nodes: readonly UpscCseGranularNode[], topicId: string): UpscCseGranularNode[] {
  return nodes.filter((n) => n.level === 'subtopic' && n.parentId === topicId).sort((a, b) => a.order - b.order);
}

export function getMicroTopicsForSubtopic(nodes: readonly UpscCseGranularNode[], subtopicId: string): UpscCseGranularNode[] {
  return nodes.filter((n) => n.level === 'microtopic' && n.parentId === subtopicId).sort((a, b) => a.order - b.order);
}

export function getGranularNodeById(nodes: readonly UpscCseGranularNode[], id: string): UpscCseGranularNode | undefined {
  return nodes.find((n) => n.id === id);
}

/** Whether a microsyllabus item has been broken down into granular study units at all — the single
 * check every "does this item have granular children" branch (UI, coverage roll-up, Today's Study)
 * should use, rather than re-deriving it from a raw filter each time. */
export function microsyllabusHasGranularNodes(nodes: readonly UpscCseGranularNode[], microsyllabusId: string): boolean {
  return nodes.some((n) => n.level === 'topic' && n.microsyllabusId === microsyllabusId);
}

/**
 * The DEEPEST granular ids actually present under a microsyllabus item — micro-topics if any
 * exist, else subtopics, else topics, else none (an empty array, when the item has no granular
 * breakdown at all). This is the "leaf" set that coverage roll-up and stage/paper/subject
 * aggregation should treat as the item's real study units once they exist.
 */
export function leafGranularIdsForMicrosyllabus(nodes: readonly UpscCseGranularNode[], microsyllabusId: string): string[] {
  const topics = getTopicsForMicrosyllabus(nodes, microsyllabusId);
  if (topics.length === 0) return [];
  const subtopics = topics.flatMap((t) => getSubtopicsForTopic(nodes, t.id));
  if (subtopics.length === 0) return topics.map((t) => t.id);
  const microTopics = subtopics.flatMap((st) => getMicroTopicsForSubtopic(nodes, st.id));
  return microTopics.length > 0 ? microTopics.map((mt) => mt.id) : subtopics.map((st) => st.id);
}

/**
 * Expands a list of microsyllabus ids into the leaf ids that should actually be counted for
 * coverage roll-up: a granularized item's own leaf granular ids, or the microsyllabus id itself
 * when it has no granular breakdown yet. Feeding this (instead of a bare microsyllabus id list)
 * into lib/upscCseSyllabusCoverage.ts's existing computeCoverageSummary is the ENTIRE roll-up
 * mechanism for subject/paper/stage aggregates — no separate roll-up engine is needed; the existing
 * weighted-average logic already does the right thing once given the right leaves.
 */
export function expandToLeafCoverageIds(microsyllabusIds: readonly string[], nodes: readonly UpscCseGranularNode[]): string[] {
  return microsyllabusIds.flatMap((id) => {
    const leaves = leafGranularIdsForMicrosyllabus(nodes, id);
    return leaves.length > 0 ? leaves : [id];
  });
}

export interface UpscCseGranularBreadcrumb {
  microsyllabusId: string;
  topic?: UpscCseGranularNode;
  subtopic?: UpscCseGranularNode;
  microTopic?: UpscCseGranularNode;
  /** The node actually being described (whichever of topic/subtopic/microTopic matches the
   * originally-requested id). */
  node: UpscCseGranularNode;
}

/**
 * Resolves a granular node id to its full ancestor chain WITHIN the granular tree (topic and, when
 * applicable, subtopic) — the granular-tree counterpart to lib/upscCseSyllabus.ts's
 * resolveMicrosyllabusPath, used for deep-link breadcrumbs and search result display. Returns
 * undefined for an unknown id; never throws.
 */
export function resolveGranularBreadcrumb(nodes: readonly UpscCseGranularNode[], nodeId: string): UpscCseGranularBreadcrumb | undefined {
  const node = getGranularNodeById(nodes, nodeId);
  if (!node) return undefined;
  const topic = node.level === 'topic' ? node : getGranularNodeById(nodes, node.topicId);
  const subtopic = node.subtopicId ? getGranularNodeById(nodes, node.subtopicId) : undefined;
  return { microsyllabusId: node.microsyllabusId, topic, subtopic: node.level !== 'topic' ? subtopic : undefined, microTopic: node.level === 'microtopic' ? node : undefined, node };
}

// ============================================================================================
// Search (task: "search must work across official wording, topic, subtopic, micro-topic") —
// composes with, never replaces, lib/upscCseSyllabusSearch.ts's own matchesMicrosyllabusQuery.
// ============================================================================================

function matchesGranularQuery(node: UpscCseGranularNode, q: string): boolean {
  return node.title.toLowerCase().includes(q) || node.description.toLowerCase().includes(q);
}

/** Whether a microsyllabus item OR any of its granular descendants (topic/subtopic/micro-topic)
 * matches the query — a blank query matches everything, same convention as
 * lib/upscCseSyllabusSearch.ts's own matchesMicrosyllabusQuery. */
export function microsyllabusOrGranularMatchesQuery(
  microsyllabusMatches: boolean,
  microsyllabusId: string,
  nodes: readonly UpscCseGranularNode[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (microsyllabusMatches) return true;
  return nodes.some((n) => n.microsyllabusId === microsyllabusId && matchesGranularQuery(n, q));
}

/** All granular nodes (any level) matching the query, in stable order — used to surface granular
 * search hits directly (e.g. "jump to this micro-topic") rather than only gating microsyllabus
 * visibility. */
export function searchGranularNodes(nodes: readonly UpscCseGranularNode[], query: string): UpscCseGranularNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return nodes.filter((n) => matchesGranularQuery(n, q)).sort((a, b) => a.order - b.order);
}

// ============================================================================================
// Validation — mirrors lib/upscCseSyllabus.ts's own validateUpscCseSyllabusTree: every structural
// invariant a hand-authored granular dataset must hold, checked against the REAL (untouched)
// Prelims/Mains trees so a granular node can never silently reference a microsyllabus id that
// doesn't actually exist.
// ============================================================================================

export type UpscCseGranularIssueReason =
  | 'duplicate_granular_id'
  | 'orphan_microsyllabus'
  | 'orphan_topic'
  | 'orphan_subtopic'
  | 'parent_chain_mismatch';

export interface UpscCseGranularIssue {
  reason: UpscCseGranularIssueReason;
  message: string;
}

export function validateGranularNodes(nodes: readonly UpscCseGranularNode[], trees: readonly UpscCseSyllabusTree[]): UpscCseGranularIssue[] {
  const issues: UpscCseGranularIssue[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) issues.push({ reason: 'duplicate_granular_id', message: `Duplicate granular node id "${n.id}".` });
    seen.add(n.id);
  }

  const knownMicrosyllabusIds = new Set(trees.flatMap((t) => t.microsyllabus.map((m) => m.id)));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    if (!knownMicrosyllabusIds.has(n.microsyllabusId)) {
      issues.push({ reason: 'orphan_microsyllabus', message: `Granular node "${n.id}" references unknown microsyllabusId "${n.microsyllabusId}".` });
    }
    if (n.level === 'topic') {
      if (n.parentId !== n.microsyllabusId || n.topicId !== n.id || n.subtopicId || n.microTopicId) {
        issues.push({ reason: 'parent_chain_mismatch', message: `Topic node "${n.id}" has an inconsistent parent chain.` });
      }
    } else if (n.level === 'subtopic') {
      const parentTopic = nodeById.get(n.parentId);
      if (!parentTopic || parentTopic.level !== 'topic') {
        issues.push({ reason: 'orphan_topic', message: `Subtopic node "${n.id}" references a parentId ("${n.parentId}") that is not a known topic.` });
      } else if (n.topicId !== parentTopic.id || n.subtopicId !== n.id || n.microTopicId) {
        issues.push({ reason: 'parent_chain_mismatch', message: `Subtopic node "${n.id}" has an inconsistent parent chain.` });
      }
    } else {
      const parentSubtopic = nodeById.get(n.parentId);
      if (!parentSubtopic || parentSubtopic.level !== 'subtopic') {
        issues.push({ reason: 'orphan_subtopic', message: `Micro-topic node "${n.id}" references a parentId ("${n.parentId}") that is not a known subtopic.` });
      } else if (n.subtopicId !== parentSubtopic.id || n.topicId !== parentSubtopic.topicId || n.microTopicId !== n.id) {
        issues.push({ reason: 'parent_chain_mismatch', message: `Micro-topic node "${n.id}" has an inconsistent parent chain.` });
      }
    }
  }

  return issues;
}
