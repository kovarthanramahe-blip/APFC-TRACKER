import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionCalibration, CalibrationDimensions } from './generatedQuestionCalibration';
import type { GeneratedQuestionAuthoringInput } from './generatedQuestionAuthoring';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import {
  CALIBRATION_ALIGNMENT_LEVELS,
  CALIBRATION_DIFFICULTY_LEVELS,
  verifyGeneratedQuestionId,
  verifyReferencePyqIdsExist,
  verifyCalibrationDimensions,
  verifyCalibrationRationale,
  verifyTopicAlignment,
  validateGeneratedQuestionCalibration,
  isCalibrationClaimingAuthenticity,
  attachCalibrationToAuthoringInput,
} from './generatedQuestionCalibration';
import { authoringInputToGeneratedQuestionDraft, authorGeneratedQuestion } from './generatedQuestionAuthoring';

const REAL_PYQ = PYQ_BANK[0];
const REAL_PYQ_ID = REAL_PYQ.id;
const REAL_PYQ_TOPIC_ID = REAL_PYQ.topicId;
const OTHER_TOPIC_ID = SYLLABUS.flatMap((s) => s.topics).find((t) => t.id !== REAL_PYQ_TOPIC_ID)!.id;

function dimensions(overrides: Partial<CalibrationDimensions> = {}): CalibrationDimensions {
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
    dimensions: dimensions(),
    rationale: 'Tests the same statutory wage-ceiling concept as the referenced PYQ, framed as a direct recall question with plausible numeric distractors of comparable difficulty.',
    ...overrides,
  };
}

function authoringInput(overrides: Partial<GeneratedQuestionAuthoringInput> = {}): GeneratedQuestionAuthoringInput {
  return {
    question: 'Under the recently revised notification, what is the new EPF wage ceiling?',
    options: [
      { id: 'gen-1-o0', text: '₹15,000' },
      { id: 'gen-1-o1', text: '₹21,000' },
    ],
    correctOptionId: 'gen-1-o1',
    explanation: 'The notification revised the statutory wage ceiling to ₹21,000.',
    subject: 'labourLaw',
    topicId: REAL_PYQ_TOPIC_ID,
    sourceAuthority: 'PIB',
    sourceTitle: 'PIB Press Release: EPFO Raises Wage Ceiling',
    sourceReference: 'https://pib.gov.in/PressReleasePage.aspx?PRID=123456',
    sourcePublishedAt: '2025-03-12',
    concept: REAL_PYQ_TOPIC_ID,
    verificationStatus: 'draft',
    ...overrides,
  };
}

describe('generatedQuestionId is required', () => {
  it('verifyGeneratedQuestionId rejects an empty id', () => {
    expect(verifyGeneratedQuestionId(calibration({ generatedQuestionId: '' }))).toContain('generatedQuestionId is required.');
  });

  it('verifyGeneratedQuestionId accepts a non-empty id', () => {
    expect(verifyGeneratedQuestionId(calibration())).toEqual([]);
  });
});

describe('1. valid calibration against real PYQ IDs', () => {
  it('produces zero errors for a fully well-formed calibration', () => {
    expect(validateGeneratedQuestionCalibration(calibration())).toEqual([]);
  });

  it('verifyReferencePyqIdsExist reports nothing for a real id', () => {
    expect(verifyReferencePyqIdsExist(calibration())).toEqual([]);
  });
});

describe('2. nonexistent PYQ ID rejected', () => {
  it('verifyReferencePyqIdsExist reports the unknown id', () => {
    const result = verifyReferencePyqIdsExist(calibration({ referencePyqIds: [REAL_PYQ_ID, 'pyq-does-not-exist'] }));
    expect(result).toContain('referencePyqIds references unknown PYQ id "pyq-does-not-exist".');
  });

  it('validateGeneratedQuestionCalibration surfaces the same failure', () => {
    const result = validateGeneratedQuestionCalibration(calibration({ referencePyqIds: ['bogus-id'] }));
    expect(result).toContain('referencePyqIds references unknown PYQ id "bogus-id".');
  });
});

describe('3. empty reference list rejected when calibration is declared', () => {
  it('rejects an empty referencePyqIds array', () => {
    const result = verifyReferencePyqIdsExist(calibration({ referencePyqIds: [] }));
    expect(result).toEqual(['referencePyqIds must contain at least one PYQ id when calibration is supplied.']);
  });
});

describe('4. valid calibration dimensions accepted', () => {
  it.each(CALIBRATION_ALIGNMENT_LEVELS)('accepts alignment level "%s" on every alignment dimension', (level) => {
    const result = verifyCalibrationDimensions(
      dimensions({ subjectTopicAlignment: level, conceptualDepth: level, questionFraming: level, distractorStyle: level }),
    );
    expect(result).toEqual([]);
  });

  it.each(CALIBRATION_DIFFICULTY_LEVELS)('accepts difficulty level "%s"', (level) => {
    expect(verifyCalibrationDimensions(dimensions({ difficulty: level }))).toEqual([]);
  });
});

describe('5. invalid calibration dimension rejected', () => {
  it('rejects an alignment dimension outside the allowed set', () => {
    const result = verifyCalibrationDimensions(dimensions({ conceptualDepth: 'identical' as CalibrationDimensions['conceptualDepth'] }));
    expect(result).toContain(`dimensions.conceptualDepth must be one of: ${CALIBRATION_ALIGNMENT_LEVELS.join(', ')}.`);
  });

  it('rejects a difficulty value outside the allowed set', () => {
    const result = verifyCalibrationDimensions(dimensions({ difficulty: 'much_harder' as CalibrationDimensions['difficulty'] }));
    expect(result).toContain(`dimensions.difficulty must be one of: ${CALIBRATION_DIFFICULTY_LEVELS.join(', ')}.`);
  });
});

describe('6. missing rationale rejected', () => {
  it('rejects an empty rationale', () => {
    expect(verifyCalibrationRationale(calibration({ rationale: '' }))).toContain('rationale is required when calibration is supplied.');
  });

  it('rejects a whitespace-only rationale', () => {
    expect(verifyCalibrationRationale(calibration({ rationale: '   ' }))).toContain('rationale is required when calibration is supplied.');
  });
});

describe('7. topic alignment validation', () => {
  it('requires a real topicId match when subjectTopicAlignment is "closely_aligned"', () => {
    const result = verifyTopicAlignment(OTHER_TOPIC_ID, calibration({ dimensions: dimensions({ subjectTopicAlignment: 'closely_aligned' }) }));
    expect(result).toEqual([
      `dimensions.subjectTopicAlignment is "closely_aligned" but referenced PYQ "${REAL_PYQ_ID}" has topicId "${REAL_PYQ_TOPIC_ID}", not "${OTHER_TOPIC_ID}".`,
    ]);
  });

  it('passes when the generated question topicId matches the referenced PYQ topicId', () => {
    const result = verifyTopicAlignment(REAL_PYQ_TOPIC_ID, calibration({ dimensions: dimensions({ subjectTopicAlignment: 'closely_aligned' }) }));
    expect(result).toEqual([]);
  });

  it('does not require a match when subjectTopicAlignment is "partially_aligned" or "loosely_aligned"', () => {
    const partial = verifyTopicAlignment(OTHER_TOPIC_ID, calibration({ dimensions: dimensions({ subjectTopicAlignment: 'partially_aligned' }) }));
    expect(partial).toEqual([]);
    const loose = verifyTopicAlignment(OTHER_TOPIC_ID, calibration({ dimensions: dimensions({ subjectTopicAlignment: 'loosely_aligned' }) }));
    expect(loose).toEqual([]);
  });

  it('skips ids that do not resolve in PYQ_BANK (existence failure belongs to verifyReferencePyqIdsExist)', () => {
    const result = verifyTopicAlignment(REAL_PYQ_TOPIC_ID, calibration({ referencePyqIds: ['bogus-id'], dimensions: dimensions({ subjectTopicAlignment: 'closely_aligned' }) }));
    expect(result).toEqual([]);
  });
});

describe('8. calibration metadata preserved exactly', () => {
  it('attachCalibrationToAuthoringInput carries referencePyqIds through unchanged', () => {
    const ids = [REAL_PYQ_ID];
    const input = authoringInput();
    const result = attachCalibrationToAuthoringInput(input, calibration({ referencePyqIds: ids }));
    expect(result.calibratedAgainstPyqIds).toEqual(ids);
  });

  it('preserves every other authoring input field exactly', () => {
    const input = authoringInput({ sourceAuthority: 'Ministry of Labour and Employment' });
    const result = attachCalibrationToAuthoringInput(input, calibration());
    expect(result.question).toBe(input.question);
    expect(result.sourceAuthority).toBe('Ministry of Labour and Employment');
    expect(result.topicId).toBe(input.topicId);
    expect(result.concept).toBe(input.concept);
  });
});

describe('9. attaching calibration does not mutate the authoring input', () => {
  it('leaves the original authoring input byte-for-byte unchanged', () => {
    const input = authoringInput();
    const snapshot = JSON.stringify(input);
    attachCalibrationToAuthoringInput(input, calibration());
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('leaves the calibration record itself unchanged', () => {
    const c = calibration();
    const snapshot = JSON.stringify(c);
    attachCalibrationToAuthoringInput(authoringInput(), c);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it('returns a new object rather than the same input reference', () => {
    const input = authoringInput();
    const result = attachCalibrationToAuthoringInput(input, calibration());
    expect(result).not.toBe(input);
  });
});

describe('10. generated question remains explicitly distinguishable from authentic PYQ', () => {
  it('isCalibrationClaimingAuthenticity is false for a properly evidence-based rationale', () => {
    expect(isCalibrationClaimingAuthenticity(calibration())).toBe(false);
  });

  it('isCalibrationClaimingAuthenticity is true if the rationale wrongly claims authenticity', () => {
    const c = calibration({ rationale: 'This is an actual PYQ from the 2019 paper.' });
    expect(isCalibrationClaimingAuthenticity(c)).toBe(true);
  });

  it('attaching calibration never changes provenance.kind away from "generated"', () => {
    const draft = authoringInputToGeneratedQuestionDraft(
      attachCalibrationToAuthoringInput(authoringInput(), calibration()),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(draft.provenance.kind).toBe('generated');
  });
});

describe('11. existing authoring/pipeline tests remain compatible', () => {
  it('authorGeneratedQuestion still works end-to-end with a calibration-attached input', () => {
    const input = attachCalibrationToAuthoringInput(authoringInput({ verificationStatus: 'verified' }), calibration());
    const result = authorGeneratedQuestion(input, 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('publishable');
    if (result.status === 'publishable') {
      expect(result.candidate.provenance.calibratedAgainstPyqIds).toEqual([REAL_PYQ_ID]);
    }
  });

  it('a plain (non-calibrated) authoring input still converts and validates as before', () => {
    const result = authorGeneratedQuestion(authoringInput(), 'gen-2', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });
});
