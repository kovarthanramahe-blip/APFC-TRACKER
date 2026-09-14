import { describe, it, expect } from 'vitest';
import type { AuthoritativeSourceRecord } from './generatedQuestionSource';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { validateSourceConcept } from './generatedQuestionSource';
import {
  runSourceResearchWorkflow,
  getValidSourceConcepts,
  type ConceptExtractionInput,
  type SourceResearchWorkflowInput,
} from './generatedQuestionResearch';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;
const REAL_PYQ_ID = PYQ_BANK[0].id;

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

function researchInput(overrides: Partial<SourceResearchWorkflowInput> = {}): SourceResearchWorkflowInput {
  return {
    source: source(),
    sourceContent: 'Structural raw source content text, supplied verbatim by the caller.',
    concepts: [extraction()],
    ...overrides,
  };
}

describe('1. valid official source + supplied source material', () => {
  it('produces zero source errors and one valid concept', () => {
    const result = runSourceResearchWorkflow(researchInput());
    expect(result.sourceErrors).toEqual([]);
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].status).toBe('valid');
  });
});

describe('2. multiple concepts from one source', () => {
  it('validates every concept in the batch independently', () => {
    const result = runSourceResearchWorkflow(
      researchInput({
        concepts: [
          extraction({ conceptId: 'concept-1' }),
          extraction({ conceptId: 'concept-2' }),
          extraction({ conceptId: 'concept-3' }),
        ],
      }),
    );
    expect(result.concepts).toHaveLength(3);
    expect(result.concepts.every((c) => c.status === 'valid')).toBe(true);
    expect(getValidSourceConcepts(result).map((c) => c.conceptId)).toEqual(['concept-1', 'concept-2', 'concept-3']);
  });
});

describe('3. valid PIB source type', () => {
  it('passes source validation', () => {
    const result = runSourceResearchWorkflow(researchInput({ source: source({ sourceType: 'pib' }) }));
    expect(result.sourceErrors).toEqual([]);
  });
});

describe('4. valid India Code source type', () => {
  it('passes source validation', () => {
    const result = runSourceResearchWorkflow(researchInput({ source: source({ sourceType: 'india_code' }) }));
    expect(result.sourceErrors).toEqual([]);
  });
});

describe('5. valid Ministry/EPFO source type', () => {
  it('passes source validation for "ministry"', () => {
    const result = runSourceResearchWorkflow(researchInput({ source: source({ sourceType: 'ministry' }) }));
    expect(result.sourceErrors).toEqual([]);
  });

  it('passes source validation for "epfo"', () => {
    const result = runSourceResearchWorkflow(researchInput({ source: source({ sourceType: 'epfo' }) }));
    expect(result.sourceErrors).toEqual([]);
  });
});

describe('6. missing factualBasis rejected', () => {
  it('rejects an empty factualBasis', () => {
    const result = runSourceResearchWorkflow(researchInput({ concepts: [extraction({ factualBasis: '' })] }));
    expect(result.concepts[0].status).toBe('invalid');
    if (result.concepts[0].status === 'invalid') {
      expect(result.concepts[0].errors).toContain('factualBasis is required.');
    }
  });

  it('rejects a whitespace-only factualBasis', () => {
    const result = runSourceResearchWorkflow(researchInput({ concepts: [extraction({ factualBasis: '   ' })] }));
    expect(result.concepts[0].status).toBe('invalid');
  });
});

describe('7. invalid topic rejected', () => {
  it('rejects a bogus topicId', () => {
    const result = runSourceResearchWorkflow(researchInput({ concepts: [extraction({ topicId: 'not-a-real-topic' })] }));
    expect(result.concepts[0].status).toBe('invalid');
    if (result.concepts[0].status === 'invalid') {
      expect(result.concepts[0].errors).toContain('topicId "not-a-real-topic" does not match a known syllabus topic.');
    }
  });
});

describe('8. invalid source association rejected', () => {
  it('rejects a concept whose sourceId does not match the given source', () => {
    const result = runSourceResearchWorkflow(
      researchInput({ source: source({ sourceId: 'src-1' }), concepts: [extraction({ sourceId: 'src-other' })] }),
    );
    expect(result.concepts[0].status).toBe('invalid');
    if (result.concepts[0].status === 'invalid') {
      expect(result.concepts[0].errors).toContain('concept.sourceId "src-other" does not match source.sourceId "src-1".');
    }
  });
});

describe('9. duplicate conceptId detected', () => {
  it('flags the second occurrence of a repeated conceptId, deterministically', () => {
    const result = runSourceResearchWorkflow(
      researchInput({ concepts: [extraction({ conceptId: 'dup', concept: 'First' }), extraction({ conceptId: 'dup', concept: 'Second' })] }),
    );
    expect(result.concepts[0].status).toBe('valid');
    expect(result.concepts[1].status).toBe('invalid');
    if (result.concepts[1].status === 'invalid') {
      expect(result.concepts[1].errors).toContain('conceptId "dup" is a duplicate within this source-research batch.');
    }
  });

  it('does not flag distinct concepts sharing no conceptId', () => {
    const result = runSourceResearchWorkflow(
      researchInput({ concepts: [extraction({ conceptId: 'a' }), extraction({ conceptId: 'b' })] }),
    );
    expect(result.concepts.every((c) => c.status === 'valid')).toBe(true);
  });
});

describe('10. one invalid concept does not hide valid concepts', () => {
  it('reports each concept independently in a mixed batch', () => {
    const result = runSourceResearchWorkflow(
      researchInput({
        concepts: [extraction({ conceptId: 'bad-one', factualBasis: '' }), extraction({ conceptId: 'good-one' })],
      }),
    );
    expect(result.concepts).toHaveLength(2);
    expect(result.concepts[0].status).toBe('invalid');
    expect(result.concepts[1].status).toBe('valid');
    expect(getValidSourceConcepts(result).map((c) => c.conceptId)).toEqual(['good-one']);
  });
});

describe('11. source/factualBasis preserved exactly', () => {
  it('preserves source fields unchanged in the result', () => {
    const s = source({ authority: 'Authority X', title: 'Title Y', reference: 'Reference Z' });
    const result = runSourceResearchWorkflow(researchInput({ source: s }));
    expect(result.source).toEqual(s);
  });

  it('preserves sourceContent verbatim', () => {
    const result = runSourceResearchWorkflow(researchInput({ sourceContent: 'Exact verbatim structural content.' }));
    expect(result.sourceContent).toBe('Exact verbatim structural content.');
  });

  it('preserves factualBasis exactly on each valid concept', () => {
    const result = runSourceResearchWorkflow(
      researchInput({ concepts: [extraction({ factualBasis: 'An exact structural fact statement for preservation testing.' })] }),
    );
    expect(result.concepts[0].status).toBe('valid');
    if (result.concepts[0].status === 'valid') {
      expect(result.concepts[0].concept.factualBasis).toBe('An exact structural fact statement for preservation testing.');
    }
  });

  it('preserves relevantPyqIds exactly when supplied', () => {
    const result = runSourceResearchWorkflow(researchInput({ concepts: [extraction({ relevantPyqIds: [REAL_PYQ_ID] })] }));
    expect(result.concepts[0].status).toBe('valid');
    if (result.concepts[0].status === 'valid') {
      expect(result.concepts[0].concept.relevantPyqIds).toEqual([REAL_PYQ_ID]);
    }
  });
});

describe('12. no mutation of supplied source/concept input', () => {
  it('leaves the entire research input byte-for-byte unchanged', () => {
    const input = researchInput({ concepts: [extraction({ relevantPyqIds: [REAL_PYQ_ID] }), extraction({ conceptId: 'concept-2' })] });
    const snapshot = JSON.stringify(input);
    runSourceResearchWorkflow(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('leaves the input unchanged even when some concepts are invalid', () => {
    const input = researchInput({ concepts: [extraction({ factualBasis: '' }), extraction({ topicId: 'bogus' })] });
    const snapshot = JSON.stringify(input);
    runSourceResearchWorkflow(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('13. no inferred/default factual claims', () => {
  it('never defaults a missing factualBasis to a placeholder', () => {
    const result = runSourceResearchWorkflow(researchInput({ concepts: [extraction({ factualBasis: '' })] }));
    expect(result.concepts[0].status).toBe('invalid');
  });

  it('never defaults relevantPyqIds to an empty array when omitted', () => {
    const result = runSourceResearchWorkflow(researchInput({ concepts: [extraction({ relevantPyqIds: undefined })] }));
    expect(result.concepts[0].status).toBe('valid');
    if (result.concepts[0].status === 'valid') {
      expect(result.concepts[0].concept.relevantPyqIds).toBeUndefined();
    }
  });

  it('never invents a topicId: an omitted-equivalent (empty) topicId is rejected, not defaulted', () => {
    const result = runSourceResearchWorkflow(researchInput({ concepts: [extraction({ topicId: '' })] }));
    expect(result.concepts[0].status).toBe('invalid');
    if (result.concepts[0].status === 'invalid') {
      expect(result.concepts[0].errors).toContain('topicId is required.');
    }
  });
});

describe('14. existing Stage 6A-6H tests remain compatible', () => {
  it('a valid concept produced by this workflow still passes generatedQuestionSource.ts validation directly', () => {
    const result = runSourceResearchWorkflow(researchInput());
    expect(result.concepts[0].status).toBe('valid');
    if (result.concepts[0].status === 'valid') {
      expect(validateSourceConcept(result.concepts[0].concept)).toEqual([]);
    }
  });
});
