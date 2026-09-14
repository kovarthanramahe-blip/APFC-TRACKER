import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionDraft, GeneratedProvenance } from './types';
import { SYLLABUS } from '../data/syllabus';
import { runGeneratedQuestionPipeline } from './generatedQuestionPipeline';

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

describe('1. valid source-backed draft produces a structurally valid candidate', () => {
  it('returns status "validated" with the candidate attached', () => {
    const result = runGeneratedQuestionPipeline(draft());
    expect(result.status).toBe('validated');
    if (result.status !== 'invalid') expect(result.candidate).toEqual(draft());
  });
});

describe('2. invalid source metadata is rejected', () => {
  it('reports the failure under stageErrors.sourceMetadata and overall status "invalid"', () => {
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ sourceAuthority: '', sourceReference: '' }) }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.sourceMetadata).toContain('provenance.sourceAuthority is required.');
      expect(result.stageErrors.sourceMetadata).toContain('provenance.sourceReference is required (a URL or an official document reference).');
      expect(result.stageErrors.questionStructure).toEqual([]);
      expect(result.errors).toContain('provenance.sourceAuthority is required.');
    }
  });
});

describe('3. invalid question/options/correct answer is rejected', () => {
  it('reports the failure under stageErrors.questionStructure', () => {
    const result = runGeneratedQuestionPipeline(draft({ correctOptionId: 'does-not-exist', options: [{ id: 'o0', text: 'Only one' }] }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.questionStructure).toContain('at least two options are required.');
      expect(result.stageErrors.sourceMetadata).toEqual([]);
    }
  });
});

describe('4. invalid syllabus topic is rejected', () => {
  it('reports the failure under stageErrors.topicLinkage for a bogus draft.topicId', () => {
    const result = runGeneratedQuestionPipeline(draft({ topicId: 'not-a-real-topic' }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.topicLinkage).toContain('topicId "not-a-real-topic" does not match a known syllabus topic.');
    }
  });

  it('reports the failure under stageErrors.topicLinkage for a bogus provenance.topicId', () => {
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ topicId: 'also-not-real' }) }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.topicLinkage).toContain('provenance.topicId "also-not-real" does not match a known syllabus topic.');
    }
  });
});

describe('5. a draft-status candidate cannot be published', () => {
  it('is "validated", not "publishable", when verificationStatus is "draft"', () => {
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ verificationStatus: 'draft' }) }));
    expect(result.status).toBe('validated');
  });
});

describe('6. a verified candidate is publishable', () => {
  it('is "publishable" when verificationStatus is "verified"', () => {
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ verificationStatus: 'verified' }) }));
    expect(result.status).toBe('publishable');
  });
});

describe('7. a published candidate is publishable', () => {
  it('is "publishable" when verificationStatus is "published"', () => {
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ verificationStatus: 'published' }) }));
    expect(result.status).toBe('publishable');
  });
});

describe('8. a retired candidate is not publishable', () => {
  it('is "validated", not "publishable", when verificationStatus is "retired"', () => {
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ verificationStatus: 'retired' }) }));
    expect(result.status).toBe('validated');
  });
});

describe('9. PYQ calibration ids are preserved', () => {
  it('passes calibratedAgainstPyqIds through unchanged on a validated candidate', () => {
    const ids = ['pyq-2023-4', 'pyq-2016-10'];
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ calibratedAgainstPyqIds: ids }) }));
    expect(result.status).toBe('validated');
    if (result.status === 'validated' || result.status === 'publishable') {
      expect(result.candidate.provenance.calibratedAgainstPyqIds).toEqual(ids);
    }
  });

  it('passes calibratedAgainstPyqIds through unchanged on a publishable candidate', () => {
    const ids = ['pyq-2023-4'];
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ verificationStatus: 'published', calibratedAgainstPyqIds: ids }) }));
    expect(result.status).toBe('publishable');
    if (result.status === 'publishable') {
      expect(result.candidate.provenance.calibratedAgainstPyqIds).toEqual(ids);
    }
  });

  it('remains undefined (not fabricated) when the draft never had calibration ids', () => {
    const result = runGeneratedQuestionPipeline(draft({ provenance: provenance({ calibratedAgainstPyqIds: undefined }) }));
    if (result.status === 'validated' || result.status === 'publishable') {
      expect(result.candidate.provenance.calibratedAgainstPyqIds).toBeUndefined();
    }
  });
});

describe('10. all relevant errors are returned, not silently dropped', () => {
  it('surfaces failures from every broken stage simultaneously', () => {
    const broken = draft({
      id: '',
      question: '',
      topicId: 'bogus-topic',
      provenance: provenance({
        sourceAuthority: '',
        topicId: 'also-bogus',
        calibratedAgainstPyqIds: ['pyq-1', ''],
        verificationStatus: 'draft',
      }),
    });
    const result = runGeneratedQuestionPipeline(broken);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.sourceMetadata.length).toBeGreaterThan(0);
      expect(result.stageErrors.questionStructure.length).toBeGreaterThan(0);
      expect(result.stageErrors.topicLinkage.length).toBeGreaterThan(0);
      expect(result.stageErrors.calibrationIds.length).toBeGreaterThan(0);
      // The flattened list must contain every stage's contribution, not just the first stage's.
      expect(result.errors).toEqual([
        ...result.stageErrors.sourceMetadata,
        ...result.stageErrors.questionStructure,
        ...result.stageErrors.topicLinkage,
        ...result.stageErrors.calibrationIds,
      ]);
      expect(result.errors.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('a fully valid draft has empty errors in every stage', () => {
    const result = runGeneratedQuestionPipeline(draft());
    expect(result.status).not.toBe('invalid');
  });
});

describe('11. the pipeline does not mutate the input draft', () => {
  it('leaves the draft byte-for-byte unchanged for a valid draft', () => {
    const d = draft();
    const snapshot = JSON.stringify(d);
    runGeneratedQuestionPipeline(d, new Set(['some-other-id']));
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('leaves the draft byte-for-byte unchanged for an invalid draft', () => {
    const d = draft({ id: '', provenance: provenance({ sourceAuthority: '' }) });
    const snapshot = JSON.stringify(d);
    runGeneratedQuestionPipeline(d);
    expect(JSON.stringify(d)).toBe(snapshot);
  });
});

describe('id collision (Stage 2, exercised through the pipeline)', () => {
  it('rejects when the draft id collides with a caller-supplied existing-id set', () => {
    const result = runGeneratedQuestionPipeline(draft({ id: 'pyq-1' }), new Set(['pyq-1']));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.questionStructure).toContain('id "pyq-1" collides with an existing question id.');
    }
  });
});
