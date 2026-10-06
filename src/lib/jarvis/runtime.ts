// JARVIS Phase 11 — application runtime composition layer.
//
// The missing production wiring between the application (CommandCentre.tsx, or any future
// caller) and the already-existing JARVIS architecture. This file adds NO new orchestration
// logic, NO new routing logic, and NO new provider logic of its own — it is pure COMPOSITION of
// Phases 1-10's existing modules, in this order:
//
//   runJarvisRequest(context, query)
//     -> handleJarvisRequest()          (Phase 1 orchestrator.ts — deterministic, authoritative,
//                                         UNCHANGED, never bypassed)
//     -> resolveJarvisRoute()/           (Phase 6 routingPolicy.ts — decides whether this request
//        resolveEffectiveRoute()          even needs AI, and whether a known provider is ready)
//     -> createNativeLlamaRuntime()      (Phase 10 nativeLlamaRuntime.ts, wrapping the Phase 10
//        + createAndroidLocalLlamaProvider()  Capacitor plugin — the ONLY provider composed in
//                                         this phase)
//     -> honest deterministic fallback   (whenever AI isn't needed, isn't available, or isn't
//                                         ready — NEVER a fabricated "AI answered this")
//
// handleJarvisRequest() itself is never rewritten into an AI function (it stays exactly as Phase
// 1 left it), and this file never computes a deterministic application fact itself — every such
// fact still comes from handleJarvisRequest()'s own JarvisResponse.
//
// IMPORTANT — honesty guarantee this file exists to enforce: nothing here ever calls the native
// Android provider's own `loadModel()` — Phase 10's own stub only reports `'ready'` once a model
// has actually been loaded, and loading one automatically is explicitly out of scope for this
// phase (see this phase's own brief, point 7). That means the live health check below will always
// report 'available' (reachable, not ready), never 'model_ready', today.
//
// Phase 11.1 fix (see this phase's own report for the full root-cause writeup): an EARLIER version
// of this file used routingPolicy.ts's own resolveEffectiveRoute() result to decide whether to
// even ATTEMPT calling the provider — but resolveEffectiveRoute() only clears its
// 'ai_unavailable' gate once health is exactly 'model_ready'. Since this file never loads a model,
// that made the Android branch permanently unreachable in practice: every single request returned
// before ever calling provider.complete() (and therefore before nativeComplete() ever ran),
// regardless of query, defeating Phase 10's own stated purpose of having a bridge users could
// actually exercise. The fix below separates two different questions that resolveEffectiveRoute()
// conflates for THIS purpose:
//   1. "Is the native bridge reachable at all?" (`providerHealth` is anything other than
//      'unavailable'/'error') — if so, this file DOES call provider.complete(), genuinely
//      reaching NativeLlamaRuntime -> the Capacitor plugin -> nativeComplete() in C++.
//   2. "Did a REAL model actually answer?" — still exactly `providerHealth === 'model_ready'`,
//      exactly as honest as before. When the bridge answered WITHOUT a loaded model (true today,
//      always, since nothing loads one), the result's `provenance.source` is the distinct
//      `'android_native_stub'` value, NEVER `'android_local_ai'` — this is what satisfies "do not
//      fake an AI-ready status": the health value itself is never altered, only whether this file
//      attempts the call changes, and the result is labelled for exactly what produced it.
// routingPolicy.ts itself is NOT modified — resolveEffectiveRoute() is still called and its
// degradedReason is still used for the genuinely-unavailable case; only this file's own use of its
// result changes.
import { handleJarvisRequest } from './orchestrator';
import { resolveJarvisRoute, resolveEffectiveRoute, type JarvisRouteDecision } from './routingPolicy';
import type { JarvisContext, JarvisResponse } from './types';
import type { JarvisAiProviderHealthStatus } from './ai/providerMetadata';
import { JarvisAiProviderError } from './ai/provider';
import { textMessage } from './ai/types';
import { createAndroidLocalLlamaProvider, getAndroidLocalLlamaHealth } from './ai/android/androidLocalLlamaProvider';
import { createNativeLlamaRuntime } from './ai/android/nativeLlamaRuntime';
// A direct, real import — not merely re-exported through index.ts — so a bundler has an actual
// reachable dependency edge from this file to the Capacitor bridge (this phase's own brief, point
// 5) once this module itself is imported from the application (CommandCentre.tsx).
import LocalLlamaRuntime, { isLocalLlamaRuntimeAvailable } from './ai/android/localLlamaCapacitorPlugin';

/** Where a runJarvisRequest() result actually came from — never left implicit. `'deterministic'`
 * covers BOTH "the orchestrator fully answered this itself" and "AI wasn't attempted because no
 * provider is available/ready" in the sense that the returned text is always
 * handleJarvisRequest()'s own honest text in both cases; `source`/`degraded`/`degradedReason`
 * together say WHY, for a caller/UI that wants to distinguish them. `'android_native_stub'` is
 * distinct from `'android_local_ai'`: both mean the native bridge genuinely answered (the Phase
 * 10 call chain really ran), but only `'android_local_ai'` means a real, loaded model produced
 * that text — `'android_native_stub'` means Phase 10's own deterministic bridge-validation stub
 * did, which is never presented as if it were a real AI answer. */
export type JarvisRuntimeProvenanceSource = 'deterministic' | 'android_local_ai' | 'android_native_stub' | 'no_provider_available';

export interface JarvisRuntimeProvenance {
  source: JarvisRuntimeProvenanceSource;
  /** Set only when an AI provider was actually consulted (ready or not). */
  providerId?: string;
  providerHealth?: JarvisAiProviderHealthStatus;
  routeTarget?: JarvisRouteDecision['target'];
  /** True whenever this request wanted more than the deterministic orchestrator could give it,
   * but no ready provider could supply the rest — mirrors routingPolicy.ts's own
   * DegradedRouteDecision.degraded, carried through rather than re-derived. */
  degraded: boolean;
  degradedReason?: string;
}

export interface JarvisRuntimeResult {
  /** Phase 1's own, unmodified response shape — always the real orchestrator output, even when
   * `provenance.source === 'android_local_ai'` has since replaced `responseText` with the
   * provider's own real completion text. */
  response: JarvisResponse;
  provenance: JarvisRuntimeProvenance;
}

export interface RunJarvisRequestInput {
  context: JarvisContext;
  query: string;
  /** Mirrors resolveJarvisRoute's own input — never defaulted to true automatically; omitted means
   * "no web research requested", exactly like calling resolveJarvisRoute directly would. */
  webResearchExplicitlyRequested?: boolean;
  hasDocumentContext?: boolean;
}

function deterministicResult(response: JarvisResponse, extra: Omit<JarvisRuntimeProvenance, 'source' | 'degraded'> & { degraded?: boolean } = {}): JarvisRuntimeResult {
  return { response, provenance: { source: 'deterministic', degraded: false, ...extra } };
}

function unavailableResult(response: JarvisResponse, routeTarget: JarvisRouteDecision['target'], reason: string, providerHealth?: JarvisAiProviderHealthStatus): JarvisRuntimeResult {
  return { response, provenance: { source: 'no_provider_available', routeTarget, degraded: true, degradedReason: reason, providerHealth } };
}

/**
 * The single application-facing JARVIS entry point this phase adds. Always calls
 * handleJarvisRequest() first and returns ITS response untouched unless an AI provider is
 * actually consulted and actually answers — see this file's own header for why that currently
 * never happens in practice (no automatic model load), which is intentional, not a limitation to
 * work around.
 */
export async function runJarvisRequest(input: RunJarvisRequestInput): Promise<JarvisRuntimeResult> {
  const response = handleJarvisRequest(input.context, input.query);

  // The deterministic orchestrator already fully answered this — never consult a provider when
  // it didn't ask for more (mirrors routingPolicy.ts's own "a deterministic answer always wins").
  if (!response.requiresFurtherProcessing) {
    return deterministicResult(response);
  }

  const routeDecision = resolveJarvisRoute({
    intent: response.intent,
    workspace: input.context.workspace,
    hasDocumentContext: input.hasDocumentContext ?? false,
    webResearchExplicitlyRequested: input.webResearchExplicitlyRequested ?? false,
  });

  if (routeDecision.target === 'deterministic_tool') {
    return deterministicResult(response, { routeTarget: routeDecision.target });
  }

  // Only the Android on-device provider is composed in this phase (this phase's own brief, point
  // 4) — a Windows/Ollama (Phase 8) or free-cloud (Phase 6/8.5) path is future-phase composition
  // work, not this one. Every other AI-requiring route target (including an explicit web-research
  // request) is honestly reported as unavailable today, never silently answered by a provider
  // this phase never wired up.
  if (!isLocalLlamaRuntimeAvailable) {
    return unavailableResult(response, routeDecision.target, 'No AI provider is available on this platform — only deterministic application intelligence can answer this request.');
  }

  const runtime = createNativeLlamaRuntime(LocalLlamaRuntime);
  const providerHealth = await getAndroidLocalLlamaHealth(runtime);
  // Still computed and still used for its degradedReason text below — routingPolicy.ts itself is
  // unmodified. What changed is that this file no longer treats effectiveRoute's own
  // 'ai_unavailable' gate (which requires exactly 'model_ready') as the condition for whether to
  // ATTEMPT calling the provider — see this file's own header for the root-cause writeup.
  const effectiveRoute = resolveEffectiveRoute(routeDecision, providerHealth);

  const provider = createAndroidLocalLlamaProvider(runtime, { model: 'android-local-stub' });

  // The bridge itself is reachable whenever health is anything other than 'unavailable'/'error' —
  // 'available' (reachable, no model loaded yet) and 'model_ready' both qualify. This is the
  // Phase 11.1 fix: previously only 'model_ready' qualified, which this file can never produce on
  // its own (it never calls loadModel()), so the provider was never actually invoked by any real
  // request. Whether a model is actually loaded still only ever comes from `providerHealth`
  // itself — never overridden or guessed here.
  const bridgeReachable = providerHealth !== 'unavailable' && providerHealth !== 'error';

  if (!bridgeReachable) {
    return unavailableResult(
      response,
      routeDecision.target,
      effectiveRoute.degradedReason ?? `The Android local AI runtime is not available (status: ${providerHealth}).`,
      providerHealth,
    );
  }

  try {
    const aiResponse = await provider.complete({ messages: [textMessage('user', input.query)] });
    // NEVER claim a real AI answer unless providerHealth itself genuinely reports model_ready —
    // this is "do not fake an AI-ready status" enforced at the one place that matters: the label
    // attached to the result, not the health value, which is never altered.
    const isRealModel = providerHealth === 'model_ready';
    return {
      response: { ...response, responseText: aiResponse.text, requiresFurtherProcessing: false },
      provenance: {
        source: isRealModel ? 'android_local_ai' : 'android_native_stub',
        providerId: provider.id,
        providerHealth,
        routeTarget: routeDecision.target,
        degraded: !isRealModel,
        degradedReason: isRealModel ? undefined : 'Answered by the Phase 10 native bridge-validation stub — no real AI model is loaded yet.',
      },
    };
  } catch (err) {
    const message = err instanceof JarvisAiProviderError ? err.jarvisError.message : 'The Android local AI provider failed to respond.';
    return unavailableResult(response, routeDecision.target, message, providerHealth);
  }
}
