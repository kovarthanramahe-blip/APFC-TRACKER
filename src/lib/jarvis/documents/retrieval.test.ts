import { describe, it, expect } from 'vitest';
import { keywordSearchChunks, retrieveChunksForQuery } from './retrieval';
import type { JarvisDocumentChunk } from './types';

function chunk(id: string, order: number, text: string): JarvisDocumentChunk {
  return { id, documentId: 'doc-1', order, text };
}

describe('keywordSearchChunks — deterministic fallback retrieval (no embeddings, no model)', () => {
  it('returns chunks that actually contain the query terms, ranked by match count', () => {
    const chunks = [
      chunk('c1', 0, 'This chapter discusses taxation policy under colonial rule.'),
      chunk('c2', 1, 'Merchant capitalism and trade networks expanded rapidly in this period.'),
      chunk('c3', 2, 'Merchant capitalism preceded industrial capital formation by nearly a century.'),
    ];
    const results = keywordSearchChunks(chunks, 'merchant capitalism');
    expect(results.map((r) => r.chunk.id)).toEqual(['c2', 'c3']);
    expect(results[0].mode).toBe('deterministic_text_search');
  });

  it('excludes chunks with zero matching terms entirely, never pads with irrelevant results', () => {
    const chunks = [chunk('c1', 0, 'Unrelated content about rivers.')];
    expect(keywordSearchChunks(chunks, 'merchant capitalism')).toHaveLength(0);
  });

  it('ignores stopwords so a query like "what does this say about X" still matches on X', () => {
    const chunks = [chunk('c1', 0, 'The author discusses merchant capitalism at length.')];
    const results = keywordSearchChunks(chunks, 'what does this say about merchant capitalism');
    expect(results).toHaveLength(1);
  });

  it('breaks ties deterministically by chunk order, never randomly', () => {
    const chunks = [chunk('c2', 1, 'capitalism capitalism'), chunk('c1', 0, 'capitalism capitalism')];
    const results = keywordSearchChunks(chunks, 'capitalism');
    expect(results.map((r) => r.chunk.id)).toEqual(['c1', 'c2']);
  });

  it('respects the limit parameter', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => chunk(`c${i}`, i, 'merchant capitalism'));
    expect(keywordSearchChunks(chunks, 'merchant', 3)).toHaveLength(3);
  });

  it('returns no results for a query with only stopwords', () => {
    expect(keywordSearchChunks([chunk('c1', 0, 'anything at all')], 'what is this')).toHaveLength(0);
  });
});

function docChunk(documentId: string, id: string, order: number, text: string): JarvisDocumentChunk {
  return { id, documentId, order, text };
}

describe('retrieveChunksForQuery — Phase 7 scoped retrieval API (Part 8)', () => {
  it('searches across every chunk when documentIds is omitted', () => {
    const chunks = [docChunk('doc-1', 'a1', 0, 'merchant capitalism in doc one'), docChunk('doc-2', 'b1', 0, 'merchant capitalism in doc two')];
    const results = retrieveChunksForQuery(chunks, { question: 'merchant capitalism' });
    expect(results.map((r) => r.chunk.id)).toEqual(['a1', 'b1']);
  });

  it('scopes results to only the given documentIds, excluding chunks from other documents', () => {
    const chunks = [docChunk('doc-1', 'a1', 0, 'merchant capitalism in doc one'), docChunk('doc-2', 'b1', 0, 'merchant capitalism in doc two')];
    const results = retrieveChunksForQuery(chunks, { question: 'merchant capitalism', documentIds: ['doc-1'] });
    expect(results.map((r) => r.chunk.id)).toEqual(['a1']);
  });

  it('respects the limit parameter after scoping', () => {
    const chunks = Array.from({ length: 5 }, (_, i) => docChunk('doc-1', `c${i}`, i, 'merchant capitalism'));
    const results = retrieveChunksForQuery(chunks, { question: 'merchant capitalism', limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('returns an empty array when documentIds excludes every chunk', () => {
    const chunks = [docChunk('doc-1', 'a1', 0, 'merchant capitalism')];
    expect(retrieveChunksForQuery(chunks, { question: 'merchant capitalism', documentIds: ['doc-2'] })).toEqual([]);
  });

  it('preserves full chunk provenance (documentId, sectionId, page) on every result', () => {
    const chunks: JarvisDocumentChunk[] = [{ id: 'a1', documentId: 'doc-1', sectionId: 'doc-1::section-0', order: 0, text: 'merchant capitalism', startPage: 3, endPage: 3 }];
    const [result] = retrieveChunksForQuery(chunks, { question: 'merchant capitalism' });
    expect(result.chunk).toEqual(chunks[0]);
  });

  it('is deterministic — the same input always produces the same output', () => {
    const chunks = [docChunk('doc-1', 'a1', 0, 'merchant capitalism'), docChunk('doc-1', 'a2', 1, 'merchant capitalism')];
    const query = { question: 'merchant capitalism' };
    expect(retrieveChunksForQuery(chunks, query)).toEqual(retrieveChunksForQuery(chunks, query));
  });
});
