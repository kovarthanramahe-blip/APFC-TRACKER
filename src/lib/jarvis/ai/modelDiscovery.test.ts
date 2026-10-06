import { describe, it, expect } from 'vitest';
import { mapOllamaTagsModelToInfo, extractContextLengthTokens, enrichModelInfoWithShowResponse } from './modelDiscovery';
import type { OllamaTagsModel, OllamaShowResponse } from './localRuntime';

describe('mapOllamaTagsModelToInfo — real /api/tags mapping, no invented fields', () => {
  it('maps identifier/displayName/size/parameterSize/quantizationLevel from a real tags entry', () => {
    const raw: OllamaTagsModel = {
      name: 'llama3.2:latest',
      model: 'llama3.2:latest',
      modified_at: '2025-01-01T00:00:00Z',
      size: 2_019_393_189,
      digest: 'sha256:abc',
      details: { parameter_size: '3.2B', quantization_level: 'Q4_K_M', family: 'llama' },
    };
    const info = mapOllamaTagsModelToInfo(raw);
    expect(info).toEqual({
      identifier: 'llama3.2:latest',
      displayName: 'llama3.2:latest',
      sizeBytes: 2_019_393_189,
      parameterSize: '3.2B',
      quantizationLevel: 'Q4_K_M',
      available: true,
    });
  });

  it('leaves size/parameterSize/quantizationLevel undefined (never zero/empty-string) when not reported', () => {
    const raw: OllamaTagsModel = { name: 'tinymodel', model: 'tinymodel', modified_at: 't', size: undefined as unknown as number, digest: 'd' };
    const info = mapOllamaTagsModelToInfo(raw);
    expect(info.sizeBytes).toBeUndefined();
    expect(info.parameterSize).toBeUndefined();
  });

  it('never claims availability beyond what a real listing entry represents — always true for a listed model', () => {
    const raw: OllamaTagsModel = { name: 'm', model: 'm', modified_at: 't', size: 1, digest: 'd' };
    expect(mapOllamaTagsModelToInfo(raw).available).toBe(true);
  });
});

describe('extractContextLengthTokens — never assumes one family prefix', () => {
  it('finds a context length under a llama-family key', () => {
    expect(extractContextLengthTokens({ 'llama.context_length': 8192 })).toBe(8192);
  });

  it('finds a context length under a differently-prefixed family key, without hardcoding "llama"', () => {
    expect(extractContextLengthTokens({ 'qwen2.context_length': 32768 })).toBe(32768);
  });

  it('returns undefined (never a guessed number) when no matching key exists', () => {
    expect(extractContextLengthTokens({ 'llama.vocab_size': 128256 })).toBeUndefined();
  });

  it('returns undefined when model_info itself is absent', () => {
    expect(extractContextLengthTokens(undefined)).toBeUndefined();
  });

  it('ignores a matching key whose value is not a plain number', () => {
    expect(extractContextLengthTokens({ 'llama.context_length': '8192' })).toBeUndefined();
  });
});

describe('enrichModelInfoWithShowResponse — additive only, never overwrites listing-derived facts', () => {
  const base = mapOllamaTagsModelToInfo({ name: 'llama3.2:latest', model: 'llama3.2:latest', modified_at: 't', size: 100, digest: 'd' });

  it('adds contextLengthTokens and capabilities from a real /api/show response', () => {
    const show: OllamaShowResponse = { capabilities: ['completion'], model_info: { 'llama.context_length': 8192 } };
    const enriched = enrichModelInfoWithShowResponse(base, show);
    expect(enriched.contextLengthTokens).toBe(8192);
    expect(enriched.capabilities).toEqual(['completion']);
    expect(enriched.identifier).toBe(base.identifier);
    expect(enriched.available).toBe(true);
  });

  it('never fabricates capabilities when /api/show reports none', () => {
    const enriched = enrichModelInfoWithShowResponse(base, {});
    expect(enriched.capabilities).toBeUndefined();
    expect(enriched.contextLengthTokens).toBeUndefined();
  });
});
