import { describe, it, expect } from 'vitest';
import { isDefaultEligible, isReadyForInference, type JarvisAiProviderMetadata } from './providerMetadata';

function makeMetadata(overrides: Partial<JarvisAiProviderMetadata> = {}): JarvisAiProviderMetadata {
  return {
    providerId: 'local-stub',
    displayName: 'Local Stub',
    classification: 'local',
    costClass: 'FREE_LOCAL',
    streaming: false,
    toolCalling: false,
    contextCapacityTokens: null,
    health: 'unavailable',
    ...overrides,
  };
}

describe('provider classification', () => {
  it('classifies a local provider distinctly from a cloud one', () => {
    const local = makeMetadata({ classification: 'local' });
    const cloud = makeMetadata({ classification: 'cloud', costClass: 'FREE_CLOUD_OPTIONAL' });
    expect(local.classification).toBe('local');
    expect(cloud.classification).toBe('cloud');
  });

  it('never fabricates a context capacity when unknown', () => {
    const metadata = makeMetadata({ contextCapacityTokens: null });
    expect(metadata.contextCapacityTokens).toBeNull();
  });
});

describe('isDefaultEligible — provider selection', () => {
  it('is eligible for FREE_LOCAL, FREE_DETERMINISTIC, and FREE_CLOUD_OPTIONAL', () => {
    expect(isDefaultEligible(makeMetadata({ costClass: 'FREE_LOCAL' }))).toBe(true);
    expect(isDefaultEligible(makeMetadata({ costClass: 'FREE_DETERMINISTIC' }))).toBe(true);
    expect(isDefaultEligible(makeMetadata({ costClass: 'FREE_CLOUD_OPTIONAL' }))).toBe(true);
  });

  it('is never eligible for PAID_OPTIONAL — the one invariant this function exists to enforce', () => {
    expect(isDefaultEligible(makeMetadata({ costClass: 'PAID_OPTIONAL' }))).toBe(false);
  });
});

describe('isReadyForInference', () => {
  it('is true only for model_ready', () => {
    expect(isReadyForInference(makeMetadata({ health: 'model_ready' }))).toBe(true);
  });

  it('is false for every other health state, including "available" (reachable but not confirmed loaded)', () => {
    for (const health of ['unavailable', 'available', 'model_missing', 'error'] as const) {
      expect(isReadyForInference(makeMetadata({ health }))).toBe(false);
    }
  });
});
