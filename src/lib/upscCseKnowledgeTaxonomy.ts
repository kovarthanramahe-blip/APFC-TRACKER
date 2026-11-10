import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { getMicrosyllabusItemById, type UpscCseSyllabusTree } from './upscCseSyllabus';
import type { UpscCseGranularNode } from './upscCseGranularSyllabus';

// Knowledge Librarian P1.1 — the UPSC CSE counterpart to lib/apfcSyllabusTaxonomy.ts: a flattened,
// versioned, provenance-stamped VIEW over the EXISTING, unaltered granular CSE syllabus
// (lib/upscCseGranularSyllabus.ts / data/upscCseGranularTopics.ts), so the lexical classifier and
// the manual-classification picker have one real, live topic list to work against for the
// `upsc_cse` workspace — exactly as listApfcTopicsFlat() already does for `apfc`. This module does
// NOT invent, rename, or restructure a single granular node; it only flattens the existing
// topic-level nodes into the same {subjectId, subjectTitle, topicId, topicTitle} shape
// classifyTextLexically already expects (see knowledgeClassification.ts's own
// KnowledgeTopicTaxonomyEntry).
//
// Granularity choice: the TOPIC level (not subtopic/micro-topic) of UPSC_CSE_GRANULAR_NODES is
// used as the classification unit — the closest match in spirit to APFC's own "topic" granularity
// (one step below a subject), and the level every granularized microsyllabus item actually has
// (96 of 97 microsyllabus items have at least topic-level children; see
// upscCseGranularSyllabus.ts's own header). A microsyllabus item with NO granular topics yet simply
// contributes no entries here — never a fabricated topic standing in for a real one.
//
// Honesty requirement this module exists to satisfy, matching apfcSyllabusTaxonomy.ts's own
// disclaimer pattern (a gap the P1 read-only audit explicitly flagged as missing here): every
// granular node's own title/description is a DERIVED study-unit breakdown, never official UPSC
// syllabus wording itself (upscCseGranularSyllabus.ts:10-14) — this module makes no claim that
// classifying against it is equivalent to classifying against the official syllabus text.

export const UPSC_CSE_SYLLABUS_TAXONOMY_ID = 'upsc_cse' as const;

/** Bump only when UPSC_CSE_GRANULAR_NODES' own topic-level id set changes in a way that could
 * invalidate an EXISTING KnowledgeClassification's topicId (a topic renamed/removed/merged) — never
 * for a purely additive change (new granular topics added for a previously-unbroken-down
 * microsyllabus item never invalidates an existing reference). Mirrors
 * APFC_SYLLABUS_TAXONOMY_VERSION's own rule exactly. */
export const UPSC_CSE_SYLLABUS_TAXONOMY_VERSION = 1;

/** A short, honest provenance note — shown anywhere a UPSC CSE classification's taxonomy needs to
 * be explained to the user, so "UPSC CSE syllabus" never silently reads as "the complete official
 * syllabus, verified" when it is really "this repository's own derived study-unit breakdown of
 * it". */
export const UPSC_CSE_SYLLABUS_TAXONOMY_PROVENANCE =
  'UPSC CSE granular study-topic nodes as already encoded in this app (data/upscCseGranularTopics.ts) — each title is a DERIVED study-unit breakdown of an official microsyllabus clause (see upscCseGranularSyllabus.ts’s own "origin" field), never independently re-verified official syllabus wording itself, and not every microsyllabus item has granular topics yet.';

export interface UpscCseTopicTaxonomyEntry {
  subjectId: string;
  subjectTitle: string;
  topicId: string;
  topicTitle: string;
}

function treeForStage(stage: UpscCseGranularNode['stage']): UpscCseSyllabusTree {
  return stage === 'mains' ? UPSC_CSE_MAINS_SYLLABUS : UPSC_CSE_PRELIMS_SYLLABUS;
}

/**
 * Every topic-level granular CSE node, flattened to one entry per node with its owning
 * microsyllabus item's title attached as `subjectTitle` (the most specific, familiar grouping one
 * step up — e.g. "Modern Indian History" — rather than the broader subject/paper). Built fresh
 * from UPSC_CSE_GRANULAR_NODES every call, same convention as listApfcTopicsFlat(); never cached in
 * a way that could drift from the real data.
 */
export function listUpscCseTopicsFlat(nodes: readonly UpscCseGranularNode[] = UPSC_CSE_GRANULAR_NODES): UpscCseTopicTaxonomyEntry[] {
  const entries: UpscCseTopicTaxonomyEntry[] = [];
  for (const node of nodes) {
    if (node.level !== 'topic') continue;
    const microsyllabusItem = getMicrosyllabusItemById(treeForStage(node.stage), node.microsyllabusId);
    entries.push({
      subjectId: node.microsyllabusId,
      subjectTitle: microsyllabusItem?.title ?? node.microsyllabusId,
      topicId: node.id,
      topicTitle: node.title,
    });
  }
  return entries;
}

/** Whether `topicId` genuinely exists as a topic-level granular CSE node — the CSE equivalent of
 * lib/apfcSyllabusTaxonomy.ts's isValidApfcTopicId. Never trusts a topic id merely because a
 * caller claims it. */
export function isValidUpscCseTopicId(topicId: string, nodes: readonly UpscCseGranularNode[] = UPSC_CSE_GRANULAR_NODES): boolean {
  return nodes.some((n) => n.level === 'topic' && n.id === topicId);
}
