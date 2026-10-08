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
// IMPORTANT — honesty guarantee this file exists to enforce: `providerHealth` below is NEVER
// upgraded to 'model_ready' by this file itself — it always comes from a genuine, fresh
// getAndroidLocalLlamaHealth() read (by way of Phase 13C's own bootstrap boundary, see next
// paragraph). Before Phase 13C, nothing anywhere ever called the native runtime's own
// `loadModel()`, so that read could only ever report 'available' (bridge reachable, no model
// loaded) — never 'model_ready' — even with a real GGUF file sitting on-device. Phase 13C closes
// that gap; this file still never fabricates readiness on its own.
//
// Phase 13C addition (see ai/android/localLlamaBootstrap.ts's own header for the full
// architecture): before deciding `providerHealth`, this file now calls
// `ensureAndroidLocalLlamaModelReady(runtime, modelBackend)`, which — ONLY when a model isn't
// already loaded and reported ready — discovers whatever on-device GGUF model Phase 13B's own
// `createAndroidLocalLlmModelBackend` genuinely reports, and loads exactly that one. It never
// invents a model id, never bundles/downloads a model, and never treats a successful load() call
// as readiness on its own — it always re-reads health afterward through the SAME cross-checked
// getAndroidLocalLlamaHealth() helper. `providerHealth` is that function's own returned, truthful
// result, used exactly as it already was by everything below.
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
import { createAndroidLocalLlamaProvider } from './ai/android/androidLocalLlamaProvider';
import { createNativeLlamaRuntime } from './ai/android/nativeLlamaRuntime';
// Phase 13C — the automatic local-model bootstrap boundary (see localLlamaBootstrap.ts's own
// header for the exact gap this closes: nothing ever called loadModel() before this phase, so a
// genuinely present Qwen3 GGUF file was never discovered or loaded). createAndroidLocalLlmModelBackend
// is Phase 13B's own real model-discovery connector — reused here verbatim, never reimplemented.
import { ensureAndroidLocalLlamaModelReady } from './ai/android/localLlamaBootstrap';
import { createAndroidLocalLlmModelBackend } from './ai/android/androidLocalLlmModelBackend';
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
  // Phase 13C — ensures a genuinely available on-device GGUF model is actually LOADED before
  // this file decides anything about readiness. Previously `providerHealth` came straight from
  // getAndroidLocalLlamaHealth() and could only ever report 'available' (never 'model_ready')
  // since nothing ever called loadModel() — see this file's OWN now-outdated header comment above,
  // which described exactly that limitation; this is the fix. The bootstrap itself never fakes
  // readiness: `providerHealth` below is always its own fresh, cross-checked health re-read.
  const bootstrap = await ensureAndroidLocalLlamaModelReady(runtime, createAndroidLocalLlmModelBackend(LocalLlamaRuntime));
  const providerHealth = bootstrap.providerHealth;
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
      bootstrap.unavailableReason ?? effectiveRoute.degradedReason ?? `The Android local AI runtime is not available (status: ${providerHealth}).`,
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

// ================================================================================================
// Phase 14 — streaming sibling for a real JARVIS chat UI
// ================================================================================================
//
// Additive only: `runJarvisRequest` above is untouched, byte-for-byte, and every existing test
// against it keeps passing unmodified. `streamJarvisRequest` reuses the SAME private helpers
// (`groundDeterministicToolResponse`, `deterministicResult`, `unavailableResult`) rather than
// duplicating their logic — only the top-level control flow is mirrored, and only because an
// async generator can't share a single return path with a plain async function. The deterministic
// and tool-grounded paths below are NEVER actually "streamed" (there is nothing to stream — the
// orchestrator/Decision Engine already produced a complete, instant answer) — they yield exactly
// one `result` event, same text a caller would get from `runJarvisRequest`. Real, incremental
// `textDelta` events are only ever emitted on the genuine AI path, by forwarding the EXISTING
// `provider.stream()` (Phase 10, unmodified) — never a fabricated/split-up fake stream over an
// already-complete string.
export interface JarvisStreamDelta {
  /** One incremental chunk of real model output — present only on the AI path, only while
   * generation is genuinely in progress. */
  textDelta?: string;
  /** The final, complete result — present on exactly one event, always the last one this
   * generator yields. Same shape `runJarvisRequest` returns, so a caller can treat
   * `streamJarvisRequest` as "the same request, with optional incremental progress". */
  result?: JarvisRuntimeResult;
}

/**
 * Streaming counterpart to `runJarvisRequest`. `signal` (optional) cancels a genuinely in-flight
 * AI generation by forwarding to the EXISTING `provider.stream()`'s own AbortSignal support
 * (Phase 10) — never a new cancellation mechanism. Cancelling a deterministic/tool-grounded
 * request does nothing (there is no in-flight call to cancel; it already resolved instantly).
 */
export async function* streamJarvisRequest(input: RunJarvisRequestInput, signal?: AbortSignal): AsyncGenerator<JarvisStreamDelta> {
  const response = handleJarvisRequest(input.context, input.query);

  if (!response.requiresFurtherProcessing) {
    yield { result: deterministicResult(response) };
    return;
  }

  const routeDecision = resolveJarvisRoute({
    intent: response.intent,
    workspace: input.context.workspace,
    hasDocumentContext: input.hasDocumentContext ?? false,
    webResearchExplicitlyRequested: input.webResearchExplicitlyRequested ?? false,
  });

  if (routeDecision.target === 'deterministic_tool') {
    const groundedText = await groundDeterministicToolResponse(response, input);
    const result =
      groundedText === null
        ? deterministicResult(response, { routeTarget: routeDecision.target })
        : deterministicResult({ ...response, responseText: groundedText, requiresFurtherProcessing: false }, { routeTarget: routeDecision.target });
    yield { result };
    return;
  }

  if (!isLocalLlamaRuntimeAvailable) {
    yield { result: unavailableResult(response, routeDecision.target, 'No AI provider is available on this platform — only deterministic application intelligence can answer this request.') };
    return;
  }

  const runtime = createNativeLlamaRuntime(LocalLlamaRuntime);
  // Phase 13C — the SAME bootstrap boundary runJarvisRequest uses above; deliberately not a
  // second, divergent model-loading implementation for the streaming path (this phase's own
  // brief, "Streaming" section).
  const bootstrap = await ensureAndroidLocalLlamaModelReady(runtime, createAndroidLocalLlmModelBackend(LocalLlamaRuntime));
  const providerHealth = bootstrap.providerHealth;
  const effectiveRoute = resolveEffectiveRoute(routeDecision, providerHealth);
  const provider = createAndroidLocalLlamaProvider(runtime, { model: 'android-local-stub' });
  const bridgeReachable = providerHealth !== 'unavailable' && providerHealth !== 'error';

  if (!bridgeReachable) {
    yield {
      result: unavailableResult(
        response,
        routeDecision.target,
        bootstrap.unavailableReason ?? effectiveRoute.degradedReason ?? `The Android local AI runtime is not available (status: ${providerHealth}).`,
        providerHealth,
      ),
    };
    return;
  }

  const isRealModel = providerHealth === 'model_ready';
  let fullText = '';

  // `stream` is optional on JarvisAiProvider (ai/provider.ts: "present only when
  // capabilities.streaming is true... a provider that can't really stream simply omits this
  // method") — createAndroidLocalLlamaProvider always implements it today, but this falls back to
  // a single non-streaming complete() call rather than asserting, honoring that contract for any
  // future provider composed here that doesn't.
  if (!provider.stream) {
    try {
      const aiResponse = await provider.complete({ messages: [textMessage('user', input.query)], signal });
      yield {
        result: {
          response: { ...response, responseText: aiResponse.text, requiresFurtherProcessing: false },
          provenance: {
            source: isRealModel ? 'android_local_ai' : 'android_native_stub',
            providerId: provider.id,
            providerHealth,
            routeTarget: routeDecision.target,
            degraded: !isRealModel,
            degradedReason: isRealModel ? undefined : 'Answered by the Phase 10 native bridge-validation stub — no real AI model is loaded yet.',
          },
        },
      };
    } catch (err) {
      const message = err instanceof JarvisAiProviderError ? err.jarvisError.message : 'The Android local AI provider failed to respond.';
      yield { result: unavailableResult(response, routeDecision.target, message, providerHealth) };
    }
    return;
  }

  try {
    for await (const event of provider.stream({ messages: [textMessage('user', input.query)], signal })) {
      if (event.type === 'text_delta') {
        fullText += event.delta;
        yield { textDelta: event.delta };
      } else if (event.type === 'response_completed') {
        // The provider's own final text (same field androidLocalLlamaProvider.ts always fills in)
        // — falling back to the locally-accumulated deltas, and finally (Phase 13E) to the
        // already-computed deterministic response.responseText, if a provider ever left both
        // empty. Never silently emits an empty string to the UI: a provider that genuinely
        // produced no output still gets handleJarvisRequest()'s own honest text rather than
        // nothing at all (see this file's own report on the physical-device "EMPTY" symptom).
        const finalText = event.response.text || fullText || response.responseText;
        yield {
          result: {
            response: { ...response, responseText: finalText, requiresFurtherProcessing: false },
            provenance: {
              source: isRealModel ? 'android_local_ai' : 'android_native_stub',
              providerId: provider.id,
              providerHealth,
              routeTarget: routeDecision.target,
              degraded: !isRealModel,
              degradedReason: isRealModel ? undefined : 'Answered by the Phase 10 native bridge-validation stub — no real AI model is loaded yet.',
            },
          },
        };
        return;
      } else if (event.type === 'error') {
        yield { result: unavailableResult(response, routeDecision.target, event.error.message, providerHealth) };
        return;
      }
    }
    // The stream ended without a terminal event (should not happen with a well-behaved provider,
    // but never leave the caller hanging with no result at all).
    yield { result: unavailableResult(response, routeDecision.target, 'The Android local AI provider ended its response unexpectedly.', providerHealth) };
  } catch (err) {
    const message = err instanceof JarvisAiProviderError ? err.jarvisError.message : 'The Android local AI provider failed to respond.';
    yield { result: unavailableResult(response, routeDecision.target, message, providerHealth) };
  }
}
