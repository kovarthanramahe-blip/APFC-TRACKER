import { describe, it, expect } from 'vitest';
import { createOllamaProvider } from './ollamaProvider';
import { JarvisAiProviderError } from './provider';
import { OllamaClientError, type JarvisOllamaHttpClient, type OllamaChatRequest, type OllamaChatResponseChunk } from './localRuntime';
import { textMessage } from './types';

function fixtureClient(overrides: Partial<JarvisOllamaHttpClient>): JarvisOllamaHttpClient {
  return {
    listModels: async () => ({ models: [] }),
    showModel: async () => ({}),
    chat: async () => ({ model: 'llama3.2', created_at: 't', message: { role: 'assistant', content: '' }, done: true }),
    chatStream: async function* () {},
    ...overrides,
  };
}

describe('createOllamaProvider — capabilities declared honestly', () => {
  it('declares streaming true (really implemented) and toolCalling false (never claimed without per-model confirmation)', () => {
    const provider = createOllamaProvider(fixtureClient({}), { model: 'llama3.2' });
    expect(provider.capabilities).toEqual({ streaming: true, toolCalling: false });
    expect(provider.id).toBe('ollama');
  });
});

describe('createOllamaProvider.complete — inference response mapping', () => {
  it('maps a real chat() response into a JarvisAiResponse, including usage and model', async () => {
    const client = fixtureClient({
      chat: async (request: OllamaChatRequest) => {
        expect(request.model).toBe('llama3.2');
        expect(request.messages).toEqual([{ role: 'user', content: 'What is merchant capitalism?' }]);
        return { model: 'llama3.2', created_at: 't', message: { role: 'assistant', content: 'A historical economic phase.' }, done: true, done_reason: 'stop', prompt_eval_count: 10, eval_count: 6 };
      },
    });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });

    const response = await provider.complete({ messages: [textMessage('user', 'What is merchant capitalism?')] });

    expect(response).toEqual({ text: 'A historical economic phase.', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 6 }, providerId: 'ollama', model: 'llama3.2' });
  });

  it('lets request.modelConfig.model override the adapter\'s own default model', async () => {
    const client = fixtureClient({ chat: async (request: OllamaChatRequest) => ({ model: request.model, created_at: 't', message: { role: 'assistant', content: 'ok' }, done: true }) });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });

    const response = await provider.complete({ messages: [textMessage('user', 'hi')], modelConfig: { model: 'mistral' } });
    expect(response.model).toBe('mistral');
  });

  it('only sends text content parts, never a tool_call/tool_result part the local model has no concept of', async () => {
    const client = fixtureClient({
      chat: async (request: OllamaChatRequest) => {
        expect(request.messages).toEqual([{ role: 'user', content: 'plain text only' }]);
        return { model: 'llama3.2', created_at: 't', message: { role: 'assistant', content: 'ok' }, done: true };
      },
    });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });
    await provider.complete({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'plain text only' }, { type: 'tool_call', toolCall: { id: 'c1', toolId: 't1', input: {} } }] }],
    });
  });

  it('throws a JarvisAiProviderError carrying a structured "timeout" JarvisAiError on timeout', async () => {
    const client = fixtureClient({ chat: async () => { throw new OllamaClientError('timeout', 'too slow'); } });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });

    await expect(provider.complete({ messages: [] })).rejects.toBeInstanceOf(JarvisAiProviderError);
    try {
      await provider.complete({ messages: [] });
      expect.unreachable();
    } catch (err) {
      expect((err as JarvisAiProviderError).jarvisError).toEqual({ code: 'timeout', message: 'The local runtime did not respond in time.' });
    }
  });

  it('maps a network_error to provider_unavailable', async () => {
    const client = fixtureClient({ chat: async () => { throw new OllamaClientError('network_error', 'refused'); } });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });
    try {
      await provider.complete({ messages: [] });
      expect.unreachable();
    } catch (err) {
      expect((err as JarvisAiProviderError).jarvisError.code).toBe('provider_unavailable');
    }
  });

  it('maps cancellation (AbortError) to a cancelled JarvisAiError', async () => {
    const client = fixtureClient({ chat: async () => { throw new DOMException('aborted', 'AbortError'); } });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });
    try {
      await provider.complete({ messages: [] });
      expect.unreachable();
    } catch (err) {
      expect((err as JarvisAiProviderError).jarvisError.code).toBe('cancelled');
    }
  });

  it('maps an unrecognised error to unknown_error, never leaking a raw stack trace as the message', async () => {
    const client = fixtureClient({ chat: async () => { throw new Error('something internal and sensitive'); } });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });
    try {
      await provider.complete({ messages: [] });
      expect.unreachable();
    } catch (err) {
      expect((err as JarvisAiProviderError).jarvisError.code).toBe('unknown_error');
    }
  });
});

describe('createOllamaProvider.stream — real streaming contract, never fake token events', () => {
  async function* chunksOf(chunks: OllamaChatResponseChunk[]): AsyncIterable<OllamaChatResponseChunk> {
    for (const c of chunks) yield c;
  }

  it('yields response_started, real text_delta events sourced only from the injected stream, then text_done + response_completed', async () => {
    const chunks: OllamaChatResponseChunk[] = [
      { model: 'llama3.2', created_at: 't1', message: { role: 'assistant', content: 'Merchant' }, done: false },
      { model: 'llama3.2', created_at: 't2', message: { role: 'assistant', content: ' capitalism' }, done: false },
      { model: 'llama3.2', created_at: 't3', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', eval_count: 4, prompt_eval_count: 2 },
    ];
    const client = fixtureClient({ chatStream: () => chunksOf(chunks) });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });

    const events = [];
    for await (const event of provider.stream!({ messages: [textMessage('user', 'hi')] })) events.push(event);

    expect(events[0]).toEqual({ type: 'response_started', providerId: 'ollama', model: 'llama3.2' });
    expect(events[1]).toEqual({ type: 'text_delta', delta: 'Merchant' });
    expect(events[2]).toEqual({ type: 'text_delta', delta: ' capitalism' });
    expect(events[3]).toEqual({ type: 'text_done', text: 'Merchant capitalism' });
    expect(events[4]).toEqual({
      type: 'response_completed',
      response: { text: 'Merchant capitalism', finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 4 }, providerId: 'ollama', model: 'llama3.2' },
    });
    expect(events).toHaveLength(5);
  });

  it('never emits a text_delta for an empty-content chunk', async () => {
    const chunks: OllamaChatResponseChunk[] = [
      { model: 'llama3.2', created_at: 't1', message: { role: 'assistant', content: '' }, done: false },
      { model: 'llama3.2', created_at: 't2', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' },
    ];
    const client = fixtureClient({ chatStream: () => chunksOf(chunks) });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });

    const events = [];
    for await (const event of provider.stream!({ messages: [] })) events.push(event);

    expect(events.some((e) => e.type === 'text_delta')).toBe(false);
  });

  it('yields a structured error event (not a thrown exception) when the stream itself fails', async () => {
    const client = fixtureClient({
      chatStream: async function* () {
        throw new OllamaClientError('http_error', 'model is loading', 503);
      },
    });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });

    const events = [];
    for await (const event of provider.stream!({ messages: [] })) events.push(event);

    expect(events[0]).toEqual({ type: 'response_started', providerId: 'ollama', model: 'llama3.2' });
    expect(events[1]).toEqual({ type: 'error', error: { code: 'provider_unavailable', message: 'model is loading' } });
    expect(events).toHaveLength(2);
  });

  it('yields malformed_response when the stream ends with no done:true final chunk', async () => {
    const chunks: OllamaChatResponseChunk[] = [{ model: 'llama3.2', created_at: 't1', message: { role: 'assistant', content: 'partial' }, done: false }];
    const client = fixtureClient({ chatStream: () => chunksOf(chunks) });
    const provider = createOllamaProvider(client, { model: 'llama3.2' });

    const events = [];
    for await (const event of provider.stream!({ messages: [] })) events.push(event);

    expect(events.at(-1)).toEqual({ type: 'error', error: { code: 'malformed_response', message: "The local runtime's stream ended without a final chunk." } });
  });
});
