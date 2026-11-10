import { describe, it, expect } from 'vitest';
import { UPSC_CSE_GRANULAR_PYQ_MAPPING, granularNodeIdForPyq, countCuratedPyqsByGranularNode } from './upscCseGranularPyqMapping';
import { getGranularNodeById } from './upscCseGranularSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';

describe('UPSC CSE 2026 PYQ -> Granular Node mapping — existing-PYQ compatibility', () => {
  it('every mapped PYQ id refers to a real question in the 2026 Q1-100 bank', () => {
    const bankIds = new Set(UPSC_CSE_PRELIMS_PYQ_BANK.map((q) => q.id));
    for (const pyqId of Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING)) {
      expect(bankIds.has(pyqId)).toBe(true);
    }
  });

  it('every mapped granular node id refers to a real node in the granular tree', () => {
    for (const granularNodeId of Object.values(UPSC_CSE_GRANULAR_PYQ_MAPPING)) {
      expect(getGranularNodeById(UPSC_CSE_GRANULAR_NODES, granularNodeId)).toBeDefined();
    }
  });

  it('is a small, deliberately curated set — never a bulk auto-resolve of every PYQ under a granularized microsyllabus item', () => {
    // Only a fraction of the ~168 granular nodes' questions are mapped — most PYQs under a
    // granularized microsyllabus item are honestly left unmapped rather than force-fit. P1.8 added
    // 7 further hand-curated entries (8 total) — the ceiling is raised only as far as 8 requires,
    // never to a round number that would silently permit a future bulk addition past it unnoticed.
    expect(Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING).length).toBeGreaterThan(0);
    expect(Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING).length).toBeLessThanOrEqual(8);
  });

  it('granularNodeIdForPyq resolves a mapped id and returns undefined for everything else', () => {
    const [mappedPyqId] = Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING);
    expect(granularNodeIdForPyq(mappedPyqId)).toBe(UPSC_CSE_GRANULAR_PYQ_MAPPING[mappedPyqId]);
    expect(granularNodeIdForPyq('some-other-pyq-id')).toBeUndefined();
  });

  // P1.8 — the existing Q34 mapping (pre-dating this stage) plus the 7 newly curated entries, each
  // asserted individually by its exact (pyqId, topicId) pair — not just "is defined" — so a future
  // refactor of the granular tree (e.g. renaming a topic id) can never silently re-point one of
  // these curated mappings without a test catching it.
  it('Q34 (pre-existing): Peninsular Block physiography -> Physiography of India, unchanged by P1.8', () => {
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-34')).toBe('prelims-gs1-geography-physical__t-physiography');
  });

  it('P1.8 batch: all 7 new (pyqId, topicId) pairs resolve exactly as curated', () => {
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-5')).toBe('prelims-gs1-history-ancient__t-buddhism-jainism');
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-21')).toBe('prelims-gs1-environment-ecology-climate-change__t-india-s-climate-policy');
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-23')).toBe('prelims-gs1-environment-ecology-climate-change__t-climate-change-science');
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-27')).toBe('prelims-gs1-environment-ecology-biodiversity__t-wildlife-conservation');
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-32')).toBe('prelims-gs1-environment-ecology-biodiversity__t-protected-areas');
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-54')).toBe('prelims-gs1-polity-constitution__t-salient-features');
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-74')).toBe('prelims-gs1-polity-panchayati-raj__t-panchayati-raj-structure');
  });

  it('exactly 8 entries total after P1.8', () => {
    expect(Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING)).toHaveLength(8);
  });

  // P1.7's audit explicitly excluded these three as ambiguous (full rationale in
  // upscCseGranularPyqMapping.ts's own header) — P1.8 must not have silently mapped any of them.
  it('the three P1.7-excluded questions remain unmapped: #22 (Hoolock Gibbons biology), #31 (Ecuador volcano), #55 (Constitution-naming trivia)', () => {
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-22')).toBeUndefined();
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-31')).toBeUndefined();
    expect(granularNodeIdForPyq('upsc-cse-pyq-2026-gs-paper-i-55')).toBeUndefined();
  });
});

// P2.0 — countCuratedPyqsByGranularNode powers pages/UpscCseSyllabus.tsx's "N curated PYQs" badge.
// Counts are derived purely from UPSC_CSE_GRANULAR_PYQ_MAPPING's own entries, never a hardcoded
// number, so this suite never asserts the literal 8 as a count except by summing the real mapping.
describe('countCuratedPyqsByGranularNode', () => {
  it('every one of the 8 current mappings is counted exactly once, under its own mapped node', () => {
    const counts = countCuratedPyqsByGranularNode();
    const totalFromCounts = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(totalFromCounts).toBe(Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING).length);
    for (const nodeId of Object.values(UPSC_CSE_GRANULAR_PYQ_MAPPING)) {
      const expectedCount = Object.values(UPSC_CSE_GRANULAR_PYQ_MAPPING).filter((id) => id === nodeId).length;
      expect(counts[nodeId]).toBe(expectedCount);
    }
  });

  it('today, every mapped node is distinct, so every count is exactly 1', () => {
    const counts = countCuratedPyqsByGranularNode();
    expect(Object.keys(counts)).toHaveLength(8);
    for (const count of Object.values(counts)) {
      expect(count).toBe(1);
    }
  });

  it('a node with no curated mapping has no entry at all (never a visible "0 curated")', () => {
    const counts = countCuratedPyqsByGranularNode();
    expect(counts['prelims-gs1-geography-physical__t-climatology']).toBeUndefined();
  });

  it('is accessible by the real production constant (no override) by default', () => {
    const defaultCounts = countCuratedPyqsByGranularNode();
    const explicitCounts = countCuratedPyqsByGranularNode(UPSC_CSE_GRANULAR_PYQ_MAPPING);
    expect(defaultCounts).toEqual(explicitCounts);
  });

  it('renders gracefully (empty object, no throw) for an empty mapping, without touching the real production constant', () => {
    expect(countCuratedPyqsByGranularNode({})).toEqual({});
  });

  it('two distinct PYQs mapped to the SAME node are counted as 2, not deduplicated to 1 (synthetic, does not touch the real mapping)', () => {
    const counts = countCuratedPyqsByGranularNode({ 'fake-pyq-a': 'same-node', 'fake-pyq-b': 'same-node' });
    expect(counts['same-node']).toBe(2);
  });
});
