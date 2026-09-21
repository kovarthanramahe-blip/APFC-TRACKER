import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID, ACTIVE_WORKSPACES, WORKSPACES } from '../lib/workspace';
import { NAV_ITEMS } from '../components/layout/nav';
import {
  buildImportPreview,
  confirmImportedContent,
  selectImportedContentByType,
  type ImportPreview,
} from '../lib/contentImport';

// This page has no rendering test here (the project has no React Testing Library / DOM test
// environment — see StudyPlan.test.ts and every other *.test.ts file in this repo, which all test
// exported pure functions and/or the real Zustand store directly rather than rendering
// components). These tests instead exercise exactly what the PhD Research page does: the real
// store actions it calls (addImportedContent/deleteImportedContent), the same contentImport.ts
// pipeline functions it calls (buildImportPreview/confirmImportedContent), and the
// routing/workspace registration the page relies on being wired up correctly. A manual browser
// smoke check covers the actual on-screen file-picker/preview/confirm flow (see the task report).

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
  });
}

function researchPreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFilename: overrides.sourceFilename ?? 'chapter-1-notes.md',
    originalFormat: overrides.originalFormat ?? 'markdown',
    suggestedContentType: overrides.suggestedContentType ?? 'note',
    title: overrides.title ?? 'Chapter 1 Notes',
    content: overrides.content ?? '# Chapter 1\n\nLiterature review draft.',
  };
}

describe('PhD Research route/page registration', () => {
  it('phd_research is registered and active, so it is selectable in the workspace switcher', () => {
    const phd = WORKSPACES.find((w) => w.id === 'phd_research');
    expect(phd?.status).toBe('active');
    expect(ACTIVE_WORKSPACES.some((w) => w.id === 'phd_research')).toBe(true);
  });

  it('a "PhD Research" nav item points at /phd-research', () => {
    const item = NAV_ITEMS.find((n) => n.to === '/phd-research');
    expect(item).toBeDefined();
    expect(item?.label).toBe('PhD Research');
  });
});

describe('PhD Research page — import preview (no persistence)', () => {
  beforeEach(fullReset);

  it('buildImportPreview produces a preview without touching the store', () => {
    const preview = buildImportPreview({ name: 'thesis-outline.md' }, { format: 'markdown', text: '# Thesis Outline\n\nDraft.' });
    expect(preview.sourceFilename).toBe('thesis-outline.md');
    expect(preview.title).toBe('Thesis Outline');
    expect(useAppStore.getState().importedContent).toEqual([]);
  });

  it('extracting/previewing a file alone never adds anything to importedContent', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    buildImportPreview({ name: 'notes.md' }, { format: 'markdown', text: 'Some content' });
    expect(useAppStore.getState().importedContent).toEqual([]);
  });
});

describe('PhD Research page — explicit confirmation required before save', () => {
  beforeEach(fullReset);

  it('confirmImportedContent alone (without addImportedContent) does not persist anything', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    expect(useAppStore.getState().importedContent).toEqual([]);
  });

  it('the page always confirms with contentType research_document, never the preview\'s own suggestion', () => {
    // A filename like "chapter-1-notes.md" suggests 'note' (see suggestContentType), but the PhD
    // page's flow hardcodes 'research_document' regardless of that suggestion — mirroring exactly
    // what PhdResearch.tsx's handleConfirm does.
    const preview = researchPreview({ suggestedContentType: 'note' });
    const content = confirmImportedContent(preview, { workspaceId: 'phd_research', contentType: 'research_document' });
    expect(content.contentType).toBe('research_document');
  });
});

describe('PhD Research page — save, display, delete', () => {
  beforeEach(fullReset);

  it('confirming + addImportedContent persists a research_document into the active (phd_research) workspace', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const preview = researchPreview();
    const content = confirmImportedContent(preview, { workspaceId: 'phd_research', contentType: 'research_document', title: preview.title });
    useAppStore.getState().addImportedContent(content);

    const stored = useAppStore.getState().importedContent;
    expect(stored).toHaveLength(1);
    expect(stored[0].contentType).toBe('research_document');
    expect(stored[0].workspaceId).toBe('phd_research');
    expect(stored[0].title).toBe('Chapter 1 Notes');
    expect(stored[0].provenance.sourceFilename).toBe('chapter-1-notes.md');
  });

  it('a saved document is retrievable via selectImportedContentByType, exactly as the page displays it', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);

    const researchDocuments = selectImportedContentByType(useAppStore.getState().importedContent, 'research_document');
    expect(researchDocuments).toHaveLength(1);
    expect(researchDocuments[0].id).toBe(content.id);
  });

  it('deleteImportedContent removes the saved document', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);
    expect(useAppStore.getState().importedContent).toHaveLength(1);

    useAppStore.getState().deleteImportedContent(content.id);
    expect(useAppStore.getState().importedContent).toEqual([]);
  });
});

describe('PhD Research page — workspace isolation', () => {
  beforeEach(fullReset);

  it('a research document saved in phd_research is not visible after switching to apfc', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().importedContent).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().importedContent).toHaveLength(1);
  });

  it('a research document saved in phd_research is not visible in upsc_cse either', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().importedContent).toEqual([]);
  });
});

describe('PhD Research page — existing Notes import regression', () => {
  beforeEach(fullReset);

  it('saving a research_document does not add anything to notes', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);

    expect(useAppStore.getState().notes).toEqual([]);
  });

  it('an existing apfc note survives untouched after PhD Research content is imported elsewhere', () => {
    useAppStore.getState().upsertNote({
      id: 'n1',
      subject: 'general',
      title: 'APFC note',
      content: 'Original content',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      pinned: false,
    });

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().notes).toHaveLength(1);
    expect(useAppStore.getState().notes[0].title).toBe('APFC note');
  });
});
