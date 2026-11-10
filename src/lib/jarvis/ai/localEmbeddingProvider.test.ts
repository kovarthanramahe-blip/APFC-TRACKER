import { describe, it, expect, vi, beforeEach } from 'vitest';

// These tests fake the @huggingface/transformers module entirely (vi.mock) — exactly the same
// "inject/fake the real backend, test the wrapper's own logic" convention this codebase already
// uses for the Android local LLM (fixtureRuntime in nativeLlamaRuntime.test.ts). This verifies
// the shape-validation, lazy-loading, and failure-retry logic in localEmbeddingProvider.ts
// itself — it does NOT verify the real model/network path, which cannot run in any sandbox
// without internet access to huggingface.co (see that file's own header).
const pipelineMock = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: pipelineMock,
}));

describe('createLocalEmbeddingProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    pipelineMock.mockReset();
  });

  it('reports its real id and dimensions, matching the documented MiniLM-L6-v2 output shape', async () => {
    const { createLocalEmbeddingProvider, LOCAL_EMBEDDING_MODEL_ID, LOCAL_EMBEDDING_DIMENSIONS } = await import('./localEmbeddingProvider');
    const provider = createLocalEmbeddingProvider();
    expect(provider.id).toBe(LOCAL_EMBEDDING_MODEL_ID);
    expect(provider.dimensions).toBe(LOCAL_EMBEDDING_DIMENSIONS);
    expect(LOCAL_EMBEDDING_DIMENSIONS).toBe(384);
  });

  it('embed([]) returns [] without ever calling the pipeline at all', async () => {
    const { createLocalEmbeddingProvider } = await import('./localEmbeddingProvider');
    const provider = createLocalEmbeddingProvider();
    const result = await provider.embed([]);
    expect(result).toEqual([]);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('embed() calls the pipeline with pooling/normalize and returns real-shaped vectors on well-formed output', async () => {
    const extractor = vi.fn().mockResolvedValue({
      tolist: () => [
        Array.from({ length: 384 }, () => 0.1),
        Array.from({ length: 384 }, () => 0.2),
      ],
    });
    pipelineMock.mockResolvedValue(extractor);

    const { createLocalEmbeddingProvider } = await import('./localEmbeddingProvider');
    const provider = createLocalEmbeddingProvider();
    const result = await provider.embed(['first text', 'second text']);

    expect(pipelineMock).toHaveBeenCalledWith('feature-extraction', 'onnx-community/all-MiniLM-L6-v2-ONNX');
    expect(extractor).toHaveBeenCalledWith(['first text', 'second text'], { pooling: 'mean', normalize: true });
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(384);
  });

  it('loads the pipeline only once across multiple embed() calls (caches the model, never reloads)', async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [Array.from({ length: 384 }, () => 0)] });
    pipelineMock.mockResolvedValue(extractor);

    const { createLocalEmbeddingProvider } = await import('./localEmbeddingProvider');
    const provider = createLocalEmbeddingProvider();
    await provider.embed(['a']);
    await provider.embed(['b']);

    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it('throws, never returns a truncated/fabricated result, when the model returns the wrong number of rows', async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [Array.from({ length: 384 }, () => 0)] });
    pipelineMock.mockResolvedValue(extractor);

    const { createLocalEmbeddingProvider } = await import('./localEmbeddingProvider');
    const provider = createLocalEmbeddingProvider();
    await expect(provider.embed(['first', 'second'])).rejects.toThrow(/rows/);
  });

  it('throws when a returned vector has the wrong dimension count', async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [[1, 2, 3]] });
    pipelineMock.mockResolvedValue(extractor);

    const { createLocalEmbeddingProvider } = await import('./localEmbeddingProvider');
    const provider = createLocalEmbeddingProvider();
    await expect(provider.embed(['text'])).rejects.toThrow(/malformed vector/);
  });

  it('throws when a returned vector contains a non-finite number, never passing NaN/Infinity into cosine similarity downstream', async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [[...Array(383).fill(0), NaN]] });
    pipelineMock.mockResolvedValue(extractor);

    const { createLocalEmbeddingProvider } = await import('./localEmbeddingProvider');
    const provider = createLocalEmbeddingProvider();
    await expect(provider.embed(['text'])).rejects.toThrow(/malformed vector/);
  });
});

describe('isLocalEmbeddingModelReachable', () => {
  beforeEach(() => {
    vi.resetModules();
    pipelineMock.mockReset();
  });

  it('resolves true when the pipeline loads successfully', async () => {
    pipelineMock.mockResolvedValue(vi.fn());
    const { isLocalEmbeddingModelReachable } = await import('./localEmbeddingProvider');
    expect(await isLocalEmbeddingModelReachable()).toBe(true);
  });

  it('resolves false (never throws to the caller) when the model fails to load — e.g. no network', async () => {
    pipelineMock.mockRejectedValue(new Error('network unavailable'));
    const { isLocalEmbeddingModelReachable } = await import('./localEmbeddingProvider');
    expect(await isLocalEmbeddingModelReachable()).toBe(false);
  });

  it('a failed load does not poison future attempts — a later successful load still works', async () => {
    pipelineMock.mockRejectedValueOnce(new Error('transient failure'));
    const { isLocalEmbeddingModelReachable, createLocalEmbeddingProvider } = await import('./localEmbeddingProvider');
    expect(await isLocalEmbeddingModelReachable()).toBe(false);

    const extractor = vi.fn().mockResolvedValue({ tolist: () => [Array.from({ length: 384 }, () => 0)] });
    pipelineMock.mockResolvedValueOnce(extractor);
    const provider = createLocalEmbeddingProvider();
    const result = await provider.embed(['retry now works']);
    expect(result).toHaveLength(1);
  });
});
