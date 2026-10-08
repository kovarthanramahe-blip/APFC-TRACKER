// JARVIS Phase 13B — connects the EXISTING Phase 13A model-backend boundary
// (localLlmModelBackend.ts) to the REAL Android plugin's own model discovery
// (getModelStorageInfo — see localLlamaCapacitorPlugin.ts and LocalLlmModelStorage.kt). This file
// does not modify localLlmModelBackend.ts at all — "Phase 13A remains intact" (this phase's own
// Architecture Rule 1) is satisfied by construction, not by care: zero diff on that file.
//
// Still never performs a network call, never reads a file itself (the native/Kotlin side does
// that, through plain local filesystem APIs — see LocalLlmModelStorage.kt's own header), and never
// reports `model_found` unless the plugin itself genuinely reported one.
import type { LocalLlamaRuntimePlugin } from './localLlamaCapacitorPlugin';
import type { LocalLlmModelBackend, LocalLlmBackendAvailability } from './localLlmModelBackend';

/**
 * `plugin` is injected, matching every other JARVIS client's own "no hidden global dependency"
 * discipline. A real caller passes the same `LocalLlamaRuntime` singleton
 * (localLlamaCapacitorPlugin.ts) every other Phase 10/13A Android composition already uses.
 * Reports `not_configured` (never throws, never fabricates `model_found`) whenever the plugin
 * doesn't implement `getModelStorageInfo` at all (an older native build) or genuinely reports no
 * model.
 */
export function createAndroidLocalLlmModelBackend(plugin: LocalLlamaRuntimePlugin): LocalLlmModelBackend {
  return {
    async describeAvailableModel(): Promise<LocalLlmBackendAvailability> {
      if (!plugin.getModelStorageInfo) {
        return { status: 'not_configured' };
      }

      let info;
      try {
        info = await plugin.getModelStorageInfo();
      } catch {
        return { status: 'model_missing', reason: 'Failed to query the native model storage.' };
      }

      if (!info.modelAvailable || !info.modelId || !info.modelPath) {
        return { status: 'model_missing', reason: 'No .gguf model file was found under this app\'s external files directory.' };
      }

      return {
        status: 'model_found',
        descriptor: {
          modelId: info.modelId,
          format: 'gguf',
          filePath: info.modelPath,
          sizeBytes: info.modelSizeBytes,
        },
      };
    },
  };
}
