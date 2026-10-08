import { describe, it, expect } from 'vitest';
import {
  validateRawBodySize,
  parseJson,
  validateGatewayRequestBody,
  findCredentialLikeKey,
  buildGatewayReadyResponse,
  buildGatewayErrorResponse,
  MAX_MESSAGES,
  MAX_MESSAGE_CONTENT_PARTS,
  MAX_TEXT_LENGTH,
  MAX_TOOLS,
  MAX_BODY_BYTES,
} from './validation';

function validMessage(text = 'hello') {
  return { role: 'user', content: [{ type: 'text', text }] };
}

describe('validateRawBodySize', () => {
  it('accepts a body under the limit', () => {
    expect(validateRawBodySize('{}')).toBeNull();
  });

  it('rejects an oversized body with 413', () => {
    const error = validateRawBodySize('x'.repeat(MAX_BODY_BYTES + 1));
    expect(error).toEqual({ status: 413, code: 'payload_too_large', message: expect.stringContaining(String(MAX_BODY_BYTES)) });
  });
});

describe('parseJson', () => {
  it('parses valid JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('rejects malformed JSON with a safe 400 error, never a raw parser exception', () => {
    const result = parseJson('{ not json');
    expect(result).toEqual({ ok: false, error: { status: 400, code: 'malformed_json', message: expect.any(String) } });
  });
});

describe('validateGatewayRequestBody', () => {
  it('accepts a minimal valid request', () => {
    const result = validateGatewayRequestBody({ request: { messages: [validMessage()] } });
    expect(result).toEqual({ ok: true, request: { messageCount: 1, hasContext: false, toolCount: 0 } });
  });

  it('accepts a request with context and tools, reporting their bounded shape', () => {
    const result = validateGatewayRequestBody({
      request: { messages: [validMessage()], context: { workspace: 'apfc' }, tools: [{ id: 't1' }] },
    });
    expect(result).toEqual({ ok: true, request: { messageCount: 1, hasContext: true, toolCount: 1 } });
  });

  it('rejects a body that is not an object', () => {
    expect(validateGatewayRequestBody('not an object').ok).toBe(false);
    expect(validateGatewayRequestBody(null).ok).toBe(false);
    expect(validateGatewayRequestBody([1, 2]).ok).toBe(false);
  });

  it('rejects a missing "request" field', () => {
    const result = validateGatewayRequestBody({});
    expect(result).toEqual({ ok: false, error: { status: 400, code: 'missing_request', message: expect.any(String) } });
  });

  it('rejects missing or non-array "messages"', () => {
    expect(validateGatewayRequestBody({ request: {} }).ok).toBe(false);
    expect(validateGatewayRequestBody({ request: { messages: 'not an array' } }).ok).toBe(false);
  });

  it('rejects an empty messages array', () => {
    const result = validateGatewayRequestBody({ request: { messages: [] } });
    expect(result).toEqual({ ok: false, error: { status: 400, code: 'empty_messages', message: expect.any(String) } });
  });

  it('rejects more than MAX_MESSAGES messages, with a 413', () => {
    const messages = Array.from({ length: MAX_MESSAGES + 1 }, () => validMessage());
    const result = validateGatewayRequestBody({ request: { messages } });
    expect(result).toEqual({ ok: false, error: { status: 413, code: 'too_many_messages', message: expect.any(String) } });
  });

  it('rejects an invalid message role', () => {
    const result = validateGatewayRequestBody({ request: { messages: [{ role: 'root', content: [] }] } });
    expect(result).toEqual({ ok: false, error: { status: 400, code: 'invalid_role', message: expect.any(String) } });
  });

  it('rejects a message whose content is not an array', () => {
    const result = validateGatewayRequestBody({ request: { messages: [{ role: 'user', content: 'hi' }] } });
    expect(result).toEqual({ ok: false, error: { status: 400, code: 'malformed_content', message: expect.any(String) } });
  });

  it('rejects content with more than MAX_MESSAGE_CONTENT_PARTS parts, with a 413', () => {
    const content = Array.from({ length: MAX_MESSAGE_CONTENT_PARTS + 1 }, () => ({ type: 'text', text: 'x' }));
    const result = validateGatewayRequestBody({ request: { messages: [{ role: 'user', content }] } });
    expect(result).toEqual({ ok: false, error: { status: 413, code: 'content_too_large', message: expect.any(String) } });
  });

  it('rejects a text content part longer than MAX_TEXT_LENGTH, with a 413', () => {
    const result = validateGatewayRequestBody({ request: { messages: [validMessage('x'.repeat(MAX_TEXT_LENGTH + 1))] } });
    expect(result).toEqual({ ok: false, error: { status: 413, code: 'text_too_large', message: expect.any(String) } });
  });

  it('rejects more than MAX_TOOLS tool definitions, with a 413', () => {
    const tools = Array.from({ length: MAX_TOOLS + 1 }, (_, i) => ({ id: `t${i}` }));
    const result = validateGatewayRequestBody({ request: { messages: [validMessage()], tools } });
    expect(result).toEqual({ ok: false, error: { status: 413, code: 'too_many_tools', message: expect.any(String) } });
  });

  it('rejects a non-object "context"', () => {
    const result = validateGatewayRequestBody({ request: { messages: [validMessage()], context: 'not an object' } });
    expect(result).toEqual({ ok: false, error: { status: 400, code: 'malformed_context', message: expect.any(String) } });
  });

  it('rejects a top-level provider-credential-shaped field', () => {
    const result = validateGatewayRequestBody({ request: { messages: [validMessage()] }, apiKey: 'sk-should-never-exist' });
    expect(result).toEqual({ ok: false, error: { status: 400, code: 'credential_field_rejected', message: expect.stringContaining('apiKey') } });
  });

  it('rejects a provider-credential-shaped field nested anywhere in the body', () => {
    const result = validateGatewayRequestBody({ request: { messages: [validMessage()], modelConfig: { providerServiceRoleKey: 'x' } } });
    expect(result.ok).toBe(false);
  });

  it('ignores an unrelated extra field like Phase 4\'s own "sessionToken" — it is never treated as identity here', () => {
    const result = validateGatewayRequestBody({ sessionToken: 'whatever-the-client-sent', request: { messages: [validMessage()] } });
    expect(result.ok).toBe(true);
  });
});

describe('findCredentialLikeKey', () => {
  it('finds a credential-shaped key at the top level', () => {
    expect(findCredentialLikeKey({ apiKey: 'x' })).toBe('apiKey');
  });

  it('finds a credential-shaped key nested arbitrarily deep', () => {
    expect(findCredentialLikeKey({ a: { b: { c: { secretToken: 'x' } } } })).toBe('secretToken');
  });

  it('returns null when nothing credential-shaped is present', () => {
    expect(findCredentialLikeKey({ messages: [], workspace: 'apfc' })).toBeNull();
  });

  it('does not infinite-loop on a self-referential object', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => findCredentialLikeKey(cyclic)).not.toThrow();
  });
});

describe('response builders', () => {
  it('builds the deterministic gateway-ready response, never claiming an AI answer', () => {
    const body = buildGatewayReadyResponse({ messageCount: 2, hasContext: true, toolCount: 1 });
    expect(body).toEqual({
      status: 'ok',
      mode: 'gateway_ready',
      userAuthenticated: true,
      providerConnected: false,
      streamingSupportedByContract: true,
      requestAccepted: true,
      messageCount: 2,
      hasContext: true,
      toolCount: 1,
      message: expect.stringContaining('No AI provider was contacted'),
    });
  });

  it('builds a structured error response with no raw exception detail', () => {
    const body = buildGatewayErrorResponse({ status: 400, code: 'malformed_request', message: 'Request body must be a JSON object.' });
    expect(body).toEqual({ status: 'error', error: { code: 'malformed_request', message: 'Request body must be a JSON object.' } });
  });
});
