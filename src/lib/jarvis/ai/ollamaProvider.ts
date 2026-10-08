// JARVIS Phase 8 — Ollama inference adapter (Part 5).
//
// Implements the existing, unmodified JarvisAiProvider interface (provider.ts) — this file adds
// an IMPLEMENTATION, never a new/competing provider contract. `complete()` throws a
// JarvisAiProviderError on failure (see provider.ts's own doc comment on that convention);
// `stream()` yields the existing JarvisAiStreamEvent union's own 'error' case instead, since that
// union already has a dedicated slot for it.
//
// Tool calling is intentionally NOT claimed here (`capabilities.toolCalling: false`): Ollama's
// /api/chat does accept a `tools` field, but support for it is specific to each model (not every
// model Ollama can run actually honours tool definitions), and this phase's own brief forbids
// inventing a capability — claiming `toolCalling: true` for an adapter bound to an arbitrary,
// caller-chosen model would be exactly that. `capabilities.streaming: true` is accurate: streaming
// is implemented below, for real, against Ollama's own newline-delimited JSON wire format.
import { JarvisAiProviderError, type JarvisAiProvider } from './provider';
import type { JarvisAiError, JarvisAiMessage, JarvisAiMessageContentPart, JarvisAiModelConfig, JarvisAiRequest, JarvisAiResponse, JarvisAiStreamEvent } from './types';
import { OllamaClientError, type JarvisOllamaHttpClient, type OllamaChatMessage, type OllamaChatResponseChunk, type OllamaRequestOptions } from './localRuntime';

export interface OllamaProviderConfig {
  /** The default model this adapter asks Ollama for — overridable per-request via
   * `request.modelConfig.model` (JarvisAiModelConfig's own field is explicitly "opaque to this
   * layer; an adapter maps it to whatever its own provider expects" — here, that mapping is
   * direct: the string is passed straight through as Ollama's own `model` field). */
  model: string;
  providerId?: string;
  displayName?: string;
}

/** Only 'text' content parts are sent to Ollama, which has no concept of JARVIS's own
 * tool_call/tool_result parts — consistent with `capabilities.toolCalling: false` above: a caller
 * that respects this adapter's declared capabilities never constructs a request containing them in
 * the first place, so this is a safety net, not the primary contract. */
function flattenContent(content: readonly JarvisAiMessageContentPart[]): string {
  return content
    .filter((part): part is Extract<JarvisAiMessageContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function toOllamaMessages(messages: readonly JarvisAiMessage[]): OllamaChatMessage[] {
  return messages.map((message) => ({ role: message.role, content: flattenContent(message.content) }));
}

function toOllamaOptions(modelConfig: JarvisAiModelConfig | undefined): OllamaRequestOptions | undefined {
  if (!modelConfig) return undefined;
  const options: OllamaRequestOptions = {};
  if (modelConfig.temperature !== undefined) options.temperature = modelConfig.temperature;
  if (modelConfig.maxOutputTokens !== undefined) options.num_predict = modelConfig.maxOutputTokens;
  return Object.keys(options).length > 0 ? options : undefined;
}

function mapClientErrorToAiError(err: unknown): JarvisAiError {
  if (err instanceof OllamaClientError) {
    switch (err.kind) {
      case 'timeout':
        return { code: 'timeout', message: 'The local runtime did not respond in time.' };
      case 'cancelled':
        return { code: 'cancelled', message: 'The request was cancelled.' };
      case 'network_error':
        return { code: 'provider_unavailable', message: 'The local runtime (Ollama) is not reachable.' };
      case 'http_error':
        return { code: 'provider_unavailable', message: err.message };
      case 'malformed_response':
        return { code: 'malformed_response', message: err.message };
    }
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { code: 'cancelled', message: 'The request was cancelled.' };
  }
  return { code: 'unknown_error', message: err instanceof Error ? err.message : 'Unknown local runtime error.' };
}

function toAiResponse(chunk: OllamaChatResponseChunk, text: string, providerId: string): JarvisAiResponse {
  return {
    text,
    finishReason: chunk.done_reason === 'length' ? 'length' : 'stop',
    usage: { inputTokens: chunk.prompt_eval_count, outputTokens: chunk.eval_count },
    providerId,
    model: chunk.model,
  };
}

/**
 * `client` is injected (never constructed internally) — exactly like every other JARVIS
 * registry/client in this codebase, so this stays trivially testable with a deterministic fixture
 * and so production code decides, in one place, which real client (localRuntime.ts's
 * createFetchOllamaHttpClient, pointed at a caller-chosen baseUrl) to pass in.
 */
export function createOllamaProvider(client: JarvisOllamaHttpClient, config: OllamaProviderConfig): JarvisAiProvider {
  const providerId = config.providerId ?? 'ollama';

  return {
    id: providerId,
    name: config.displayName ?? `Local (Ollama: ${config.model})`,
    capabilities: { streaming: true, toolCalling: false },

    async complete(request: JarvisAiRequest): Promise<JarvisAiResponse> {
      const model = request.modelConfig?.model ?? config.model;
      try {
        const chunk = await client.chat({ model, messages: toOllamaMessages(request.messages), stream: false, options: toOllamaOptions(request.modelConfig) }, request.signal);
        return toAiResponse(chunk, chunk.message?.content ?? '', providerId);
      } catch (err) {
        throw new JarvisAiProviderError(mapClientErrorToAiError(err));
      }
    },

    async *stream(request: JarvisAiRequest): AsyncIterable<JarvisAiStreamEvent> {
      const model = request.modelConfig?.model ?? config.model;
      yield { type: 'response_started', providerId, model };

      let fullText = '';
      let finalChunk: OllamaChatResponseChunk | undefined;

      try {
        for await (const chunk of client.chatStream({ model, messages: toOllamaMessages(request.messages), options: toOllamaOptions(request.modelConfig) }, request.signal)) {
          const delta = chunk.message?.content ?? '';
          // Only ever a real delta read straight off the injected client's own stream — never a
          // synthesized/fake token event (this phase's own brief, Part 8).
          if (delta) {
            fullText += delta;
            yield { type: 'text_delta', delta };
          }
          if (chunk.done) finalChunk = chunk;
        }
      } catch (err) {
        yield { type: 'error', error: mapClientErrorToAiError(err) };
        return;
      }

      if (!finalChunk) {
        yield { type: 'error', error: { code: 'malformed_response', message: 'The local runtime\'s stream ended without a final chunk.' } };
        return;
      }

      yield { type: 'text_done', text: fullText };
      yield { type: 'response_completed', response: toAiResponse(finalChunk, fullText, providerId) };
    },
  };
}
