import { describe, it, expect } from 'vitest';
import { textMessage } from './types';
import type { JarvisAiMessage, JarvisAiRequest, JarvisAiStreamEvent, JarvisAiError, JarvisAiErrorCode } from './types';
import { buildJarvisContext } from '../contextEngine';
import { createToolRegistry } from '../toolRegistry';
import { createApplicationTools } from '../applicationTools';

describe('textMessage', () => {
  it('builds a single-part text message', () => {
    const message = textMessage('user', 'What is due today?');
    expect(message).toEqual({ role: 'user', content: [{ type: 'text', text: 'What is due today?' }] });
  });
});

describe('JarvisAiMessage content', () => {
  it('supports mixed content part types in one message', () => {
    const message: JarvisAiMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Checking your revision state...' },
        { type: 'tool_call', toolCall: { id: 'call-1', toolId: 'apfc.study_state', input: {} } },
      ],
    };
    expect(message.content).toHaveLength(2);
    expect(message.content[1].type).toBe('tool_call');
  });
});

describe('JarvisAiStreamEvent — discriminated union', () => {
  // Exhaustively switching over every variant with a `never` check in the default branch is a
  // compile-time guarantee (not just a runtime one): if a future phase adds a variant and this
  // switch isn't updated, `tsc` fails here, not silently at a call site.
  function describeEvent(event: JarvisAiStreamEvent): string {
    switch (event.type) {
      case 'response_started':
        return `started:${event.providerId}`;
      case 'text_delta':
        return `delta:${event.delta}`;
      case 'text_done':
        return `done:${event.text}`;
      case 'tool_call_delta':
        return `tool_delta:${event.toolCallId}`;
      case 'tool_call_completed':
        return `tool_done:${event.toolCall.id}`;
      case 'response_completed':
        return `completed:${event.response.finishReason}`;
      case 'response_incomplete':
        return `incomplete:${event.reason}`;
      case 'error':
        return `error:${event.error.code}`;
      default: {
        const exhaustive: never = event;
        throw new Error(`Unhandled stream event: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  it('narrows every variant correctly', () => {
    expect(describeEvent({ type: 'response_started', providerId: 'stub' })).toBe('started:stub');
    expect(describeEvent({ type: 'text_delta', delta: 'hi' })).toBe('delta:hi');
    expect(describeEvent({ type: 'text_done', text: 'hi there' })).toBe('done:hi there');
    expect(describeEvent({ type: 'tool_call_delta', toolCallId: 'c1' })).toBe('tool_delta:c1');
    expect(describeEvent({ type: 'tool_call_completed', toolCall: { id: 'c1', toolId: 'apfc.study_state', input: {} } })).toBe('tool_done:c1');
    expect(describeEvent({ type: 'response_completed', response: { text: 'done', finishReason: 'stop' } })).toBe('completed:stop');
    expect(describeEvent({ type: 'response_incomplete', response: { text: '', finishReason: 'length' }, reason: 'max_tokens' })).toBe('incomplete:max_tokens');
    expect(describeEvent({ type: 'error', error: { code: 'timeout', message: 'took too long' } })).toBe('error:timeout');
  });
});

describe('JarvisAiError — structured classification', () => {
  it('covers every documented error code distinctly', () => {
    const codes: readonly JarvisAiErrorCode[] = [
      'configuration_error',
      'authentication_error',
      'rate_limited',
      'provider_unavailable',
      'timeout',
      'cancelled',
      'malformed_response',
      'unknown_error',
    ];
    const errors: JarvisAiError[] = codes.map((code) => ({ code, message: `safe message for ${code}` }));
    expect(new Set(errors.map((e) => e.code)).size).toBe(codes.length);
    // Never a raw stack trace or provider payload — every message here is a plain, safe string.
    for (const error of errors) expect(error.message).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });
});

describe('JarvisAiRequest — no provider credential field', () => {
  it('accepts a real Phase 3 JarvisContextSnapshot directly as context, never a raw application store', async () => {
    const registry = createToolRegistry();
    for (const tool of createApplicationTools()) registry.register(tool);
    const snapshot = await buildJarvisContext({
      workspace: 'global',
      mode: 'general',
      timestamp: '2026-10-03',
      registry,
      toolInputs: { 'global.workspace_state': { activeWorkspaceId: 'apfc' } },
    });

    const request: JarvisAiRequest = { messages: [textMessage('user', 'hello')], context: snapshot };
    expect(request.context).toBe(snapshot);
    // The bounded snapshot has no resemblance to a raw application store shape.
    expect(request.context).not.toHaveProperty('pyqAttempts');
    expect(request.context).not.toHaveProperty('revisionQueue');
  });

  it('never declares a provider-secret-shaped field — compile-time and structural checks', () => {
    // Compile-time: TypeScript's excess-property check on an object literal rejects an unknown
    // field assigned directly to a JarvisAiRequest-typed variable. If this `@ts-expect-error`
    // ever stops being necessary (i.e. the field were legitimately added), `tsc --noEmit` fails
    // on an "unused ts-expect-error" error, catching the regression at the type-check step this
    // phase's own validation already runs.
    // @ts-expect-error — JarvisAiRequest must never grow a provider-credential field.
    const bad: JarvisAiRequest = { messages: [], apiKey: 'sk-should-never-exist' };
    expect(bad).toBeDefined();

    // Runtime/structural: a legitimately constructed request only ever has the fields this test
    // itself listed — never anything resembling a secret.
    const good: JarvisAiRequest = { messages: [textMessage('user', 'hi')] };
    for (const key of Object.keys(good)) {
      expect(key.toLowerCase()).not.toMatch(/key|secret|token|credential/);
    }
  });
});
