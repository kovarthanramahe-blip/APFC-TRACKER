// JARVIS Phase 8 — local runtime health probe (Part 3).
//
// Distinguishes exactly the states this phase's own brief requires, never collapsing any two of
// them into one guess:
//   runtime_unavailable | runtime_reachable | model_missing | model_available |
//   malformed_response | timeout | inference_unavailable
//
// Pure and injectable: probeLocalRuntimeHealth takes a JarvisOllamaHttpClient (localRuntime.ts) —
// a real one for production, a deterministic fixture for tests (Part 3's own instruction: "if an
// actual runtime probe cannot safely execute in the current environment, keep the implementation
// injectable and test it with deterministic fixtures" — no live Ollama process exists in this
// development/test environment, so every test here uses a fixture client, never a real network
// call).
import { OllamaClientError, type JarvisOllamaHttpClient } from './localRuntime';
import { mapOllamaTagsModelToInfo, type JarvisLocalModelInfo } from './modelDiscovery';
import type { JarvisAiProviderHealthStatus } from './providerMetadata';

export type JarvisLocalRuntimeHealthState = 'runtime_unavailable' | 'runtime_reachable' | 'model_missing' | 'model_available' | 'malformed_response' | 'timeout' | 'inference_unavailable';

export interface JarvisLocalRuntimeHealth {
  state: JarvisLocalRuntimeHealthState;
  /** Safe, human-readable detail — never a raw exception/stack trace. */
  detail?: string;
  /** Present whenever a model listing was actually obtained (every state except
   * 'runtime_unavailable'/'timeout'/'malformed_response', which never got that far). */
  models?: readonly JarvisLocalModelInfo[];
}

export interface ProbeLocalRuntimeHealthInput {
  client: JarvisOllamaHttpClient;
  /** When given, health additionally confirms this specific model is installed and its details
   * are retrievable — when omitted, health only reflects whether the runtime itself is reachable
   * and whether ANY model is installed. */
  model?: string;
  signal?: AbortSignal;
}

function classifyProbeFailure(err: unknown): JarvisLocalRuntimeHealth {
  if (err instanceof OllamaClientError) {
    switch (err.kind) {
      case 'timeout':
        return { state: 'timeout', detail: err.message };
      case 'cancelled':
      case 'network_error':
        return { state: 'runtime_unavailable', detail: err.message };
      case 'http_error':
        return { state: 'runtime_unavailable', detail: err.message };
      case 'malformed_response':
        return { state: 'malformed_response', detail: err.message };
    }
  }
  return { state: 'runtime_unavailable', detail: 'Unknown error while probing the local runtime.' };
}

/**
 * Runs the real probe sequence: list installed models, then — only when a specific `model` was
 * requested — confirm that model's own details are retrievable (POST /api/show). This second step
 * is what distinguishes `model_available` from `inference_unavailable`: a model can appear in the
 * /api/tags listing yet still fail to actually serve inference (e.g. a corrupted or
 * partially-pulled model file) — this probe surfaces that honestly rather than reporting
 * `model_available` on the listing alone.
 */
export async function probeLocalRuntimeHealth(input: ProbeLocalRuntimeHealthInput): Promise<JarvisLocalRuntimeHealth> {
  let tagsResponse: Awaited<ReturnType<JarvisOllamaHttpClient['listModels']>>;
  try {
    tagsResponse = await input.client.listModels(input.signal);
  } catch (err) {
    return classifyProbeFailure(err);
  }

  if (!tagsResponse || !Array.isArray(tagsResponse.models)) {
    return { state: 'malformed_response', detail: 'The local runtime\'s model listing did not contain a "models" array.' };
  }

  const models = tagsResponse.models.map(mapOllamaTagsModelToInfo);

  if (!input.model) {
    return models.length > 0 ? { state: 'model_available', models } : { state: 'runtime_reachable', models };
  }

  const matched = models.find((m) => m.identifier === input.model);
  if (!matched) {
    return { state: 'model_missing', models };
  }

  try {
    await input.client.showModel(matched.identifier, input.signal);
  } catch (err) {
    const detail = err instanceof OllamaClientError ? err.message : 'Model details could not be confirmed.';
    return { state: 'inference_unavailable', detail: `Model "${matched.identifier}" is listed but not currently usable: ${detail}`, models };
  }

  return { state: 'model_available', models };
}

/**
 * Bridges this phase's own richer 7-state health into Phase 6's existing, already-wired-into-
 * routing 5-state JarvisAiProviderHealthStatus — never a second, competing health contract that
 * routingPolicy.ts/localProvider.ts would also need to learn about. `timeout` and
 * `malformed_response`/`inference_unavailable` collapse onto the closest existing meaning rather
 * than being dropped.
 */
export function toProviderHealthStatus(health: JarvisLocalRuntimeHealth): JarvisAiProviderHealthStatus {
  switch (health.state) {
    case 'runtime_unavailable':
    case 'timeout':
      return 'unavailable';
    case 'runtime_reachable':
      return 'available';
    case 'model_missing':
      return 'model_missing';
    case 'model_available':
      return 'model_ready';
    case 'malformed_response':
    case 'inference_unavailable':
      return 'error';
  }
}
