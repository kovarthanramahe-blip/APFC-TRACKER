// @vitest-environment node
//
// Semantic ranking evaluation — DIAGNOSTIC ONLY, no production code change. Opt-in, exactly like
// providerClassificationEval.test.ts's own gating pattern: skipped unless
// process.env.JARVIS_EVAL_EMBEDDINGS is set, so it never runs as part of the normal offline
// test/build workflow and never attempts a network call in an environment (such as the sandbox
// that wrote this file) whose egress policy blocks the Hugging Face model host.
//
// Compares 4 variants of the SAME real retrieval pipeline — buildWorkspaceDocumentChunks for
// chunking, the real local embedding provider (jarvis/ai/localEmbeddingProvider.ts) to embed, and
// embeddingIndex.ts's own semanticSearchChunks/cosineSimilarity to rank — against the fixture
// queries in semanticRankingFixtures.ts:
//   (a) the current chunks, exactly as buildWorkspaceDocumentChunks produces them
//   (b) the current chunks, minus any chunk whose whole text is just "[Page N]" (no real content)
//   (c) each chunk re-embedded as "<document title>\n\n<chunk text>" (chunking unchanged)
//   (d) one embedding per whole document (title + full text), no chunking at all
// No new embedding or scoring code is written here — only different inputs to the existing
// functions above.
//
// HOW TO READ THE RESULTS (once JARVIS_EVAL_EMBEDDINGS is set and this is actually run):
//   - (b) and/or (c) fix a query that (a) misses               -> the problem is passage splitting
//     (a junk/short chunk, or a chunk missing its own document's title, was winning).
//   - only "ambiguous" queries miss, across every variant      -> the problem is query ambiguity,
//     not the index (the right chunk's embedding was never going to score highest against a
//     paraphrase with no shared vocabulary).
//   - the right document's chunk is close behind the winner, or many chunks are tied/near-tied
//     -> the problem is scoring/thresholding (e.g. junk chunks like "[Page 1]" diluting top-k),
//     not the embeddings themselves.
//   - gaps between #1 and #2 are uniformly small AND the wrong document wins across ALL variants
//     -> the problem is embedding quality/model choice itself.
// No model or production retrieval code should change until this evaluation has actually been
// run (with real network access to the embedding model) and read against the above.
import { describe, it, expect } from 'vitest';
import { buildWorkspaceDocumentChunks, resolveWorkspaceDocumentTitle } from '../jarvis/workspaceContentBridge';
import { createLocalEmbeddingProvider } from '../jarvis/ai/localEmbeddingProvider';
import { semanticSearchChunks, hashChunkText, type JarvisDocumentEmbeddingRecord } from '../jarvis/documents/embeddingIndex';
import type { JarvisDocumentChunk } from '../jarvis/documents/types';
import type { JarvisRetrievedChunk } from '../jarvis/documents/retrieval';
import {
  SEMANTIC_RANKING_NOTES,
  SEMANTIC_RANKING_IMPORTED_CONTENT,
  SEMANTIC_RANKING_QUERIES,
  SEMANTIC_RANKING_WORKSPACE_ID,
  type SemanticRankingQuery,
} from './semanticRankingFixtures';

const EMBEDDINGS_CONFIGURED = Boolean(process.env.JARVIS_EVAL_EMBEDDINGS);

type VariantName = 'a-current-chunks' | 'b-no-page-only-chunks' | 'c-title-prefixed-chunks' | 'd-whole-document';

function buildRecords(chunks: readonly JarvisDocumentChunk[], vectors: readonly (readonly number[])[], modelId: string, dimensions: number): JarvisDocumentEmbeddingRecord[] {
  return chunks.map((chunk, index) => ({
    documentId: chunk.documentId,
    chunkId: chunk.id,
    modelId,
    dimensions,
    vector: vectors[index],
    contentHash: hashChunkText(chunk.text),
    computedAt: new Date().toISOString(),
  }));
}

/** First 1-indexed rank (by DOCUMENT, not raw chunk position) at which a ranked result's
 * documentId matches one of `expectedTopIds` — multiple chunks from the same document collapse to
 * their first (best-scoring) occurrence. Returns undefined if no match appears at all. */
function firstCorrectDocumentRank(ranked: readonly JarvisRetrievedChunk[], expectedTopIds: readonly string[]): number | undefined {
  const seenDocumentIds = new Set<string>();
  let rank = 0;
  for (const result of ranked) {
    if (seenDocumentIds.has(result.chunk.documentId)) continue;
    seenDocumentIds.add(result.chunk.documentId);
    rank += 1;
    if (expectedTopIds.includes(result.chunk.documentId)) return rank;
  }
  return undefined;
}

interface VariantQueryResult {
  query: SemanticRankingQuery;
  ranked: JarvisRetrievedChunk[];
  hitAt1: boolean;
  reciprocalRank: number;
}

function summarize(label: string, results: readonly VariantQueryResult[]): void {
  const bySplit = (tag: 'specific' | 'ambiguous') => results.filter((r) => r.query.tag === tag);
  const hitRate = (rows: readonly VariantQueryResult[]) => (rows.length === 0 ? 0 : rows.filter((r) => r.hitAt1).length / rows.length);
  const mrr = (rows: readonly VariantQueryResult[]) => (rows.length === 0 ? 0 : rows.reduce((sum, r) => sum + r.reciprocalRank, 0) / rows.length);

  const specific = bySplit('specific');
  const ambiguous = bySplit('ambiguous');
  console.log(`\n=== ${label} — summary ===`);
  console.log(`  overall   hit@1=${hitRate(results).toFixed(2)}  MRR=${mrr(results).toFixed(4)}  (n=${results.length})`);
  console.log(`  specific  hit@1=${hitRate(specific).toFixed(2)}  MRR=${mrr(specific).toFixed(4)}  (n=${specific.length})`);
  console.log(`  ambiguous hit@1=${hitRate(ambiguous).toFixed(2)}  MRR=${mrr(ambiguous).toFixed(4)}  (n=${ambiguous.length})`);
}

describe('Semantic ranking evaluation (opt-in — requires JARVIS_EVAL_EMBEDDINGS)', () => {
  it.skipIf(!EMBEDDINGS_CONFIGURED)(
    'ranks 4 chunking/embedding variants against the fixture queries and reports hit@1/MRR per variant',
    async () => {
      const provider = createLocalEmbeddingProvider();
      const notes = SEMANTIC_RANKING_NOTES;
      const importedContent = SEMANTIC_RANKING_IMPORTED_CONTENT;
      const workspaceId = SEMANTIC_RANKING_WORKSPACE_ID;

      // --- Variant (a): current chunks, exactly as the real pipeline produces them. ---
      const chunksA = buildWorkspaceDocumentChunks(notes, importedContent, workspaceId);
      const vectorsA = await provider.embed(chunksA.map((c) => c.text));
      const recordsA = buildRecords(chunksA, vectorsA, provider.id, provider.dimensions);

      // --- Variant (b): (a) minus any chunk whose whole text is just a bare "[Page N]" marker. ---
      const pageOnlyPattern = /^\[Page \d+\]$/;
      const chunksB = chunksA.filter((c) => !pageOnlyPattern.test(c.text.trim()));
      const chunkIdsB = new Set(chunksB.map((c) => c.id));
      const recordsB = recordsA.filter((r) => chunkIdsB.has(r.chunkId));

      // --- Variant (c): (a)'s own chunks, re-embedded with their document's title prefixed. ---
      const titleFor = (documentId: string): string => resolveWorkspaceDocumentTitle(documentId, notes, importedContent, workspaceId)?.title ?? '';
      const textsC = chunksA.map((c) => `${titleFor(c.documentId)}\n\n${c.text}`);
      const vectorsC = await provider.embed(textsC);
      const recordsC = buildRecords(chunksA, vectorsC, provider.id, provider.dimensions);

      // --- Variant (d): one embedding per whole document (title + full text), no chunking. ---
      const documentUnits: JarvisDocumentChunk[] = [
        ...notes.map((n, index) => ({ id: `note:${n.id}`, documentId: `note:${n.id}`, order: index, text: `${n.title}\n\n${n.content}` })),
        ...importedContent.map((c, index) => ({
          id: `imported_content:${c.id}`,
          documentId: `imported_content:${c.id}`,
          order: notes.length + index,
          text: `${c.title}\n\n${c.rawContent}`,
        })),
      ];
      const vectorsD = await provider.embed(documentUnits.map((u) => u.text));
      const recordsD = buildRecords(documentUnits, vectorsD, provider.id, provider.dimensions);

      const variants: { name: VariantName; chunks: readonly JarvisDocumentChunk[]; records: readonly JarvisDocumentEmbeddingRecord[] }[] = [
        { name: 'a-current-chunks', chunks: chunksA, records: recordsA },
        { name: 'b-no-page-only-chunks', chunks: chunksB, records: recordsB },
        { name: 'c-title-prefixed-chunks', chunks: chunksA, records: recordsC },
        { name: 'd-whole-document', chunks: documentUnits, records: recordsD },
      ];

      for (const variant of variants) {
        const resultsForVariant: VariantQueryResult[] = [];

        for (const query of SEMANTIC_RANKING_QUERIES) {
          const [queryVector] = await provider.embed([query.text]);
          const ranked = semanticSearchChunks(variant.chunks, variant.records, queryVector, provider.id, provider.dimensions, variant.chunks.length);

          expect(ranked.length).toBeGreaterThan(0);
          for (const result of ranked) {
            expect(Number.isFinite(result.score)).toBe(true);
            expect(result.score).toBeGreaterThanOrEqual(-1);
            expect(result.score).toBeLessThanOrEqual(1);
          }

          const rank = firstCorrectDocumentRank(ranked, query.expectedTopIds);
          const hitAt1 = ranked[0] !== undefined && query.expectedTopIds.includes(ranked[0].chunk.documentId);
          const reciprocalRank = rank !== undefined ? 1 / rank : 0;
          resultsForVariant.push({ query, ranked, hitAt1, reciprocalRank });

          const gap = ranked.length >= 2 ? (ranked[0].score - ranked[1].score).toFixed(4) : 'n/a';
          console.log(`\n[${variant.name}] query "${query.id}" (${query.tag}): "${query.text}"`);
          ranked.slice(0, 5).forEach((r, i) => {
            console.log(`  #${i + 1} doc=${r.chunk.documentId} score=${r.score.toFixed(4)} text="${r.chunk.text.slice(0, 60).replace(/\n/g, ' ')}"`);
          });
          console.log(`  gap(#1,#2)=${gap}`);
        }

        summarize(variant.name, resultsForVariant);
      }

      expect(SEMANTIC_RANKING_QUERIES.length).toBeGreaterThan(0);
    },
    300_000,
  );

  it('the gate itself is verifiably off by default in this environment — a false "it ran" is impossible without the key', () => {
    expect(EMBEDDINGS_CONFIGURED).toBe(false);
  });
});
