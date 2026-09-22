import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { confirmImportedContent, getImportedContentById, type ImportPreview } from '../lib/contentImport';
import { getIncomingRelationships } from '../lib/contentRelationships';

// This page has no rendering test here (no React Testing Library / DOM environment in this repo —
// see StudyPlan.test.ts and every other page test file for the established convention). These
// tests exercise exactly what pages/Notes.tsx's new LinkedResearchSection does: resolve a note's
// incoming relationships (research documents / bibliography records that link TO it) through the
// real store, and verify the store actions it calls (deleteContentRelationship) update both sides.
// Everything else about Notes.tsx (creating/editing/importing/pinning/deleting a note, subject/topic
// navigation) is unchanged by this stage and untested here — see the regression tests below for the
// one thing that matters: none of that existing behaviour is affected by relationships existing.

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

function addResearchDocument(title: string) {
  const preview: ImportPreview = { sourceFilename: `${title}.md`, originalFormat: 'markdown', suggestedContentType: 'research_document', title, content: `# ${title}` };
  const content = confirmImportedContent(preview, { workspaceId: 'phd_research', contentType: 'research_document' });
  useAppStore.getState().addImportedContent(content);
  return content;
}

function addBibliographyRecord(title: string) {
  const preview: ImportPreview = { sourceFilename: `${title}.md`, originalFormat: 'markdown', suggestedContentType: 'bibliography', title, content: `# ${title}` };
  const content = confirmImportedContent(preview, { workspaceId: 'phd_research', contentType: 'bibliography' });
  useAppStore.getState().addImportedContent(content);
  return content;
}

describe('Notes — Linked Research display (LinkedResearchSection logic)', () => {
  beforeEach(fullReset);

  it("a note's linked research resolves via incoming relationships (source = document/bibliography, target = note)", () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Reading Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    const doc = addResearchDocument('Chapter 1');

    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });

    const incoming = getIncomingRelationships(useAppStore.getState().contentRelationships, 'n1', 'note');
    expect(incoming).toHaveLength(1);
    const source = getImportedContentById(useAppStore.getState().importedContent, incoming[0].sourceId);
    expect(source?.title).toBe('Chapter 1');
    expect(source?.contentType).toBe('research_document');
  });

  it('shows both a linked research document and a linked bibliography record together', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    const doc = addResearchDocument('Doc');
    const bib = addBibliographyRecord('Source');

    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });
    useAppStore.getState().addContentRelationship({ source: { id: bib.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'supports' });

    const incoming = getIncomingRelationships(useAppStore.getState().contentRelationships, 'n1', 'note');
    expect(incoming).toHaveLength(2);
    const resolvedTypes = incoming
      .map((r) => getImportedContentById(useAppStore.getState().importedContent, r.sourceId)?.contentType)
      .sort();
    expect(resolvedTypes).toEqual(['bibliography', 'research_document']);
  });

  it('a note with no links resolves to an empty list, without throwing', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Unlinked Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    expect(() => getIncomingRelationships(useAppStore.getState().contentRelationships, 'n1', 'note')).not.toThrow();
    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, 'n1', 'note')).toEqual([]);
  });

  it('unlinking (deleteContentRelationship) removes the link from both sides', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    const doc = addResearchDocument('Doc');
    const result = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });
    if (result.status !== 'ok') throw new Error('expected ok');

    useAppStore.getState().deleteContentRelationship(result.relationship.id);

    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, 'n1', 'note')).toEqual([]);
  });

  it('workspace isolation: a note-link visible in phd_research is invisible after switching workspace', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    const doc = addResearchDocument('Doc');
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().contentRelationships).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, 'n1', 'note')).toHaveLength(1);
  });
});

describe('Notes — regression: existing Notes editing/import behaviour is unaffected', () => {
  beforeEach(fullReset);

  it('upsertNote/deleteNote/togglePinNote behave exactly as before, with relationships present', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'Original', createdAt: 'a', updatedAt: 'a', pinned: false });
    const doc = addResearchDocument('Doc');
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });

    useAppStore.getState().togglePinNote('n1');
    expect(useAppStore.getState().notes.find((n) => n.id === 'n1')?.pinned).toBe(true);

    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'Edited', createdAt: 'a', updatedAt: 'b', pinned: true });
    expect(useAppStore.getState().notes.find((n) => n.id === 'n1')?.content).toBe('Edited');
  });

  it('deleting a note that has a linked research document removes the note and cascades the relationship (see store.test.ts for full cascade coverage)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    const doc = addResearchDocument('Doc');
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });

    useAppStore.getState().deleteNote('n1');

    expect(useAppStore.getState().notes).toEqual([]);
    expect(useAppStore.getState().contentRelationships).toEqual([]);
    // The research document itself is untouched by deleting a note linked to it.
    expect(useAppStore.getState().importedContent.find((c) => c.id === doc.id)).toBeDefined();
  });

  it('a note in the APFC workspace (no research documents/bibliography exist there) is completely unaffected by this stage', () => {
    useAppStore.getState().upsertNote({ id: 'apfc-n1', subject: 'general', title: 'APFC Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    expect(useAppStore.getState().notes).toHaveLength(1);
    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, 'apfc-n1', 'note')).toEqual([]);
  });
});
