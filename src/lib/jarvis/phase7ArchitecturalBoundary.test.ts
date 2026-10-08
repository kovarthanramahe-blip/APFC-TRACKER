import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { retrieveChunksForQuery } from './documents/retrieval';
import type { JarvisDocumentChunk } from './documents/types';

// JARVIS Phase 7 — architectural boundary verification (Part 14).
//
// Document ingestion/retrieval must stay provider-independent: no AI provider SDK, no API key,
// no network call required to ingest a document or answer a retrieval query, no Android or
// annotation import, and no coupling to the Repository's own existing content-import model (see
// documents/types.ts's own header on why the two subsystems are kept separate). Ingestion DOES
// import pdfjs-dist/mammoth/turndown — document-parsing libraries, not AI providers — so those
// names are intentionally absent from the forbidden list below.
const dir = dirname(fileURLToPath(import.meta.url));

const PHASE_7_SOURCE_FILES = ['documents/ingestion.ts', 'documents/documentQuestion.ts', 'documents/retrieval.ts', 'documents/index.ts'];

function readPhase7Source(relativePath: string): string {
  return readFileSync(join(dir, relativePath), 'utf-8');
}

describe('Phase 7 — no AI provider SDK, no hardcoded secret', () => {
  for (const file of PHASE_7_SOURCE_FILES) {
    it(`${file} imports no AI provider SDK and contains no hardcoded secret`, () => {
      const source = readPhase7Source(file);
      expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai|ollama)/i);
      expect(source).not.toMatch(/require\(['"].*(openai|anthropic|@google\/genai|ollama)/i);
      expect(source).not.toMatch(/['"]sk-[a-zA-Z0-9]{10,}['"]/);
      expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i);
    });
  }
});

describe('Phase 7 — no network call required for ingestion or retrieval', () => {
  it('ingestion.ts performs no fetch/XHR/network call — only local byte parsing', () => {
    const source = readPhase7Source('documents/ingestion.ts');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it('retrieval.ts and documentQuestion.ts perform no network call — retrieval is local keyword search only', () => {
    for (const file of ['documents/retrieval.ts', 'documents/documentQuestion.ts']) {
      const source = readPhase7Source(file);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/XMLHttpRequest/);
    }
  });
});

describe('Phase 7 — no Android/annotation/Zustand-store coupling', () => {
  const FORBIDDEN_PATTERNS = [
    /from ['"].*\/store['"]/,
    /from ['"].*\/components\/annotations/,
    /from ['"].*android/i,
    /zustand/,
    /NativeInkOverlayView|NativeInkPlugin|AnnotationLayer|AnnotationToolbar|DocumentAnnotator/,
  ];

  for (const file of PHASE_7_SOURCE_FILES) {
    it(`${file} never imports Android, annotation, or Zustand-store code`, () => {
      const source = readPhase7Source(file);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

describe('Phase 7 — document subsystem independence', () => {
  it('ingestion/retrieval never import the Repository\'s existing ImportedContent model', () => {
    for (const file of PHASE_7_SOURCE_FILES) {
      const source = readPhase7Source(file);
      expect(source).not.toMatch(/from ['"].*\/contentImport['"]/);
    }
  });
});

describe('Phase 7 — retrieval determinism (no randomness, no clock dependency in ranking)', () => {
  it('retrieveChunksForQuery never calls Math.random or Date.now to decide ranking', () => {
    const source = readPhase7Source('documents/retrieval.ts');
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/Date\.now/);
  });

  it('the same query against the same chunks always returns the same order', () => {
    const chunks: JarvisDocumentChunk[] = [
      { id: 'c1', documentId: 'doc-1', order: 0, text: 'merchant capitalism preceded industrial capital formation' },
      { id: 'c2', documentId: 'doc-1', order: 1, text: 'merchant capitalism and trade networks' },
    ];
    const query = { question: 'merchant capitalism' };
    const first = retrieveChunksForQuery(chunks, query);
    const second = retrieveChunksForQuery(chunks, query);
    expect(first).toEqual(second);
  });
});
