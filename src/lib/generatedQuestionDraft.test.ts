import { describe, it, expect } from 'vitest';
import type { AuthoritativeSourceRecord, SourceConcept } from './generatedQuestionSource';
import type { GeneratedQuestionCalibration, CalibrationDimensions } from './generatedQuestionCalibration';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import {
  runGeneratedQuestionDraftWorkflow,
  type GeneratedQuestionDraftContent,
  type GeneratedQuestionDraftWorkflowInput,
} from './generatedQuestionDraft';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;
const OTHER_TOPIC_ID = SYLLABUS.flatMap((s) => s.topics).find((t) => t.id !== REAL_TOPIC_ID)!.id;
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

function concept(overrides: Partial<SourceConcept> = {}): SourceConcept {
  return {
    conceptId: 'concept-1',
    sourceId: 'src-1',
    topicId: REAL_TOPIC_ID,
    concept: 'Structural test concept',
    factualBasis: 'Structural test factual basis text.',
    ...overrides,
  };
}

function content(overrides: Partial<GeneratedQuestionDraftContent> = {}): GeneratedQuestionDraftContent {
  return {
    question: 'Sample structural question text?',
    options: [
      { id: 'o0', text: 'Option A' },
      { id: 'o1', text: 'Option B' },
    ],
    correctOptionId: 'o0',
    explanation: 'Sample structural explanation text.',
    subject: 'labourLaw',
    verificationStatus: 'draft',
    ...overrides,
  };
}

function calibrationDimensions(overrides: Partial<CalibrationDimensions> = {}): CalibrationDimensions {
  return {
    subjectTopicAlignment: 'partially_aligned',
    conceptualDepth: 'partially_aligned',
    questionFraming: 'partially_aligned',
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

function workflowInput(overrides: Partial<GeneratedQuestionDraftWorkflowInput> = {}): GeneratedQuestionDraftWorkflowInput {
  return {
    source: source(),
    concept: concept(),
    content: content(),
    ...overrides,
  };
}

describe('1. valid source + concept + authoring input -> valid generated draft', () => {
  it('returns status "validated"', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput(), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });
});

describe('2. source metadata preserved exactly', () => {
  it('carries authority/title/reference/publishedAt through onto draft.provenance', () => {
    const s = source({ authority: 'Ministry X', title: 'Notification Y', reference: 'Ref Z', publishedAt: '2024-06-15' });
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ source: s }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
    if (result.status === 'validated' || result.status === 'publishable') {
      expect(result.draft.provenance.sourceAuthority).toBe('Ministry X');
      expect(result.draft.provenance.sourceTitle).toBe('Notification Y');
      expect(result.draft.provenance.sourceReference).toBe('Ref Z');
      expect(result.draft.provenance.sourcePublishedAt).toBe('2024-06-15');
    }
  });
});

describe('3. concept factualBasis preserved/linked', () => {
  it('the result carries the exact SourceConcept, including factualBasis', () => {
    const c = concept({ factualBasis: 'A specific structural fact statement for linkage testing.' });
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ concept: c }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
    if (result.status === 'validated' || result.status === 'publishable') {
      expect(result.sourceConcept.factualBasis).toBe('A specific structural fact statement for linkage testing.');
      expect(result.sourceConcept).toEqual(c);
    }
  });
});

describe('4. concept topicId controls question topicId', () => {
  it('draft.topicId and draft.provenance.topicId both come from concept.topicId', () => {
    const c = concept({ topicId: REAL_TOPIC_ID });
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ concept: c }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
    if (result.status === 'validated' || result.status === 'publishable') {
      expect(result.draft.topicId).toBe(REAL_TOPIC_ID);
      expect(result.draft.provenance.topicId).toBe(REAL_TOPIC_ID);
    }
  });
});

describe('5. invalid source rejected', () => {
  it('rejects a source missing required fields', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ source: source({ authority: '' }) }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('authority is required.');
    }
  });
});

describe('6. invalid concept rejected', () => {
  it('rejects a concept missing required fields', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ concept: concept({ conceptId: '' }) }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('conceptId is required.');
    }
  });

  it('rejects a bogus concept topicId', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ concept: concept({ topicId: 'not-a-real-topic' }) }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('topicId "not-a-real-topic" does not match a known syllabus topic.');
    }
  });

  it('rejects a concept whose sourceId does not belong to the given source', () => {
    const result = runGeneratedQuestionDraftWorkflow(
      workflowInput({ source: source({ sourceId: 'src-1' }), concept: concept({ sourceId: 'src-other' }) }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('concept.sourceId "src-other" does not match source.sourceId "src-1".');
    }
  });
});

describe('7. invalid question structure rejected', () => {
  it('rejects a correctOptionId that matches no option', () => {
    const result = runGeneratedQuestionDraftWorkflow(
      workflowInput({ content: content({ correctOptionId: 'does-not-exist' }) }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('correctOptionId must match the id of one of the provided options.');
    }
  });

  it('rejects an id colliding with an existing question id', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput(), 'existing-id', '2026-01-01T00:00:00.000Z', {
      existingIds: new Set(['existing-id']),
    });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('id "existing-id" collides with an existing question id.');
    }
  });
});

describe('8. invalid calibration rejected when supplied', () => {
  it('rejects a calibration with a missing rationale', () => {
    const result = runGeneratedQuestionDraftWorkflow(
      workflowInput({ calibration: calibration({ rationale: '' }) }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('rationale is required when calibration is supplied.');
    }
  });

  it('rejects a calibration referencing an unknown PYQ id', () => {
    const result = runGeneratedQuestionDraftWorkflow(
      workflowInput({ calibration: calibration({ referencePyqIds: ['bogus-pyq-id'] }) }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('referencePyqIds references unknown PYQ id "bogus-pyq-id".');
    }
  });
});

describe('9. no calibration remains valid when omitted', () => {
  it('validates successfully with no calibration field at all', () => {
    const input = workflowInput();
    expect(input.calibration).toBeUndefined();
    const result = runGeneratedQuestionDraftWorkflow(input, 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });
});

describe('10. quality failure prevents publishability', () => {
  it('a verified draft with duplicate option text is invalid, not publishable', () => {
    const result = runGeneratedQuestionDraftWorkflow(
      workflowInput({
        content: content({
          verificationStatus: 'verified',
          options: [{ id: 'o0', text: 'Same Text' }, { id: 'o1', text: 'Same Text' }],
          correctOptionId: 'o0',
        }),
      }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('duplicate option text "Same Text".');
    }
  });

  it('a verified draft whose explanation claims authenticity is invalid, not publishable', () => {
    const result = runGeneratedQuestionDraftWorkflow(
      workflowInput({ content: content({ verificationStatus: 'verified', explanation: 'This is an actual PYQ from a past paper.' }) }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('explanation must not claim this is an authentic PYQ.');
    }
  });
});

describe('11. draft verification status does not become publishable automatically', () => {
  it('is "validated", not "publishable", when content.verificationStatus is "draft"', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ content: content({ verificationStatus: 'draft' }) }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });

  it('is "validated", not "publishable", when content.verificationStatus is "retired"', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ content: content({ verificationStatus: 'retired' }) }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });
});

describe('12. verified valid question can become publishable', () => {
  it('is "publishable" when content.verificationStatus is "verified"', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ content: content({ verificationStatus: 'verified' }) }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('publishable');
  });

  it('is "publishable" when content.verificationStatus is "published"', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ content: content({ verificationStatus: 'published' }) }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('publishable');
  });
});

describe('13. no mutation of source/concept/authoring input', () => {
  it('leaves source, concept, content, and calibration byte-for-byte unchanged', () => {
    const input = workflowInput({ calibration: calibration() });
    const snapshot = JSON.stringify(input);
    runGeneratedQuestionDraftWorkflow(input, 'gen-1', '2026-01-01T00:00:00.000Z', { existingIds: new Set(['other-id']) });
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('leaves the input unchanged even when validation fails', () => {
    const input = workflowInput({ source: source({ authority: '' }) });
    const snapshot = JSON.stringify(input);
    runGeneratedQuestionDraftWorkflow(input, 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('14. generated question remains explicitly distinguishable from authentic PYQ', () => {
  it('draft.provenance.kind is always "generated"', () => {
    const result = runGeneratedQuestionDraftWorkflow(workflowInput(), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
    if (result.status === 'validated' || result.status === 'publishable') {
      expect(result.draft.provenance.kind).toBe('generated');
    }
  });

  it('rejects a question whose own text claims to be an authentic PYQ', () => {
    const result = runGeneratedQuestionDraftWorkflow(
      workflowInput({ content: content({ question: 'This is a real past year question from APFC 2019.' }) }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('question text must not claim this is an authentic PYQ.');
    }
  });

  it('rejects a calibration rationale claiming authenticity', () => {
    const result = runGeneratedQuestionDraftWorkflow(
      workflowInput({ calibration: calibration({ rationale: 'This is an actual PYQ.' }) }),
      'gen-1',
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors).toContain('calibration rationale must not claim this is an authentic PYQ.');
    }
  });
});

describe('additional structural coverage', () => {
  it('a valid closely-aligned calibration matching the concept topic validates cleanly', () => {
    const c = concept({ topicId: REAL_TOPIC_ID });
    const cal = calibration({ dimensions: calibrationDimensions({ subjectTopicAlignment: 'partially_aligned' }) });
    const result = runGeneratedQuestionDraftWorkflow(workflowInput({ concept: c, calibration: cal }), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });

  it('OTHER_TOPIC_ID fixture is genuinely different from REAL_TOPIC_ID (sanity check)', () => {
    expect(OTHER_TOPIC_ID).not.toBe(REAL_TOPIC_ID);
  });
});
