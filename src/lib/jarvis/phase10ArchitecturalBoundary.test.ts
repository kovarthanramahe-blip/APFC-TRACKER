import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 10 — architectural boundary verification (Step 9, items 9-11).
//
// This layer has NO network dependency at all (unlike ai/localRuntime.ts's Ollama HTTP client) —
// everything crosses the Capacitor bridge, never fetch()/XMLHttpRequest. It also must never import
// Native Ink/annotation code (Phase 10's own rule 3: "sacred and completely out of scope") or any
// AI provider SDK/secret.
const dir = dirname(fileURLToPath(import.meta.url));

const PHASE_10_SOURCE_FILES = [
  'ai/android/nativeLlamaRuntimeContract.ts',
  'ai/android/localLlamaCapacitorPlugin.ts',
  'ai/android/nativeLlamaRuntime.ts',
  'ai/android/androidLocalLlamaProvider.ts',
  'ai/android/localLlamaTelemetry.ts',
];

function readPhase10Source(relativePath: string): string {
  return readFileSync(join(dir, relativePath), 'utf-8');
}

describe('Phase 10 — no network dependency for the local Android provider', () => {
  for (const file of PHASE_10_SOURCE_FILES) {
    it(`${file} performs no fetch/XHR/network call — everything crosses the Capacitor bridge`, () => {
      const source = readPhase10Source(file);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/XMLHttpRequest/);
      expect(source).not.toMatch(/localhost|127\.0\.0\.1/);
    });
  }
});

describe('Phase 10 — no provider secret, no paid AI SDK', () => {
  for (const file of PHASE_10_SOURCE_FILES) {
    it(`${file} contains no provider secret or paid SDK import`, () => {
      const source = readPhase10Source(file);
      expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai|ollama)/i);
      expect(source).not.toMatch(/require\(['"].*(openai|anthropic|@google\/genai|ollama)/i);
      expect(source).not.toMatch(/['"]sk-[a-zA-Z0-9]{10,}['"]/);
      expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i);
    });
  }
});

describe('Phase 10 — Native Ink / annotation code is sacred and completely out of scope', () => {
  const FORBIDDEN_PATTERNS = [
    /from ['"].*\/store['"]/,
    /from ['"].*\/components\/annotations/,
    /from ['"].*\/nativeInk['"]/,
    /NativeInkOverlayView|NativeInkPlugin|AnnotationLayer|AnnotationToolbar|DocumentAnnotator/,
    /zustand/,
  ];

  for (const file of PHASE_10_SOURCE_FILES) {
    it(`${file} never imports Native Ink, annotation, or Zustand-store code`, () => {
      const source = readPhase10Source(file);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

describe('Phase 10 — @capacitor/core is reached from exactly one file', () => {
  it('only localLlamaCapacitorPlugin.ts imports @capacitor/core — every other Phase 10 file depends on its own typed contract only', () => {
    for (const file of PHASE_10_SOURCE_FILES) {
      const source = readPhase10Source(file);
      const importsCapacitorCore = /from ['"]@capacitor\/core['"]/.test(source);
      if (file === 'ai/android/localLlamaCapacitorPlugin.ts') {
        expect(importsCapacitorCore).toBe(true);
      } else {
        expect(importsCapacitorCore).toBe(false);
      }
    }
  });
});

describe('Phase 10 — the stub is honestly labelled, never presented as real inference', () => {
  it('nativeLlamaRuntime.ts\'s own header discloses that the current native side is a deterministic stub, not a real model', () => {
    const source = readPhase10Source('ai/android/nativeLlamaRuntime.ts');
    expect(source.toLowerCase()).toMatch(/stub/);
  });
});
