import { describe, it, expect } from 'vitest';
import type { PYQ, PracticeQuestion, QuestionProvenance, GeneratedProvenance } from './types';
import { toPyqProvenance, isPyqProvenance } from './practiceQuestion';

function pyq(overrides: Partial<PYQ> = {}): PYQ {
  return {
    id: 'pyq-1',
    year: 2023,
    subject: 'polity',
    topicId: 'po-1',
    question: 'Sample question?',
    options: [
      { id: 'pyq-1-o0', text: 'Option A' },
      { id: 'pyq-1-o1', text: 'Option B' },
    ],
    correctOptionId: 'pyq-1-o0',
    explanation: 'Because A is correct.',
    verificationStatus: 'cross_verified',
    ...overrides,
  };
}

describe('toPyqProvenance', () => {
  it('maps a PYQ into the discriminated pyq provenance shape', () => {
    const q = pyq({ year: 2016, verificationStatus: 'provisional', verificationNote: 'needs review', source: 'Booklet A' });
    expect(toPyqProvenance(q)).toEqual({
      kind: 'pyq',
      year: 2016,
      verificationStatus: 'provisional',
      verificationNote: 'needs review',
      source: 'Booklet A',
    });
  });

  it('preserves absent optional fields as undefined rather than fabricating values', () => {
    const q = pyq({ verificationNote: undefined, source: undefined });
    const provenance = toPyqProvenance(q);
    expect(provenance.verificationNote).toBeUndefined();
    expect(provenance.source).toBeUndefined();
  });

  it('never mutates the input PYQ', () => {
    const q = pyq();
    const snapshot = JSON.stringify(q);
    toPyqProvenance(q);
    expect(JSON.stringify(q)).toBe(snapshot);
  });
});

describe('isPyqProvenance', () => {
  it('returns true for a pyq provenance value', () => {
    const provenance: QuestionProvenance = toPyqProvenance(pyq());
    expect(isPyqProvenance(provenance)).toBe(true);
  });

  it('returns false for a generated provenance value', () => {
    const generated: GeneratedProvenance = {
      kind: 'generated',
      sourceAuthority: 'PIB',
      sourceTitle: 'PIB Press Release: Example',
      sourceReference: 'https://pib.gov.in/example',
      topicId: 't-1',
      verificationStatus: 'draft',
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(isPyqProvenance(generated)).toBe(false);
  });

  it('narrows the type so pyq-only fields are accessible after the check', () => {
    const provenance: QuestionProvenance = toPyqProvenance(pyq({ year: 2012 }));
    if (isPyqProvenance(provenance)) {
      expect(provenance.year).toBe(2012);
    } else {
      throw new Error('expected pyq provenance');
    }
  });
});

describe('PracticeQuestion structural compatibility', () => {
  it('accepts a PYQ wherever a PracticeQuestion is expected, with zero data changes', () => {
    function readBaseFields(q: PracticeQuestion) {
      return { id: q.id, subject: q.subject, topicId: q.topicId, question: q.question, correctOptionId: q.correctOptionId };
    }
    const q = pyq({ id: 'pyq-42', subject: 'economy', topicId: 'ec-3' });
    // If PYQ ever stopped satisfying PracticeQuestion structurally, this line would fail to typecheck.
    const base = readBaseFields(q);
    expect(base).toEqual({ id: 'pyq-42', subject: 'economy', topicId: 'ec-3', question: q.question, correctOptionId: q.correctOptionId });
  });
});
