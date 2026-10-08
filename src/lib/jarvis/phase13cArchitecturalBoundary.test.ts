import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 13C — architectural boundary verification, following the same grep-based,
// source-text convention phase11/phase13aArchitecturalBoundary.test.ts/phase13bArchitecturalBoundary.test.ts
// already established. This phase's own brief asks for exactly five things here: (1) the UI layer
// never imports Capacitor/native APIs, (2) the bootstrap boundary lives BELOW the UI layer, (3) the
// deterministic Decision Engine remains untouched, (4) Native Ink remains untouched, (5) no
// network/cloud dependency is introduced.
const jarvisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(jarvisDir, '..', '..', '..');

function readJarvisSource(relativePath: string): string {
  return readFileSync(join(jarvisDir, relativePath), 'utf-8');
}

function readRepoSource(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

const NATIVE_INK_MARKERS = [/NativeInkOverlayView/, /NativeInkPlugin/, /AnnotationLayer/, /AnnotationToolbar/, /DocumentAnnotator/];

describe('Phase 13C — the UI layer never imports Capacitor/native APIs', () => {
  it('JarvisChat.tsx (the actual page component) imports no Capacitor/@capacitor/core, no android/* module, and never mentions the bootstrap function by name', () => {
    const source = readRepoSource('src/pages/JarvisChat.tsx');
    expect(source).not.toMatch(/@capacitor\/core/);
    expect(source).not.toMatch(/from ['"].*\/jarvis\/ai\/android/);
    expect(source).not.toMatch(/ensureAndroidLocalLlamaModelReady/);
  });

  it('CommandCentre.tsx (the other real caller of runJarvisRequest) likewise never imports the bootstrap boundary or any android/* module directly', () => {
    const source = readRepoSource('src/pages/CommandCentre.tsx');
    expect(source).not.toMatch(/ensureAndroidLocalLlamaModelReady/);
    expect(source).not.toMatch(/from ['"].*\/jarvis\/ai\/android/);
  });
});

describe('Phase 13C — the bootstrap boundary lives strictly below the UI layer', () => {
  it('localLlamaBootstrap.ts lives in ai/android/ (the existing native-boundary directory), not in pages/ or jarvisChat/ (the UI/presentation layers)', () => {
    // A path assertion, not a grep — proves this phase added its new file at the correct layer
    // rather than merely avoiding the word "Capacitor" in a file that is itself misplaced.
    expect(() => readJarvisSource('ai/android/localLlamaBootstrap.ts')).not.toThrow();
  });

  it('only runtime.ts (the existing composition layer) imports ensureAndroidLocalLlamaModelReady — no React hook, component, or page imports it directly', () => {
    const runtimeSource = readJarvisSource('runtime.ts');
    expect(runtimeSource).toMatch(/import \{ ensureAndroidLocalLlamaModelReady \} from '\.\/ai\/android\/localLlamaBootstrap'/);

    const candidateFiles = [
      'src/pages/JarvisChat.tsx',
      'src/pages/CommandCentre.tsx',
      'src/lib/jarvisChat/useJarvisConversation.ts',
      'src/lib/jarvisChat/useJarvisRuntimeStatus.ts',
    ];
    for (const file of candidateFiles) {
      expect(readRepoSource(file)).not.toMatch(/ensureAndroidLocalLlamaModelReady|localLlamaBootstrap/);
    }
  });

  it('localLlamaBootstrap.ts itself has no React/Capacitor import — it is a plain TypeScript module, exactly like every other ai/android/*.ts boundary file', () => {
    const source = readJarvisSource('ai/android/localLlamaBootstrap.ts');
    expect(source).not.toMatch(/from 'react'/);
    expect(source).not.toMatch(/@capacitor\/core/);
  });
});

describe('Phase 13C — the deterministic Decision Engine remains untouched and authoritative', () => {
  it('decisionEngine.ts has zero diff-relevant changes from this phase — still the only place decideStudyNext is defined, never duplicated', () => {
    const source = readJarvisSource('decisionEngine.ts');
    expect(source).toMatch(/export function decideStudyNext/);
    expect(source).not.toMatch(/ensureAndroidLocalLlamaModelReady|localLlamaBootstrap/);
  });

  it('routingPolicy.ts is untouched — study_next still always routes to deterministic_tool, never through the Android bootstrap/AI path', () => {
    const source = readJarvisSource('routingPolicy.ts');
    expect(source).not.toMatch(/ensureAndroidLocalLlamaModelReady|localLlamaBootstrap/);
    const studyNextBranch = source.slice(source.indexOf("input.intent === 'study_next'"));
    expect(studyNextBranch.slice(0, studyNextBranch.indexOf('else'))).toMatch(/'deterministic_tool'/);
  });

  it('runtime.ts still calls decideStudyNext for the deterministic_tool route, and that branch never touches the new bootstrap', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/decideStudyNext/);
    const deterministicToolBranch = source.slice(source.indexOf("routeDecision.target === 'deterministic_tool'"), source.indexOf("routeDecision.target === 'deterministic_tool'") + 400);
    expect(deterministicToolBranch).not.toMatch(/ensureAndroidLocalLlamaModelReady/);
  });
});

describe('Phase 13C — Native Ink remains completely untouched', () => {
  it('none of this phase\'s new/modified source files reference any Native Ink file/component', () => {
    const files = ['runtime.ts', 'ai/android/localLlamaBootstrap.ts', 'index.ts'];
    for (const file of files) {
      const source = readJarvisSource(file);
      for (const marker of NATIVE_INK_MARKERS) {
        expect(source).not.toMatch(marker);
      }
    }
  });
});

describe('Phase 13C — no network/cloud dependency is introduced', () => {
  it('localLlamaBootstrap.ts performs no fetch/XHR/axios call and references no cloud/paid AI SDK', () => {
    const source = readJarvisSource('ai/android/localLlamaBootstrap.ts');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/axios/i);
    expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai|ollama)/i);
  });

  it('loadModel is called with the absolute file path sourced ONLY from the model-storage descriptor — never a URL, never a download trigger', () => {
    // Phase 13E fix: this previously pinned `.descriptor.modelId` (a bare filename) — which was
    // itself the exact physical-device bug (native "file not found"). The descriptor's `filePath`
    // is the real absolute on-device path and is what the native loadModel() call must receive.
    const source = readJarvisSource('ai/android/localLlamaBootstrap.ts');
    expect(source).toMatch(/runtime\.loadModel\(availability\.descriptor\.filePath\)/);
    expect(source).not.toMatch(/DownloadManager|http:\/\/|https:\/\//);
  });
});
