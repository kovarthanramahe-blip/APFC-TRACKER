import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../lib/store';
import { createRevisionQueue } from '../../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import { buildImportPreview, confirmImportedContent } from '../../lib/contentImport';
import { buildUpscCsePrelimsImportPreview } from '../../lib/upscCsePyqImport';
import { PYQ_BANK } from '../../data/pyq';
import { UPSC_CSE_PYQ_BANK } from '../../data/pyqUpscCse';

// This component has no rendering test here (no React Testing Library / DOM environment in this
// repo — see every other *.test.ts file for the established convention). lib/upscCsePyqImport.test.ts
// already exhaustively covers the pure DETECT/VALIDATE/PREVIEW pipeline; these tests exercise
// exactly the one thing that pipeline can't cover on its own — what components/upscCse/
// UpscCsePyqImportModal.tsx's own handleConfirm actually does against the real store: save the raw
// source as ImportedContent(contentType: 'pyq'), workspace-scoped to upsc_cse, regardless of how
// the structured preview turned out. A manual browser smoke check covers the actual on-screen
// pick/preview/cancel flow.

function fullReset() {
  useAppStore.setState({
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: {},
    completedTopics: {},
    notes: [],
    attempts: [],
    pyqAttempts: [],
    sessions: [],
    studyLog: {},
    starredQuestionIds: [],
    bookmarkedPyqIds: [],
    rewardUnlocks: {},
    studyPlan: null,
    studyPlanGeneratedAt: null,
    personalStudyPlanTasks: [],
    revisionQueue: createRevisionQueue(),
    importedContent: [],
    contentRelationships: [],
  });
}

const STRUCTURED_SOURCE = 'Year: 2022\nPaper: General Studies Paper I\n\nQ1. Sample?\nA) One\nB) Two\nAnswer: A\n';

describe('UPSC CSE PYQ Import Modal — confirm saves the raw source as ImportedContent', () => {
  beforeEach(fullReset);

  it('mirrors the modal\'s own handleConfirm: buildImportPreview + confirmImportedContent(contentType: "pyq") + addImportedContent, scoped to the active (upsc_cse) workspace', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const importPreview = buildImportPreview({ name: 'gs1-2022.md' }, { format: 'markdown', text: STRUCTURED_SOURCE });
    const saved = confirmImportedContent(importPreview, { workspaceId: 'upsc_cse', contentType: 'pyq', sourceNote: 'UPSC CSE Prelims PYQ source' });
    useAppStore.getState().addImportedContent(saved);

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.contentType).toBe('pyq');
    expect(stored.workspaceId).toBe('upsc_cse');
    expect(stored.rawContent).toBe(STRUCTURED_SOURCE);
    expect(stored.provenance.sourceNote).toBe('UPSC CSE Prelims PYQ source');
  });

  it('the raw source is preserved verbatim even when structured parsing found nothing at all', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const unstructuredText = 'Just some prose, not a question list.';
    const structuredPreview = buildUpscCsePrelimsImportPreview(unstructuredText, 'notes.txt');
    expect(structuredPreview.structured).toBe(false);

    // Confirm still saves the raw file — never discarded just because it couldn't be structured.
    const importPreview = buildImportPreview({ name: 'notes.txt' }, { format: 'text', text: unstructuredText });
    const saved = confirmImportedContent(importPreview, { workspaceId: 'upsc_cse', contentType: 'pyq' });
    useAppStore.getState().addImportedContent(saved);

    expect(useAppStore.getState().importedContent).toHaveLength(1);
    expect(useAppStore.getState().importedContent[0].rawContent).toBe(unstructuredText);
  });

  it('workspace isolation: the saved source never leaks into APFC or PhD Research', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const importPreview = buildImportPreview({ name: 'gs1-2022.md' }, { format: 'markdown', text: STRUCTURED_SOURCE });
    const saved = confirmImportedContent(importPreview, { workspaceId: 'upsc_cse', contentType: 'pyq' });
    useAppStore.getState().addImportedContent(saved);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().importedContent).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().importedContent).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().importedContent).toHaveLength(1);
  });
});

describe('UPSC CSE PYQ Import Modal — cancel means nothing is persisted', () => {
  beforeEach(fullReset);

  it('reading a file and building a structured preview never touches the store on its own — only an explicit confirm (addImportedContent) does', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    buildImportPreview({ name: 'gs1-2022.md' }, { format: 'markdown', text: STRUCTURED_SOURCE });
    buildUpscCsePrelimsImportPreview(STRUCTURED_SOURCE, 'gs1-2022.md');
    expect(useAppStore.getState().importedContent).toEqual([]);
  });
});

describe('UPSC CSE PYQ Import Modal — regression guarantees', () => {
  it('data/pyq.ts\'s PYQ_BANK (458 questions) is untouched', () => {
    expect(PYQ_BANK.length).toBe(458);
  });

  it('data/pyqUpscCse.ts\'s UPSC_CSE_PYQ_BANK remains empty', () => {
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });
});
