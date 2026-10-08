// JARVIS Phase 6 — zero-cost provider classification metadata.
//
// Additive to Phase 4's JarvisAiProvider (provider.ts) — deliberately a SEPARATE type rather than
// new fields bolted onto JarvisAiProviderCapabilities, so Phase 4's own contract and its existing
// tests/callers are untouched. A JarvisAiProviderMetadata describes a provider from the owner's
// explicit zero-cost-first policy's point of view (local/cloud, cost class, health) — information
// the provider REGISTRY/ROUTING layer needs, not something a provider's own `complete`/`stream`
// methods need to see.
//
// Nothing here hardcodes a fake capability for a provider that doesn't exist: every field is
// either a fixed, honest fact about a provider implementation (e.g. "this adapter is local") or a
// LIVE health read (see localProvider.ts) — never a guess at what a not-yet-installed runtime
// would support.

/** Where inference actually runs. 'local' means on/near the user's own device or self-hosted
 * infrastructure the owner controls — never a third-party cloud API billed per token. */
export type JarvisAiProviderClass = 'local' | 'cloud';

/**
 * The owner's explicit cost policy (see this phase's own brief, Part I):
 * - FREE_LOCAL: a local/open-weight model — no per-call cost ever.
 * - FREE_DETERMINISTIC: no model at all — APFC-TRACKER's own deterministic application logic
 *   (Phase 2 tools) answering a question exactly, with zero AI involvement.
 * - FREE_CLOUD_OPTIONAL: a free-tier cloud provider the owner has explicitly opted into.
 * - PAID_OPTIONAL: a metered/paid provider — must never be the default, must always require
 *   explicit configuration/consent (see providerRegistry.ts's own docs and
 *   routingPolicy.ts's DEFAULT_COST_CLASS_BY_ROUTE, which never maps to this value).
 */
export type JarvisAiProviderCostClass = 'FREE_LOCAL' | 'FREE_DETERMINISTIC' | 'FREE_CLOUD_OPTIONAL' | 'PAID_OPTIONAL';

/**
 * Explicit health states — never inferred/guessed. A caller must be able to tell "no local
 * runtime installed" (`unavailable`) apart from "runtime running, but the model file itself
 * hasn't been pulled yet" (`model_missing`) apart from "everything is ready" (`model_ready`),
 * rather than collapsing all three into one boolean.
 */
export type JarvisAiProviderHealthStatus = 'unavailable' | 'available' | 'model_missing' | 'model_ready' | 'error';

export interface JarvisAiProviderMetadata {
  providerId: string;
  displayName: string;
  classification: JarvisAiProviderClass;
  costClass: JarvisAiProviderCostClass;
  streaming: boolean;
  toolCalling: boolean;
  /** Known context window size in tokens, when the provider/model actually documents one.
   * `null` (never a guessed number) when unknown. */
  contextCapacityTokens: number | null;
  health: JarvisAiProviderHealthStatus;
}

/** True only for a metadata record the default routing policy is allowed to select without any
 * explicit owner action — i.e. never PAID_OPTIONAL. See routingPolicy.ts's own invariant test for
 * where this is actually enforced against the routing table, not just this helper. */
export function isDefaultEligible(metadata: JarvisAiProviderMetadata): boolean {
  return metadata.costClass !== 'PAID_OPTIONAL';
}

/** True only when a provider is actually usable right now — `available` alone (runtime reachable
 * but the model itself not confirmed loaded) is NOT ready; only `model_ready` counts. A provider
 * with no separate model-loading step should report `model_ready` directly once reachable,
 * rather than stopping at `available` and expecting this function to treat that as ready.
 * Deliberately conservative: never treats an unknown/uncertain health state as ready. */
export function isReadyForInference(metadata: JarvisAiProviderMetadata): boolean {
  return metadata.health === 'model_ready';
}
