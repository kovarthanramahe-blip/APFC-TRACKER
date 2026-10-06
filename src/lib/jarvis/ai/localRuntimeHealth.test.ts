import { describe, it, expect } from 'vitest';
import { probeLocalRuntimeHealth, toProviderHealthStatus, type JarvisLocalRuntimeHealth } from './localRuntimeHealth';
import { OllamaClientError, type JarvisOllamaHttpClient, type OllamaTagsResponse, type OllamaShowResponse } from './localRuntime';

// Every test below injects a deterministic fixture client — no real Ollama process exists in this
// environment (Part 3's own instruction: "if an actual runtime probe cannot safely execute in the
// current environment, keep the implementation injectable and test it with deterministic
// fixtures"). None of these fixtures perform a network call.
function fixtureClient(overrides: Partial<JarvisOllamaHttpClient>): JarvisOllamaHttpClient {
  return {
    listModels: async () => ({ models: [] }),
    showModel: async () => ({}),
    chat: async () => ({ model: 'm', created_at: 't', message: { role: 'assistant', content: '' }, done: true }),
    chatStream: async function* () {},
    ...overrides,
  };
}

const TAGS_WITH_ONE_MODEL: OllamaTagsResponse = {
  models: [{ name: 'llama3.2:latest', model: 'llama3.2:latest', modified_at: 't', size: 100, digest: 'd' }],
};

describe('probeLocalRuntimeHealth — runtime_unavailable', () => {
  it('reports runtime_unavailable when the runtime cannot be reached at all', async () => {
    const client = fixtureClient({ listModels: async () => { throw new OllamaClientError('network_error', 'ECONNREFUSED'); } });
    const health = await probeLocalRuntimeHealth({ client });
    expect(health.state).toBe('runtime_unavailable');
  });
});

describe('probeLocalRuntimeHealth — timeout', () => {
  it('reports timeout distinctly from runtime_unavailable', async () => {
    const client = fixtureClient({ listModels: async () => { throw new OllamaClientError('timeout', 'timed out'); } });
    const health = await probeLocalRuntimeHealth({ client });
    expect(health.state).toBe('timeout');
  });
});

describe('probeLocalRuntimeHealth — malformed_response', () => {
  it('reports malformed_response when the listing has no "models" array', async () => {
    const client = fixtureClient({ listModels: async () => ({}) as OllamaTagsResponse });
    const health = await probeLocalRuntimeHealth({ client });
    expect(health.state).toBe('malformed_response');
  });

  it('reports malformed_response when the client itself signals a malformed body', async () => {
    const client = fixtureClient({ listModels: async () => { throw new OllamaClientError('malformed_response', 'not json'); } });
    const health = await probeLocalRuntimeHealth({ client });
    expect(health.state).toBe('malformed_response');
  });
});

describe('probeLocalRuntimeHealth — runtime_reachable (no model requested, none installed)', () => {
  it('reports runtime_reachable when the runtime answers but no models are installed', async () => {
    const client = fixtureClient({ listModels: async () => ({ models: [] }) });
    const health = await probeLocalRuntimeHealth({ client });
    expect(health.state).toBe('runtime_reachable');
    expect(health.models).toEqual([]);
  });
});

describe('probeLocalRuntimeHealth — model_available (no specific model requested, something is installed)', () => {
  it('reports model_available when at least one model is installed and none was specifically requested', async () => {
    const client = fixtureClient({ listModels: async () => TAGS_WITH_ONE_MODEL });
    const health = await probeLocalRuntimeHealth({ client });
    expect(health.state).toBe('model_available');
    expect(health.models).toHaveLength(1);
  });
});

describe('probeLocalRuntimeHealth — model_missing', () => {
  it('reports model_missing when a specific requested model is not in the listing', async () => {
    const client = fixtureClient({ listModels: async () => TAGS_WITH_ONE_MODEL });
    const health = await probeLocalRuntimeHealth({ client, model: 'mistral:latest' });
    expect(health.state).toBe('model_missing');
  });
});

describe('probeLocalRuntimeHealth — model_available (specific model requested and confirmed)', () => {
  it('reports model_available once the requested model is listed AND its details are retrievable', async () => {
    const client = fixtureClient({
      listModels: async () => TAGS_WITH_ONE_MODEL,
      showModel: async () => ({ capabilities: ['completion'] }) as OllamaShowResponse,
    });
    const health = await probeLocalRuntimeHealth({ client, model: 'llama3.2:latest' });
    expect(health.state).toBe('model_available');
  });
});

describe('probeLocalRuntimeHealth — inference_unavailable', () => {
  it('reports inference_unavailable when the model is listed but its details cannot be confirmed', async () => {
    const client = fixtureClient({
      listModels: async () => TAGS_WITH_ONE_MODEL,
      showModel: async () => { throw new OllamaClientError('http_error', 'model file corrupted', 500); },
    });
    const health = await probeLocalRuntimeHealth({ client, model: 'llama3.2:latest' });
    expect(health.state).toBe('inference_unavailable');
    expect(health.detail).toContain('llama3.2:latest');
  });
});

describe('toProviderHealthStatus — bridges to Phase 6\'s existing 5-state contract', () => {
  const cases: Array<[JarvisLocalRuntimeHealth['state'], string]> = [
    ['runtime_unavailable', 'unavailable'],
    ['timeout', 'unavailable'],
    ['runtime_reachable', 'available'],
    ['model_missing', 'model_missing'],
    ['model_available', 'model_ready'],
    ['malformed_response', 'error'],
    ['inference_unavailable', 'error'],
  ];

  for (const [state, expected] of cases) {
    it(`maps ${state} -> ${expected}`, () => {
      expect(toProviderHealthStatus({ state })).toBe(expected);
    });
  }
});
