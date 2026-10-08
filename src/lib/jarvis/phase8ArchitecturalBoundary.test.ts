import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isRouteTableFreeByDefault } from './routingPolicy';

// JARVIS Phase 8 — architectural boundary + security verification (Part 9 + Part 14-equivalent
// checks for this phase's own new files).
//
// Local-runtime files DO reference "Ollama" by name and DO contain real `fetch()` calls (unlike
// earlier phases' files) — that is the whole point of this phase, so the forbidden-pattern list
// below is scoped accordingly: it never flags the word "Ollama" or a `fetch()` call itself, only
// an actual credential/paid-provider-SDK dependency, which remains forbidden exactly as before.
const dir = dirname(fileURLToPath(import.meta.url));

const PHASE_8_SOURCE_FILES = [
  'ai/localRuntime.ts',
  'ai/localRuntimeHealth.ts',
  'ai/modelDiscovery.ts',
  'ai/ollamaProvider.ts',
  'ai/documentGroundingPrompt.ts',
];

function readPhase8Source(relativePath: string): string {
  return readFileSync(join(dir, relativePath), 'utf-8');
}

describe('Phase 8 — no paid AI provider SDK, no API key, no provider secret', () => {
  for (const file of PHASE_8_SOURCE_FILES) {
    it(`${file} imports no paid provider SDK and contains no hardcoded secret`, () => {
      const source = readPhase8Source(file);
      expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai)/i);
      expect(source).not.toMatch(/require\(['"].*(openai|anthropic|@google\/genai)/i);
      // A plausible-looking secret literal — never present even as a placeholder default.
      expect(source).not.toMatch(/['"]sk-[a-zA-Z0-9]{10,}['"]/);
      expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i);
      expect(source).not.toMatch(/service[_-]?role/i);
      expect(source).not.toMatch(/Authorization['"]\s*:\s*['"]Bearer/i);
    });
  }
});

describe('Phase 8 — no automatic model download, no Ollama install step', () => {
  for (const file of PHASE_8_SOURCE_FILES) {
    it(`${file} never shells out to install or pull anything`, () => {
      const source = readPhase8Source(file);
      expect(source).not.toMatch(/child_process/);
      expect(source).not.toMatch(/\bexec(File)?\s*\(/);
      expect(source).not.toMatch(/\/api\/pull/); // Ollama's own model-download endpoint — never called by this phase
      expect(source).not.toMatch(/ollama\s+(pull|run|serve)\b/i);
    });
  }
});

describe('Phase 8 — no Android/annotation/Zustand-store coupling', () => {
  const FORBIDDEN_PATTERNS = [
    /from ['"].*\/store['"]/,
    /from ['"].*\/components\/annotations/,
    /from ['"].*android/i,
    /zustand/,
    /NativeInkOverlayView|NativeInkPlugin|AnnotationLayer|AnnotationToolbar|DocumentAnnotator/,
  ];

  for (const file of PHASE_8_SOURCE_FILES) {
    it(`${file} never imports Android, annotation, or Zustand-store code`, () => {
      const source = readPhase8Source(file);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

describe('Phase 8 — no application-internal engine dependency (same boundary as ai/architecturalBoundary.test.ts)', () => {
  const FORBIDDEN_IMPORT_PATTERNS = [
    /from ['"].*\/pyqFilters['"]/,
    /from ['"].*\/revisionQueue['"]/,
    /from ['"].*\/topicStatus['"]/,
    /from ['"].*\/weakTopicPractice['"]/,
    /from ['"].*\/pyqPerformance['"]/,
    /from ['"].*\/upscCseTodaysStudy['"]/,
    /from ['"].*\/phdDashboard['"]/,
    /from ['"].*\/phdAnalytics['"]/,
    /from ['"].*\/phdResearch['"]/,
    /from ['"].*\/phdReadingStatus['"]/,
    /from ['"].*\/commandCentre['"]/,
    /from ['"].*\/contentImport['"]/,
    /from ['"].*\/workspace['"]/,
    /from ['"].*\/data\//,
  ];

  for (const file of PHASE_8_SOURCE_FILES) {
    it(`${file} imports no APFC/UPSC/PhD application-internal engine`, () => {
      const source = readPhase8Source(file);
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

describe('Phase 8 — routing stays free-by-default even with a local provider wired in', () => {
  it('the route table this phase connects to (routingPolicy.ts, unmodified) never defaults to a paid provider', () => {
    expect(isRouteTableFreeByDefault()).toBe(true);
  });
});

describe('Phase 8 — Ollama runtime is reachable only on the caller-supplied host, never a hidden remote default', () => {
  it('localRuntime.ts never constructs a URL from anything other than the caller-supplied baseUrl', () => {
    const source = readPhase8Source('ai/localRuntime.ts');
    // The only literal host string allowed anywhere in this file is the documented, never-auto-
    // used OLLAMA_DEFAULT_BASE_URL constant itself — no other hardcoded host/URL may appear.
    const literalUrlMatches = source.match(/https?:\/\/[a-zA-Z0-9.:-]+/g) ?? [];
    for (const match of literalUrlMatches) {
      expect(match).toBe('http://localhost:11434');
    }
  });
});
