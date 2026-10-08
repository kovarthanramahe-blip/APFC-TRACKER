// JARVIS Phase 14 — the ONLY file that wires the pure reducer/controller above to React state.
// Owns cancellation (AbortController) and retry (re-running the last turn) as thin glue; every
// actual decision about WHAT to dispatch already lives in jarvisConversationController.ts/
// jarvisConversationReducer.ts (both fully unit-tested without React). This hook calls
// `streamJarvisRequest` directly — the one, intentional seam between "UI" and "runtime" this
// phase's own architecture rule asks for (no llama.cpp/native logic here, only a call into the
// existing runtime.ts composition layer).
import { useCallback, useReducer, useRef } from 'react';
import { streamJarvisRequest } from '../jarvis/runtime';
import type { JarvisWorkspace } from '../jarvis/types';
import type { JarvisContextToolInputs } from '../jarvis/contextEngine';
import { jarvisConversationReducer } from './jarvisConversationReducer';
import { runJarvisConversationTurn } from './jarvisConversationController';
import { INITIAL_JARVIS_CONVERSATION_STATE, type JarvisChatMessage } from './jarvisConversationTypes';

let messageIdCounter = 0;
function nextMessageId(prefix: string): string {
  messageIdCounter += 1;
  return `${prefix}-${messageIdCounter}`;
}

export interface JarvisChatRequestContext {
  workspace: JarvisWorkspace;
  toolInputs: JarvisContextToolInputs;
}

export interface UseJarvisConversationResult {
  messages: JarvisChatMessage[];
  isLoading: boolean;
  send: (query: string, context: JarvisChatRequestContext) => Promise<void>;
  cancel: () => void;
  retry: (jarvisMessageId: string) => void;
  clear: () => void;
}

export function useJarvisConversation(): UseJarvisConversationResult {
  const [state, dispatch] = useReducer(jarvisConversationReducer, INITIAL_JARVIS_CONVERSATION_STATE);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const lastTurnRef = useRef<{ query: string; context: JarvisChatRequestContext } | null>(null);

  const runJarvisTurn = useCallback(async (query: string, context: JarvisChatRequestContext) => {
    const jarvisId = nextMessageId('jarvis');
    cancelledRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const stream = streamJarvisRequest(
      { context: { workspace: context.workspace, timestamp: new Date().toISOString() }, query, toolInputs: context.toolInputs },
      controller.signal,
    );
    await runJarvisConversationTurn(jarvisId, stream, dispatch, () => cancelledRef.current);
    abortControllerRef.current = null;
  }, []);

  const send = useCallback(
    async (query: string, context: JarvisChatRequestContext) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      lastTurnRef.current = { query: trimmed, context };
      dispatch({ type: 'user_message_sent', id: nextMessageId('user'), text: trimmed });
      await runJarvisTurn(trimmed, context);
    },
    [runJarvisTurn],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
  }, []);

  const retry = useCallback(
    (jarvisMessageId: string) => {
      dispatch({ type: 'message_removed', id: jarvisMessageId });
      const lastTurn = lastTurnRef.current;
      if (lastTurn) void runJarvisTurn(lastTurn.query, lastTurn.context);
    },
    [runJarvisTurn],
  );

  const clear = useCallback(() => dispatch({ type: 'conversation_cleared' }), []);

  return { messages: state.messages, isLoading: state.isLoading, send, cancel, retry, clear };
}
