// JARVIS AI Library — the ONE file in this codebase that actually calls a real local embedding
// model. Every other embedding-related file (jarvis/documents/embeddingIndex.ts,
// jarvis/librarySearch.ts) is pure/dependency-free and fully unit-tested without this file ever
// loading — exactly the same split this project already uses for the Android local LLM
// (NativeLlamaRuntimeClient's pure contract vs createNativeLlamaRuntime's one real-backend file).
//
// Model choice, with evidence: `onnx-community/all-MiniLM-L6-v2-ONNX` via `@huggingface/transformers`
// (installed, real, type-checked against its own shipped .d.ts files — not guessed). This is the
// EXACT model used in that library's own documented `feature-extraction` pipeline example
// (node_modules/@huggingface/transformers/types/pipelines/feature-extraction.d.ts), producing a
// 384-dimension vector with `pooling: 'mean', normalize: true` — a small, practical,
// general-purpose sentence-embedding model, not a guess at an arbitrary HF repo id.
//
// Lazy-loaded by design: `@huggingface/transformers` (several MB, WASM-backed) is pulled in via a
// dynamic `import()` only inside `embed()` itself — never at module load, so no user who never
// touches semantic search pays for it in the main bundle. `import type` below costs nothing at
// runtime (erased at compile time); only the dynamic import below has a real runtime cost, and
// only on first use.
//
// HONESTY NOTE — read before trusting this file "works": the actual first-use model download (the
// ONNX weights, fetched from the Hugging Face Hub or a CDN mirror at runtime) could NOT be
// verified in the sandbox that wrote this code. That sandbox's own egress policy returned
// `403 connect_rejected` for both huggingface.co and cdn.jsdelivr.net (confirmed directly with
// curl against the sandbox's own proxy status endpoint — not assumed). `npm install` of the
// package itself succeeded (registry.npmjs.org is reachable there), and this file type-checks
// cleanly against the package's real, installed type definitions — but nobody has actually run
// `embed()` end-to-end and observed a real vector come back. Verify that first, on a real device
// or a real browser with normal internet access, before relying on semantic search results.
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import type { JarvisEmbeddingProvider, JarvisEmbeddingVector } from '../documents/retrieval';

export const LOCAL_EMBEDDING_MODEL_ID = 'local-minilm-l6-v2';
export const LOCAL_EMBEDDING_DIMENSIONS = 384;
const HF_MODEL_NAME = 'onnx-community/all-MiniLM-L6-v2-ONNX';

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function loadPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      return pipeline('feature-extraction', HF_MODEL_NAME);
    })().catch((err: unknown) => {
      // Never cache a permanent failure — a transient network/offline failure on this attempt
      // should not block a later retry (e.g. once the device regains connectivity).
      pipelinePromise = null;
      throw err;
    });
  }
  return pipelinePromise;
}

/**
 * Attempts to load the real model, reporting success/failure honestly — never assumed available
 * just because the provider object was constructed. A caller (e.g. the "Index for semantic
 * search" UI action) should call this once before offering semantic search as usable, exactly
 * like the Android local LLM's own getAndroidLocalLlamaHealth cross-check never trusts
 * construction alone.
 */
export async function isLocalEmbeddingModelReachable(): Promise<boolean> {
  try {
    await loadPipeline();
    return true;
  } catch {
    return false;
  }
}

/**
 * The real JarvisEmbeddingProvider implementation. Never fabricates a vector: if the underlying
 * model/pipeline returns something other than the expected `texts.length` rows of exactly
 * `LOCAL_EMBEDDING_DIMENSIONS` numbers, this throws rather than silently returning a
 * wrong-shaped/truncated vector that would corrupt cosine-similarity ranking downstream.
 */
export function createLocalEmbeddingProvider(): JarvisEmbeddingProvider {
  return {
    id: LOCAL_EMBEDDING_MODEL_ID,
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    async embed(texts: readonly string[]): Promise<JarvisEmbeddingVector[]> {
      if (texts.length === 0) return [];

      const extractor = await loadPipeline();
      const output = await extractor([...texts], { pooling: 'mean', normalize: true });
      const rows: unknown = output.tolist();

      if (!Array.isArray(rows) || rows.length !== texts.length) {
        throw new Error(`local embedding provider returned ${Array.isArray(rows) ? rows.length : typeof rows} rows for ${texts.length} input text(s)`);
      }

      return rows.map((row, index) => {
        if (!Array.isArray(row) || row.length !== LOCAL_EMBEDDING_DIMENSIONS || !row.every((v) => typeof v === 'number' && Number.isFinite(v))) {
          throw new Error(`local embedding provider returned a malformed vector at index ${index}`);
        }
        return row as number[];
      });
    },
  };
}
