// JARVIS Phase 5 — client integration for the deployed jarvis-gateway Supabase Edge Function.
//
// Implements Phase 4's own JarvisAiGatewayClient interface (see gateway.ts) — interchangeable
// with createFetchGatewayClient, never a second/competing client shape. Uses supabase-js's own
// `functions.invoke()`, which attaches the caller's CURRENT session JWT as the Authorization
// header automatically — this file never reads, constructs, or sends a provider credential of
// any kind, and never needs a `sessionToken` body field: identity is proven by the Authorization
// header supabase-js already sends, exactly how the real jarvis-gateway function expects it (see
// supabase/functions/jarvis-gateway/index.ts). `gatewayRequest.sessionToken` is accepted (to
// satisfy JarvisAiGatewayRequest's shape) but intentionally never read.
//
// Streaming: the deployed function does not implement real streaming yet (Phase 5 explicitly
// does not add one). Faking a stream here would violate this project's own "no fake streaming"
// rule, so stream() yields exactly one honest `error` event explaining the limitation, rather
// than pretending to stream.
import type { JarvisAiGatewayClient, JarvisAiGatewayRequest, JarvisAiGatewayResponse } from './gateway';
import type { JarvisAiStreamEvent } from './types';

const FUNCTION_NAME = 'jarvis-gateway';

/** Only the one real method this client calls, and only the shape it actually reads from the
 * result — deliberately NOT `Pick<SupabaseClient, 'functions'>` (which pulls in FunctionsClient's
 * entire shape: url/headers/region/fetch/setAuth, forcing every test double to fake properties
 * this file never touches) and deliberately NOT `SupabaseClient['functions']['invoke']`'s own
 * generic `<T>` signature (which makes mocking a concrete `data` shape in tests fight TypeScript
 * for no real benefit, since this file always treats `data` as `unknown` and validates it at
 * runtime via isGatewayReadyBody anyway). A real `supabase.functions` (lib/supabase.ts) satisfies
 * this narrower, non-generic shape structurally — passing it here needs no cast. */
export interface MinimalSupabaseFunctionsClient {
  functions: {
    invoke: (functionName: string, options?: { body?: unknown; signal?: AbortSignal }) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

/** The jarvis-gateway function's own deterministic success body (see
 * supabase/functions/jarvis-gateway/validation.ts's GatewayReadyResponseBody) — duplicated here
 * as a minimal, local shape (not imported) for the same reason validation.ts itself doesn't
 * import src/lib/jarvis/ai/types.ts: this client and that independently-deployed function must
 * not depend on sharing a literal file at build time. */
interface GatewayReadyBody {
  status: 'ok';
  message?: string;
}

function isGatewayReadyBody(value: unknown): value is GatewayReadyBody {
  return typeof value === 'object' && value !== null && (value as { status?: unknown }).status === 'ok';
}

/**
 * `supabaseClient` is injected — never imported directly from lib/supabase.ts here — so this stays
 * trivially testable with a stub client, matching every other JARVIS registry/client's own
 * "no hidden global dependency" discipline. A real caller passes this app's existing `supabase`
 * client (lib/supabase.ts).
 */
export function createSupabaseGatewayClient(supabaseClient: MinimalSupabaseFunctionsClient): JarvisAiGatewayClient {
  return {
    async complete(gatewayRequest: JarvisAiGatewayRequest, signal?: AbortSignal): Promise<JarvisAiGatewayResponse> {
      const { messages, context, modelConfig, tools } = gatewayRequest.request;

      try {
        const { data, error } = await supabaseClient.functions.invoke(FUNCTION_NAME, {
          body: { request: { messages, context, modelConfig, tools } },
          signal,
        });

        if (error) {
          return { status: 'error', error: { code: 'provider_unavailable', message: error.message || 'The gateway function returned an error.' } };
        }
        if (!isGatewayReadyBody(data)) {
          return { status: 'error', error: { code: 'malformed_response', message: 'The gateway returned an unexpected response shape.' } };
        }

        // Phase 5's deterministic "gateway ready" acknowledgement, never a real AI answer —
        // `finishReason: 'stop'` here only satisfies JarvisAiResponse's required shape.
        return { status: 'ok', response: { text: data.message ?? '', finishReason: 'stop', providerId: FUNCTION_NAME } };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { status: 'error', error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        return { status: 'error', error: { code: 'configuration_error', message: err instanceof Error ? err.message : 'Unknown gateway error.' } };
      }
    },

    async *stream(): AsyncIterable<JarvisAiStreamEvent> {
      yield { type: 'error', error: { code: 'provider_unavailable', message: 'Streaming is not yet supported by the deployed JARVIS gateway function.' } };
    },
  };
}
