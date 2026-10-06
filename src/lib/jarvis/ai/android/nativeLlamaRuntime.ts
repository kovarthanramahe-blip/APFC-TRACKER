// JARVIS Phase 10 — the real NativeLlamaRuntimeClient implementation, wrapping the Capacitor
// plugin proxy (localLlamaCapacitorPlugin.ts). This is the ONLY file that bridges the plugin's
// callback/event style into the typed, async-iterable NativeLlamaRuntimeClient contract
// (nativeLlamaRuntimeContract.ts) — androidLocalLlamaProvider.ts depends on that contract only,
// never on this file's own internals or on @capacitor/core.
//
// `createNativeLlamaRuntime` takes the plugin as a parameter (never imports the module-level
// `LocalLlamaRuntime` singleton itself) — exactly the same "inject the client" discipline every
// other JARVIS registry/client in this codebase already follows, so this stays testable with a
// deterministic fixture plugin and never needs a real Capacitor bridge to run its own tests.
import type { LocalLlamaRuntimePlugin, LocalLlamaStreamWireEvent } from './localLlamaCapacitorPlugin';
import { NativeLlamaRuntimeError, type NativeLlamaCompletionRequest, type NativeLlamaCompletionResult, type NativeLlamaRuntimeClient } from './nativeLlamaRuntimeContract';
import type { JarvisAiErrorCode, JarvisAiStreamEvent } from '../types';

function toRuntimeError(err: unknown): NativeLlamaRuntimeError {
  if (err instanceof NativeLlamaRuntimeError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') return new NativeLlamaRuntimeError('cancelled', 'The request was cancelled.');
  return new NativeLlamaRuntimeError('unknown', err instanceof Error ? err.message : 'Unknown native runtime error.');
}

let requestCounter = 0;
/** A plain incrementing counter, not crypto.randomUUID() — this stub only ever has one in-flight
 * stream at a time, and a counter keeps this file dependency-free and trivially deterministic to
 * test (no need to mock a UUID source). Revisit once real concurrent streams are supported. */
function generateRequestId(): string {
  requestCounter += 1;
  return `req-${requestCounter}`;
}

/** A minimal single-consumer push->pull bridge from the plugin's callback-style events into an
 * async generator — no external dependency, no backpressure limit (this stub emits at most a
 * handful of events per request, so an unbounded buffer is a non-issue in practice). */
function createPushChannel<T>() {
  const queue: T[] = [];
  let resolveNext: (() => void) | null = null;
  let ended = false;

  function push(value: T): void {
    queue.push(value);
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve();
    }
  }

  function end(): void {
    ended = true;
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve();
    }
  }

  async function* iterate(): AsyncGenerator<T> {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (ended) return;
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
    }
  }

  return { push, end, iterate };
}

/**
 * Translates one wire event (the JSON-serializable subset defined in localLlamaCapacitorPlugin.ts)
 * into the existing JarvisAiStreamEvent union — never a 'response_started' case here (this layer
 * has no concept of provider identity; androidLocalLlamaProvider.ts is what prepends that and
 * fills in providerId/model on the final completed event — see this file's own header).
 */
function toStreamEvent(event: LocalLlamaStreamWireEvent): JarvisAiStreamEvent {
  switch (event.type) {
    case 'text_delta':
      return { type: 'text_delta', delta: event.delta };
    case 'text_done':
      return { type: 'text_done', text: event.text };
    case 'completed':
      return {
        type: 'response_completed',
        response: { text: '', finishReason: event.finishReason, usage: { inputTokens: event.promptTokens, outputTokens: event.generatedTokens } },
      };
    case 'error':
      return { type: 'error', error: { code: event.code as JarvisAiErrorCode, message: event.message } };
  }
}

export function createNativeLlamaRuntime(plugin: LocalLlamaRuntimePlugin): NativeLlamaRuntimeClient {
  return {
    async getStatus() {
      const { status } = await plugin.getRuntimeStatus();
      return status;
    },

    async getLoadedModel() {
      const { model } = await plugin.getLoadedModel();
      return model;
    },

    async loadModel(modelId) {
      try {
        await plugin.loadModel({ modelId });
      } catch (err) {
        throw toRuntimeError(err);
      }
    },

    async unloadModel() {
      try {
        await plugin.unloadModel();
      } catch (err) {
        throw toRuntimeError(err);
      }
    },

    async complete(request: NativeLlamaCompletionRequest, signal?: AbortSignal): Promise<NativeLlamaCompletionResult> {
      if (signal?.aborted) throw new NativeLlamaRuntimeError('cancelled', 'The request was cancelled before it started.');
      try {
        return await plugin.complete({ prompt: request.prompt, maxOutputTokens: request.maxOutputTokens, temperature: request.temperature });
      } catch (err) {
        throw toRuntimeError(err);
      }
    },

    async *stream(request: NativeLlamaCompletionRequest, signal?: AbortSignal): AsyncIterable<JarvisAiStreamEvent> {
      if (signal?.aborted) {
        yield { type: 'error', error: { code: 'cancelled', message: 'The request was cancelled before it started.' } };
        return;
      }

      const requestId = generateRequestId();
      const channel = createPushChannel<JarvisAiStreamEvent>();
      let fullText = '';

      const handle = await plugin.addListener('localLlamaStreamEvent', (event) => {
        if (event.requestId !== requestId) return;
        if (event.type === 'text_delta') fullText += event.delta;
        channel.push(toStreamEvent(event));
        if (event.type === 'completed' || event.type === 'error') channel.end();
      });

      const onAbort = () => {
        plugin.cancel({ requestId }).catch(() => {
          // The cancel call itself failing is reported through the normal stream-error path
          // (the native side is expected to emit its own 'error'/'completed' event regardless);
          // never let a rejected cancel() call surface as an unhandled rejection here.
        });
      };
      signal?.addEventListener('abort', onAbort);

      try {
        await plugin.completeStreaming({ requestId, prompt: request.prompt, maxOutputTokens: request.maxOutputTokens, temperature: request.temperature });
      } catch (err) {
        signal?.removeEventListener('abort', onAbort);
        await handle.remove();
        yield { type: 'error', error: toRuntimeError(err).kind === 'cancelled' ? { code: 'cancelled', message: 'The request was cancelled.' } : { code: 'unknown_error', message: toRuntimeError(err).message } };
        return;
      }

      try {
        for await (const event of channel.iterate()) {
          // The response_completed event is built with fullText accumulated HERE (the runtime
          // layer, which is the only place that has seen every text_delta) — never recomputed or
          // guessed by the provider layer above this one.
          if (event.type === 'response_completed') {
            yield { type: 'response_completed', response: { ...event.response, text: fullText } };
          } else {
            yield event;
          }
        }
      } finally {
        signal?.removeEventListener('abort', onAbort);
        await handle.remove();
      }
    },
  };
}
