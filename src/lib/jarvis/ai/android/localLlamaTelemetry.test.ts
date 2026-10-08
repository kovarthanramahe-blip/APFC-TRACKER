import { describe, it, expect } from 'vitest';
import { buildTelemetryEvent } from './localLlamaTelemetry';

describe('buildTelemetryEvent — pure construction, never fabricates a figure it cannot derive', () => {
  it('computes tokensPerSecond only when both generatedTokens and generationDurationMs are given and positive', () => {
    const event = buildTelemetryEvent({ modelId: 'stub-model', generatedTokens: 20, generationDurationMs: 2000, now: () => 't' });
    expect(event.tokensPerSecond).toBe(10);
  });

  it('leaves tokensPerSecond undefined when generationDurationMs is missing', () => {
    const event = buildTelemetryEvent({ modelId: 'stub-model', generatedTokens: 20, now: () => 't' });
    expect(event.tokensPerSecond).toBeUndefined();
  });

  it('leaves tokensPerSecond undefined when generatedTokens is zero (never divides by a zero-ish numerator into a fake rate)', () => {
    const event = buildTelemetryEvent({ modelId: 'stub-model', generatedTokens: 0, generationDurationMs: 1000, now: () => 't' });
    expect(event.tokensPerSecond).toBeUndefined();
  });

  it('never fabricates peakNativeMemoryBytes — stays undefined unless explicitly supplied', () => {
    const event = buildTelemetryEvent({ modelId: 'stub-model', now: () => 't' });
    expect(event.peakNativeMemoryBytes).toBeUndefined();
  });

  it('always stamps runtime as android_on_device', () => {
    const event = buildTelemetryEvent({ modelId: 'stub-model', now: () => 't' });
    expect(event.runtime).toBe('android_on_device');
  });

  it('carries errorCode/cancelled through unchanged when supplied', () => {
    const event = buildTelemetryEvent({ modelId: 'stub-model', errorCode: 'timeout', cancelled: false, now: () => 't' });
    expect(event.errorCode).toBe('timeout');
    expect(event.cancelled).toBe(false);
  });

  it('uses the injected now() for recordedAt, for deterministic testing', () => {
    const event = buildTelemetryEvent({ modelId: 'stub-model', now: () => '2026-01-01T00:00:00.000Z' });
    expect(event.recordedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
