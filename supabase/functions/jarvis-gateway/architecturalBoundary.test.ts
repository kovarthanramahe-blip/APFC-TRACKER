import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The jarvis-gateway Edge Function must know only about: request validation, authentication
// context, and the JARVIS gateway contract shape — never application state directly. It must
// NOT import a browser Zustand store, an APFC/UPSC/PhD internal engine, annotation code, Android
// code, or call any AI provider SDK. The Phase 3 Context Engine (browser-side) is responsible
// for producing the bounded context this function merely validates the SHAPE of.
const dir = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_PATTERNS = [
  /from ['"].*\/store['"]/,
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
  /from ['"].*\/components\/annotations/,
  /from ['"].*android/i,
  /zustand/,
  // Only an actual code dependency (import specifier or constructor call), never a doc-comment
  // citation like this file's own "No provider API key (OpenAI/Anthropic/Gemini/etc.)" security
  // note — see Phase 4's architecturalBoundary.test.ts for the identical false-positive this
  // mirrors and the same fix.
  /from ['"].*(openai|anthropic|@google\/genai)/i,
  /require\(['"].*(openai|anthropic|@google\/genai)/i,
  /new\s+(OpenAI|Anthropic)\s*\(/,
];

describe('supabase/functions/jarvis-gateway — architectural import boundary', () => {
  for (const file of ['index.ts', 'validation.ts']) {
    it(`${file} imports no application internal, store, annotation, Android module, or AI provider SDK`, () => {
      const source = readFileSync(join(dir, file), 'utf-8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it('index.ts never reads a database table or uses the service-role key', () => {
    const source = readFileSync(join(dir, 'index.ts'), 'utf-8');
    expect(source).not.toMatch(/service_role|serviceRole|SERVICE_ROLE/);
    expect(source).not.toMatch(/\.from\(['"]/); // a Supabase query builder call against a table
  });

  it('index.ts never calls a real AI provider — no fetch to a provider API host', () => {
    const source = readFileSync(join(dir, 'index.ts'), 'utf-8');
    expect(source).not.toMatch(/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/);
  });

  it('index.ts stays thin — it delegates validation to validation.ts rather than inlining it', () => {
    const source = readFileSync(join(dir, 'index.ts'), 'utf-8');
    expect(source).toMatch(/from ['"]\.\/validation\.ts['"]/);
    // "Thin" as a concrete, checkable bound rather than just an assertion in prose.
    expect(source.split('\n').length).toBeLessThan(120);
  });
});
