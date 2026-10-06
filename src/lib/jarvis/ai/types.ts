// JARVIS Phase 4 — provider-independent AI contracts.
//
// Nothing in this file (or anywhere under lib/jarvis/ai/) calls a real AI provider, holds a
// credential, or makes a network request. These are TYPES ONLY plus a couple of pure helpers —
// the shapes a future provider adapter and a future secure gateway endpoint will both implement
// against, so neither this app's client code nor its eventual server/edge code ever needs to
// special-case "which provider" outside one adapter module per provider (none of which exist yet).
//
// Shape informed by OpenAI's current (2025) Responses API — verified against official docs before
// writing this, not assumed from an older Chat Completions-era memory:
//   - Message content is an array of typed PARTS, not a plain string, because a real response can
//     mix text, a refusal, and tool-call content in one message (platform.openai.com/docs/guides/text).
//   - A response is not one flat string: it is a finish reason, optional tool calls, and usage,
//     with the final text already flattened for the common case (mirrors Responses' own
//     convenience `output_text` field alongside its structured `output` item list).
//   - Tool definitions are FLAT (name/description/schema at the top level) — Responses dropped
//     Chat Completions' nested `function: {...}` wrapper (platform.openai.com/docs/guides/function-calling).
//   - A tool result is its own distinct concept, correlated by a call id — never a plain
//     "role: tool" chat message with string content (same guide).
//   - Streaming is a rich, named event sequence (item added/done, text delta/done, tool-call
//     argument delta/done, then a terminal completed/incomplete/failed/error) — never a single
//     repeating "delta chunk" shape (platform.openai.com/docs/guides/streaming-responses).
// A real adapter maps 1:1 between these neutral shapes and whatever its provider's wire format
// actually is; this file never assumes any one provider's field names.

import type { JarvisToolResult } from '../types';
import type { JarvisContextSnapshot } from '../contextEngine';

// ================================================================================================
// Messages
// ================================================================================================

export type JarvisAiRole = 'system' | 'user' | 'assistant' | 'tool';

/** A minimal JSON Schema shape for a tool's input — intentionally open-ended (JSON Schema is
 * itself recursive) but never `any`: every value must at least be a plausible schema node. A
 * future phase may swap this for a stricter schema library's own type without changing
 * JarvisAiToolDefinition's own shape. */
export interface JarvisAiJsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JarvisAiJsonSchema>;
  items?: JarvisAiJsonSchema;
  required?: readonly string[];
  enum?: readonly (string | number | boolean | null)[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/** A tool JARVIS's AI layer may call — provider-neutral and intentionally close to the Phase 1
 * JarvisTool it will eventually be generated FROM (same `id`/`description`), but this is the
 * AI-facing declaration (a JSON Schema the provider validates arguments against), not the
 * TypeScript-typed JarvisTool itself. Nothing here executes a tool — see this file's own header
 * and providerRegistry.ts/gateway.ts for where execution deliberately does NOT happen yet. */
export interface JarvisAiToolDefinition {
  id: string;
  description: string;
  inputSchema: JarvisAiJsonSchema;
}

/** A tool call the AI has requested — `input` is whatever the provider adapter already parsed out
 * of the provider's own arguments encoding (e.g. Responses' JSON-string `arguments`); this layer
 * never parses provider-specific argument encodings itself. */
export interface JarvisAiToolCall {
  /** Provider-issued call id — used to correlate a later JarvisAiToolCallResult back to this call. */
  id: string;
  toolId: string;
  input: unknown;
}

/** The result of actually running a tool call — reuses Phase 1/2's own JarvisToolResult envelope
 * rather than inventing a second success/failure shape for what is, underneath, the exact same
 * kind of outcome a JarvisTool.run already produces. */
export interface JarvisAiToolCallResult {
  toolCallId: string;
  toolId: string;
  result: JarvisToolResult<unknown>;
}

export type JarvisAiMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: JarvisAiToolCall }
  | { type: 'tool_result'; toolCallResult: JarvisAiToolCallResult };

/** `content` is always an array, even for a single plain-text message — a provider adapter that
 * only ever sees plain strings can trivially map `[{ type: 'text', text }]` to its own shorthand;
 * going the other way (discovering a plain string can't hold a tool result) is the harder
 * direction, so this type starts from the more general one. */
export interface JarvisAiMessage {
  role: JarvisAiRole;
  content: readonly JarvisAiMessageContentPart[];
}

/** Convenience for the overwhelmingly common case — a single plain-text message. Never required;
 * always equivalent to constructing the full JarvisAiMessage by hand. */
export function textMessage(role: JarvisAiRole, text: string): JarvisAiMessage {
  return { role, content: [{ type: 'text', text }] };
}

// ================================================================================================
// Request / Response
// ================================================================================================

export interface JarvisAiModelConfig {
  /** Provider-agnostic model identifier (e.g. "gpt-5", "claude-opus-5") — opaque to this layer;
   * an adapter maps it to whatever its own provider expects. Optional: a gateway may apply its
   * own server-side default when omitted. */
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface JarvisAiRequest {
  messages: readonly JarvisAiMessage[];
  /** The Phase 3 Context Engine's own bounded snapshot — never a raw application store or
   * Zustand state. Typed directly against JarvisContextSnapshot (a sibling JARVIS module, not an
   * application internal) so this stays a real compile-time guarantee rather than a comment. */
  context?: JarvisContextSnapshot;
  modelConfig?: JarvisAiModelConfig;
  tools?: readonly JarvisAiToolDefinition[];
  /** Standard Web Platform cancellation — never a custom cancellation token type (see gateway.ts
   * for how this is kept OUT of anything serialized onto the wire). */
  signal?: AbortSignal;
}

export type JarvisAiFinishReason = 'stop' | 'tool_calls' | 'length' | 'cancelled' | 'error';

export interface JarvisAiUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface JarvisAiResponse {
  /** The flattened final text — mirrors Responses' own `output_text` convenience field. Empty
   * string (never omitted) when the model only produced tool calls. */
  text: string;
  finishReason: JarvisAiFinishReason;
  toolCalls?: readonly JarvisAiToolCall[];
  usage?: JarvisAiUsage;
  /** Metadata only — never a raw provider payload, and never anything secret. */
  providerId?: string;
  model?: string;
}

// ================================================================================================
// Streaming
// ================================================================================================

/** A discriminated union covering the shape a real provider's streaming protocol needs, without
 * adopting any one provider's own event-type names verbatim. Deliberately richer than a single
 * "text delta" case (see this file's header) so an adapter can map item-level and tool-argument
 * streaming without lossy flattening, while staying provider-neutral. */
export type JarvisAiStreamEvent =
  | { type: 'response_started'; providerId: string; model?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'text_done'; text: string }
  | { type: 'tool_call_delta'; toolCallId: string; toolId?: string; inputDelta?: string }
  | { type: 'tool_call_completed'; toolCall: JarvisAiToolCall }
  | { type: 'response_completed'; response: JarvisAiResponse }
  | { type: 'response_incomplete'; response: JarvisAiResponse; reason: string }
  | { type: 'error'; error: JarvisAiError };

// ================================================================================================
// Errors
// ================================================================================================

export type JarvisAiErrorCode =
  | 'configuration_error'
  | 'authentication_error'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'timeout'
  | 'cancelled'
  | 'malformed_response'
  | 'unknown_error';

/** A structured, safe-to-display AI error — `message` must never be a raw provider payload, a
 * stack trace, or anything that could contain a credential. Adapters are responsible for
 * translating a real provider exception into one of these fixed codes before it ever reaches
 * this layer's own callers. */
export interface JarvisAiError {
  code: JarvisAiErrorCode;
  message: string;
  /** Only meaningful for 'rate_limited'. */
  retryAfterSeconds?: number;
}
