import { describe, it, expect } from 'vitest';
import { createLocalLlmLifecycleTracker } from './localLlmLifecycle';
import type { NativeLlamaRuntimeClient, JarvisAndroidLoadedModel } from './nativeLlamaRuntimeContract';

// JARVIS Phase 13A — lifecycle tracker tests. Every one of the task's own seven named states is
// exercised at least once. `fixtureRuntime` is a deterministic, in-memory NativeLlamaRuntimeClient
// — never a real Capacitor bridge — matching this repo's own established fixture-injection
// convention (nativeLlamaRuntime.test.ts, androidLocalLlamaProvider.test.ts).

function fixtureRuntime(overrides: Partial<NativeLlamaRuntimeClient> = {}): NativeLlamaRuntimeClient {
  return {
    getStatus: async () => 'available',
    getLoadedModel: async () => null,
    loadModel: async () => {},
    unloadModel: async () => {},
    complete: async () => ({ text: 'stub', finishReason: 'stop' }),
    stream: async function* () {},
    ...overrides,
  };
}

const LOADED_MODEL: JarvisAndroidLoadedModel = { modelId: 'stub-model', loadedAt: '2026-01-01T00:00:00Z' };

describe('createLocalLlmLifecycleTracker — the seven named lifecycle states', () => {
  it('1. provider_unavailable — when the platform/plugin itself is not available, regardless of what the runtime would report', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => LOADED_MODEL });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: false });

    expect(await tracker.getLifecycleState()).toBe('provider_unavailable');
  });

  it('1b. provider_unavailable — also when the runtime itself reports status "unavailable"', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'unavailable' });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    expect(await tracker.getLifecycleState()).toBe('provider_unavailable');
  });

  it('2. model_unavailable — bridge reachable ("available" status) but no model is loaded', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'available', getLoadedModel: async () => null });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    expect(await tracker.getLifecycleState()).toBe('model_unavailable');
  });

  it('2b. model_unavailable — a "ready" status with no loaded model attached is never upgraded to model_ready (mirrors toAndroidProviderHealthStatus\'s own rule)', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => null });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    expect(await tracker.getLifecycleState()).toBe('model_unavailable');
  });

  it('2c. model_unavailable — an "error" status with no prior inference attempt (never reported as inference_failed when nothing was actually attempted)', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'error', getLoadedModel: async () => null });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    expect(await tracker.getLifecycleState()).toBe('model_unavailable');
  });

  it('3. model_loading — while a model load is in progress', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'loading' });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    expect(await tracker.getLifecycleState()).toBe('model_loading');
  });

  it('4. model_ready — a real model is loaded and idle, no inference yet attempted', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => LOADED_MODEL });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    expect(await tracker.getLifecycleState()).toBe('model_ready');
  });

  it('5. inference_running — observable WHILE a complete() call is still in flight', async () => {
    let resolveCompletion!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    const runtime = fixtureRuntime({
      getStatus: async () => 'ready',
      getLoadedModel: async () => LOADED_MODEL,
      complete: async () => {
        await pending;
        return { text: 'done', finishReason: 'stop' };
      },
    });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    const inFlight = tracker.complete({ prompt: 'hello' });
    expect(await tracker.getLifecycleState()).toBe('inference_running');

    resolveCompletion();
    await inFlight;
  });

  it('6. inference_completed — reported immediately after a successful complete() call, while the model is still ready', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => LOADED_MODEL, complete: async () => ({ text: 'ok', finishReason: 'stop' }) });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    const result = await tracker.complete({ prompt: 'hello' });
    expect(result.text).toBe('ok'); // the real result passes through unchanged
    expect(await tracker.getLifecycleState()).toBe('inference_completed');
  });

  it('7. inference_failed — reported immediately after a complete() call throws, the error itself still propagates unchanged', async () => {
    const runtime = fixtureRuntime({
      getStatus: async () => 'ready',
      getLoadedModel: async () => LOADED_MODEL,
      complete: async () => {
        throw new Error('native crash');
      },
    });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    await expect(tracker.complete({ prompt: 'hello' })).rejects.toThrow('native crash');
    expect(await tracker.getLifecycleState()).toBe('inference_failed');
  });

  it('7b. inference_failed — an "error" status AFTER a failed inference attempt is reported as inference_failed, not a bare model_unavailable', async () => {
    let shouldError = false;
    const runtime = fixtureRuntime({
      getStatus: async () => (shouldError ? 'error' : 'ready'),
      getLoadedModel: async () => (shouldError ? null : LOADED_MODEL),
      complete: async () => {
        shouldError = true;
        throw new Error('native crash');
      },
    });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    await expect(tracker.complete({ prompt: 'hello' })).rejects.toThrow();
    expect(await tracker.getLifecycleState()).toBe('inference_failed');
  });

  it('deterministic fallback: the SAME fixed sequence of states is reported for the SAME sequence of inputs, every run', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => LOADED_MODEL, complete: async () => ({ text: 'ok', finishReason: 'stop' }) });

    async function runSequence(): Promise<string[]> {
      const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });
      const states = [await tracker.getLifecycleState()];
      await tracker.complete({ prompt: 'x' });
      states.push(await tracker.getLifecycleState());
      return states;
    }

    expect(await runSequence()).toEqual(await runSequence());
    expect(await runSequence()).toEqual(['model_ready', 'inference_completed']);
  });

  it('never fabricates a state ahead of an actual call — a freshly created tracker reports model_ready, never inference_running/completed/failed, before complete() is ever invoked', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => LOADED_MODEL });
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: true });

    expect(await tracker.getLifecycleState()).toBe('model_ready');
  });
});
