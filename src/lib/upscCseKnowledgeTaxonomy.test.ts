import { describe, it, expect } from 'vitest';
import {
  listUpscCseTopicsFlat,
  isValidUpscCseTopicId,
  UPSC_CSE_SYLLABUS_TAXONOMY_ID,
  UPSC_CSE_SYLLABUS_TAXONOMY_VERSION,
  UPSC_CSE_SYLLABUS_TAXONOMY_PROVENANCE,
} from './upscCseKnowledgeTaxonomy';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import type { UpscCseGranularNode } from './upscCseGranularSyllabus';

function node(overrides: Partial<UpscCseGranularNode> = {}): UpscCseGranularNode {
  return {
    id: 'node-1',
    level: 'topic',
    parentId: 'micro-1',
    stage: 'prelims',
    paperId: 'paper-1',
    subjectId: 'subject-1',
    microsyllabusId: 'micro-1',
    topicId: 'node-1',
    title: 'A Derived Topic',
    description: 'A derived description.',
    origin: 'derived_study_unit',
    order: 1,
    ...overrides,
  };
}

describe('listUpscCseTopicsFlat', () => {
  it('flattens only topic-level nodes, attaching the owning microsyllabus item’s title as subjectTitle', () => {
    const realMicrosyllabusId = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0].id;
    const nodes: UpscCseGranularNode[] = [
      node({ id: 't1', level: 'topic', microsyllabusId: realMicrosyllabusId, title: 'Topic One' }),
      node({ id: 'sub1', level: 'subtopic', parentId: 't1', microsyllabusId: realMicrosyllabusId, title: 'Subtopic One' }),
      node({ id: 'micro1', level: 'microtopic', parentId: 'sub1', microsyllabusId: realMicrosyllabusId, title: 'Microtopic One' }),
    ];
    const flat = listUpscCseTopicsFlat(nodes);
    expect(flat).toHaveLength(1); // only the topic-level node
    expect(flat[0].topicId).toBe('t1');
    expect(flat[0].topicTitle).toBe('Topic One');
    expect(flat[0].subjectId).toBe(realMicrosyllabusId);
    expect(flat[0].subjectTitle).toBe(UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0].title);
  });

  it('falls back to the raw microsyllabusId as subjectTitle when it does not resolve in either real tree — never fabricates a title', () => {
    const nodes: UpscCseGranularNode[] = [node({ id: 't1', level: 'topic', microsyllabusId: 'not-a-real-microsyllabus-id' })];
    const flat = listUpscCseTopicsFlat(nodes);
    expect(flat[0].subjectTitle).toBe('not-a-real-microsyllabus-id');
  });

  it('resolves a Mains-stage node against the Mains tree, not the Prelims one', () => {
    const mainsMicrosyllabusId = UPSC_CSE_GRANULAR_NODES.find((n) => n.level === 'topic' && n.stage === 'mains')!.microsyllabusId;
    const nodes: UpscCseGranularNode[] = [node({ id: 't1', level: 'topic', stage: 'mains', microsyllabusId: mainsMicrosyllabusId, title: 'Mains Topic' })];
    const flat = listUpscCseTopicsFlat(nodes);
    expect(flat[0].subjectTitle).not.toBe(mainsMicrosyllabusId); // genuinely resolved, not the fallback
  });

  it('returns an empty array for an empty node list, never throws', () => {
    expect(listUpscCseTopicsFlat([])).toEqual([]);
  });

  it('defaults to the real, live UPSC_CSE_GRANULAR_NODES data when no argument is given', () => {
    const flat = listUpscCseTopicsFlat();
    const expectedCount = UPSC_CSE_GRANULAR_NODES.filter((n) => n.level === 'topic').length;
    expect(flat.length).toBe(expectedCount);
    expect(flat.length).toBeGreaterThan(0);
  });
});

describe('isValidUpscCseTopicId', () => {
  it('returns true for a topic-level node id that genuinely exists', () => {
    const nodes: UpscCseGranularNode[] = [node({ id: 't1', level: 'topic' })];
    expect(isValidUpscCseTopicId('t1', nodes)).toBe(true);
  });

  it('returns false for a fabricated/unknown id', () => {
    expect(isValidUpscCseTopicId('does-not-exist', [node({ id: 't1', level: 'topic' })])).toBe(false);
  });

  it('returns false for a subtopic/micro-topic id — only topic-level ids are valid classification targets', () => {
    const nodes: UpscCseGranularNode[] = [node({ id: 'sub1', level: 'subtopic' })];
    expect(isValidUpscCseTopicId('sub1', nodes)).toBe(false);
  });

  it('validates against the real, live granular nodes by default', () => {
    const realTopicId = UPSC_CSE_GRANULAR_NODES.find((n) => n.level === 'topic')!.id;
    expect(isValidUpscCseTopicId(realTopicId)).toBe(true);
    expect(isValidUpscCseTopicId('totally-fake-id')).toBe(false);
  });
});

// Library Mode Audit + History Optional Integration task, Phase 1 Completion.
// data/upscCseMainsSyllabus.ts now holds the real Paper I (24 units) / Paper II (27 units)
// hierarchy from a user-supplied source, and data/upscCseGranularTopics.ts gives each unit one
// classification topic — these tests prove that real, live data is actually classifiable through
// the EXISTING pipeline (listUpscCseTopicsFlat/isValidUpscCseTopicId), with no fabricated entries
// and no silent conflation with GS-I's own, separately-tracked "History" subject.
describe('History Optional classification (Phase 1 Completion — real units now classifiable)', () => {
  it('the REAL, live UPSC_CSE_GRANULAR_NODES data now contains exactly 51 History Optional topics (24 Paper I + 27 Paper II), one per official unit', () => {
    const paper1 = UPSC_CSE_GRANULAR_NODES.filter((n) => n.level === 'topic' && n.subjectId === 'mains-optional-history-optional-paper-1');
    const paper2 = UPSC_CSE_GRANULAR_NODES.filter((n) => n.level === 'topic' && n.subjectId === 'mains-optional-history-optional-paper-2');
    expect(paper1).toHaveLength(24);
    expect(paper2).toHaveLength(27);
  });

  it('listUpscCseTopicsFlat() (the manual picker\'s and lexical classifier\'s own candidate list) now offers every History Optional unit, with the unit\'s own title as subjectTitle', () => {
    const flat = listUpscCseTopicsFlat();
    const sources = flat.find((e) => e.topicTitle === 'Sources' && e.subjectId === 'mains-optional-history-optional-paper-1-sources');
    expect(sources).toBeDefined();
    expect(sources!.subjectTitle).toBe('Sources');
  });

  it('isValidUpscCseTopicId recognises a real History Optional topic id and still rejects a fabricated one', () => {
    const realId = UPSC_CSE_GRANULAR_NODES.find((n) => n.level === 'topic' && n.microsyllabusId === 'mains-optional-history-optional-paper-1-sources')!.id;
    expect(isValidUpscCseTopicId(realId)).toBe(true);
    expect(isValidUpscCseTopicId('mains-optional-history-optional-paper-1__t-does-not-exist')).toBe(false);
  });

  // Task requirement: "History Optional must be separate from GS Paper I History." Proven by id
  // namespace, not just by convention — a classification against either can never resolve to the
  // other's microsyllabus/subject.
  it('History Optional topic ids are structurally disjoint from GS-I\'s own "History" subject topic ids', () => {
    const historyOptionalIds = new Set(UPSC_CSE_GRANULAR_NODES.filter((n) => n.subjectId?.startsWith('mains-optional-history-optional-paper-')).map((n) => n.subjectId));
    const gs1HistoryTopics = UPSC_CSE_GRANULAR_NODES.filter((n) => n.level === 'topic' && n.stage === 'mains' && n.paperId === 'mains-gs1');
    for (const gs1Topic of gs1HistoryTopics) {
      expect(historyOptionalIds.has(gs1Topic.subjectId)).toBe(false);
    }
  });
});

describe('taxonomy id/version/provenance', () => {
  it('exposes a stable id, a stable version number and a non-empty, honest provenance note', () => {
    expect(UPSC_CSE_SYLLABUS_TAXONOMY_ID).toBe('upsc_cse');
    expect(UPSC_CSE_SYLLABUS_TAXONOMY_VERSION).toBeGreaterThanOrEqual(1);
    expect(UPSC_CSE_SYLLABUS_TAXONOMY_PROVENANCE.length).toBeGreaterThan(10);
  });
});
