import { describe, it, expect } from 'vitest';
import type { AuthoritativeSourceRecord, SourceConcept } from './generatedQuestionSource';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import {
  SOURCE_TYPES,
  createSourceRecord,
  validateSourceRecord,
  createSourceConcept,
  validateSourceConcept,
  verifyConceptTopicExists,
  verifyRelevantPyqIdsExist,
  associateConceptsWithSource,
} from './generatedQuestionSource';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;
const REAL_PYQ_ID = PYQ_BANK[0].id;

function pibSource(overrides: Partial<AuthoritativeSourceRecord> = {}): AuthoritativeSourceRecord {
  return {
    sourceId: 'src-pib-1',
    authority: 'Press Information Bureau',
    title: 'PIB Press Release: EPFO Raises Wage Ceiling',
    reference: 'https://pib.gov.in/PressReleasePage.aspx?PRID=123456',
    publishedAt: '2025-03-12',
    sourceType: 'pib',
    ...overrides,
  };
}

function indiaCodeSource(overrides: Partial<AuthoritativeSourceRecord> = {}): AuthoritativeSourceRecord {
  return {
    sourceId: 'src-indiacode-1',
    authority: 'India Code',
    title: 'The Employees Provident Funds and Miscellaneous Provisions Act, 1952',
    reference: 'https://www.indiacode.nic.in/handle/123456789/1445',
    effectiveAt: '1952-03-04',
    sourceType: 'india_code',
    ...overrides,
  };
}

function ministrySource(overrides: Partial<AuthoritativeSourceRecord> = {}): AuthoritativeSourceRecord {
  return {
    sourceId: 'src-ministry-1',
    authority: 'Ministry of Labour and Employment',
    title: 'Gazette Notification S.O. 1234(E)',
    reference: 'Gazette of India, Extraordinary, Part II, Section 3, Sub-section (i)',
    publishedAt: '2024-11-05',
    sourceType: 'ministry',
    notes: 'Amends the wage ceiling under Section 2(f).',
    ...overrides,
  };
}

function epfoSource(overrides: Partial<AuthoritativeSourceRecord> = {}): AuthoritativeSourceRecord {
  return {
    sourceId: 'src-epfo-1',
    authority: 'Employees Provident Fund Organisation',
    title: 'EPFO Circular No. 5/2025',
    reference: 'EPFO/HO/2025/5',
    publishedAt: '2025-01-20',
    sourceType: 'epfo',
    ...overrides,
  };
}

function concept(overrides: Partial<SourceConcept> = {}): SourceConcept {
  return {
    conceptId: 'concept-1',
    sourceId: 'src-pib-1',
    topicId: REAL_TOPIC_ID,
    concept: 'The EPF statutory wage ceiling',
    factualBasis: 'The notification revised the statutory wage ceiling to ₹21,000.',
    ...overrides,
  };
}

describe('1. valid PIB source', () => {
  it('passes validation with zero errors', () => {
    const source = createSourceRecord(pibSource());
    expect(validateSourceRecord(source)).toEqual([]);
    expect(source.sourceType).toBe('pib');
  });
});

describe('2. valid India Code source', () => {
  it('passes validation with zero errors, using effectiveAt instead of publishedAt', () => {
    const source = createSourceRecord(indiaCodeSource());
    expect(validateSourceRecord(source)).toEqual([]);
    expect(source.sourceType).toBe('india_code');
    expect(source.effectiveAt).toBe('1952-03-04');
  });
});

describe('3. valid Ministry/EPFO source', () => {
  it('passes validation for a ministry source', () => {
    expect(validateSourceRecord(createSourceRecord(ministrySource()))).toEqual([]);
  });

  it('passes validation for an epfo source', () => {
    expect(validateSourceRecord(createSourceRecord(epfoSource()))).toEqual([]);
  });
});

describe('4. missing required source metadata rejected', () => {
  it.each([
    ['sourceId', { sourceId: '' }, 'sourceId is required.'],
    ['authority', { authority: '   ' }, 'authority is required.'],
    ['title', { title: '' }, 'title is required.'],
    ['reference', { reference: '' }, 'reference is required (an official URL or document reference).'],
  ])('rejects a missing %s', (_label, overrides, expectedError) => {
    const result = validateSourceRecord(pibSource(overrides as Partial<AuthoritativeSourceRecord>));
    expect(result).toContain(expectedError);
  });

  it('rejects an invalid publishedAt date', () => {
    const result = validateSourceRecord(pibSource({ publishedAt: 'not-a-date' }));
    expect(result).toContain('publishedAt, if present, must be a valid date.');
  });

  it('rejects an invalid effectiveAt date', () => {
    const result = validateSourceRecord(indiaCodeSource({ effectiveAt: 'not-a-date' }));
    expect(result).toContain('effectiveAt, if present, must be a valid date.');
  });

  it('accepts a source with neither publishedAt nor effectiveAt present, without inventing one', () => {
    const source = pibSource({ publishedAt: undefined });
    expect(validateSourceRecord(source)).toEqual([]);
    expect(source.publishedAt).toBeUndefined();
  });
});

describe('5. invalid sourceType rejected', () => {
  it('rejects a sourceType outside the recognised set', () => {
    const result = validateSourceRecord(pibSource({ sourceType: 'blog' as AuthoritativeSourceRecord['sourceType'] }));
    expect(result).toContain(`sourceType must be one of: ${SOURCE_TYPES.join(', ')}.`);
  });

  it.each(SOURCE_TYPES)('accepts the valid sourceType "%s"', (sourceType) => {
    const result = validateSourceRecord(pibSource({ sourceType }));
    expect(result).toEqual([]);
  });
});

describe('6. valid concept with real syllabus topic', () => {
  it('passes structural validation and topic verification', () => {
    const c = createSourceConcept(concept());
    expect(validateSourceConcept(c)).toEqual([]);
    expect(verifyConceptTopicExists(c)).toEqual([]);
  });
});

describe('7. invalid topic rejected', () => {
  it('verifyConceptTopicExists rejects a bogus topicId', () => {
    const c = concept({ topicId: 'not-a-real-topic' });
    expect(verifyConceptTopicExists(c)).toContain('topicId "not-a-real-topic" does not match a known syllabus topic.');
  });

  it('validateSourceConcept rejects a missing topicId', () => {
    const result = validateSourceConcept(concept({ topicId: '' }));
    expect(result).toContain('topicId is required.');
  });
});

describe('8. valid PYQ calibration IDs accepted', () => {
  it('verifyRelevantPyqIdsExist reports no errors for a real PYQ id', () => {
    const c = concept({ relevantPyqIds: [REAL_PYQ_ID] });
    expect(verifyRelevantPyqIdsExist(c)).toEqual([]);
  });

  it('validateSourceConcept accepts a concept without relevantPyqIds at all', () => {
    const result = validateSourceConcept(concept());
    expect(result).toEqual([]);
  });
});

describe('9. nonexistent PYQ calibration ID rejected', () => {
  it('verifyRelevantPyqIdsExist reports the unknown id', () => {
    const c = concept({ relevantPyqIds: [REAL_PYQ_ID, 'pyq-does-not-exist'] });
    expect(verifyRelevantPyqIdsExist(c)).toEqual(['relevantPyqIds references unknown PYQ id "pyq-does-not-exist".']);
  });

  it('validateSourceConcept rejects an empty id inside relevantPyqIds structurally', () => {
    const result = validateSourceConcept(concept({ relevantPyqIds: [REAL_PYQ_ID, ''] }));
    expect(result).toContain('relevantPyqIds must not contain empty ids.');
  });
});

describe('10. source/concept association preserves metadata exactly', () => {
  it('matches a concept whose sourceId equals the source sourceId, values unchanged', () => {
    const source = createSourceRecord(pibSource());
    const c = createSourceConcept(concept({ sourceId: source.sourceId, relevantPyqIds: [REAL_PYQ_ID] }));
    const result = associateConceptsWithSource(source, [c]);
    expect(result.matched).toEqual([c]);
    expect(result.mismatched).toEqual([]);
    expect(result.source).toEqual(source);
    expect(result.matched[0].factualBasis).toBe(c.factualBasis);
    expect(result.matched[0].relevantPyqIds).toEqual([REAL_PYQ_ID]);
  });

  it('separates out a concept whose sourceId does not match, without altering it', () => {
    const source = createSourceRecord(pibSource());
    const mismatchedConcept = createSourceConcept(concept({ sourceId: 'some-other-source' }));
    const result = associateConceptsWithSource(source, [mismatchedConcept]);
    expect(result.matched).toEqual([]);
    expect(result.mismatched).toEqual([mismatchedConcept]);
  });
});

describe('11. no mutation of input objects', () => {
  it('createSourceRecord returns a new object, not mutating or aliasing the input', () => {
    const input = pibSource();
    const snapshot = JSON.stringify(input);
    const record = createSourceRecord(input);
    expect(record).not.toBe(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('createSourceConcept returns a new object, not mutating or aliasing the input', () => {
    const input = concept({ relevantPyqIds: [REAL_PYQ_ID] });
    const snapshot = JSON.stringify(input);
    const c = createSourceConcept(input);
    expect(c).not.toBe(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('validateSourceRecord/validateSourceConcept do not mutate their inputs', () => {
    const source = pibSource();
    const sourceSnapshot = JSON.stringify(source);
    validateSourceRecord(source);
    expect(JSON.stringify(source)).toBe(sourceSnapshot);

    const c = concept();
    const conceptSnapshot = JSON.stringify(c);
    validateSourceConcept(c);
    verifyConceptTopicExists(c);
    verifyRelevantPyqIdsExist(c);
    expect(JSON.stringify(c)).toBe(conceptSnapshot);
  });

  it('associateConceptsWithSource does not mutate the source or the concepts array', () => {
    const source = pibSource();
    const sourceSnapshot = JSON.stringify(source);
    const concepts = [concept(), concept({ conceptId: 'concept-2', sourceId: 'other' })];
    const conceptsSnapshot = JSON.stringify(concepts);
    associateConceptsWithSource(source, concepts);
    expect(JSON.stringify(source)).toBe(sourceSnapshot);
    expect(JSON.stringify(concepts)).toBe(conceptsSnapshot);
  });
});

describe('12. no invented/default source metadata is introduced', () => {
  it('leaves publishedAt/effectiveAt/notes undefined rather than defaulting them', () => {
    const source = createSourceRecord({
      sourceId: 'src-bare-1',
      authority: 'India Code',
      title: 'Bare-minimum source',
      reference: 'https://www.indiacode.nic.in/somewhere',
      sourceType: 'india_code',
    });
    expect(source.publishedAt).toBeUndefined();
    expect(source.effectiveAt).toBeUndefined();
    expect(source.notes).toBeUndefined();
    expect(validateSourceRecord(source)).toEqual([]);
  });

  it('leaves relevantPyqIds undefined rather than defaulting it to an empty array', () => {
    const c = createSourceConcept(concept());
    expect(c.relevantPyqIds).toBeUndefined();
    expect(validateSourceConcept(c)).toEqual([]);
  });

  it('preserves the exact authority/title/reference text supplied, never substituting a placeholder', () => {
    const source = createSourceRecord(
      epfoSource({
        authority: 'Employees Provident Fund Organisation, Head Office',
        title: 'Circular No. 9/2025 — Interest Rate Notification',
        reference: 'EPFO/HO/2025/9',
      }),
    );
    expect(source.authority).toBe('Employees Provident Fund Organisation, Head Office');
    expect(source.title).toBe('Circular No. 9/2025 — Interest Rate Notification');
    expect(source.reference).toBe('EPFO/HO/2025/9');
  });
});
