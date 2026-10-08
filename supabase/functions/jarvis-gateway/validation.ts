// JARVIS Phase 5 — pure request validation and response-building for the jarvis-gateway Edge
// Function.
//
// Deliberately framework/runtime-INDEPENDENT: no `Deno.*` API, no URL-style imports, nothing a
// plain Node/Vitest process can't execute directly. index.ts (the real Deno.serve handler) is
// kept THIN on purpose — it does only the HTTP/auth/CORS plumbing Deno/Supabase actually require,
// and delegates every bit of body validation and response-shape logic to this file, so that logic
// can be unit-tested in this repo's existing Vitest suite rather than requiring the Supabase local
// runtime (Docker) just to exercise it.
//
// Structurally compatible with (deliberately NOT importing) src/lib/jarvis/ai/types.ts's
// JarvisAiMessage/JarvisAiRequest shapes: this Edge Function is deployed completely independently
// of the Vite app's own build, so it defines its own minimal, local notion of "a valid request"
// rather than depending on a source file outside supabase/functions/ at deploy time.
//
// NO AI provider is called anywhere in this module. NO database is read or written. This module
// only decides whether an already-authenticated request's BODY is well-formed and bounded, and
// builds the deterministic "gateway is ready" response Phase 5 calls for.

export const MAX_MESSAGES = 50;
export const MAX_MESSAGE_CONTENT_PARTS = 20;
export const MAX_TEXT_LENGTH = 8000;
export const MAX_TOOLS = 20;
/** ~200KB — generous for a Phase-3-bounded JARVIS context plus a short message list, far below
 * the Edge Function platform's own 256MB memory ceiling. A server-side cap matters regardless of
 * the platform limit: Supabase's own docs note an oversized (especially compressed) payload can
 * still cause problems well before that ceiling. */
export const MAX_BODY_BYTES = 200_000;

export interface GatewayValidationError {
  /** HTTP status this error should be returned with. */
  status: number;
  code: string;
  /** Always a safe, human-readable string — never a raw exception message or stack trace. */
  message: string;
}

export interface ValidatedGatewayRequest {
  messageCount: number;
  hasContext: boolean;
  toolCount: number;
}

export type GatewayValidationResult = { ok: true; request: ValidatedGatewayRequest } | { ok: false; error: GatewayValidationError };

export function validateRawBodySize(raw: string): GatewayValidationError | null {
  if (raw.length > MAX_BODY_BYTES) {
    return { status: 413, code: 'payload_too_large', message: `Request body exceeds the maximum allowed size of ${MAX_BODY_BYTES} bytes.` };
  }
  return null;
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: GatewayValidationError };

export function parseJson(raw: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: { status: 400, code: 'malformed_json', message: 'Request body is not valid JSON.' } };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const VALID_ROLES = new Set(['system', 'user', 'assistant', 'tool']);

/** Scans the ENTIRE parsed body (recursively) for a key that looks like a provider credential —
 * `apiKey`, `secret`, `serviceRole`, `credential`, in any casing/separator style, anywhere in the
 * structure. The client must never be able to smuggle a provider secret into this request by
 * nesting it somewhere this function's own explicit field checks don't look — this is a second,
 * broader line of defense beyond the specific fields validateGatewayRequestBody already checks. */
export function findCredentialLikeKey(value: unknown, seen: Set<unknown> = new Set()): string | null {
  if (!isPlainObject(value) || seen.has(value)) return null;
  seen.add(value);
  const CREDENTIAL_KEY_PATTERN = /api[_-]?key|secret|service[_-]?role|credential/i;
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_KEY_PATTERN.test(key)) return key;
    const nested = findCredentialLikeKey(child, seen);
    if (nested) return nested;
  }
  return null;
}

/**
 * Validates an already-JSON-parsed request body. Expects `{ request: { messages: [...], tools?,
 * context? } }` — matching Phase 4's JarvisAiRequest shape structurally. Identity/authentication
 * is NEVER derived from anything in this body (see index.ts: the caller is authenticated solely
 * via the verified `Authorization` header before this function is ever called) — so an incoming
 * body is free to carry an unrelated extra field like Phase 4 gateway client's own `sessionToken`
 * without this function reading or trusting it for identity; it is simply ignored.
 */
export function validateGatewayRequestBody(value: unknown): GatewayValidationResult {
  if (!isPlainObject(value)) {
    return { ok: false, error: { status: 400, code: 'malformed_request', message: 'Request body must be a JSON object.' } };
  }

  const credentialKey = findCredentialLikeKey(value);
  if (credentialKey) {
    return {
      ok: false,
      error: { status: 400, code: 'credential_field_rejected', message: `Field "${credentialKey}" is not accepted — provider credentials are never supplied by the client.` },
    };
  }

  if (!('request' in value) || !isPlainObject(value.request)) {
    return { ok: false, error: { status: 400, code: 'missing_request', message: '"request" is required and must be an object.' } };
  }
  const request = value.request;

  if (!('messages' in request) || !Array.isArray(request.messages)) {
    return { ok: false, error: { status: 400, code: 'missing_messages', message: '"request.messages" is required and must be an array.' } };
  }
  const messages = request.messages;

  if (messages.length === 0) {
    return { ok: false, error: { status: 400, code: 'empty_messages', message: '"request.messages" must contain at least one message.' } };
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, error: { status: 413, code: 'too_many_messages', message: `"request.messages" exceeds the maximum of ${MAX_MESSAGES}.` } };
  }

  for (const message of messages) {
    if (!isPlainObject(message)) {
      return { ok: false, error: { status: 400, code: 'malformed_message', message: 'Every message must be an object.' } };
    }
    if (typeof message.role !== 'string' || !VALID_ROLES.has(message.role)) {
      return { ok: false, error: { status: 400, code: 'invalid_role', message: 'Every message.role must be one of system, user, assistant, tool.' } };
    }
    if (!Array.isArray(message.content)) {
      return { ok: false, error: { status: 400, code: 'malformed_content', message: 'Every message.content must be an array.' } };
    }
    if (message.content.length > MAX_MESSAGE_CONTENT_PARTS) {
      return { ok: false, error: { status: 413, code: 'content_too_large', message: `A message's content exceeds the maximum of ${MAX_MESSAGE_CONTENT_PARTS} parts.` } };
    }
    for (const part of message.content) {
      if (!isPlainObject(part) || typeof part.type !== 'string') {
        return { ok: false, error: { status: 400, code: 'malformed_content_part', message: 'Every content part must be an object with a "type".' } };
      }
      if (part.type === 'text' && typeof part.text === 'string' && part.text.length > MAX_TEXT_LENGTH) {
        return { ok: false, error: { status: 413, code: 'text_too_large', message: `A text content part exceeds the maximum of ${MAX_TEXT_LENGTH} characters.` } };
      }
    }
  }

  if ('tools' in request && request.tools !== undefined) {
    if (!Array.isArray(request.tools)) {
      return { ok: false, error: { status: 400, code: 'malformed_tools', message: '"request.tools" must be an array when present.' } };
    }
    if (request.tools.length > MAX_TOOLS) {
      return { ok: false, error: { status: 413, code: 'too_many_tools', message: `"request.tools" exceeds the maximum of ${MAX_TOOLS}.` } };
    }
  }

  if ('context' in request && request.context !== undefined && !isPlainObject(request.context)) {
    return { ok: false, error: { status: 400, code: 'malformed_context', message: '"request.context" must be an object when present.' } };
  }

  return {
    ok: true,
    request: {
      messageCount: messages.length,
      hasContext: isPlainObject(request.context),
      toolCount: Array.isArray(request.tools) ? request.tools.length : 0,
    },
  };
}

export interface GatewayReadyResponseBody {
  status: 'ok';
  mode: 'gateway_ready';
  userAuthenticated: true;
  providerConnected: false;
  streamingSupportedByContract: true;
  requestAccepted: true;
  messageCount: number;
  hasContext: boolean;
  toolCount: number;
  message: string;
}

/** The deterministic, non-AI response this phase always returns on success — proves auth +
 * validation succeeded without ever claiming an AI answer was generated. */
export function buildGatewayReadyResponse(validated: ValidatedGatewayRequest): GatewayReadyResponseBody {
  return {
    status: 'ok',
    mode: 'gateway_ready',
    userAuthenticated: true,
    providerConnected: false,
    streamingSupportedByContract: true,
    requestAccepted: true,
    messageCount: validated.messageCount,
    hasContext: validated.hasContext,
    toolCount: validated.toolCount,
    message: 'JARVIS gateway is ready. No AI provider was contacted.',
  };
}

export interface GatewayErrorResponseBody {
  status: 'error';
  error: { code: string; message: string };
}

export function buildGatewayErrorResponse(error: GatewayValidationError): GatewayErrorResponseBody {
  return { status: 'error', error: { code: error.code, message: error.message } };
}
