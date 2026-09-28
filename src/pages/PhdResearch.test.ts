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
import { runFileImport } from '../lib/importPipeline';
import {
  queryImportedContent,
  getContentTags,
  getContentCategory,
  parseTagsInput,
} from '../lib/importedContentRepository';
import { getIncomingRelationships, getOutgoingRelationships } from '../lib/contentRelationships';
import { countRelatedContent } from '../lib/relatedContentSummary';

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
    contentRelationships: [],
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

  it('a "PhD Dashboard" nav item points at /phd-dashboard (the dashboard tab; Research Documents is reachable from there via the tab switcher)', () => {
    const item = NAV_ITEMS.find((n) => n.to === '/phd-dashboard');
    expect(item).toBeDefined();
    expect(item?.label).toBe('PhD Dashboard');
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

// Repository organisation stage — tags/category live in ImportedContent.metadata (never as new
// top-level fields on ImportedContent itself — see lib/contentImport.ts's ImportedContentMetadata).
// These tests exercise exactly what PhdResearch.tsx's handleConfirm/handleSaveMetadata do: parse
// the tags text field with parseTagsInput, build a metadata object, and pass it through
// confirmImportedContent / updateImportedContent — the same two store-facing calls the page makes.
describe('PhD Research page — organisation metadata on import', () => {
  beforeEach(fullReset);

  it('tags and category entered at import time are preserved in the saved document', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const preview = researchPreview();
    const tags = parseTagsInput('fieldwork, chapter-1');
    const content = confirmImportedContent(preview, {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      metadata: { tags, category: 'Literature Review' },
    });
    useAppStore.getState().addImportedContent(content);

    const [stored] = useAppStore.getState().importedContent;
    expect(getContentTags(stored)).toEqual(['fieldwork', 'chapter-1']);
    expect(getContentCategory(stored)).toBe('Literature Review');
  });

  it('importing with no tags/category typed leaves metadata undefined, matching the pre-organisation shape', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);

    const [stored] = useAppStore.getState().importedContent;
    expect(stored.metadata).toBeUndefined();
    expect(getContentTags(stored)).toEqual([]);
    expect(getContentCategory(stored)).toBeUndefined();
  });
});

describe('PhD Research page — editing organisation metadata on an existing document', () => {
  beforeEach(fullReset);

  it('updateImportedContent replaces tags/category without touching title/rawContent/provenance', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      metadata: { tags: ['draft'], category: 'Uncategorised' },
    });
    useAppStore.getState().addImportedContent(content);

    useAppStore.getState().updateImportedContent(content.id, { metadata: { tags: parseTagsInput('final, chapter-1'), category: 'Fieldwork' } });

    const [updated] = useAppStore.getState().importedContent;
    expect(getContentTags(updated)).toEqual(['final', 'chapter-1']);
    expect(getContentCategory(updated)).toBe('Fieldwork');
    expect(updated.title).toBe(content.title);
    expect(updated.rawContent).toBe(content.rawContent);
    expect(updated.provenance).toEqual(content.provenance);
  });

  it('clearing tags/category in an edit produces an item with no metadata fields set', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      metadata: { tags: ['draft'], category: 'Fieldwork' },
    });
    useAppStore.getState().addImportedContent(content);

    useAppStore.getState().updateImportedContent(content.id, { metadata: undefined });

    const [updated] = useAppStore.getState().importedContent;
    expect(getContentTags(updated)).toEqual([]);
    expect(getContentCategory(updated)).toBeUndefined();
  });

  it('editing metadata cannot change the document id or workspaceId (runtime-enforced by the store)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);

    // @ts-expect-error — deliberately bypassing the TS-level Omit<...,'id'|'workspaceId'> to prove
    // the store's own runtime guard (not just the type system) still holds under organisation edits.
    useAppStore.getState().updateImportedContent(content.id, { id: 'hijacked', workspaceId: 'apfc', metadata: { tags: ['x'] } });

    const [updated] = useAppStore.getState().importedContent;
    expect(updated.id).toBe(content.id);
    expect(updated.workspaceId).toBe('phd_research');
    expect(getContentTags(updated)).toEqual(['x']);
  });
});

describe('PhD Research page — old imported records without metadata still work', () => {
  beforeEach(fullReset);

  it('a pre-organisation-stage record (no metadata field) displays and is searchable/filterable without throwing', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const legacyDoc = confirmImportedContent(researchPreview({ title: 'Old Literature Notes' }), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
    });
    useAppStore.getState().addImportedContent(legacyDoc);

    const stored = useAppStore.getState().importedContent;
    expect(stored[0].metadata).toBeUndefined();
    expect(() => queryImportedContent(stored, {})).not.toThrow();
    expect(queryImportedContent(stored, { search: 'literature' }).map((i) => i.id)).toEqual([legacyDoc.id]);
    expect(queryImportedContent(stored, { tags: ['anything'] })).toEqual([]);
    expect(queryImportedContent(stored, { category: 'anything' })).toEqual([]);
  });

  it('a legacy record can still be tagged/categorised via an edit', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const legacyDoc = confirmImportedContent(researchPreview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(legacyDoc);

    useAppStore.getState().updateImportedContent(legacyDoc.id, { metadata: { tags: ['newly-tagged'], category: 'Fieldwork' } });

    const [updated] = useAppStore.getState().importedContent;
    expect(getContentTags(updated)).toEqual(['newly-tagged']);
    expect(getContentCategory(updated)).toBe('Fieldwork');
  });
});

describe('PhD Research page — search/filter respects workspace isolation', () => {
  beforeEach(fullReset);

  it('querying only ever sees the active workspace\'s own importedContent array', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const phdDoc = confirmImportedContent(researchPreview({ title: 'Fieldwork Notes' }), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      metadata: { tags: ['fieldwork'] },
    });
    useAppStore.getState().addImportedContent(phdDoc);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(queryImportedContent(useAppStore.getState().importedContent, { search: 'fieldwork' })).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(queryImportedContent(useAppStore.getState().importedContent, { search: 'fieldwork' }).map((i) => i.id)).toEqual([phdDoc.id]);
  });
});

// Source <-> Research Document Linking — this page only DISPLAYS linked bibliography records and
// unlinks them; creating a link happens on the Working Bibliography page (see
// WorkingBibliography.test.ts's "bibliography -> research document linking" describe block).
describe('research document — linked sources / bibliography display + unlinking', () => {
  beforeEach(fullReset);

  function addBibliographyRecord(title: string) {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview({ title }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(content);
    return content;
  }

  it('a research document shows every bibliography record linked to it, with its relationship type', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(researchPreview({ title: 'Thesis Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const source = addBibliographyRecord('Key Reference');

    useAppStore.getState().addContentRelationship({ source: { id: source.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'supports' });

    const incoming = getIncomingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content');
    expect(incoming).toHaveLength(1);
    expect(incoming[0].sourceId).toBe(source.id);
    expect(incoming[0].type).toBe('supports');
  });

  it('a research document with no links shows none, without throwing', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(researchPreview({ title: 'Unlinked Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    expect(() => getIncomingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).not.toThrow();
    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).toEqual([]);
  });

  it('unlinking removes the relationship, updating both the document\'s incoming view and the source\'s outgoing view', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(researchPreview({ title: 'Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const source = addBibliographyRecord('Source');
    const result = useAppStore.getState().addContentRelationship({ source: { id: source.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });
    if (result.status !== 'ok') throw new Error('expected ok');

    useAppStore.getState().deleteContentRelationship(result.relationship.id);

    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).toEqual([]);
    expect(getOutgoingRelationships(useAppStore.getState().contentRelationships, source.id, 'imported_content')).toEqual([]);
  });

  it('workspace isolation: a link visible in phd_research disappears after switching workspace', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(researchPreview({ title: 'Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const source = addBibliographyRecord('Source');
    useAppStore.getState().addContentRelationship({ source: { id: source.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().contentRelationships).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).toHaveLength(1);
  });

  it('regression: existing research-document search/filter is unaffected by the presence of a linked bibliography record', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(researchPreview({ title: 'Fieldwork Notes' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const source = addBibliographyRecord('Source');
    useAppStore.getState().addContentRelationship({ source: { id: source.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });

    const researchDocuments = selectImportedContentByType(useAppStore.getState().importedContent, 'research_document');
    expect(researchDocuments.map((d) => d.id)).toEqual([doc.id]);
    expect(queryImportedContent(researchDocuments, { search: 'Fieldwork' }).map((d) => d.id)).toEqual([doc.id]);
  });
});

// Notes <-> Research Repository Linking — a research document can ALSO explicitly link to a Note
// (unlike bibliography <-> document linking, creation here happens directly on this page's own
// "Linked Notes" action, matching the task's own scoping — see components/phdResearch/LinkedNotesModal.tsx).
describe('research document — linked notes (create, display, unlink)', () => {
  beforeEach(fullReset);

  function addNote(id: string, title: string) {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id, subject: 'general', title, content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
  }

  it('a research document can link to an existing note (document = source, note = target)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(researchPreview({ title: 'Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    addNote('n1', 'Relevant Note');

    const result = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });
    expect(result.status).toBe('ok');

    const outgoing = getOutgoingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content').filter((r) => r.targetType === 'note');
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].targetId).toBe('n1');
  });

  it('linking to a note outside the active workspace is rejected', () => {
    useAppStore.getState().setActiveWorkspaceId('apfc');
    useAppStore.getState().upsertNote({ id: 'apfc-note', subject: 'general', title: 'APFC only', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().setActiveWorkspaceId('phd_research'); // archives the apfc note away
    const doc = confirmImportedContent(researchPreview({ title: 'Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);

    const result = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'apfc-note', type: 'note' }, type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
  });

  it('unlinking a note removes the relationship', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(researchPreview({ title: 'Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    addNote('n1', 'Note');
    const result = useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });
    if (result.status !== 'ok') throw new Error('expected ok');

    useAppStore.getState().deleteContentRelationship(result.relationship.id);
    expect(getOutgoingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content')).toEqual([]);
  });

  it('a note-link and a bibliography-link on the same document coexist without interference', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(researchPreview({ title: 'Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const bib = confirmImportedContent(researchPreview({ title: 'Source' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(bib);
    addNote('n1', 'Note');

    useAppStore.getState().addContentRelationship({ source: { id: bib.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });

    expect(getIncomingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content').filter((r) => r.sourceType === 'imported_content')).toHaveLength(1);
    expect(getOutgoingRelationships(useAppStore.getState().contentRelationships, doc.id, 'imported_content').filter((r) => r.targetType === 'note')).toHaveLength(1);
  });
});

// Related Content Summary (this stage) — the research document card shows countRelatedContent's
// `notes` and `bibliographyRecords` fields specifically (never `researchDocuments`, since a
// document does not summarise other documents on its own card). These tests pin down exactly that
// segment composition, matching pages/PhdResearch.tsx's own countRelatedContent(...) call.
describe('research document card — related content summary segment composition', () => {
  beforeEach(fullReset);

  function addDoc(title: string) {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview({ title }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);
    return content;
  }

  function addBibliographyRecord(title: string) {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview({ title }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(content);
    return content;
  }

  function addNote(id: string, title: string) {
    useAppStore.getState().upsertNote({ id, subject: 'general', title, content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
  }

  it('a document with a linked note and a linked bibliography source shows Notes:1 and Sources:1', () => {
    const doc = addDoc('Chapter');
    const source = addBibliographyRecord('Source');
    addNote('n1', 'Note');
    useAppStore.getState().addContentRelationship({ source: { id: source.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });

    const state = useAppStore.getState();
    const related = countRelatedContent(state.contentRelationships, doc.id, 'imported_content', state.importedContent, state.notes);
    expect(related.notes).toBe(1);
    expect(related.bibliographyRecords).toBe(1);
  });

  it('a document with no relationships shows the empty-state, i.e. total 0', () => {
    const doc = addDoc('Untouched');
    const state = useAppStore.getState();
    const related = countRelatedContent(state.contentRelationships, doc.id, 'imported_content', state.importedContent, state.notes);
    expect(related.total).toBe(0);
  });
});

// Phase 3A — pages/PhdResearch.tsx's file selection now runs through lib/importPipeline.ts's
// runFileImport (extractContentFromFile/buildImportPreview, unchanged, plus hashing + duplicate
// detection) instead of calling extractContentFromFile/buildImportPreview separately, mirroring
// components/repository/ImportToRepositoryModal.tsx's own Phase 2 wiring.
describe('PhD Research — Phase 3A: file selection runs through runFileImport', () => {
  beforeEach(fullReset);

  it('a supported file still produces an identical preview to the pre-Phase-3A extract+preview calls', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const outcome = await runFileImport(new File(['# Chapter\n\nBody text.'], 'chapter.md'), useAppStore.getState().importedContent, 'phd_research');
    expect(outcome.status).toBe('ok');
    expect(outcome.preview?.content).toBe('# Chapter\n\nBody text.');
    expect(outcome.preview?.sourceFilename).toBe('chapter.md');
  });

  it('an unsupported file still produces the same user-facing error as before', async () => {
    const outcome = await runFileImport(new File(['irrelevant'], 'photo.jpg'), [], 'phd_research');
    expect(outcome.status).toBe('error');
    expect(outcome.error).toMatch(/Unsupported file type/i);
  });

  it('confirming stamps provenance.sourceHash/sourceFileSize exactly as runFileImport computed them', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const file = new File(['Fieldwork observations.'], 'fieldwork.md');
    const outcome = await runFileImport(file, useAppStore.getState().importedContent, 'phd_research');
    expect(outcome.status).toBe('ok');

    const saved = confirmImportedContent(outcome.preview!, {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: outcome.sourceHash,
      sourceFileSize: file.size,
    });
    useAppStore.getState().addImportedContent(saved);

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.provenance.sourceHash).toBe(outcome.sourceHash);
    expect(stored.provenance.sourceFileSize).toBe(file.size);
  });

  it('re-importing the exact same file surfaces an exactMatch against the previously saved document', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const bytes = 'Identical chapter bytes.';
    const first = await runFileImport(new File([bytes], 'chapter.md'), useAppStore.getState().importedContent, 'phd_research');
    const saved = confirmImportedContent(first.preview!, {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: first.sourceHash,
      sourceFileSize: first.size,
    });
    useAppStore.getState().addImportedContent(saved);

    const second = await runFileImport(new File([bytes], 'chapter.md'), useAppStore.getState().importedContent, 'phd_research');
    expect(second.duplicates?.exactMatch?.id).toBe(saved.id);
  });

  it('an exact duplicate never blocks saving a second copy — nothing is auto-overwritten', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const bytes = 'Duplicate-tolerant chapter.';
    const first = await runFileImport(new File([bytes], 'again.md'), useAppStore.getState().importedContent, 'phd_research');
    const firstSaved = confirmImportedContent(first.preview!, {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: first.sourceHash,
      sourceFileSize: first.size,
    });
    useAppStore.getState().addImportedContent(firstSaved);

    const second = await runFileImport(new File([bytes], 'again.md'), useAppStore.getState().importedContent, 'phd_research');
    const secondSaved = confirmImportedContent(second.preview!, {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: second.sourceHash,
      sourceFileSize: second.size,
    });
    useAppStore.getState().addImportedContent(secondSaved);

    expect(useAppStore.getState().importedContent).toHaveLength(2);
  });

  it('an existing document in a different workspace is never reported as a duplicate', async () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const bytes = 'Cross-workspace bytes.';
    const first = await runFileImport(new File([bytes], 'shared.md'), useAppStore.getState().importedContent, 'upsc_cse');
    const saved = confirmImportedContent(first.preview!, {
      workspaceId: 'upsc_cse',
      contentType: 'note',
      sourceHash: first.sourceHash,
      sourceFileSize: first.size,
    });
    useAppStore.getState().addImportedContent(saved);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const second = await runFileImport(new File([bytes], 'shared.md'), useAppStore.getState().importedContent, 'phd_research');
    expect(second.duplicates?.exactMatch).toBeNull();
    expect(second.duplicates?.possibleMatches).toEqual([]);
  });
});

// Phase 4C — pages/PhdResearch.tsx now supports folder/pin/archive organisation for research
// documents, plus bulk actions and folder/pinned/archived filtering via queryImportedContent.
describe('PhD Research — Phase 4C: organisation (folder/pin/archive/bulk)', () => {
  beforeEach(fullReset);

  function addDoc(title: string) {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const content = confirmImportedContent(researchPreview({ title }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(content);
    return content;
  }

  it('pin/archive toggle mirrors the page\'s own single-item action', () => {
    const doc = addDoc('Chapter One');
    useAppStore.getState().bulkUpdateImportedContent([doc.id], { isPinned: true });
    expect(useAppStore.getState().importedContent[0].metadata?.isPinned).toBe(true);

    useAppStore.getState().bulkUpdateImportedContent([doc.id], { isArchived: true });
    expect(useAppStore.getState().importedContent[0].metadata?.isArchived).toBe(true);
  });

  it('folder-filtering via queryImportedContent finds exactly the documents filed there', () => {
    const inFolder = addDoc('In Folder');
    const elsewhere = addDoc('Elsewhere');
    useAppStore.getState().bulkUpdateImportedContent([inFolder.id], { folderId: 'f1' });

    const results = queryImportedContent(useAppStore.getState().importedContent, { folderId: 'f1' });
    expect(results.map((r) => r.id)).toEqual([inFolder.id]);
    expect(results.map((r) => r.id)).not.toContain(elsewhere.id);
  });

  it('archived documents are excluded from the default query and included in the archived view', () => {
    const doc = addDoc('Archived Doc');
    useAppStore.getState().bulkUpdateImportedContent([doc.id], { isArchived: true });

    expect(queryImportedContent(useAppStore.getState().importedContent, {})).toEqual([]);
    expect(queryImportedContent(useAppStore.getState().importedContent, { archived: true }).map((r) => r.id)).toEqual([doc.id]);
  });

  it('bulk actions apply to multiple documents in one call, never touching unselected ones', () => {
    const a = addDoc('A');
    const b = addDoc('B');
    const c = addDoc('C');
    useAppStore.getState().bulkUpdateImportedContent([a.id, b.id], { addTags: ['Revision'] });

    const state = useAppStore.getState();
    expect(state.importedContent.find((d) => d.id === a.id)?.metadata?.tags).toEqual(['Revision']);
    expect(state.importedContent.find((d) => d.id === b.id)?.metadata?.tags).toEqual(['Revision']);
    expect(state.importedContent.find((d) => d.id === c.id)?.metadata?.tags).toBeUndefined();
  });

  it('editing metadata (tags/category) via handleSaveMetadata\'s merge logic preserves folder/pin/archive', () => {
    const doc = addDoc('Doc');
    useAppStore.getState().bulkUpdateImportedContent([doc.id], { folderId: 'f1', isPinned: true });

    // Mirrors pages/PhdResearch.tsx's handleSaveMetadata exactly: merge onto existing metadata,
    // only touching tags/category.
    const editing = useAppStore.getState().importedContent[0];
    const metadata = { ...editing.metadata };
    metadata.tags = ['NewTag'];
    useAppStore.getState().updateImportedContent(doc.id, { metadata });

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.metadata?.tags).toEqual(['NewTag']);
    expect(stored.metadata?.folderId).toBe('f1');
    expect(stored.metadata?.isPinned).toBe(true);
  });

  it('workspace isolation: a document\'s folder/archive state is invisible from another workspace', () => {
    const doc = addDoc('Isolated Doc');
    useAppStore.getState().bulkUpdateImportedContent([doc.id], { folderId: 'f1', isArchived: true });

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().importedContent).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().importedContent[0].metadata?.folderId).toBe('f1');
    expect(useAppStore.getState().importedContent[0].metadata?.isArchived).toBe(true);
  });
});
