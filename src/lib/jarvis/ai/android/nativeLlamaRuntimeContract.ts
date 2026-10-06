// JARVIS Phase 10 — Android local AI runtime contract (Part of Steps 2/7/8).
//
// Provider-independent TYPES ONLY, plus one pure status-mapping helper. This is the "NativeLlamaRuntime"
// layer in the architecture this phase proves:
//
//   JarvisAiProvider -> AndroidLocalLlamaProvider -> NativeLlamaRuntime -> Capacitor Plugin -> JNI/NDK -> llama.cpp
//
// Nothing here is llama.cpp-specific, Vulkan-specific, or JNI-specific — those are implementation
// details strictly behind the Capacitor plugin boundary (localLlamaCapacitorPlugin.ts). This file
// never imports from './localLlamaCapacitorPlugin' or any Android/Kotlin/C++ concept.
import type { JarvisAiProviderHealthStatus } from '../providerMetadata';

/** The five states Phase 10's own brief names explicitly (Step 7) — 'loading' is the one state
 * with no equivalent in Phase 6's existing 5-state JarvisAiProviderHealthStatus (that contract has
 * no transient "in progress" state), which is exactly why this is its own, Android-specific type
 * rather than a reuse of that one. */
export type JarvisAndroidRuntimeStatus = 'unavailable' | 'available' | 'loading' | 'ready' | 'error';

export interface JarvisAndroidLoadedModel {
  modelId: string;
  displayName?: string;
  /** ISO timestamp — when this model finished loading, per the runtime's own report. */
  loadedAt: string;
}

export interface NativeLlamaCompletionRequest {
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export type NativeLlamaFinishReason = 'stop' | 'length' | 'cancelled' | 'error';

export interface NativeLlamaCompletionResult {
  text: string;
  promptTokens?: number;
  generatedTokens?: number;
  finishReason: NativeLlamaFinishReason;
}

/** Structured errors a NativeLlamaRuntimeClient implementation throws — never a raw plugin
 * exception past this module's own boundary. Mirrors ai/localRuntime.ts's own OllamaClientError
 * convention (Phase 8) for the same reason: a stable, small set of kinds a caller can switch on,
 * rather than inspecting an arbitrary Error's message string. */
export type NativeLlamaRuntimeErrorKind = 'unavailable' | 'timeout' | 'cancelled' | 'malformed_response' | 'unknown';

export class NativeLlamaRuntimeError extends Error {
  readonly kind: NativeLlamaRuntimeErrorKind;

  constructor(kind: NativeLlamaRuntimeErrorKind, message: string) {
    super(message);
    this.name = 'NativeLlamaRuntimeError';
    this.kind = kind;
  }
}

/**
 * The full native-runtime contract the TypeScript side depends on — intentionally narrow (six
 * operations, matching Step 3's own method list exactly) so a test fixture never has to fake more
 * than this. `stream()` returns the EXISTING JarvisAiStreamEvent union directly (Step 8's own
 * instruction: "reuse where possible... do not create a second competing streaming protocol") —
 * cancellation ends a stream via that union's own `{type:'error', error:{code:'cancelled'}}` case,
 * exactly like ai/gateway.ts's and ai/ollamaProvider.ts's own established precedent, never a new
 * event type invented for this phase.
 */
export interface NativeLlamaRuntimeClient {
  getStatus(): Promise<JarvisAndroidRuntimeStatus>;
  getLoadedModel(): Promise<JarvisAndroidLoadedModel | null>;
  loadModel(modelId: string): Promise<void>;
  unloadModel(): Promise<void>;
  complete(request: NativeLlamaCompletionRequest, signal?: AbortSignal): Promise<NativeLlamaCompletionResult>;
  stream(request: NativeLlamaCompletionRequest, signal?: AbortSignal): AsyncIterable<import('../types').JarvisAiStreamEvent>;
}

/**
 * Bridges this phase's own 5-state Android status into Phase 6's existing, already-wired-into-
 * routing JarvisAiProviderHealthStatus — never a second, competing health contract. `loading`
 * collapses onto `'available'` (reachable, not yet confirmed ready) rather than inventing a sixth
 * downstream state. `ready` maps to `'model_ready'` ONLY when `hasLoadedModel` is independently
 * confirmed true — this function never claims "AI ready" from `status` alone (Step 7's own
 * explicit rule), since a caller could in principle report `'ready'` without a model id attached;
 * treating that combination as `'error'` is the conservative, honest choice.
 */
export function toAndroidProviderHealthStatus(status: JarvisAndroidRuntimeStatus, hasLoadedModel: boolean): JarvisAiProviderHealthStatus {
  switch (status) {
    case 'unavailable':
      return 'unavailable';
    case 'available':
    case 'loading':
      return 'available';
    case 'error':
      return 'error';
    case 'ready':
      return hasLoadedModel ? 'model_ready' : 'error';
  }
}
