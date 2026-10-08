// JARVIS Phase 14 — pure conversation reducer. No React, no runtime/provider import, no network —
// a plain `(state, action) => state` function, fully unit-testable without any rendering library.
// `useJarvisConversation.ts` is the only file that wires this to React (`useReducer`); this file
// owns 100% of the state-transition logic so that thin hook never has to.
import type { JarvisConversationAction, JarvisConversationState } from './jarvisConversationTypes';

export function jarvisConversationReducer(state: JarvisConversationState, action: JarvisConversationAction): JarvisConversationState {
  switch (action.type) {
    case 'user_message_sent':
      return {
        isLoading: true,
        messages: [...state.messages, { id: action.id, role: 'user', text: action.text, status: 'done' }],
      };

    case 'jarvis_message_started':
      return {
        isLoading: true,
        messages: [...state.messages, { id: action.id, role: 'jarvis', text: '', status: 'streaming' }],
      };

    case 'jarvis_delta':
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, text: m.text + action.delta } : m)),
      };

    case 'jarvis_completed':
      return {
        isLoading: false,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? { ...m, text: action.text, status: 'done', provenanceSource: action.provenanceSource, degraded: action.degraded, degradedReason: action.degradedReason }
            : m,
        ),
      };

    case 'jarvis_error':
      return {
        isLoading: false,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, status: 'error', errorMessage: action.message } : m)),
      };

    case 'jarvis_cancelled':
      return {
        isLoading: false,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, status: 'cancelled' } : m)),
      };

    case 'message_removed':
      return { ...state, messages: state.messages.filter((m) => m.id !== action.id) };

    case 'conversation_cleared':
      return { messages: [], isLoading: false };
  }
}
