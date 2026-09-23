import { describe, it, expect } from 'vitest';
import { UPSC_CSE_GRANULAR_PYQ_MAPPING, granularNodeIdForPyq } from './upscCseGranularPyqMapping';
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
    // granularized microsyllabus item are honestly left unmapped rather than force-fit.
    expect(Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING).length).toBeGreaterThan(0);
    expect(Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING).length).toBeLessThan(10);
  });

  it('granularNodeIdForPyq resolves a mapped id and returns undefined for everything else', () => {
    const [mappedPyqId] = Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING);
    expect(granularNodeIdForPyq(mappedPyqId)).toBe(UPSC_CSE_GRANULAR_PYQ_MAPPING[mappedPyqId]);
    expect(granularNodeIdForPyq('some-other-pyq-id')).toBeUndefined();
  });
});
