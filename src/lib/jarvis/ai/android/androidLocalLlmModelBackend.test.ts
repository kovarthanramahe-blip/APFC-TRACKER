import { describe, it, expect } from 'vitest';
import { createAndroidLocalLlmModelBackend } from './androidLocalLlmModelBackend';
import type { LocalLlamaRuntimePlugin, LocalLlamaModelStorageInfo, LocalLlamaStreamWireEvent } from './localLlamaCapacitorPlugin';

function fixturePlugin(overrides: Partial<LocalLlamaRuntimePlugin> = {}): LocalLlamaRuntimePlugin {
  return {
    getRuntimeStatus: async () => ({ status: 'available' }),
    getLoadedModel: async () => ({ model: null }),
    loadModel: async () => {},
    unloadModel: async () => {},
    complete: async () => ({ text: 'stub', finishReason: 'stop' }),
    completeStreaming: async () => {},
    cancel: async () => {},
    addListener: async (_eventName: string, _listenerFunc: (event: LocalLlamaStreamWireEvent) => void) => ({ remove: async () => {} }),
    ...overrides,
  };
}

describe('createAndroidLocalLlmModelBackend — connecting Phase 13A\'s LocalLlmModelBackend contract to the real plugin', () => {
  it('reports not_configured when the plugin does not implement getModelStorageInfo at all (an older native build)', async () => {
    const backend = createAndroidLocalLlmModelBackend(fixturePlugin());
    expect(await backend.describeAvailableModel()).toEqual({ status: 'not_configured' });
  });

  it('reports model_found with the real descriptor when the plugin genuinely reports one', async () => {
    const info: LocalLlamaModelStorageInfo = { modelAvailable: true, modelId: 'Qwen3-1.7B-Q4_K_M.gguf', modelPath: '/storage/emulated/0/Android/data/com.apfctracker.app/files/models/Qwen3-1.7B-Q4_K_M.gguf', modelSizeBytes: 1_280_000_000 };
    const backend = createAndroidLocalLlmModelBackend(fixturePlugin({ getModelStorageInfo: async () => info }));

    const result = await backend.describeAvailableModel();
    expect(result).toEqual({
      status: 'model_found',
      descriptor: { modelId: info.modelId, format: 'gguf', filePath: info.modelPath, sizeBytes: info.modelSizeBytes },
    });
  });

  it('reports model_missing (never model_found) when the plugin reports modelAvailable: false', async () => {
    const backend = createAndroidLocalLlmModelBackend(fixturePlugin({ getModelStorageInfo: async () => ({ modelAvailable: false }) }));
    const result = await backend.describeAvailableModel();
    expect(result.status).toBe('model_missing');
  });

  it('reports model_missing (never throws) when the plugin call itself rejects', async () => {
    const backend = createAndroidLocalLlmModelBackend(
      fixturePlugin({
        getModelStorageInfo: async () => {
          throw new Error('bridge not ready');
        },
      }),
    );
    const result = await backend.describeAvailableModel();
    expect(result.status).toBe('model_missing');
  });

  it('never reports model_found when modelAvailable is true but the plugin omitted modelId/modelPath — never fabricates the missing fields', async () => {
    const backend = createAndroidLocalLlmModelBackend(fixturePlugin({ getModelStorageInfo: async () => ({ modelAvailable: true }) }));
    const result = await backend.describeAvailableModel();
    expect(result.status).toBe('model_missing');
  });
});
