// JARVIS Phase 8.5 — cross-device local AI capability & routing (Parts 3, 4, 5, 7, 8).
//
// EXTENDS the existing Phase 6 routing abstraction (routingPolicy.ts) — that file is NOT
// modified. resolveJarvisRoute()/resolveEffectiveRoute() still decide WHICH KIND of capability
// should answer a request (deterministic tool vs. local AI vs. web retrieval, with the existing
// AI-health degradation rule). This file adds a layer ONLY for the AI-requiring routes: WHICH
// device/runtime should actually serve the request, given a known fleet of candidate
// devices/models — selectCrossDeviceTarget() below NEVER overrides a 'deterministic_tool'
// decision, and never turns an AI-requiring route into a paid one.
//
// Part 8 (Android safety): ANDROID_ON_DEVICE here is a REPRESENTATION/label only — a target this
// decision function can name, for a future adapter to implement. No Android inference runtime is
// installed, called, or even referenced beyond this string literal anywhere in this phase.
//
// Part 5 (cross-device strategy): this function does not perform real networked/remote inference
// across physical devices — it DECIDES, from a caller-supplied list of known candidate
// device+model combinations (e.g. "this phone" and, separately, "the user's known Windows PC"),
// which one is the right conceptual target for a given task. Actually dispatching a request to a
// device other than the one running this code is explicitly NOT implemented here; disclosed
// honestly as future work in this phase's own final report.
import type { JarvisRouteDecision } from '../routingPolicy';
import type { JarvisDeviceCapabilities } from './deviceCapabilities';
import { evaluateDeviceModelFit, type JarvisModelProfile } from './modelProfile';
import type { JarvisDocumentTaskRequirement } from './documentTaskRequirements';

/** Part 5's own four logical targets, plus the one outcome this file needs beyond them: no
 * candidate fits and no fallback applies. */
export type JarvisCrossDeviceTarget = 'DETERMINISTIC' | 'WINDOWS_LOCAL' | 'ANDROID_ON_DEVICE' | 'FREE_CLOUD' | 'UNAVAILABLE';

export interface JarvisCrossDeviceCandidate {
  /** Which logical target this candidate represents — the caller decides this from the device's
   * own platform, never guessed by this file from incomplete data. */
  target: 'WINDOWS_LOCAL' | 'ANDROID_ON_DEVICE';
  device: JarvisDeviceCapabilities;
  /** Models actually confirmed available to this exact candidate (e.g. a real Ollama /api/tags
   * listing for a Windows target) — never a catalogue of models that merely exist in the abstract. */
  models: readonly JarvisModelProfile[];
}

export interface SelectCrossDeviceTargetInput {
  /** Phase 6's own, unmodified routing decision — this function never recomputes it. */
  routeDecision: JarvisRouteDecision;
  /** Omitted for a non-document AI request (e.g. "Explain Article 32.") — only document
   * operations (Part 6) carry one. */
  taskRequirement?: JarvisDocumentTaskRequirement;
  /** Caller-supplied fleet, in PREFERENCE order (the first sufficient candidate wins) — this file
   * never invents a fleet or a preference order of its own. */
  candidates: readonly JarvisCrossDeviceCandidate[];
  isOnline: boolean;
  /** True only once the user has explicitly opted into free cloud AI — never defaulted to true. */
  cloudOptIn: boolean;
}

export interface JarvisCrossDeviceDecision {
  target: JarvisCrossDeviceTarget;
  reason: string;
  degraded: boolean;
}

const RESOURCE_CLASS_ORDER: Readonly<Record<string, number>> = { tiny: 0, small: 1, medium: 2, large: 3 };

/**
 * Combines a model's real device-fit (modelProfile.ts) with a document task's own requirement
 * (documentTaskRequirements.ts), when one applies. Never collapses an `'unknown'` determination
 * into `'sufficient'` — a candidate this function cannot confirm fits is treated exactly like one
 * confirmed insufficient for SELECTION purposes (never auto-selected), even though the two remain
 * distinguishable in a caller's own diagnostics via evaluateDeviceModelFit directly.
 */
function isCandidateSufficient(candidate: JarvisCrossDeviceCandidate, model: JarvisModelProfile, requirement: JarvisDocumentTaskRequirement | undefined): boolean {
  if (evaluateDeviceModelFit(candidate.device, model) !== 'sufficient') return false;
  if (!requirement) return true;

  if (model.contextCapacityTokens === undefined || model.contextCapacityTokens < requirement.minContextCapacityTokens) return false;

  if (model.estimatedResourceClass === undefined || model.estimatedResourceClass === 'unknown') return false;
  if (RESOURCE_CLASS_ORDER[model.estimatedResourceClass] < RESOURCE_CLASS_ORDER[requirement.minimumLocalCapability]) return false;

  return true;
}

function findSufficientModel(candidate: JarvisCrossDeviceCandidate, requirement: JarvisDocumentTaskRequirement | undefined): JarvisModelProfile | undefined {
  return candidate.models.find((model) => isCandidateSufficient(candidate, model, requirement));
}

const AI_REQUIRING_LOCAL_TARGETS: ReadonlySet<JarvisRouteDecision['target']> = new Set(['local_ai', 'document_retrieval_local_ai', 'deterministic_context_ai_planning']);

/**
 * Part 3's deterministic capability-aware selection layer. Precedence, fixed and documented:
 *   1. a 'deterministic_tool' route is ALWAYS answered deterministically — never routed to any
 *      device/model, regardless of fleet or connectivity (mirrors routingPolicy.ts's own rule).
 *   2. an explicit 'web_retrieval_ai' route goes to FREE_CLOUD only while online AND opted in;
 *      otherwise UNAVAILABLE — never silently downgraded to a local candidate it did not ask for.
 *   3. every other AI-requiring route tries each candidate in the caller's own preference order,
 *      selecting the first one whose model genuinely fits (device fit AND, when given, the task's
 *      own requirement) — never the biggest/fanciest available model, just the first sufficient one.
 *   4. only once no candidate fits does this function fall back to FREE_CLOUD (online + opted in);
 *      otherwise UNAVAILABLE, with `degraded: true` and a plain-language reason.
 * A paid provider is never a possible return value of this function at all — Part 4's own rule
 * ("never silently select a paid provider") is enforced by this file simply having no code path
 * that can produce one, not by a runtime check that could be bypassed.
 */
export function selectCrossDeviceTarget(input: SelectCrossDeviceTargetInput): JarvisCrossDeviceDecision {
  if (input.routeDecision.target === 'deterministic_tool') {
    return { target: 'DETERMINISTIC', reason: 'Deterministic application intelligence answers this exactly; no AI device/model selection is needed.', degraded: false };
  }

  if (input.routeDecision.target === 'web_retrieval_ai') {
    if (!input.isOnline) return { target: 'UNAVAILABLE', reason: 'Web retrieval requires an online connection, which is not currently available.', degraded: true };
    if (!input.cloudOptIn) return { target: 'UNAVAILABLE', reason: 'Web retrieval AI requires explicit free-cloud opt-in, which has not been given.', degraded: true };
    return { target: 'FREE_CLOUD', reason: 'Explicit web research request, routed to opted-in free cloud AI.', degraded: false };
  }

  if (AI_REQUIRING_LOCAL_TARGETS.has(input.routeDecision.target)) {
    for (const candidate of input.candidates) {
      const model = findSufficientModel(candidate, input.taskRequirement);
      if (model) {
        return { target: candidate.target, reason: `Local model "${model.displayName}" on the ${candidate.target} target meets this task's requirements.`, degraded: false };
      }
    }

    if (input.isOnline && input.cloudOptIn) {
      return { target: 'FREE_CLOUD', reason: "No available local device/model meets this task's requirements; falling back to opted-in free cloud AI.", degraded: false };
    }

    return { target: 'UNAVAILABLE', reason: "No available local device/model meets this task's requirements, and free cloud AI is unavailable or not opted in.", degraded: true };
  }

  // Exhaustive over JarvisRouteTarget's current members — a future new route target this file
  // has not been updated for falls back to the same honest UNAVAILABLE, never a silent guess.
  return { target: 'UNAVAILABLE', reason: `No cross-device selection rule exists yet for route target "${input.routeDecision.target}".`, degraded: true };
}
