import type { JarvisAiProvider } from './provider';

export interface JarvisAiProviderRegistrationResult {
  status: 'ok' | 'error';
  /** Present only when status is 'error' — e.g. a duplicate provider id. */
  error?: string;
}

/** A minimal, framework-independent registry of JarvisAiProvider adapters — the AI-provider
 * analogue of toolRegistry.ts's JarvisToolRegistry, same shape and same reasoning for being a
 * factory rather than a module-level singleton (a provider set is assembled configuration, easier
 * to unit test as an independent instance). Holds zero providers by default; this phase never
 * registers a real one. */
export interface JarvisAiProviderRegistry {
  register(provider: JarvisAiProvider): JarvisAiProviderRegistrationResult;
  get(id: string): JarvisAiProvider | undefined;
  list(): readonly JarvisAiProvider[];
}

export function createProviderRegistry(): JarvisAiProviderRegistry {
  const providers = new Map<string, JarvisAiProvider>();

  return {
    register(provider) {
      if (providers.has(provider.id)) {
        return { status: 'error', error: `A provider with id "${provider.id}" is already registered.` };
      }
      providers.set(provider.id, provider);
      return { status: 'ok' };
    },

    get(id) {
      return providers.get(id);
    },

    list() {
      return Array.from(providers.values());
    },
  };
}
