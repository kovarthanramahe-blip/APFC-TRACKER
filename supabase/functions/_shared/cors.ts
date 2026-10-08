// JARVIS Phase 5 — shared CORS policy for Edge Functions.
//
// Deliberately an EXPLICIT origin allowlist, never `Access-Control-Allow-Origin: *` — this
// phase's own brief rules that combination out, and an allowlist is the only way to combine
// "callable from the real web/Android app" with "not callable from an arbitrary third-party
// page." The real production origin(s) are not known/configured yet (see this phase's own
// report): until an `ALLOWED_ORIGINS` secret is set at deployment time, resolveAllowedOrigin
// always returns null, meaning NO cross-origin caller is granted access — a safe default that
// fails closed, never open.
//
// Deliberately plain TypeScript with NO Deno-specific API (no `Deno.env`, no URL imports) — see
// validation.ts's own header for why: this file is unit-tested directly by this repo's existing
// Vitest suite, not only reachable through the real Edge Function.

/** Comma-separated origins, as a deployment would set via `ALLOWED_ORIGINS`. Returns `[]` for
 * `undefined`/empty — never throws on a missing/malformed value. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** `null` whenever `requestOrigin` is absent (same-origin/non-browser request — CORS headers are
 * moot) or not in `allowedOrigins` — never falls back to a wildcard. */
export function resolveAllowedOrigin(requestOrigin: string | null, allowedOrigins: readonly string[]): string | null {
  if (!requestOrigin) return null;
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
}

export const CORS_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
export const CORS_ALLOWED_METHODS = 'POST, OPTIONS';

/** The full set of CORS response headers for one request. Only ever grants the SPECIFIC request
 * origin (never `*`) when it is in `allowedOrigins`; otherwise omits `Access-Control-Allow-Origin`
 * entirely, which makes the browser block the cross-origin caller from reading the response. */
export function buildCorsHeaders(requestOrigin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
    Vary: 'Origin',
  };
  const allowedOrigin = resolveAllowedOrigin(requestOrigin, allowedOrigins);
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }
  return headers;
}
