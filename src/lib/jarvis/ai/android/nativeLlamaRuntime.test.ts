import { describe, it, expect, vi } from 'vitest';
import { createNativeLlamaRuntime } from './nativeLlamaRuntime';
import type { LocalLlamaRuntimePlugin, LocalLlamaStreamWireEvent } from './localLlamaCapacitorPlugin';
import { NativeLlamaRuntimeError } from './nativeLlamaRuntimeContract';

// Deterministic fixture plugin — no real Capacitor bridge, no network call, no native code
// anywhere in this test file. This is exactly the "deterministic fixture" discipline every
// earlier JARVIS phase's own client tests already follow (ai/localRuntime.ts's OllamaClientError
// tests, ai/localRuntimeHealth.ts's probe tests).
function fixturePlugin(overrides: Partial<LocalLlamaRuntimePlugin> = {}): LocalLlamaRuntimePlugin {
  const listeners = new Set<(event: LocalLlamaStreamWireEvent) => void>();
  return {
    getRuntimeStatus: async () => ({ status: 'ready' }),
    getLoadedModel: async () => ({ model: { modelId: 'stub-model', loadedAt: '2026-01-01T00:00:00Z' } }),
    loadModel: async () => {},
    unloadModel: async () => {},
    complete: async () => ({ text: 'stub response', finishReason: 'stop' }),
    completeStreaming: async () => {},
    cancel: async () => {},
    addListener: async (_eventName, listenerFunc) => {
      listeners.add(listenerFunc);
      return { remove: async () => { listeners.delete(listenerFunc); } };
    },
    ...overrides,
  };
}

/** Builds a plugin whose completeStreaming() synchronously emits the given wire events (via the
 * one registered listener) right after being called — simulating the native stub's own
 * "token 1, token 2, token 3, completed" lifecycle described in this phase's own brief. */
function streamingFixturePlugin(events: LocalLlamaStreamWireEvent[]): LocalLlamaRuntimePlugin {
  let emit: ((event: LocalLlamaStreamWireEvent) => void) | null = null;
  return fixturePlugin({
    addListener: async (_eventName, listenerFunc) => {
      emit = listenerFunc;
      return { remove: async () => { emit = null; } };
    },
    completeStreaming: async (options) => {
      // Echoes the REAL generated requestId back (the runtime's own request counter increments
      // across every test in this file, so a fixture-hardcoded id would only ever match the
      // first stream() call made in the whole suite) — a real native stub would do the same.
      queueMicrotask(() => {
        for (const event of events) emit?.({ ...event, requestId: options.requestId });
      });
    },
  });
}

describe('createNativeLlamaRuntime — model lifecycle contract', () => {
  it('getStatus/getLoadedModel/loadModel/unloadModel round-trip against the fixture plugin', async () => {
    const plugin = fixturePlugin();
    const runtime = createNativeLlamaRuntime(plugin);

    expect(await runtime.getStatus()).toBe('ready');
    expect(await runtime.getLoadedModel()).toEqual({ modelId: 'stub-model', loadedAt: '2026-01-01T00:00:00Z' });
    await expect(runtime.loadModel('stub-model')).resolves.toBeUndefined();
    await expect(runtime.unloadModel()).resolves.toBeUndefined();
  });

  it('getLoadedModel returns null when the plugin reports no model loaded', async () => {
    const plugin = fixturePlugin({ getLoadedModel: async () => ({ model: null }) });
    const runtime = createNativeLlamaRuntime(plugin);
    expect(await runtime.getLoadedModel()).toBeNull();
  });

  it('wraps a loadModel rejection into a structured NativeLlamaRuntimeError', async () => {
    const plugin = fixturePlugin({ loadModel: async () => { throw new Error('model file not found'); } });
    const runtime = createNativeLlamaRuntime(plugin);
    await expect(runtime.loadModel('missing')).rejects.toBeInstanceOf(NativeLlamaRuntimeError);
  });
});

describe('createNativeLlamaRuntime.complete — completion request mapping', () => {
  it('maps a real plugin.complete() result through unchanged', async () => {
    const plugin = fixturePlugin({ complete: async (options) => ({ text: `echo:${options.prompt}`, promptTokens: 3, generatedTokens: 5, finishReason: 'stop' }) });
    const runtime = createNativeLlamaRuntime(plugin);

    const result = await runtime.complete({ prompt: 'hello' });
    expect(result).toEqual({ text: 'echo:hello', promptTokens: 3, generatedTokens: 5, finishReason: 'stop' });
  });

  it('throws cancelled immediately when the signal is already aborted, never calling the plugin', async () => {
    const completeSpy = vi.fn(async () => ({ text: 'should not be called', finishReason: 'stop' as const }));
    const plugin = fixturePlugin({ complete: completeSpy });
    const runtime = createNativeLlamaRuntime(plugin);

    const controller = new AbortController();
    controller.abort();
    await expect(runtime.complete({ prompt: 'hi' }, controller.signal)).rejects.toMatchObject({ kind: 'cancelled' });
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('maps a rejected plugin.complete() call to a structured error', async () => {
    const plugin = fixturePlugin({ complete: async () => { throw new Error('native crash'); } });
    const runtime = createNativeLlamaRuntime(plugin);
    await expect(runtime.complete({ prompt: 'hi' })).rejects.toMatchObject({ kind: 'unknown' });
  });
});

describe('createNativeLlamaRuntime.stream — streaming event mapping (Step 8 lifecycle)', () => {
  it('reassembles text_delta* -> text_done -> response_completed, accumulating fullText itself', async () => {
    const events: LocalLlamaStreamWireEvent[] = [
      { requestId: 'req-1', type: 'text_delta', delta: 'token1 ' },
      { requestId: 'req-1', type: 'text_delta', delta: 'token2 ' },
      { requestId: 'req-1', type: 'text_done', text: 'token1 token2' },
      { requestId: 'req-1', type: 'completed', promptTokens: 2, generatedTokens: 2, finishReason: 'stop' },
    ];
    const plugin = streamingFixturePlugin(events);
    const runtime = createNativeLlamaRuntime(plugin);

    const received: unknown[] = [];
    for await (const event of runtime.stream({ prompt: 'hi' })) received.push(event);

    expect(received[0]).toEqual({ type: 'text_delta', delta: 'token1 ' });
    expect(received[1]).toEqual({ type: 'text_delta', delta: 'token2 ' });
    expect(received[2]).toEqual({ type: 'text_done', text: 'token1 token2' });
    expect(received[3]).toEqual({ type: 'response_completed', response: { text: 'token1 token2 ', finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 2 } } });
    expect(received).toHaveLength(4);
  });

  it('yields a single error event, never throws, when the native side reports an error mid-stream', async () => {
    const events: LocalLlamaStreamWireEvent[] = [{ requestId: 'req-1', type: 'error', code: 'unknown_error', message: 'native stub failure' }];
    const plugin = streamingFixturePlugin(events);
    const runtime = createNativeLlamaRuntime(plugin);

    const received: unknown[] = [];
    for await (const event of runtime.stream({ prompt: 'hi' })) received.push(event);

    expect(received).toEqual([{ type: 'error', error: { code: 'unknown_error', message: 'native stub failure' } }]);
  });

  it('yields cancelled immediately when the signal is already aborted, never calling completeStreaming', async () => {
    const completeStreamingSpy = vi.fn(async () => {});
    const plugin = fixturePlugin({ completeStreaming: completeStreamingSpy });
    const runtime = createNativeLlamaRuntime(plugin);

    const controller = new AbortController();
    controller.abort();
    const received: unknown[] = [];
    for await (const event of runtime.stream({ prompt: 'hi' }, controller.signal)) received.push(event);

    expect(received).toEqual([{ type: 'error', error: { code: 'cancelled', message: 'The request was cancelled before it started.' } }]);
    expect(completeStreamingSpy).not.toHaveBeenCalled();
  });

  it('cancellation mid-stream calls plugin.cancel() with the same requestId and never crashes', async () => {
    let capturedRequestId: string | undefined;
    const cancelSpy = vi.fn(async (options: { requestId: string }) => {
      capturedRequestId = options.requestId;
    });
    const emitRef: { current: ((event: LocalLlamaStreamWireEvent) => void) | null } = { current: null };
    const plugin = fixturePlugin({
      addListener: async (_eventName, listenerFunc) => {
        emitRef.current = listenerFunc;
        return { remove: async () => { emitRef.current = null; } };
      },
      completeStreaming: async (options) => {
        capturedRequestId = options.requestId;
      },
      cancel: cancelSpy,
    });
    const runtime = createNativeLlamaRuntime(plugin);
    const controller = new AbortController();

    const received: unknown[] = [];
    const iterationDone = (async () => {
      for await (const event of runtime.stream({ prompt: 'hi' }, controller.signal)) received.push(event);
    })();

    await vi.waitFor(() => expect(capturedRequestId).toBeDefined());
    controller.abort();
    // Native cancellation is cooperative — the stub still emits its own terminal event.
    emitRef.current?.({ requestId: capturedRequestId!, type: 'error', code: 'cancelled', message: 'cancelled by native stub' });
    await iterationDone;

    expect(cancelSpy).toHaveBeenCalledWith({ requestId: capturedRequestId });
    expect(received).toEqual([{ type: 'error', error: { code: 'cancelled', message: 'cancelled by native stub' } }]);
  });
});
