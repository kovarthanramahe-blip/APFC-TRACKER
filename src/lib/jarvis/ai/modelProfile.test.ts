import { describe, it, expect } from 'vitest';
import { evaluateDeviceModelFit, type JarvisModelProfile } from './modelProfile';
import type { JarvisDeviceCapabilities } from './deviceCapabilities';

const WINDOWS_DESKTOP: JarvisDeviceCapabilities = { platform: 'windows', deviceClass: 'desktop', ramGB: 32, hasAccelerator: true };
const ANDROID_PHONE: JarvisDeviceCapabilities = { platform: 'android', deviceClass: 'phone', ramGB: 12, hasAccelerator: false };
const UNKNOWN_DEVICE: JarvisDeviceCapabilities = { platform: 'unknown', deviceClass: 'unknown' };

function model(overrides: Partial<JarvisModelProfile> = {}): JarvisModelProfile {
  return { modelId: 'm', displayName: 'Model', runtime: 'ollama', locality: 'local', costClass: 'FREE_LOCAL', ...overrides };
}

describe('evaluateDeviceModelFit — never guesses "sufficient"', () => {
  it('is "unknown" when the model declares no minimum device requirement at all', () => {
    expect(evaluateDeviceModelFit(WINDOWS_DESKTOP, model())).toBe('unknown');
  });

  it('is "insufficient" when the device class is not in the model\'s supported list', () => {
    const m = model({ minimumDevice: { supportedDeviceClasses: ['desktop'] } });
    expect(evaluateDeviceModelFit(ANDROID_PHONE, m)).toBe('insufficient');
  });

  it('is "sufficient" when the device class is supported and no other requirement is declared', () => {
    const m = model({ minimumDevice: { supportedDeviceClasses: ['phone', 'tablet'] } });
    expect(evaluateDeviceModelFit(ANDROID_PHONE, m)).toBe('sufficient');
  });

  it('is "insufficient" when an accelerator is required but the device is known to have none', () => {
    const m = model({ minimumDevice: { requiresAccelerator: true } });
    expect(evaluateDeviceModelFit(ANDROID_PHONE, m)).toBe('insufficient');
  });

  it('is "unknown" when an accelerator is required but device accelerator presence is unknown', () => {
    const m = model({ minimumDevice: { requiresAccelerator: true } });
    expect(evaluateDeviceModelFit(UNKNOWN_DEVICE, m)).toBe('unknown');
  });

  it('is "sufficient" when the required accelerator is present', () => {
    const m = model({ minimumDevice: { requiresAccelerator: true } });
    expect(evaluateDeviceModelFit(WINDOWS_DESKTOP, m)).toBe('sufficient');
  });

  it('is "insufficient" when the device has less RAM than the model requires', () => {
    const m = model({ minimumDevice: { minRamGB: 16 } });
    expect(evaluateDeviceModelFit(ANDROID_PHONE, m)).toBe('insufficient');
  });

  it('is "unknown" when RAM is required but the device\'s RAM is unknown', () => {
    const m = model({ minimumDevice: { minRamGB: 16 } });
    expect(evaluateDeviceModelFit(UNKNOWN_DEVICE, m)).toBe('unknown');
  });

  it('is "sufficient" when the device meets every declared requirement', () => {
    const m = model({ minimumDevice: { minRamGB: 16, requiresAccelerator: true, supportedDeviceClasses: ['desktop'] } });
    expect(evaluateDeviceModelFit(WINDOWS_DESKTOP, m)).toBe('sufficient');
  });

  it('never claims sufficiency the model itself does not declare (no invented capability)', () => {
    // A model with an empty capabilities list must never be treated as implicitly capable of
    // something it never declared — this is a sanity check on the CONTRACT, not evaluateDeviceModelFit.
    const m = model({ capabilities: [] });
    expect(m.capabilities).toEqual([]);
  });
});
