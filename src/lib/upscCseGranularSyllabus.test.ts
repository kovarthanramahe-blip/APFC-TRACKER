import { describe, it, expect } from 'vitest';
import {
  getTopicsForMicrosyllabus,
  getSubtopicsForTopic,
  getMicroTopicsForSubtopic,
  getGranularNodeById,
  microsyllabusHasGranularNodes,
  leafGranularIdsForMicrosyllabus,
  expandToLeafCoverageIds,
  resolveGranularBreadcrumb,
  microsyllabusOrGranularMatchesQuery,
  searchGranularNodes,
  validateGranularNodes,
} from './upscCseGranularSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';

const CONSTITUTION_ID = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Constitution')!.id;
// Phase 6A gave nearly every Prelims/Mains microsyllabus item a real granular breakdown, so the
// still-deliberately-unpopulated Optional Subject placeholder is now the "no breakdown yet" example.
const NO_BREAKDOWN_ID = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Optional Subject Not Yet Selected')!.id;

describe('UPSC CSE Granular Syllabus — hierarchy integrity', () => {
  it('validateGranularNodes reports zero issues against the real Prelims/Mains trees', () => {
    const issues = validateGranularNodes(UPSC_CSE_GRANULAR_NODES, [UPSC_CSE_PRELIMS_SYLLABUS, UPSC_CSE_MAINS_SYLLABUS]);
    expect(issues).toEqual([]);
  });

  it('every node id is unique', () => {
    const ids = UPSC_CSE_GRANULAR_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all 7 required papers with at least one granularized microsyllabus item each', () => {
    const paperIds = new Set(UPSC_CSE_GRANULAR_NODES.map((n) => n.paperId));
    expect(paperIds.size).toBe(7);
  });

  it('every node carries its complete parent chain (stage/paperId/subjectId/microsyllabusId/topicId)', () => {
    for (const n of UPSC_CSE_GRANULAR_NODES) {
      expect(n.stage).toBeDefined();
      expect(n.paperId).toBeTruthy();
      expect(n.subjectId).toBeTruthy();
      expect(n.microsyllabusId).toBeTruthy();
      expect(n.topicId).toBeTruthy();
    }
  });

  it('every node is marked as a derived study unit, never official wording', () => {
    expect(UPSC_CSE_GRANULAR_NODES.every((n) => n.origin === 'derived_study_unit')).toBe(true);
  });

  it('getTopicsForMicrosyllabus / getSubtopicsForTopic / getMicroTopicsForSubtopic resolve the full chain for a real item', () => {
    const topics = getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    expect(topics.length).toBeGreaterThan(0);
    const subtopics = getSubtopicsForTopic(UPSC_CSE_GRANULAR_NODES, topics[0].id);
    expect(subtopics.length).toBeGreaterThan(0);
    const microTopics = getMicroTopicsForSubtopic(UPSC_CSE_GRANULAR_NODES, subtopics[0].id);
    expect(microTopics.length).toBeGreaterThan(0);
    expect(microTopics[0].microTopicId).toBe(microTopics[0].id);
  });

  it('getGranularNodeById resolves a known id and returns undefined for an unknown one', () => {
    const topics = getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    expect(getGranularNodeById(UPSC_CSE_GRANULAR_NODES, topics[0].id)).toBe(topics[0]);
    expect(getGranularNodeById(UPSC_CSE_GRANULAR_NODES, 'does-not-exist')).toBeUndefined();
  });

  // Phase 6A — nearly every remaining Prelims/Mains microsyllabus item (beyond the original 12
  // seeds + History) now has a granular breakdown too. Spot-checks one item per stage/paper rather
  // than every one of the ~70 newly covered items, since validateGranularNodes above already checks
  // structural integrity across the whole dataset.
  it('Phase 6A: covers a representative item from each of Prelims GS-I, CSAT, and Mains GS-I through GS-IV', () => {
    const checks: [tree: 'prelims' | 'mains', title: string][] = [
      ['prelims', 'Political System'], // Prelims GS-I (beyond History)
      ['prelims', 'Logical Reasoning'], // CSAT
      ['mains', 'Art Forms'], // Mains GS-I
      ['mains', 'Parliament & State Legislatures'], // Mains GS-II
      ['mains', 'Infrastructure'], // Mains GS-III
      ['mains', 'Attitude'], // Mains GS-IV
    ];
    for (const [tree, title] of checks) {
      const tree_ = tree === 'prelims' ? UPSC_CSE_PRELIMS_SYLLABUS : UPSC_CSE_MAINS_SYLLABUS;
      const item = tree_.microsyllabus.find((m) => m.title === title);
      expect(item, `${title} should still exist, unchanged, in the ${tree} tree`).toBeDefined();
      expect(microsyllabusHasGranularNodes(UPSC_CSE_GRANULAR_NODES, item!.id)).toBe(true);
      expect(getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, item!.id).length).toBeGreaterThan(0);
    }
  });

  it('Phase 6A: the Optional Subject placeholder is deliberately still not granularized', () => {
    expect(microsyllabusHasGranularNodes(UPSC_CSE_GRANULAR_NODES, NO_BREAKDOWN_ID)).toBe(false);
  });

  it('microsyllabusHasGranularNodes is true for a granularized item and false for one with no breakdown', () => {
    expect(microsyllabusHasGranularNodes(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID)).toBe(true);
    expect(microsyllabusHasGranularNodes(UPSC_CSE_GRANULAR_NODES, NO_BREAKDOWN_ID)).toBe(false);
  });
});

describe('leafGranularIdsForMicrosyllabus / expandToLeafCoverageIds', () => {
  it('returns the micro-topic ids (the deepest level) for a granularized item', () => {
    const leaves = leafGranularIdsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every((id) => getGranularNodeById(UPSC_CSE_GRANULAR_NODES, id)?.level === 'microtopic')).toBe(true);
  });

  it('returns an empty array for a microsyllabus item with no granular breakdown', () => {
    expect(leafGranularIdsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, NO_BREAKDOWN_ID)).toEqual([]);
  });

  it('expandToLeafCoverageIds substitutes leaf ids for a granularized item and keeps a bare id for a non-granularized one', () => {
    const expanded = expandToLeafCoverageIds([CONSTITUTION_ID, NO_BREAKDOWN_ID], UPSC_CSE_GRANULAR_NODES);
    expect(expanded).toContain(NO_BREAKDOWN_ID);
    expect(expanded).not.toContain(CONSTITUTION_ID);
    expect(expanded.length).toBeGreaterThan(2); // Constitution's several micro-topics + the non-granularized item's own bare id
  });
});

describe('resolveGranularBreadcrumb', () => {
  it('resolves a micro-topic id to its full topic/subtopic/microTopic chain', () => {
    const topics = getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    const subtopics = getSubtopicsForTopic(UPSC_CSE_GRANULAR_NODES, topics[0].id);
    const microTopics = getMicroTopicsForSubtopic(UPSC_CSE_GRANULAR_NODES, subtopics[0].id);
    const breadcrumb = resolveGranularBreadcrumb(UPSC_CSE_GRANULAR_NODES, microTopics[0].id)!;
    expect(breadcrumb.microsyllabusId).toBe(CONSTITUTION_ID);
    expect(breadcrumb.topic?.id).toBe(topics[0].id);
    expect(breadcrumb.subtopic?.id).toBe(subtopics[0].id);
    expect(breadcrumb.microTopic?.id).toBe(microTopics[0].id);
  });

  it('resolves a bare topic id with no subtopic/microTopic set', () => {
    const topics = getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    const breadcrumb = resolveGranularBreadcrumb(UPSC_CSE_GRANULAR_NODES, topics[0].id)!;
    expect(breadcrumb.topic?.id).toBe(topics[0].id);
    expect(breadcrumb.subtopic).toBeUndefined();
    expect(breadcrumb.microTopic).toBeUndefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(resolveGranularBreadcrumb(UPSC_CSE_GRANULAR_NODES, 'nope')).toBeUndefined();
  });
});

describe('search across official wording / topic / subtopic / micro-topic', () => {
  it('microsyllabusOrGranularMatchesQuery is true when the microsyllabus itself matches', () => {
    expect(microsyllabusOrGranularMatchesQuery(true, CONSTITUTION_ID, UPSC_CSE_GRANULAR_NODES, 'anything')).toBe(true);
  });

  it('microsyllabusOrGranularMatchesQuery is true when a granular descendant matches even though the microsyllabus title does not', () => {
    // "Kesavananda Bharati" only appears inside a micro-topic under Constitution, not in the
    // microsyllabus item's own title/description.
    expect(microsyllabusOrGranularMatchesQuery(false, CONSTITUTION_ID, UPSC_CSE_GRANULAR_NODES, 'Kesavananda')).toBe(true);
  });

  it('microsyllabusOrGranularMatchesQuery is false when nothing at any level matches', () => {
    expect(microsyllabusOrGranularMatchesQuery(false, CONSTITUTION_ID, UPSC_CSE_GRANULAR_NODES, 'zzz-no-match-zzz')).toBe(false);
  });

  it('a blank query always matches', () => {
    expect(microsyllabusOrGranularMatchesQuery(false, CONSTITUTION_ID, UPSC_CSE_GRANULAR_NODES, '   ')).toBe(true);
  });

  it('searchGranularNodes finds nodes across all three granular levels by title/description', () => {
    const results = searchGranularNodes(UPSC_CSE_GRANULAR_NODES, 'monsoon');
    expect(results.length).toBeGreaterThan(0);
  });

  it('searchGranularNodes returns nothing for a blank query', () => {
    expect(searchGranularNodes(UPSC_CSE_GRANULAR_NODES, '')).toEqual([]);
  });

  it('Phase 6: finds the new History granular topics and resolves them to their existing microsyllabus parent', () => {
    const ivc = searchGranularNodes(UPSC_CSE_GRANULAR_NODES, 'Indus Valley')[0];
    expect(ivc).toBeDefined();
    expect(ivc.level).toBe('topic');
    const ancientIndiaId = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Ancient India')!.id;
    expect(ivc.microsyllabusId).toBe(ancientIndiaId);
    expect(getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, ancientIndiaId).map((t) => t.title)).toContain('Indus Valley Civilization');
  });

  it('Phase 6A: search also reaches the newly covered non-History subjects (Mains GS-III Infrastructure)', () => {
    const hit = searchGranularNodes(UPSC_CSE_GRANULAR_NODES, 'Transport Infrastructure')[0];
    expect(hit).toBeDefined();
    const infrastructureId = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Infrastructure')!.id;
    expect(hit.microsyllabusId).toBe(infrastructureId);
  });
});

describe('validateGranularNodes — catches structural problems', () => {
  it('flags a duplicate node id', () => {
    const dup = [...UPSC_CSE_GRANULAR_NODES, UPSC_CSE_GRANULAR_NODES[0]];
    const issues = validateGranularNodes(dup, [UPSC_CSE_PRELIMS_SYLLABUS, UPSC_CSE_MAINS_SYLLABUS]);
    expect(issues.some((i) => i.reason === 'duplicate_granular_id')).toBe(true);
  });

  it('flags a node referencing an unknown microsyllabus id', () => {
    const bad = [{ ...UPSC_CSE_GRANULAR_NODES[0], id: 'bad-node', microsyllabusId: 'does-not-exist' }];
    const issues = validateGranularNodes(bad, [UPSC_CSE_PRELIMS_SYLLABUS, UPSC_CSE_MAINS_SYLLABUS]);
    expect(issues.some((i) => i.reason === 'orphan_microsyllabus')).toBe(true);
  });
});
