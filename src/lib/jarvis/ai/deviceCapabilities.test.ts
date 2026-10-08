import { describe, it, expect } from 'vitest';
import { createUnknownDeviceCapabilities, isKnownDevice, type JarvisDeviceCapabilities } from './deviceCapabilities';

// Explicit fixtures only (Part 9's own instruction) — these are illustrative test data, never a
// claim about the user's actual Windows PC, Samsung S24 Ultra, or Xiaomi Pad 6. Production code
// (deviceCapabilities.ts itself) never hardcodes any of these numbers.
const WINDOWS_DESKTOP_FIXTURE: JarvisDeviceCapabilities = {
  platform: 'windows',
  deviceClass: 'desktop',
  ramGB: 32,
  hasAccelerator: true,
  acceleratorType: 'NVIDIA GPU',
  storageAvailableGB: 500,
  localInferenceCapable: true,
  maxPracticalModelClass: 'large',
  offlineCapable: true,
  streamingCapable: true,
  documentProcessingCapable: true,
};

const ANDROID_PHONE_FIXTURE: JarvisDeviceCapabilities = {
  platform: 'android',
  deviceClass: 'phone',
  ramGB: 12,
  hasAccelerator: false,
  storageAvailableGB: 64,
  localInferenceCapable: true,
  maxPracticalModelClass: 'small',
  offlineCapable: true,
  streamingCapable: true,
  documentProcessingCapable: true,
};

const ANDROID_TABLET_FIXTURE: JarvisDeviceCapabilities = {
  platform: 'android',
  deviceClass: 'tablet',
  ramGB: 8,
  hasAccelerator: false,
  storageAvailableGB: 32,
  localInferenceCapable: true,
  maxPracticalModelClass: 'small',
  offlineCapable: true,
  streamingCapable: true,
  documentProcessingCapable: true,
};

describe('Windows capability profile fixture', () => {
  it('represents a desktop with a known accelerator and a large max practical model class', () => {
    expect(WINDOWS_DESKTOP_FIXTURE.platform).toBe('windows');
    expect(WINDOWS_DESKTOP_FIXTURE.deviceClass).toBe('desktop');
    expect(WINDOWS_DESKTOP_FIXTURE.maxPracticalModelClass).toBe('large');
  });
});

describe('Android phone capability profile fixture', () => {
  it('represents a phone with no accelerator and a small max practical model class', () => {
    expect(ANDROID_PHONE_FIXTURE.platform).toBe('android');
    expect(ANDROID_PHONE_FIXTURE.deviceClass).toBe('phone');
    expect(ANDROID_PHONE_FIXTURE.hasAccelerator).toBe(false);
    expect(ANDROID_PHONE_FIXTURE.maxPracticalModelClass).toBe('small');
  });
});

describe('Android tablet capability profile fixture', () => {
  it('represents a tablet, distinct from a phone, with its own (lower) RAM figure', () => {
    expect(ANDROID_TABLET_FIXTURE.platform).toBe('android');
    expect(ANDROID_TABLET_FIXTURE.deviceClass).toBe('tablet');
    expect(ANDROID_TABLET_FIXTURE.ramGB).toBeLessThan(ANDROID_PHONE_FIXTURE.ramGB!);
  });
});

describe('createUnknownDeviceCapabilities — unknown hardware, never a guess', () => {
  it('leaves platform and deviceClass as "unknown", and every optional field unset', () => {
    const unknown = createUnknownDeviceCapabilities();
    expect(unknown.platform).toBe('unknown');
    expect(unknown.deviceClass).toBe('unknown');
    expect(unknown.ramGB).toBeUndefined();
    expect(unknown.hasAccelerator).toBeUndefined();
    expect(unknown.maxPracticalModelClass).toBeUndefined();
  });

  it('never invents a RAM/storage/accelerator value for the unknown default', () => {
    const unknown = createUnknownDeviceCapabilities();
    expect(Object.keys(unknown)).toEqual(['platform', 'deviceClass']);
  });
});

describe('isKnownDevice', () => {
  it('is false for the unknown default', () => {
    expect(isKnownDevice(createUnknownDeviceCapabilities())).toBe(false);
  });

  it('is true once both platform and deviceClass are known, even with every other field unset', () => {
    expect(isKnownDevice({ platform: 'windows', deviceClass: 'desktop' })).toBe(true);
  });

  it('is false when only one of platform/deviceClass is known', () => {
    expect(isKnownDevice({ platform: 'android', deviceClass: 'unknown' })).toBe(false);
    expect(isKnownDevice({ platform: 'unknown', deviceClass: 'phone' })).toBe(false);
  });
});
