// JARVIS Phase 6 — deterministic routing policy.
//
// Decides WHICH KIND of capability should answer a request — never whether an AI call's output
// is correct, and never performs the AI call itself. Builds ON TOP of Phase 1's orchestrator.ts
// (resolveIntent/JarvisIntent) without modifying it: this file adds a further decision after an
// intent has already been resolved, choosing which of several possible capabilities should
// handle it, given the active workspace and whether document/web context applies.
//
// The one rule every route decision must honour (this phase's own brief, Part H): no AI call
// happens when deterministic application logic (a Phase 2 tool) can answer exactly. The
// 'deterministic_tool' target is therefore always preferred whenever an intent maps to one.
import type { JarvisIntent, JarvisWorkspace } from './types';
import type { JarvisAiProviderCostClass, JarvisAiProviderHealthStatus } from './ai/providerMetadata';

export type JarvisRouteTarget =
  | 'deterministic_tool'
  | 'local_ai'
  | 'document_retrieval_local_ai'
  | 'web_retrieval_ai'
  | 'deterministic_context_ai_planning';

export interface JarvisRouteDecision {
  target: JarvisRouteTarget;
  costClass: JarvisAiProviderCostClass;
  requiresDocumentRetrieval: boolean;
  requiresWebRetrieval: boolean;
}

// Fixed cost class per route — the ONLY place this mapping exists, so "the application must never
// silently start consuming a paid provider" (Part I) is a property of one table, verified once
// (see isRouteTableFreeByDefault below), rather than scattered assumptions across call sites.
const COST_CLASS_BY_ROUTE: Readonly<Record<JarvisRouteTarget, JarvisAiProviderCostClass>> = {
  deterministic_tool: 'FREE_DETERMINISTIC',
  local_ai: 'FREE_LOCAL',
  document_retrieval_local_ai: 'FREE_LOCAL',
  deterministic_context_ai_planning: 'FREE_LOCAL',
  web_retrieval_ai: 'FREE_CLOUD_OPTIONAL',
};

export interface ResolveJarvisRouteInput {
  /** Phase 1's own resolveIntent output — this function never recomputes intent itself. */
  intent: JarvisIntent;
  workspace: JarvisWorkspace;
  /** True when the request is explicitly about one or more already-uploaded documents. */
  hasDocumentContext: boolean;
  /** True only when the user explicitly asked for, or the owner has explicitly enabled, web
   * research — this function never turns it on by itself (Part E: web research only "when
   * explicitly requested or enabled"). */
  webResearchExplicitlyRequested: boolean;
}

/**
 * The deterministic route decision for one request — the same inputs always produce the same
 * decision. Worked examples straight from this phase's own brief:
 *   intent 'study_next'                                -> deterministic_tool
 *   webResearchExplicitlyRequested                      -> web_retrieval_ai
 *   hasDocumentContext (no explicit web request)        -> document_retrieval_local_ai
 *   intent 'action' (no document/web signal)            -> deterministic_context_ai_planning
 *   anything else (a plain "explain this concept" style question) -> local_ai
 *
 * Precedence is fixed and documented, not incidental: an explicit deterministic answer always
 * wins; after that, an explicit web request wins over document context (asking about current
 * affairs while a document happens to be open shouldn't silently search the document instead).
 */
export function resolveJarvisRoute(input: ResolveJarvisRouteInput): JarvisRouteDecision {
  let target: JarvisRouteTarget;

  if (input.intent === 'study_next') {
    target = 'deterministic_tool';
  } else if (input.webResearchExplicitlyRequested) {
    target = 'web_retrieval_ai';
  } else if (input.hasDocumentContext) {
    target = 'document_retrieval_local_ai';
  } else if (input.intent === 'action') {
    target = 'deterministic_context_ai_planning';
  } else {
    target = 'local_ai';
  }

  return {
    target,
    costClass: COST_CLASS_BY_ROUTE[target],
    requiresDocumentRetrieval: target === 'document_retrieval_local_ai',
    requiresWebRetrieval: target === 'web_retrieval_ai',
  };
}

/** Part I's invariant, enforced as code rather than left as a comment: no route in this table may
 * default to a paid provider. */
export function isRouteTableFreeByDefault(): boolean {
  return Object.values(COST_CLASS_BY_ROUTE).every((costClass) => costClass !== 'PAID_OPTIONAL');
}

// ================================================================================================
// Degraded / offline mode (Part J)
// ================================================================================================

export interface DegradedRouteDecision {
  /** The route actually usable right now. Never silently "nothing" — an AI-requiring route whose
   * provider isn't ready resolves to the explicit `'ai_unavailable'` value, never to the original
   * target as if nothing were wrong. */
  effectiveTarget: JarvisRouteTarget | 'ai_unavailable';
  degraded: boolean;
  degradedReason?: string;
}

const AI_REQUIRING_TARGETS: ReadonlySet<JarvisRouteTarget> = new Set([
  'local_ai',
  'document_retrieval_local_ai',
  'web_retrieval_ai',
  'deterministic_context_ai_planning',
]);

/**
 * Applies the owner's offline/degraded-mode rule: a `deterministic_tool` route is NEVER affected
 * by AI provider health — deterministic functions must keep working regardless (this phase's own
 * brief: "do not make 'AI unavailable' equivalent to 'APFC-TRACKER unavailable'"). An AI-requiring
 * route whose provider isn't ready (`aiProviderHealth` is whatever health status applies to the
 * provider that route would have used — local or cloud, the caller decides which to check and
 * pass in) falls back to the explicit `ai_unavailable` result, with `degraded: true` and a plain-
 * language reason a UI can surface directly, distinguishing "answered exactly as planned" from
 * "answered, but no AI played any part."
 */
export function resolveEffectiveRoute(decision: JarvisRouteDecision, aiProviderHealth: JarvisAiProviderHealthStatus): DegradedRouteDecision {
  if (!AI_REQUIRING_TARGETS.has(decision.target)) {
    return { effectiveTarget: decision.target, degraded: false };
  }
  if (aiProviderHealth === 'model_ready') {
    return { effectiveTarget: decision.target, degraded: false };
  }
  return {
    effectiveTarget: 'ai_unavailable',
    degraded: true,
    degradedReason: `AI inference is currently unavailable (${aiProviderHealth}). Deterministic application features remain fully usable.`,
  };
}
