import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noModelBackendConfigured } from './localLlmModelBackend';

describe('noModelBackendConfigured — the only LocalLlmModelBackend this phase ships', () => {
  it('always, deterministically, reports "not_configured" — never a guessed or fabricated model', async () => {
    const first = await noModelBackendConfigured.describeAvailableModel();
    const second = await noModelBackendConfigured.describeAvailableModel();

    expect(first).toEqual({ status: 'not_configured' });
    expect(second).toEqual({ status: 'not_configured' });
  });

  it('never reports "model_found" on its own — a real descriptor can only ever come from a FUTURE real backend, never this one', async () => {
    const result = await noModelBackendConfigured.describeAvailableModel();
    expect(result.status).not.toBe('model_found');
  });
});

describe('localLlmModelBackend.ts — architectural rules this phase requires', () => {
  const source = readFileSync(fileURLToPath(new URL('./localLlmModelBackend.ts', import.meta.url)), 'utf-8');

  it('performs no network call of any kind', () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/axios/i);
  });

  it('never reads/writes a real file or downloads/bundles a model — no filesystem or download API is referenced', () => {
    expect(source).not.toMatch(/readFileSync|writeFileSync|fs\.promises|require\(['"]fs['"]\)/);
    expect(source).not.toMatch(/\.gguf['"]/); // never a literal, hardcoded model filename
  });

  it('never imports an AI/LLM SDK or cloud provider', () => {
    expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai|ollama)/i);
  });
});
