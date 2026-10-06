// JARVIS Phase 13A — Local LLM lifecycle state (Android).
//
// Extends the EXISTING native-runtime contract (nativeLlamaRuntimeContract.ts, Phase 10) with a
// richer, explicit 7-state view this phase's own brief names: provider unavailable, model
// unavailable, model loading, model ready, inference running, inference failed, inference
// completed. This is NOT a new native/plugin contract — NativeLlamaRuntimeClient,
// JarvisAndroidRuntimeStatus, and toAndroidProviderHealthStatus are all unchanged (see the import
// below: only types/values already defined by Phase 10, never redefined here). This sandbox has no
// Android NDK/SDK (confirmed in every earlier phase's own report), so this phase deliberately
// extends the state the JS side can observe WITHOUT touching any Kotlin/C++/native file — zero risk
// to Native Ink (which lives in the same Android package) and zero unverifiable native-compilation
// risk. The three "inference_*" states have no equivalent at all in the existing 5-state
// JarvisAndroidRuntimeStatus (that contract only ever describes the MODEL's own lifecycle, never a
// single in-flight completion call) — they are derived here by directly observing a call to
// runtime.complete() start and finish, never invented or reported before an actual call runs.
//
// Deliberately NOT wired into runtime.ts's own routing or returned JarvisRuntimeProvenance in this
// phase: doing so would require either changing the shape of an already-returned, already-tested
// result object (breaking existing exact-equality `toEqual` assertions in runtime.test.ts) or
// inventing a value no real backend yet produces. This module exists on its own, fully tested, as
// the layer a future phase's real llama.cpp/GGUF backend + UI will consume — see this phase's own
// final report for why that wiring is deliberately deferred, not forgotten.
import type { NativeLlamaRuntimeClient } from './nativeLlamaRuntimeContract';

export type JarvisLocalLlmLifecycleState =
  | 'provider_unavailable'
  | 'model_unavailable'
  | 'model_loading'
  | 'model_ready'
  | 'inference_running'
  | 'inference_failed'
  | 'inference_completed';

export interface JarvisLocalLlmLifecycleTracker {
  /** The current lifecycle state, derived fresh from the underlying runtime's own
   * getStatus()/getLoadedModel() plus this tracker's own observation of the most recent
   * complete() call — never cached beyond that one call's own outcome, and never guessed ahead of
   * an actual call. */
  getLifecycleState(): Promise<JarvisLocalLlmLifecycleState>;
  /** Wraps runtime.complete(): records 'inference_running' for the call's duration and
   * 'inference_completed'/'inference_failed' afterwards. Never swallows or alters the underlying
   * result or error — this is purely an observer; the call's own return value/throw passes
   * through completely unchanged. */
  complete: NativeLlamaRuntimeClient['complete'];
}

/**
 * `runtime` is injected, matching every other JARVIS client's own "no hidden global dependency"
 * discipline (nativeLlamaRuntime.ts, androidLocalLlamaProvider.ts). A pure wrapper: creates no
 * native handle of its own, starts no model load on its own, makes no network call — every state
 * it reports ultimately comes from calling the SAME runtime methods androidLocalLlamaProvider.ts
 * already calls. `isProviderAvailable` mirrors localLlamaCapacitorPlugin.ts's own
 * `isLocalLlamaRuntimeAvailable` (platform/plugin reachability) — a concern distinct from, and
 * checked before, the runtime's OWN reported status.
 */
export function createLocalLlmLifecycleTracker(runtime: NativeLlamaRuntimeClient, options: { isProviderAvailable: boolean }): JarvisLocalLlmLifecycleTracker {
  let lastInferenceOutcome: 'none' | 'running' | 'completed' | 'failed' = 'none';

  async function getLifecycleState(): Promise<JarvisLocalLlmLifecycleState> {
    if (!options.isProviderAvailable) return 'provider_unavailable';
    if (lastInferenceOutcome === 'running') return 'inference_running';

    const status = await runtime.getStatus();
    if (status === 'unavailable') return 'provider_unavailable';
    if (status === 'loading') return 'model_loading';
    if (status === 'error') return lastInferenceOutcome === 'failed' ? 'inference_failed' : 'model_unavailable';

    const loadedModel = await runtime.getLoadedModel();
    if (status === 'ready' && loadedModel !== null) {
      if (lastInferenceOutcome === 'completed') return 'inference_completed';
      if (lastInferenceOutcome === 'failed') return 'inference_failed';
      return 'model_ready';
    }

    // status === 'available', or 'ready' with no loaded model attached — the latter mirrors
    // toAndroidProviderHealthStatus's own documented rule (nativeLlamaRuntimeContract.ts): never
    // trust `status` alone, and a 'ready' report with nothing loaded is treated as "no usable
    // model exists right now", never silently upgraded to model_ready.
    return 'model_unavailable';
  }

  const complete: NativeLlamaRuntimeClient['complete'] = async (request, signal) => {
    lastInferenceOutcome = 'running';
    try {
      const result = await runtime.complete(request, signal);
      lastInferenceOutcome = 'completed';
      return result;
    } catch (err) {
      lastInferenceOutcome = 'failed';
      throw err;
    }
  };

  return { getLifecycleState, complete };
}
