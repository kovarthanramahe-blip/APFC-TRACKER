// JARVIS Phase 10 — performance telemetry CONTRACT only (Step 12).
//
// Prepared for the next, dedicated benchmark phase — nothing in this file collects, stores, or
// transmits telemetry, and nothing in this phase calls buildTelemetryEvent anywhere outside its
// own test. No dashboard, no persistence, no network call. Every numeric field is optional: a
// field this phase's own stub cannot honestly measure (e.g. native memory) stays `undefined`
// rather than a fabricated number.
export interface JarvisLocalLlamaTelemetryEvent {
  /** ISO timestamp of when this event was recorded. */
  recordedAt: string;
  deviceId?: string;
  modelId: string;
  runtime: 'android_on_device';
  modelLoadTimeMs?: number;
  firstTokenLatencyMs?: number;
  tokensPerSecond?: number;
  promptTokens?: number;
  generatedTokens?: number;
  /** Bytes — only when the native layer can actually report it (it cannot yet; the stub never
   * supplies this field). */
  peakNativeMemoryBytes?: number;
  /** Present only when the request ended in an error — never populated alongside a successful
   * completion. */
  errorCode?: string;
  cancelled?: boolean;
}

export interface BuildTelemetryEventInput {
  modelId: string;
  deviceId?: string;
  modelLoadTimeMs?: number;
  firstTokenLatencyMs?: number;
  promptTokens?: number;
  generatedTokens?: number;
  /** Wall-clock milliseconds spent generating `generatedTokens` — used only to derive
   * tokensPerSecond; never stored itself. */
  generationDurationMs?: number;
  peakNativeMemoryBytes?: number;
  errorCode?: string;
  cancelled?: boolean;
  /** Injected for deterministic testing — defaults to `new Date().toISOString()`. */
  now?: () => string;
}

/**
 * Pure, deterministic construction of one telemetry event — never computes tokensPerSecond when
 * either side of the division is missing or non-positive (an absent or zero duration/count stays
 * an absent `tokensPerSecond`, never a divide-by-zero or a fabricated rate).
 */
export function buildTelemetryEvent(input: BuildTelemetryEventInput): JarvisLocalLlamaTelemetryEvent {
  const now = input.now ?? (() => new Date().toISOString());
  const tokensPerSecond =
    input.generatedTokens !== undefined && input.generationDurationMs !== undefined && input.generatedTokens > 0 && input.generationDurationMs > 0
      ? input.generatedTokens / (input.generationDurationMs / 1000)
      : undefined;

  return {
    recordedAt: now(),
    deviceId: input.deviceId,
    modelId: input.modelId,
    runtime: 'android_on_device',
    modelLoadTimeMs: input.modelLoadTimeMs,
    firstTokenLatencyMs: input.firstTokenLatencyMs,
    tokensPerSecond,
    promptTokens: input.promptTokens,
    generatedTokens: input.generatedTokens,
    peakNativeMemoryBytes: input.peakNativeMemoryBytes,
    errorCode: input.errorCode,
    cancelled: input.cancelled,
  };
}
