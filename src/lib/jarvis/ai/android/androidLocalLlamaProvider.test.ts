import { describe, it, expect } from 'vitest';
import { createAndroidLocalLlamaProvider, getAndroidLocalLlamaHealth } from './androidLocalLlamaProvider';
import { JarvisAiProviderError } from '../provider';
import { createProviderRegistry } from '../providerRegistry';
import { NativeLlamaRuntimeError, type NativeLlamaRuntimeClient } from './nativeLlamaRuntimeContract';
import { textMessage } from '../types';
import type { JarvisAiStreamEvent } from '../types';

function fixtureRuntime(overrides: Partial<NativeLlamaRuntimeClient> = {}): NativeLlamaRuntimeClient {
  return {
    getStatus: async () => 'ready',
    getLoadedModel: async () => ({ modelId: 'stub-model', loadedAt: '2026-01-01T00:00:00Z' }),
    loadModel: async () => {},
    unloadModel: async () => {},
    complete: async () => ({ text: 'stub response', finishReason: 'stop' }),
    stream: async function* () {},
    ...overrides,
  };
}

describe('createAndroidLocalLlamaProvider — capabilities declared honestly', () => {
  it('declares streaming true (really implemented) and toolCalling false (the stub has no tool concept)', () => {
    const provider = createAndroidLocalLlamaProvider(fixtureRuntime(), { model: 'stub-model' });
    expect(provider.capabilities).toEqual({ streaming: true, toolCalling: false });
    expect(provider.id).toBe('android-local-llama');
  });
});

describe('createAndroidLocalLlamaProvider — provider registration (Step 9, item 1)', () => {
  it('registers successfully into the existing, unmodified provider registry', () => {
    const provider = createAndroidLocalLlamaProvider(fixtureRuntime(), { model: 'stub-model' });
    const registry = createProviderRegistry();
    const result = registry.register(provider);
    expect(result).toEqual({ status: 'ok' });
    expect(registry.get('android-local-llama')).toBe(provider);
  });
});

describe('createAndroidLocalLlamaProvider.complete — completion request mapping', () => {
  it('flattens messages into a prompt and maps the runtime result into a JarvisAiResponse', async () => {
    const runtime = fixtureRuntime({
      complete: async (request) => {
        expect(request.prompt).toBe('system: You are helpful.\nuser: Hello');
        return { text: 'Hi there', promptTokens: 4, generatedTokens: 2, finishReason: 'stop' };
      },
    });
    const provider = createAndroidLocalLlamaProvider(runtime, { model: 'stub-model' });

    const response = await provider.complete({ messages: [textMessage('system', 'You are helpful.'), textMessage('user', 'Hello')] });
    expect(response).toEqual({ text: 'Hi there', finishReason: 'stop', usage: { inputTokens: 4, outputTokens: 2 }, providerId: 'android-local-llama', model: 'stub-model' });
  });

  it('throws a JarvisAiProviderError carrying a structured error on runtime failure', async () => {
    const runtime = fixtureRuntime({ complete: async () => { throw new NativeLlamaRuntimeError('unavailable', 'bridge not ready'); } });
    const provider = createAndroidLocalLlamaProvider(runtime, { model: 'stub-model' });

    try {
      await provider.complete({ messages: [] });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(JarvisAiProviderError);
      expect((err as JarvisAiProviderError).jarvisError).toEqual({ code: 'provider_unavailable', message: 'The Android local runtime is not available.' });
    }
  });

  it('maps a cancelled runtime error to a cancelled JarvisAiError', async () => {
    const runtime = fixtureRuntime({ complete: async () => { throw new NativeLlamaRuntimeError('cancelled', 'cancelled'); } });
    const provider = createAndroidLocalLlamaProvider(runtime, { model: 'stub-model' });
    try {
      await provider.complete({ messages: [] });
      expect.unreachable();
    } catch (err) {
      expect((err as JarvisAiProviderError).jarvisError.code).toBe('cancelled');
    }
  });
});

describe('createAndroidLocalLlamaProvider.stream — streaming contract (Step 8)', () => {
  async function* chunksOf(events: JarvisAiStreamEvent[]): AsyncIterable<JarvisAiStreamEvent> {
    for (const e of events) yield e;
  }

  it('prepends response_started with providerId/model, and injects them into response_completed', async () => {
    const runtime = fixtureRuntime({
      stream: () =>
        chunksOf([
          { type: 'text_delta', delta: 'Hello' },
          { type: 'response_completed', response: { text: 'Hello', finishReason: 'stop' } },
        ]),
    });
    const provider = createAndroidLocalLlamaProvider(runtime, { model: 'stub-model' });

    const events: JarvisAiStreamEvent[] = [];
    for await (const event of provider.stream!({ messages: [textMessage('user', 'hi')] })) events.push(event);

    expect(events[0]).toEqual({ type: 'response_started', providerId: 'android-local-llama', model: 'stub-model' });
    expect(events[1]).toEqual({ type: 'text_delta', delta: 'Hello' });
    expect(events[2]).toEqual({ type: 'response_completed', response: { text: 'Hello', finishReason: 'stop', providerId: 'android-local-llama', model: 'stub-model' } });
  });

  it('yields a structured error event (never throws) when the runtime stream itself fails', async () => {
    const runtime = fixtureRuntime({
      stream: async function* () {
        throw new NativeLlamaRuntimeError('malformed_response', 'bad native payload');
      },
    });
    const provider = createAndroidLocalLlamaProvider(runtime, { model: 'stub-model' });

    const events: JarvisAiStreamEvent[] = [];
    for await (const event of provider.stream!({ messages: [] })) events.push(event);

    expect(events[0]).toEqual({ type: 'response_started', providerId: 'android-local-llama', model: 'stub-model' });
    expect(events[1]).toEqual({ type: 'error', error: { code: 'malformed_response', message: 'bad native payload' } });
    expect(events).toHaveLength(2);
  });

  it('passes a cancellation-originated error event straight through (Step 8\'s "started -> cancelled" lifecycle)', async () => {
    const runtime = fixtureRuntime({ stream: () => chunksOf([{ type: 'error', error: { code: 'cancelled', message: 'The request was cancelled.' } }]) });
    const provider = createAndroidLocalLlamaProvider(runtime, { model: 'stub-model' });

    const events: JarvisAiStreamEvent[] = [];
    for await (const event of provider.stream!({ messages: [] })) events.push(event);

    expect(events).toEqual([
      { type: 'response_started', providerId: 'android-local-llama', model: 'stub-model' },
      { type: 'error', error: { code: 'cancelled', message: 'The request was cancelled.' } },
    ]);
  });
});

describe('getAndroidLocalLlamaHealth — Step 7: never claims "ready" from status alone', () => {
  it('reports model_ready only when BOTH status is ready AND a model is actually loaded', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => ({ modelId: 'm', loadedAt: 't' }) });
    expect(await getAndroidLocalLlamaHealth(runtime)).toBe('model_ready');
  });

  it('reports error (never model_ready) when status is "ready" but no model is actually loaded', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => null });
    expect(await getAndroidLocalLlamaHealth(runtime)).toBe('error');
  });

  it('reports unavailable when the bridge itself is unavailable', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'unavailable', getLoadedModel: async () => null });
    expect(await getAndroidLocalLlamaHealth(runtime)).toBe('unavailable');
  });

  it('reports available (not ready) while a model is loading', async () => {
    const runtime = fixtureRuntime({ getStatus: async () => 'loading', getLoadedModel: async () => null });
    expect(await getAndroidLocalLlamaHealth(runtime)).toBe('available');
  });
});
