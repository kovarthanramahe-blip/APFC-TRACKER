// JARVIS Phase 8.5 — device capability contract (Part 1).
//
// Provider-independent, hardware-independent TYPES ONLY, plus one safe constructor. Nothing here
// reads real hardware (no `navigator`, no `os` module, no device-detection library) — Phase 8's
// own HARDWARE_READINESS.md already established that hardware detection does not belong in this
// application, and this phase does not reverse that. Every field is optional specifically so
// "unknown" has a real representation (`undefined`) distinct from a guessed value; nothing here
// defaults a field to a plausible-looking number for a named device (e.g. "a Samsung S24 Ultra
// probably has 12GB RAM") — that would be exactly the invented-hardware-value this phase's own
// brief forbids. Real device profiles are supplied by a caller (today, only as explicit test
// fixtures — see Part 9) from data it has actually confirmed.
export type JarvisDevicePlatform = 'windows' | 'android' | 'unknown';
export type JarvisDeviceClass = 'desktop' | 'phone' | 'tablet' | 'unknown';

/** A coarse, qualitative resource tier — deliberately NOT tied to a specific parameter count or
 * byte threshold (this phase's own brief: never invent a numeric hardware/model fact). Shared
 * between a device's own "biggest model I could plausibly run" and a model's own "how demanding
 * am I" self-description (modelProfile.ts), so the two can be compared without either file owning
 * the other's concept. */
export type JarvisModelResourceClass = 'tiny' | 'small' | 'medium' | 'large' | 'unknown';

export interface JarvisDeviceCapabilities {
  platform: JarvisDevicePlatform;
  deviceClass: JarvisDeviceClass;
  /** Gigabytes, only when actually supplied — `undefined` means unknown, never a guessed figure. */
  ramGB?: number;
  /** Whether a GPU/NPU/other accelerator is present, only when actually known. */
  hasAccelerator?: boolean;
  /** Free-text accelerator description (e.g. "NVIDIA GPU", "Qualcomm Adreno GPU"), only when
   * actually known — never enumerated from a fixed list of "likely" accelerators per platform. */
  acceleratorType?: string;
  storageAvailableGB?: number;
  /** Whether this device can run ANY local model at all, only when actually known. */
  localInferenceCapable?: boolean;
  /** The largest resource tier a model could plausibly run well on this device, only when
   * actually known — never derived automatically from `ramGB` by this file (that derivation would
   * itself be an invented heuristic; a caller who has verified this supplies it directly). */
  maxPracticalModelClass?: JarvisModelResourceClass;
  offlineCapable?: boolean;
  streamingCapable?: boolean;
  documentProcessingCapable?: boolean;
}

/** The only safe default this file provides: everything genuinely unknown. Never a starting point
 * a caller is meant to selectively "fill in" with guesses — every field left unset here stays
 * unset until something has actually confirmed it. */
export function createUnknownDeviceCapabilities(): JarvisDeviceCapabilities {
  return { platform: 'unknown', deviceClass: 'unknown' };
}

/** True only once BOTH platform and deviceClass are no longer 'unknown' — a cheap sanity check a
 * caller can use before trusting a capabilities object enough to route on it at all. Never implies
 * every optional field is populated too. */
export function isKnownDevice(capabilities: JarvisDeviceCapabilities): boolean {
  return capabilities.platform !== 'unknown' && capabilities.deviceClass !== 'unknown';
}
