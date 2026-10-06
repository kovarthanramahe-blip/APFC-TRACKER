import { describe, it, expect } from 'vitest';
import type { JarvisDocument, JarvisDocumentChunk, JarvisDocumentCitation, JarvisDocumentSection } from './types';

// Contract/shape tests only — these types carry no logic of their own. The point is to confirm
// the shapes are actually usable for the documented scenarios (a page-bearing PDF, a page-less
// plain-text note, a failed extraction) without needing an optional field that isn't there.

describe('JarvisDocument contract', () => {
  it('supports a format with page information', () => {
    const doc: JarvisDocument = {
      id: 'doc-1',
      title: 'History Optional — Merchant Capitalism',
      filename: 'merchant-capitalism.pdf',
      mimeType: 'application/pdf',
      pageCount: 42,
      sizeBytes: 204800,
      processingState: 'indexed',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:05:00.000Z',
    };
    expect(doc.pageCount).toBe(42);
  });

  it('supports a format with no page concept at all (pageCount simply absent, never fabricated as 1)', () => {
    const doc: JarvisDocument = {
      id: 'doc-2',
      title: 'Pasted note',
      filename: 'note.txt',
      mimeType: 'text/plain',
      processingState: 'uploaded',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    expect(doc.pageCount).toBeUndefined();
  });

  it('carries a structured, safe error with the failing stage — never a raw exception', () => {
    const doc: JarvisDocument = {
      id: 'doc-3',
      title: 'Scanned chapter',
      filename: 'scan.pdf',
      mimeType: 'application/pdf',
      processingState: 'error',
      error: { stage: 'extracting', message: 'Could not extract text from this file.' },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    expect(doc.error?.stage).toBe('extracting');
    expect(doc.error?.message).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });
});

describe('JarvisDocumentChunk / JarvisDocumentCitation — provenance preservation', () => {
  const section: JarvisDocumentSection = { id: 'sec-4', documentId: 'doc-1', title: 'Chapter 4', order: 3, startPage: 51, endPage: 68 };

  const chunk: JarvisDocumentChunk = {
    id: 'chunk-4-2',
    documentId: 'doc-1',
    sectionId: section.id,
    order: 12,
    text: 'The author argues that merchant capitalism preceded industrial capital formation in the region by nearly a century.',
    startPage: 54,
    endPage: 54,
  };

  it('keeps a chunk traceable to its exact section and page', () => {
    expect(chunk.sectionId).toBe(section.id);
    expect(chunk.startPage).toBe(54);
  });

  it('a citation pointing at this chunk preserves the exact quote, never a paraphrase', () => {
    const citation: JarvisDocumentCitation = {
      documentId: chunk.documentId,
      chunkId: chunk.id,
      page: chunk.startPage,
      sectionTitle: section.title,
      quote: 'merchant capitalism preceded industrial capital formation in the region by nearly a century',
    };
    expect(chunk.text).toContain(citation.quote!);
  });

  it('a citation never requires a quote — omitted rather than invented when none was captured', () => {
    const citation: JarvisDocumentCitation = { documentId: chunk.documentId, chunkId: chunk.id };
    expect(citation.quote).toBeUndefined();
  });
});
