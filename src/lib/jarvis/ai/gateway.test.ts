import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFetchGatewayClient, type JarvisAiGatewayRequest } from './gateway';
import { textMessage } from './types';

const ENDPOINT = 'https://example.invalid/jarvis-ai';

function sseBody(events: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createFetchGatewayClient — no network dependency (fetch is always mocked)', () => {
  it('never sends a provider secret on the wire, even if one is forced onto the request object', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ status: 'ok', response: { text: 'hi', finishReason: 'stop' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const gatewayRequest = {
      sessionToken: 'user-session-token',
      request: { messages: [textMessage('user', 'hello')] },
      // Simulates an accidental/malicious extra field that must never reach the wire.
      apiKey: 'sk-should-never-be-sent',
    } as JarvisAiGatewayRequest;

    const client = createFetchGatewayClient(ENDPOINT);
    await client.complete(gatewayRequest);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(sentBody).toEqual({ sessionToken: 'user-session-token', request: { messages: [textMessage('user', 'hello')] } });
    expect(JSON.stringify(sentBody)).not.toContain('apiKey');
    expect(JSON.stringify(sentBody)).not.toContain('sk-should-never-be-sent');
  });

  it('never serializes request.signal onto the wire', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ status: 'ok', response: { text: 'hi', finishReason: 'stop' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const client = createFetchGatewayClient(ENDPOINT);
    await client.complete({ sessionToken: 't', request: { messages: [], signal: controller.signal } });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(sentBody.request).not.toHaveProperty('signal');
  });

  it('forwards the caller-supplied AbortSignal to fetch, for real cancellation', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ status: 'ok', response: { text: 'hi', finishReason: 'stop' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const client = createFetchGatewayClient(ENDPOINT);
    await client.complete({ sessionToken: 't', request: { messages: [] } }, controller.signal);

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('reports cancellation as a structured "cancelled" error, not a thrown exception', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchGatewayClient(ENDPOINT);
    const result = await client.complete({ sessionToken: 't', request: { messages: [] } });

    expect(result).toEqual({ status: 'error', error: { code: 'cancelled', message: 'The request was cancelled.' } });
  });

  it('classifies a non-ok HTTP status as provider_unavailable, never an unhandled rejection', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('Internal Server Error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchGatewayClient(ENDPOINT);
    const result = await client.complete({ sessionToken: 't', request: { messages: [] } });

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('provider_unavailable');
  });

  it('parses a streamed sequence of JarvisAiStreamEvent values from the SSE body', async () => {
    const events = [
      { type: 'response_started', providerId: 'stub' },
      { type: 'text_delta', delta: 'Checking' },
      { type: 'text_delta', delta: ' your revision state...' },
      { type: 'response_completed', response: { text: 'Checking your revision state...', finishReason: 'stop' } },
    ];
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(sseBody(events), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchGatewayClient(ENDPOINT);
    const received: unknown[] = [];
    for await (const event of client.stream({ sessionToken: 't', request: { messages: [] } })) {
      received.push(event);
    }

    expect(received).toEqual(events);
  });

  it('turns a malformed streamed event into a single malformed_response error, without throwing', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: { not valid json\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFetchGatewayClient(ENDPOINT);
    const received: unknown[] = [];
    for await (const event of client.stream({ sessionToken: 't', request: { messages: [] } })) {
      received.push(event);
    }

    expect(received).toEqual([{ type: 'error', error: { code: 'malformed_response', message: 'Could not parse a streamed event from the gateway.' } }]);
  });
});

describe('gateway module — no automatic tool execution', () => {
  it('exposes no function that executes a tool call on JARVIS\'s behalf', async () => {
    const gatewayModule = await import('./gateway');
    const exportNames = Object.keys(gatewayModule);
    for (const name of exportNames) {
      expect(name.toLowerCase()).not.toContain('execute');
      expect(name.toLowerCase()).not.toContain('runtool');
    }
  });
});
