// JARVIS Phase 6 — local/open-weight AI adapter contract.
//
// Architecture (see this phase's own brief):
//
//   APFC-TRACKER -> JARVIS -> secure/local AI adapter -> local inference runtime -> open-weight model
//
// The browser/Android client NEVER calls an arbitrary local-machine model directly as the final
// architecture — that would mean shipping a bare fetch to a loopback-address runtime port
// (Ollama's default being one example) from React/Capacitor code, which has no secure boundary
// and would behave
// differently (and insecurely) the moment the app runs on a device that isn't the same machine
// as the runtime. The real adapter that actually calls a runtime like Ollama belongs server/edge-
// side (conceptually alongside supabase/functions/jarvis-gateway — see that function's own
// Phase 5/5.1 header), reached the same way any other JarvisAiProvider is: through the gateway.
// Nothing in THIS file performs a network call — it is the contract a future server-side adapter
// implements, plus a pure, deterministic health-classification helper this phase can actually
// ship and test today.
//
// This phase does NOT download, install, or require Ollama (or any runtime). The health contract
// below exists precisely so the rest of JARVIS can ask "is local AI usable right now?" and get an
// honest, explicit answer — including "no" — rather than the application assuming a local model
// exists and breaking when it doesn't.
import type { JarvisAiProvider } from './provider';
import type { JarvisAiProviderHealthStatus, JarvisAiProviderMetadata } from './providerMetadata';

/** Configuration for a future local adapter — deliberately NOT a browser-reachable URL. Even
 * `endpointHint` is a human-readable description (e.g. "Ollama on the gateway's host network"),
 * never a value this phase wires into an actual fetch target; nothing in this file sends a
 * request anywhere. */
export interface JarvisLocalProviderConfig {
  /** Which local runtime family this config targets — informational only in this phase. */
  runtime: 'ollama' | 'other';
  /** The open-weight model name the runtime would be asked for (e.g. "llama3.1:8b") — a plain
   * string this phase never validates against a real model registry. */
  model: string;
  endpointHint?: string;
}

/**
 * Classifies a local provider's live health report into the shared
 * JarvisAiProviderHealthStatus states. Pure and deterministic: given the same `report`, always
 * returns the same status — never performs the health check itself (a future server-side adapter
 * owns that network call; this function only interprets its result).
 */
export interface JarvisLocalHealthProbeResult {
  /** Whether the local runtime process/API was reachable at all. */
  runtimeReachable: boolean;
  /** Whether the specific configured model is already pulled/loaded, when known. `null` when the
   * runtime wasn't reachable, so this couldn't be determined either way. */
  modelLoaded: boolean | null;
  /** Present only when something went wrong in a way distinct from "just not installed" (e.g. a
   * malformed response from the runtime) — never a raw exception/stack trace. */
  errorMessage?: string;
}

export function classifyLocalProviderHealth(report: JarvisLocalHealthProbeResult): JarvisAiProviderHealthStatus {
  if (report.errorMessage) return 'error';
  if (!report.runtimeReachable) return 'unavailable';
  if (report.modelLoaded === false) return 'model_missing';
  if (report.modelLoaded === true) return 'model_ready';
  // Reachable, but model-loaded state unknown — honestly "available", not "ready".
  return 'available';
}

/** Builds the full JarvisAiProviderMetadata record for a local adapter from its config + latest
 * health probe — the one place "local provider" metadata is assembled, so routingPolicy.ts and
 * any future UI never duplicate this classification logic. Never claims `streaming`/`toolCalling`
 * support beyond what `provider` itself actually declares. */
export function buildLocalProviderMetadata(
  provider: Pick<JarvisAiProvider, 'id' | 'name' | 'capabilities'>,
  report: JarvisLocalHealthProbeResult,
): JarvisAiProviderMetadata {
  return {
    providerId: provider.id,
    displayName: provider.name,
    classification: 'local',
    costClass: 'FREE_LOCAL',
    streaming: provider.capabilities.streaming,
    toolCalling: provider.capabilities.toolCalling,
    contextCapacityTokens: null,
    health: classifyLocalProviderHealth(report),
  };
}

/** The default, safe assumption whenever no real health probe has run yet (e.g. on first app
 * load, before any server round-trip) — `unavailable`, never `model_ready`. JARVIS must never
 * assume a local model exists until something has actually confirmed it. */
export const UNPROBED_LOCAL_HEALTH: JarvisLocalHealthProbeResult = { runtimeReachable: false, modelLoaded: null };
