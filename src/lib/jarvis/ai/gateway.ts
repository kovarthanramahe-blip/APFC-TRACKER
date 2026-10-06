// JARVIS Phase 4 — secure AI gateway contract (CLIENT SIDE ONLY).
//
// *** NO SECURE SERVER/EDGE ENDPOINT EXISTS IN THIS REPOSITORY YET. ***
//
// This was verified, not assumed, before writing this file:
//   - vercel.json contains only a client-side SPA rewrite rule — no `functions`/`api` entry.
//   - supabase/ contains a single SQL migration (supabase/migrations/0001_create_user_data.sql)
//     — Supabase is used here purely as Postgres + auth (see lib/supabase.ts/useAuth.ts/
//     cloudSync.ts); there is no supabase/functions directory, so no Supabase Edge Function
//     exists either.
//   - There is no other server/api directory anywhere in this repository.
// This app is a Vite-built static SPA (deployed to GitHub Pages per vite.config.ts's own
// GITHUB_PAGES base-path handling, with vercel.json only present for an alternate static host).
// There is currently nowhere safe to put a provider API key.
//
// WHAT STILL HAS TO BE DEPLOYED BEFORE A REAL AI CALL CAN WORK (not done in this phase, and not
// something this phase invents unasked — see Phase 4's own brief: "do not invent a backend
// architecture"):
//   A server/edge function — e.g. a Vercel Serverless/Edge Function, a Supabase Edge Function, or
//   equivalent — that:
//     1. authenticates the caller (reusing this app's existing Supabase auth session — see
//        lib/useAuth.ts — rather than inventing a second auth scheme),
//     2. holds the real provider API key as a SERVER-SIDE-ONLY secret (never a Vite `import.meta.env`
//        value, which ends up in the public client bundle regardless of naming convention),
//     3. accepts exactly the JarvisAiGatewayRequest shape below, calls a real JarvisAiProvider
//        adapter (none implemented yet) server-side, and
//     4. returns either a JarvisAiGatewayResponse or a `text/event-stream` of JSON-encoded
//        JarvisAiStreamEvent values (see `streamFetchResponse` below for the exact wire format
//        this client expects).
//   This file defines the contract that endpoint must satisfy; it does not deploy it, since no
//   project server/edge runtime was already set up to host it safely (see verification above).
//
// This official OpenAI guidance (platform.openai.com's own linked security reference,
// help.openai.com/en/articles/5112595-best-practices-for-api-key-safety) states plainly: "Never
// deploy your key in client-side environments like browsers or mobile apps" and "Requests should
// always be routed through your own backend server" — exactly the shape this file assumes, for
// any provider, not just OpenAI.
import type { JarvisAiError, JarvisAiRequest, JarvisAiResponse, JarvisAiStreamEvent } from './types';

/**
 * What the client sends to the secure gateway endpoint. NEVER includes a provider API key or any
 * other provider secret — `sessionToken` is this app's OWN existing user session/auth token (the
 * same one lib/useAuth.ts already manages), proving WHO is asking; the server is solely
 * responsible for deciding which provider key, if any, to use on the caller's behalf. This layer
 * never inspects or validates `sessionToken` itself.
 */
export interface JarvisAiGatewayRequest {
  sessionToken: string;
  request: JarvisAiRequest;
}

export type JarvisAiGatewayResponse = { status: 'ok'; response: JarvisAiResponse } | { status: 'error'; error: JarvisAiError };

export interface JarvisAiGatewayClient {
  complete(gatewayRequest: JarvisAiGatewayRequest, signal?: AbortSignal): Promise<JarvisAiGatewayResponse>;
  stream(gatewayRequest: JarvisAiGatewayRequest, signal?: AbortSignal): AsyncIterable<JarvisAiStreamEvent>;
}

/** The exact, minimal wire shape sent to the gateway endpoint — built field-by-field (never a
 * blind spread of the caller's `request`) so an accidentally- or maliciously-extended
 * JarvisAiRequest/JarvisAiGatewayRequest object can never leak an extra field (e.g. a stray
 * `apiKey`) onto the wire; only the fields this function explicitly lists are ever serialized.
 * `request.signal` (an AbortSignal — not serializable, and not data) is deliberately never
 * included here; cancellation is carried by the HTTP request itself (see complete()/stream()
 * below passing `signal` straight to `fetch`), never by anything inside the JSON body. */
function toWirePayload(gatewayRequest: JarvisAiGatewayRequest): Record<string, unknown> {
  return {
    sessionToken: gatewayRequest.sessionToken,
    request: {
      messages: gatewayRequest.request.messages,
      context: gatewayRequest.request.context,
      modelConfig: gatewayRequest.request.modelConfig,
      tools: gatewayRequest.request.tools,
    },
  };
}

function toConfigurationError(message: string): JarvisAiError {
  return { code: 'configuration_error', message };
}

/**
 * Parses one `text/event-stream` body into JarvisAiStreamEvent values. Wire format: each SSE
 * message's `data:` line is a JSON-encoded JarvisAiStreamEvent — the SERVER's own job (via
 * whatever JarvisAiProvider adapter it calls) is translating a real provider's streaming protocol
 * into this already-neutral shape, so this client-side parser never needs provider-specific event
 * names. A line that fails to parse yields a single `error` event (`malformed_response`) and ends
 * the stream, rather than throwing out of an async generator a caller might not expect to throw.
 */
async function* parseEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<JarvisAiStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawMessage = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const dataLine = rawMessage.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const jsonText = dataLine.slice('data:'.length).trim();
        if (!jsonText) continue;

        try {
          yield JSON.parse(jsonText) as JarvisAiStreamEvent;
        } catch {
          yield { type: 'error', error: { code: 'malformed_response', message: 'Could not parse a streamed event from the gateway.' } };
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * A `fetch`-based JarvisAiGatewayClient against `endpointUrl` — no provider SDK, no credential of
 * any kind held here. Calling this against a real `endpointUrl` today simply fails to connect
 * (per this file's own header: no such endpoint is deployed anywhere in this repository yet); it
 * exists so later phases build the real endpoint against a stable, already-tested client
 * contract, and so this phase's own tests can verify the client's behaviour without a real
 * network call (every test mocks `fetch`).
 */
export function createFetchGatewayClient(endpointUrl: string): JarvisAiGatewayClient {
  return {
    async complete(gatewayRequest, signal) {
      try {
        const res = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toWirePayload(gatewayRequest)),
          signal,
        });
        if (!res.ok) {
          return { status: 'error', error: { code: 'provider_unavailable', message: `Gateway returned HTTP ${res.status}.` } };
        }
        const parsed = (await res.json()) as JarvisAiGatewayResponse;
        return parsed;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { status: 'error', error: { code: 'cancelled', message: 'The request was cancelled.' } };
        }
        return { status: 'error', error: toConfigurationError(err instanceof Error ? err.message : 'Unknown gateway error.') };
      }
    },

    async *stream(gatewayRequest, signal) {
      let res: Response;
      try {
        res = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(toWirePayload(gatewayRequest)),
          signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          yield { type: 'error', error: { code: 'cancelled', message: 'The request was cancelled.' } };
          return;
        }
        yield { type: 'error', error: toConfigurationError(err instanceof Error ? err.message : 'Unknown gateway error.') };
        return;
      }

      if (!res.ok || !res.body) {
        yield { type: 'error', error: { code: 'provider_unavailable', message: `Gateway returned HTTP ${res.status}.` } };
        return;
      }

      yield* parseEventStream(res.body);
    },
  };
}
