// JARVIS Phase 8 — local AI runtime HTTP boundary (Ollama).
//
// Architecture (this phase's own brief):
//
//   APFC-TRACKER -> JARVIS provider abstraction -> local runtime adapter (THIS FILE)
//     -> Ollama (an HTTP server on the user's OWN machine) -> open-weight model
//
// Ollama is NOT installed, downloaded, or required by this phase or by APFC-TRACKER's build —
// everything here is OPTIONAL and only ever activates if a caller explicitly constructs a client
// with a real `baseUrl` and that server happens to be running. No call site in this file ever
// invents or falls back to a hardcoded host on its own; OLLAMA_DEFAULT_BASE_URL below is exported
// purely as a documented convenience value a caller MAY choose to pass, never one this module
// reaches for automatically.
//
// SECURITY: Ollama's HTTP API takes no API key/credential of any kind — reachable only on
// whatever host:port it binds to, which defaults to the user's own machine (127.0.0.1:11434,
// loopback-only unless the user has explicitly reconfigured OLLAMA_HOST themselves). This file
// never sends a credential anywhere, and the browser/app code that eventually calls this adapter
// does so only through the existing secure gateway boundary (ai/gateway.ts) — never directly from
// a page a third party can reach, since a local adapter must run server/edge-side exactly like
// localProvider.ts's own header already states. Nothing here is wired into the UI by this phase.
//
// Wire shapes below are taken from Ollama's own authoritative API reference
// (github.com/ollama/ollama/blob/main/docs/api.md, fetched directly for this phase — not assumed
// from training-data memory). Two things that reference does NOT document, and this file
// therefore does NOT invent:
//   1. The exact JSON shape of an error response body — no documented example exists. Handled
//      defensively: the HTTP status code is the authoritative failure signal; an `error` string
//      in the body is read best-effort (never required) for a more specific message.
//   2. A universal field name for a model's context length inside POST /api/show's `model_info`
//      — it is architecture-prefixed (e.g. "llama.context_length" for a llama-family model) and
//      that prefix is not fixed across model families. See modelDiscovery.ts, which scans for any
//      key ending in ".context_length" rather than hardcoding one family's prefix.

/** Documented convenience only — see this file's own header. Never referenced by this module's
 * own code except as this one named export. */
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

// ================================================================================================
// Wire types (Ollama's own JSON shapes — never exposed outside this module as JARVIS's own types)
// ================================================================================================

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface OllamaRequestOptions {
  temperature?: number;
  num_predict?: number;
}

export interface OllamaChatRequest {
  model: string;
  messages: readonly OllamaChatMessage[];
  stream?: boolean;
  options?: OllamaRequestOptions;
}

export interface OllamaChatResponseChunk {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: readonly string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaTagsModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: OllamaModelDetails;
}

export interface OllamaTagsResponse {
  models: readonly OllamaTagsModel[];
}

export interface OllamaShowResponse {
  modelfile?: string;
  parameters?: string;
  template?: string;
  details?: OllamaModelDetails;
  /** Architecture-specific metadata — field names vary per model family (see this file's own
   * header on context-length keys). Never assumed to have a fixed shape. */
  model_info?: Record<string, unknown>;
  /** Only ever what Ollama itself reports (e.g. `["completion", "vision"]`) — never guessed or
   * supplemented by this file. */
  capabilities?: readonly string[];
}

// ================================================================================================
// Structured client error — never a raw thrown fetch exception past this module's own boundary
// ================================================================================================

export type OllamaClientErrorKind = 'network_error' | 'timeout' | 'http_error' | 'malformed_response' | 'cancelled';

export class OllamaClientError extends Error {
  readonly kind: OllamaClientErrorKind;
  readonly httpStatus?: number;

  constructor(kind: OllamaClientErrorKind, message: string, httpStatus?: number) {
    super(message);
    this.name = 'OllamaClientError';
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

// ================================================================================================
// Injectable client boundary (Part 3's own instruction: "keep the implementation injectable and
// test it with deterministic fixtures")
// ================================================================================================

/** Everything this adapter needs from a local runtime — deliberately narrow (not "the whole
 * Ollama API") so a test double only ever has to implement these four methods, and so a future
 * second local-runtime family could implement this same interface without taking on Ollama's own
 * wire shapes as part of its public contract. */
export interface JarvisOllamaHttpClient {
  listModels(signal?: AbortSignal): Promise<OllamaTagsResponse>;
  showModel(model: string, signal?: AbortSignal): Promise<OllamaShowResponse>;
  chat(request: OllamaChatRequest, signal?: AbortSignal): Promise<OllamaChatResponseChunk>;
  chatStream(request: OllamaChatRequest, signal?: AbortSignal): AsyncIterable<OllamaChatResponseChunk>;
}

export interface OllamaRuntimeConfig {
  /** Never defaulted inside this module — see OLLAMA_DEFAULT_BASE_URL's own doc comment. */
  baseUrl: string;
  /** Applied to every call this client makes; a caller-supplied `signal` is honoured independently
   * (both can end the same request, whichever fires first). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Combines a timeout with an optional caller-supplied AbortSignal, so either one can end the
 * request. Implemented with listeners rather than `AbortSignal.any` to avoid depending on a very
 * recent platform API this project's own target may not guarantee everywhere this code could one
 * day run (server/edge, not just a modern browser). Returns the combined signal plus a `cleanup`
 * the caller must invoke once the request settles, so the internal timer is always released. */
function withTimeout(timeoutMs: number, callerSignal: AbortSignal | undefined): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort);
  if (callerSignal?.aborted) controller.abort();

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

async function doFetch(url: string, init: RequestInit, timeoutMs: number, callerSignal: AbortSignal | undefined): Promise<Response> {
  const { signal, cleanup, timedOut } = withTimeout(timeoutMs, callerSignal);
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if (callerSignal?.aborted) throw new OllamaClientError('cancelled', 'The request was cancelled.');
    if (timedOut()) throw new OllamaClientError('timeout', `The local runtime did not respond within ${timeoutMs}ms.`);
    throw new OllamaClientError('network_error', err instanceof Error ? err.message : 'The local runtime could not be reached.');
  } finally {
    cleanup();
  }
}

/** Best-effort extraction of a safe error message from a non-2xx body — never required, never
 * assumed to have a specific shape (see this file's own header: no documented error shape
 * exists). Falls back to the plain HTTP status when the body has nothing usable. */
async function readHttpErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const fromBody = typeof parsed.error === 'string' ? parsed.error : typeof parsed.message === 'string' ? parsed.message : undefined;
      if (fromBody) return fromBody;
    } catch {
      // Not JSON — fall through to the plain-text body, when non-empty.
    }
    return text.trim() || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new OllamaClientError('malformed_response', 'The local runtime returned a response that was not valid JSON.');
  }
}

/**
 * The real, fetch-based implementation — never called by anything in this module except via an
 * explicit, caller-provided `config.baseUrl`. Every method throws a structured OllamaClientError
 * rather than letting a raw fetch rejection or JSON.parse exception escape.
 */
export function createFetchOllamaHttpClient(config: OllamaRuntimeConfig): JarvisOllamaHttpClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function fetchJson<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    const res = await doFetch(`${config.baseUrl}${path}`, init, timeoutMs, signal);
    if (!res.ok) {
      throw new OllamaClientError('http_error', await readHttpErrorMessage(res), res.status);
    }
    return parseJsonResponse<T>(res);
  }

  return {
    listModels(signal) {
      return fetchJson<OllamaTagsResponse>('/api/tags', { method: 'GET' }, signal);
    },

    showModel(model, signal) {
      return fetchJson<OllamaShowResponse>('/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }, signal);
    },

    chat(request, signal) {
      return fetchJson<OllamaChatResponseChunk>(
        '/api/chat',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, stream: false }) },
        signal,
      );
    },

    async *chatStream(request, signal) {
      const res = await doFetch(
        `${config.baseUrl}/api/chat`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, stream: true }) },
        timeoutMs,
        signal,
      );
      if (!res.ok) throw new OllamaClientError('http_error', await readHttpErrorMessage(res), res.status);
      if (!res.body) throw new OllamaClientError('malformed_response', 'The local runtime returned no response body for a streaming request.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line) continue;
            try {
              yield JSON.parse(line) as OllamaChatResponseChunk;
            } catch {
              throw new OllamaClientError('malformed_response', 'The local runtime streamed a line that was not valid JSON.');
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
