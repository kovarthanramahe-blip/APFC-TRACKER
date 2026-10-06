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
// Phase 11.4 — wires the EXISTING Phase 1 tool registry (toolRegistry.ts) and Phase 2 application
// tools (applicationTools.ts) into this file, through the EXISTING Phase 3 context engine
// (contextEngine.ts). No new tool, registry, or orchestration logic is introduced — see
// groundDeterministicToolResponse below for the one, narrow integration point this adds.
import { createToolRegistry, type JarvisToolRegistry } from './toolRegistry';
import { createApplicationTools, type UpscStudyStateData } from './applicationTools';
import { buildJarvisContext, type JarvisContextToolInputs, type JarvisContextSections } from './contextEngine';
// Phase 12 — the deterministic decision/recommendation layer on top of the above (see
// decisionEngine.ts's own header for the full priority-model trace). No new tool, no new
// registry, no AI/network call — this file still only composes.
import { decideStudyNext, type DecideStudyNextInput } from './decisionEngine';
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
  /** Phase 2 tool inputs for whichever tools are relevant to this request's (workspace, intent) —
   * see contextEngine.ts's own resolveRelevantToolIds. Omitted entirely (the default) is
   * architecturally identical to "no relevant tool exists": the deterministic orchestrator's own
   * response is returned untouched, exactly as this file behaved before this phase. Never
   * required, never defaulted/guessed by this file — a caller (e.g. CommandCentre.tsx's AskJarvis)
   * builds this from application state it already has, same as it already does for
   * generateUpNextItems. */
  toolInputs?: JarvisContextToolInputs;
  /** Overrides this file's own default Phase 2 tool registry (see defaultToolRegistry below). Real
   * callers never need this; it exists so tests can prove behaviour against an empty registry or a
   * deliberately failing tool without touching the default registration this file owns. */
  registry?: JarvisToolRegistry;
}

/** The Phase 2 application tools, registered once into a Phase 1 registry this file owns by
 * default — the smallest correct integration point for "register the existing application tools
 * with the existing tool registry": no new tool is created, toolRegistry.ts and applicationTools.ts
 * are both used exactly as they already existed, and registration can never silently fail (these
 * five fixed ids are unique by construction — see applicationTools.ts's own createApplicationTools).
 */
function createDefaultJarvisToolRegistry(): JarvisToolRegistry {
  const registry = createToolRegistry();
  for (const tool of createApplicationTools()) {
    registry.register(tool);
  }
  return registry;
}

const defaultToolRegistry = createDefaultJarvisToolRegistry();

function deterministicResult(response: JarvisResponse, extra: Omit<JarvisRuntimeProvenance, 'source' | 'degraded'> & { degraded?: boolean } = {}): JarvisRuntimeResult {
  return { response, provenance: { source: 'deterministic', degraded: false, ...extra } };
}

function unavailableResult(response: JarvisResponse, routeTarget: JarvisRouteDecision['target'], reason: string, providerHealth?: JarvisAiProviderHealthStatus): JarvisRuntimeResult {
  return { response, provenance: { source: 'no_provider_available', routeTarget, degraded: true, degradedReason: reason, providerHealth } };
}

// ================================================================================================
// Phase 11.4 — grounding a 'deterministic_tool' route in the real Phase 2/3 tools
// ================================================================================================
//
// resolveJarvisRoute() already sends every 'study_next' intent to 'deterministic_tool' (see
// routingPolicy.ts) — that target existed since Phase 6, but nothing in this file ever actually ran
// a tool for it: it only re-returned handleJarvisRequest()'s own canned acknowledgement text. This
// is the one, narrow addition that does: whenever a caller supplies `toolInputs`, it asks the
// EXISTING Phase 3 context engine (buildJarvisContext) to run the EXISTING Phase 2 tools relevant to
// `intent`/`workspace`, and — only if that produced a real, grounded study/research section —
// replaces the canned text with a short summary of that section. 'study_next' is the only intent
// this handles because it is the only intent resolveJarvisRoute() ever maps to 'deterministic_tool'
// today; a future intent added there is simply not grounded here yet, same as if toolInputs were
// omitted.
const STUDY_NEXT_MODE = 'study';

/** True only when a real, workspace-specific study/research section came back — `workspace` alone
 * (always attempted; see contextEngine.ts's ALWAYS_RELEVANT) says which workspace is active, not
 * anything about what is due to study, so it never counts on its own. */
function hasGroundedStudySection(sections: JarvisContextSections): boolean {
  return Boolean(sections.apfcStudy || sections.upscStudy || sections.phdResearch);
}

/** Composes a short, human-readable summary strictly from already-computed section fields — never
 * a new calculation, never a number not already present on `sections` (the data-integrity rule
 * applicationTools.ts's own header states, carried through here). */
function describeGroundedStudyState(sections: JarvisContextSections): string {
  const parts: string[] = [];

  if (sections.apfcStudy) {
    const s = sections.apfcStudy;
    const accuracy = s.lowestWeakTopicAccuracyPct !== null ? ` (lowest recent accuracy ${s.lowestWeakTopicAccuracyPct}%)` : '';
    parts.push(`${s.dueRevisionCount} PYQ${s.dueRevisionCount === 1 ? '' : 's'} due for revision and ${s.weakTopicCount} weak topic${s.weakTopicCount === 1 ? '' : 's'}${accuracy}`);
  }
  if (sections.upscStudy) {
    const s = sections.upscStudy;
    const currentAffairs = s.currentAffairsDueCount > 0 ? `, including ${s.currentAffairsDueCount} Current Affairs item${s.currentAffairsDueCount === 1 ? '' : 's'} due for revision` : '';
    parts.push(`${s.todaysStudyItemCount} Today's Study item${s.todaysStudyItemCount === 1 ? '' : 's'}${currentAffairs}`);
  }
  if (sections.phdResearch) {
    const s = sections.phdResearch;
    const overdue = s.mostOverdueDays !== null ? ` (up to ${s.mostOverdueDays} day${s.mostOverdueDays === 1 ? '' : 's'} overdue)` : '';
    parts.push(
      `${s.overdueMicroTargetCount} overdue micro-target${s.overdueMicroTargetCount === 1 ? '' : 's'}${overdue}, ${s.researchDocumentsToContinueCount} research document${s.researchDocumentsToContinueCount === 1 ? '' : 's'} and ${s.bibliographyToContinueCount} bibliography item${s.bibliographyToContinueCount === 1 ? '' : 's'} still to continue`,
    );
  }

  return `Based on your actual study state: ${parts.join('; ')}.`;
}

/**
 * Phase 12 — recovers the ONE existing Phase 2 tool output that carries item-level candidates
 * (upsc.study_state's own `items`, straight from generateTodaysStudyItems) so the decision engine
 * can select and explain a SPECIFIC candidate, not just a count. contextEngine.ts's own
 * JarvisUpscStudySection deliberately compresses `items` down to a bare count (see its own header:
 * "a COUNT, not the item list itself") for its existing, unrelated callers — this does not widen
 * that contract; it simply runs the SAME already-registered tool, through the SAME registry, a
 * second time, to read the one field that compression already discarded. upsc.study_state is a
 * pure, side-effect-free read (see applicationTools.ts's own header), so recomputing it is cheap
 * and never duplicates its own underlying calculation (still owned solely by
 * lib/upscCseTodaysStudy.ts). Returns `undefined` on any failure — the caller falls back to a
 * count-only decision exactly as if this workspace's tool had no item list at all.
 */
async function fetchUpscItemsForDecision(input: RunJarvisRequestInput, registry: JarvisToolRegistry): Promise<DecideStudyNextInput['upscItems']> {
  const toolInput = input.toolInputs?.['upsc.study_state'];
  if (!toolInput) return undefined;
  const tool = registry.get('upsc.study_state');
  if (!tool) return undefined;
  try {
    const result = await tool.run(toolInput, { workspace: input.context.workspace, timestamp: input.context.timestamp, route: input.context.route });
    if (result.status !== 'ok') return undefined;
    return (result.data as UpscStudyStateData).items;
  } catch {
    return undefined;
  }
}

/**
 * Attempts to ground a 'deterministic_tool'-routed response in the real Phase 2/3 tools AND (Phase
 * 12) the deterministic decision engine, returning `null` whenever grounding doesn't apply at all —
 * no toolInputs supplied, a non-study_next intent, every relevant tool unavailable/unregistered, or
 * every relevant tool failing — so the caller can fall back to the exact same canned deterministic
 * response this file has always returned in that case. Never throws: buildJarvisContext already
 * records each tool's own failure into `sources` rather than throwing (see contextEngine.ts), and
 * the try/catch below is only a last-resort guard against something it did not anticipate.
 */
async function groundDeterministicToolResponse(response: JarvisResponse, input: RunJarvisRequestInput): Promise<string | null> {
  if (response.intent !== 'study_next' || !input.toolInputs) {
    return null;
  }

  try {
    const registry = input.registry ?? defaultToolRegistry;
    const snapshot = await buildJarvisContext({
      workspace: input.context.workspace,
      mode: STUDY_NEXT_MODE,
      route: input.context.route,
      timestamp: input.context.timestamp,
      registry,
      toolInputs: input.toolInputs,
    });
    if (!hasGroundedStudySection(snapshot.sections)) {
      return null;
    }

    const upscItems = snapshot.sections.upscStudy ? await fetchUpscItemsForDecision(input, registry) : undefined;
    const decision = decideStudyNext({
      workspace: input.context.workspace,
      upscItems,
      apfcStudy: snapshot.sections.apfcStudy,
      phdResearch: snapshot.sections.phdResearch,
    });

    // The decision engine couldn't make a grounded recommendation (should only happen if the raw
    // upsc.study_state re-run above failed after the snapshot already confirmed a section exists)
    // — fall back to the existing, already-safe generic summary rather than an empty response.
    if (decision.kind === 'insufficient_data') {
      return describeGroundedStudyState(snapshot.sections);
    }

    return `${decision.recommendation} ${decision.rationale}`.trim();
  } catch {
    return null;
  }
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
    const groundedText = await groundDeterministicToolResponse(response, input);
    if (groundedText === null) {
      return deterministicResult(response, { routeTarget: routeDecision.target });
    }
    return deterministicResult({ ...response, responseText: groundedText, requiresFurtherProcessing: false }, { routeTarget: routeDecision.target });
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
