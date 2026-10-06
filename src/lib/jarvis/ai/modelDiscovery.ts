// JARVIS Phase 8 — local model discovery (Part 4).
//
// Provider-independent model-discovery CONTRACT plus pure mapping functions from Ollama's own
// wire shapes (localRuntime.ts) into it. Nothing here downloads a model, nothing here decides
// which model is "best" — every field is either a fixed fact Ollama itself reported, or omitted
// entirely when unknown (never a guessed default).
import type { OllamaModelDetails, OllamaShowResponse, OllamaTagsModel } from './localRuntime';

export interface JarvisLocalModelInfo {
  /** The exact identifier a caller must send back as `model` in a future chat/generate request
   * (Ollama's own `model` field — e.g. "llama3.2:latest") — never the display-only `name`. */
  identifier: string;
  displayName: string;
  /** Bytes, only when Ollama itself reported a size. */
  sizeBytes?: number;
  /** Only when discovered via POST /api/show's own `model_info` (see extractContextLengthTokens's
   * own doc comment) — never guessed from the model's name or family. */
  contextLengthTokens?: number;
  /** Only ever Ollama's own reported capabilities array (e.g. `["completion", "vision"]`) — never
   * supplemented or inferred by this file. Omitted (not an empty array) when /api/show was never
   * called for this model, so "known to have no capabilities" stays distinguishable from "unknown". */
  capabilities?: readonly string[];
  parameterSize?: string;
  quantizationLevel?: string;
  /** True once the model appeared in a real /api/tags listing — this contract has no "probably
   * available" state; availability is always a direct fact from the runtime. */
  available: boolean;
}

/**
 * Maps one entry of a real GET /api/tags response into the neutral contract. Prefers the `model`
 * field as `identifier` (the exact string a later request must echo back) over `name`, which
 * Ollama's own docs show can differ in tag formatting.
 */
export function mapOllamaTagsModelToInfo(raw: OllamaTagsModel): JarvisLocalModelInfo {
  return {
    identifier: raw.model,
    displayName: raw.name,
    sizeBytes: typeof raw.size === 'number' ? raw.size : undefined,
    parameterSize: raw.details?.parameter_size,
    quantizationLevel: raw.details?.quantization_level,
    available: true,
  };
}

/**
 * A model's context length lives inside POST /api/show's `model_info`, under an
 * architecture-prefixed key (e.g. "llama.context_length" for a llama-family model) — Ollama's own
 * docs do not fix that prefix across every model family, so this scans for ANY key ending in
 * ".context_length" rather than assuming one. Returns `undefined` (never a guess) when no such key
 * is present or its value isn't a plain number.
 */
export function extractContextLengthTokens(modelInfo: Record<string, unknown> | undefined): number | undefined {
  if (!modelInfo) return undefined;
  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith('.context_length') && typeof value === 'number') return value;
  }
  return undefined;
}

/**
 * Enriches a JarvisLocalModelInfo already built from /api/tags with the additional detail only
 * POST /api/show reports (context length, capabilities) — a separate, optional call, never
 * assumed to have been made. Never overwrites `identifier`/`displayName`/`available`, which come
 * only from the /api/tags listing itself.
 */
export function enrichModelInfoWithShowResponse(base: JarvisLocalModelInfo, show: OllamaShowResponse): JarvisLocalModelInfo {
  return {
    ...base,
    contextLengthTokens: extractContextLengthTokens(show.model_info),
    capabilities: show.capabilities,
    parameterSize: show.details?.parameter_size ?? base.parameterSize,
    quantizationLevel: show.details?.quantization_level ?? base.quantizationLevel,
  };
}

/** Re-exported only for test fixtures that need to build a raw Ollama wire object without
 * importing localRuntime.ts directly for the single type they need. */
export type { OllamaModelDetails };
