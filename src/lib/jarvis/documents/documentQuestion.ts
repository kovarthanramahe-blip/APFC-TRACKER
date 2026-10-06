// JARVIS Phase 7 — document question foundation (Part 9).
//
//   question -> retrieval -> evidence chunks -> citations
//
// NO AI prose is generated anywhere in this file — `buildEvidenceForQuestion` below returns only
// grounded evidence/provenance (the retrieved chunks plus a ready-made JarvisDocumentCitation for
// each), for a future local model to read and reason over. Composing that evidence into a
// JarvisGroundedAnswer (groundedAnswer.ts, Phase 6) is explicitly a LATER step this file does not
// perform.
import type { JarvisDocumentChunk, JarvisDocumentCitation } from './types';
import { retrieveChunksForQuery, type JarvisDocumentRetrievalQuery, type JarvisRetrievedChunk } from './retrieval';

/** A short, exact excerpt — never the whole chunk, never a paraphrase. Capped length only;
 * never re-wraps or rewrites the source text. */
const CITATION_QUOTE_MAX_LENGTH = 200;

function citationForChunk(chunk: JarvisDocumentChunk): JarvisDocumentCitation {
  const quote = chunk.text.length > CITATION_QUOTE_MAX_LENGTH ? `${chunk.text.slice(0, CITATION_QUOTE_MAX_LENGTH)}…` : chunk.text;
  return { documentId: chunk.documentId, chunkId: chunk.id, page: chunk.startPage, quote };
}

export interface JarvisDocumentEvidence {
  chunk: JarvisDocumentChunk;
  score: number;
  citation: JarvisDocumentCitation;
}

/**
 * The full question -> retrieval -> evidence -> citations pipeline, minus the AI step. Every
 * returned JarvisDocumentEvidence item carries BOTH the original chunk (so a caller can inspect
 * the full retrieved text) and a ready citation pointing back at it — a future local model is
 * handed exactly these citations, never asked to construct its own from raw chunk ids.
 * Deterministic and side-effect free: delegates ranking entirely to retrieveChunksForQuery.
 */
export function buildEvidenceForQuestion(chunks: readonly JarvisDocumentChunk[], query: JarvisDocumentRetrievalQuery): JarvisDocumentEvidence[] {
  const retrieved: JarvisRetrievedChunk[] = retrieveChunksForQuery(chunks, query);
  return retrieved.map(({ chunk, score }) => ({ chunk, score, citation: citationForChunk(chunk) }));
}

/** True only when every piece of evidence is well-formed (a non-empty documentId/chunkId on its
 * citation) — a cheap sanity check a caller can run before handing evidence to a future AI step,
 * never a claim about whether the evidence actually answers the question. */
export function isEvidenceWellFormed(evidence: readonly JarvisDocumentEvidence[]): boolean {
  return evidence.every((item) => item.citation.documentId.length > 0 && item.citation.chunkId.length > 0 && item.citation.chunkId === item.chunk.id);
}
