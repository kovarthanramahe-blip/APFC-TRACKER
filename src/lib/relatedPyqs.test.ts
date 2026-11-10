import { describe, it, expect } from 'vitest';
import { relatedPyqsForClassification } from './relatedPyqs';
import { PYQ_BANK } from '../data/pyq';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { UPSC_CSE_GRANULAR_PYQ_MAPPING } from './upscCseGranularPyqMapping';
import type { KnowledgeClassification } from './knowledgeClassification';

function classification(overrides: Partial<KnowledgeClassification> = {}): Pick<KnowledgeClassification, 'taxonomy' | 'topicId' | 'status'> {
  return {
    taxonomy: overrides.taxonomy ?? 'apfc',
    topicId: overrides.topicId ?? 'topic-does-not-exist',
    status: overrides.status ?? 'confirmed',
  };
}

describe('relatedPyqsForClassification — apfc', () => {
  it('returns every real PYQ_BANK question whose own topicId matches exactly, using real data', () => {
    const q = PYQ_BANK[0];
    const expectedCount = PYQ_BANK.filter((p) => p.topicId === q.topicId).length;
    const results = relatedPyqsForClassification(classification({ taxonomy: 'apfc', topicId: q.topicId, status: 'confirmed' }));
    expect(results.length).toBe(expectedCount);
    expect(results.some((r) => r.id === q.id && r.question === q.question)).toBe(true);
  });

  it('shows a clear empty state (never fabricates) for a topicId with no PYQs mapped to it', () => {
    const results = relatedPyqsForClassification(classification({ taxonomy: 'apfc', topicId: 'not-a-real-apfc-topic-id', status: 'confirmed' }));
    expect(results).toEqual([]);
  });

  it('never matches a CSE granular topic id against the APFC bank, even if passed under taxonomy "apfc"', () => {
    const cseMappedId = Object.values(UPSC_CSE_GRANULAR_PYQ_MAPPING)[0];
    const results = relatedPyqsForClassification(classification({ taxonomy: 'apfc', topicId: cseMappedId, status: 'confirmed' }));
    expect(results).toEqual([]);
  });
});

describe('relatedPyqsForClassification — upsc_cse', () => {
  it('returns the exact mapped PYQ for a granular topic id with a real curated mapping entry', () => {
    const mappedPyqId = Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING)[0];
    const granularTopicId = UPSC_CSE_GRANULAR_PYQ_MAPPING[mappedPyqId];
    const expectedPyq = UPSC_CSE_PRELIMS_PYQ_BANK.find((q) => q.id === mappedPyqId)!;
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId: granularTopicId, status: 'confirmed' }));
    expect(results).toEqual([{ id: expectedPyq.id, question: expectedPyq.question, year: expectedPyq.year }]);
  });

  it('shows a clear empty state (never fabricates/infers) for a granular topic id with no curated PYQ mapping', () => {
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId: 'prelims-gs1-geography-physical__t-climatology', status: 'confirmed' }));
    // Climatology genuinely has no entry in UPSC_CSE_GRANULAR_PYQ_MAPPING today — confirmed not to
    // collide with the one real mapped entry, so this is a true, honest empty state, not a stub.
    expect(Object.values(UPSC_CSE_GRANULAR_PYQ_MAPPING)).not.toContain('prelims-gs1-geography-physical__t-climatology');
    expect(results).toEqual([]);
  });

  it('never matches an APFC topic id against the CSE granular mapping', () => {
    const apfcTopicId = PYQ_BANK[0].topicId;
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId: apfcTopicId, status: 'confirmed' }));
    expect(results).toEqual([]);
  });
});

// P1.8 — the same confirmed-only, exact-match retrieval path exercised above with Q34 (the one
// pre-existing mapping), now also exercised with one of the 7 newly curated entries, to prove the
// real data path works for the new batch specifically, not just the mechanism in the abstract.
describe('relatedPyqsForClassification — P1.8 curated batch', () => {
  const pyqId = 'upsc-cse-pyq-2026-gs-paper-i-27';
  const topicId = 'prelims-gs1-environment-ecology-biodiversity__t-wildlife-conservation';

  it('a CONFIRMED classification on a P1.8-mapped topic retrieves the exact mapped question', () => {
    const expectedPyq = UPSC_CSE_PRELIMS_PYQ_BANK.find((q) => q.id === pyqId)!;
    expect(expectedPyq).toBeDefined();
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId, status: 'confirmed' }));
    expect(results).toEqual([{ id: expectedPyq.id, question: expectedPyq.question, year: expectedPyq.year }]);
  });

  it('a PROPOSED classification on the same P1.8-mapped topic retrieves nothing', () => {
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId, status: 'proposed' }));
    expect(results).toEqual([]);
  });

  it('a REJECTED classification on the same P1.8-mapped topic retrieves nothing', () => {
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId, status: 'rejected' }));
    expect(results).toEqual([]);
  });

  it('the three P1.7-excluded questions still show the honest empty state — confirmed classification, no mapped PYQ', () => {
    // These three ids exist as real questions (verified against the bank) but are deliberately
    // absent from UPSC_CSE_GRANULAR_PYQ_MAPPING — their OWN microsyllabus items' topic ids never
    // resolve back to them via granularNodeIdForPyq, so a confirmed classification against any
    // topic in their own microsyllabus item correctly finds no match for these specific questions.
    const excludedIds = ['upsc-cse-pyq-2026-gs-paper-i-22', 'upsc-cse-pyq-2026-gs-paper-i-31', 'upsc-cse-pyq-2026-gs-paper-i-55'];
    for (const id of excludedIds) {
      expect(UPSC_CSE_PRELIMS_PYQ_BANK.some((q) => q.id === id)).toBe(true); // exists in the bank
      expect(Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING)).not.toContain(id); // but never mapped
    }
  });
});

// P2.1 — the remaining six P1.8 mappings. Q34 (upscCseGranularPyqMapping.test.ts) and Q27 (the
// block just above) already have full end-to-end relatedPyqsForClassification coverage; these six
// were previously verified only at the granularNodeIdForPyq resolution level
// (upscCseGranularPyqMapping.test.ts), never through this module's confirmed/proposed/rejected
// retrieval path. Table-driven to avoid six near-identical copy-pasted describe blocks — every case
// still asserts the EXACT question id/question/year, never merely "non-empty"/"empty".
describe('relatedPyqsForClassification — P2.1 remaining P1.8 batch (full end-to-end coverage)', () => {
  const cases: { pyqId: string; topicId: string; label: string }[] = [
    { pyqId: 'upsc-cse-pyq-2026-gs-paper-i-5', topicId: 'prelims-gs1-history-ancient__t-buddhism-jainism', label: 'Buddhism & Jainism' },
    { pyqId: 'upsc-cse-pyq-2026-gs-paper-i-21', topicId: 'prelims-gs1-environment-ecology-climate-change__t-india-s-climate-policy', label: "India's Climate Policy" },
    { pyqId: 'upsc-cse-pyq-2026-gs-paper-i-23', topicId: 'prelims-gs1-environment-ecology-climate-change__t-climate-change-science', label: 'Climate Change Science' },
    { pyqId: 'upsc-cse-pyq-2026-gs-paper-i-32', topicId: 'prelims-gs1-environment-ecology-biodiversity__t-protected-areas', label: 'Protected Areas' },
    { pyqId: 'upsc-cse-pyq-2026-gs-paper-i-54', topicId: 'prelims-gs1-polity-constitution__t-salient-features', label: 'Salient Features & Basic Structure' },
    { pyqId: 'upsc-cse-pyq-2026-gs-paper-i-74', topicId: 'prelims-gs1-polity-panchayati-raj__t-panchayati-raj-structure', label: 'Panchayati Raj Structure' },
  ];

  it.each(cases)('$label ($pyqId): resolves to the expected granular topic per UPSC_CSE_GRANULAR_PYQ_MAPPING', ({ pyqId, topicId }) => {
    expect(UPSC_CSE_GRANULAR_PYQ_MAPPING[pyqId]).toBe(topicId);
  });

  it.each(cases)('$label ($pyqId): a CONFIRMED classification retrieves exactly this question (id, question text, year)', ({ pyqId, topicId }) => {
    const expectedPyq = UPSC_CSE_PRELIMS_PYQ_BANK.find((q) => q.id === pyqId)!;
    expect(expectedPyq).toBeDefined();
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId, status: 'confirmed' }));
    expect(results).toEqual([{ id: expectedPyq.id, question: expectedPyq.question, year: expectedPyq.year }]);
  });

  it.each(cases)('$label ($pyqId): a PROPOSED classification on this exact topic retrieves nothing', ({ topicId }) => {
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId, status: 'proposed' }));
    expect(results).toEqual([]);
  });

  it.each(cases)('$label ($pyqId): a REJECTED classification on this exact topic retrieves nothing', ({ topicId }) => {
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId, status: 'rejected' }));
    expect(results).toEqual([]);
  });
});

describe('relatedPyqsForClassification — classification status gating', () => {
  it('a PROPOSED classification never activates the related-PYQ view, even for a topic with real mapped PYQs', () => {
    const mappedPyqId = Object.keys(UPSC_CSE_GRANULAR_PYQ_MAPPING)[0];
    const granularTopicId = UPSC_CSE_GRANULAR_PYQ_MAPPING[mappedPyqId];
    const results = relatedPyqsForClassification(classification({ taxonomy: 'upsc_cse', topicId: granularTopicId, status: 'proposed' }));
    expect(results).toEqual([]);
  });

  it('a REJECTED classification never activates the related-PYQ view', () => {
    const q = PYQ_BANK[0];
    const results = relatedPyqsForClassification(classification({ taxonomy: 'apfc', topicId: q.topicId, status: 'rejected' }));
    expect(results).toEqual([]);
  });
});

// P1.6 — RepositoryDetail.tsx now loads this module via a real dynamic import() (code-split into
// its own chunk, so the ~271kB APFC + ~210kB CSE PYQ data it pulls in is fetched only when a page
// actually has a confirmed classification — see that file's own P1.6 comment), rather than a static
// top-level import. This proves the dynamically-imported module resolves to the exact same function
// with identical results — the lazy-loading change is purely about WHEN the module loads, never
// WHAT it returns.
describe('relatedPyqsForClassification — dynamic import() resolves correctly (P1.6 lazy-load)', () => {
  it('a real dynamic import of this module exposes relatedPyqsForClassification and it behaves identically to the statically-imported one', async () => {
    const dynamicModule = await import('./relatedPyqs');
    expect(dynamicModule.relatedPyqsForClassification).toBe(relatedPyqsForClassification);

    const q = PYQ_BANK[0];
    const input = classification({ taxonomy: 'apfc', topicId: q.topicId, status: 'confirmed' });
    expect(dynamicModule.relatedPyqsForClassification(input)).toEqual(relatedPyqsForClassification(input));
  });
});
