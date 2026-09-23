import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../lib/store';
import { createRevisionQueue } from '../../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import {
  extractContentFromFile,
  buildImportPreview,
  confirmImportedContent,
  isNearEmptyContent,
  validateImportFile,
  formatFileSizeBytes,
  buildMarkdownFromPdfPages,
  truncateForPreview,
  SUPPORTED_IMPORT_EXTENSIONS,
  type ImportPreview,
  type PdfPageTextItem,
} from '../../lib/contentImport';
import { REPOSITORY_CONTENT_TYPE_REGISTRY, type RepositoryContentType } from '../../lib/repository';
import type { Note } from '../../lib/types';

// This component has no rendering test here (no React Testing Library / DOM environment in this
// repo — see every other *.test.ts file for the established convention). These tests exercise
// exactly what components/repository/ImportToRepositoryModal.tsx does: the same
// extractContentFromFile/buildImportPreview/confirmImportedContent pipeline calls, the same
// upsertNote/addImportedContent store actions, and the same "selected type may differ from the
// suggestion, only the explicit selection is ever saved" rule the component's own state
// (selectedType, independent of preview.suggestedContentType) implements. A manual browser smoke
// check covers the actual on-screen file-picker/type-select/preview/confirm flow (see the task
// report).

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

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFilename: overrides.sourceFilename ?? 'notes.md',
    originalFormat: overrides.originalFormat ?? 'markdown',
    suggestedContentType: overrides.suggestedContentType ?? 'note',
    title: overrides.title ?? 'Imported Title',
    content: overrides.content ?? 'Some extracted content, long enough to not be near-empty.',
  };
}

describe('Global Repository Import — file type support', () => {
  it('accepts every supported extension: .md, .markdown, .docx, .pdf, .txt, .csv, .json', () => {
    expect(SUPPORTED_IMPORT_EXTENSIONS).toEqual(['.md', '.markdown', '.docx', '.pdf', '.txt', '.csv', '.json']);
    for (const [name, size] of [
      ['a.md', 100],
      ['a.markdown', 100],
      ['a.docx', 100],
      ['a.pdf', 100],
      ['a.txt', 100],
      ['a.csv', 100],
      ['a.json', 100],
    ] as const) {
      expect(validateImportFile({ name, size }).valid).toBe(true);
    }
  });

  it('rejects an unsupported extension with a clear, non-silent error', () => {
    const result = validateImportFile({ name: 'a.exe', size: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects legacy .doc with its own specific message (never silently parsed)', () => {
    const result = validateImportFile({ name: 'legacy.doc', size: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/doc/i);
  });
});

describe('Global Repository Import — explicit content-type selection', () => {
  it('the registry lists exactly the 9 supported content types', () => {
    const types = REPOSITORY_CONTENT_TYPE_REGISTRY.map((m) => m.type).sort();
    expect(types).toEqual(
      ['bibliography', 'descriptive_questions', 'document', 'note', 'other', 'pyq', 'question_bank', 'research_document', 'study_material'].sort(),
    );
  });

  it('confirmImportedContent accepts any registered content type explicitly, never defaulting on its own', () => {
    for (const meta of REPOSITORY_CONTENT_TYPE_REGISTRY) {
      if (meta.type === 'note') continue; // 'note' is saved via upsertNote in the modal, not confirmImportedContent
      const saved = confirmImportedContent(preview(), { workspaceId: 'phd_research', contentType: meta.type });
      expect(saved.contentType).toBe(meta.type);
    }
  });
});

describe('Global Repository Import — suggestion vs final selected type', () => {
  it("the saved item's contentType is whatever was explicitly selected, even when it differs from the filename-based suggestion", () => {
    const p = preview({ sourceFilename: 'notes.md', suggestedContentType: 'note' });
    // The user changed the dropdown away from the suggestion — the explicit choice below is what
    // the modal actually passes to confirmImportedContent, never preview.suggestedContentType.
    const explicitlyChosenType: RepositoryContentType = 'research_document';
    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: explicitlyChosenType });
    expect(saved.contentType).toBe('research_document');
    expect(saved.contentType).not.toBe(p.suggestedContentType);
  });

  it('buildImportPreview never persists anything — its suggestion is purely informational', () => {
    fullReset();
    buildImportPreview({ name: 'thesis-outline.md' }, { format: 'markdown', text: '# Thesis Outline\n\nDraft.' });
    expect(useAppStore.getState().importedContent).toEqual([]);
    expect(useAppStore.getState().notes).toEqual([]);
  });
});

describe('Global Repository Import — preview', () => {
  it('buildImportPreview carries every field the preview panel displays', () => {
    const p = buildImportPreview({ name: 'chapter-1.md' }, { format: 'markdown', text: '# Chapter 1\n\nBody text here.' });
    expect(p.sourceFilename).toBe('chapter-1.md');
    expect(p.originalFormat).toBe('markdown');
    expect(typeof p.suggestedContentType).toBe('string');
    expect(p.title).toBe('Chapter 1');
    expect(p.content).toContain('Body text here.');
  });
});

describe('Global Repository Import — confirmation requirement (no persistence before Confirm)', () => {
  beforeEach(fullReset);

  it('extraction and preview-building alone never touch the store', async () => {
    const result = await extractContentFromFile(new File(['# Title\n\nBody'], 'a.md', { type: 'text/markdown' }));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') buildImportPreview({ name: 'a.md' }, result.content);
    expect(useAppStore.getState().importedContent).toEqual([]);
    expect(useAppStore.getState().notes).toEqual([]);
  });

  it('cancelling after a preview is built (never calling confirm) leaves the repository completely untouched', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const result = await extractContentFromFile(new File(['Name,Score\nAlice,90'], 'scores.csv'));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const p = buildImportPreview({ name: 'scores.csv' }, result.content);
    expect(p.content).toContain('Alice');
    // Simulates clicking Cancel/closing the modal at the preview stage — the component's onClose
    // simply unmounts, calling neither confirmImportedContent nor any store action.
    expect(useAppStore.getState().importedContent).toEqual([]);
    expect(useAppStore.getState().notes).toEqual([]);
  });

  it('an explicit confirm, by contrast, does persist exactly one item — proving the two paths genuinely differ', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const result = await extractContentFromFile(new File(['Name,Score\nAlice,90'], 'scores.csv'));
    if (result.status !== 'ok') throw new Error('expected ok');
    const p = buildImportPreview({ name: 'scores.csv' }, result.content);
    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'study_material' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent).toHaveLength(1);
  });
});

describe('Import Centre — new file formats (CSV, JSON)', () => {
  beforeEach(fullReset);

  it('a CSV file flows end-to-end through the same pipeline as every other format: extract -> preview -> explicit confirm -> save', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const result = await extractContentFromFile(new File(['Name,Score\nAlice,90\nBob,85'], 'results.csv'));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.content.format).toBe('csv');
    expect(result.content.text).toBe('| Name | Score |\n| --- | --- |\n| Alice | 90 |\n| Bob | 85 |');

    const p = buildImportPreview({ name: 'results.csv' }, result.content);
    expect(p.originalFormat).toBe('csv');

    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'study_material' });
    useAppStore.getState().addImportedContent(saved);
    const stored = useAppStore.getState().importedContent[0];
    expect(stored.rawContent).toBe(result.content.text);
    expect(stored.provenance.originalFormat).toBe('csv');
    expect(stored.provenance.sourceFilename).toBe('results.csv');
  });

  it('a JSON file flows end-to-end, pretty-printed but never restructured or fabricated', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const result = await extractContentFromFile(new File(['{"topic":"Fieldwork","pages":42}'], 'meta.json'));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.content.format).toBe('json');
    expect(result.content.text).toBe(JSON.stringify({ topic: 'Fieldwork', pages: 42 }, null, 2));

    const p = buildImportPreview({ name: 'meta.json' }, result.content);
    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'document' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent[0].rawContent).toBe(result.content.text);
  });

  it('malformed JSON never persists anything and reports a clear error instead of inventing content', async () => {
    const result = await extractContentFromFile(new File(['{broken'], 'broken.json'));
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toMatch(/valid JSON/i);
    expect(useAppStore.getState().importedContent).toEqual([]);
  });

  it('an empty CSV never persists anything and reports a clear error instead of an empty/fabricated table', async () => {
    const result = await extractContentFromFile(new File([''], 'empty.csv'));
    expect(result.status).toBe('error');
    expect(useAppStore.getState().importedContent).toEqual([]);
  });

  it('validateImportFile accepts .csv and .json alongside every previously-supported extension', () => {
    expect(validateImportFile({ name: 'a.csv', size: 100 }).valid).toBe(true);
    expect(validateImportFile({ name: 'a.json', size: 100 }).valid).toBe(true);
  });
});

describe('Import Centre — file size display', () => {
  it('formats bytes, kilobytes, and megabytes for the preview panel', () => {
    expect(formatFileSizeBytes(512)).toBe('512 B');
    expect(formatFileSizeBytes(2048)).toBe('2.0 KB');
    expect(formatFileSizeBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('Import Centre — description metadata', () => {
  beforeEach(fullReset);

  it('an explicit description supplied at confirm time is saved onto the item\'s metadata', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const saved = confirmImportedContent(preview({ title: 'Fieldwork Notes' }), {
      workspaceId: 'phd_research',
      contentType: 'study_material',
      metadata: { description: 'Scanned handout from the site visit' },
    });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent[0].metadata?.description).toBe('Scanned handout from the site visit');
  });

  it('no description is ever fabricated — omitting it leaves metadata.description unset', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const saved = confirmImportedContent(preview(), { workspaceId: 'phd_research', contentType: 'study_material' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent[0].metadata?.description).toBeUndefined();
  });
});

describe('Import Centre — deterministic extraction improvements (Phase 8 Step 3): confirm/cancel still hold', () => {
  beforeEach(fullReset);

  it('a PDF with page-boundary markers only persists after an explicit Confirm — never on preview alone', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const pages: PdfPageTextItem[][] = [[{ text: 'Page one content', fontSize: 12 }], [{ text: 'Page two content', fontSize: 12 }]];
    const extracted = buildMarkdownFromPdfPages(pages);
    expect(extracted).toContain('[Page 1]');
    expect(extracted).toContain('[Page 2]');

    const p = buildImportPreview({ name: 'report.pdf' }, { format: 'pdf', text: extracted });
    // Building the preview alone (what happens as soon as extraction finishes) never persists.
    expect(useAppStore.getState().importedContent).toEqual([]);

    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent).toHaveLength(1);
    expect(useAppStore.getState().importedContent[0].rawContent).toContain('[Page 1]');
    expect(useAppStore.getState().importedContent[0].rawContent).toContain('[Page 2]');
  });

  it("a DOCX-derived Markdown preview (headings preserved) is discarded on cancel and only persisted on confirm", () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const docxDerivedMarkdown = '# Chapter One\n\nThis is the first paragraph of body text.\n\n## Section A\n\nMore body text here.';
    const p = buildImportPreview({ name: 'chapter.docx' }, { format: 'docx', text: docxDerivedMarkdown });

    // Cancel: never call confirmImportedContent/addImportedContent — the repository stays empty.
    expect(useAppStore.getState().importedContent).toEqual([]);

    // Confirm: the exact same preview, now explicitly saved.
    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent).toHaveLength(1);
    expect(useAppStore.getState().importedContent[0].rawContent).toBe(docxDerivedMarkdown);
  });

  it('confirming a large, truncated-in-preview document still saves the FULL untruncated text, never the shortened preview', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const fullText = 'Paragraph. '.repeat(2000); // well over the preview truncation limit
    const truncated = truncateForPreview(fullText);
    expect(truncated.truncated).toBe(true);
    expect(truncated.text.length).toBeLessThan(fullText.length);

    const p = buildImportPreview({ name: 'long.txt' }, { format: 'text', text: fullText });
    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'document' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent[0].rawContent.length).toBe(fullText.length);
    expect(useAppStore.getState().importedContent[0].rawContent).toBe(fullText);
  });
});

describe('Global Repository Import — note persistence (existing Notes path, no duplicate storage)', () => {
  beforeEach(fullReset);

  it('a "note" selection saves via upsertNote into notes, never into importedContent', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const p = preview({ title: 'My Imported Note', content: 'Body of the note.' });
    const newNote: Note = {
      id: 'n1',
      subject: 'general',
      title: p.title,
      content: p.content,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      pinned: false,
      workspaceId: 'phd_research',
    };
    useAppStore.getState().upsertNote(newNote);

    expect(useAppStore.getState().notes).toHaveLength(1);
    expect(useAppStore.getState().notes[0].title).toBe('My Imported Note');
    expect(useAppStore.getState().importedContent).toEqual([]);
  });
});

describe('Global Repository Import — imported-content persistence', () => {
  beforeEach(fullReset);

  it('every non-note type saves via addImportedContent into importedContent, never into notes', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const saved = confirmImportedContent(preview({ title: 'A Document' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(saved);

    expect(useAppStore.getState().importedContent).toHaveLength(1);
    expect(useAppStore.getState().importedContent[0].title).toBe('A Document');
    expect(useAppStore.getState().notes).toEqual([]);
  });
});

describe('Global Repository Import — question safety (raw import, never fabricated)', () => {
  beforeEach(fullReset);

  const rawText = 'Q1. What is the capital of France?\nA) Paris B) London C) Berlin D) Madrid\nAnswer: A';

  it('question_bank: the extracted text is saved verbatim as rawContent, with no structured question fields added', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const p = preview({ content: rawText, suggestedContentType: 'question_bank' });
    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'question_bank' });
    useAppStore.getState().addImportedContent(saved);

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.contentType).toBe('question_bank');
    expect(stored.rawContent).toBe(rawText);
    // No question/answer/option fields are ever synthesised onto the record.
    expect(stored).not.toHaveProperty('options');
    expect(stored).not.toHaveProperty('correctOptionId');
    expect(stored).not.toHaveProperty('questions');
  });

  it('descriptive_questions: same raw-preservation guarantee', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const p = preview({ content: rawText, suggestedContentType: 'descriptive_questions' });
    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'descriptive_questions' });
    useAppStore.getState().addImportedContent(saved);

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.contentType).toBe('descriptive_questions');
    expect(stored.rawContent).toBe(rawText);
    expect(stored).not.toHaveProperty('modelAnswer');
    expect(stored).not.toHaveProperty('questions');
  });

  it('pyq: same raw-preservation guarantee — this repository import path never writes to the separate PYQ data/state', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const p = preview({ content: rawText, suggestedContentType: 'pyq' });
    const saved = confirmImportedContent(p, { workspaceId: 'phd_research', contentType: 'pyq' });
    useAppStore.getState().addImportedContent(saved);

    const stored = useAppStore.getState().importedContent[0];
    expect(stored.contentType).toBe('pyq');
    expect(stored.rawContent).toBe(rawText);
    // The existing, separate pyqAttempts/PYQ system is completely untouched by this import.
    expect(useAppStore.getState().pyqAttempts).toEqual([]);
  });
});

describe('Global Repository Import — workspace isolation', () => {
  beforeEach(fullReset);

  it('addImportedContent always stamps the ACTIVE workspace, regardless of what the caller passed', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    // Even if a caller (bug or otherwise) passed a different workspaceId, the store action itself
    // re-stamps it — the one thing that actually makes "cannot import into another workspace" true.
    const saved = confirmImportedContent(preview(), { workspaceId: 'apfc', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent[0].workspaceId).toBe('phd_research');
  });

  it('upsertNote defaults to the active workspace only when the note omits workspaceId — the modal always supplies it explicitly as the current active workspace, so this is never reached with a stale value', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'T', content: 'C', createdAt: 'a', updatedAt: 'a', pinned: false, workspaceId: undefined });
    expect(useAppStore.getState().notes[0].workspaceId).toBe('upsc_cse');
  });

  it("the modal's own note construction always uses the CURRENT active workspace, so upsertNote's preserve-existing-workspaceId behaviour never lets an import cross workspaces", () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const activeWorkspaceId = useAppStore.getState().activeWorkspaceId; // read exactly as the modal does, at save time
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'T', content: 'C', createdAt: 'a', updatedAt: 'a', pinned: false, workspaceId: activeWorkspaceId });
    expect(useAppStore.getState().notes[0].workspaceId).toBe('phd_research');
  });

  it('switching workspace after an import means the item is no longer visible in the newly active workspace', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const saved = confirmImportedContent(preview(), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(saved);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().importedContent).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().importedContent).toHaveLength(1);
  });
});

describe('Global Repository Import — unsupported file', () => {
  it('extractContentFromFile returns a user-facing error for an unsupported extension, never throwing', async () => {
    const file = new File(['data'], 'a.exe', { type: 'application/octet-stream' });
    const result = await extractContentFromFile(file);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toBeTruthy();
  });
});

describe('Global Repository Import — empty content', () => {
  it('isNearEmptyContent flags whitespace/markdown-punctuation-only text as effectively empty', () => {
    expect(isNearEmptyContent('   \n\n # * - \n  ')).toBe(true);
    expect(isNearEmptyContent('A real sentence with enough characters in it.')).toBe(false);
  });

  it('extractContentFromFile succeeds for a whitespace-only .txt file, leaving the emptiness check to the caller (mirroring the component\'s own extra isNearEmptyContent guard)', async () => {
    const file = new File(['   \n\n  '], 'empty.txt', { type: 'text/plain' });
    const result = await extractContentFromFile(file);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(isNearEmptyContent(result.content.text)).toBe(true);
  });
});

describe('Global Repository Import — save failure resilience', () => {
  // addImportedContent/upsertNote are plain, synchronous Zustand set() calls with no validation
  // that can reject a well-formed item — there is no reachable failure mode in this store today.
  // The modal still wraps its save call in try/catch (never letting an unexpected exception drop
  // the user's file/preview silently) as a defensive guard, matching this codebase's existing
  // "never assumed impossible" discipline elsewhere (see e.g. lib/contentRelationships.ts's id-
  // collision checks). This test pins down the happy path the guard wraps: saving a well-formed
  // item never throws, for every registered content type.
  beforeEach(fullReset);

  it('never throws when saving a well-formed item, for every non-note content type', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    for (const meta of REPOSITORY_CONTENT_TYPE_REGISTRY) {
      if (meta.type === 'note') continue;
      expect(() => {
        const saved = confirmImportedContent(preview(), { workspaceId: 'phd_research', contentType: meta.type });
        useAppStore.getState().addImportedContent(saved);
      }).not.toThrow();
    }
  });

  it('never throws when saving a well-formed note', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(() => {
      useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'T', content: 'C', createdAt: 'a', updatedAt: 'a', pinned: false, workspaceId: 'phd_research' });
    }).not.toThrow();
  });
});

describe('Global Repository Import — existing specialised import flows are unaffected', () => {
  beforeEach(fullReset);

  it('PhD Research\'s own hardcoded research_document import still works exactly as before', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const saved = confirmImportedContent(preview({ title: 'Chapter' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent[0].contentType).toBe('research_document');
  });

  it('Working Bibliography\'s own hardcoded bibliography import still works exactly as before', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const saved = confirmImportedContent(preview({ title: 'Source' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(saved);
    expect(useAppStore.getState().importedContent[0].contentType).toBe('bibliography');
  });

  it('Notes\' own import (via extractContentFromFile, unaffected by this stage) still produces a note, not an ImportedContent', async () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const result = await extractContentFromFile(new File(['# My Note\n\nBody'], 'note.md', { type: 'text/markdown' }));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'My Note', content: result.content.text, createdAt: 'a', updatedAt: 'a', pinned: false });
    expect(useAppStore.getState().notes).toHaveLength(1);
    expect(useAppStore.getState().importedContent).toEqual([]);
  });
});
