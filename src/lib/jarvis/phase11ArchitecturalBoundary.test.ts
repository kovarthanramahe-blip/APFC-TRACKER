import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 11 — architectural boundary verification.
const jarvisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(jarvisDir, '..', '..', '..');

function readJarvisSource(relativePath: string): string {
  return readFileSync(join(jarvisDir, relativePath), 'utf-8');
}

function readRepoSource(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

describe('Phase 11 — no provider secret, no paid SDK', () => {
  it('runtime.ts contains no provider secret or paid SDK import', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai|ollama)/i);
    expect(source).not.toMatch(/['"]sk-[a-zA-Z0-9]{10,}['"]/);
    expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i);
  });
});

describe('Phase 11 — no Native Ink / annotation import', () => {
  it('runtime.ts never imports Native Ink, annotation, or Zustand-store code', () => {
    const source = readJarvisSource('runtime.ts');
    const forbidden = [/from ['"].*\/store['"]/, /from ['"].*\/components\/annotations/, /from ['"].*\/nativeInk['"]/, /NativeInkOverlayView|NativeInkPlugin|AnnotationLayer|AnnotationToolbar|DocumentAnnotator/, /zustand/];
    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });
});

describe('Phase 11 — the Android dependency path is real, not merely re-exported from index.ts', () => {
  it('runtime.ts statically imports the Capacitor bridge module directly (so a bundler cannot tree-shake it away)', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/from ['"]\.\/ai\/android\/localLlamaCapacitorPlugin['"]/);
  });

  it('runtime.ts imports the Phase 10 provider/runtime composition functions directly, not only via index.ts', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/createAndroidLocalLlamaProvider/);
    expect(source).toMatch(/createNativeLlamaRuntime/);
    expect(source).toMatch(/from ['"]\.\/ai\/android\/androidLocalLlamaProvider['"]/);
    expect(source).toMatch(/from ['"]\.\/ai\/android\/nativeLlamaRuntime['"]/);
  });
});

describe('Phase 11 — the deterministic orchestrator and Command Centre remain untouched/authoritative', () => {
  it('orchestrator.ts (handleJarvisRequest) has no AI/provider/network dependency — it was not rewritten into an AI function', () => {
    const source = readJarvisSource('orchestrator.ts');
    expect(source).not.toMatch(/from ['"]\.\/ai\//);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/Provider|Runtime/);
  });

  it('runtime.ts calls handleJarvisRequest and never reimplements intent resolution or app-fact computation itself', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/handleJarvisRequest/);
    expect(source).not.toMatch(/\bresolveIntent\s*\(/);
  });

  it("lib/commandCentre.ts (generateUpNextItems) has no JARVIS/AI import — the deterministic Up Next list never depends on an LLM", () => {
    const source = readRepoSource('src/lib/commandCentre.ts');
    expect(source).not.toMatch(/from ['"].*\/jarvis/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
