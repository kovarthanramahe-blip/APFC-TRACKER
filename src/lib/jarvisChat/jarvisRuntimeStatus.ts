// JARVIS Phase 14 — maps the EXISTING Phase 13A/13B lifecycle state onto the four UI-facing
// statuses this phase's own brief names: "Local AI Ready", "Loading Model", "Model Unavailable",
// "Deterministic Mode". No new lifecycle concept — JarvisLocalLlmLifecycleState (Phase 13A,
// localLlmLifecycle.ts) is the single source of truth; this file only relabels it for display.
//
// Phase 13H adds a FIFTH UI status, 'model_load_failed', mirroring that same file's own new
// 'model_load_failed' lifecycle state — surfaced distinctly so a user who taps "Load model" and
// hits a genuine native failure sees an honest error, not the same "Model Unavailable" copy shown
// before any attempt was ever made.
import type { JarvisLocalLlmLifecycleState } from '../jarvis/ai/android/localLlmLifecycle';

export type JarvisUiRuntimeStatus = 'deterministic' | 'model_unavailable' | 'model_loading' | 'model_load_failed' | 'model_ready';

/** `'not_android'` is this file's own sentinel for "the platform can never have a local LLM at
 * all" (web, iOS, or any non-Android Capacitor target — see localLlamaCapacitorPlugin.ts's own
 * `isLocalLlamaRuntimeAvailable`) — distinct from the lifecycle tracker's `'provider_unavailable'`
 * (Android, but the bridge itself isn't reachable right now), though both map to the same
 * "Deterministic Mode" label: either way, no local AI attempt is possible, which is exactly what
 * that label communicates. */
export type JarvisRuntimeStatusInput = JarvisLocalLlmLifecycleState | 'not_android';

/**
 * Pure, deterministic mapping — the same input always produces the same UI status. A model that
 * is merely mid-request (`inference_running`/`inference_completed`/`inference_failed`) still
 * reports `'model_ready'` here: those three only ever occur once a model was already loaded, and
 * one request's own outcome doesn't change whether the model itself is still ready for another.
 */
export function deriveJarvisUiRuntimeStatus(state: JarvisRuntimeStatusInput): JarvisUiRuntimeStatus {
  switch (state) {
    case 'not_android':
    case 'provider_unavailable':
      return 'deterministic';
    case 'model_unavailable':
      return 'model_unavailable';
    case 'model_loading':
      return 'model_loading';
    case 'model_load_failed':
      return 'model_load_failed';
    case 'model_ready':
    case 'inference_running':
    case 'inference_completed':
    case 'inference_failed':
      return 'model_ready';
  }
}

export const JARVIS_UI_RUNTIME_STATUS_LABEL: Readonly<Record<JarvisUiRuntimeStatus, string>> = {
  deterministic: 'Deterministic Mode',
  model_unavailable: 'Model Unavailable',
  model_loading: 'Loading Model',
  model_load_failed: 'Model Load Failed',
  model_ready: 'Local AI Ready',
};
