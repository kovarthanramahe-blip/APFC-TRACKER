import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionDraft, GeneratedProvenance } from './types';
import type { GeneratedQuestionCalibration, CalibrationDimensions } from './generatedQuestionCalibration';
import type { GeneratedQuestionAuthoringInput } from './generatedQuestionAuthoring';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import {
  QUALITY_RATINGS,
  DIFFICULTY_APPROPRIATENESS_LEVELS,
  QUALITY_VERDICTS,
  verifyQualityDimensions,
  verifyQualityVerdict,
  verifyExactlyOneCorrectOption,
  verifyNoDuplicateOptionText,
  verifyNoAuthenticityClaim,
  validateGeneratedQuestionForQuality,
  validateGeneratedQuestionQualityAssessment,
  assessGeneratedQuestionQuality,
  type QualityDimensionAssessments,
  type GeneratedQuestionQualityAssessment,
} from './generatedQuestionQuality';
import { authorGeneratedQuestion } from './generatedQuestionAuthoring';
import { runGeneratedQuestionPipeline } from './generatedQuestionPipeline';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;
const REAL_PYQ_ID = PYQ_BANK[0].id;

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
    id: 'gen-1',
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

function calibrationDimensions(overrides: Partial<CalibrationDimensions> = {}): CalibrationDimensions {
  return {
    subjectTopicAlignment: 'closely_aligned',
    conceptualDepth: 'partially_aligned',
    questionFraming: 'closely_aligned',
    distractorStyle: 'partially_aligned',
    difficulty: 'comparable',
    ...overrides,
  };
}

function calibration(overrides: Partial<GeneratedQuestionCalibration> = {}): GeneratedQuestionCalibration {
  return {
    generatedQuestionId: 'gen-1',
    referencePyqIds: [REAL_PYQ_ID],
    dimensions: calibrationDimensions(),
    rationale: 'Structural calibration rationale for testing.',
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

function assessment(overrides: Partial<GeneratedQuestionQualityAssessment> = {}): GeneratedQuestionQualityAssessment {
  return {
    generatedQuestionId: 'gen-1',
    dimensions: qualityDimensions(),
    verdict: 'acceptable',
    rationale: 'Structural review rationale for testing.',
    ...overrides,
  };
}

function authoringInput(overrides: Partial<GeneratedQuestionAuthoringInput> = {}): GeneratedQuestionAuthoringInput {
  return {
    question: 'Sample structural question text?',
    options: [
      { id: 'o0', text: 'Option A' },
      { id: 'o1', text: 'Option B' },
    ],
    correctOptionId: 'o0',
    explanation: 'Sample structural explanation text.',
    subject: 'labourLaw',
    topicId: REAL_TOPIC_ID,
    sourceAuthority: 'Source Authority',
    sourceTitle: 'Source Title',
    sourceReference: 'Source Reference',
    concept: REAL_TOPIC_ID,
    verificationStatus: 'draft',
    ...overrides,
  };
}

describe('1. valid high-quality assessment', () => {
  it('produces zero errors', () => {
    expect(validateGeneratedQuestionQualityAssessment(assessment(), draft())).toEqual([]);
  });
});

describe('2. missing source provenance rejected', () => {
  it('surfaces the pipeline sourceMetadata failure', () => {
    const result = validateGeneratedQuestionForQuality(draft({ provenance: provenance({ sourceAuthority: '' }) }));
    expect(result).toContain('provenance.sourceAuthority is required.');
  });
});

describe('3. invalid topic rejected', () => {
  it('surfaces the pipeline topicLinkage failure for a bogus draft.topicId', () => {
    const result = validateGeneratedQuestionForQuality(draft({ topicId: 'not-a-real-topic' }));
    expect(result).toContain('topicId "not-a-real-topic" does not match a known syllabus topic.');
  });
});

describe('4. invalid calibration rejected', () => {
  it('surfaces a missing calibration rationale', () => {
    const result = validateGeneratedQuestionForQuality(draft(), { calibration: calibration({ rationale: '' }) });
    expect(result).toContain('rationale is required when calibration is supplied.');
  });

  it('surfaces a calibration referencing an unknown PYQ id', () => {
    const result = validateGeneratedQuestionForQuality(draft(), { calibration: calibration({ referencePyqIds: ['bogus-pyq-id'] }) });
    expect(result).toContain('referencePyqIds references unknown PYQ id "bogus-pyq-id".');
  });

  it('a fully valid calibration adds no errors', () => {
    expect(validateGeneratedQuestionForQuality(draft(), { calibration: calibration() })).toEqual([]);
  });
});

describe('5. duplicate option text rejected', () => {
  it('verifyNoDuplicateOptionText rejects two options sharing text', () => {
    const result = verifyNoDuplicateOptionText(
      draft({ options: [{ id: 'o0', text: 'Same Text' }, { id: 'o1', text: 'Same Text' }] }),
    );
    expect(result).toEqual(['duplicate option text "Same Text".']);
  });

  it('is case/whitespace-insensitive', () => {
    const result = verifyNoDuplicateOptionText(
      draft({ options: [{ id: 'o0', text: 'Same Text' }, { id: 'o1', text: '  same text  ' }] }),
    );
    expect(result.length).toBe(1);
  });

  it('surfaces through the full quality validation', () => {
    const result = validateGeneratedQuestionForQuality(
      draft({ options: [{ id: 'o0', text: 'Same Text' }, { id: 'o1', text: 'Same Text' }], correctOptionId: 'o0' }),
    );
    expect(result).toContain('duplicate option text "Same Text".');
  });
});

describe('6. multiple/no correct answers rejected', () => {
  it('rejects when correctOptionId matches no option', () => {
    const result = verifyExactlyOneCorrectOption(draft({ correctOptionId: 'does-not-exist' }));
    expect(result).toEqual(['no option matches correctOptionId — a generated question must have exactly one correct answer.']);
  });

  it('rejects when correctOptionId matches more than one option (duplicate option ids)', () => {
    const result = verifyExactlyOneCorrectOption(
      draft({ options: [{ id: 'dup', text: 'Option A' }, { id: 'dup', text: 'Option B' }], correctOptionId: 'dup' }),
    );
    expect(result).toEqual(['multiple options match correctOptionId — a generated question must have exactly one correct answer.']);
  });

  it('accepts exactly one match', () => {
    expect(verifyExactlyOneCorrectOption(draft())).toEqual([]);
  });
});

describe('7. authenticity claim rejected', () => {
  it('rejects a question text claiming authenticity', () => {
    const result = verifyNoAuthenticityClaim(draft({ question: 'This is an actual PYQ from a past paper.' }));
    expect(result).toContain('question text must not claim this is an authentic PYQ.');
  });

  it('rejects an explanation claiming authenticity', () => {
    const result = verifyNoAuthenticityClaim(draft({ explanation: 'Note: this is a real past year question.' }));
    expect(result).toContain('explanation must not claim this is an authentic PYQ.');
  });

  it('rejects a calibration rationale claiming authenticity, via the reused Stage 6F guard', () => {
    const result = verifyNoAuthenticityClaim(draft(), calibration({ rationale: 'This is an actual PYQ.' }));
    expect(result).toContain('calibration rationale must not claim this is an authentic PYQ.');
  });

  it('a properly evidence-based draft and calibration produce no authenticity-claim errors', () => {
    expect(verifyNoAuthenticityClaim(draft(), calibration())).toEqual([]);
  });
});

describe('8. duplicate question ID rejected', () => {
  it('surfaces the pipeline id-collision failure via existingIds', () => {
    const result = validateGeneratedQuestionForQuality(draft({ id: 'existing-id' }), { existingIds: new Set(['existing-id']) });
    expect(result).toContain('id "existing-id" collides with an existing question id.');
  });
});

describe('9. all quality dimensions use allowed values', () => {
  it.each(QUALITY_RATINGS)('accepts rating "%s" on every rating-scale dimension', (rating) => {
    const result = verifyQualityDimensions(
      qualityDimensions({
        factualAccuracyProvenance: rating,
        syllabusTopicAlignment: rating,
        conceptualDepth: rating,
        apfcPyqStyleFraming: rating,
        optionDistractorQuality: rating,
        explanationQuality: rating,
        duplicationAuthenticPyqSeparation: rating,
      }),
    );
    expect(result).toEqual([]);
  });

  it.each(DIFFICULTY_APPROPRIATENESS_LEVELS)('accepts difficulty level "%s"', (level) => {
    expect(verifyQualityDimensions(qualityDimensions({ difficulty: level }))).toEqual([]);
  });

  it('rejects a rating dimension outside the allowed set', () => {
    const result = verifyQualityDimensions(qualityDimensions({ conceptualDepth: 'excellent' as QualityDimensionAssessments['conceptualDepth'] }));
    expect(result).toContain(`dimensions.conceptualDepth must be one of: ${QUALITY_RATINGS.join(', ')}.`);
  });

  it('rejects a difficulty value outside the allowed set', () => {
    const result = verifyQualityDimensions(qualityDimensions({ difficulty: 'way_too_hard' as QualityDimensionAssessments['difficulty'] }));
    expect(result).toContain(`dimensions.difficulty must be one of: ${DIFFICULTY_APPROPRIATENESS_LEVELS.join(', ')}.`);
  });
});

describe('10. reviewer verdict validation', () => {
  it.each(QUALITY_VERDICTS)('accepts the valid verdict "%s"', (verdict) => {
    expect(verifyQualityVerdict(assessment({ verdict }))).toEqual([]);
  });

  it('rejects a verdict outside the allowed set', () => {
    const result = verifyQualityVerdict(assessment({ verdict: 'maybe' as GeneratedQuestionQualityAssessment['verdict'] }));
    expect(result).toContain(`verdict must be one of: ${QUALITY_VERDICTS.join(', ')}.`);
  });
});

describe('11. assessment does not mutate the generated question', () => {
  it('leaves the draft byte-for-byte unchanged after a valid assessment', () => {
    const d = draft();
    const snapshot = JSON.stringify(d);
    validateGeneratedQuestionQualityAssessment(assessment(), d);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('leaves the draft byte-for-byte unchanged after an invalid assessment', () => {
    const d = draft({ topicId: 'bogus' });
    const snapshot = JSON.stringify(d);
    validateGeneratedQuestionQualityAssessment(assessment({ verdict: 'maybe' as GeneratedQuestionQualityAssessment['verdict'] }), d);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('leaves the assessment object itself unchanged', () => {
    const a = assessment();
    const snapshot = JSON.stringify(a);
    validateGeneratedQuestionQualityAssessment(a, draft());
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it('leaves the calibration record unchanged when supplied', () => {
    const c = calibration();
    const snapshot = JSON.stringify(c);
    validateGeneratedQuestionForQuality(draft(), { calibration: c });
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});

describe('12. existing Stage 6A-6F tests remain compatible', () => {
  it('runGeneratedQuestionPipeline still behaves as before for a plain draft', () => {
    expect(runGeneratedQuestionPipeline(draft()).status).toBe('validated');
  });

  it('authorGeneratedQuestion (Stage 6C) still works end-to-end', () => {
    const result = authorGeneratedQuestion(authoringInput(), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });

  it('assessGeneratedQuestionQuality composes authoring input conversion with quality validation', () => {
    const result = assessGeneratedQuestionQuality(authoringInput(), 'gen-1', '2026-01-01T00:00:00.000Z', assessment());
    expect(result).toEqual([]);
  });

  it('assessGeneratedQuestionQuality still surfaces a structural failure from the underlying authoring input', () => {
    const result = assessGeneratedQuestionQuality(
      authoringInput({ topicId: 'not-a-real-topic' }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
      assessment(),
    );
    expect(result).toContain('topicId "not-a-real-topic" does not match a known syllabus topic.');
  });
});
