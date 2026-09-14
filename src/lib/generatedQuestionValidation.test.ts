import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionDraft, GeneratedProvenance, PYQ } from './types';
import { SYLLABUS } from '../data/syllabus';
import { validateGeneratedQuestion, GENERATED_VERIFICATION_STATUSES } from './generatedQuestionValidation';
import { toPyqProvenance, isPyqProvenance } from './practiceQuestion';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;

function provenance(overrides: Partial<GeneratedProvenance> = {}): GeneratedProvenance {
  return {
    kind: 'generated',
    sourceAuthority: 'PIB',
    sourceTitle: 'PIB Press Release: EPFO Raises Wage Ceiling',
    sourceReference: 'https://pib.gov.in/PressReleasePage.aspx?PRID=123456',
    sourcePublishedAt: '2025-03-12',
    topicId: REAL_TOPIC_ID,
    verificationStatus: 'draft',
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function draft(overrides: Partial<GeneratedQuestionDraft> = {}): GeneratedQuestionDraft {
  return {
    id: 'gen-1',
    subject: 'labourLaw',
    topicId: REAL_TOPIC_ID,
    question: 'Under the recently revised notification, what is the new EPF wage ceiling?',
    options: [
      { id: 'gen-1-o0', text: '₹15,000' },
      { id: 'gen-1-o1', text: '₹21,000' },
      { id: 'gen-1-o2', text: '₹25,000' },
      { id: 'gen-1-o3', text: '₹30,000' },
    ],
    correctOptionId: 'gen-1-o1',
    explanation: 'The notification revised the statutory wage ceiling to ₹21,000.',
    provenance: provenance(),
    ...overrides,
  };
}

function pyq(overrides: Partial<PYQ> = {}): PYQ {
  return {
    id: 'pyq-1',
    year: 2023,
    subject: 'polity',
    topicId: REAL_TOPIC_ID,
    question: 'A PYQ question?',
    options: [
      { id: 'pyq-1-o0', text: 'A' },
      { id: 'pyq-1-o1', text: 'B' },
    ],
    correctOptionId: 'pyq-1-o0',
    explanation: 'Because A.',
    verificationStatus: 'cross_verified',
    ...overrides,
  };
}

describe('1. valid source-backed generated provenance', () => {
  it('accepts a fully well-formed draft', () => {
    const result = validateGeneratedQuestion(draft());
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('accepts a draft without the optional fields (sourcePublishedAt, calibratedAgainstPyqIds)', () => {
    const d = draft({ provenance: provenance({ sourcePublishedAt: undefined, calibratedAgainstPyqIds: undefined }) });
    expect(validateGeneratedQuestion(d)).toEqual({ valid: true, errors: [] });
  });

  it('accepts a draft with calibratedAgainstPyqIds present', () => {
    const d = draft({ provenance: provenance({ calibratedAgainstPyqIds: ['pyq-2023-4', 'pyq-2016-10'] }) });
    expect(validateGeneratedQuestion(d)).toEqual({ valid: true, errors: [] });
  });
});

describe('2. missing/invalid source metadata rejected', () => {
  it.each([
    ['sourceAuthority', { sourceAuthority: '' }, 'provenance.sourceAuthority is required.'],
    ['sourceTitle', { sourceTitle: '   ' }, 'provenance.sourceTitle is required.'],
    ['sourceReference', { sourceReference: '' }, 'provenance.sourceReference is required (a URL or an official document reference).'],
  ])('rejects a missing %s', (_label, overrides, expectedError) => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance(overrides as Partial<GeneratedProvenance>) }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(expectedError);
  });

  it('accepts a non-URL official document reference (not every source is web-hosted)', () => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance({ sourceReference: 'Gazette of India, Extraordinary, Part II, Notification No. 123' }) }));
    expect(result.valid).toBe(true);
  });

  it('rejects an invalid sourcePublishedAt date', () => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance({ sourcePublishedAt: 'not-a-date' }) }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('provenance.sourcePublishedAt, if present, must be a valid date.');
  });

  it('rejects a missing provenance.topicId', () => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance({ topicId: '' }) }));
    expect(result.errors).toContain('provenance.topicId is required.');
  });

  it('rejects a provenance.topicId that does not match a known syllabus topic', () => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance({ topicId: 'not-a-real-topic-id' }) }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('provenance.topicId "not-a-real-topic-id" does not match a known syllabus topic.');
  });

  it('rejects an empty string within calibratedAgainstPyqIds', () => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance({ calibratedAgainstPyqIds: ['pyq-2023-1', ''] }) }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('provenance.calibratedAgainstPyqIds must not contain empty ids.');
  });

  it('rejects a missing provenance.generatedAt', () => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance({ generatedAt: '' }) }));
    expect(result.errors).toContain('provenance.generatedAt is required.');
  });

  it('rejects an invalid provenance.generatedAt', () => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance({ generatedAt: 'not-a-timestamp' }) }));
    expect(result.errors).toContain('provenance.generatedAt must be a valid ISO timestamp.');
  });
});

describe('3. invalid verification state rejected', () => {
  it('rejects a verificationStatus outside draft/verified/published/retired', () => {
    const d = draft({ provenance: provenance({ verificationStatus: 'unreviewed' as GeneratedProvenance['verificationStatus'] }) });
    const result = validateGeneratedQuestion(d);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`provenance.verificationStatus must be one of: ${GENERATED_VERIFICATION_STATUSES.join(', ')}.`);
  });

  it.each(GENERATED_VERIFICATION_STATUSES)('accepts the valid verification state "%s"', (status) => {
    const result = validateGeneratedQuestion(draft({ provenance: provenance({ verificationStatus: status }) }));
    expect(result.valid).toBe(true);
  });
});

describe('base question / answer / explanation validation', () => {
  it('rejects a missing id', () => {
    expect(validateGeneratedQuestion(draft({ id: '' })).errors).toContain('id is required.');
  });

  it('rejects an id colliding with an existing question id', () => {
    const result = validateGeneratedQuestion(draft({ id: 'pyq-1' }), new Set(['pyq-1', 'q-1']));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id "pyq-1" collides with an existing question id.');
  });

  it('accepts an id that does not collide with the supplied existing-id set', () => {
    const result = validateGeneratedQuestion(draft({ id: 'gen-new-1' }), new Set(['pyq-1', 'q-1']));
    expect(result.valid).toBe(true);
  });

  it('rejects an unrecognised subject', () => {
    const result = validateGeneratedQuestion(draft({ subject: 'astrology' as GeneratedQuestionDraft['subject'] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('subject must be a recognised syllabus subject.');
  });

  it('rejects fewer than two options', () => {
    const result = validateGeneratedQuestion(draft({ options: [{ id: 'o0', text: 'Only one' }] }));
    expect(result.errors).toContain('at least two options are required.');
  });

  it('rejects a duplicate option id', () => {
    const result = validateGeneratedQuestion(
      draft({ options: [{ id: 'dup', text: 'A' }, { id: 'dup', text: 'B' }], correctOptionId: 'dup' }),
    );
    expect(result.errors).toContain('duplicate option id "dup".');
  });

  it('rejects an option with empty text', () => {
    const result = validateGeneratedQuestion(draft({ options: [{ id: 'o0', text: '' }, { id: 'o1', text: 'B' }] }));
    expect(result.errors).toContain('option "o0" must have non-empty text.');
  });

  it('rejects a correctOptionId not matching any option', () => {
    const result = validateGeneratedQuestion(draft({ correctOptionId: 'does-not-exist' }));
    expect(result.errors).toContain('correctOptionId must match the id of one of the provided options.');
  });

  it('rejects a missing question or explanation', () => {
    expect(validateGeneratedQuestion(draft({ question: '  ' })).errors).toContain('question text is required.');
    expect(validateGeneratedQuestion(draft({ explanation: '' })).errors).toContain('explanation is required.');
  });

  it('accumulates every violation rather than stopping at the first', () => {
    const result = validateGeneratedQuestion(
      draft({ id: '', question: '', explanation: '', provenance: provenance({ sourceAuthority: '', verificationStatus: 'bogus' as GeneratedProvenance['verificationStatus'] }) }),
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it('never mutates the input draft', () => {
    const d = draft();
    const snapshot = JSON.stringify(d);
    validateGeneratedQuestion(d, new Set(['x']));
    expect(JSON.stringify(d)).toBe(snapshot);
  });
});

describe('4. existing PYQ provenance remains valid and unchanged', () => {
  it('toPyqProvenance still produces the same PyqProvenance shape', () => {
    const p = toPyqProvenance(pyq({ year: 2016, verificationStatus: 'provisional', verificationNote: 'note', source: 'Booklet' }));
    expect(p).toEqual({ kind: 'pyq', year: 2016, verificationStatus: 'provisional', verificationNote: 'note', source: 'Booklet' });
  });

  it('a PyqProvenance value is unaffected by the GeneratedProvenance extension', () => {
    const p = toPyqProvenance(pyq());
    expect(p.kind).toBe('pyq');
    expect('sourceTitle' in p).toBe(false);
    expect('verificationStatus' in p).toBe(true);
    expect(p.verificationStatus).toBe('cross_verified');
  });
});

describe('5. existing PracticeBankProvenance remains valid', () => {
  it('constructs correctly with just kind and tag', () => {
    const practiceBank: import('./types').PracticeBankProvenance = { kind: 'practice_bank', tag: 'Practice' };
    expect(practiceBank).toEqual({ kind: 'practice_bank', tag: 'Practice' });
  });
});

describe('6. generated questions remain distinguishable from authentic PYQs', () => {
  it('isPyqProvenance is false for a generated provenance and true for a pyq provenance', () => {
    expect(isPyqProvenance(provenance())).toBe(false);
    expect(isPyqProvenance(toPyqProvenance(pyq()))).toBe(true);
  });

  it('a valid generated draft never satisfies isPyqProvenance even with all fields populated', () => {
    const d = draft({ provenance: provenance({ calibratedAgainstPyqIds: ['pyq-2023-4'] }) });
    expect(isPyqProvenance(d.provenance)).toBe(false);
    expect(d.provenance.kind).toBe('generated');
  });
});
