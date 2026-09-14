import { describe, it, expect } from 'vitest';
import type { AuthoritativeSourceRecord } from './generatedQuestionSource';
import type { ConceptExtractionInput } from './generatedQuestionResearch';
import { SYLLABUS } from '../data/syllabus';
import { validateSourceConcept } from './generatedQuestionSource';
import { validateResearchBatch, getValidBatchConcepts, type ResearchBatch } from './generatedQuestionResearchBatch';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;

function source(overrides: Partial<AuthoritativeSourceRecord> = {}): AuthoritativeSourceRecord {
  return {
    sourceId: 'src-1',
    authority: 'Source Authority',
    title: 'Source Title',
    reference: 'Source Reference',
    publishedAt: '2025-01-01',
    sourceType: 'other_official',
    ...overrides,
  };
}

function extraction(overrides: Partial<ConceptExtractionInput> = {}): ConceptExtractionInput {
  return {
    conceptId: 'concept-1',
    sourceId: 'src-1',
    topicId: REAL_TOPIC_ID,
    concept: 'Structural test concept',
    factualBasis: 'Structural test factual basis text.',
    ...overrides,
  };
}

function batch(overrides: Partial<ResearchBatch> = {}): ResearchBatch {
  return {
    batchId: 'batch-1',
    researchedAt: '2026-01-01T00:00:00.000Z',
    sources: [source()],
    conceptInputs: [extraction()],
    ...overrides,
  };
}

describe('1. valid multi-source batch', () => {
  it('validates every source and every concept as valid', () => {
    const result = validateResearchBatch(
      batch({
        sources: [source({ sourceId: 'src-1' }), source({ sourceId: 'src-2' })],
        conceptInputs: [extraction({ conceptId: 'concept-1', sourceId: 'src-1' }), extraction({ conceptId: 'concept-2', sourceId: 'src-2' })],
      }),
    );
    expect(result.sources.every((s) => s.status === 'valid')).toBe(true);
    expect(result.concepts.every((c) => c.status === 'valid')).toBe(true);
    expect(result.batchId).toBe('batch-1');
  });
});

describe('2. multiple concepts across multiple sources', () => {
  it('correlates each concept with the correct source and validates all of them', () => {
    const result = validateResearchBatch(
      batch({
        sources: [source({ sourceId: 'src-1' }), source({ sourceId: 'src-2' })],
        conceptInputs: [
          extraction({ conceptId: 'c1', sourceId: 'src-1' }),
          extraction({ conceptId: 'c2', sourceId: 'src-1' }),
          extraction({ conceptId: 'c3', sourceId: 'src-2' }),
        ],
      }),
    );
    expect(result.concepts).toHaveLength(3);
    expect(result.concepts.every((c) => c.status === 'valid')).toBe(true);
    expect(getValidBatchConcepts(result).map((c) => c.conceptId)).toEqual(['c1', 'c2', 'c3']);
  });
});

describe('3. duplicate sourceId rejected', () => {
  it('flags the second occurrence of a repeated sourceId, deterministically', () => {
    const result = validateResearchBatch(
      batch({ sources: [source({ sourceId: 'dup' }), source({ sourceId: 'dup' })], conceptInputs: [] }),
    );
    expect(result.sources[0].status).toBe('valid');
    expect(result.sources[1].status).toBe('invalid');
    if (result.sources[1].status === 'invalid') {
      expect(result.sources[1].errors).toContain('sourceId "dup" is a duplicate within this research batch.');
    }
  });
});

describe('4. duplicate conceptId rejected', () => {
  it('flags the second occurrence of a repeated conceptId, even across different sources', () => {
    const result = validateResearchBatch(
      batch({
        sources: [source({ sourceId: 'src-1' }), source({ sourceId: 'src-2' })],
        conceptInputs: [extraction({ conceptId: 'dup', sourceId: 'src-1' }), extraction({ conceptId: 'dup', sourceId: 'src-2' })],
      }),
    );
    expect(result.concepts[0].status).toBe('valid');
    expect(result.concepts[1].status).toBe('invalid');
    if (result.concepts[1].status === 'invalid') {
      expect(result.concepts[1].errors).toContain('conceptId "dup" is a duplicate within this research batch.');
    }
  });
});

describe('5. concept referencing missing source rejected', () => {
  it('rejects a concept whose sourceId is not present among the batch sources', () => {
    const result = validateResearchBatch(batch({ conceptInputs: [extraction({ sourceId: 'src-does-not-exist' })] }));
    expect(result.concepts[0].status).toBe('invalid');
    if (result.concepts[0].status === 'invalid') {
      expect(result.concepts[0].errors).toContain('concept.sourceId "src-does-not-exist" does not reference a source present in this batch.');
    }
  });
});

describe('6. invalid source reported without hiding valid sources', () => {
  it('reports each source independently in a mixed batch', () => {
    const result = validateResearchBatch(
      batch({ sources: [source({ sourceId: 'bad', authority: '' }), source({ sourceId: 'good' })], conceptInputs: [] }),
    );
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].status).toBe('invalid');
    expect(result.sources[1].status).toBe('valid');
  });
});

describe('7. invalid concept reported without hiding valid concepts', () => {
  it('reports each concept independently in a mixed batch', () => {
    const result = validateResearchBatch(
      batch({
        conceptInputs: [extraction({ conceptId: 'bad', factualBasis: '' }), extraction({ conceptId: 'good' })],
      }),
    );
    expect(result.concepts).toHaveLength(2);
    expect(result.concepts[0].status).toBe('invalid');
    expect(result.concepts[1].status).toBe('valid');
    expect(getValidBatchConcepts(result).map((c) => c.conceptId)).toEqual(['good']);
  });
});

describe('8. source metadata preserved exactly', () => {
  it('preserves every source field unchanged in the result', () => {
    const s = source({ authority: 'Authority X', title: 'Title Y', reference: 'Reference Z', publishedAt: '2024-03-01' });
    const result = validateResearchBatch(batch({ sources: [s], conceptInputs: [] }));
    expect(result.sources[0].source).toEqual(s);
  });
});

describe('9. factualBasis preserved exactly', () => {
  it('preserves factualBasis exactly on a valid concept', () => {
    const result = validateResearchBatch(
      batch({ conceptInputs: [extraction({ factualBasis: 'An exact structural fact statement for batch preservation testing.' })] }),
    );
    expect(result.concepts[0].status).toBe('valid');
    if (result.concepts[0].status === 'valid') {
      expect(result.concepts[0].concept.factualBasis).toBe('An exact structural fact statement for batch preservation testing.');
    }
  });
});

describe('10. no inferred/default metadata', () => {
  it('leaves an omitted source publishedAt undefined rather than defaulting it', () => {
    const s = source({ publishedAt: undefined });
    const result = validateResearchBatch(batch({ sources: [s], conceptInputs: [] }));
    expect(result.sources[0].status).toBe('valid');
    expect(result.sources[0].source.publishedAt).toBeUndefined();
  });

  it('leaves omitted relevantPyqIds undefined on a valid concept rather than defaulting it', () => {
    const result = validateResearchBatch(batch({ conceptInputs: [extraction({ relevantPyqIds: undefined })] }));
    expect(result.concepts[0].status).toBe('valid');
    if (result.concepts[0].status === 'valid') {
      expect(result.concepts[0].concept.relevantPyqIds).toBeUndefined();
    }
  });

  it('never invents a topicId: an empty topicId is rejected, not defaulted', () => {
    const result = validateResearchBatch(batch({ conceptInputs: [extraction({ topicId: '' })] }));
    expect(result.concepts[0].status).toBe('invalid');
    if (result.concepts[0].status === 'invalid') {
      expect(result.concepts[0].errors).toContain('topicId is required.');
    }
  });
});

describe('11. no mutation of the batch input', () => {
  it('leaves the entire batch byte-for-byte unchanged', () => {
    const b = batch({
      sources: [source({ sourceId: 'src-1' }), source({ sourceId: 'src-2' })],
      conceptInputs: [extraction({ conceptId: 'c1', sourceId: 'src-1' }), extraction({ conceptId: 'c2', sourceId: 'src-2' })],
    });
    const snapshot = JSON.stringify(b);
    validateResearchBatch(b);
    expect(JSON.stringify(b)).toBe(snapshot);
  });

  it('leaves the batch unchanged even when it contains duplicates and invalid entries', () => {
    const b = batch({
      sources: [source({ sourceId: 'dup' }), source({ sourceId: 'dup', authority: '' })],
      conceptInputs: [extraction({ conceptId: 'dup' }), extraction({ conceptId: 'dup', factualBasis: '' })],
    });
    const snapshot = JSON.stringify(b);
    validateResearchBatch(b);
    expect(JSON.stringify(b)).toBe(snapshot);
  });
});

describe('12. existing Stage 6A-6I tests remain compatible', () => {
  it('a valid concept produced by this batch workflow still passes generatedQuestionSource.ts validation directly', () => {
    const result = validateResearchBatch(batch());
    expect(result.concepts[0].status).toBe('valid');
    if (result.concepts[0].status === 'valid') {
      expect(validateSourceConcept(result.concepts[0].concept)).toEqual([]);
    }
  });
});
