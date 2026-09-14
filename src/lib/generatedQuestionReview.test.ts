import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionDraft, GeneratedProvenance } from './types';
import type { GeneratedQuestionQualityAssessment, QualityDimensionAssessments } from './generatedQuestionQuality';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import { createWorkspaceItem } from './generatedQuestionWorkspace';
import { APFC_GENERATED_QUESTION_BATCH, APFC_GENERATED_QUESTION_DRAFTS } from './apfcGeneratedQuestionBatch';
import {
  isGeneratedQuestionEligibleForApproval,
  approveGeneratedQuestion,
  rejectGeneratedQuestion,
  requestRevisionForGeneratedQuestion,
  reviewGeneratedQuestion,
  approveWorkspaceItemWithReview,
  verifyReviewRecordIsWellFormed,
  type GeneratedQuestionReviewRecord,
  type ReviewVerdict,
} from './generatedQuestionReview';

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
    id: 'test-gen-1',
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
    generatedQuestionId: 'test-gen-1',
    dimensions: qualityDimensions(),
    verdict: 'acceptable',
    rationale: 'Structural quality rationale for testing.',
    ...overrides,
  };
}

function reviewRecord(overrides: Partial<GeneratedQuestionReviewRecord> = {}): GeneratedQuestionReviewRecord {
  return {
    generatedQuestionId: 'test-gen-1',
    reviewer: 'Reviewer A',
    reviewedAt: '2026-02-01T00:00:00.000Z',
    verdict: 'approve',
    rationale: 'Reviewed and confirmed against the cited source.',
    qualityAssessment: qualityAssessment(),
    ...overrides,
  };
}

describe('1. valid question with acceptable quality + verified status + explicit approval -> approved', () => {
  it('approves a fully eligible draft with a well-formed "approve" record', () => {
    const result = approveGeneratedQuestion(reviewRecord(), draft());
    expect(result.status).toBe('approved');
  });
});

describe('2. strong quality + verified -> still requires explicit approval', () => {
  it('is eligible, but is not approved unless the record itself says "approve"', () => {
    const d = draft();
    const qa = qualityAssessment({ verdict: 'strong' });
    expect(isGeneratedQuestionEligibleForApproval(d, qa).eligible).toBe(true);

    const notApproved = reviewGeneratedQuestion(reviewRecord({ verdict: 'request_revision', qualityAssessment: qa }), d);
    expect(notApproved.status).toBe('revision_requested');
  });

  it('being eligible never causes reviewGeneratedQuestion to silently approve on its own', () => {
    const d = draft();
    const qa = qualityAssessment({ verdict: 'strong' });
    const rejected = reviewGeneratedQuestion(reviewRecord({ verdict: 'reject', qualityAssessment: qa }), d);
    expect(rejected.status).toBe('rejected');
  });
});

describe('3. draft verification status -> cannot approve', () => {
  it('is not eligible when provenance.verificationStatus is "draft"', () => {
    const d = draft({ provenance: provenance({ verificationStatus: 'draft' }) });
    const eligibility = isGeneratedQuestionEligibleForApproval(d, qualityAssessment());
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons).toContain('verificationStatus must be "verified" or "published" to be eligible for approval.');
  });

  it('approveGeneratedQuestion refuses even with an explicit "approve" record', () => {
    const d = draft({ provenance: provenance({ verificationStatus: 'draft' }) });
    const result = approveGeneratedQuestion(reviewRecord(), d);
    expect(result.status).toBe('invalid');
  });
});

describe('4. retired verification status -> cannot approve', () => {
  it('is not eligible when provenance.verificationStatus is "retired"', () => {
    const d = draft({ provenance: provenance({ verificationStatus: 'retired' }) });
    const result = approveGeneratedQuestion(reviewRecord(), d);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.reasons).toContain('verificationStatus must be "verified" or "published" to be eligible for approval.');
    }
  });
});

describe('5. needs_revision quality -> cannot approve', () => {
  it('rejects approval when the quality verdict is "needs_revision"', () => {
    const qa = qualityAssessment({ verdict: 'needs_revision' });
    const result = approveGeneratedQuestion(reviewRecord({ qualityAssessment: qa }), draft());
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.reasons).toContain('qualityAssessment.verdict must be "acceptable" or "strong" to be eligible for approval (was "needs_revision").');
    }
  });
});

describe('6. missing reviewer -> cannot approve', () => {
  it('rejects a record with an empty reviewer', () => {
    const result = approveGeneratedQuestion(reviewRecord({ reviewer: '' }), draft());
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reasons).toContain('reviewer is required.');
  });
});

describe('7. missing review timestamp -> cannot approve', () => {
  it('rejects a record with an empty reviewedAt', () => {
    const result = approveGeneratedQuestion(reviewRecord({ reviewedAt: '' }), draft());
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reasons).toContain('reviewedAt is required.');
  });

  it('rejects a record with an invalid reviewedAt timestamp', () => {
    const result = approveGeneratedQuestion(reviewRecord({ reviewedAt: 'not-a-timestamp' }), draft());
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reasons).toContain('reviewedAt must be a valid timestamp.');
  });
});

describe('8. missing rationale -> cannot approve', () => {
  it('rejects a record with an empty rationale', () => {
    const result = approveGeneratedQuestion(reviewRecord({ rationale: '' }), draft());
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reasons).toContain('rationale is required.');
  });
});

describe('9. reject workflow', () => {
  it('rejectGeneratedQuestion returns "rejected" for a well-formed reject record', () => {
    const record = reviewRecord({ verdict: 'reject', rationale: 'Distractor B is not clearly wrong given the source.' });
    expect(rejectGeneratedQuestion(record).status).toBe('rejected');
  });

  it('rejection never checks draft eligibility -- even an eligible draft can be rejected', () => {
    const record = reviewRecord({ verdict: 'reject' });
    const result = reviewGeneratedQuestion(record, draft());
    expect(result.status).toBe('rejected');
  });

  it('a malformed reject record (missing rationale) is invalid, not rejected', () => {
    const record = reviewRecord({ verdict: 'reject', rationale: '' });
    expect(rejectGeneratedQuestion(record).status).toBe('invalid');
  });
});

describe('10. request-revision workflow', () => {
  it('requestRevisionForGeneratedQuestion returns "revision_requested" for a well-formed record', () => {
    const record = reviewRecord({ verdict: 'request_revision', rationale: 'Tighten the explanation wording.' });
    expect(requestRevisionForGeneratedQuestion(record).status).toBe('revision_requested');
  });

  it('a malformed request_revision record (missing reviewer) is invalid', () => {
    const record = reviewRecord({ verdict: 'request_revision', reviewer: '' });
    expect(requestRevisionForGeneratedQuestion(record).status).toBe('invalid');
  });
});

describe('11. metadata/question content remains unchanged', () => {
  it('approveGeneratedQuestion does not mutate the draft, the record, or the quality assessment', () => {
    const d = draft();
    const record = reviewRecord();
    const draftSnapshot = JSON.stringify(d);
    const recordSnapshot = JSON.stringify(record);
    approveGeneratedQuestion(record, d);
    expect(JSON.stringify(d)).toBe(draftSnapshot);
    expect(JSON.stringify(record)).toBe(recordSnapshot);
  });

  it('rejectGeneratedQuestion and requestRevisionForGeneratedQuestion do not mutate the record', () => {
    const rejectRecord = reviewRecord({ verdict: 'reject' });
    const revisionRecord = reviewRecord({ verdict: 'request_revision' });
    const rejectSnapshot = JSON.stringify(rejectRecord);
    const revisionSnapshot = JSON.stringify(revisionRecord);
    rejectGeneratedQuestion(rejectRecord);
    requestRevisionForGeneratedQuestion(revisionRecord);
    expect(JSON.stringify(rejectRecord)).toBe(rejectSnapshot);
    expect(JSON.stringify(revisionRecord)).toBe(revisionSnapshot);
  });

  it('isGeneratedQuestionEligibleForApproval does not mutate the draft or quality assessment', () => {
    const d = draft();
    const qa = qualityAssessment();
    const draftSnapshot = JSON.stringify(d);
    const qaSnapshot = JSON.stringify(qa);
    isGeneratedQuestionEligibleForApproval(d, qa);
    expect(JSON.stringify(d)).toBe(draftSnapshot);
    expect(JSON.stringify(qa)).toBe(qaSnapshot);
  });
});

describe('12. authenticity claim blocks approval', () => {
  it('rejects approval when the explanation claims to be an authentic PYQ', () => {
    const d = draft({ explanation: 'This is an actual PYQ from a past paper.' });
    const result = approveGeneratedQuestion(reviewRecord(), d);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.reasons).toContain('explanation must not claim this is an authentic PYQ.');
    }
  });

  it('rejects approval when the question text claims to be an authentic PYQ', () => {
    const d = draft({ question: 'This is a real past year question from APFC.' });
    const result = approveGeneratedQuestion(reviewRecord(), d);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.reasons).toContain('question text must not claim this is an authentic PYQ.');
    }
  });
});

describe('13. ID collision blocks approval', () => {
  it('rejects approval when the draft id collides with an existing question id', () => {
    const d = draft({ id: 'existing-id' });
    const record = reviewRecord({ generatedQuestionId: 'existing-id', qualityAssessment: qualityAssessment({ generatedQuestionId: 'existing-id' }) });
    const result = approveGeneratedQuestion(record, d, { existingIds: new Set(['existing-id']) });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.reasons).toContain('id "existing-id" collides with an existing question id.');
    }
  });
});

describe('14. existing 8 generated questions remain separate from QUESTION_BANK/PYQ_BANK', () => {
  it('none of the 8 Stage 6L generated question ids appear in PYQ_BANK or QUESTION_BANK', () => {
    const pyqIds = new Set(PYQ_BANK.map((p) => p.id));
    const questionIds = new Set(QUESTION_BANK.map((q) => q.id));
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      expect(pyqIds.has(entry.id)).toBe(false);
      expect(questionIds.has(entry.id)).toBe(false);
    }
  });

  it('the approval gate actually prevents premature publication: all 8 remain "draft" and are therefore ineligible', () => {
    expect(APFC_GENERATED_QUESTION_DRAFTS).toHaveLength(8);
    for (const generatedDraft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(generatedDraft.provenance.verificationStatus).toBe('draft');
      const entry = APFC_GENERATED_QUESTION_BATCH.find((e) => e.id === generatedDraft.id)!;
      const eligibility = isGeneratedQuestionEligibleForApproval(generatedDraft, entry.qualityAssessment);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reasons).toContain('verificationStatus must be "verified" or "published" to be eligible for approval.');
    }
  });

  it('even an explicit "approve" record cannot push any of the 8 real drafts to approved', () => {
    for (const generatedDraft of APFC_GENERATED_QUESTION_DRAFTS) {
      const entry = APFC_GENERATED_QUESTION_BATCH.find((e) => e.id === generatedDraft.id)!;
      const record = reviewRecord({ generatedQuestionId: generatedDraft.id, qualityAssessment: entry.qualityAssessment });
      const result = approveGeneratedQuestion(record, generatedDraft);
      expect(result.status).toBe('invalid');
    }
  });

  it('this test file made no change to the 8 Stage 6L drafts themselves', () => {
    for (const generatedDraft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(generatedDraft.provenance.verificationStatus).toBe('draft');
    }
  });
});

describe('15. existing Stage 6A-6L tests remain compatible', () => {
  it('generatedQuestionWorkspace.ts createWorkspaceItem/approveWorkspaceItemWithReview integration still works', () => {
    const input = {
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
      verificationStatus: 'verified' as const,
    };
    const item = createWorkspaceItem(input, 'test-gen-2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    const record = reviewRecord({
      generatedQuestionId: 'test-gen-2',
      qualityAssessment: qualityAssessment({ generatedQuestionId: 'test-gen-2' }),
    });
    const { outcome, item: updated } = approveWorkspaceItemWithReview(item, record, '2026-02-01T00:00:00.000Z');
    expect(outcome.status).toBe('approved');
    expect(updated.status).toBe('approved');
    expect(updated.reviewerNote).toBe(record.rationale);
  });

  it('approveWorkspaceItemWithReview leaves the workspace item unchanged when approval is refused', () => {
    const input = {
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
      verificationStatus: 'draft' as const,
    };
    const item = createWorkspaceItem(input, 'test-gen-3', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    const record = reviewRecord({
      generatedQuestionId: 'test-gen-3',
      qualityAssessment: qualityAssessment({ generatedQuestionId: 'test-gen-3' }),
    });
    const { outcome, item: updated } = approveWorkspaceItemWithReview(item, record, '2026-02-01T00:00:00.000Z');
    expect(outcome.status).toBe('invalid');
    expect(updated).toEqual(item);
  });

  it('verifyReviewRecordIsWellFormed is exported and usable standalone', () => {
    expect(verifyReviewRecordIsWellFormed(reviewRecord())).toEqual([]);
    expect(verifyReviewRecordIsWellFormed(reviewRecord({ verdict: 'bogus' as ReviewVerdict }))).not.toEqual([]);
  });
});
