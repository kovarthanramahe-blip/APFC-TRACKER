import { describe, it, expect, vi } from 'vitest';
import { ensureAndroidLocalLlamaModelReady } from './localLlamaBootstrap';
import type { NativeLlamaRuntimeClient, JarvisAndroidRuntimeStatus, JarvisAndroidLoadedModel } from './nativeLlamaRuntimeContract';
import type { LocalLlmModelBackend, LocalLlmBackendAvailability } from './localLlmModelBackend';

// JARVIS Phase 13C — focused unit tests against the bootstrap boundary ITSELF (fake
// runtime/modelBackend objects, no Capacitor plugin involved at all) — the fast, isolated
// counterpart to the integration-level proof in runtime.test.ts that this is actually WIRED IN.

function fakeRuntime(overrides: Partial<NativeLlamaRuntimeClient> = {}): NativeLlamaRuntimeClient {
  return {
    getStatus: async () => 'available',
    getLoadedModel: async () => null,
    loadModel: async () => {},
    unloadModel: async () => {},
    complete: async () => ({ text: '', finishReason: 'stop' }),
    stream: async function* () {},
    ...overrides,
  };
}

function fakeModelBackend(availability: LocalLlmBackendAvailability): LocalLlmModelBackend {
  return { describeAvailableModel: async () => availability };
}

const LOADED_MODEL: JarvisAndroidLoadedModel = { modelId: 'qwen3-1.7b-q4_k_m', loadedAt: '2026-01-01T00:00:00Z' };

describe('ensureAndroidLocalLlamaModelReady', () => {
  it('1. already-loaded model (status ready + a loaded model) — never calls loadModel at all', async () => {
    const loadModelSpy = vi.fn(async () => {});
    const runtime = fakeRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => LOADED_MODEL, loadModel: loadModelSpy });
    const backend = fakeModelBackend({ status: 'model_found', descriptor: { modelId: 'should-never-be-read', format: 'gguf', filePath: '/x' } });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(loadModelSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ providerHealth: 'model_ready', loadAttempted: false });
  });

  it('2. model available but not loaded — loadModel is called exactly once', async () => {
    const loadModelSpy = vi.fn(async () => {});
    const runtime = fakeRuntime({ getStatus: async () => 'available', getLoadedModel: async () => null, loadModel: loadModelSpy });
    const backend = fakeModelBackend({ status: 'model_found', descriptor: { modelId: 'qwen3-1.7b-q4_k_m', format: 'gguf', filePath: '/storage/models/qwen3.gguf' } });

    await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(loadModelSpy).toHaveBeenCalledTimes(1);
  });

  it('3. a successful load re-checks health and reports the final state as model_ready', async () => {
    let loaded = false;
    const runtime = fakeRuntime({
      getStatus: async () => (loaded ? 'ready' : 'available'),
      getLoadedModel: async () => (loaded ? LOADED_MODEL : null),
      loadModel: async () => {
        loaded = true;
      },
    });
    const backend = fakeModelBackend({ status: 'model_found', descriptor: { modelId: 'qwen3-1.7b-q4_k_m', format: 'gguf', filePath: '/storage/models/qwen3.gguf' } });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(result).toEqual({ providerHealth: 'model_ready', loadAttempted: true });
  });

  it('4. no GGUF model available on-device — never attempts a load, and reports a truthful reason', async () => {
    const loadModelSpy = vi.fn(async () => {});
    const runtime = fakeRuntime({ loadModel: loadModelSpy });
    const backend = fakeModelBackend({ status: 'model_missing', reason: "No .gguf model file was found under this app's external files directory." });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(loadModelSpy).not.toHaveBeenCalled();
    expect(result.loadAttempted).toBe(false);
    expect(result.providerHealth).toBe('available');
    expect(result.unavailableReason).toBe("No .gguf model file was found under this app's external files directory.");
  });

  it('4b. no backend configured at all (Phase 13A default) — never attempts a load', async () => {
    const loadModelSpy = vi.fn(async () => {});
    const runtime = fakeRuntime({ loadModel: loadModelSpy });
    const backend = fakeModelBackend({ status: 'not_configured' });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(loadModelSpy).not.toHaveBeenCalled();
    expect(result.loadAttempted).toBe(false);
    expect(result.unavailableReason).toBeTruthy();
  });

  it('5. loadModel itself throwing is reported as a truthful degraded state, never swallowed or upgraded', async () => {
    const runtime = fakeRuntime({
      loadModel: async () => {
        throw new Error('native load failed: out of memory');
      },
    });
    const backend = fakeModelBackend({ status: 'model_found', descriptor: { modelId: 'qwen3-1.7b-q4_k_m', format: 'gguf', filePath: '/storage/models/qwen3.gguf' } });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(result.loadAttempted).toBe(true);
    expect(result.providerHealth).toBe('available');
    expect(result.unavailableReason).toBe('native load failed: out of memory');
  });

  it('6. loadModel resolves without throwing, but the post-load health re-check still does not report model_ready — NEVER treated as real AI', async () => {
    // Simulates a native side that accepts loadModel() but, for whatever reason, never actually
    // finishes loading (e.g. silently fails internally) — status stays 'available' afterward.
    const runtime = fakeRuntime({ getStatus: async () => 'available', getLoadedModel: async () => null, loadModel: async () => {} });
    const backend = fakeModelBackend({ status: 'model_found', descriptor: { modelId: 'qwen3-1.7b-q4_k_m', format: 'gguf', filePath: '/storage/models/qwen3.gguf' } });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(result.loadAttempted).toBe(true);
    expect(result.providerHealth).not.toBe('model_ready');
    expect(result.unavailableReason).toBeTruthy();
  });

  it('8. a second call after the model is already loaded does not reload it (mirrors "repeated request" at the runtime.ts level)', async () => {
    const loadModelSpy = vi.fn(async () => {});
    const runtime = fakeRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => LOADED_MODEL, loadModel: loadModelSpy });
    const backend = fakeModelBackend({ status: 'model_found', descriptor: { modelId: 'qwen3-1.7b-q4_k_m', format: 'gguf', filePath: '/storage/models/qwen3.gguf' } });

    await ensureAndroidLocalLlamaModelReady(runtime, backend);
    await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(loadModelSpy).not.toHaveBeenCalled();
  });

  it('9. the ABSOLUTE FILE PATH passed to loadModel comes entirely from the descriptor\'s filePath — never its bare modelId, never hardcoded/guessed', async () => {
    // Phase 13E regression test — the exact bug confirmed on a physical Xiaomi Pad 6: passing the
    // bare `modelId` instead of `filePath` made the native backend try to open a filename with no
    // directory component at all, fail with "file not found", and silently fall back to the stub,
    // even though the real file was genuinely present on-device.
    const loadModelSpy = vi.fn(async () => {});
    const runtime = fakeRuntime({ loadModel: loadModelSpy });
    const backend = fakeModelBackend({
      status: 'model_found',
      descriptor: { modelId: 'a-completely-arbitrary-id-from-storage', format: 'gguf', filePath: '/storage/models/whatever.gguf' },
    });

    await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(loadModelSpy).toHaveBeenCalledWith('/storage/models/whatever.gguf');
    expect(loadModelSpy).not.toHaveBeenCalledWith('a-completely-arbitrary-id-from-storage');
  });

  it('never attempts a load when the bridge itself is unavailable — no point guessing at a problem this function cannot diagnose', async () => {
    const describeAvailableModelSpy = vi.fn(async (): Promise<LocalLlmBackendAvailability> => ({ status: 'model_found', descriptor: { modelId: 'x', format: 'gguf', filePath: '/x' } }));
    const loadModelSpy = vi.fn(async () => {});
    const runtime = fakeRuntime({ getStatus: async () => 'unavailable' as JarvisAndroidRuntimeStatus, loadModel: loadModelSpy });
    const backend: LocalLlmModelBackend = { describeAvailableModel: describeAvailableModelSpy };

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(describeAvailableModelSpy).not.toHaveBeenCalled();
    expect(loadModelSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ providerHealth: 'unavailable', loadAttempted: false });
  });

  it('never attempts a load when the runtime reports an error status', async () => {
    const loadModelSpy = vi.fn(async () => {});
    // status 'ready' with no loaded model maps to health 'error' (toAndroidProviderHealthStatus).
    const runtime = fakeRuntime({ getStatus: async () => 'ready', getLoadedModel: async () => null, loadModel: loadModelSpy });
    const backend = fakeModelBackend({ status: 'model_found', descriptor: { modelId: 'x', format: 'gguf', filePath: '/x' } });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(loadModelSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ providerHealth: 'error', loadAttempted: false });
  });
});

// ================================================================================================
// Phase 13E — real model-PATH resolution regression (physical Xiaomi Pad 6 logcat evidence):
//   getModelStorageInfo -> modelId="Qwen3-1.7B-Q4_K_M.gguf", modelPath="/storage/emulated/0/
//     Android/data/com.apfctracker.jarvis/files/models/Qwen3-1.7B-Q4_K_M.gguf"
//   loadModel({"modelId":"Qwen3-1.7B-Q4_K_M.gguf"})   <- the bare filename, WRONG
//   JarvisLlamaCpp: loadModel: file not found: Qwen3-1.7B-Q4_K_M.gguf
//   complete() -> "Hello from the native stub."
// Reproduced here with the EXACT same strings, against the fixed implementation.
// ================================================================================================
describe('ensureAndroidLocalLlamaModelReady — Phase 13E: real model-path resolution', () => {
  const REAL_MODEL_ID = 'Qwen3-1.7B-Q4_K_M.gguf';
  const REAL_ABSOLUTE_PATH = '/storage/emulated/0/Android/data/com.apfctracker.jarvis/files/models/Qwen3-1.7B-Q4_K_M.gguf';

  it('passes the ABSOLUTE PATH to loadModel — never the bare filename reported as modelId, reproducing the exact device evidence', async () => {
    const loadModelSpy = vi.fn(async (_path: string) => {});
    const runtime = fakeRuntime({ loadModel: loadModelSpy });
    const backend = fakeModelBackend({
      status: 'model_found',
      descriptor: { modelId: REAL_MODEL_ID, format: 'gguf', filePath: REAL_ABSOLUTE_PATH, sizeBytes: 1_282_439_264 },
    });

    await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(loadModelSpy).toHaveBeenCalledWith(REAL_ABSOLUTE_PATH);
    expect(loadModelSpy).not.toHaveBeenCalledWith(REAL_MODEL_ID);
  });

  it('a load that genuinely fails (e.g. a path still somehow unresolvable) reports a truthful degraded state, never the stub mislabelled as real AI', async () => {
    const runtime = fakeRuntime({
      loadModel: async () => {
        throw new Error(`file not found: ${REAL_MODEL_ID}`);
      },
    });
    const backend = fakeModelBackend({
      status: 'model_found',
      descriptor: { modelId: REAL_MODEL_ID, format: 'gguf', filePath: REAL_ABSOLUTE_PATH },
    });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(result.loadAttempted).toBe(true);
    expect(result.providerHealth).not.toBe('model_ready');
    expect(result.unavailableReason).toContain('file not found');
  });

  it('a successful load with the real path reaches model_ready', async () => {
    let loaded = false;
    const runtime = fakeRuntime({
      getStatus: async () => (loaded ? 'ready' : 'available'),
      getLoadedModel: async () => (loaded ? { modelId: REAL_MODEL_ID, loadedAt: '2026-01-01T00:00:00Z' } : null),
      loadModel: async (path: string) => {
        expect(path).toBe(REAL_ABSOLUTE_PATH);
        loaded = true;
      },
    });
    const backend = fakeModelBackend({
      status: 'model_found',
      descriptor: { modelId: REAL_MODEL_ID, format: 'gguf', filePath: REAL_ABSOLUTE_PATH },
    });

    const result = await ensureAndroidLocalLlamaModelReady(runtime, backend);

    expect(result).toEqual({ providerHealth: 'model_ready', loadAttempted: true });
  });
});
