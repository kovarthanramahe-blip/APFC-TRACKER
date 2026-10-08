// JARVIS Phase 14 — drives ONE conversation turn from an existing `streamJarvisRequest` async
// generator (runtime.ts, unmodified by this file) into dispatched reducer actions. No React, no
// direct provider/native import — this file only consumes the already-returned JarvisStreamDelta
// events; `useJarvisConversation.ts` is the only caller, and is the only place that actually
// invokes `streamJarvisRequest` itself.
import type { JarvisStreamDelta } from '../jarvis/runtime';
import type { JarvisConversationAction } from './jarvisConversationTypes';

/**
 * `isCancelled` (defaults to "never") lets the caller (the hook, which owns the AbortController)
 * tell this function a result arriving AFTER a user-initiated cancel should be reported as
 * `jarvis_cancelled`, never as a normal `jarvis_completed`/`jarvis_error` — the stream's own final
 * event is still a real, honest result either way (never fabricated); only which action this
 * dispatches for it changes.
 */
export async function runJarvisConversationTurn(
  jarvisMessageId: string,
  stream: AsyncGenerator<JarvisStreamDelta>,
  dispatch: (action: JarvisConversationAction) => void,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  dispatch({ type: 'jarvis_message_started', id: jarvisMessageId });

  try {
    for await (const event of stream) {
      if (event.textDelta !== undefined) {
        dispatch({ type: 'jarvis_delta', id: jarvisMessageId, delta: event.textDelta });
      }

      if (event.result !== undefined) {
        if (isCancelled()) {
          dispatch({ type: 'jarvis_cancelled', id: jarvisMessageId });
          return;
        }
        const { response, provenance } = event.result;
        dispatch({
          type: 'jarvis_completed',
          id: jarvisMessageId,
          text: response.responseText,
          provenanceSource: provenance.source,
          degraded: provenance.degraded,
          degradedReason: provenance.degradedReason,
        });
        return;
      }
    }
    // The generator ended without ever yielding a `result` — should not happen (runtime.ts's own
    // streamJarvisRequest always yields exactly one), but never leave the message stuck
    // "streaming" forever if it somehow does.
    if (isCancelled()) {
      dispatch({ type: 'jarvis_cancelled', id: jarvisMessageId });
    } else {
      dispatch({ type: 'jarvis_error', id: jarvisMessageId, message: 'JARVIS ended its response unexpectedly.' });
    }
  } catch (err) {
    if (isCancelled()) {
      dispatch({ type: 'jarvis_cancelled', id: jarvisMessageId });
      return;
    }
    const message = err instanceof Error ? err.message : 'JARVIS failed to respond.';
    dispatch({ type: 'jarvis_error', id: jarvisMessageId, message });
  }
}
