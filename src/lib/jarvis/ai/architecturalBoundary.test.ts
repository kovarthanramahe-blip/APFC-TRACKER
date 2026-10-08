import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The dependency direction this phase must never invert:
//   application engines -> JARVIS application tools -> JARVIS context -> AI gateway/provider
// So nothing under lib/jarvis/ai/ may import an APFC/UPSC/PhD internal engine, a Zustand store,
// annotation code, or Android code — it may only import from within lib/jarvis itself (types.ts,
// toolRegistry.ts, contextEngine.ts, applicationTools.ts — the last only for TYPE-ONLY input/
// output shapes, never to call an engine directly) or from Node/browser platform APIs.
const SOURCE_FILES = ['types.ts', 'provider.ts', 'providerRegistry.ts', 'gateway.ts'];

const FORBIDDEN_IMPORT_PATTERNS = [
  /from ['"].*\/store['"]/, // Zustand store (lib/store.ts)
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
  /from ['"].*\/data\//, // any src/data/* static constant
  /from ['"].*\/components\/annotations/,
  /from ['"].*android/i,
  /zustand/,
];

describe('lib/jarvis/ai — architectural import boundary', () => {
  const dir = dirname(fileURLToPath(import.meta.url));

  for (const file of SOURCE_FILES) {
    it(`${file} imports no application internal, store, annotation, or Android module`, () => {
      const source = readFileSync(join(dir, file), 'utf-8');
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it('applicationTools.ts, when referenced at all, is only ever used as a type-only import', () => {
    for (const file of SOURCE_FILES) {
      const source = readFileSync(join(dir, file), 'utf-8');
      const lines = source.split('\n').filter((line) => line.includes("from './applicationTools'") || line.includes('from "../applicationTools"'));
      for (const line of lines) {
        expect(line.trim().startsWith('import type')).toBe(true);
      }
    }
  });

  it('none of these files imports or installs an OpenAI/Anthropic/Gemini SDK — doc comments may cite their public API docs as design research, but no code may depend on one', () => {
    for (const file of SOURCE_FILES) {
      const source = readFileSync(join(dir, file), 'utf-8');
      // Only flags actual code dependencies (import/require/package-style specifiers), never a
      // doc-comment citation of a provider's own public documentation (this file's own header
      // cites platform.openai.com's Responses API docs as the research basis for these shapes —
      // that is deliberate and desired, not a violation).
      expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai)/i);
      expect(source).not.toMatch(/require\(['"].*(openai|anthropic|@google\/genai)/i);
      expect(source).not.toMatch(/new\s+(OpenAI|Anthropic)\s*\(/);
    }
  });
});
