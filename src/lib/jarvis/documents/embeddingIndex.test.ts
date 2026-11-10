import { describe, it, expect } from 'vitest';
import { hashChunkText, planEmbeddingIndexing, cosineSimilarity, semanticSearchChunks, type JarvisDocumentEmbeddingRecord } from './embeddingIndex';
import type { JarvisDocumentChunk } from './types';

function chunk(overrides: Partial<JarvisDocumentChunk> = {}): JarvisDocumentChunk {
  return { id: 'c1', documentId: 'doc1', order: 0, text: 'hello world', ...overrides };
}

function record(overrides: Partial<JarvisDocumentEmbeddingRecord> = {}): JarvisDocumentEmbeddingRecord {
  return {
    documentId: 'doc1',
    chunkId: 'c1',
    modelId: 'model-a',
    dimensions: 3,
    vector: [1, 0, 0],
    contentHash: hashChunkText('hello world'),
    computedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('hashChunkText', () => {
  it('is deterministic — the same text always hashes the same', () => {
    expect(hashChunkText('hello world')).toBe(hashChunkText('hello world'));
  });

  it('differs for different text (no accidental collision on these inputs)', () => {
    expect(hashChunkText('hello world')).not.toBe(hashChunkText('hello worlds'));
  });

  it('is sensitive to every character, including a single trailing-space change', () => {
    expect(hashChunkText('hello')).not.toBe(hashChunkText('hello '));
  });
});

describe('planEmbeddingIndexing', () => {
  it('a brand-new chunk with no existing record goes straight to toCompute', () => {
    const plan = planEmbeddingIndexing([chunk()], [], 'model-a', 3);
    expect(plan.toCompute).toHaveLength(1);
    expect(plan.toKeep).toHaveLength(0);
    expect(plan.toRemove).toHaveLength(0);
  });

  it('a chunk with a current, matching record is kept, never recomputed — idempotent on a second call', () => {
    const c = chunk();
    const r = record();
    const plan = planEmbeddingIndexing([c], [r], 'model-a', 3);
    expect(plan.toCompute).toHaveLength(0);
    expect(plan.toKeep).toEqual([r]);

    // Calling again with the SAME inputs must yield the identical result (true idempotency).
    const secondPlan = planEmbeddingIndexing([c], [r], 'model-a', 3);
    expect(secondPlan.toCompute).toHaveLength(0);
    expect(secondPlan.toKeep).toEqual([r]);
  });

  it('a changed chunk text invalidates its record via contentHash mismatch — goes back to toCompute', () => {
    const c = chunk({ text: 'the text has since changed' });
    const staleRecord = record({ contentHash: hashChunkText('hello world') });
    const plan = planEmbeddingIndexing([c], [staleRecord], 'model-a', 3);
    expect(plan.toCompute).toEqual([c]);
    expect(plan.toKeep).toHaveLength(0);
  });

  it('a model upgrade (different modelId) invalidates every existing record, even with unchanged text', () => {
    const c = chunk();
    const oldModelRecord = record({ modelId: 'model-old' });
    const plan = planEmbeddingIndexing([c], [oldModelRecord], 'model-a', 3);
    expect(plan.toCompute).toEqual([c]);
  });

  it('a dimension mismatch (e.g. a differently-configured same-named model) also invalidates the record', () => {
    const c = chunk();
    const wrongDims = record({ dimensions: 384 });
    const plan = planEmbeddingIndexing([c], [wrongDims], 'model-a', 3);
    expect(plan.toCompute).toEqual([c]);
  });

  it('a record whose chunk no longer exists in the current chunk set is reported in toRemove, never kept or recomputed', () => {
    const deletedChunkRecord = record({ chunkId: 'deleted-chunk' });
    const plan = planEmbeddingIndexing([chunk()], [deletedChunkRecord], 'model-a', 3);
    expect(plan.toRemove).toEqual([deletedChunkRecord]);
    expect(plan.toKeep).not.toContain(deletedChunkRecord);
  });

  it('an empty chunk set with existing records removes all of them, computes nothing', () => {
    const plan = planEmbeddingIndexing([], [record()], 'model-a', 3);
    expect(plan.toCompute).toHaveLength(0);
    expect(plan.toKeep).toHaveLength(0);
    expect(plan.toRemove).toHaveLength(1);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it('returns 0 (never NaN) for a zero-magnitude vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for mismatched or empty dimensions, never throws', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('semanticSearchChunks', () => {
  it('ranks chunks by similarity to the query vector, most similar first', () => {
    const chunks = [chunk({ id: 'a', order: 0, text: 'about cats' }), chunk({ id: 'b', order: 1, text: 'about dogs' })];
    const records = [
      record({ chunkId: 'a', vector: [1, 0] }),
      record({ chunkId: 'b', vector: [0, 1] }),
    ];
    const results = semanticSearchChunks(chunks, records, [0.9, 0.1], 'model-a', 3, 5);
    expect(results[0].chunk.id).toBe('a');
    expect(results[0].mode).toBe('embedding_similarity');
  });

  it('excludes a chunk with no matching current record — never fabricates a score for it', () => {
    const chunks = [chunk({ id: 'a' }), chunk({ id: 'b' })];
    const records = [record({ chunkId: 'a' })];
    const results = semanticSearchChunks(chunks, records, [1, 0, 0], 'model-a', 3, 5);
    expect(results).toHaveLength(1);
    expect(results[0].chunk.id).toBe('a');
  });

  it('a record computed under a different model/dimensions is never used for ranking', () => {
    const chunks = [chunk({ id: 'a' })];
    const records = [record({ chunkId: 'a', modelId: 'other-model' })];
    const results = semanticSearchChunks(chunks, records, [1, 0, 0], 'model-a', 3, 5);
    expect(results).toHaveLength(0);
  });

  it('breaks exact score ties deterministically by chunk order', () => {
    const chunks = [chunk({ id: 'a', order: 1 }), chunk({ id: 'b', order: 0 })];
    const records = [record({ chunkId: 'a', vector: [1, 0, 0] }), record({ chunkId: 'b', vector: [1, 0, 0] })];
    const results = semanticSearchChunks(chunks, records, [1, 0, 0], 'model-a', 3, 5);
    expect(results[0].chunk.id).toBe('b');
    expect(results[1].chunk.id).toBe('a');
  });

  it('respects the limit', () => {
    const chunks = [chunk({ id: 'a' }), chunk({ id: 'b' }), chunk({ id: 'c' })];
    const records = chunks.map((c) => record({ chunkId: c.id, vector: [1, 0, 0] }));
    const results = semanticSearchChunks(chunks, records, [1, 0, 0], 'model-a', 3, 2);
    expect(results).toHaveLength(2);
  });
});
