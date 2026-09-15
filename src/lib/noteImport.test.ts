import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_IMPORT_EXTENSIONS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  getImportFileKind,
  validateImportFile,
  normalizeMarkdownText,
  isNearEmptyContent,
  deriveNoteTitle,
  buildMarkdownFromPdfPages,
  importNoteFile,
  type PdfPageTextItem,
} from './noteImport';

describe('1. markdown extraction', () => {
  it('importNoteFile reads a .md file as-is (normalized) via file.text()', async () => {
    const file = new File(['# My Heading\n\nSome body text.'], 'notes.md', { type: 'text/markdown' });
    const result = await importNoteFile(file);
    expect(result).toEqual({ status: 'ok', title: 'My Heading', content: '# My Heading\n\nSome body text.' });
  });

  it('works for .markdown too', async () => {
    const file = new File(['Just plain content, no heading.'], 'plain.markdown');
    const result = await importNoteFile(file);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.content).toBe('Just plain content, no heading.');
      expect(result.title).toBe('plain'); // falls back to filename since there is no heading
    }
  });

  it('preserves lists and multiple headings verbatim', async () => {
    const md = '# Title\n\n## Section\n\n- one\n- two\n\n1. first\n2. second';
    const file = new File([md], 'structured.md');
    const result = await importNoteFile(file);
    expect(result).toEqual({ status: 'ok', title: 'Title', content: md });
  });

  it('normalizeMarkdownText normalizes CRLF/CR line endings and trims', () => {
    expect(normalizeMarkdownText('line1\r\nline2\rline3\n\n  ')).toBe('line1\nline2\nline3');
  });
});

describe('2. file extension/type validation', () => {
  it.each([
    ['notes.md', 'markdown'],
    ['notes.MD', 'markdown'],
    ['notes.markdown', 'markdown'],
    ['report.docx', 'docx'],
    ['report.pdf', 'pdf'],
    ['old.doc', 'doc'],
    ['image.png', 'unsupported'],
    ['archive.zip', 'unsupported'],
    ['no-extension', 'unsupported'],
  ] as const)('classifies %s as %s', (filename, expectedKind) => {
    expect(getImportFileKind(filename)).toBe(expectedKind);
  });

  it('SUPPORTED_IMPORT_EXTENSIONS lists exactly md/markdown/docx/pdf', () => {
    expect([...SUPPORTED_IMPORT_EXTENSIONS].sort()).toEqual(['.docx', '.markdown', '.md', '.pdf']);
  });

  it('validateImportFile accepts every supported extension with a normal size', () => {
    for (const kind of ['notes.md', 'notes.markdown', 'report.docx', 'report.pdf']) {
      const result = validateImportFile({ name: kind, size: 1024 });
      expect(result.valid).toBe(true);
    }
  });

  it('validateImportFile rejects an unsupported extension', () => {
    const result = validateImportFile({ name: 'image.png', size: 1024 });
    expect(result.valid).toBe(false);
    expect(result.kind).toBe('unsupported');
    expect(result.error).toContain('Unsupported file type');
  });

  it('importNoteFile rejects an unsupported extension without attempting to read the file', async () => {
    const file = new File(['irrelevant'], 'photo.jpg');
    const result = await importNoteFile(file);
    expect(result).toEqual({ status: 'error', message: expect.stringContaining('Unsupported file type') });
  });
});

describe('3. file-size validation', () => {
  it('validateImportFile accepts a file exactly at the size limit', () => {
    const result = validateImportFile({ name: 'notes.md', size: MAX_IMPORT_FILE_SIZE_BYTES });
    expect(result.valid).toBe(true);
  });

  it('validateImportFile rejects a file one byte over the size limit', () => {
    const result = validateImportFile({ name: 'notes.md', size: MAX_IMPORT_FILE_SIZE_BYTES + 1 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10 MB import limit');
  });

  it('validateImportFile rejects a zero-byte file', () => {
    const result = validateImportFile({ name: 'notes.md', size: 0 });
    expect(result.valid).toBe(false);
  });

  it('respects a custom maxBytes override', () => {
    expect(validateImportFile({ name: 'notes.md', size: 2000 }, 1000).valid).toBe(false);
    expect(validateImportFile({ name: 'notes.md', size: 500 }, 1000).valid).toBe(true);
  });

  it('importNoteFile rejects an oversized file without attempting to read it', async () => {
    const file = new File(['x'], 'huge.md');
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_FILE_SIZE_BYTES + 1 });
    const result = await importNoteFile(file);
    expect(result).toEqual({ status: 'error', message: expect.stringContaining('10 MB import limit') });
  });
});

describe('4. unsupported .doc handling', () => {
  it('validateImportFile rejects .doc with the exact required message', () => {
    const result = validateImportFile({ name: 'old-notes.doc', size: 1024 });
    expect(result.valid).toBe(false);
    expect(result.kind).toBe('doc');
    expect(result.error).toBe("Legacy .doc files aren't supported yet. Please save the document as .docx or PDF and upload it again.");
  });

  it('importNoteFile rejects .doc with the exact required message, never attempting to parse it', async () => {
    const file = new File(['\xD0\xCF\x11\xE0 (fake OLE header bytes)'], 'legacy.doc');
    const result = await importNoteFile(file);
    expect(result).toEqual({
      status: 'error',
      message: "Legacy .doc files aren't supported yet. Please save the document as .docx or PDF and upload it again.",
    });
  });

  it('.doc is case-insensitively detected', () => {
    expect(getImportFileKind('OLD-FILE.DOC')).toBe('doc');
  });
});

describe('5. empty/near-empty extraction handling', () => {
  it('isNearEmptyContent is true for an empty string', () => {
    expect(isNearEmptyContent('')).toBe(true);
  });

  it('isNearEmptyContent is true for markdown punctuation/whitespace only', () => {
    expect(isNearEmptyContent('# \n\n- \n\n***\n')).toBe(true);
  });

  it('isNearEmptyContent is false once there is a meaningful amount of real text', () => {
    expect(isNearEmptyContent('# A real heading with actual words in it')).toBe(false);
  });

  it('buildMarkdownFromPdfPages returns an empty string for pages with no text items', () => {
    const pages: PdfPageTextItem[][] = [[], []];
    expect(buildMarkdownFromPdfPages(pages)).toBe('');
  });

  it('a near-empty buildMarkdownFromPdfPages result is what importNoteFile would treat as a likely scanned PDF', () => {
    const pages: PdfPageTextItem[][] = [[{ text: '  ', fontSize: 10 }]];
    const markdown = buildMarkdownFromPdfPages(pages);
    expect(isNearEmptyContent(markdown)).toBe(true);
  });
});

describe('buildMarkdownFromPdfPages heuristics', () => {
  it('treats a notably larger font size as a heading', () => {
    const pages: PdfPageTextItem[][] = [
      [
        { text: 'Chapter One', fontSize: 24 },
        { text: 'This is regular body text.', fontSize: 12 },
        { text: 'More regular body text.', fontSize: 12 },
      ],
    ];
    const markdown = buildMarkdownFromPdfPages(pages);
    expect(markdown).toContain('## Chapter One');
    expect(markdown).toContain('This is regular body text.');
    expect(markdown).not.toContain('## This is regular body text.');
  });

  it('treats bullet-prefixed lines as list items', () => {
    const pages: PdfPageTextItem[][] = [
      [
        { text: '• First point', fontSize: 12 },
        { text: '- Second point', fontSize: 12 },
      ],
    ];
    const markdown = buildMarkdownFromPdfPages(pages);
    expect(markdown).toContain('- First point');
    expect(markdown).toContain('- Second point');
  });

  it('keeps ordinal-numbered lines recognisable as an ordered list', () => {
    const pages: PdfPageTextItem[][] = [[{ text: '1. First step', fontSize: 12 }]];
    expect(buildMarkdownFromPdfPages(pages)).toContain('1. First step');
  });

  it('never mutates the input pages array', () => {
    const pages: PdfPageTextItem[][] = [[{ text: 'Hello', fontSize: 12 }]];
    const snapshot = JSON.stringify(pages);
    buildMarkdownFromPdfPages(pages);
    expect(JSON.stringify(pages)).toBe(snapshot);
  });
});

describe('deriveNoteTitle', () => {
  it('prefers the first Markdown heading', () => {
    expect(deriveNoteTitle('random-filename.md', '# Real Title\n\nBody')).toBe('Real Title');
  });

  it('falls back to the filename without extension when there is no heading', () => {
    expect(deriveNoteTitle('my-imported-file.docx', 'No heading here.')).toBe('my-imported-file');
  });

  it('falls back to a generic title when both the heading and filename are unusable', () => {
    expect(deriveNoteTitle('.docx', 'No heading here.')).toBe('Imported note');
  });
});

describe('malformed file handling (real library calls, garbage bytes)', () => {
  it('importNoteFile returns a friendly error for a .docx that is not actually a valid DOCX', async () => {
    const file = new File(['this is not a real docx file, just plain garbage bytes'], 'fake.docx');
    const result = await importNoteFile(file);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toBe("Could not read this file — please check it isn't corrupted and try again.");
    }
  });
});

describe('does not mutate its input', () => {
  it('importNoteFile does not alter the File object it was given', async () => {
    const file = new File(['# Title\n\nBody'], 'notes.md');
    const nameBefore = file.name;
    const sizeBefore = file.size;
    await importNoteFile(file);
    expect(file.name).toBe(nameBefore);
    expect(file.size).toBe(sizeBefore);
  });
});
