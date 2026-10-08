// JARVIS Phase 6 — retrieval abstraction (embeddings optional, deterministic search always
// available).
//
// No paid embedding API is mandated anywhere in this file, and no vector database dependency is
// introduced (see this phase's own brief, Part G: "prefer the smallest effective architecture").
// `JarvisEmbeddingProvider` is an OPTIONAL pluggable interface a future local embedding model can
// implement; `keywordSearchChunks` below is real, working, dependency-free retrieval that needs
// no model at all and is always available as the deterministic fallback — document Q&A must keep
// working even when no embedding provider is configured.
import type { JarvisDocumentChunk } from './types';

export type JarvisEmbeddingVector = readonly number[];

/** A pluggable local embedding model — optional. Nothing in this phase implements a real one;
 * this is the shape a future local embedding runtime would satisfy. `dimensions` is a fixed,
 * honest fact about the model (never guessed). */
export interface JarvisEmbeddingProvider {
  id: string;
  dimensions: number;
  embed(texts: readonly string[]): Promise<JarvisEmbeddingVector[]>;
}

export type JarvisRetrievalMode = 'deterministic_text_search' | 'embedding_similarity';

export interface JarvisRetrievedChunk {
  chunk: JarvisDocumentChunk;
  /** Relevance score, meaning depends on `mode` (a raw keyword-match count for
   * 'deterministic_text_search'; a similarity score for 'embedding_similarity') — never compared
   * across different modes. */
  score: number;
  mode: JarvisRetrievalMode;
}

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'and', 'or', 'is', 'are', 'what', 'does', 'this', 'that', 'for', 'about']);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Real, dependency-free retrieval: scores each chunk by how many of the query's own (non-
 * stopword) terms it contains, case-insensitively. No model, no network call, no vector math —
 * this is the mode document Q&A can always fall back to, per this phase's own "continue
 * operating without embeddings when a simpler deterministic text search is sufficient" rule.
 * Deterministic: ties are broken by the chunk's own `order`, never randomised. Chunks scoring
 * zero are excluded entirely rather than padding the result with irrelevant matches.
 */
export function keywordSearchChunks(chunks: readonly JarvisDocumentChunk[], query: string, limit = 5): JarvisRetrievedChunk[] {
  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0) return [];

  const scored = chunks
    .map((chunk) => {
      const chunkTerms = tokenize(chunk.text);
      const score = chunkTerms.filter((term) => queryTerms.has(term)).length;
      return { chunk, score, mode: 'deterministic_text_search' as const };
    })
    .filter((result) => result.score > 0);

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.chunk.order - b.chunk.order));
  return scored.slice(0, limit);
}

// ================================================================================================
// Phase 7 — a clean, scoped retrieval API around keywordSearchChunks (Part 8)
// ================================================================================================

export interface JarvisDocumentRetrievalQuery {
  /** Narrows the search to these document ids only. Omitted/undefined searches every chunk the
   * caller passed in — this function never reaches into any store to find "all documents" on
   * its own. */
  documentIds?: readonly string[];
  question: string;
  limit?: number;
}

/**
 * Scopes `chunks` to `query.documentIds` (when given) before delegating to the existing
 * keywordSearchChunks — no new ranking/search logic, so "retrieval remains deterministic" stays
 * true by construction rather than by a second implementation needing to stay in sync with the
 * first. Provenance is untouched: every returned JarvisRetrievedChunk still carries its original
 * `chunk` object, with its own documentId/sectionId/page intact.
 */
export function retrieveChunksForQuery(chunks: readonly JarvisDocumentChunk[], query: JarvisDocumentRetrievalQuery): JarvisRetrievedChunk[] {
  const scoped = query.documentIds ? chunks.filter((chunk) => query.documentIds!.includes(chunk.documentId)) : chunks;
  return keywordSearchChunks(scoped, query.question, query.limit);
}
