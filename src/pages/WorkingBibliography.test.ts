import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { NAV_ITEMS } from '../components/layout/nav';
import {
  IMPORTED_CONTENT_TYPES,
  buildImportPreview,
  confirmImportedContent,
  createManualImportedContent,
  selectImportedContentByType,
  type ImportPreview,
  type ImportedContent,
} from '../lib/contentImport';
import {
  parseBibliographyRecords,
  formatBibliographyRecordAsText,
  buildBibliographyMetadata,
  getBibliographyFields,
  isManuallyCreated,
  queryBibliography,
  parseAuthorsInput,
} from '../lib/bibliography';
import { getContentTags, getContentCategory, parseTagsInput } from '../lib/importedContentRepository';
import { getOutgoingRelationships, getIncomingRelationships, RELATIONSHIP_TYPE_LABELS } from '../lib/contentRelationships';
import { countRelatedContent } from '../lib/relatedContentSummary';

// This page has no rendering test here (no React Testing Library / DOM environment in this repo —
// see StudyPlan.test.ts and PhdResearch.test.ts for the established convention). These tests
// exercise exactly what pages/WorkingBibliography.tsx does: parse a structured import file with
// lib/bibliography.ts, confirm/save each parsed record (or a manual entry) through the real store,
// and query/filter the result — a manual browser smoke check covers the actual on-screen flow (see
// the task report).

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

/** Mirrors exactly what pages/WorkingBibliography.tsx's handleConfirmStructured does for one
 * parsed record: builds an ImportPreview from the record's own raw block, confirms it with
 * contentType 'bibliography', and saves it. */
function importStructuredFile(rawText: string, sourceFilename = 'sources.md') {
  const parsed = parseBibliographyRecords(rawText);
  for (const record of parsed.records) {
    const preview: ImportPreview = {
      sourceFilename,
      originalFormat: 'markdown',
      suggestedContentType: 'bibliography',
      title: record.title,
      content: record.rawBlock,
    };
    const content = confirmImportedContent(preview, {
      workspaceId: 'phd_research',
      contentType: 'bibliography',
      metadata: buildBibliographyMetadata({ fields: record.fields, tags: record.tags, category: record.category }),
    });
    useAppStore.getState().addImportedContent(content);
  }
  return parsed;
}

/** Mirrors what pages/WorkingBibliography.tsx's handleSaveForm does for a brand-new manual entry. */
function addManualRecord(input: { title: string; authors?: string; year?: string; tags?: string; category?: string; notes?: string }) {
  const fields = {
    authors: input.authors ? parseAuthorsInput(input.authors) : undefined,
    year: input.year,
    notes: input.notes,
  };
  const tags = input.tags ? parseTagsInput(input.tags) : [];
  const category = input.category;
  const rawContent = formatBibliographyRecordAsText({ title: input.title, fields, tags, category });
  const content = createManualImportedContent({
    workspaceId: 'phd_research',
    contentType: 'bibliography',
    title: input.title,
    content: rawContent,
    metadata: buildBibliographyMetadata({ fields, tags, category }),
  });
  useAppStore.getState().addImportedContent(content);
  return content;
}

describe('bibliography content type', () => {
  it('"bibliography" is a recognised ImportedContentType, reused from the existing import foundation', () => {
    expect(IMPORTED_CONTENT_TYPES).toContain('bibliography');
  });

  it('a "Working Bibliography" nav-reachable route exists under /phd-research', () => {
    // Reached via the PhD Research tab switcher rather than a second top-level nav item — the
    // top-level "PhD Research" entry (now pointing at /phd-dashboard, the dashboard tab) is what's
    // registered in NAV_ITEMS.
    const phdItem = NAV_ITEMS.find((n) => n.to === '/phd-dashboard');
    expect(phdItem).toBeDefined();
  });
});

describe('structured record validation (parseBibliographyRecords)', () => {
  beforeEach(fullReset);

  it('a well-formed structured file produces one ImportedContent per record when imported', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const text = `Title: Paper One\nAuthors: Jane Smith\nYear: 2020\n\n---\n\nTitle: Paper Two\nAuthors: John Doe\nYear: 2019`;
    const parsed = importStructuredFile(text);
    expect(parsed.records).toHaveLength(2);
    const stored = selectImportedContentByType(useAppStore.getState().importedContent, 'bibliography');
    expect(stored.map((s) => s.title).sort()).toEqual(['Paper One', 'Paper Two']);
  });

  it('an unstructured file (no recognised Title: lines) produces zero records — nothing is fabricated', () => {
    const parsed = parseBibliographyRecords('Just some free-form prose with no structure at all.');
    expect(parsed.records).toEqual([]);
    expect(parsed.skippedBlockCount).toBe(1);
  });
});

describe('manual creation', () => {
  beforeEach(fullReset);

  it('creates a bibliography record with only a title (every other field optional)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    addManualRecord({ title: 'Manually Catalogued Source' });
    const stored = useAppStore.getState().importedContent;
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Manually Catalogued Source');
    expect(stored[0].contentType).toBe('bibliography');
  });

  it('creates a record with several fields, tags and category set', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    addManualRecord({ title: 'Full Record', authors: 'Jane Smith, John Doe', year: '2021', tags: 'fieldwork, key-source', category: 'Fieldwork' });
    const [stored] = useAppStore.getState().importedContent;
    expect(getBibliographyFields(stored).authors).toEqual(['Jane Smith', 'John Doe']);
    expect(getBibliographyFields(stored).year).toBe('2021');
    expect(getContentTags(stored)).toEqual(['fieldwork', 'key-source']);
    expect(getContentCategory(stored)).toBe('Fieldwork');
  });

  it("a manual record's rawContent is a readable rendition of its fields, not empty", () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    addManualRecord({ title: 'Readable Record', authors: 'Jane Smith', year: '2020' });
    const [stored] = useAppStore.getState().importedContent;
    expect(stored.rawContent).toContain('Title: Readable Record');
    expect(stored.rawContent).toContain('Jane Smith');
  });
});

describe('editing bibliography records', () => {
  beforeEach(fullReset);

  it('editing an imported record updates fields/title but never touches its original rawContent', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const originalRawBlock = 'Title: Original Title\nYear: 2018';
    importStructuredFile(originalRawBlock);
    const [imported] = useAppStore.getState().importedContent;
    expect(imported.rawContent).toBe(originalRawBlock);

    // Mirrors WorkingBibliography.tsx's handleSaveForm for an IMPORTED record being edited:
    // title/metadata change, rawContent is deliberately left untouched.
    useAppStore.getState().updateImportedContent(imported.id, {
      title: 'Corrected Title',
      metadata: buildBibliographyMetadata({ fields: { year: '2019' } }),
    });

    const [updated] = useAppStore.getState().importedContent;
    expect(updated.title).toBe('Corrected Title');
    expect(getBibliographyFields(updated).year).toBe('2019');
    expect(updated.rawContent).toBe(originalRawBlock);
  });

  it('editing a manually-created record regenerates its own rawContent to match the new fields', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const created = addManualRecord({ title: 'Draft Title', year: '2020' });
    expect(isManuallyCreated(created)).toBe(true);

    const newFields = { year: '2022' };
    const newRawContent = formatBibliographyRecordAsText({ title: 'Final Title', fields: newFields, tags: [], category: undefined });
    useAppStore.getState().updateImportedContent(created.id, {
      title: 'Final Title',
      rawContent: newRawContent,
      metadata: buildBibliographyMetadata({ fields: newFields }),
    });

    const [updated] = useAppStore.getState().importedContent;
    expect(updated.title).toBe('Final Title');
    expect(getBibliographyFields(updated).year).toBe('2022');
    expect(updated.rawContent).toContain('Final Title');
    expect(updated.rawContent).toContain('2022');
  });

  it("editing cannot change a record's id or workspaceId (runtime-enforced by the store)", () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const created = addManualRecord({ title: 'Immutable Identity' });

    // @ts-expect-error — deliberately bypassing the TS-level Omit<...,'id'|'workspaceId'> to prove
    // the store's own runtime guard still holds for bibliography edits, exactly as it does for
    // every other content type (see lib/store.test.ts).
    useAppStore.getState().updateImportedContent(created.id, { id: 'hijacked', workspaceId: 'apfc', title: 'Still Immutable' });

    const [updated] = useAppStore.getState().importedContent;
    expect(updated.id).toBe(created.id);
    expect(updated.workspaceId).toBe('phd_research');
    expect(updated.title).toBe('Still Immutable');
  });
});

describe('deleting bibliography records', () => {
  beforeEach(fullReset);

  it('deleteImportedContent removes exactly the targeted record', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const a = addManualRecord({ title: 'Keep Me' });
    const b = addManualRecord({ title: 'Delete Me' });
    expect(useAppStore.getState().importedContent).toHaveLength(2);

    useAppStore.getState().deleteImportedContent(b.id);

    const remaining = useAppStore.getState().importedContent;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(a.id);
  });
});

describe('import provenance — imported vs manually created', () => {
  beforeEach(fullReset);

  it('a structured-import record is never marked manual', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    importStructuredFile('Title: Imported Paper\nYear: 2020');
    const [stored] = useAppStore.getState().importedContent;
    expect(isManuallyCreated(stored)).toBe(false);
    expect(stored.provenance.origin).toBe('import');
    expect(stored.provenance.sourceFilename).toBe('sources.md');
  });

  it('a manually created record is always marked manual, with no source filename', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const created = addManualRecord({ title: 'Hand-catalogued' });
    expect(isManuallyCreated(created)).toBe(true);
    expect(created.provenance.origin).toBe('manual');
    expect(created.provenance.sourceFilename).toBeUndefined();
  });

  it('a fallback (unstructured) file import is still marked "import", not "manual"', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const preview = buildImportPreview({ name: 'raw-notes.txt' }, { format: 'text', text: 'Unstructured prose with no records.' });
    const content = confirmImportedContent(preview, {
      workspaceId: 'phd_research',
      contentType: 'bibliography',
      metadata: buildBibliographyMetadata({}),
    });
    useAppStore.getState().addImportedContent(content);
    const [stored] = useAppStore.getState().importedContent;
    expect(isManuallyCreated(stored)).toBe(false);
    expect(stored.rawContent).toBe('Unstructured prose with no records.');
  });
});

describe('search / author / year / publication-type / tag / category filters', () => {
  beforeEach(fullReset);

  it('filters the active workspace\'s bibliography records correctly via queryBibliography', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    importStructuredFile(
      `Title: Fieldwork Study\nAuthors: Jane Smith\nYear: 2020\nType: Journal Article\nTags: fieldwork\nCategory: Fieldwork\n\n---\n\nTitle: Literature Survey\nAuthors: John Doe\nYear: 2018\nType: Book\nTags: literature\nCategory: Literature Review`,
    );
    const all = selectImportedContentByType(useAppStore.getState().importedContent, 'bibliography');
    expect(all).toHaveLength(2);

    expect(queryBibliography(all, { search: 'Fieldwork' }).map((r) => r.title)).toEqual(['Fieldwork Study']);
    expect(queryBibliography(all, { author: 'John Doe' }).map((r) => r.title)).toEqual(['Literature Survey']);
    expect(queryBibliography(all, { year: '2020' }).map((r) => r.title)).toEqual(['Fieldwork Study']);
    expect(queryBibliography(all, { publicationType: 'book' }).map((r) => r.title)).toEqual(['Literature Survey']);
    expect(queryBibliography(all, { tags: ['literature'] }).map((r) => r.title)).toEqual(['Literature Survey']);
    expect(queryBibliography(all, { category: 'Fieldwork' }).map((r) => r.title)).toEqual(['Fieldwork Study']);
  });
});

describe('workspace isolation', () => {
  beforeEach(fullReset);

  it('a bibliography record saved in phd_research is invisible after switching to apfc', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    addManualRecord({ title: 'PhD-only Source' });

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().importedContent).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().importedContent).toHaveLength(1);
  });

  it('a bibliography record saved in phd_research is invisible in upsc_cse', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    addManualRecord({ title: 'PhD-only Source' });

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().importedContent).toEqual([]);
  });
});

describe('legacy importedContent without bibliography metadata', () => {
  beforeEach(fullReset);

  it('an item with contentType bibliography but no metadata still displays/queries without throwing', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const legacy: ImportedContent = {
      id: 'legacy-1',
      workspaceId: 'phd_research',
      contentType: 'bibliography',
      title: 'Pre-stage Bibliography Item',
      rawContent: 'Some raw text saved before structured fields existed.',
      provenance: { sourceFilename: 'old.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' },
    };
    useAppStore.getState().addImportedContent(legacy);

    const stored = selectImportedContentByType(useAppStore.getState().importedContent, 'bibliography');
    expect(stored).toHaveLength(1);
    expect(() => getBibliographyFields(stored[0])).not.toThrow();
    expect(getBibliographyFields(stored[0])).toEqual({});
    expect(isManuallyCreated(stored[0])).toBe(false);
    expect(queryBibliography(stored, {})).toHaveLength(1);
    expect(queryBibliography(stored, { author: 'anyone' })).toEqual([]);
  });
});

describe('existing research-document flow regression', () => {
  beforeEach(fullReset);

  it('importing a bibliography record does not affect research_document items', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const researchPreview = buildImportPreview({ name: 'thesis-chapter.md' }, { format: 'markdown', text: '# Thesis Chapter\n\nDraft text.' });
    const researchDoc = confirmImportedContent(researchPreview, { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(researchDoc);

    addManualRecord({ title: 'A Bibliography Record' });

    const all = useAppStore.getState().importedContent;
    expect(all).toHaveLength(2);
    expect(selectImportedContentByType(all, 'research_document')).toHaveLength(1);
    expect(selectImportedContentByType(all, 'bibliography')).toHaveLength(1);
    expect(selectImportedContentByType(all, 'research_document')[0].title).toBe('Thesis Chapter');
  });

  it('deleting a bibliography record leaves research_document items untouched', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const researchPreview = buildImportPreview({ name: 'notes.md' }, { format: 'markdown', text: '# Notes' });
    const researchDoc = confirmImportedContent(researchPreview, { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(researchDoc);
    const bibRecord = addManualRecord({ title: 'Temp Source' });

    useAppStore.getState().deleteImportedContent(bibRecord.id);

    const all = useAppStore.getState().importedContent;
    expect(all).toHaveLength(1);
    expect(all[0].contentType).toBe('research_document');
  });
});

// Source <-> Research Document Linking — this page (bibliography record -> research document) is
// where a link is CREATED (pages/PhdResearch.tsx only displays/unlinks — see PhdResearch.test.ts).
describe('bibliography -> research document linking', () => {
  beforeEach(fullReset);

  function addResearchDocument(title: string) {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const preview = buildImportPreview({ name: `${title}.md` }, { format: 'markdown', text: `# ${title}` });
    const content = confirmImportedContent(preview, { workspaceId: 'phd_research', contentType: 'research_document', title });
    useAppStore.getState().addImportedContent(content);
    return content;
  }

  it('linking a bibliography record to a research document creates a relationship with the record as source', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = addResearchDocument('Chapter 1 Draft');
    const record = addManualRecord({ title: 'Key Source' });

    const result = useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });
    expect(result.status).toBe('ok');

    const outgoing = getOutgoingRelationships(useAppStore.getState().contentRelationships, record.id, 'imported_content');
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].targetId).toBe(doc.id);
    expect(outgoing[0].type).toBe('cites');
    expect(RELATIONSHIP_TYPE_LABELS[outgoing[0].type]).toBe('Cites');
  });

  it('supports every relationship type (cites, supports, related_to)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc1 = addResearchDocument('Doc 1');
    const doc2 = addResearchDocument('Doc 2');
    const doc3 = addResearchDocument('Doc 3');
    const record = addManualRecord({ title: 'Multi-linked Source' });

    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: doc1.id, type: 'imported_content' }, type: 'cites' });
    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: doc2.id, type: 'imported_content' }, type: 'supports' });
    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: doc3.id, type: 'imported_content' }, type: 'related_to' });

    const outgoing = getOutgoingRelationships(useAppStore.getState().contentRelationships, record.id, 'imported_content');
    expect(outgoing.map((r) => r.type).sort()).toEqual(['cites', 'related_to', 'supports']);
  });

  it('linking twice to the same document with the same type is rejected as a duplicate', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = addResearchDocument('Doc');
    const record = addManualRecord({ title: 'Source' });

    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });
    const second = useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });
    expect(second).toMatchObject({ status: 'error', reason: 'duplicate' });
  });

  it('a research document created in a different workspace cannot be linked (runtime rejection, never inferred)', () => {
    useAppStore.getState().setActiveWorkspaceId('apfc');
    const apfcDoc = addImportedApfcDoc();
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Source' });

    const result = useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: apfcDoc.id, type: 'imported_content' }, type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });

    function addImportedApfcDoc() {
      const preview = buildImportPreview({ name: 'apfc-note.md' }, { format: 'markdown', text: '# APFC note' });
      const content = confirmImportedContent(preview, { workspaceId: 'apfc', contentType: 'note' });
      useAppStore.getState().addImportedContent(content);
      return content;
    }
  });

  it('no relationship is ever created automatically just by importing/creating content — only an explicit addContentRelationship call does', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    addResearchDocument('Some Document');
    addManualRecord({ title: 'Some Source' });
    expect(useAppStore.getState().contentRelationships).toEqual([]);
  });
});

// Notes <-> Research Repository Linking — a bibliography record can ALSO explicitly link to a Note
// (record = source, note = target), created directly from this page's own "Linked Notes" action —
// see components/phdResearch/LinkedNotesModal.tsx, shared with pages/PhdResearch.tsx.
describe('bibliography -> note linking', () => {
  beforeEach(fullReset);

  function addNote(id: string, title: string) {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id, subject: 'general', title, content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
  }

  it('a bibliography record can link to an existing note', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Source With Notes' });
    addNote('n1', 'My Reading Note');

    const result = useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });
    expect(result.status).toBe('ok');

    const outgoing = getOutgoingRelationships(useAppStore.getState().contentRelationships, record.id, 'imported_content').filter((r) => r.targetType === 'note');
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].targetId).toBe('n1');
  });

  it("the note's own incoming view resolves back to the bibliography record", () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Source' });
    addNote('n1', 'Note');
    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'supports' });

    const incoming = getIncomingRelationships(useAppStore.getState().contentRelationships, 'n1', 'note');
    expect(incoming).toHaveLength(1);
    expect(incoming[0].sourceId).toBe(record.id);
    expect(incoming[0].type).toBe('supports');
  });

  it('rejects linking to a note id that does not exist', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Source' });
    const result = useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: 'ghost-note', type: 'note' }, type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
  });

  it('unlinking a note removes the relationship', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Source' });
    addNote('n1', 'Note');
    const result = useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });
    if (result.status !== 'ok') throw new Error('expected ok');

    useAppStore.getState().deleteContentRelationship(result.relationship.id);
    expect(getOutgoingRelationships(useAppStore.getState().contentRelationships, record.id, 'imported_content')).toEqual([]);
  });

  it('deleting the note cascades and removes the relationship (both sides update)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Source' });
    addNote('n1', 'Note');
    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });

    useAppStore.getState().deleteNote('n1');
    expect(useAppStore.getState().contentRelationships).toEqual([]);
  });

  it('regression: linking a note does not affect existing bibliography search/filter/edit behaviour', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Fieldwork Source' });
    addNote('n1', 'Note');
    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'cites' });

    const all = selectImportedContentByType(useAppStore.getState().importedContent, 'bibliography');
    expect(queryBibliography(all, { search: 'Fieldwork' }).map((r) => r.id)).toEqual([record.id]);

    useAppStore.getState().updateImportedContent(record.id, { title: 'Renamed Source' });
    expect(useAppStore.getState().importedContent.find((c) => c.id === record.id)?.title).toBe('Renamed Source');
  });
});

// Related Content Summary (this stage) — the bibliography row shows countRelatedContent's
// `researchDocuments` and `notes` fields specifically, matching pages/WorkingBibliography.tsx's
// own countRelatedContent(...) call.
describe('bibliography row — related content summary segment composition', () => {
  beforeEach(fullReset);

  function addResearchDocument(title: string) {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const preview = buildImportPreview({ name: `${title}.md` }, { format: 'markdown', text: `# ${title}` });
    const content = confirmImportedContent(preview, { workspaceId: 'phd_research', contentType: 'research_document', title });
    useAppStore.getState().addImportedContent(content);
    return content;
  }

  function addNote(id: string, title: string) {
    useAppStore.getState().upsertNote({ id, subject: 'general', title, content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
  }

  it('a record linked to two documents and one note shows Documents:2 and Notes:1', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Multi-linked Source' });
    const doc1 = addResearchDocument('Doc 1');
    const doc2 = addResearchDocument('Doc 2');
    addNote('n1', 'Note');
    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: doc1.id, type: 'imported_content' }, type: 'cites' });
    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: doc2.id, type: 'imported_content' }, type: 'supports' });
    useAppStore.getState().addContentRelationship({ source: { id: record.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });

    const state = useAppStore.getState();
    const related = countRelatedContent(state.contentRelationships, record.id, 'imported_content', state.importedContent, state.notes);
    expect(related.researchDocuments).toBe(2);
    expect(related.notes).toBe(1);
  });

  it('a record with no relationships shows the empty-state, i.e. total 0', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const record = addManualRecord({ title: 'Untouched Source' });
    const state = useAppStore.getState();
    const related = countRelatedContent(state.contentRelationships, record.id, 'imported_content', state.importedContent, state.notes);
    expect(related.total).toBe(0);
  });
});
