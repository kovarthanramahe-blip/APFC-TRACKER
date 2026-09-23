import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
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
  parseCsvRows,
  csvRowsToMarkdownTable,
  buildMarkdownFromPdfPages,
  htmlToMarkdown,
  DOCX_STYLE_MAP,
  truncateForPreview,
  PREVIEW_TRUNCATION_LIMIT_CHARS,
  IMPORTED_CONTENT_TYPES,
  OBJECTIVE_QUESTION_CONTENT_TYPES,
  DESCRIPTIVE_CONTENT_TYPES,
  deriveContentTitle,
  type ImportedContentType,
  type PdfPageTextItem,
} from './contentImport';

// A small, self-contained DOCX builder for real mammoth/turndown extraction tests — a hand-rolled
// zip of the minimal OOXML parts mammoth needs (no styles.xml: mammoth's DEFAULT style map already
// matches Word's built-in Heading1-6/Title/Subtitle by their raw style ID, e.g. `p.Heading1 =>
// h1:fresh` — see contentImport.ts's own DOCX_STYLE_MAP comment — so a styles.xml definition isn't
// required for that matching to work, only harmless "style not defined" warnings mammoth ignores).
async function buildDocxFile(paragraphs: { text: string; style?: string }[], filename = 'test.docx'): Promise<File> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = paragraphs
    .map((p) => {
      const styleTag = p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : '';
      return `<w:p>${styleTag}<w:r><w:t xml:space="preserve">${escape(p.text)}</w:t></w:r></w:p>`;
    })
    .join('');
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([Buffer.from(bytes)], filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

describe('1. supported file types', () => {
  it('SUPPORTED_IMPORT_EXTENSIONS lists exactly md/markdown/docx/pdf/txt/csv/json', () => {
    expect([...SUPPORTED_IMPORT_EXTENSIONS].sort()).toEqual(['.csv', '.docx', '.json', '.markdown', '.md', '.pdf', '.txt']);
  });

  it.each([
    ['notes.md', 'markdown'],
    ['notes.markdown', 'markdown'],
    ['report.docx', 'docx'],
    ['report.pdf', 'pdf'],
    ['plain.txt', 'text'],
    ['data.csv', 'csv'],
    ['data.json', 'json'],
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

describe('1b. CSV parsing (parseCsvRows / csvRowsToMarkdownTable)', () => {
  it('parses a simple comma-separated file into rows of cells', () => {
    expect(parseCsvRows('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields containing commas, newlines, and escaped quotes', () => {
    const csv = 'title,note\n"Smith, John","Said ""hello""\nnext line"';
    expect(parseCsvRows(csv)).toEqual([
      ['title', 'note'],
      ['Smith, John', 'Said "hello"\nnext line'],
    ]);
  });

  it('handles \\r\\n line endings the same as \\n', () => {
    expect(parseCsvRows('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('never produces a spurious empty trailing row from a trailing newline', () => {
    expect(parseCsvRows('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('an empty string produces zero rows', () => {
    expect(parseCsvRows('')).toEqual([]);
  });

  it('csvRowsToMarkdownTable renders a faithful Markdown table from the exact same cell values', () => {
    const table = csvRowsToMarkdownTable([
      ['Name', 'Score'],
      ['Alice', '90'],
      ['Bob', '85'],
    ]);
    expect(table).toBe('| Name | Score |\n| --- | --- |\n| Alice | 90 |\n| Bob | 85 |');
  });

  it('escapes a literal pipe inside a cell so it is never mistaken for a column boundary', () => {
    const table = csvRowsToMarkdownTable([
      ['Name', 'Note'],
      ['Alice', 'A | B'],
    ]);
    expect(table).toContain('A \\| B');
  });

  it('pads a ragged (shorter) row out to the header\'s column count rather than dropping data', () => {
    const table = csvRowsToMarkdownTable([
      ['A', 'B', 'C'],
      ['1'],
    ]);
    expect(table).toBe('| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |');
  });

  it('returns an empty string for zero rows, never a fabricated table', () => {
    expect(csvRowsToMarkdownTable([])).toBe('');
  });
});

describe('1c. CSV/JSON file extraction end-to-end', () => {
  it('extractContentFromFile converts a real CSV file into a Markdown table', async () => {
    const file = new File(['Name,Score\nAlice,90\nBob,85'], 'scores.csv');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'csv', text: '| Name | Score |\n| --- | --- |\n| Alice | 90 |\n| Bob | 85 |' } });
  });

  it('extractContentFromFile rejects an empty CSV rather than fabricating a table', async () => {
    const file = new File([''], 'empty.csv');
    const result = await extractContentFromFile(file);
    expect(result.status).toBe('error');
  });

  it('extractContentFromFile pretty-prints valid JSON, never reinterpreting its structure', async () => {
    const file = new File(['{"a":1,"b":[2,3]}'], 'data.json');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'json', text: JSON.stringify({ a: 1, b: [2, 3] }, null, 2) } });
  });

  it('extractContentFromFile reports a clear error for malformed JSON instead of inventing content', async () => {
    const file = new File(['{not valid json'], 'broken.json');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'error', message: expect.stringContaining('valid JSON') });
  });

  it('a JSON file containing only a primitive (not an object/array) is still faithfully round-tripped', async () => {
    const file = new File(['"just a string"'], 'primitive.json');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'json', text: '"just a string"' } });
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

describe('8. PDF page-boundary preservation (buildMarkdownFromPdfPages)', () => {
  it('marks each page that contributes real text with its own real, 1-based page number', () => {
    const pages: PdfPageTextItem[][] = [
      [{ text: 'First page content', fontSize: 12 }],
      [{ text: 'Second page content', fontSize: 12 }],
      [{ text: 'Third page content', fontSize: 12 }],
    ];
    const markdown = buildMarkdownFromPdfPages(pages);
    expect(markdown).toContain('[Page 1]');
    expect(markdown).toContain('[Page 2]');
    expect(markdown).toContain('[Page 3]');
    // Markers appear in real page order, before their own page's content.
    expect(markdown.indexOf('[Page 1]')).toBeLessThan(markdown.indexOf('First page content'));
    expect(markdown.indexOf('[Page 1]')).toBeLessThan(markdown.indexOf('[Page 2]'));
    expect(markdown.indexOf('[Page 2]')).toBeLessThan(markdown.indexOf('Second page content'));
  });

  it('a blank page in the middle gets no marker, but the real page numbers on either side are never renumbered to close the gap', () => {
    const pages: PdfPageTextItem[][] = [
      [{ text: 'Page one text', fontSize: 12 }],
      [], // blank page — no extractable text
      [{ text: 'Page three text', fontSize: 12 }],
    ];
    const markdown = buildMarkdownFromPdfPages(pages);
    expect(markdown).toContain('[Page 1]');
    expect(markdown).not.toContain('[Page 2]'); // the blank page contributes nothing, not even a marker
    expect(markdown).toContain('[Page 3]'); // real position preserved — never renumbered to "[Page 2]"
  });

  it('a single-page document still gets a page marker', () => {
    const pages: PdfPageTextItem[][] = [[{ text: 'Only page', fontSize: 12 }]];
    expect(buildMarkdownFromPdfPages(pages)).toContain('[Page 1]');
  });

  it('an all-blank document still produces an empty string — a marker is never fabricated for content that does not exist', () => {
    const pages: PdfPageTextItem[][] = [[], [{ text: '   ', fontSize: 12 }], []];
    expect(buildMarkdownFromPdfPages(pages)).toBe('');
  });

  it('heading/list heuristics still apply within each page, alongside its marker', () => {
    const pages: PdfPageTextItem[][] = [[{ text: 'Chapter One', fontSize: 24 }, { text: 'Body text.', fontSize: 12 }]];
    const markdown = buildMarkdownFromPdfPages(pages);
    expect(markdown).toContain('[Page 1]');
    expect(markdown).toContain('## Chapter One');
  });
});

// NOTE on DOCX test scope: extractMarkdownFromDocx/extractContentFromFile call
// mammoth.convertToHtml({ arrayBuffer }) — the correct API this app's real, Vite-bundled browser
// build resolves via mammoth's package.json "browser" field (confirmed: mammoth ships genuinely
// different Node (lib/unzip.js, {buffer}-only) and browser (browser/unzip.js, {arrayBuffer}-only)
// implementations, swapped in by bundlers via that field). This repo's Vitest runner executes
// tests in Node, where that swap never happens — verified exhaustively (resolve.conditions,
// ssr.resolve.mainFields/conditions, ssr.target, test.server.deps.inline, and a per-file
// `@vitest-environment happy-dom` override were all tried and none changed the outcome) — so
// extractContentFromFile('docx') cannot be exercised end-to-end here. This is a genuine Node-vs-
// browser environment limitation of the test runner, not a defect in the extraction code, which is
// exactly why the task calls for a browser smoke test through the real Import Centre for DOCX (see
// the task report) — that is the actual end-to-end coverage for the real File -> mammoth path.
// These tests instead cover the same real logic at its natural seams: htmlToMarkdown (the pure
// HTML -> Markdown half of extractMarkdownFromDocx, no mammoth involved) directly on real HTML
// strings, and DOCX_STYLE_MAP (the exact constant extractMarkdownFromDocx passes to mammoth)
// verified against real mammoth output via its Node-native {buffer} input — a different, equally
// real mammoth API, just not the one the browser path happens to use.
describe('9. DOCX extraction — htmlToMarkdown + DOCX_STYLE_MAP (mammoth + turndown pipeline)', () => {
  it('htmlToMarkdown converts headings and paragraphs to Markdown, preserving structure', async () => {
    const html = '<h1>Chapter One</h1><p>This is the first paragraph of body text.</p><h2>Section A</h2><p>More body text here.</p>';
    const markdown = await htmlToMarkdown(html);
    expect(markdown).toContain('# Chapter One');
    expect(markdown).toContain('This is the first paragraph of body text.');
    expect(markdown).toContain('## Section A');
    expect(markdown).toContain('More body text here.');
  });

  it('htmlToMarkdown never fabricates structure — a plain paragraph gets no heading styling', async () => {
    const markdown = await htmlToMarkdown('<p>First paragraph.</p><p>Second paragraph.</p>');
    expect(markdown).not.toMatch(/^#/m);
    expect(markdown).toContain('First paragraph.');
    expect(markdown).toContain('Second paragraph.');
  });

  it('htmlToMarkdown of empty HTML produces an empty string, never fabricated content', async () => {
    expect(await htmlToMarkdown('')).toBe('');
  });

  it("DOCX_STYLE_MAP maps Word's built-in Heading1/Heading2/Title/Subtitle to the right HTML heading levels — verified against mammoth's own real conversion", async () => {
    const mammoth = (await import('mammoth')).default;
    const file = await buildDocxFile([
      { text: 'My Document Title', style: 'Title' },
      { text: 'A subtitle', style: 'Subtitle' },
      { text: 'Chapter One', style: 'Heading1' },
      { text: 'Body text.' },
      { text: 'Section A', style: 'Heading2' },
    ]);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value: html } = await mammoth.convertToHtml({ buffer }, { styleMap: DOCX_STYLE_MAP });
    expect(html).toContain('<h1>My Document Title</h1>');
    expect(html).toContain('<h2>A subtitle</h2>');
    expect(html).toContain('<h1>Chapter One</h1>');
    expect(html).toContain('<h2>Section A</h2>');
    expect(html).toContain('<p>Body text.</p>');
    // And the full real pipeline (mammoth HTML -> htmlToMarkdown) end-to-end on that same real HTML:
    const markdown = await htmlToMarkdown(html);
    expect(markdown).toContain('# My Document Title');
    expect(markdown).toContain('## A subtitle');
    expect(markdown).toContain('# Chapter One');
    expect(markdown).toContain('## Section A');
  });

  it('a corrupted/non-DOCX byte stream is rejected by mammoth rather than silently producing fabricated content', async () => {
    const mammoth = (await import('mammoth')).default;
    const buffer = Buffer.from('this is not a real docx — just plain garbage bytes');
    await expect(mammoth.convertToHtml({ buffer }, { styleMap: DOCX_STYLE_MAP })).rejects.toThrow();
  });

  it('a DOCX with no paragraphs at all extracts to empty HTML and empty Markdown — never fabricated content', async () => {
    const mammoth = (await import('mammoth')).default;
    const file = await buildDocxFile([]);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value: html } = await mammoth.convertToHtml({ buffer }, { styleMap: DOCX_STYLE_MAP });
    expect(html).toBe('');
    expect(await htmlToMarkdown(html)).toBe('');
  });
});

describe('10. TXT/Markdown extraction — preserve structure, no unnecessary transformation', () => {
  it('a .txt file with multiple paragraphs and blank lines is preserved exactly (only line-ending normalisation + outer trim)', async () => {
    const raw = 'First paragraph.\n\nSecond paragraph.\n\n- a plain dash, not reinterpreted as a list marker by this format\n\nThird paragraph.';
    const file = new File([raw], 'notes.txt');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'text', text: raw } });
  });

  it('a .txt file with Windows line endings is normalised to \\n, never otherwise altered', async () => {
    const file = new File(['Line one.\r\nLine two.\r\nLine three.'], 'crlf.txt');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'text', text: 'Line one.\nLine two.\nLine three.' } });
  });

  it('a .md file with real Markdown structure (headings, lists, code) passes through completely untouched', async () => {
    const raw = '# Title\n\n## Subheading\n\n- item one\n- item two\n\n```js\nconst x = 1;\n```\n\nA closing paragraph.';
    const file = new File([raw], 'doc.md');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'markdown', text: raw } });
  });

  it('.markdown (the long extension) behaves identically to .md', async () => {
    const raw = '# Same behaviour';
    const file = new File([raw], 'doc.markdown');
    const result = await extractContentFromFile(file);
    expect(result).toEqual({ status: 'ok', content: { format: 'markdown', text: raw } });
  });
});

describe('11. Preview truncation (truncateForPreview) — large documents stay responsive', () => {
  it('text at or under the limit is never truncated, and totalLength matches the real length', () => {
    const short = 'A short extracted document.';
    const result = truncateForPreview(short, 100);
    expect(result).toEqual({ text: short, truncated: false, totalLength: short.length });
  });

  it('text over the limit is cut to exactly the limit, verbatim (never reformatted or summarised)', () => {
    const long = 'x'.repeat(500);
    const result = truncateForPreview(long, 100);
    expect(result.truncated).toBe(true);
    expect(result.text).toBe('x'.repeat(100));
    expect(result.text.length).toBe(100);
    expect(result.totalLength).toBe(500);
  });

  it('the truncated text is always a real, exact prefix of the original — never altered content', () => {
    const long = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const result = truncateForPreview(long, 40);
    expect(long.startsWith(result.text)).toBe(true);
  });

  it('the default limit is a sane, positive number used when no explicit limit is passed', () => {
    expect(PREVIEW_TRUNCATION_LIMIT_CHARS).toBeGreaterThan(0);
    const long = 'y'.repeat(PREVIEW_TRUNCATION_LIMIT_CHARS + 1);
    expect(truncateForPreview(long).truncated).toBe(true);
    const short = 'y'.repeat(PREVIEW_TRUNCATION_LIMIT_CHARS);
    expect(truncateForPreview(short).truncated).toBe(false);
  });

  it('truncation is a display concern only — it never touches what buildImportPreview/confirmImportedContent carry as the real content', async () => {
    const long = 'z'.repeat(PREVIEW_TRUNCATION_LIMIT_CHARS * 2);
    const file = new File([long], 'huge.txt');
    const result = await extractContentFromFile(file);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const preview = buildImportPreview(file, result.content);
    expect(preview.content.length).toBe(long.length); // never pre-truncated by the pipeline itself
    const saved = confirmImportedContent(preview, { workspaceId: 'apfc', contentType: 'document' });
    expect(saved.rawContent.length).toBe(long.length); // confirm always saves the FULL text
  });
});
