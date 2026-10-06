// JARVIS Phase 13A — Local LLM model-backend boundary (Android).
//
// The typed boundary a FUTURE real llama.cpp/GGUF backend plugs into — NOT an implementation of
// one. Nothing in this file loads, downloads, bundles, or references any actual model file or
// llama.cpp binding; this phase's own brief: "do not claim inference works until an actual model
// backend exists," and "do not bundle a huge GGUF model into the APK / model files must be
// external/user-provided or otherwise separately managed." The only implementation this file ships
// (noModelBackendConfigured) truthfully reports "no backend configured" always — it exists so a
// caller has something real to depend on today, typed and awaitable, without any of them having to
// special-case `undefined`/pretend a model is available.
export type LocalLlmModelFormat = 'gguf';

/** Describes a model FILE already placed on-device by the user/operator's own means (e.g. a file
 * picker, `adb push`, or a future download-manager-gated feature in a LATER phase) — never
 * resolved, fetched, or validated by this file. `filePath` is a local on-device path, never a URL. */
export interface LocalLlmModelDescriptor {
  modelId: string;
  format: LocalLlmModelFormat;
  filePath: string;
  sizeBytes?: number;
  quantization?: string;
}

export type LocalLlmBackendAvailability =
  | { status: 'not_configured' }
  | { status: 'model_found'; descriptor: LocalLlmModelDescriptor }
  | { status: 'model_missing'; reason: string };

/**
 * The contract a real llama.cpp/GGUF backend would implement to let the rest of this app discover
 * an externally-provided model WITHOUT this app ever downloading or bundling one itself.
 * `describeAvailableModel()` must be side-effect-free and must NEVER perform a network call — it
 * only reports what is already present on-device (e.g. by checking a known directory for a .gguf
 * file), matching this phase's own "₹0 recurring cost / no network dependency for inference" rule.
 */
export interface LocalLlmModelBackend {
  describeAvailableModel(): Promise<LocalLlmBackendAvailability>;
}

/**
 * The ONLY implementation this phase ships — truthfully and deterministically reports "no backend
 * configured" on every call, never a guessed or fabricated model. A future phase that implements a
 * real llama.cpp/GGUF backend supplies its own LocalLlmModelBackend in place of this one; nothing
 * in Phase 13A pretends that future implementation already exists.
 */
export const noModelBackendConfigured: LocalLlmModelBackend = {
  async describeAvailableModel(): Promise<LocalLlmBackendAvailability> {
    return { status: 'not_configured' };
  },
};
