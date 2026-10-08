// JARVIS Phase 14 — thin React wiring for the real runtime status badge. Every actual decision
// (which lifecycle state maps to which label) is in jarvisRuntimeStatus.ts (pure, tested); this
// hook only calls the EXISTING Phase 10/13A/13B composition functions and stores their result.
// Never fabricates "model_ready" — the lifecycle tracker only ever reports it once
// NativeLlamaRuntime/the real backend genuinely says so (see localLlmLifecycle.ts's own header).
import { useCallback, useEffect, useRef, useState } from 'react';
import LocalLlamaRuntime, { isLocalLlamaRuntimeAvailable } from '../jarvis/ai/android/localLlamaCapacitorPlugin';
import { createNativeLlamaRuntime } from '../jarvis/ai/android/nativeLlamaRuntime';
import { createLocalLlmLifecycleTracker } from '../jarvis/ai/android/localLlmLifecycle';
import { createAndroidLocalLlmModelBackend } from '../jarvis/ai/android/androidLocalLlmModelBackend';
import { deriveJarvisUiRuntimeStatus, type JarvisUiRuntimeStatus } from './jarvisRuntimeStatus';

export interface UseJarvisRuntimeStatusResult {
  status: JarvisUiRuntimeStatus;
  /** The real discovered model's own id (filename, minus `.gguf`) — never a hardcoded label; only
   * set when a `.gguf` file was genuinely found under this app's external files directory. */
  modelDisplayName?: string;
  modelSizeBytes?: number;
  /** True only when a model file was discovered but isn't loaded yet — i.e. there is something
   * genuine for the user to trigger a load of. Never true for "Local AI Ready" or "Deterministic
   * Mode" (on web, there is never anything to load). */
  canLoadModel: boolean;
  loadModel: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useJarvisRuntimeStatus(): UseJarvisRuntimeStatusResult {
  const [status, setStatus] = useState<JarvisUiRuntimeStatus>(isLocalLlamaRuntimeAvailable ? 'model_unavailable' : 'deterministic');
  const [modelDisplayName, setModelDisplayName] = useState<string | undefined>(undefined);
  const [modelSizeBytes, setModelSizeBytes] = useState<number | undefined>(undefined);
  const [canLoadModel, setCanLoadModel] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isLocalLlamaRuntimeAvailable) {
      if (mountedRef.current) setStatus('deterministic');
      return;
    }

    const runtime = createNativeLlamaRuntime(LocalLlamaRuntime);
    const tracker = createLocalLlmLifecycleTracker(runtime, { isProviderAvailable: isLocalLlamaRuntimeAvailable });
    const lifecycleState = await tracker.getLifecycleState();
    if (!mountedRef.current) return;
    setStatus(deriveJarvisUiRuntimeStatus(lifecycleState));

    const backend = createAndroidLocalLlmModelBackend(LocalLlamaRuntime);
    const availability = await backend.describeAvailableModel();
    if (!mountedRef.current) return;
    if (availability.status === 'model_found') {
      setModelDisplayName(availability.descriptor.modelId.replace(/\.gguf$/i, ''));
      setModelSizeBytes(availability.descriptor.sizeBytes);
      setCanLoadModel(lifecycleState === 'model_unavailable');
    } else {
      setModelDisplayName(undefined);
      setModelSizeBytes(undefined);
      setCanLoadModel(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadModel = useCallback(async () => {
    if (!isLocalLlamaRuntimeAvailable) return;
    const backend = createAndroidLocalLlmModelBackend(LocalLlamaRuntime);
    const availability = await backend.describeAvailableModel();
    if (availability.status !== 'model_found') {
      await refresh();
      return;
    }
    if (mountedRef.current) setStatus('model_loading');
    const runtime = createNativeLlamaRuntime(LocalLlamaRuntime);
    try {
      await runtime.loadModel(availability.descriptor.filePath);
    } finally {
      await refresh();
    }
  }, [refresh]);

  return { status, modelDisplayName, modelSizeBytes, canLoadModel, loadModel, refresh };
}
