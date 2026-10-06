// JARVIS Phase 8.5 — model profile contract (Part 2).
//
// Represents an AI model independently of any vendor or runtime — "vendor-neutral" in the same
// sense ai/types.ts's own header already established for a request/response (see that file: no
// provider-specific field name anywhere). This file never hardcodes which model is "best": that
// is a routing-time decision (crossDeviceRouting.ts), made from whatever real profiles a caller
// supplies, never a fixed recommendation baked in here.
import type { JarvisAiProviderCostClass } from './providerMetadata';
import type { JarvisDeviceCapabilities, JarvisDeviceClass, JarvisModelResourceClass } from './deviceCapabilities';

export type JarvisModelRuntime = 'ollama' | 'android_on_device' | 'cloud_free' | 'unknown';
export type JarvisModelLocality = 'local' | 'cloud';

/** A model's own minimum device requirement — every field optional and compared only when
 * present; a model with no `minimumDevice` at all is simply "fit unknown," never assumed to run
 * anywhere. */
export interface JarvisModelMinimumDevice {
  minRamGB?: number;
  requiresAccelerator?: boolean;
  /** Omitted means "no device-class restriction known," never "runs on every class." */
  supportedDeviceClasses?: readonly JarvisDeviceClass[];
}

export interface JarvisModelProfile {
  modelId: string;
  displayName: string;
  runtime: JarvisModelRuntime;
  /** e.g. "Q4_K_M" — only when the runtime actually reports one. */
  quantization?: string;
  /** A label (e.g. "3B", "7B"), only when actually reported — never inferred from a model's name. */
  parameterClass?: string;
  contextCapacityTokens?: number;
  /** Only ever capabilities an adapter/runtime actually reported for this exact model — never
   * supplemented or assumed from its model family. */
  capabilities?: readonly string[];
  minimumDevice?: JarvisModelMinimumDevice;
  estimatedResourceClass?: JarvisModelResourceClass;
  locality: JarvisModelLocality;
  costClass: JarvisAiProviderCostClass;
}

export type JarvisDeviceModelFit = 'sufficient' | 'insufficient' | 'unknown';

/**
 * Pure, deterministic comparison between a device's real, known capabilities and a model's own
 * declared minimum requirement. Returns `'unknown'` — never a guessed `'sufficient'` — whenever
 * either side lacks the specific piece of information a check would need; `'insufficient'` only
 * once a concrete, known mismatch is found; `'sufficient'` only once every known requirement the
 * model declares has been explicitly checked and met.
 */
export function evaluateDeviceModelFit(device: JarvisDeviceCapabilities, model: JarvisModelProfile): JarvisDeviceModelFit {
  const requirement = model.minimumDevice;
  if (!requirement) return 'unknown';

  if (requirement.supportedDeviceClasses && !requirement.supportedDeviceClasses.includes(device.deviceClass)) {
    return 'insufficient';
  }

  if (requirement.requiresAccelerator) {
    if (device.hasAccelerator === undefined) return 'unknown';
    if (device.hasAccelerator === false) return 'insufficient';
  }

  if (requirement.minRamGB !== undefined) {
    if (device.ramGB === undefined) return 'unknown';
    if (device.ramGB < requirement.minRamGB) return 'insufficient';
  }

  return 'sufficient';
}
