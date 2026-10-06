import { describe, it, expect } from 'vitest';
import { resolveJarvisRoute, resolveEffectiveRoute, isRouteTableFreeByDefault } from './routingPolicy';
import { probeLocalRuntimeHealth, toProviderHealthStatus } from './ai/localRuntimeHealth';
import { OllamaClientError, type JarvisOllamaHttpClient, type OllamaTagsResponse } from './ai/localRuntime';
import type { JarvisWorkspace } from './types';

// JARVIS Phase 8 — Part 7: connects the Phase 6 routing abstraction to this phase's own local
// runtime health, ONLY at the provider boundary (never the UI — nothing here renders anything or
// reads from a component). routingPolicy.ts itself is NOT modified by this phase; this file only
// proves the two pieces compose correctly.
const WORKSPACE: JarvisWorkspace = 'apfc';

function fixtureClient(overrides: Partial<JarvisOllamaHttpClient>): JarvisOllamaHttpClient {
  return {
    listModels: async () => ({ models: [] }),
    showModel: async () => ({}),
    chat: async () => ({ model: 'm', created_at: 't', message: { role: 'assistant', content: '' }, done: true }),
    chatStream: async function* () {},
    ...overrides,
  };
}

describe('Phase 8 — deterministic tools are never affected by local AI health', () => {
  it('a deterministic_tool route stays undegraded even when the local runtime is completely unavailable', async () => {
    const client = fixtureClient({ listModels: async () => { throw new OllamaClientError('network_error', 'refused'); } });
    const health = await probeLocalRuntimeHealth({ client });

    const decision = resolveJarvisRoute({ intent: 'study_next', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const effective = resolveEffectiveRoute(decision, toProviderHealthStatus(health));

    expect(decision.target).toBe('deterministic_tool');
    expect(effective.effectiveTarget).toBe('deterministic_tool');
    expect(effective.degraded).toBe(false);
  });
});

describe('Phase 8 — local AI is used once genuinely ready, never before', () => {
  it('a local_ai route degrades to ai_unavailable while the runtime is unreachable', async () => {
    const client = fixtureClient({ listModels: async () => { throw new OllamaClientError('network_error', 'refused'); } });
    const health = await probeLocalRuntimeHealth({ client });

    const decision = resolveJarvisRoute({ intent: 'explain', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const effective = resolveEffectiveRoute(decision, toProviderHealthStatus(health));

    expect(decision.target).toBe('local_ai');
    expect(effective.effectiveTarget).toBe('ai_unavailable');
    expect(effective.degraded).toBe(true);
  });

  it('a local_ai route becomes usable once the local runtime reports a confirmed, ready model', async () => {
    const tags: OllamaTagsResponse = { models: [{ name: 'llama3.2:latest', model: 'llama3.2:latest', modified_at: 't', size: 1, digest: 'd' }] };
    const client = fixtureClient({ listModels: async () => tags, showModel: async () => ({ capabilities: ['completion'] }) });
    const health = await probeLocalRuntimeHealth({ client, model: 'llama3.2:latest' });

    const decision = resolveJarvisRoute({ intent: 'explain', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const effective = resolveEffectiveRoute(decision, toProviderHealthStatus(health));

    expect(health.state).toBe('model_available');
    expect(effective.effectiveTarget).toBe('local_ai');
    expect(effective.degraded).toBe(false);
  });

  it('a model listed but not confirmed usable (inference_unavailable) still degrades the route — "listed" is not "ready"', async () => {
    const tags: OllamaTagsResponse = { models: [{ name: 'llama3.2:latest', model: 'llama3.2:latest', modified_at: 't', size: 1, digest: 'd' }] };
    const client = fixtureClient({
      listModels: async () => tags,
      showModel: async () => { throw new OllamaClientError('http_error', 'corrupted', 500); },
    });
    const health = await probeLocalRuntimeHealth({ client, model: 'llama3.2:latest' });

    const decision = resolveJarvisRoute({ intent: 'explain', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const effective = resolveEffectiveRoute(decision, toProviderHealthStatus(health));

    expect(health.state).toBe('inference_unavailable');
    expect(effective.effectiveTarget).toBe('ai_unavailable');
    expect(effective.degraded).toBe(true);
  });
});

describe('Phase 8 — a paid provider is never selected by default, even with Ollama wired in', () => {
  it('the routing table this phase connects to remains free-by-default', () => {
    expect(isRouteTableFreeByDefault()).toBe(true);
  });

  it('every route this phase\'s own local provider could ever serve has a FREE_LOCAL cost class', () => {
    const localAiDecision = resolveJarvisRoute({ intent: 'explain', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const documentDecision = resolveJarvisRoute({ intent: 'explain', workspace: WORKSPACE, hasDocumentContext: true, webResearchExplicitlyRequested: false });

    expect(localAiDecision.costClass).toBe('FREE_LOCAL');
    expect(documentDecision.costClass).toBe('FREE_LOCAL');
  });
});
