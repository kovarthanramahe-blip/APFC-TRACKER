// JARVIS AI Library — embedding-based semantic search, the deterministic/pure half.
//
// retrieval.ts's own header already named this day one: "JarvisEmbeddingProvider is an OPTIONAL
// pluggable interface a future local embedding model can implement... keywordSearchChunks... is
// real, working, dependency-free retrieval that needs no model at all and is always available as
// the deterministic fallback." This file is that future arriving — but everything in THIS file is
// still dependency-free and synchronous: computing/storing/invalidating embedding vectors and
// ranking by cosine similarity, none of which needs the actual model loaded to be correct or
// testable. The one file that actually calls a real embedding model
// (jarvis/ai/localEmbeddingProvider.ts) is a thin, separately-tested, lazy-loaded wrapper around
// this — exactly the same "pure core + one thin real-backend file" split this codebase already
// uses for the Android local LLM (NativeLlamaRuntimeClient vs createNativeLlamaRuntime).
//
// Persistence model: one JarvisDocumentEmbeddingRecord per CHUNK, keyed by (documentId, chunkId).
// `contentHash` + `modelId`/`dimensions` are what make re-indexing idempotent and safe across
// document edits or a future model upgrade — see planEmbeddingIndexing's own header for exactly
// how staleness is detected, never guessed.
import type { JarvisDocumentChunk } from './types';
import type { JarvisRetrievedChunk } from './retrieval';

export interface JarvisDocumentEmbeddingRecord {
  documentId: string;
  chunkId: string;
  /** Identifies which model produced this vector (e.g. 'local-minilm-l6-v2') — never assumed
   * compatible with a vector from a different model, even if dimensions happen to match. */
  modelId: string;
  dimensions: number;
  vector: readonly number[];
  /** A cheap, deterministic content hash (see hashChunkText) of the chunk text this vector was
   * computed from — the one signal planEmbeddingIndexing uses to detect a stale record, never a
   * timestamp-based guess. */
  contentHash: string;
  computedAt: string;
}

/**
 * A small, deterministic, dependency-free hash (FNV-1a, 32-bit) — NOT cryptographic, and not
 * meant to be: its only job is "did this chunk's text change since it was last embedded",
 * exactly like a cheap ETag. Pure and synchronous so planEmbeddingIndexing never needs an async
 * crypto API (which isn't available in every environment this app runs in — see
 * TransformersEnvironment's own apis.IS_CRYPTO_AVAILABLE flag, which this file deliberately
 * avoids depending on).
 */
export function hashChunkText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export interface JarvisEmbeddingIndexingPlan {
  /** Chunks with no record yet, a content-hash mismatch (the source text changed), or a
   * modelId/dimensions mismatch (a model upgrade invalidates every prior vector). Always exactly
   * the chunks a caller must actually call the embedding provider for — never a chunk that
   * already has a valid, current vector. */
  toCompute: readonly JarvisDocumentChunk[];
  /** Existing records that are still valid for the CURRENT chunk set and model — pass these
   * through unchanged; never recompute them. */
  toKeep: readonly JarvisDocumentEmbeddingRecord[];
  /** Existing records whose chunk no longer exists in the current chunk set at all (the source
   * document was deleted, or re-chunked differently) — a caller should drop these from storage,
   * never leave a stale record pointing at a chunk id that no longer exists. */
  toRemove: readonly JarvisDocumentEmbeddingRecord[];
}

/**
 * Decides exactly what embedding work is actually needed — idempotent by construction: calling
 * this twice in a row with the SAME chunks/records/model always yields toCompute: [] the second
 * time (every chunk already has a current, matching record). Never recomputes a vector that is
 * still valid, and never silently keeps a vector for a chunk whose text changed.
 */
export function planEmbeddingIndexing(
  chunks: readonly JarvisDocumentChunk[],
  existingRecords: readonly JarvisDocumentEmbeddingRecord[],
  modelId: string,
  dimensions: number,
): JarvisEmbeddingIndexingPlan {
  const recordByChunkId = new Map(existingRecords.map((r) => [r.chunkId, r]));
  const currentChunkIds = new Set(chunks.map((c) => c.id));

  const toCompute: JarvisDocumentChunk[] = [];
  const toKeep: JarvisDocumentEmbeddingRecord[] = [];

  for (const chunk of chunks) {
    const existing = recordByChunkId.get(chunk.id);
    const currentHash = hashChunkText(chunk.text);
    const isValid = existing !== undefined && existing.modelId === modelId && existing.dimensions === dimensions && existing.contentHash === currentHash;
    if (isValid) {
      toKeep.push(existing);
    } else {
      toCompute.push(chunk);
    }
  }

  const toRemove = existingRecords.filter((r) => !currentChunkIds.has(r.chunkId));

  return { toCompute, toKeep, toRemove };
}

/** Plain, dependency-free cosine similarity — never divides by zero (a zero-magnitude vector,
 * which a real embedding model should never produce but this function never assumes, yields 0,
 * the honest "no similarity signal" answer, not NaN). */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Ranks `chunks` by cosine similarity between `queryVector` and each chunk's own current
 * embedding record — a chunk with no matching, current record (per the same modelId/dimensions
 * check planEmbeddingIndexing uses) is silently excluded, never scored with a fabricated 0
 * pretending to be a real "no similarity" result. Deterministic tie-break by `chunk.order`,
 * exactly like keywordSearchChunks' own convention — the two retrieval modes stay comparable in
 * behaviour even though their scores are never compared to each other directly (see
 * JarvisRetrievedChunk's own `score`/`mode` doc comment).
 */
export function semanticSearchChunks(
  chunks: readonly JarvisDocumentChunk[],
  records: readonly JarvisDocumentEmbeddingRecord[],
  queryVector: readonly number[],
  modelId: string,
  dimensions: number,
  limit = 5,
): JarvisRetrievedChunk[] {
  const recordByChunkId = new Map(records.filter((r) => r.modelId === modelId && r.dimensions === dimensions).map((r) => [r.chunkId, r]));

  const scored = chunks
    .map((chunk) => {
      const record = recordByChunkId.get(chunk.id);
      if (!record) return undefined;
      return { chunk, score: cosineSimilarity(queryVector, record.vector), mode: 'embedding_similarity' as const };
    })
    .filter((result): result is NonNullable<typeof result> => result !== undefined);

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.chunk.order - b.chunk.order));
  return scored.slice(0, limit);
}
