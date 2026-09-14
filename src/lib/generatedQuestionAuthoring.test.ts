import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionAuthoringInput } from './generatedQuestionAuthoring';
import { SYLLABUS } from '../data/syllabus';
import { authoringInputToGeneratedQuestionDraft, authorGeneratedQuestion } from './generatedQuestionAuthoring';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;
const REAL_CONCEPT_ID = SYLLABUS[0].topics[0].id;

function authoringInput(overrides: Partial<GeneratedQuestionAuthoringInput> = {}): GeneratedQuestionAuthoringInput {
  return {
    question: 'Under the recently revised notification, what is the new EPF wage ceiling?',
    options: [
      { id: 'gen-1-o0', text: '₹15,000' },
      { id: 'gen-1-o1', text: '₹21,000' },
      { id: 'gen-1-o2', text: '₹25,000' },
      { id: 'gen-1-o3', text: '₹30,000' },
    ],
    correctOptionId: 'gen-1-o1',
    explanation: 'The notification revised the statutory wage ceiling to ₹21,000.',
    subject: 'labourLaw',
    topicId: REAL_TOPIC_ID,
    sourceAuthority: 'PIB',
    sourceTitle: 'PIB Press Release: EPFO Raises Wage Ceiling',
    sourceReference: 'https://pib.gov.in/PressReleasePage.aspx?PRID=123456',
    sourcePublishedAt: '2025-03-12',
    concept: REAL_CONCEPT_ID,
    verificationStatus: 'draft',
    ...overrides,
  };
}

describe('1. a complete authoring input converts correctly', () => {
  it('maps every base field onto the draft', () => {
    const input = authoringInput();
    const draft = authoringInputToGeneratedQuestionDraft(input, 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(draft.id).toBe('gen-1');
    expect(draft.subject).toBe(input.subject);
    expect(draft.topicId).toBe(input.topicId);
    expect(draft.question).toBe(input.question);
    expect(draft.options).toEqual(input.options);
    expect(draft.correctOptionId).toBe(input.correctOptionId);
    expect(draft.explanation).toBe(input.explanation);
    expect(draft.provenance.kind).toBe('generated');
    expect(draft.provenance.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('runs through the pipeline as "validated" when verificationStatus is draft', () => {
    const result = authorGeneratedQuestion(authoringInput(), 'gen-1', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });
});

describe('2. source metadata is preserved exactly', () => {
  it('carries sourceAuthority/sourceTitle/sourceReference/sourcePublishedAt through unchanged', () => {
    const input = authoringInput({
      sourceAuthority: 'Ministry of Labour and Employment',
      sourceTitle: 'Gazette Notification S.O. 1234(E)',
      sourceReference: 'Gazette of India, Extraordinary, Part II, Section 3, Sub-section (i)',
      sourcePublishedAt: '2024-11-05',
    });
    const draft = authoringInputToGeneratedQuestionDraft(input, 'gen-2', '2026-01-01T00:00:00.000Z');
    expect(draft.provenance.sourceAuthority).toBe(input.sourceAuthority);
    expect(draft.provenance.sourceTitle).toBe(input.sourceTitle);
    expect(draft.provenance.sourceReference).toBe(input.sourceReference);
    expect(draft.provenance.sourcePublishedAt).toBe(input.sourcePublishedAt);
  });

  it('leaves sourcePublishedAt undefined when the authoring input omits it', () => {
    const input = authoringInput({ sourcePublishedAt: undefined });
    const draft = authoringInputToGeneratedQuestionDraft(input, 'gen-3', '2026-01-01T00:00:00.000Z');
    expect(draft.provenance.sourcePublishedAt).toBeUndefined();
  });
});

describe('3. calibration ids are preserved', () => {
  it('passes calibratedAgainstPyqIds through unchanged', () => {
    const ids = ['pyq-2023-4', 'pyq-2016-10'];
    const input = authoringInput({ calibratedAgainstPyqIds: ids });
    const draft = authoringInputToGeneratedQuestionDraft(input, 'gen-4', '2026-01-01T00:00:00.000Z');
    expect(draft.provenance.calibratedAgainstPyqIds).toEqual(ids);
  });

  it('remains undefined (not fabricated) when the authoring input never supplied it', () => {
    const draft = authoringInputToGeneratedQuestionDraft(authoringInput(), 'gen-5', '2026-01-01T00:00:00.000Z');
    expect(draft.provenance.calibratedAgainstPyqIds).toBeUndefined();
  });
});

describe('4. conversion does not mutate input', () => {
  it('leaves the authoring input byte-for-byte unchanged', () => {
    const input = authoringInput({ calibratedAgainstPyqIds: ['pyq-1'] });
    const snapshot = JSON.stringify(input);
    authoringInputToGeneratedQuestionDraft(input, 'gen-6', '2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('leaves the authoring input unchanged when routed through authorGeneratedQuestion', () => {
    const input = authoringInput();
    const snapshot = JSON.stringify(input);
    authorGeneratedQuestion(input, 'gen-7', '2026-01-01T00:00:00.000Z', new Set(['other-id']));
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('5. invalid authoring input reaches the existing pipeline and is rejected', () => {
  it('rejects missing source metadata via the pipeline', () => {
    const input = authoringInput({ sourceAuthority: '', sourceReference: '' });
    const result = authorGeneratedQuestion(input, 'gen-8', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.sourceMetadata).toContain('provenance.sourceAuthority is required.');
      expect(result.stageErrors.sourceMetadata).toContain('provenance.sourceReference is required (a URL or an official document reference).');
    }
  });

  it('rejects a bogus topicId via the pipeline topic-linkage stage', () => {
    const input = authoringInput({ topicId: 'not-a-real-topic' });
    const result = authorGeneratedQuestion(input, 'gen-9', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.topicLinkage).toContain('topicId "not-a-real-topic" does not match a known syllabus topic.');
    }
  });

  it('rejects a bogus concept (mapped to provenance.topicId) via the pipeline topic-linkage stage', () => {
    const input = authoringInput({ concept: 'also-not-real' });
    const result = authorGeneratedQuestion(input, 'gen-10', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.topicLinkage).toContain('provenance.topicId "also-not-real" does not match a known syllabus topic.');
    }
  });

  it('rejects an id colliding with an existing question id', () => {
    const result = authorGeneratedQuestion(authoringInput(), 'pyq-1', '2026-01-01T00:00:00.000Z', new Set(['pyq-1']));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.questionStructure).toContain('id "pyq-1" collides with an existing question id.');
    }
  });
});

describe('6. draft/verified/published/retired status behavior remains correct', () => {
  it('draft is validated, not publishable', () => {
    const result = authorGeneratedQuestion(authoringInput({ verificationStatus: 'draft' }), 'gen-11', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });

  it('verified is publishable', () => {
    const result = authorGeneratedQuestion(authoringInput({ verificationStatus: 'verified' }), 'gen-12', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('publishable');
  });

  it('published is publishable', () => {
    const result = authorGeneratedQuestion(authoringInput({ verificationStatus: 'published' }), 'gen-13', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('publishable');
  });

  it('retired is validated, not publishable', () => {
    const result = authorGeneratedQuestion(authoringInput({ verificationStatus: 'retired' }), 'gen-14', '2026-01-01T00:00:00.000Z');
    expect(result.status).toBe('validated');
  });
});

describe('7. no invented/default source metadata is introduced', () => {
  it('does not fabricate a sourcePublishedAt when the authoring input has none', () => {
    const input = authoringInput({ sourcePublishedAt: undefined });
    const draft = authoringInputToGeneratedQuestionDraft(input, 'gen-15', '2026-01-01T00:00:00.000Z');
    expect('sourcePublishedAt' in draft.provenance ? draft.provenance.sourcePublishedAt : undefined).toBeUndefined();
  });

  it('does not fabricate calibratedAgainstPyqIds when the authoring input has none', () => {
    const draft = authoringInputToGeneratedQuestionDraft(authoringInput(), 'gen-16', '2026-01-01T00:00:00.000Z');
    expect('calibratedAgainstPyqIds' in draft.provenance ? draft.provenance.calibratedAgainstPyqIds : undefined).toBeUndefined();
  });

  it('never invents an id or generatedAt: the exact caller-supplied values are used verbatim', () => {
    const draft = authoringInputToGeneratedQuestionDraft(authoringInput(), 'exact-caller-id', 'exact-caller-timestamp');
    expect(draft.id).toBe('exact-caller-id');
    expect(draft.provenance.generatedAt).toBe('exact-caller-timestamp');
  });

  it('uses sourceAuthority/sourceTitle/sourceReference verbatim, never substituting a placeholder', () => {
    const input = authoringInput({
      sourceAuthority: 'Employees Provident Fund Organisation',
      sourceTitle: 'Circular No. 5/2025',
      sourceReference: 'EPFO/HO/2025/5',
    });
    const draft = authoringInputToGeneratedQuestionDraft(input, 'gen-17', '2026-01-01T00:00:00.000Z');
    expect(draft.provenance.sourceAuthority).toBe('Employees Provident Fund Organisation');
    expect(draft.provenance.sourceTitle).toBe('Circular No. 5/2025');
    expect(draft.provenance.sourceReference).toBe('EPFO/HO/2025/5');
  });
});
