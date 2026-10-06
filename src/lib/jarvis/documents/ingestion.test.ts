import { describe, it, expect } from 'vitest';
import {
  detectDocumentFormat,
  ingestDocumentSource,
  ingestTextSource,
  ingestMarkdownSource,
  ingestPdfSource,
  ingestDocxSource,
  htmlToMarkdownText,
  normalizeExtractedText,
  chunkText,
  buildDocumentChunks,
  isLikelyScannedPdf,
  prepareSummarizationPlan,
  DEFAULT_MAX_CHUNK_CHARS,
  type JarvisDocumentSource,
  type JarvisExtractedDocument,
} from './ingestion';

function textSource(filename: string, mimeType: string, text: string): JarvisDocumentSource {
  return { filename, mimeType, data: new TextEncoder().encode(text).buffer };
}

/**
 * Builds a minimal, real, valid single-page PDF byte buffer whose page content stream is exactly
 * `contentStream` — the same minimal PDF structure verified (this phase's own report) to extract
 * correctly via pdfjs-dist's legacy build under plain Node. Passing an empty/whitespace
 * content stream produces a page pdfjs can open but that yields no text (used for the scanned-PDF
 * test); passing a `Tj`-drawing stream produces real extractable text.
 */
function buildMinimalPdf(contentStream: string): ArrayBuffer {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 1000 200]/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${contentStream.length}>>
stream
${contentStream}
endstream
endobj
trailer<</Size 6/Root 1 0 R>>
%%EOF`;
  return new TextEncoder().encode(pdf).buffer;
}

const textPdfSource = (filename = 'notes.pdf'): JarvisDocumentSource => ({
  filename,
  mimeType: 'application/pdf',
  data: buildMinimalPdf('BT /F1 24 Tf 10 100 Td (Merchant capitalism preceded industrial capital formation.) Tj ET'),
});

const blankPdfSource = (): JarvisDocumentSource => ({ filename: 'scan.pdf', mimeType: 'application/pdf', data: buildMinimalPdf('') });

describe('detectDocumentFormat — supported file contract (Part 11)', () => {
  it('detects text, markdown, pdf, and docx by MIME type', () => {
    expect(detectDocumentFormat({ mimeType: 'text/plain', filename: 'a.txt' })).toBe('text');
    expect(detectDocumentFormat({ mimeType: 'text/markdown', filename: 'a.md' })).toBe('markdown');
    expect(detectDocumentFormat({ mimeType: 'application/pdf', filename: 'a.pdf' })).toBe('pdf');
    expect(detectDocumentFormat({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'a.docx' })).toBe('docx');
  });

  it('falls back to filename extension when MIME type is generic/missing', () => {
    expect(detectDocumentFormat({ mimeType: 'application/octet-stream', filename: 'notes.md' })).toBe('markdown');
    expect(detectDocumentFormat({ mimeType: '', filename: 'report.pdf' })).toBe('pdf');
  });

  it('reports unsupported for anything else, never a silent guess', () => {
    expect(detectDocumentFormat({ mimeType: 'image/png', filename: 'scan.png' })).toBe('unsupported');
    expect(detectDocumentFormat({ mimeType: 'application/zip', filename: 'archive.zip' })).toBe('unsupported');
  });
});

describe('ingestTextSource / ingestMarkdownSource — real, working ingestion', () => {
  it('ingests plain text verbatim', async () => {
    const result = await ingestTextSource(textSource('note.txt', 'text/plain', 'Just a plain note.'));
    expect(result).toEqual({ status: 'ok', document: { text: 'Just a plain note.', format: 'text', title: 'note' } });
  });

  it('ingests markdown and derives the title from the first heading', async () => {
    const result = await ingestMarkdownSource(textSource('doc.md', 'text/markdown', '# Chapter 4\n\nMerchant capitalism.'));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.document.title).toBe('Chapter 4');
      expect(result.document.format).toBe('markdown');
    }
  });

  it('falls back to the filename when markdown has no heading', async () => {
    const result = await ingestMarkdownSource(textSource('untitled-notes.md', 'text/markdown', 'Just prose, no heading.'));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.document.title).toBe('untitled-notes');
  });

  it('ingests an empty text file without error — empty is a valid document, not a failure', async () => {
    const result = await ingestTextSource(textSource('empty.txt', 'text/plain', ''));
    expect(result).toEqual({ status: 'ok', document: { text: '', format: 'text', title: 'empty' } });
  });
});

describe('ingestPdfSource — real pdfjs-dist extraction (genuinely executed, not mocked)', () => {
  it('extracts real text from a real minimal PDF, with page provenance', async () => {
    const result = await ingestPdfSource(textPdfSource());
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.document.format).toBe('pdf');
      expect(result.document.pages).toHaveLength(1);
      expect(result.document.pages?.[0].pageNumber).toBe(1);
      expect(result.document.pages?.[0].text).toContain('Merchant capitalism');
      expect(result.document.text).toContain('[Page 1]');
    }
  });

  it('reports needs_ocr for a PDF with no extractable text, never fabricating content', async () => {
    const result = await ingestPdfSource(blankPdfSource());
    expect(result).toEqual({ status: 'error', error: { capability: 'needs_ocr', message: expect.stringContaining('scanned/image-only') } });
  });

  it('reports parse_error for a genuinely corrupt/non-PDF file, never throwing out of the caller', async () => {
    const corrupt: JarvisDocumentSource = { filename: 'corrupt.pdf', mimeType: 'application/pdf', data: new TextEncoder().encode('this is not a pdf at all').buffer };
    const result = await ingestPdfSource(corrupt);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.capability).toBe('parse_error');
  });
});

describe('isLikelyScannedPdf', () => {
  it('treats near-empty text as scanned', () => {
    expect(isLikelyScannedPdf([{ pageNumber: 1, text: '   ' }])).toBe(true);
  });

  it('treats real text as not scanned', () => {
    expect(isLikelyScannedPdf([{ pageNumber: 1, text: 'A substantial amount of real extracted text content here.' }])).toBe(false);
  });
});

describe('ingestDocxSource — DOCX HTML-to-Markdown step (real, tested); mammoth call (real, not unit-testable here)', () => {
  // The mammoth-dependent extraction itself is real, implemented code — see ingestion.ts's own
  // header for why this phase follows lib/contentImport.ts's own precedent and does not attempt
  // to unit-test the mammoth call under Vitest: mammoth resolves under plain Node to a build
  // whose API contract differs from the browser build this code actually calls with
  // `{ arrayBuffer }`, so a Node-side "success" here would not prove the real (browser) path
  // works, and could mask a real regression. htmlToMarkdownText has no such split and IS fully
  // tested below.
  it('converts HTML headings/paragraphs to Markdown via turndown, with no mammoth involved', async () => {
    const markdown = await htmlToMarkdownText('<h1>Chapter 4</h1><p>Merchant capitalism preceded industrial capital.</p>');
    expect(markdown).toContain('# Chapter 4');
    expect(markdown).toContain('Merchant capitalism preceded industrial capital.');
  });

  it('ingestDocxSource is defined and returns the documented result shape (exercised with malformed input, since a real .docx requires mammoth)', async () => {
    const malformed: JarvisDocumentSource = {
      filename: 'broken.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: new TextEncoder().encode('not a real docx file').buffer,
    };
    const result = await ingestDocxSource(malformed);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.capability).toBe('parse_error');
  });
});

describe('ingestDocumentSource — dispatcher', () => {
  it('routes to the correct extractor by detected format', async () => {
    const result = await ingestDocumentSource(textSource('note.txt', 'text/plain', 'hello'));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.document.format).toBe('text');
  });

  it('returns an explicit unsupported error for an unrecognised file, never a successful empty result', async () => {
    const result = await ingestDocumentSource(textSource('image.png', 'image/png', ''));
    expect(result).toEqual({ status: 'error', error: { capability: 'unsupported', message: expect.stringContaining('image/png') } });
  });
});

describe('normalizeExtractedText — Part 6', () => {
  it('normalises CRLF/CR line endings to LF', () => {
    expect(normalizeExtractedText('line1\r\nline2\rline3')).toBe('line1\nline2\nline3');
  });

  it('collapses 3+ blank lines to exactly one, preserving the paragraph boundary', () => {
    expect(normalizeExtractedText('para1\n\n\n\n\npara2')).toBe('para1\n\npara2');
  });

  it('strips trailing per-line whitespace without touching word content', () => {
    expect(normalizeExtractedText('text with trailing spaces   \nmore text')).toBe('text with trailing spaces\nmore text');
  });

  it('never alters the actual words of the source', () => {
    const source = 'Merchant   capitalism preceded industrial capital formation.';
    expect(normalizeExtractedText(source)).toContain('Merchant   capitalism preceded industrial capital formation.');
  });
});

describe('chunkText — Part 7', () => {
  it('keeps a short document as a single chunk', () => {
    expect(chunkText('One short paragraph.')).toEqual(['One short paragraph.']);
  });

  it('splits on paragraph boundaries, never mid-sentence, once the bound is exceeded', () => {
    const paragraph = 'x'.repeat(DEFAULT_MAX_CHUNK_CHARS - 10);
    const chunks = chunkText(`${paragraph}\n\nA short second paragraph.`);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(paragraph);
  });

  it('never produces an empty chunk for blank/whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n\n   ')).toEqual([]);
  });

  it('never produces a duplicate chunk for input with repeated blank-line separators', () => {
    const chunks = chunkText('para one\n\n\n\npara two');
    expect(chunks).toEqual(['para one\n\npara two']);
  });

  it('keeps an oversized single paragraph intact rather than cutting it mid-sentence', () => {
    const longParagraph = 'word '.repeat(2000).trim();
    const chunks = chunkText(longParagraph, 100);
    expect(chunks).toEqual([longParagraph]);
  });
});

describe('buildDocumentChunks — provenance + deterministic ordering', () => {
  it('builds one section per PDF page and preserves page provenance on every chunk', () => {
    const extracted: JarvisExtractedDocument = {
      format: 'pdf',
      text: '[Page 1]\n\nFirst page text.\n\n[Page 2]\n\nSecond page text.',
      pages: [
        { pageNumber: 1, text: 'First page text.' },
        { pageNumber: 2, text: 'Second page text.' },
      ],
    };
    const { sections, chunks } = buildDocumentChunks({ documentId: 'doc-1', extracted });

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ documentId: 'doc-1', startPage: 1, endPage: 1 });
    expect(chunks[0]).toMatchObject({ documentId: 'doc-1', sectionId: sections[0].id, startPage: 1, endPage: 1, order: 0 });
    expect(chunks[1]).toMatchObject({ sectionId: sections[1].id, startPage: 2, endPage: 2, order: 1 });
  });

  it('derives sections from headings for a page-less (markdown) document', () => {
    const extracted: JarvisExtractedDocument = { format: 'markdown', text: '# Intro\n\nIntro text.\n\n# Chapter 4\n\nChapter text.' };
    const { sections, chunks } = buildDocumentChunks({ documentId: 'doc-2', extracted });

    expect(sections.map((s) => s.title)).toEqual(['Intro', 'Chapter 4']);
    expect(chunks.every((c) => c.documentId === 'doc-2')).toBe(true);
    expect(chunks.map((c) => c.order)).toEqual([0, 1]);
  });

  it('is fully deterministic — the same input always produces the same output', () => {
    const extracted: JarvisExtractedDocument = { format: 'text', text: 'Some plain text content.' };
    const a = buildDocumentChunks({ documentId: 'doc-3', extracted });
    const b = buildDocumentChunks({ documentId: 'doc-3', extracted });
    expect(a).toEqual(b);
  });

  it('produces no sections or chunks for an empty document, never a fabricated placeholder', () => {
    const extracted: JarvisExtractedDocument = { format: 'text', text: '' };
    expect(buildDocumentChunks({ documentId: 'doc-empty', extracted })).toEqual({ sections: [], chunks: [] });
  });

  it('every chunk id is unique and stable across the whole document', () => {
    const extracted: JarvisExtractedDocument = { format: 'markdown', text: '# A\n\ntext a\n\n# B\n\ntext b' };
    const { chunks } = buildDocumentChunks({ documentId: 'doc-4', extracted });
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
  });
});

describe('prepareSummarizationPlan — Part 10, composition over the existing Phase 6 planner', () => {
  it('produces a plan whose chunk-level steps match the built chunks exactly', () => {
    const extracted: JarvisExtractedDocument = { format: 'markdown', text: '# A\n\ntext a\n\n# B\n\ntext b' };
    const built = buildDocumentChunks({ documentId: 'doc-5', extracted });
    const plan = prepareSummarizationPlan('doc-5', built);

    const chunkSteps = plan.steps.filter((s) => s.level === 'chunk');
    expect(chunkSteps.map((s) => s.outputId)).toEqual(built.chunks.map((c) => c.id));
    expect(plan.steps.some((s) => s.level === 'document' && s.outputId === 'doc-5')).toBe(true);
  });
});
