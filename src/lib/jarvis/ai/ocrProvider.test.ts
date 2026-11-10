import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fakes the tesseract.js module entirely (vi.mock) — the same "inject/fake the real backend, test
// the wrapper's own logic" convention this codebase already uses for localEmbeddingProvider.test.ts
// and the Android local LLM's fixtureRuntime. This verifies loadWorker's singleton/retry behaviour
// and recognize()'s own shape validation — it does NOT verify the real OCR/network path, which
// cannot run in any sandbox without internet access to cdn.jsdelivr.net (see ocrProvider.ts's own
// header).
const createWorkerMock = vi.fn();

vi.mock('tesseract.js', () => ({
  createWorker: createWorkerMock,
}));

describe('createOcrProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    createWorkerMock.mockReset();
  });

  it('recognize() loads the worker with the documented language and returns the real text/confidence', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: 'Recognised text', confidence: 92 } });
    createWorkerMock.mockResolvedValue({ recognize });

    const { createOcrProvider, OCR_LANGUAGE } = await import('./ocrProvider');
    const provider = createOcrProvider();
    const image = new Blob(['fake image bytes']);
    const result = await provider.recognize(image);

    expect(createWorkerMock).toHaveBeenCalledWith(OCR_LANGUAGE);
    expect(recognize).toHaveBeenCalledWith(image);
    expect(result).toEqual({ text: 'Recognised text', confidence: 92 });
  });

  it('loads the worker only once across multiple recognize() calls (caches it, never reloads)', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: 'x', confidence: 50 } });
    createWorkerMock.mockResolvedValue({ recognize });

    const { createOcrProvider } = await import('./ocrProvider');
    const provider = createOcrProvider();
    await provider.recognize(new Blob(['a']));
    await provider.recognize(new Blob(['b']));

    expect(createWorkerMock).toHaveBeenCalledTimes(1);
  });

  it('defaults confidence to 0 (never fabricates a plausible-looking number) when the result omits it', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: 'some text' } });
    createWorkerMock.mockResolvedValue({ recognize });

    const { createOcrProvider } = await import('./ocrProvider');
    const provider = createOcrProvider();
    const result = await provider.recognize(new Blob(['a']));
    expect(result.confidence).toBe(0);
  });

  it('throws, never returns a fabricated empty success, when the result is missing text entirely', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: {} });
    createWorkerMock.mockResolvedValue({ recognize });

    const { createOcrProvider } = await import('./ocrProvider');
    const provider = createOcrProvider();
    await expect(provider.recognize(new Blob(['a']))).rejects.toThrow(/malformed result/);
  });
});

describe('isOcrModelReachable', () => {
  beforeEach(() => {
    vi.resetModules();
    createWorkerMock.mockReset();
  });

  it('resolves true when the worker loads successfully', async () => {
    createWorkerMock.mockResolvedValue({ recognize: vi.fn() });
    const { isOcrModelReachable } = await import('./ocrProvider');
    expect(await isOcrModelReachable()).toBe(true);
  });

  it('resolves false (never throws to the caller) when the worker fails to load — e.g. no network to cdn.jsdelivr.net', async () => {
    createWorkerMock.mockRejectedValue(new Error('network unavailable'));
    const { isOcrModelReachable } = await import('./ocrProvider');
    expect(await isOcrModelReachable()).toBe(false);
  });

  it('a failed load does not poison future attempts — a later successful load still works', async () => {
    createWorkerMock.mockRejectedValueOnce(new Error('transient failure'));
    const { isOcrModelReachable, createOcrProvider } = await import('./ocrProvider');
    expect(await isOcrModelReachable()).toBe(false);

    const recognize = vi.fn().mockResolvedValue({ data: { text: 'retry now works', confidence: 80 } });
    createWorkerMock.mockResolvedValueOnce({ recognize });
    const provider = createOcrProvider();
    const result = await provider.recognize(new Blob(['a']));
    expect(result.text).toBe('retry now works');
  });
});
