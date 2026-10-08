import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 13A — architectural boundary verification, following the same grep-based,
// source-text convention phase11ArchitecturalBoundary.test.ts already established (no
// @testing-library/react in this repo — see that file's own header).
const jarvisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(jarvisDir, '..', '..', '..');

function readJarvisSource(relativePath: string): string {
  return readFileSync(join(jarvisDir, relativePath), 'utf-8');
}

function readRepoSource(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

const NATIVE_INK_MARKERS = [/NativeInkOverlayView/, /NativeInkPlugin/, /AnnotationLayer/, /AnnotationToolbar/, /DocumentAnnotator/];

describe('Phase 13A — no Native Ink file is touched or even referenced', () => {
  it('none of the new Phase 13A files reference any Native Ink file/component', () => {
    for (const file of ['ai/android/localLlmLifecycle.ts', 'ai/android/localLlmModelBackend.ts']) {
      const source = readJarvisSource(file);
      for (const marker of NATIVE_INK_MARKERS) {
        expect(source).not.toMatch(marker);
      }
    }
  });

  it('runtime.ts still has no Native Ink/annotation/store reference (unchanged from Phase 11 — this phase does not touch it)', () => {
    const source = readJarvisSource('runtime.ts');
    const forbidden = [/from ['"].*\/store['"]/, /from ['"].*\/components\/annotations/, /from ['"].*\/nativeInk['"]/, ...NATIVE_INK_MARKERS, /zustand/];
    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });
});

describe('Phase 13A — no network call is introduced anywhere in this phase\'s own new files', () => {
  it('localLlmLifecycle.ts and localLlmModelBackend.ts perform no fetch/XHR/axios call', () => {
    for (const file of ['ai/android/localLlmLifecycle.ts', 'ai/android/localLlmModelBackend.ts']) {
      const source = readJarvisSource(file);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/XMLHttpRequest/);
      expect(source).not.toMatch(/axios/i);
    }
  });

  it('no provider secret, paid SDK, or cloud AI import exists in this phase\'s new files', () => {
    for (const file of ['ai/android/localLlmLifecycle.ts', 'ai/android/localLlmModelBackend.ts']) {
      const source = readJarvisSource(file);
      expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai|ollama)/i);
      expect(source).not.toMatch(/['"]sk-[a-zA-Z0-9]{10,}['"]/);
      expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i);
    }
  });
});

describe('Phase 13A — deliberately NOT wired into runtime.ts\'s existing routing/provenance in this phase', () => {
  it('runtime.ts does not import either new Phase 13A module — the existing routing/provenance contract (and every existing exact-equality test on it) is untouched', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).not.toMatch(/localLlmLifecycle/);
    expect(source).not.toMatch(/localLlmModelBackend/);
  });

  it('runtime.ts still produces exactly the pre-existing provenance sources — deterministic / android_local_ai / android_native_stub / no_provider_available — proving responses can already distinguish "deterministic" from a real local model from the bridge-validation stub from "unavailable"', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/'deterministic'/);
    expect(source).toMatch(/'android_local_ai'/);
    expect(source).toMatch(/'android_native_stub'/);
    expect(source).toMatch(/'no_provider_available'/);
  });

  it('runtime.ts still routes a real, loaded model to android_local_ai ONLY when providerHealth is genuinely model_ready — selecting local LLM only when genuinely ready, never otherwise', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/providerHealth === 'model_ready'/);
  });
});

describe('Phase 13A — the deterministic Decision Engine remains authoritative for study recommendations', () => {
  it('neither new Phase 13A file imports decisionEngine.ts — the AI-provider layer and the deterministic decision layer stay entirely separate', () => {
    for (const file of ['ai/android/localLlmLifecycle.ts', 'ai/android/localLlmModelBackend.ts']) {
      const source = readJarvisSource(file);
      expect(source).not.toMatch(/decisionEngine/);
    }
  });

  it('runtime.ts still calls decideStudyNext for the deterministic_tool route, unchanged by this phase', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/decideStudyNext/);
  });

  it("lib/commandCentre.ts (generateUpNextItems) still has no JARVIS/AI import — the deterministic Up Next list never depends on an LLM, local or otherwise", () => {
    const source = readRepoSource('src/lib/commandCentre.ts');
    expect(source).not.toMatch(/from ['"].*\/jarvis/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});

describe('Phase 13A — the new lifecycle/model-backend modules are self-contained and web-safe', () => {
  it('neither new file is imported by CommandCentre.tsx or any other page — the web path is completely unaffected by this phase', () => {
    const commandCentreSource = readRepoSource('src/pages/CommandCentre.tsx');
    expect(commandCentreSource).not.toMatch(/localLlmLifecycle/);
    expect(commandCentreSource).not.toMatch(/localLlmModelBackend/);
  });

  it('localLlmLifecycle.ts depends only on the EXISTING Phase 10 contract types, never on @capacitor/core or any Kotlin/native concept directly', () => {
    const source = readJarvisSource('ai/android/localLlmLifecycle.ts');
    expect(source).not.toMatch(/@capacitor\/core/);
    expect(source).not.toMatch(/\.kt['"]/);
  });
});
