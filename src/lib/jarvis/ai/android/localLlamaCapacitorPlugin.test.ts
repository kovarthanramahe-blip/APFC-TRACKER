import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// isLocalLlamaRuntimeAvailable is a module-level constant computed from Capacitor's own
// isNativePlatform()/getPlatform() — exactly like lib/nativeInk.ts's own isNativeInkAvailable.
// Each scenario below mocks '@capacitor/core' and re-imports the module fresh, since the gate is
// computed once at import time, not re-evaluated per call.
describe('isLocalLlamaRuntimeAvailable — platform gate (never assumes native availability)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@capacitor/core');
  });

  it('is true only on native Android', async () => {
    vi.doMock('@capacitor/core', () => ({
      registerPlugin: () => ({}),
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    }));
    const { isLocalLlamaRuntimeAvailable } = await import('./localLlamaCapacitorPlugin');
    expect(isLocalLlamaRuntimeAvailable).toBe(true);
  });

  it('is false on native iOS (no iOS implementation exists in this phase)', async () => {
    vi.doMock('@capacitor/core', () => ({
      registerPlugin: () => ({}),
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
    }));
    const { isLocalLlamaRuntimeAvailable } = await import('./localLlamaCapacitorPlugin');
    expect(isLocalLlamaRuntimeAvailable).toBe(false);
  });

  it('is false on the web (not a native platform at all)', async () => {
    vi.doMock('@capacitor/core', () => ({
      registerPlugin: () => ({}),
      Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
    }));
    const { isLocalLlamaRuntimeAvailable } = await import('./localLlamaCapacitorPlugin');
    expect(isLocalLlamaRuntimeAvailable).toBe(false);
  });

  it('registers the plugin under the exact name "LocalLlamaRuntime" the Kotlin side expects', async () => {
    const registerPluginSpy = vi.fn(() => ({}));
    vi.doMock('@capacitor/core', () => ({
      registerPlugin: registerPluginSpy,
      Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
    }));
    await import('./localLlamaCapacitorPlugin');
    expect(registerPluginSpy).toHaveBeenCalledWith('LocalLlamaRuntime');
  });
});
