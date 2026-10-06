import { describe, it, expect } from 'vitest';
import { createProviderRegistry } from './providerRegistry';
import type { JarvisAiProvider } from './provider';

function makeProvider(overrides: Partial<JarvisAiProvider> = {}): JarvisAiProvider {
  return {
    id: 'stub-provider',
    name: 'Stub Provider',
    capabilities: { streaming: false, toolCalling: false },
    complete: async () => ({ text: 'stub', finishReason: 'stop' }),
    ...overrides,
  };
}

describe('createProviderRegistry', () => {
  it('registers a provider and retrieves it by id', () => {
    const registry = createProviderRegistry();
    const provider = makeProvider();

    expect(registry.register(provider)).toEqual({ status: 'ok' });
    expect(registry.get(provider.id)).toBe(provider);
  });

  it('rejects a duplicate provider id deterministically, without overwriting the original', () => {
    const registry = createProviderRegistry();
    const first = makeProvider({ name: 'First' });
    const second = makeProvider({ name: 'Second' });

    expect(registry.register(first)).toEqual({ status: 'ok' });
    const duplicateResult = registry.register(second);

    expect(duplicateResult.status).toBe('error');
    expect(duplicateResult.error).toContain(first.id);
    expect(registry.get(first.id)).toBe(first);
  });

  it('returns undefined for an id that was never registered', () => {
    const registry = createProviderRegistry();
    expect(registry.get('does.not.exist')).toBeUndefined();
  });

  it('lists every registered provider in registration order', () => {
    const registry = createProviderRegistry();
    const a = makeProvider({ id: 'provider-a' });
    const b = makeProvider({ id: 'provider-b' });
    registry.register(a);
    registry.register(b);

    expect(registry.list()).toEqual([a, b]);
  });

  it('starts empty — this phase registers zero real providers', () => {
    expect(createProviderRegistry().list()).toHaveLength(0);
  });

  it('keeps separate registry instances fully independent', () => {
    const registryA = createProviderRegistry();
    const registryB = createProviderRegistry();
    registryA.register(makeProvider({ id: 'only-in-a' }));

    expect(registryA.list()).toHaveLength(1);
    expect(registryB.list()).toHaveLength(0);
  });
});
