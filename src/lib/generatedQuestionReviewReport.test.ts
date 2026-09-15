import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionDraft, GeneratedProvenance } from './types';
import type { GeneratedQuestionQualityAssessment, QualityDimensionAssessments } from './generatedQuestionQuality';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import { GENERATED_QUESTION_BANK } from '../data/generatedQuestionBank';
import { APFC_GENERATED_QUESTION_BATCH, APFC_GENERATED_QUESTION_DRAFTS } from './apfcGeneratedQuestionBatch';
import { APFC_RESEARCH_BATCH_SOURCES, APFC_RESEARCH_BATCH_CONCEPTS } from './apfcSourceResearchBatch';
import { buildGeneratedQuestionReviewReport, computeReviewFlags, REVIEW_FLAGS } from './generatedQuestionReviewReport';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;
const conceptsById = new Map(APFC_RESEARCH_BATCH_CONCEPTS.map((c) => [c.conceptId, c]));
const sourcesBySourceId = new Map(APFC_RESEARCH_BATCH_SOURCES.map((s) => [s.sourceId, s]));

function provenance(overrides: Partial<GeneratedProvenance> = {}): GeneratedProvenance {
  return {
    kind: 'generated',
    sourceAuthority: 'Source Authority',
    sourceTitle: 'Source Title',
    sourceReference: 'Source Reference',
    topicId: REAL_TOPIC_ID,
    verificationStatus: 'draft',
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
    explanation: 'Sample structural explanation text that is reasonably long.',
    provenance: provenance(),
    ...overrides,
  };
}

function qualityDimensions(overrides: Partial<QualityDimensionAssessments> = {}): QualityDimensionAssessments {
  return {
    factualAccuracyProvenance: 'strong',
    syllabusTopicAlignment: 'strong',
    conceptualDepth: 'strong',
    apfcPyqStyleFraming: 'strong',
    optionDistractorQuality: 'strong',
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
    verdict: 'strong',
    rationale: 'Structural quality rationale for testing.',
    ...overrides,
  };
}

describe('1. exactly 8 questions are reported', () => {
  it('the report has exactly 8 entries', () => {
    expect(buildGeneratedQuestionReviewReport()).toHaveLength(8);
  });

  it('the 8 report entries have exactly the 8 real Stage 6L generated question ids', () => {
    const report = buildGeneratedQuestionReviewReport();
    expect(report.map((e) => e.generatedQuestionId).sort()).toEqual(APFC_GENERATED_QUESTION_DRAFTS.map((d) => d.id).sort());
  });
});

describe('2. every question retains its original content exactly', () => {
  it('question/options/correctOptionId/explanation match the real Stage 6L draft exactly', () => {
    const report = buildGeneratedQuestionReviewReport();
    for (const entry of report) {
      const originalDraft = APFC_GENERATED_QUESTION_DRAFTS.find((d) => d.id === entry.generatedQuestionId)!;
      expect(entry.question).toBe(originalDraft.question);
      expect(entry.options).toEqual(originalDraft.options);
      expect(entry.correctOptionId).toBe(originalDraft.correctOptionId);
      expect(entry.explanation).toBe(originalDraft.explanation);
    }
  });
});

describe('3. every source reference is retained', () => {
  it('sourceAuthority/sourceTitle/sourceReference match the real research batch source exactly', () => {
    const report = buildGeneratedQuestionReviewReport();
    for (const entry of report) {
      const source = sourcesBySourceId.get(entry.sourceId)!;
      expect(entry.sourceAuthority).toBe(source.authority);
      expect(entry.sourceTitle).toBe(source.title);
      expect(entry.sourceReference).toBe(source.reference);
    }
  });
});

describe('4. every factualBasis is retained', () => {
  it('factualBasis matches the real research batch concept exactly', () => {
    const report = buildGeneratedQuestionReviewReport();
    for (const entry of report) {
      const concept = conceptsById.get(entry.conceptId)!;
      expect(entry.factualBasis).toBe(concept.factualBasis);
    }
  });
});

describe('5. every question remains verificationStatus draft', () => {
  it('every report entry reports verificationStatus "draft"', () => {
    const report = buildGeneratedQuestionReviewReport();
    for (const entry of report) {
      expect(entry.verificationStatus).toBe('draft');
    }
  });
});

describe('6. no question becomes approved/published', () => {
  it('approvalEligibility.eligible is false for every entry, citing the verificationStatus gate', () => {
    const report = buildGeneratedQuestionReviewReport();
    for (const entry of report) {
      expect(entry.approvalEligibility.eligible).toBe(false);
      expect(entry.approvalEligibility.reasons).toContain('verificationStatus must be "verified" or "published" to be eligible for approval.');
    }
  });

  it('GENERATED_QUESTION_BANK stays empty before and after generating the report', () => {
    expect(GENERATED_QUESTION_BANK).toEqual([]);
    buildGeneratedQuestionReviewReport();
    expect(GENERATED_QUESTION_BANK).toEqual([]);
  });
});

describe('7. report generation is deterministic', () => {
  it('two independent calls produce deep-equal reports', () => {
    const first = buildGeneratedQuestionReviewReport();
    const second = buildGeneratedQuestionReviewReport();
    expect(second).toEqual(first);
  });

  it('report entries are returned in the same order as APFC_GENERATED_QUESTION_BATCH', () => {
    const report = buildGeneratedQuestionReviewReport();
    expect(report.map((e) => e.generatedQuestionId)).toEqual(APFC_GENERATED_QUESTION_BATCH.map((e) => e.id));
  });
});

describe('8. no mutation of source batch or question batch', () => {
  it('leaves APFC_RESEARCH_BATCH_SOURCES/CONCEPTS and APFC_GENERATED_QUESTION_BATCH unchanged', () => {
    const sourcesSnapshot = JSON.stringify(APFC_RESEARCH_BATCH_SOURCES);
    const conceptsSnapshot = JSON.stringify(APFC_RESEARCH_BATCH_CONCEPTS);
    const batchSnapshot = JSON.stringify(APFC_GENERATED_QUESTION_BATCH);
    buildGeneratedQuestionReviewReport();
    expect(JSON.stringify(APFC_RESEARCH_BATCH_SOURCES)).toBe(sourcesSnapshot);
    expect(JSON.stringify(APFC_RESEARCH_BATCH_CONCEPTS)).toBe(conceptsSnapshot);
    expect(JSON.stringify(APFC_GENERATED_QUESTION_BATCH)).toBe(batchSnapshot);
  });
});

describe('9. existing Stage 6A-6N tests remain compatible', () => {
  it('PYQ_BANK and QUESTION_BANK counts are unaffected by generating the report', () => {
    const pyqCount = PYQ_BANK.length;
    const questionCount = QUESTION_BANK.length;
    buildGeneratedQuestionReviewReport();
    expect(PYQ_BANK.length).toBe(pyqCount);
    expect(QUESTION_BANK.length).toBe(questionCount);
  });
});

describe('computeReviewFlags (deterministic heuristics)', () => {
  it('returns ["none"] for a well-formed, "strong"-rated draft with a substantial factualBasis', () => {
    const flags = computeReviewFlags(draft(), qualityAssessment(), 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).toEqual(['none']);
  });

  it('flags trivial_recall when both conceptualDepth and apfcPyqStyleFraming are merely "adequate"', () => {
    const qa = qualityAssessment({ dimensions: qualityDimensions({ conceptualDepth: 'adequate', apfcPyqStyleFraming: 'adequate' }) });
    const flags = computeReviewFlags(draft(), qa, 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).toContain('trivial_recall');
  });

  it('flags weak_distractors when optionDistractorQuality is "needs_improvement"', () => {
    const qa = qualityAssessment({ dimensions: qualityDimensions({ optionDistractorQuality: 'needs_improvement' }) });
    const flags = computeReviewFlags(draft(), qa, 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).toContain('weak_distractors');
  });

  it('flags explanation_insufficient when explanationQuality is "needs_improvement"', () => {
    const qa = qualityAssessment({ dimensions: qualityDimensions({ explanationQuality: 'needs_improvement' }) });
    const flags = computeReviewFlags(draft(), qa, 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).toContain('explanation_insufficient');
  });

  it('flags difficulty_low when difficulty is "too_easy"', () => {
    const qa = qualityAssessment({ dimensions: qualityDimensions({ difficulty: 'too_easy' }) });
    const flags = computeReviewFlags(draft(), qa, 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).toContain('difficulty_low');
  });

  it('flags source_basis_too_narrow when factualBasis is short', () => {
    const flags = computeReviewFlags(draft(), qualityAssessment(), 'Too short.');
    expect(flags).toContain('source_basis_too_narrow');
  });

  it('flags wording_unusual when the question text has irregular whitespace', () => {
    const flags = computeReviewFlags(draft({ question: '  Double  spaced   question?  ' }), qualityAssessment(), 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).toContain('wording_unusual');
  });

  it('flags potentially_ambiguous when one option text is a prefix of another', () => {
    const d = draft({ options: [{ id: 'o0', text: 'Section 14B of the Act' }, { id: 'o1', text: 'Section 14B of the Act, as amended' }] });
    const flags = computeReviewFlags(d, qualityAssessment(), 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).toContain('potentially_ambiguous');
  });

  it('flags authenticity_risk when the draft text claims to be an authentic PYQ', () => {
    const d = draft({ explanation: 'This is an actual PYQ from a past paper.' });
    const flags = computeReviewFlags(d, qualityAssessment(), 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).toContain('authenticity_risk');
  });

  it('never returns "none" alongside a real flag', () => {
    const qa = qualityAssessment({ dimensions: qualityDimensions({ difficulty: 'too_easy' }) });
    const flags = computeReviewFlags(draft(), qa, 'A sufficiently long and substantial factual basis paragraph for testing purposes.');
    expect(flags).not.toContain('none');
  });

  it('every flag it can produce is a member of REVIEW_FLAGS', () => {
    const flags = computeReviewFlags(draft(), qualityAssessment(), 'x');
    for (const flag of flags) {
      expect(REVIEW_FLAGS).toContain(flag);
    }
  });
});

describe('real Stage 6L review flags (reported, not enforced)', () => {
  it('every real report entry has at least one flag and it is always "none" or "trivial_recall" for this batch', () => {
    const report = buildGeneratedQuestionReviewReport();
    for (const entry of report) {
      expect(entry.reviewFlags.length).toBeGreaterThan(0);
      for (const flag of entry.reviewFlags) {
        expect(['none', 'trivial_recall']).toContain(flag);
      }
    }
  });

  it('the two application-style questions (four-codes exclusion, VISHWAS dual-provenance) carry no flags', () => {
    const report = buildGeneratedQuestionReviewReport();
    const strongOnes = report.filter((e) => ['gen-four-codes-effective-2', 'gen-vishwas-2026-1'].includes(e.generatedQuestionId));
    expect(strongOnes).toHaveLength(2);
    for (const entry of strongOnes) {
      expect(entry.reviewFlags).toEqual(['none']);
    }
  });
});
