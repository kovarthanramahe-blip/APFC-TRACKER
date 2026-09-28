import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { confirmImportedContent, getImportedContentById, type ImportPreview } from '../lib/contentImport';
import { getIncomingRelationships } from '../lib/contentRelationships';
import { countRelatedContent } from '../lib/relatedContentSummary';
import { importNoteFile } from '../lib/noteImport';
import { sha256Hex } from '../lib/fileHash';
import { findNoteDuplicates } from '../lib/importDuplicates';
import { uuid } from '../lib/utils';
import type { Note } from '../lib/types';
import { createFolder } from '../lib/folders';
import { queryNotes, collectNoteTags, searchNotes, filterNotesByArchived } from '../lib/noteOrganization';
import { extractWikiLinks, buildWikiLinkCandidatePool, filterWikiLinkCandidates } from '../lib/wikiLinks';
import { diffWikiLinkRelationships, getBacklinks } from '../lib/backlinks';

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

// Related Content Summary (this stage) — the note's LinkedResearchSection header shows
// countRelatedContent's `researchDocuments` and `bibliographyRecords` fields specifically (never
// `notes`, since a note does not summarise other notes on its own header), matching
// pages/Notes.tsx's own countRelatedContent(...) call.
describe('note header — related content summary segment composition', () => {
  beforeEach(fullReset);

  it('a note linked from one document and one bibliography record shows Documents:1 and Sources:1', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    const doc = addResearchDocument('Doc');
    const bib = addBibliographyRecord('Source');
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });
    useAppStore.getState().addContentRelationship({ source: { id: bib.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'supports' });

    const state = useAppStore.getState();
    const related = countRelatedContent(state.contentRelationships, 'n1', 'note', state.importedContent, state.notes);
    expect(related.researchDocuments).toBe(1);
    expect(related.bibliographyRecords).toBe(1);
  });

  it('a note with no relationships shows the empty-state, i.e. total 0', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Unlinked', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    const state = useAppStore.getState();
    const related = countRelatedContent(state.contentRelationships, 'n1', 'note', state.importedContent, state.notes);
    expect(related.total).toBe(0);
  });
});

// Phase 3A — pages/Notes.tsx's handleImportFile now also computes a sourceHash (lib/fileHash.ts)
// and runs findNoteDuplicates (lib/importDuplicates.ts) alongside the UNCHANGED importNoteFile
// call, storing sourceHash/sourceFileSize/sourceFilename on the saved Note. These tests exercise
// that exact sequence — same "exercise the pipeline calls the component makes" convention as every
// other page test file (no rendering).
function buildNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? uuid(),
    subject: 'general',
    title: 'Untitled',
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: false,
    ...overrides,
  };
}

describe('Notes — Phase 3A: file import unchanged, now with hash + duplicate detection', () => {
  beforeEach(fullReset);

  it('importNoteFile itself is completely unaffected — same exact result shape as before', async () => {
    const file = new File(['# Heading\n\nBody text.'], 'notes.md');
    const result = await importNoteFile(file);
    expect(result).toEqual({ status: 'ok', title: 'Heading', content: '# Heading\n\nBody text.' });
  });

  it('a freshly imported note is saved with sourceHash/sourceFileSize/sourceFilename set', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const file = new File(['Body of an imported note.'], 'fieldwork.md');
    const result = await importNoteFile(file);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const sourceHash = await sha256Hex(file);
    const newNote = buildNote({ title: result.title, content: result.content, sourceHash, sourceFileSize: file.size, sourceFilename: file.name });
    useAppStore.getState().upsertNote(newNote);

    const stored = useAppStore.getState().notes[0];
    expect(stored.sourceHash).toBe(sourceHash);
    expect(stored.sourceFileSize).toBe(file.size);
    expect(stored.sourceFilename).toBe('fieldwork.md');
  });

  it('a manually created note never carries sourceHash/sourceFileSize/sourceFilename', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote(buildNote({ title: 'Manual note', content: 'Typed by hand' }));
    const stored = useAppStore.getState().notes[0];
    expect(stored.sourceHash).toBeUndefined();
    expect(stored.sourceFileSize).toBeUndefined();
    expect(stored.sourceFilename).toBeUndefined();
  });

  it('re-importing the exact same file surfaces an exactMatch against the previously saved note', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const bytes = 'Identical note bytes every time.';
    const file1 = new File([bytes], 'again.md');
    const hash1 = await sha256Hex(file1);
    const savedNote = buildNote({ title: 'Again', content: bytes, sourceHash: hash1, sourceFileSize: file1.size, sourceFilename: 'again.md' });
    useAppStore.getState().upsertNote(savedNote);

    const file2 = new File([bytes], 'again.md');
    const hash2 = await sha256Hex(file2);
    const duplicates = findNoteDuplicates(useAppStore.getState().notes, 'phd_research', { sourceFilename: 'again.md', sourceHash: hash2, sourceFileSize: file2.size });
    expect(duplicates.exactMatch?.id).toBe(savedNote.id);
  });

  it('an exact duplicate never blocks saving a second note — nothing is auto-merged or overwritten', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const bytes = 'Duplicate-tolerant note content.';
    const hash = await sha256Hex(new File([bytes], 'dup.md'));
    useAppStore.getState().upsertNote(buildNote({ title: 'First', content: bytes, sourceHash: hash, sourceFileSize: 10, sourceFilename: 'dup.md' }));
    useAppStore.getState().upsertNote(buildNote({ title: 'Second', content: bytes, sourceHash: hash, sourceFileSize: 10, sourceFilename: 'dup.md' }));

    expect(useAppStore.getState().notes).toHaveLength(2);
  });

  it('an existing note in a different workspace is never reported as a duplicate', async () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const bytes = 'Cross-workspace note bytes.';
    const hash = await sha256Hex(new File([bytes], 'shared.md'));
    useAppStore.getState().upsertNote(buildNote({ title: 'Elsewhere', content: bytes, sourceHash: hash, sourceFileSize: 20, sourceFilename: 'shared.md' }));

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const duplicates = findNoteDuplicates(useAppStore.getState().notes, 'phd_research', { sourceFilename: 'shared.md', sourceHash: hash, sourceFileSize: 20 });
    expect(duplicates.exactMatch).toBeNull();
    expect(duplicates.possibleMatches).toEqual([]);
  });

  it('a malformed/unsupported file still reports the existing importNoteFile error, unaffected by hashing', async () => {
    const file = new File(['irrelevant'], 'photo.jpg');
    const result = await importNoteFile(file);
    expect(result.status).toBe('error');
  });
});

// Phase 3B — pages/Notes.tsx's OrganiseView orchestrates lib/folders.ts + lib/noteOrganization.ts
// + the store's addFolder/bulkUpdateNotes/deleteFolder actions exactly the way these tests exercise
// them (create folder -> file a note into it -> folder-scoped query; tag via bulk update -> tag-
// scoped query; archive -> excluded from the default view; delete folder -> contents promoted,
// never deleted). No rendering (see this file's own header) — this is the same "exercise the real
// calls the page makes" convention as every other describe block here.
describe('Notes — Phase 3B: Organise view orchestration (folders, tags, pin, archive)', () => {
  beforeEach(fullReset);

  it('creating a folder and filing a note into it makes the note findable by folder-scoped query', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const folder = createFolder('phd_research', 'Literature Review');
    useAppStore.getState().addFolder(folder);

    useAppStore.getState().upsertNote(buildNote({ id: 'n1', title: 'Source notes' }));
    useAppStore.getState().bulkUpdateNotes(['n1'], { folderId: folder.id });

    const inFolder = queryNotes(useAppStore.getState().notes, { folderId: folder.id });
    expect(inFolder.map((n) => n.id)).toEqual(['n1']);

    const atRoot = queryNotes(useAppStore.getState().notes, { folderId: null });
    expect(atRoot).toEqual([]);
  });

  it('adding a tag via bulk update makes the note findable by tag-scoped query and appear in collectNoteTags', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote(buildNote({ id: 'n1' }));
    useAppStore.getState().bulkUpdateNotes(['n1'], { addTags: ['Revision'] });

    expect(queryNotes(useAppStore.getState().notes, { tags: ['Revision'] }).map((n) => n.id)).toEqual(['n1']);
    expect(collectNoteTags(useAppStore.getState().notes)).toEqual(['Revision']);
  });

  it('archiving via bulk update excludes the note from the default query and includes it in the archived view', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote(buildNote({ id: 'n1' }));
    useAppStore.getState().bulkUpdateNotes(['n1'], { isArchived: true });

    expect(queryNotes(useAppStore.getState().notes, {}).map((n) => n.id)).toEqual([]);
    expect(queryNotes(useAppStore.getState().notes, { archived: true }).map((n) => n.id)).toEqual(['n1']);
  });

  it('deleting a folder re-files its note to the folder\'s own parent, never deleting the note', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const parent = createFolder('phd_research', 'UPSC');
    const child = createFolder('phd_research', 'GS1', parent.id);
    useAppStore.getState().addFolder(parent);
    useAppStore.getState().addFolder(child);
    useAppStore.getState().upsertNote(buildNote({ id: 'n1' }));
    useAppStore.getState().bulkUpdateNotes(['n1'], { folderId: child.id });

    useAppStore.getState().deleteFolder(child.id, 'moveToParent');

    expect(useAppStore.getState().notes).toHaveLength(1); // never deleted
    expect(useAppStore.getState().notes[0].folderId).toBe(parent.id);
    expect(useAppStore.getState().folders.map((f) => f.id)).toEqual([parent.id]);
  });

  it('bulk pin/unpin reuses the existing pinned flag and togglePinNote behaviour is unaffected', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote(buildNote({ id: 'n1', pinned: false }));
    useAppStore.getState().bulkUpdateNotes(['n1'], { pinned: true });
    expect(useAppStore.getState().notes[0].pinned).toBe(true);

    useAppStore.getState().togglePinNote('n1');
    expect(useAppStore.getState().notes[0].pinned).toBe(false);
  });

  it('workspace isolation: a folder and its notes in one workspace are invisible from another', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const folder = createFolder('upsc_cse', 'UPSC CSE Folder');
    useAppStore.getState().addFolder(folder);
    useAppStore.getState().upsertNote(buildNote({ id: 'n1', folderId: folder.id }));

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().folders).toEqual([]);
    expect(useAppStore.getState().notes).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().folders.map((f) => f.id)).toEqual([folder.id]);
    expect(useAppStore.getState().notes[0].folderId).toBe(folder.id);
  });
});

// Premium Knowledge Editor, Phase 5E/5F — exercises the exact sequence NoteEditor's handleSaveClick
// (pages/Notes.tsx) performs on Save: upsertNote, then re-read fresh post-save state, extract this
// note's wiki-links, diff them against existing 'links_to' relationships, and apply the diff via
// addContentRelationship/deleteContentRelationship. No DOM/rendering here (see this file's own
// header) — this is the orchestration itself, using the real store exactly like the component does.
describe('Notes — Phase 5: wiki-link save orchestration + backlinks', () => {
  beforeEach(fullReset);

  function saveNoteAndSyncWikiLinks(note: Note) {
    useAppStore.getState().upsertNote(note);
    const state = useAppStore.getState();
    const resolved = extractWikiLinks(note.content, { notes: state.notes, importedContent: state.importedContent, workspaceId: 'phd_research' });
    const diff = diffWikiLinkRelationships(note.id, 'note', resolved, state.contentRelationships, 'phd_research');
    for (const addition of diff.toAdd) {
      useAppStore.getState().addContentRelationship({ source: { id: note.id, type: 'note' }, target: { id: addition.targetId, type: addition.targetType }, type: 'links_to' });
    }
    for (const id of diff.toRemoveIds) {
      useAppStore.getState().deleteContentRelationship(id);
    }
  }

  beforeEach(() => useAppStore.getState().setActiveWorkspaceId('phd_research'));

  it('saving a note whose content contains a resolvable [[wiki-link]] creates a links_to relationship', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'target', title: 'Target Note' }));
    const source = buildNote({ id: 'source', title: 'Source Note', content: 'See [[Target Note]] for details.' });

    saveNoteAndSyncWikiLinks(source);

    const rel = useAppStore.getState().contentRelationships.find((r) => r.type === 'links_to');
    expect(rel).toMatchObject({ sourceId: 'source', sourceType: 'note', targetId: 'target', targetType: 'note' });
  });

  it('removing the wiki-link from the content and re-saving removes the relationship', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'target', title: 'Target Note' }));
    const source = buildNote({ id: 'source', title: 'Source Note', content: 'See [[Target Note]] for details.' });
    saveNoteAndSyncWikiLinks(source);
    expect(useAppStore.getState().contentRelationships).toHaveLength(1);

    saveNoteAndSyncWikiLinks({ ...source, content: 'No more link here.' });
    expect(useAppStore.getState().contentRelationships).toHaveLength(0);
  });

  it('re-saving with the same wiki-link unchanged never duplicates the relationship', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'target', title: 'Target Note' }));
    const source = buildNote({ id: 'source', title: 'Source Note', content: 'See [[Target Note]].' });
    saveNoteAndSyncWikiLinks(source);
    saveNoteAndSyncWikiLinks(source);
    expect(useAppStore.getState().contentRelationships).toHaveLength(1);
  });

  it('an ambiguous/unresolved wiki-link never creates a relationship', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'dup1', title: 'Same Title' }));
    useAppStore.getState().upsertNote(buildNote({ id: 'dup2', title: 'Same Title' }));
    const source = buildNote({ id: 'source', title: 'Source Note', content: 'See [[Same Title]] and [[Nowhere]].' });

    saveNoteAndSyncWikiLinks(source);

    expect(useAppStore.getState().contentRelationships).toHaveLength(0);
  });

  it('getBacklinks surfaces the resolved relationship with a snippet from the linking note', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'target', title: 'Target Note' }));
    const source = buildNote({ id: 'source', title: 'Source Note', content: 'Some context before [[Target Note]] and after.' });
    saveNoteAndSyncWikiLinks(source);

    const state = useAppStore.getState();
    const backlinks = getBacklinks('target', 'note', state.contentRelationships, state.notes, state.importedContent, 'phd_research');

    expect(backlinks).toHaveLength(1);
    expect(backlinks[0]).toMatchObject({ sourceId: 'source', sourceType: 'note', sourceTitle: 'Source Note' });
    expect(backlinks[0].snippet).toContain('Target Note');
  });

  it('a wiki-link to an ImportedContent item creates a note -> imported_content links_to relationship', () => {
    const doc = addResearchDocument('Research Doc');
    const source = buildNote({ id: 'source', title: 'Source Note', content: `See [[${doc.id}|${doc.title}]].` });

    saveNoteAndSyncWikiLinks(source);

    const rel = useAppStore.getState().contentRelationships.find((r) => r.type === 'links_to');
    expect(rel).toMatchObject({ sourceId: 'source', sourceType: 'note', targetId: doc.id, targetType: 'imported_content' });
  });

  it('deleting the linking note cascades away its links_to relationship, so getBacklinks sees nothing', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'target', title: 'Target Note' }));
    const source = buildNote({ id: 'source', title: 'Source Note', content: 'See [[Target Note]].' });
    saveNoteAndSyncWikiLinks(source);

    useAppStore.getState().deleteNote('source'); // store.ts's deleteNote already cascades relationships

    const state = useAppStore.getState();
    expect(state.contentRelationships).toEqual([]);
    const backlinks = getBacklinks('target', 'note', state.contentRelationships, state.notes, state.importedContent, 'phd_research');
    expect(backlinks).toEqual([]);
  });
});

// Phase 5L — exercises the exact composition Notes.tsx's own Browse-mode quick-search bar runs
// (filterNotesByArchived + searchNotes, in that order, preserving sortedNotes' own pinned-first
// order — see that page's own searchResults comment for why queryNotes itself isn't called here).
describe('Notes — Phase 5L: Browse quick-search bar orchestration', () => {
  beforeEach(fullReset);

  function browseSearch(query: string, folders: ReturnType<typeof createFolder>[] = []) {
    const sorted = [...useAppStore.getState().notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return searchNotes(filterNotesByArchived(sorted, false), query, folders);
  }

  it('matches by title', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'a', title: 'Modern History' }));
    useAppStore.getState().upsertNote(buildNote({ id: 'b', title: 'Ancient History' }));
    expect(browseSearch('modern').map((n) => n.id)).toEqual(['a']);
  });

  it('matches by content', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'a', title: 'Untitled', content: 'notes on the Coromandel coast' }));
    useAppStore.getState().upsertNote(buildNote({ id: 'b', title: 'Untitled', content: 'unrelated' }));
    expect(browseSearch('coromandel').map((n) => n.id)).toEqual(['a']);
  });

  it('matches by tag', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'a', tags: ['Revision'] }));
    useAppStore.getState().upsertNote(buildNote({ id: 'b', tags: ['Other'] }));
    expect(browseSearch('revision').map((n) => n.id)).toEqual(['a']);
  });

  it('excludes archived notes even when their title/content/tags match', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'a', title: 'Modern History', isArchived: true }));
    useAppStore.getState().upsertNote(buildNote({ id: 'b', title: 'Modern Economics' }));
    expect(browseSearch('modern').map((n) => n.id)).toEqual(['b']);
  });

  it('workspace isolation — a note in another workspace never appears', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().upsertNote(buildNote({ id: 'a', title: 'Modern History' }));
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(browseSearch('modern')).toEqual([]);
  });
});

// Phase 5L — the [[ autocomplete's own memoized-pool split (lib/wikiLinks.ts's
// buildWikiLinkCandidatePool/filterWikiLinkCandidates), exercised the way NoteEditor actually calls
// it: build the pool once from store state, then filter it per keystroke.
describe('Notes — Phase 5L: wiki-link candidate filtering (memoized pool)', () => {
  beforeEach(fullReset);
  beforeEach(() => useAppStore.getState().setActiveWorkspaceId('phd_research'));

  it('filters the precomputed pool by title substring, workspace-scoped, self excluded', () => {
    useAppStore.getState().upsertNote(buildNote({ id: 'editing', title: 'Currently Editing' }));
    useAppStore.getState().upsertNote(buildNote({ id: 'match', title: 'Coromandel Sources' }));
    useAppStore.getState().upsertNote(buildNote({ id: 'nomatch', title: 'Unrelated' }));
    const doc = addResearchDocument('Coromandel Coast Document');

    const state = useAppStore.getState();
    const pool = buildWikiLinkCandidatePool(state.notes, state.importedContent, 'phd_research', 'editing');
    const results = filterWikiLinkCandidates(pool, 'coromandel');

    expect(results.map((r) => r.id).sort()).toEqual(['match', doc.id].sort());
    expect(results.some((r) => r.id === 'editing')).toBe(false);
  });
});
