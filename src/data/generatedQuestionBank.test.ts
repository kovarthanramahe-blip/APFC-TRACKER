import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionDraft, GeneratedProvenance, GeneratedVerificationStatus } from '../lib/types';
import { SYLLABUS } from './syllabus';
import type { GeneratedQuestionQualityAssessment, QualityDimensionAssessments } from '../lib/generatedQuestionQuality';
import type { GeneratedQuestionReviewRecord, ReviewVerdict } from '../lib/generatedQuestionReview';
import { createWorkspaceItem, approveWorkspaceItem as workspaceApprove } from '../lib/generatedQuestionWorkspace';
import { approveWorkspaceItemWithReview } from '../lib/generatedQuestionReview';
import { APFC_GENERATED_QUESTION_DRAFTS } from '../lib/apfcGeneratedQuestionBatch';
import { GENERATED_QUESTION_BANK, selectApprovedGeneratedQuestions, selectApprovedGeneratedQuestionsFromWorkspaceItems } from './generatedQuestionBank';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;

function provenance(overrides: Partial<GeneratedProvenance> = {}): GeneratedProvenance {
  return {
    kind: 'generated',
    sourceAuthority: 'Source Authority',
    sourceTitle: 'Source Title',
    sourceReference: 'Source Reference',
    topicId: REAL_TOPIC_ID,
    verificationStatus: 'verified',
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function draft(overrides: Partial<GeneratedQuestionDraft> = {}): GeneratedQuestionDraft {
  return {
    id: 'gen-bank-1',
    subject: 'labourLaw',
    topicId: REAL_TOPIC_ID,
    question: 'Sample structural question text?',
    options: [
      { id: 'o0', text: 'Option A' },
      { id: 'o1', text: 'Option B' },
    ],
    correctOptionId: 'o0',
    explanation: 'Sample structural explanation text.',
    provenance: provenance(),
    ...overrides,
  };
}

function qualityDimensions(overrides: Partial<QualityDimensionAssessments> = {}): QualityDimensionAssessments {
  return {
    factualAccuracyProvenance: 'strong',
    syllabusTopicAlignment: 'strong',
    conceptualDepth: 'adequate',
    apfcPyqStyleFraming: 'adequate',
    optionDistractorQuality: 'adequate',
    difficulty: 'appropriate',
    explanationQuality: 'strong',
    duplicationAuthenticPyqSeparation: 'strong',
    ...overrides,
  };
}

function qualityAssessment(overrides: Partial<GeneratedQuestionQualityAssessment> = {}): GeneratedQuestionQualityAssessment {
  return {
    generatedQuestionId: 'gen-bank-1',
    dimensions: qualityDimensions(),
    verdict: 'acceptable',
    rationale: 'Structural quality rationale for testing.',
    ...overrides,
  };
}

function reviewRecord(overrides: Partial<GeneratedQuestionReviewRecord> = {}): GeneratedQuestionReviewRecord {
  return {
    generatedQuestionId: 'gen-bank-1',
    reviewer: 'Reviewer A',
    reviewedAt: '2026-02-01T00:00:00.000Z',
    verdict: 'approve',
    rationale: 'Reviewed and confirmed against the cited source.',
    qualityAssessment: qualityAssessment(),
    ...overrides,
  };
}

describe('2. an eligible, explicitly-approved candidate is selected', () => {
  it('selectApprovedGeneratedQuestions includes a fully eligible, explicitly approved candidate', () => {
    const result = selectApprovedGeneratedQuestions([{ draft: draft(), record: reviewRecord() }]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('gen-bank-1');
  });
});

describe('3. draft generated question cannot enter the pool', () => {
  it('excludes a candidate whose provenance.verificationStatus is "draft"', () => {
    const d = draft({ provenance: provenance({ verificationStatus: 'draft' }) });
    const result = selectApprovedGeneratedQuestions([{ draft: d, record: reviewRecord() }]);
    expect(result).toEqual([]);
  });
});

describe('4. unverified (retired) generated question cannot enter the pool', () => {
  it('excludes a candidate whose provenance.verificationStatus is "retired"', () => {
    const d = draft({ provenance: provenance({ verificationStatus: 'retired' }) });
    const result = selectApprovedGeneratedQuestions([{ draft: d, record: reviewRecord() }]);
    expect(result).toEqual([]);
  });
});

describe('5. rejected/revision generated question cannot enter the pool', () => {
  it('excludes a candidate whose review record verdict is "reject", even if the draft is otherwise eligible', () => {
    const result = selectApprovedGeneratedQuestions([{ draft: draft(), record: reviewRecord({ verdict: 'reject' as ReviewVerdict }) }]);
    expect(result).toEqual([]);
  });

  it('excludes a candidate whose review record verdict is "request_revision", even if the draft is otherwise eligible', () => {
    const result = selectApprovedGeneratedQuestions([{ draft: draft(), record: reviewRecord({ verdict: 'request_revision' as ReviewVerdict }) }]);
    expect(result).toEqual([]);
  });
});

describe('6. generated provenance remains distinct from authentic PYQ', () => {
  it('an approved draft still carries provenance.kind "generated", never "pyq"', () => {
    const result = selectApprovedGeneratedQuestions([{ draft: draft(), record: reviewRecord() }]);
    expect(result[0].provenance.kind).toBe('generated');
  });
});

describe('7. generated source metadata is preserved', () => {
  it('an approved draft keeps its exact source authority/title/reference', () => {
    const d = draft({ provenance: provenance({ sourceAuthority: 'Ministry X', sourceTitle: 'Notification Y', sourceReference: 'Ref Z' }) });
    const result = selectApprovedGeneratedQuestions([{ draft: d, record: reviewRecord() }]);
    expect(result[0].provenance.sourceAuthority).toBe('Ministry X');
    expect(result[0].provenance.sourceTitle).toBe('Notification Y');
    expect(result[0].provenance.sourceReference).toBe('Ref Z');
  });
});

describe('8. calibration metadata is preserved', () => {
  it('an approved draft keeps its exact calibratedAgainstPyqIds', () => {
    const ids = ['pyq-1', 'pyq-2'];
    const d = draft({ provenance: provenance({ calibratedAgainstPyqIds: ids }) });
    const result = selectApprovedGeneratedQuestions([{ draft: d, record: reviewRecord() }]);
    expect(result[0].provenance.calibratedAgainstPyqIds).toEqual(ids);
  });
});

describe('9. duplicate generated ID is rejected', () => {
  it('excludes a candidate whose id collides with an existingIds entry', () => {
    const result = selectApprovedGeneratedQuestions([{ draft: draft({ id: 'existing-id' }), record: reviewRecord({ generatedQuestionId: 'existing-id', qualityAssessment: qualityAssessment({ generatedQuestionId: 'existing-id' }) }) }], {
      existingIds: new Set(['existing-id']),
    });
    expect(result).toEqual([]);
  });
});

describe('selectApprovedGeneratedQuestionsFromWorkspaceItems', () => {
  it('includes only workspace items actually driven to "approved" via approveWorkspaceItemWithReview', () => {
    const item = createWorkspaceItem(
      {
        question: draft().question,
        options: draft().options,
        correctOptionId: draft().correctOptionId,
        explanation: draft().explanation,
        subject: draft().subject,
        topicId: REAL_TOPIC_ID,
        sourceAuthority: 'Source Authority',
        sourceTitle: 'Source Title',
        sourceReference: 'Source Reference',
        concept: REAL_TOPIC_ID,
        verificationStatus: 'verified' as GeneratedVerificationStatus,
      },
      'gen-bank-2',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );
    const { item: approvedItem } = approveWorkspaceItemWithReview(
      item,
      reviewRecord({ generatedQuestionId: 'gen-bank-2', qualityAssessment: qualityAssessment({ generatedQuestionId: 'gen-bank-2' }) }),
      '2026-02-01T00:00:00.000Z',
    );
    expect(approvedItem.status).toBe('approved');
    const pool = selectApprovedGeneratedQuestionsFromWorkspaceItems([approvedItem]);
    expect(pool.map((d) => d.id)).toEqual(['gen-bank-2']);
  });

  it('excludes a workspace item whose status never became "approved"', () => {
    const item = createWorkspaceItem(
      {
        question: draft().question,
        options: draft().options,
        correctOptionId: draft().correctOptionId,
        explanation: draft().explanation,
        subject: draft().subject,
        topicId: REAL_TOPIC_ID,
        sourceAuthority: 'Source Authority',
        sourceTitle: 'Source Title',
        sourceReference: 'Source Reference',
        concept: REAL_TOPIC_ID,
        verificationStatus: 'draft' as GeneratedVerificationStatus,
      },
      'gen-bank-3',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );
    expect(selectApprovedGeneratedQuestionsFromWorkspaceItems([item])).toEqual([]);
    // Stage 6D's own approveWorkspaceItem (the pipeline-only gate) is not enough on its own to
    // satisfy Stage 6M's stricter bar -- confirms this module's gate is the one that matters here.
    const draftOnlyApprove = workspaceApprove(item, '2026-02-01T00:00:00.000Z');
    expect(draftOnlyApprove.outcome).toBe('refused');
  });
});

describe('13. existing Stage 6A-6M tests remain compatible', () => {
  it('GENERATED_QUESTION_BANK starts empty', () => {
    expect(GENERATED_QUESTION_BANK).toEqual([]);
  });

  it('none of the Stage 6L 8 draft questions are present in GENERATED_QUESTION_BANK', () => {
    expect(APFC_GENERATED_QUESTION_DRAFTS).toHaveLength(8);
    const bankIds = new Set(GENERATED_QUESTION_BANK.map((d) => d.id));
    for (const stage6lDraft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(bankIds.has(stage6lDraft.id)).toBe(false);
    }
  });

  it('feeding the real Stage 6L drafts (still all "draft" status) through selectApprovedGeneratedQuestions yields nothing', () => {
    const candidates = APFC_GENERATED_QUESTION_DRAFTS.map((d) => ({
      draft: d,
      record: reviewRecord({ generatedQuestionId: d.id, qualityAssessment: qualityAssessment({ generatedQuestionId: d.id }) }),
    }));
    expect(selectApprovedGeneratedQuestions(candidates)).toEqual([]);
  });
});
