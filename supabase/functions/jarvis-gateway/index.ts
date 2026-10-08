// JARVIS Phase 5.1 — secure, authenticated gateway Edge Function (auth hardening).
//
// Migrated from Phase 5's hand-rolled `createClient()` + `auth.getUser()` check to Supabase's
// current recommended `withSupabase({ auth: 'user' })` wrapper, from `npm:@supabase/server@^1`.
// Verified against Supabase's own official doc pages before writing this (this sandbox cannot
// fetch supabase.com directly, so verification went through independently cross-checked
// WebSearch excerpts of those exact official URLs — see this phase's own report for the full
// citation list and confidence notes; the package is explicitly "public beta" per Supabase's own
// blog post, flagged there as an open architectural item, not hidden here).
//
// AUTH: `withSupabase({ auth: 'user' }, handler)` verifies the caller's JWT and short-circuits
// with a rejection BEFORE `handler` ever runs on a missing/invalid JWT — confirmed: "a present-
// but-invalid JWT rejects the request; no silent downgrade." So there is deliberately NO second
// `auth.getUser()`/service-role lookup in this file — that would be exactly the redundant second
// auth path this phase's own brief rules out. `ctx.userClaims` (the authenticated identity) is
// guaranteed non-null by the time `handler` runs; this file never reads a user id from the
// request BODY for identity, only from this already-verified claim. `verify_jwt = true` stays
// enabled in ../../config.toml — confirmed required alongside `auth: 'user'`, not superseded by
// it: the platform check and withSupabase's own check are additive layers.
//
// CORS: withSupabase's own `cors` option (`'default' | 'disabled' | { headers }`) has no
// multi-origin-allowlist concept — a response can only ever carry ONE
// `Access-Control-Allow-Origin` value, so supporting more than one real caller origin (the web
// app now, a future Android/Capacitor origin later) without ever using `*` requires computing
// that one value PER REQUEST from the incoming `Origin` header — which withSupabase's static
// `cors` config does not do. Rather than guess at an unconfirmed per-request CORS hook,
// `cors: 'disabled'` opts out of withSupabase's own CORS handling entirely, and this function's
// already-tested, unchanged explicit-allowlist CORS logic (../_shared/cors.ts, identical to
// Phase 5) is applied manually inside the handler below — preserving Phase 5's exact security
// model rather than weakening it to fit a simpler-but-less-capable built-in option.
//
// No provider API key (OpenAI/Anthropic/Gemini/etc.) is read, required, or accepted anywhere in
// this file. No database table is read or written. No service-role key is used anywhere in this
// file — the elevated, RLS-bypassing client withSupabase's own context object would otherwise
// make available is never referenced here. No AI
// provider is contacted; this phase still always returns the same deterministic "gateway ready"
// response on a valid, authenticated, validated request.
import { withSupabase } from 'npm:@supabase/server@^1';
import { buildCorsHeaders, parseAllowedOrigins } from '../_shared/cors.ts';
import {
  validateRawBodySize,
  parseJson,
  validateGatewayRequestBody,
  buildGatewayReadyResponse,
  buildGatewayErrorResponse,
  type GatewayValidationError,
} from './validation.ts';

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function errorResponse(error: GatewayValidationError, corsHeaders: Record<string, string>): Response {
  return jsonResponse(buildGatewayErrorResponse(error), error.status, corsHeaders);
}

export default {
  fetch: withSupabase({ auth: 'user', cors: 'disabled' }, async (req: Request) => {
    // ALLOWED_ORIGINS is not configured anywhere in this phase (see Phase 5's own report) — an
    // unset/empty value means parseAllowedOrigins returns [], so buildCorsHeaders grants NO
    // cross-origin caller access yet. This fails closed, never open, until a real deployment sets
    // the actual web/Android app origin(s).
    const allowedOrigins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));
    const corsHeaders = buildCorsHeaders(req.headers.get('Origin'), allowedOrigins);

    // withSupabase's own OPTIONS/CORS handling is disabled above (`cors: 'disabled'`), so a
    // preflight request reaches this handler like any other — handled the same way Phase 5 did.
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return errorResponse({ status: 405, code: 'method_not_allowed', message: 'Only POST is supported.' }, corsHeaders);
    }

    // No manual auth.getUser()/service-role lookup here: withSupabase({ auth: 'user' }) already
    // rejected any request with no/invalid JWT before this handler could run — see this file's
    // own header.

    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return errorResponse({ status: 400, code: 'malformed_request', message: 'Could not read the request body.' }, corsHeaders);
    }

    const sizeError = validateRawBodySize(rawBody);
    if (sizeError) return errorResponse(sizeError, corsHeaders);

    const parsed = parseJson(rawBody);
    if (!parsed.ok) return errorResponse(parsed.error, corsHeaders);

    const validated = validateGatewayRequestBody(parsed.value);
    if (!validated.ok) return errorResponse(validated.error, corsHeaders);

    return jsonResponse(buildGatewayReadyResponse(validated.request), 200, corsHeaders);
  }),
};
