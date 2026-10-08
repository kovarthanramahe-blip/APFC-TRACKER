// JARVIS Phase 4 — provider interface.
//
// The shape every future AI provider adapter (OpenAI, Anthropic, etc. — none implemented yet)
// must satisfy. Deliberately provider-neutral: nothing here exposes an OpenAI/Anthropic/Gemini-
// specific type or field name. A real adapter lives in its own module (a future phase) and holds
// its own provider SDK/credential internally — on the SERVER/edge side only, never here, and
// never imported by this file.
import type { JarvisAiError, JarvisAiRequest, JarvisAiResponse, JarvisAiStreamEvent } from './types';

export interface JarvisAiProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
}

/**
 * JARVIS Phase 8 — the one error shape every JarvisAiProvider.complete() throws on failure
 * (`stream()` instead yields a JarvisAiStreamEvent of type 'error', since that union already has
 * its own case for it — see types.ts). Carries a structured JarvisAiError rather than a raw
 * provider exception, so a server/edge caller (ai/gateway.ts's own future real endpoint) can
 * always build a JarvisAiGatewayResponse's `{status:'error', error}` shape with a simple
 * `catch (err) { if (err instanceof JarvisAiProviderError) ... }`, regardless of which provider
 * adapter threw it.
 */
export class JarvisAiProviderError extends Error {
  readonly jarvisError: JarvisAiError;

  constructor(jarvisError: JarvisAiError) {
    super(jarvisError.message);
    this.name = 'JarvisAiProviderError';
    this.jarvisError = jarvisError;
  }
}

/**
 * A single AI provider adapter. `stream` is optional — present only when
 * `capabilities.streaming` is true — rather than every provider being forced to fake streaming
 * over a non-streaming call (this phase explicitly rules out "fake streaming" with `setTimeout`;
 * a provider that can't really stream simply omits this method).
 */
export interface JarvisAiProvider {
  id: string;
  name: string;
  capabilities: JarvisAiProviderCapabilities;
  complete(request: JarvisAiRequest): Promise<JarvisAiResponse>;
  stream?(request: JarvisAiRequest): AsyncIterable<JarvisAiStreamEvent>;
}
