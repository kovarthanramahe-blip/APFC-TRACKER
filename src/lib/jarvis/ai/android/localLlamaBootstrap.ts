// JARVIS Phase 13C — automatic local model bootstrap (Android).
// Phase 13E — fixed the real model-PATH resolution bug this bootstrap itself introduced (see the
// fix's own comment at the loadModel() call site below): it was passing the descriptor's
// human-readable `modelId` (a bare filename) instead of its `filePath` (the real absolute path),
// so a genuinely discovered, genuinely present GGUF file still failed to open natively with
// "file not found", silently falling back to the stub. Confirmed on a physical Xiaomi Pad 6.
//
// Closes the exact gap this phase's own brief names: the Android native runtime already exposes
// getStatus()/getLoadedModel()/loadModel()/getModelStorageInfo() (Phase 10/13B), but nothing in
// the application ever called loadModel() — so a genuinely present Qwen3 GGUF file sat on-device,
// undiscovered, forever, and every request fell through to Phase 10's own deterministic
// bridge-validation stub. This file is the SMALL, deterministic bootstrap/lifecycle boundary the
// brief asks for (its own words: "Prefer something conceptually like ensureAndroidLocalLlamaModelReady(runtime)")
// — nothing scattered into UI components, no new native/plugin method, no new health contract.
//
// ensureAndroidLocalLlamaModelReady composes ONLY already-existing pieces:
//   - getAndroidLocalLlamaHealth (Phase 10, androidLocalLlamaProvider.ts) — the SAME cross-checked
//     status+loadedModel observation every other caller already trusts, never re-derived here.
//   - LocalLlmModelBackend.describeAvailableModel() (Phase 13A's own typed boundary, satisfied for
//     Android by Phase 13B's createAndroidLocalLlmModelBackend) — the ONLY source of a model path;
//     this file never hardcodes or guesses one.
//   - NativeLlamaRuntimeClient.loadModel(modelId) (Phase 10) — called at most once per bootstrap,
//     and only when a model genuinely needs loading. Despite its parameter's name, this must be
//     given the descriptor's `filePath` (an absolute on-device path), not its `modelId` (a bare
//     filename) — see the call site below for the full explanation.
//
// Honesty guarantee this file exists to enforce: a successful call to loadModel() is NEVER, on its
// own, treated as "ready". The only thing this function ever reports as `model_ready` is the
// SAME cross-checked health read every other part of this codebase already trusts
// (getAndroidLocalLlamaHealth), taken again AFTER the load attempt. If that re-check still doesn't
// say `model_ready` — the native side silently failed to actually finish loading, for instance —
// this returns the honest, still-not-ready health value, never an upgraded one.
import { getAndroidLocalLlamaHealth } from './androidLocalLlamaProvider';
import type { NativeLlamaRuntimeClient } from './nativeLlamaRuntimeContract';
import type { LocalLlmModelBackend } from './localLlmModelBackend';
import type { JarvisAiProviderHealthStatus } from '../providerMetadata';

export interface JarvisLocalLlamaBootstrapResult {
  /** The final, truthful provider health AFTER this bootstrap ran — always a fresh
   * getAndroidLocalLlamaHealth() read, never upgraded/guessed. Only `'model_ready'` means a real,
   * loaded model is actually usable; every other value means the caller must fall back exactly as
   * it already did before this phase (deterministic/stub/unavailable). */
  providerHealth: JarvisAiProviderHealthStatus;
  /** True only when this call actually invoked runtime.loadModel() — never true merely because a
   * model file was discovered. Distinguishes "already ready, nothing to do" from "we attempted a
   * load just now" for tests/observability; never used to fabricate readiness. */
  loadAttempted: boolean;
  /** Set only when this bootstrap could not end in a usable model — no model file discovered, the
   * native load call itself threw, or the post-load health re-check still isn't `model_ready`.
   * Always a genuine, specific reason, never a placeholder. */
  unavailableReason?: string;
}

/**
 * `runtime`/`modelBackend` are injected — matching every other JARVIS client's own "no hidden
 * global dependency" discipline (nativeLlamaRuntime.ts, androidLocalLlamaProvider.ts,
 * androidLocalLlmModelBackend.ts all follow the same shape). A real caller (runtime.ts) passes
 * `createNativeLlamaRuntime(LocalLlamaRuntime)` and `createAndroidLocalLlmModelBackend(LocalLlamaRuntime)`
 * — the exact same instances every other Phase 10/13B composition already uses.
 *
 * Never called at all unless the caller already knows the platform/plugin is reachable
 * (`isLocalLlamaRuntimeAvailable`) — that check stays entirely in runtime.ts, exactly as it always
 * has; this function only ever decides whether a MODEL needs loading, never whether the bridge
 * itself exists.
 */
export async function ensureAndroidLocalLlamaModelReady(
  runtime: NativeLlamaRuntimeClient,
  modelBackend: LocalLlmModelBackend,
): Promise<JarvisLocalLlamaBootstrapResult> {
  const initialHealth = await getAndroidLocalLlamaHealth(runtime);

  // Already genuinely ready — the exact "repeated request after model is already loaded does not
  // reload the model" / "already-loaded model -> no loadModel call" requirement. Checked BEFORE
  // anything else so a hot path (every request after the first) never even queries model storage.
  if (initialHealth === 'model_ready') {
    return { providerHealth: initialHealth, loadAttempted: false };
  }

  // The bridge itself isn't reachable at all (or is reporting an internal error) — attempting a
  // load here would be guesswork about a problem this function has no way to diagnose or fix.
  // Leave this exactly as runtime.ts's own existing bridgeReachable fallback already handles it.
  if (initialHealth === 'unavailable' || initialHealth === 'error') {
    return { providerHealth: initialHealth, loadAttempted: false };
  }

  // initialHealth === 'available' (or the Phase 6 'model_missing' value, never actually produced
  // by toAndroidProviderHealthStatus today but handled the same way for forward-safety): the
  // bridge is reachable, but no ready model is loaded. Discover what, if anything, is on-device —
  // the ONLY source of a model id this function ever consults.
  const availability = await modelBackend.describeAvailableModel();

  if (availability.status !== 'model_found') {
    const reason = availability.status === 'model_missing' ? availability.reason : 'No local GGUF model is configured on this device.';
    return { providerHealth: initialHealth, loadAttempted: false, unavailableReason: reason };
  }

  // Phase 13E fix — NativeLlamaRuntimeClient.loadModel(modelId) is, despite its parameter's name,
  // treated by the native/JNI layer as an ABSOLUTE ON-DEVICE FILE PATH, never a bare filename (see
  // native_llama_bridge.cpp's own `nativeLoadModel`: "modelId is now treated as an absolute
  // on-device GGUF file path"). LocalLlmModelDescriptor deliberately carries BOTH a human-readable
  // `modelId` (the bare filename, used only for display/telemetry — see getLoadedModel's own
  // modelId field) and a separate `filePath` (the real absolute path llama.cpp must open) — this
  // previously passed `descriptor.modelId` here by mistake, so the native backend received only a
  // bare filename like "Qwen3-1.7B-Q4_K_M.gguf" and fopen() correctly reported "file not found"
  // relative to the process's own working directory, falling back to the stub. `filePath` is the
  // one field this function must pass to `loadModel()` — never `modelId`, and never a path
  // reconstructed/guessed here (e.g. by joining a hardcoded directory with the id), which would
  // silently reintroduce the same class of bug for any device whose files directory differs.
  try {
    await runtime.loadModel(availability.descriptor.filePath);
  } catch (err) {
    return {
      providerHealth: initialHealth,
      loadAttempted: true,
      unavailableReason: err instanceof Error ? err.message : 'Failed to load the local model.',
    };
  }

  // Re-check through the SAME cross-checked health read, never a direct re-read of getStatus()
  // alone — this is what prevents "load call returned without throwing" from ever being confused
  // with "a real model is genuinely usable".
  const finalHealth = await getAndroidLocalLlamaHealth(runtime);
  return {
    providerHealth: finalHealth,
    loadAttempted: true,
    unavailableReason: finalHealth === 'model_ready' ? undefined : 'The model finished loading but the runtime did not report it as ready.',
  };
}
