import { describe, it, expect } from 'vitest';
import { deriveJarvisUiRuntimeStatus, JARVIS_UI_RUNTIME_STATUS_LABEL } from './jarvisRuntimeStatus';

describe('deriveJarvisUiRuntimeStatus', () => {
  it('"not_android" (web/non-Android) and the lifecycle\'s own "provider_unavailable" both map to "deterministic"', () => {
    expect(deriveJarvisUiRuntimeStatus('not_android')).toBe('deterministic');
    expect(deriveJarvisUiRuntimeStatus('provider_unavailable')).toBe('deterministic');
  });

  it('"model_unavailable" maps to "model_unavailable" — never claims local AI is ready', () => {
    expect(deriveJarvisUiRuntimeStatus('model_unavailable')).toBe('model_unavailable');
  });

  it('"model_loading" maps to "model_loading"', () => {
    expect(deriveJarvisUiRuntimeStatus('model_loading')).toBe('model_loading');
  });

  it('"model_ready" and every in-flight-request state (inference_running/completed/failed) all map to "model_ready" — one request\'s outcome never changes whether the loaded model itself is still ready', () => {
    expect(deriveJarvisUiRuntimeStatus('model_ready')).toBe('model_ready');
    expect(deriveJarvisUiRuntimeStatus('inference_running')).toBe('model_ready');
    expect(deriveJarvisUiRuntimeStatus('inference_completed')).toBe('model_ready');
    expect(deriveJarvisUiRuntimeStatus('inference_failed')).toBe('model_ready');
  });

  it('is deterministic — the same input always produces the same output', () => {
    expect(deriveJarvisUiRuntimeStatus('model_ready')).toBe(deriveJarvisUiRuntimeStatus('model_ready'));
  });
});

describe('JARVIS_UI_RUNTIME_STATUS_LABEL', () => {
  it('provides the exact four labels this phase\'s own brief names', () => {
    expect(JARVIS_UI_RUNTIME_STATUS_LABEL.model_ready).toBe('Local AI Ready');
    expect(JARVIS_UI_RUNTIME_STATUS_LABEL.model_loading).toBe('Loading Model');
    expect(JARVIS_UI_RUNTIME_STATUS_LABEL.model_unavailable).toBe('Model Unavailable');
    expect(JARVIS_UI_RUNTIME_STATUS_LABEL.deterministic).toBe('Deterministic Mode');
  });
});
