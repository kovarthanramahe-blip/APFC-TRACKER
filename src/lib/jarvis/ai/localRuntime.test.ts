import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFetchOllamaHttpClient, OllamaClientError, OLLAMA_DEFAULT_BASE_URL } from './localRuntime';

const BASE_URL = 'http://127.0.0.1:11434';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function ndjsonBody(chunks: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = chunks.map((c) => `${JSON.stringify(c)}\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe('OLLAMA_DEFAULT_BASE_URL — documented convenience, never used automatically', () => {
  it('is a plain localhost URL string, never reached for on its own by this module', () => {
    expect(OLLAMA_DEFAULT_BASE_URL).toBe('http://localhost:11434');
  });
});

describe('createFetchOllamaHttpClient.listModels', () => {
  it('fetches GET /api/tags and returns the parsed models array', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest', model: 'llama3.2:latest', modified_at: '2025-01-01', size: 123, digest: 'abc' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    const result = await client.listModels();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/tags`, expect.objectContaining({ method: 'GET' }));
    expect(result.models).toHaveLength(1);
    expect(result.models[0].model).toBe('llama3.2:latest');
  });

  it('classifies a network failure (fetch rejects) as a network_error OllamaClientError', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    await expect(client.listModels()).rejects.toMatchObject({ kind: 'network_error' });
    await expect(client.listModels()).rejects.toBeInstanceOf(OllamaClientError);
  });

  it('classifies a non-2xx HTTP status as an http_error, with status + best-effort message', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: 'model not found' }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    try {
      await client.listModels();
      expect.unreachable('expected listModels to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(OllamaClientError);
      expect((err as OllamaClientError).kind).toBe('http_error');
      expect((err as OllamaClientError).httpStatus).toBe(404);
      expect((err as OllamaClientError).message).toBe('model not found');
    }
  });

  it('falls back to a plain HTTP-status message when the error body has no usable "error"/"message" field', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    await expect(client.listModels()).rejects.toMatchObject({ kind: 'http_error', httpStatus: 500 });
  });

  it('classifies a non-JSON 2xx body as malformed_response, never throwing an unhandled JSON.parse error', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('not json at all', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    await expect(client.listModels()).rejects.toMatchObject({ kind: 'malformed_response' });
  });

  it('classifies caller-signal cancellation as a cancelled OllamaClientError', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    const pending = client.listModels(controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('classifies a timeout as a timeout OllamaClientError, distinct from cancellation', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL, timeoutMs: 50 });
    const pending = client.listModels();
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });
});

describe('createFetchOllamaHttpClient.showModel', () => {
  it('POSTs /api/show with the model name and returns the parsed body', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ capabilities: ['completion'], model_info: { 'llama.context_length': 8192 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    const result = await client.showModel('llama3.2:latest');

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/show`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ model: 'llama3.2:latest' }) }));
    expect(result.capabilities).toEqual(['completion']);
  });
});

describe('createFetchOllamaHttpClient.chat (non-streaming)', () => {
  it('POSTs /api/chat with stream:false and returns the single parsed response', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ model: 'llama3.2', created_at: 't', message: { role: 'assistant', content: 'hi' }, done: true, done_reason: 'stop' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    const result = await client.chat({ model: 'llama3.2', messages: [{ role: 'user', content: 'hello' }] });

    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.stream).toBe(false);
    expect(result.message.content).toBe('hi');
  });
});

describe('createFetchOllamaHttpClient.chatStream', () => {
  it('yields one real chunk per newline-delimited JSON line, in order', async () => {
    const chunks = [
      { model: 'llama3.2', created_at: 't1', message: { role: 'assistant', content: 'Merch' }, done: false },
      { model: 'llama3.2', created_at: 't2', message: { role: 'assistant', content: 'ant' }, done: false },
      { model: 'llama3.2', created_at: 't3', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', eval_count: 2, prompt_eval_count: 5 },
    ];
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(ndjsonBody(chunks), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    const received: unknown[] = [];
    for await (const chunk of client.chatStream({ model: 'llama3.2', messages: [{ role: 'user', content: 'hi' }] })) {
      received.push(chunk);
    }

    expect(received).toEqual(chunks);
    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.stream).toBe(true);
  });

  it('never emits a synthesized chunk — a malformed line throws rather than being skipped or faked', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{ not valid json\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    const iterate = async () => {
      for await (const _chunk of client.chatStream({ model: 'llama3.2', messages: [] })) {
        // draining
      }
    };

    await expect(iterate()).rejects.toMatchObject({ kind: 'malformed_response' });
  });

  it('throws http_error when the streaming endpoint itself returns a non-2xx status', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: 'model is loading' }), { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchOllamaHttpClient({ baseUrl: BASE_URL });
    const iterate = async () => {
      for await (const _chunk of client.chatStream({ model: 'llama3.2', messages: [] })) {
        // draining
      }
    };

    await expect(iterate()).rejects.toMatchObject({ kind: 'http_error', httpStatus: 503 });
  });
});
