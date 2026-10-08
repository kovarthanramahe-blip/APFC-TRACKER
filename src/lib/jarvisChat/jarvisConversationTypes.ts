// JARVIS Phase 14 — conversation state shape for the dedicated JARVIS chat page. Pure types only.
import type { JarvisRuntimeProvenanceSource } from '../jarvis/runtime';

export type JarvisChatMessageRole = 'user' | 'jarvis';

export type JarvisChatMessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'cancelled';

export interface JarvisChatMessage {
  id: string;
  role: JarvisChatMessageRole;
  text: string;
  status: JarvisChatMessageStatus;
  /** Set once a 'jarvis' message reaches 'done' — never guessed, always the real provenance
   * runJarvisRequest/streamJarvisRequest reported. */
  provenanceSource?: JarvisRuntimeProvenanceSource;
  degraded?: boolean;
  degradedReason?: string;
  /** Set only on `status: 'error'`. */
  errorMessage?: string;
}

export interface JarvisConversationState {
  messages: JarvisChatMessage[];
  isLoading: boolean;
}

export const INITIAL_JARVIS_CONVERSATION_STATE: JarvisConversationState = { messages: [], isLoading: false };

export type JarvisConversationAction =
  | { type: 'user_message_sent'; id: string; text: string }
  | { type: 'jarvis_message_started'; id: string }
  | { type: 'jarvis_delta'; id: string; delta: string }
  | {
      type: 'jarvis_completed';
      id: string;
      text: string;
      provenanceSource: JarvisRuntimeProvenanceSource;
      degraded: boolean;
      degradedReason?: string;
    }
  | { type: 'jarvis_error'; id: string; message: string }
  | { type: 'jarvis_cancelled'; id: string }
  | { type: 'message_removed'; id: string }
  | { type: 'conversation_cleared' };
