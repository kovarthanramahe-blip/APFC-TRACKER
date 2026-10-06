import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 6 — architectural boundary verification.
//
// Every Phase 6 source file (contracts + pure planners only) must stay free of: a hardcoded
// provider secret, a provider SDK import, a direct browser-to-localhost network call (the thing
// Part C of this phase's own brief explicitly rules out as the final architecture), and any
// import of Android or annotation code. The document subsystem additionally must never import
// the Repository's existing content model or any annotation module — see documents/types.ts's
// own header for why they're kept independent.
const dir = dirname(fileURLToPath(import.meta.url));

const PHASE_6_SOURCE_FILES = [
  'ai/providerMetadata.ts',
  'ai/localProvider.ts',
  'routingPolicy.ts',
  'documents/types.ts',
  'documents/groundedAnswer.ts',
  'documents/summarizationStrategy.ts',
  'documents/retrieval.ts',
  'documents/index.ts',
];

function readPhase6Source(relativePath: string): string {
  return readFileSync(join(dir, relativePath), 'utf-8');
}

describe('Phase 6 — no provider SDK, no hardcoded secret, no direct localhost call', () => {
  for (const file of PHASE_6_SOURCE_FILES) {
    it(`${file} imports no AI provider SDK and contains no hardcoded secret`, () => {
      const source = readPhase6Source(file);
      expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai|ollama)/i);
      expect(source).not.toMatch(/require\(['"].*(openai|anthropic|@google\/genai|ollama)/i);
      // A plausible-looking secret literal — never present even as a placeholder default.
      expect(source).not.toMatch(/['"]sk-[a-zA-Z0-9]{10,}['"]/);
      expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i);
    });
  }

  it('localProvider.ts performs no network call of its own — it is a contract only, never a live client', () => {
    const source = readPhase6Source('ai/localProvider.ts');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/localhost|127\.0\.0\.1/);
  });
});

describe('Phase 6 — no Android/annotation/Zustand-store coupling', () => {
  const FORBIDDEN_PATTERNS = [
    /from ['"].*\/store['"]/,
    /from ['"].*\/components\/annotations/,
    /from ['"].*android/i,
    /zustand/,
    /NativeInkOverlayView|NativeInkPlugin|AnnotationLayer|AnnotationToolbar|DocumentAnnotator/,
  ];

  for (const file of PHASE_6_SOURCE_FILES) {
    it(`${file} never imports Android, annotation, or Zustand-store code`, () => {
      const source = readPhase6Source(file);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

describe('Phase 6 — document subsystem independence', () => {
  it('the document contracts never import the Repository\'s existing ImportedContent model', () => {
    for (const file of PHASE_6_SOURCE_FILES.filter((f) => f.startsWith('documents/'))) {
      const source = readPhase6Source(file);
      expect(source).not.toMatch(/from ['"].*\/contentImport['"]/);
    }
  });
});
