import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_IMPORT_EXTENSIONS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  getImportFileFormat,
  validateImportFile,
  extractContentFromFile,
  buildImportPreview,
  confirmImportedContent,
  createManualImportedContent,
  suggestContentType,
  isObjectiveQuestionContentType,
  isDescriptiveContentType,
  IMPORTED_CONTENT_TYPES,
  OBJECTIVE_QUESTION_CONTENT_TYPES,
  DESCRIPTIVE_CONTENT_TYPES,
  deriveContentTitle,
  type ImportedContentType,
} from './contentImport';

describe('1. supported file types', () => {
  it('SUPPORTED_IMPORT_EXTENSIONS lists exactly md/markdown/docx/pdf/txt', () => {
    expect([...SUPPORTED_IMPORT_EXTENSIONS].sort()).toEqual(['.docx', '.markdown', '.md', '.pdf', '.txt']);
  });

  it.each([
    ['notes.md', 'markdown'],
    ['notes.markdown', 'markdown'],
    ['report.docx', 'docx'],
    ['report.pdf', 'pdf'],
    ['plain.txt', 'text'],
    ['old.doc', 'doc'],
    ['image.png', 'unsupported'],
  ] as const)('classifies %s as %s', (filename, expectedFormat) => {
    expect(getImportFileFormat(filename)).toBe(expectedFormat);
  });

  it('validateImportFile accepts every supported extension, rejects everything else', () => {
    for (const ext of SUPPORTED_IMPORT_EXTENSIONS) {
      expect(validateImportFile({ name: `file${ext}`, size: 1024 }).valid).toBe(true);
    }
    expect(validateImportFile({ name: 'file.exe', size: 1024 }).valid).toBe(false);
  });

  it('validateImportFile still rejects oversized files and .doc, unchanged from the existing behaviour', () => {
    expect(validateImportFile({ name: 'big.md', size: MAX_IMPORT_FILE_SIZE_BYTES + 1 }).valid).toBe(false);
    const docResult = validateImportFile({ name: 'legacy.doc', size: 1024 });
    expect(docResult.valid).toBe(false);
    expect(docResult.format).toBe('doc');
  });

  it('extractContentFromFile extracts plain text from a .txt file', async () => {
    const file = new File(['Just plain notes, no markdown.'], 'notes.txt');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'text', text: 'Just plain notes, no markdown.' } });
  });

  it('extractContentFromFile rejects an unsupported extension without reading it', async () => {
    const file = new File(['irrelevant'], 'photo.jpg');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'error', message: expect.stringContaining('Unsupported file type') });
  });
});

describe('2. import metadata / provenance', () => {
  it('confirmImportedContent records sourceFilename, originalFormat and an importedAt timestamp', () => {
    const preview = buildImportPreview({ name: 'my-notes.md' }, { format: 'markdown', text: '# Hello\n\nBody' });
    const content = confirmImportedContent(preview, { workspaceId: 'apfc', contentType: 'note' });
    expect(content.provenance.sourceFilename).toBe('my-notes.md');
    expect(content.provenance.originalFormat).toBe('markdown');
    expect(() => new Date(content.provenance.importedAt).toISOString()).not.toThrow();
  });

  it('records an optional, explicit sourceNote for attribution — never auto-filled', () => {
    const preview = buildImportPreview({ name: 'gs1.pdf' }, { format: 'pdf', text: 'Some extracted text here' });
    const withoutNote = confirmImportedContent(preview, { workspaceId: 'upsc_cse', contentType: 'pyq' });
    expect(withoutNote.provenance.sourceNote).toBeUndefined();

    const withNote = confirmImportedContent(preview, {
      workspaceId: 'upsc_cse',
      contentType: 'pyq',
      sourceNote: 'Official UPSC PDF, 2023 GS Paper I',
    });
    expect(withNote.provenance.sourceNote).toBe('Official UPSC PDF, 2023 GS Paper I');
  });

  it('carries content-type-specific freeform metadata through untouched', () => {
    const preview = buildImportPreview({ name: 'gs1.pdf' }, { format: 'pdf', text: 'text' });
    const content = confirmImportedContent(preview, {
      workspaceId: 'upsc_cse',
      contentType: 'pyq',
      metadata: { year: 2023, paper: 'GS Paper I' },
    });
    expect(content.metadata).toEqual({ year: 2023, paper: 'GS Paper I' });
  });

  it('each confirmed item gets its own unique id', () => {
    const preview = buildImportPreview({ name: 'a.md' }, { format: 'markdown', text: 'x' });
    const a = confirmImportedContent(preview, { workspaceId: 'apfc', contentType: 'note' });
    const b = confirmImportedContent(preview, { workspaceId: 'apfc', contentType: 'note' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('3. workspace scoping / isolation', () => {
  it('confirmImportedContent stamps exactly the workspaceId it is given', () => {
    const preview = buildImportPreview({ name: 'a.md' }, { format: 'markdown', text: 'x' });
    expect(confirmImportedContent(preview, { workspaceId: 'apfc', contentType: 'note' }).workspaceId).toBe('apfc');
    expect(confirmImportedContent(preview, { workspaceId: 'upsc_cse', contentType: 'note' }).workspaceId).toBe('upsc_cse');
    expect(confirmImportedContent(preview, { workspaceId: 'phd_research', contentType: 'research_document' }).workspaceId).toBe('phd_research');
  });

  it('the same source file imported into two different workspaces produces two independent records with no shared identity', () => {
    const preview = buildImportPreview({ name: 'shared-source.pdf' }, { format: 'pdf', text: 'Some content' });
    const apfcItem = confirmImportedContent(preview, { workspaceId: 'apfc', contentType: 'note' });
    const cseItem = confirmImportedContent(preview, { workspaceId: 'upsc_cse', contentType: 'note' });
    expect(apfcItem.id).not.toBe(cseItem.id);
    expect(apfcItem.workspaceId).not.toBe(cseItem.workspaceId);
    // content/provenance can legitimately match (same source file) — only identity and workspace must differ
    expect(apfcItem.rawContent).toBe(cseItem.rawContent);
  });
});

describe('4. content-type selection', () => {
  it('IMPORTED_CONTENT_TYPES lists exactly the 9 specified content types', () => {
    expect([...IMPORTED_CONTENT_TYPES].sort()).toEqual(
      ['note', 'document', 'study_material', 'question_bank', 'descriptive_questions', 'pyq', 'research_document', 'bibliography', 'other'].sort(),
    );
  });

  it('suggestContentType defaults to \'note\' for an ordinary filename', () => {
    expect(suggestContentType('my-random-file.md')).toBe('note');
  });

  it.each([
    ['epfo-pyq-2020.pdf', 'pyq'],
    ['previous-year-questions.pdf', 'pyq'],
    ['gs1-question-bank.docx', 'question_bank'],
    ['polity-mcq-set.md', 'question_bank'],
    ['gs4-descriptive-answers.docx', 'descriptive_questions'],
    ['mains-essay-topics.md', 'descriptive_questions'],
    ['sources-bibliography.md', 'bibliography'],
    ['thesis-literature-review.pdf', 'research_document'],
  ] as const)('suggests %s -> %s from filename keywords only', (filename, expected) => {
    expect(suggestContentType(filename)).toBe(expected);
  });

  it('a suggestion is only ever a pre-fill — confirmImportedContent requires its OWN explicit contentType and ignores the suggestion entirely', () => {
    const preview = buildImportPreview({ name: 'epfo-pyq-2020.pdf' }, { format: 'pdf', text: 'text' });
    expect(preview.suggestedContentType).toBe('pyq'); // the suggestion
    // the caller explicitly overrides it — confirmImportedContent has no logic that could pull the
    // suggestion back in behind the caller's back
    const content = confirmImportedContent(preview, { workspaceId: 'upsc_cse', contentType: 'note' });
    expect(content.contentType).toBe('note');
  });

  it('confirmImportedContent has no default content type — TypeScript requires it explicitly (compile-time proof via the signature; this exercises every valid value)', () => {
    const preview = buildImportPreview({ name: 'a.md' }, { format: 'markdown', text: 'x' });
    for (const type of IMPORTED_CONTENT_TYPES) {
      expect(confirmImportedContent(preview, { workspaceId: 'apfc', contentType: type }).contentType).toBe(type);
    }
  });
});

describe('5. Notes import regression (via the shared foundation)', () => {
  it('deriveContentTitle behaves identically to the pre-refactor logic: heading > filename > fallback', () => {
    expect(deriveContentTitle('x.md', '# Real Title\n\nBody')).toBe('Real Title');
    expect(deriveContentTitle('my-file.docx', 'No heading here.')).toBe('my-file');
    expect(deriveContentTitle('.docx', 'No heading here.')).toBe('Imported content');
    expect(deriveContentTitle('.docx', 'No heading here.', 'Custom fallback')).toBe('Custom fallback');
  });

  it('extractContentFromFile is the exact function lib/noteImport.ts\'s importNoteFile delegates to — full regression coverage lives in noteImport.test.ts', async () => {
    const file = new File(['# Title\n\nBody'], 'notes.md');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'markdown', text: '# Title\n\nBody' } });
  });
});

describe('6. objective vs descriptive content-type separation', () => {
  it('OBJECTIVE_QUESTION_CONTENT_TYPES and DESCRIPTIVE_CONTENT_TYPES never overlap', () => {
    const overlap = OBJECTIVE_QUESTION_CONTENT_TYPES.filter((t) => (DESCRIPTIVE_CONTENT_TYPES as readonly ImportedContentType[]).includes(t));
    expect(overlap).toEqual([]);
  });

  it('isObjectiveQuestionContentType / isDescriptiveContentType classify every content type correctly', () => {
    expect(isObjectiveQuestionContentType('pyq')).toBe(true);
    expect(isObjectiveQuestionContentType('question_bank')).toBe(true);
    expect(isObjectiveQuestionContentType('descriptive_questions')).toBe(false);
    expect(isDescriptiveContentType('descriptive_questions')).toBe(true);
    expect(isDescriptiveContentType('pyq')).toBe(false);
    expect(isDescriptiveContentType('question_bank')).toBe(false);
  });

  it('note/document/study_material/research_document/bibliography/other are neither objective nor descriptive question content', () => {
    for (const type of ['note', 'document', 'study_material', 'research_document', 'bibliography', 'other'] as const) {
      expect(isObjectiveQuestionContentType(type)).toBe(false);
      expect(isDescriptiveContentType(type)).toBe(false);
    }
  });
});

describe('8. updatedAt (Personal Content Repository foundation)', () => {
  it('confirmImportedContent stamps updatedAt equal to the same instant as provenance.importedAt', () => {
    const preview = buildImportPreview({ name: 'a.md' }, { format: 'markdown', text: 'x' });
    const content = confirmImportedContent(preview, { workspaceId: 'apfc', contentType: 'document', importedAt: '2026-01-01T00:00:00.000Z' });
    expect(content.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(content.updatedAt).toBe(content.provenance.importedAt);
  });

  it('createManualImportedContent stamps updatedAt equal to the same instant as provenance.importedAt', () => {
    const content = createManualImportedContent({ workspaceId: 'phd_research', contentType: 'study_material', title: 'Revision sheet', createdAt: '2026-02-02T00:00:00.000Z' });
    expect(content.updatedAt).toBe('2026-02-02T00:00:00.000Z');
    expect(content.updatedAt).toBe(content.provenance.importedAt);
  });
});

describe('7. no fabricated question creation', () => {
  it('ImportedContent never carries options/correctOptionId — it cannot represent an MCQ, only raw imported text', () => {
    const preview = buildImportPreview({ name: 'gs1-question-bank.docx' }, { format: 'docx', text: 'Some prose that looks like it could contain questions.' });
    const content = confirmImportedContent(preview, { workspaceId: 'upsc_cse', contentType: 'question_bank' });
    expect(content).not.toHaveProperty('options');
    expect(content).not.toHaveProperty('correctOptionId');
    // the raw text is preserved verbatim, never restructured into question objects
    expect(content.rawContent).toBe('Some prose that looks like it could contain questions.');
  });

  it('importing a file suggested as \'pyq\' does not produce any PYQ-shaped objects, arrays, or answer keys — only one ImportedContent record', () => {
    const preview = buildImportPreview({ name: 'previous-year-questions.pdf' }, { format: 'pdf', text: 'Q1. What is the capital of India? (a) Mumbai (b) Delhi' });
    const content = confirmImportedContent(preview, { workspaceId: 'upsc_cse', contentType: 'pyq' });
    expect(Array.isArray(content)).toBe(false);
    expect(typeof content.rawContent).toBe('string');
    expect(content).not.toHaveProperty('questionIds');
    expect(content).not.toHaveProperty('answers');
  });

  it('extractContentFromFile and buildImportPreview never inspect content to auto-generate questions — the text passes through byte-for-byte', async () => {
    const raw = 'Q1. Is this a question? (a) Yes (b) No\nQ2. Another one? (a) Maybe';
    const file = new File([raw], 'looks-like-mcqs.txt');
    const extracted = await extractContentFromFile(file);
    expect(extracted.status).toBe('ok');
    if (extracted.status === 'ok') {
      expect(extracted.content.text).toBe(raw);
      const preview = buildImportPreview(file, extracted.content);
      expect(preview.content).toBe(raw);
    }
  });
});
