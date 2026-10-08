// JARVIS Phase 10 — the Android local-inference JarvisAiProvider adapter.
//
// Implements the existing, unmodified JarvisAiProvider interface (ai/provider.ts) exactly the
// same way ai/ollamaProvider.ts (Phase 8) already does for the Windows/Ollama path — same
// JarvisAiProviderError-on-throw convention for complete(), same JarvisAiStreamEvent-reuse for
// stream(). This file is the ONLY place "android" and "provider identity" meet: everything below
// it (NativeLlamaRuntimeClient) has no concept of providerId/model, and everything above it
// (callers, the provider registry, routing) has no concept of the native runtime at all.
//
// Tool calling is NOT claimed (`capabilities.toolCalling: false`) — the native stub this phase
// ships has no tool-calling concept whatsoever, and claiming it would be exactly the invented
// capability this project's own discipline forbids. `streaming: true` is accurate: the streaming
// lifecycle below is real (started -> delta* -> done/completed, or error/cancelled), even though
// the tokens it currently streams come from a deterministic stub, not a real model (see
// NativeLlamaRuntime's own header and this phase's final report for that honest distinction).
import { JarvisAiProviderError, type JarvisAiProvider } from '../provider';
import type { JarvisAiError, JarvisAiMessage, JarvisAiMessageContentPart, JarvisAiRequest, JarvisAiResponse, JarvisAiStreamEvent } from '../types';
import type { JarvisAiProviderHealthStatus } from '../providerMetadata';
import { NativeLlamaRuntimeError, toAndroidProviderHealthStatus, type NativeLlamaRuntimeClient } from './nativeLlamaRuntimeContract';

export interface AndroidLocalLlamaProviderConfig {
  model: string;
  providerId?: string;
  displayName?: string;
}

/** Only 'text' content parts are sent to the native runtime — same deliberate narrowing
 * ai/ollamaProvider.ts already applies, for the same reason: capabilities.toolCalling is false,
 * so a caller that respects it never constructs a request containing a tool part in the first
 * place; this is a safety net, not the primary contract. */
function flattenContent(content: readonly JarvisAiMessageContentPart[]): string {
  return content
    .filter((part): part is Extract<JarvisAiMessageContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function flattenMessagesToPrompt(messages: readonly JarvisAiMessage[]): string {
  return messages.map((message) => `${message.role}: ${flattenContent(message.content)}`).join('\n');
}

function mapRuntimeErrorToAiError(err: unknown): JarvisAiError {
  if (err instanceof NativeLlamaRuntimeError) {
    switch (err.kind) {
      case 'timeout':
        return { code: 'timeout', message: 'The Android local runtime did not respond in time.' };
      case 'cancelled':
        return { code: 'cancelled', message: 'The request was cancelled.' };
      case 'unavailable':
        return { code: 'provider_unavailable', message: 'The Android local runtime is not available.' };
      case 'malformed_response':
        return { code: 'malformed_response', message: err.message };
      case 'unknown':
        return { code: 'unknown_error', message: err.message };
    }
  }
  return { code: 'unknown_error', message: err instanceof Error ? err.message : 'Unknown Android local runtime error.' };
}

/**
 * `runtime` is injected — never constructed internally — matching every other JARVIS
 * registry/client's own "no hidden global dependency" discipline (ai/ollamaProvider.ts,
 * ai/providerRegistry.ts, ai/gateway.ts all follow the same shape). A real caller passes
 * `createNativeLlamaRuntime(LocalLlamaRuntime)` (nativeLlamaRuntime.ts, localLlamaCapacitorPlugin.ts).
 */
export function createAndroidLocalLlamaProvider(runtime: NativeLlamaRuntimeClient, config: AndroidLocalLlamaProviderConfig): JarvisAiProvider {
  const providerId = config.providerId ?? 'android-local-llama';

  return {
    id: providerId,
    name: config.displayName ?? `Local (Android on-device: ${config.model})`,
    capabilities: { streaming: true, toolCalling: false },

    async complete(request: JarvisAiRequest): Promise<JarvisAiResponse> {
      try {
        const result = await runtime.complete({ prompt: flattenMessagesToPrompt(request.messages), maxOutputTokens: request.modelConfig?.maxOutputTokens, temperature: request.modelConfig?.temperature }, request.signal);
        return {
          text: result.text,
          finishReason: result.finishReason,
          usage: { inputTokens: result.promptTokens, outputTokens: result.generatedTokens },
          providerId,
          model: config.model,
        };
      } catch (err) {
        throw new JarvisAiProviderError(mapRuntimeErrorToAiError(err));
      }
    },

    async *stream(request: JarvisAiRequest): AsyncIterable<JarvisAiStreamEvent> {
      yield { type: 'response_started', providerId, model: config.model };

      try {
        for await (const event of runtime.stream({ prompt: flattenMessagesToPrompt(request.messages), maxOutputTokens: request.modelConfig?.maxOutputTokens, temperature: request.modelConfig?.temperature }, request.signal)) {
          if (event.type === 'response_completed') {
            yield { type: 'response_completed', response: { ...event.response, providerId, model: config.model } };
          } else {
            yield event;
          }
        }
      } catch (err) {
        yield { type: 'error', error: mapRuntimeErrorToAiError(err) };
      }
    },
  };
}

/**
 * Step 7's own explicit rule: "do not claim 'AI ready' when only the bridge stub exists." Calls
 * BOTH getStatus() and getLoadedModel() and cross-checks them (via toAndroidProviderHealthStatus)
 * rather than trusting status alone — a runtime that reports 'ready' with no loaded model is
 * treated as 'error', never as 'model_ready'.
 */
export async function getAndroidLocalLlamaHealth(runtime: NativeLlamaRuntimeClient): Promise<JarvisAiProviderHealthStatus> {
  const status = await runtime.getStatus();
  const loadedModel = await runtime.getLoadedModel();
  return toAndroidProviderHealthStatus(status, loadedModel !== null);
}
