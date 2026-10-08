import { describe, it, expect } from 'vitest';
import { runJarvisConversationTurn } from './jarvisConversationController';
import type { JarvisConversationAction } from './jarvisConversationTypes';
import type { JarvisStreamDelta } from '../jarvis/runtime';

// No React, no runtime/provider import, no network — this drives the controller with a
// HAND-WRITTEN fake async generator standing in for streamJarvisRequest's own real output shape,
// proving the dispatch sequence is correct independent of anything JARVIS/Android-specific.
async function* fakeStream(events: JarvisStreamDelta[]): AsyncGenerator<JarvisStreamDelta> {
  for (const event of events) yield event;
}

function collectDispatches(): { dispatch: (action: JarvisConversationAction) => void; actions: JarvisConversationAction[] } {
  const actions: JarvisConversationAction[] = [];
  return { dispatch: (a) => actions.push(a), actions };
}

const DETERMINISTIC_RESULT = {
  response: { intent: 'study_next', responseText: 'done', signals: [], toolResults: [], requiresFurtherProcessing: false },
  provenance: { source: 'deterministic' as const, degraded: false },
};

describe('runJarvisConversationTurn — grounded request path', () => {
  it('dispatches jarvis_message_started, then jarvis_delta per real token, then jarvis_completed exactly once', async () => {
    const { dispatch, actions } = collectDispatches();
    await runJarvisConversationTurn('j1', fakeStream([{ textDelta: 'Hello' }, { textDelta: ' world' }, { result: DETERMINISTIC_RESULT }]), dispatch);

    expect(actions.map((a) => a.type)).toEqual(['jarvis_message_started', 'jarvis_delta', 'jarvis_delta', 'jarvis_completed']);
    expect(actions.filter((a) => a.type === 'jarvis_delta').map((a: any) => a.delta)).toEqual(['Hello', ' world']);
    const completed = actions.find((a) => a.type === 'jarvis_completed') as any;
    expect(completed.text).toBe('done');
    expect(completed.provenanceSource).toBe('deterministic');
    expect(completed.degraded).toBe(false);
  });

  it('a deterministic/tool-grounded result with no deltas still dispatches started -> completed (never stuck "streaming")', async () => {
    const { dispatch, actions } = collectDispatches();
    await runJarvisConversationTurn('j1', fakeStream([{ result: DETERMINISTIC_RESULT }]), dispatch);
    expect(actions.map((a) => a.type)).toEqual(['jarvis_message_started', 'jarvis_completed']);
  });

  it('a thrown error (not cancellation) dispatches jarvis_error with a real message, never fabricating a response', async () => {
    async function* throwingStream(): AsyncGenerator<JarvisStreamDelta> {
      yield { textDelta: 'partial' };
      throw new Error('native crash');
    }
    const { dispatch, actions } = collectDispatches();
    await runJarvisConversationTurn('j1', throwingStream(), dispatch);

    expect(actions.map((a) => a.type)).toEqual(['jarvis_message_started', 'jarvis_delta', 'jarvis_error']);
    expect((actions[2] as any).message).toBe('native crash');
  });

  it('isCancelled() true at the final result dispatches jarvis_cancelled instead of jarvis_completed', async () => {
    const { dispatch, actions } = collectDispatches();
    await runJarvisConversationTurn('j1', fakeStream([{ textDelta: 'partial' }, { result: DETERMINISTIC_RESULT }]), dispatch, () => true);

    expect(actions.map((a) => a.type)).toEqual(['jarvis_message_started', 'jarvis_delta', 'jarvis_cancelled']);
  });

  it('isCancelled() true when the stream throws dispatches jarvis_cancelled instead of jarvis_error', async () => {
    async function* throwingStream(): AsyncGenerator<JarvisStreamDelta> {
      throw new Error('aborted');
    }
    const { dispatch, actions } = collectDispatches();
    await runJarvisConversationTurn('j1', throwingStream(), dispatch, () => true);

    expect(actions.map((a) => a.type)).toEqual(['jarvis_message_started', 'jarvis_cancelled']);
  });

  it('defaults isCancelled to false when the caller omits it', async () => {
    const { dispatch, actions } = collectDispatches();
    await runJarvisConversationTurn('j1', fakeStream([{ result: DETERMINISTIC_RESULT }]), dispatch);
    expect(actions.map((a) => a.type)).toEqual(['jarvis_message_started', 'jarvis_completed']);
  });

  it('a stream that ends without ever yielding a result does not hang — dispatches jarvis_error', async () => {
    const { dispatch, actions } = collectDispatches();
    await runJarvisConversationTurn('j1', fakeStream([{ textDelta: 'partial' }]), dispatch);
    expect(actions.map((a) => a.type)).toEqual(['jarvis_message_started', 'jarvis_delta', 'jarvis_error']);
  });
});
