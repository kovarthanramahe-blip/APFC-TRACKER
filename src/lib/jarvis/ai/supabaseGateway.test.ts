import { describe, it, expect, vi } from 'vitest';
import { createSupabaseGatewayClient, type MinimalSupabaseFunctionsClient } from './supabaseGateway';
import { textMessage } from './types';
import type { JarvisAiGatewayRequest } from './gateway';

type InvokeFn = MinimalSupabaseFunctionsClient['functions']['invoke'];

function stubFunctionsClient(invoke: InvokeFn): MinimalSupabaseFunctionsClient {
  return { functions: { invoke } };
}

/** `vi.fn<InvokeFn>(...)` with an explicit generic matching the real `invoke` signature — so
 * `.mock.calls[n]` is typed as the real `[name, options]` tuple instead of inferring an empty
 * `[]` from an untyped callback, while staying a real Mock (so `.mock.calls`/`toHaveBeenCalled*`
 * all still work). */
function mockInvoke(impl: InvokeFn) {
  return vi.fn<InvokeFn>(impl);
}

describe('createSupabaseGatewayClient — complete()', () => {
  it('sends the request through supabase-js functions.invoke, never a raw fetch', async () => {
    const invoke = mockInvoke(async () => ({ data: { status: 'ok', message: 'JARVIS gateway is ready. No AI provider was contacted.' }, error: null }));
    const client = createSupabaseGatewayClient(stubFunctionsClient(invoke));

    const gatewayRequest: JarvisAiGatewayRequest = { sessionToken: 'ignored-by-design', request: { messages: [textMessage('user', 'hello')] } };
    const result = await client.complete(gatewayRequest);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('jarvis-gateway');
    expect(result).toEqual({ status: 'ok', response: { text: 'JARVIS gateway is ready. No AI provider was contacted.', finishReason: 'stop', providerId: 'jarvis-gateway' } });
  });

  it('never sends sessionToken or any provider-credential-shaped field in the invoke body', async () => {
    const invoke = mockInvoke(async () => ({ data: { status: 'ok' }, error: null }));
    const client = createSupabaseGatewayClient(stubFunctionsClient(invoke));

    const gatewayRequest = {
      sessionToken: 'should-never-be-sent',
      request: { messages: [textMessage('user', 'hello')] },
      apiKey: 'sk-should-never-be-sent',
    } as JarvisAiGatewayRequest;
    await client.complete(gatewayRequest);

    const sentBody = invoke.mock.calls[0][1]?.body;
    expect(JSON.stringify(sentBody)).not.toContain('should-never-be-sent');
    expect(sentBody).toEqual({ request: { messages: [textMessage('user', 'hello')] } });
  });

  it('forwards an AbortSignal to functions.invoke for real cancellation', async () => {
    const invoke = mockInvoke(async () => ({ data: { status: 'ok' }, error: null }));
    const client = createSupabaseGatewayClient(stubFunctionsClient(invoke));
    const controller = new AbortController();

    await client.complete({ sessionToken: 't', request: { messages: [] } }, controller.signal);

    expect(invoke.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('reports an invoke() error as a structured, safe error — never an unhandled rejection', async () => {
    const invoke = mockInvoke(async () => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } }));
    const client = createSupabaseGatewayClient(stubFunctionsClient(invoke));

    const result = await client.complete({ sessionToken: 't', request: { messages: [] } });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('provider_unavailable');
  });

  it('reports a cancelled request as a structured "cancelled" error', async () => {
    const invoke = mockInvoke(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    const client = createSupabaseGatewayClient(stubFunctionsClient(invoke));

    const result = await client.complete({ sessionToken: 't', request: { messages: [] } });
    expect(result).toEqual({ status: 'error', error: { code: 'cancelled', message: 'The request was cancelled.' } });
  });

  it('never claims an AI answer was generated — the response text is only the deterministic gateway message', async () => {
    const invoke = mockInvoke(async () => ({ data: { status: 'ok', message: 'JARVIS gateway is ready. No AI provider was contacted.' }, error: null }));
    const client = createSupabaseGatewayClient(stubFunctionsClient(invoke));

    const result = await client.complete({ sessionToken: 't', request: { messages: [] } });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.response.text).toContain('No AI provider was contacted');
  });
});

describe('createSupabaseGatewayClient — stream()', () => {
  it('yields exactly one honest error event, never a fake stream', async () => {
    const client = createSupabaseGatewayClient(stubFunctionsClient(mockInvoke(async () => ({ data: null, error: null }))));
    const received: unknown[] = [];
    for await (const event of client.stream({ sessionToken: 't', request: { messages: [] } })) {
      received.push(event);
    }
    expect(received).toEqual([{ type: 'error', error: { code: 'provider_unavailable', message: 'Streaming is not yet supported by the deployed JARVIS gateway function.' } }]);
  });
});
