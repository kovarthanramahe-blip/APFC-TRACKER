import { describe, it, expect } from 'vitest';
import { jarvisConversationReducer } from './jarvisConversationReducer';
import { INITIAL_JARVIS_CONVERSATION_STATE, type JarvisConversationState } from './jarvisConversationTypes';

describe('jarvisConversationReducer', () => {
  it('empty state has no messages and is not loading (the empty-state UI condition)', () => {
    expect(INITIAL_JARVIS_CONVERSATION_STATE.messages).toHaveLength(0);
    expect(INITIAL_JARVIS_CONVERSATION_STATE.isLoading).toBe(false);
  });

  it('user_message_sent appends a done user message and sets isLoading', () => {
    const state = jarvisConversationReducer(INITIAL_JARVIS_CONVERSATION_STATE, { type: 'user_message_sent', id: 'u1', text: 'hello' });
    expect(state.messages).toEqual([{ id: 'u1', role: 'user', text: 'hello', status: 'done' }]);
    expect(state.isLoading).toBe(true);
  });

  it('jarvis_message_started appends an empty streaming jarvis message', () => {
    let state: JarvisConversationState = jarvisConversationReducer(INITIAL_JARVIS_CONVERSATION_STATE, { type: 'user_message_sent', id: 'u1', text: 'hi' });
    state = jarvisConversationReducer(state, { type: 'jarvis_message_started', id: 'j1' });
    expect(state.messages[1]).toEqual({ id: 'j1', role: 'jarvis', text: '', status: 'streaming' });
  });

  it('jarvis_delta appends text to the matching message only, never another message', () => {
    let state: JarvisConversationState = jarvisConversationReducer(INITIAL_JARVIS_CONVERSATION_STATE, { type: 'jarvis_message_started', id: 'j1' });
    state = jarvisConversationReducer(state, { type: 'jarvis_delta', id: 'j1', delta: 'Hello' });
    state = jarvisConversationReducer(state, { type: 'jarvis_delta', id: 'j1', delta: ' world' });
    expect(state.messages[0].text).toBe('Hello world');
    expect(state.isLoading).toBe(true); // still loading mid-stream
  });

  it('jarvis_completed sets final text/provenance, status done, and clears isLoading', () => {
    let state: JarvisConversationState = jarvisConversationReducer(INITIAL_JARVIS_CONVERSATION_STATE, { type: 'jarvis_message_started', id: 'j1' });
    state = jarvisConversationReducer(state, {
      type: 'jarvis_completed',
      id: 'j1',
      text: 'You have 6 study items due today.',
      provenanceSource: 'deterministic',
      degraded: false,
    });
    expect(state.messages[0]).toEqual({
      id: 'j1',
      role: 'jarvis',
      text: 'You have 6 study items due today.',
      status: 'done',
      provenanceSource: 'deterministic',
      degraded: false,
      degradedReason: undefined,
    });
    expect(state.isLoading).toBe(false);
  });

  it('jarvis_error sets status error + errorMessage, clears isLoading, never fabricates a response', () => {
    let state: JarvisConversationState = jarvisConversationReducer(INITIAL_JARVIS_CONVERSATION_STATE, { type: 'jarvis_message_started', id: 'j1' });
    state = jarvisConversationReducer(state, { type: 'jarvis_error', id: 'j1', message: 'native crash' });
    expect(state.messages[0].status).toBe('error');
    expect(state.messages[0].errorMessage).toBe('native crash');
    expect(state.messages[0].text).toBe(''); // no fabricated text
    expect(state.isLoading).toBe(false);
  });

  it('jarvis_cancelled sets status cancelled and clears isLoading', () => {
    let state: JarvisConversationState = jarvisConversationReducer(INITIAL_JARVIS_CONVERSATION_STATE, { type: 'jarvis_message_started', id: 'j1' });
    state = jarvisConversationReducer(state, { type: 'jarvis_delta', id: 'j1', delta: 'partial' });
    state = jarvisConversationReducer(state, { type: 'jarvis_cancelled', id: 'j1' });
    expect(state.messages[0].status).toBe('cancelled');
    expect(state.isLoading).toBe(false);
  });

  it('message_removed removes exactly the named message (used by retry, to discard a failed attempt before resending)', () => {
    let state: JarvisConversationState = jarvisConversationReducer(INITIAL_JARVIS_CONVERSATION_STATE, { type: 'user_message_sent', id: 'u1', text: 'hi' });
    state = jarvisConversationReducer(state, { type: 'jarvis_error', id: 'j1', message: 'boom' });
    state = jarvisConversationReducer(state, { type: 'message_removed', id: 'j1' });
    expect(state.messages.map((m) => m.id)).toEqual(['u1']);
  });

  it('conversation_cleared resets to the exact initial state', () => {
    let state: JarvisConversationState = jarvisConversationReducer(INITIAL_JARVIS_CONVERSATION_STATE, { type: 'user_message_sent', id: 'u1', text: 'hi' });
    state = jarvisConversationReducer(state, { type: 'conversation_cleared' });
    expect(state).toEqual(INITIAL_JARVIS_CONVERSATION_STATE);
  });

  it('is pure — never mutates the state object passed in', () => {
    const before = INITIAL_JARVIS_CONVERSATION_STATE;
    const beforeSnapshot = JSON.parse(JSON.stringify(before));
    jarvisConversationReducer(before, { type: 'user_message_sent', id: 'u1', text: 'hi' });
    expect(before).toEqual(beforeSnapshot);
  });
});
