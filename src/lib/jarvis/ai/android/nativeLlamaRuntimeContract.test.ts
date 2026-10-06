import { describe, it, expect } from 'vitest';
import { toAndroidProviderHealthStatus, type JarvisAndroidRuntimeStatus } from './nativeLlamaRuntimeContract';

describe('toAndroidProviderHealthStatus — bridges to Phase 6\'s existing 5-state contract', () => {
  const cases: Array<[JarvisAndroidRuntimeStatus, boolean, string]> = [
    ['unavailable', false, 'unavailable'],
    ['unavailable', true, 'unavailable'],
    ['available', false, 'available'],
    ['loading', false, 'available'],
    ['error', false, 'error'],
    ['ready', true, 'model_ready'],
    ['ready', false, 'error'],
  ];

  for (const [status, hasLoadedModel, expected] of cases) {
    it(`maps (${status}, hasLoadedModel=${hasLoadedModel}) -> ${expected}`, () => {
      expect(toAndroidProviderHealthStatus(status, hasLoadedModel)).toBe(expected);
    });
  }
});
