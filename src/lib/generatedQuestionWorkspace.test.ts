import { describe, it, expect } from 'vitest';
import type { GeneratedQuestionAuthoringInput } from './generatedQuestionAuthoring';
import type { GeneratedQuestionDraft, GeneratedProvenance, PYQ } from './types';
import { SYLLABUS } from '../data/syllabus';
import {
  createWorkspaceItem,
  validateWorkspaceItem,
  approveWorkspaceItem,
  rejectWorkspaceItem,
  setWorkspaceReviewerNote,
  type GeneratedQuestionWorkspaceItem,
} from './generatedQuestionWorkspace';
import { runGeneratedQuestionPipeline } from './generatedQuestionPipeline';

const REAL_TOPIC_ID = SYLLABUS[0].topics[0].id;

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
    concept: REAL_TOPIC_ID,
    verificationStatus: 'draft',
    ...overrides,
  };
}

function item(overrides: Partial<GeneratedQuestionAuthoringInput> = {}, id = 'gen-1'): GeneratedQuestionWorkspaceItem {
  return createWorkspaceItem(authoringInput(overrides), id, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
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

describe('1. create draft workspace item', () => {
  it('creates a new item with status "draft" and matching created/updated timestamps', () => {
    const w = item();
    expect(w.status).toBe('draft');
    expect(w.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(w.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(w.reviewerNote).toBeUndefined();
    expect(w.draft.id).toBe('gen-1');
    expect(w.draft.provenance.kind).toBe('generated');
  });
});

describe('2. validation transition', () => {
  it('transitions a well-formed draft item to "validated"', () => {
    const w = item();
    const result = validateWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    expect(result.item.status).toBe('validated');
    expect(result.item.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(result.pipelineResult.status).toBe('validated');
  });

  it('leaves a structurally broken item at "draft" after revalidation', () => {
    const w = item({ sourceAuthority: '' });
    const result = validateWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    expect(result.item.status).toBe('draft');
    expect(result.pipelineResult.status).toBe('invalid');
  });
});

describe('3. invalid draft cannot become approved', () => {
  it('refuses approval for a structurally invalid item, leaving it unchanged', () => {
    const w = item({ sourceAuthority: '', sourceReference: '' });
    const result = approveWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    expect(result.outcome).toBe('refused');
    expect(result.item).toEqual(w);
    if (result.outcome === 'refused') {
      expect(result.pipelineResult.status).toBe('invalid');
    }
  });

  it('refuses approval for a structurally valid but merely "draft"-status source', () => {
    const w = item({ verificationStatus: 'draft' });
    const result = approveWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    expect(result.outcome).toBe('refused');
    if (result.outcome === 'refused') {
      expect(result.pipelineResult.status).toBe('validated');
    }
  });
});

describe('4. verified/published valid draft can become approved', () => {
  it('approves an item whose source verificationStatus is "verified"', () => {
    const w = item({ verificationStatus: 'verified' });
    const result = approveWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    expect(result.outcome).toBe('approved');
    if (result.outcome === 'approved') {
      expect(result.item.status).toBe('approved');
      expect(result.item.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    }
  });

  it('approves an item whose source verificationStatus is "published"', () => {
    const w = item({ verificationStatus: 'published' });
    const result = approveWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    expect(result.outcome).toBe('approved');
    if (result.outcome === 'approved') expect(result.item.status).toBe('approved');
  });
});

describe('5. retired source-backed question cannot become approved', () => {
  it('refuses approval when verificationStatus is "retired"', () => {
    const w = item({ verificationStatus: 'retired' });
    const result = approveWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    expect(result.outcome).toBe('refused');
    if (result.outcome === 'refused') {
      expect(result.pipelineResult.status).toBe('validated');
    }
  });
});

describe('6. rejection with reviewer reason', () => {
  it('sets status "rejected" and records the reason as the reviewer note', () => {
    const w = item();
    const rejected = rejectWorkspaceItem(w, 'Source reference is a paraphrase, not the primary notification.', '2026-01-03T00:00:00.000Z');
    expect(rejected.status).toBe('rejected');
    expect(rejected.reviewerNote).toBe('Source reference is a paraphrase, not the primary notification.');
    expect(rejected.updatedAt).toBe('2026-01-03T00:00:00.000Z');
  });
});

describe('7. reviewer note update', () => {
  it('updates only the reviewer note, leaving status unchanged', () => {
    const w = item();
    const noted = setWorkspaceReviewerNote(w, 'Looks good, double-check the wage figure.', '2026-01-03T00:00:00.000Z');
    expect(noted.reviewerNote).toBe('Looks good, double-check the wage figure.');
    expect(noted.status).toBe('draft');
    expect(noted.updatedAt).toBe('2026-01-03T00:00:00.000Z');
  });
});

describe('8. immutable/non-mutating operations', () => {
  it('createWorkspaceItem does not mutate the authoring input', () => {
    const input = authoringInput({ calibratedAgainstPyqIds: ['pyq-1'] });
    const snapshot = JSON.stringify(input);
    createWorkspaceItem(input, 'gen-2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('validateWorkspaceItem does not mutate the original item and returns a new object', () => {
    const w = item();
    const snapshot = JSON.stringify(w);
    const result = validateWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    expect(JSON.stringify(w)).toBe(snapshot);
    expect(result.item).not.toBe(w);
  });

  it('approveWorkspaceItem does not mutate the original item on approval or refusal', () => {
    const approvedSource = item({ verificationStatus: 'verified' });
    const approvedSnapshot = JSON.stringify(approvedSource);
    approveWorkspaceItem(approvedSource, '2026-01-02T00:00:00.000Z');
    expect(JSON.stringify(approvedSource)).toBe(approvedSnapshot);

    const refusedSource = item({ verificationStatus: 'draft' });
    const refusedSnapshot = JSON.stringify(refusedSource);
    approveWorkspaceItem(refusedSource, '2026-01-02T00:00:00.000Z');
    expect(JSON.stringify(refusedSource)).toBe(refusedSnapshot);
  });

  it('rejectWorkspaceItem and setWorkspaceReviewerNote do not mutate the original item', () => {
    const w = item();
    const snapshot = JSON.stringify(w);
    rejectWorkspaceItem(w, 'reason', '2026-01-03T00:00:00.000Z');
    setWorkspaceReviewerNote(w, 'note', '2026-01-03T00:00:00.000Z');
    expect(JSON.stringify(w)).toBe(snapshot);
  });
});

describe('9. source and calibration metadata preserved', () => {
  it('preserves full source metadata and calibration ids through create -> validate -> approve', () => {
    const ids = ['pyq-2023-4', 'pyq-2016-10'];
    const w = item({
      sourceAuthority: 'Ministry of Labour and Employment',
      sourceTitle: 'Gazette Notification S.O. 1234(E)',
      sourceReference: 'Gazette of India, Extraordinary, Part II, Section 3, Sub-section (i)',
      sourcePublishedAt: '2024-11-05',
      calibratedAgainstPyqIds: ids,
      verificationStatus: 'verified',
    });
    const validated = validateWorkspaceItem(w, '2026-01-02T00:00:00.000Z');
    const approved = approveWorkspaceItem(validated.item, '2026-01-03T00:00:00.000Z');
    expect(approved.outcome).toBe('approved');
    if (approved.outcome === 'approved') {
      const { provenance } = approved.item.draft;
      expect(provenance.sourceAuthority).toBe('Ministry of Labour and Employment');
      expect(provenance.sourceTitle).toBe('Gazette Notification S.O. 1234(E)');
      expect(provenance.sourceReference).toBe('Gazette of India, Extraordinary, Part II, Section 3, Sub-section (i)');
      expect(provenance.sourcePublishedAt).toBe('2024-11-05');
      expect(provenance.calibratedAgainstPyqIds).toEqual(ids);
    }
  });

  it('preserves metadata through rejection', () => {
    const w = item({ sourceAuthority: 'PIB', calibratedAgainstPyqIds: ['pyq-9'] });
    const rejected = rejectWorkspaceItem(w, 'not needed', '2026-01-03T00:00:00.000Z');
    expect(rejected.draft.provenance.sourceAuthority).toBe('PIB');
    expect(rejected.draft.provenance.calibratedAgainstPyqIds).toEqual(['pyq-9']);
  });
});

describe('10. existing PYQ/practice provenance cannot accidentally become a generated workspace item', () => {
  it('createWorkspaceItem always produces a draft whose provenance.kind is "generated"', () => {
    const w = item();
    expect(w.draft.provenance.kind).toBe('generated');
  });

  it('a workspace item wrapping a PYQ-shaped provenance is rejected by the pipeline, not silently accepted', () => {
    const pyqRecord = pyq();
    const impostorDraft = {
      id: pyqRecord.id,
      subject: pyqRecord.subject,
      topicId: pyqRecord.topicId,
      question: pyqRecord.question,
      options: pyqRecord.options,
      correctOptionId: pyqRecord.correctOptionId,
      explanation: pyqRecord.explanation,
      provenance: { kind: 'pyq', year: pyqRecord.year, verificationStatus: pyqRecord.verificationStatus } as unknown as GeneratedProvenance,
    } as GeneratedQuestionDraft;
    const result = runGeneratedQuestionPipeline(impostorDraft);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.stageErrors.sourceMetadata).toContain('provenance.kind must be "generated".');
    }
  });
});
