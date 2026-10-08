import { describe, it, expect } from 'vitest';
import { classifyLocalProviderHealth, buildLocalProviderMetadata, UNPROBED_LOCAL_HEALTH, type JarvisLocalHealthProbeResult } from './localProvider';
import type { JarvisAiProvider } from './provider';

describe('classifyLocalProviderHealth — explicit states, never guessed', () => {
  it('reports unavailable when the runtime was not reachable', () => {
    expect(classifyLocalProviderHealth({ runtimeReachable: false, modelLoaded: null })).toBe('unavailable');
  });

  it('reports model_missing when the runtime is up but the model is not loaded', () => {
    expect(classifyLocalProviderHealth({ runtimeReachable: true, modelLoaded: false })).toBe('model_missing');
  });

  it('reports model_ready only when both the runtime and the model are confirmed', () => {
    expect(classifyLocalProviderHealth({ runtimeReachable: true, modelLoaded: true })).toBe('model_ready');
  });

  it('reports available (not ready) when reachable but model state is unknown', () => {
    expect(classifyLocalProviderHealth({ runtimeReachable: true, modelLoaded: null })).toBe('available');
  });

  it('reports error distinctly from unavailable when the probe itself failed abnormally', () => {
    const report: JarvisLocalHealthProbeResult = { runtimeReachable: false, modelLoaded: null, errorMessage: 'malformed response' };
    expect(classifyLocalProviderHealth(report)).toBe('error');
  });

  it('the unprobed default is unavailable, never model_ready', () => {
    expect(classifyLocalProviderHealth(UNPROBED_LOCAL_HEALTH)).toBe('unavailable');
  });
});

describe('buildLocalProviderMetadata', () => {
  const stubProvider: Pick<JarvisAiProvider, 'id' | 'name' | 'capabilities'> = {
    id: 'ollama-llama3',
    name: 'Local Llama 3 (Ollama)',
    capabilities: { streaming: true, toolCalling: false },
  };

  it('classifies as local and FREE_LOCAL regardless of health', () => {
    const metadata = buildLocalProviderMetadata(stubProvider, UNPROBED_LOCAL_HEALTH);
    expect(metadata.classification).toBe('local');
    expect(metadata.costClass).toBe('FREE_LOCAL');
  });

  it('defaults to unavailable before any real probe has run', () => {
    const metadata = buildLocalProviderMetadata(stubProvider, UNPROBED_LOCAL_HEALTH);
    expect(metadata.health).toBe('unavailable');
  });

  it('never claims more capability than the provider itself declares', () => {
    const metadata = buildLocalProviderMetadata(stubProvider, { runtimeReachable: true, modelLoaded: true });
    expect(metadata.streaming).toBe(true);
    expect(metadata.toolCalling).toBe(false);
  });

  it('never fabricates a context window size', () => {
    const metadata = buildLocalProviderMetadata(stubProvider, { runtimeReachable: true, modelLoaded: true });
    expect(metadata.contextCapacityTokens).toBeNull();
  });
});
