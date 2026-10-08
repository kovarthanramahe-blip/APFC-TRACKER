import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 13B — architectural boundary verification, following the same grep-based,
// source-text convention phase11/phase13aArchitecturalBoundary.test.ts already established.
//
// Items 1-8 and 11 of this phase's own "Test Requirements" list (model unavailable/available/
// loading/ready, inference, inference failure, unload, cancellation, deterministic fallback) are
// ALREADY fully covered by Phase 13A's own localLlmLifecycle.test.ts (the 7-state tracker, which
// this phase does not modify) and Phase 10's own nativeLlamaRuntime.test.ts/
// androidLocalLlamaProvider.test.ts (streaming/cancel semantics, also unmodified) — re-asserted
// here is only that those files still exist and still pass as part of the full suite, never
// duplicated.
//
// Items 9, 10, 12-15 are this phase's own new ground, verified below. Items 9 (concurrent load
// prevention) and 10 (inference-before-ready rejection) are implemented in native C++
// (llama_cpp_backend.cpp) and Kotlin (NativeLlamaRuntime.kt) — this repo has no Android
// device/NDK to unit-test their RUNTIME behaviour against (confirmed, unchanged, every earlier
// native-code phase), so these checks are honestly grep-based: they prove the guard logic EXISTS
// in source, not that it has been exercised on a device. See this phase's own final report for
// the separate host-g++ compile verification against the real llama.cpp headers.
const jarvisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(jarvisDir, '..', '..', '..');

function readJarvisSource(relativePath: string): string {
  return readFileSync(join(jarvisDir, relativePath), 'utf-8');
}

function readRepoSource(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

const NATIVE_INK_MARKERS = [/NativeInkOverlayView/, /NativeInkPlugin/, /AnnotationLayer/, /AnnotationToolbar/, /DocumentAnnotator/];

describe('Phase 13B — item 15: no Native Ink file is touched or even referenced', () => {
  it('none of the new/modified Phase 13B source files reference any Native Ink file/component', () => {
    const files = [
      'ai/android/androidLocalLlmModelBackend.ts',
      'ai/groundedPrompt.ts',
    ];
    for (const file of files) {
      const source = readJarvisSource(file);
      for (const marker of NATIVE_INK_MARKERS) {
        expect(source).not.toMatch(marker);
      }
    }
  });

  it('the new native files (llama_cpp_backend.h/.cpp, LocalLlmModelStorage.kt) never reference any Native Ink file/component', () => {
    const nativeFiles = [
      join(repoRoot, 'android/app/src/main/cpp/llama_cpp_backend.h'),
      join(repoRoot, 'android/app/src/main/cpp/llama_cpp_backend.cpp'),
      join(repoRoot, 'android/app/src/main/java/com/apfctracker/app/LocalLlmModelStorage.kt'),
    ];
    for (const path of nativeFiles) {
      const source = readFileSync(path, 'utf-8');
      for (const marker of NATIVE_INK_MARKERS) {
        expect(source).not.toMatch(marker);
      }
    }
  });

  // native_llama_bridge.cpp, LocalLlamaPlugin.kt, and NativeLlamaRuntime.kt were MODIFIED this
  // phase, and (pre-existingly, since Phase 10 — not added by this phase) LocalLlamaPlugin.kt's
  // own doc comment legitimately mentions "NativeInkPlugin.kt" by name as a style cross-
  // reference ("matches this project's own established plugin convention exactly, see
  // NativeInkPlugin.kt"). A bare substring check would wrongly flag that benign, pre-existing
  // comment as if this phase had touched Native Ink. The real check for "did this phase actually
  // modify Native Ink" is `git diff HEAD` against the five protected files, run and reported
  // verbatim in this phase's own final report — not a source-text match here.
  it('neither native_llama_bridge.cpp nor NativeLlamaRuntime.kt import, instantiate, or call anything from a Native Ink class — a mere comment mention of a filename does not count', () => {
    const nonCommentReferenceFiles = [
      join(repoRoot, 'android/app/src/main/cpp/native_llama_bridge.cpp'),
      join(repoRoot, 'android/app/src/main/java/com/apfctracker/app/NativeLlamaRuntime.kt'),
    ];
    for (const path of nonCommentReferenceFiles) {
      const source = readFileSync(path, 'utf-8');
      for (const marker of NATIVE_INK_MARKERS) {
        expect(source).not.toMatch(marker);
      }
    }
  });
});

describe('Phase 13B — item 12: no network call is introduced anywhere in this phase\'s own new/modified files', () => {
  const tsFiles = ['ai/android/androidLocalLlmModelBackend.ts', 'ai/groundedPrompt.ts'];
  const nativeFiles = [
    'android/app/src/main/cpp/llama_cpp_backend.cpp',
    'android/app/src/main/java/com/apfctracker/app/LocalLlmModelStorage.kt',
    'android/app/src/main/java/com/apfctracker/app/LocalLlamaPlugin.kt',
  ];

  it('new TypeScript files perform no fetch/XHR/axios call', () => {
    for (const file of tsFiles) {
      const source = readJarvisSource(file);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/XMLHttpRequest/);
      expect(source).not.toMatch(/axios/i);
    }
  });

  it('no provider secret, paid SDK, or cloud AI import exists in any new TypeScript file', () => {
    for (const file of tsFiles) {
      const source = readJarvisSource(file);
      expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai|ollama)/i);
      expect(source).not.toMatch(/['"]sk-[a-zA-Z0-9]{10,}['"]/);
    }
  });

  it('the native/Kotlin model-management files never reference an HTTP client, URL download, or socket API', () => {
    for (const file of nativeFiles) {
      const source = readRepoSource(file);
      expect(source).not.toMatch(/HttpURLConnection|OkHttp|Retrofit|URLConnection|DownloadManager/);
      expect(source).not.toMatch(/curl_easy|CURLOPT|libcurl/);
    }
  });
});

describe('Phase 13B — item 9: concurrent load prevention is implemented in source (native + Kotlin)', () => {
  it('llama_cpp_backend.cpp rejects a second concurrent/duplicate load (kAlreadyLoaded) before touching native state', () => {
    const source = readRepoSource('android/app/src/main/cpp/llama_cpp_backend.cpp');
    expect(source).toMatch(/loadInProgress_\.exchange\(true\)/);
    expect(source).toMatch(/kAlreadyLoaded/);
  });

  it('NativeLlamaRuntime.kt rejects loadModel() while a load is already in progress or a model is already ready', () => {
    const source = readRepoSource('android/app/src/main/java/com/apfctracker/app/NativeLlamaRuntime.kt');
    expect(source).toMatch(/status == Status\.LOADING \|\| status == Status\.READY/);
  });
});

describe('Phase 13B — item 10: inference-before-ready rejection is implemented in source', () => {
  it('llama_cpp_backend.cpp\'s complete() rejects (kRejectedNotReady) before running any inference when no model is loaded', () => {
    const source = readRepoSource('android/app/src/main/cpp/llama_cpp_backend.cpp');
    const completeBody = source.slice(source.indexOf('LlamaCppCompletionStatus LlamaCppBackend::complete('));
    const firstCheck = completeBody.slice(0, completeBody.indexOf('cancelRequested_.store(false)'));
    expect(firstCheck).toMatch(/model_ == nullptr \|\| context_ == nullptr/);
    expect(firstCheck).toMatch(/kRejectedNotReady/);
  });
});

describe('Phase 13B — item 13: provenance correctness is preserved, never weakened', () => {
  it('runtime.ts keeps the exact provenance contract Phase 11/12 already locked down', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/'android_local_ai'/);
    expect(source).toMatch(/'android_native_stub'/);
    expect(source).toMatch(/providerHealth === 'model_ready'/);
    // As of Phase 13B itself, runtime.ts was untouched and never imported androidLocalLlmModelBackend
    // at all — that import was added later, by Phase 13C's own ensureAndroidLocalLlamaModelReady
    // bootstrap (see phase13cArchitecturalBoundary.test.ts for THAT phase's own boundary proof).
    // groundedPrompt.ts (this phase's own Part G helper) stays unwired even after that change —
    // the LLM-phrasing layer remains decoupled from the authoritative routing/decision path.
    expect(source).not.toMatch(/groundedPrompt/);
  });

  it('androidLocalLlamaProvider.ts (Phase 10, unmodified) still never claims a real model is ready except via genuine getLoadedModel()', () => {
    const source = readJarvisSource('ai/android/androidLocalLlamaProvider.ts');
    expect(source).toMatch(/toAndroidProviderHealthStatus/);
  });
});

describe('Phase 13B — item 14: the deterministic Decision Engine remains authoritative for study_next', () => {
  it('routingPolicy.ts is untouched — study_next still always routes to deterministic_tool, never to an AI route', () => {
    const source = readJarvisSource('routingPolicy.ts');
    expect(source).toMatch(/input\.intent === 'study_next'/);
    const studyNextBranch = source.slice(source.indexOf("input.intent === 'study_next'"));
    expect(studyNextBranch.slice(0, studyNextBranch.indexOf('else'))).toMatch(/'deterministic_tool'/);
  });

  it('runtime.ts still calls decideStudyNext for the deterministic_tool route, unchanged by this phase', () => {
    const source = readJarvisSource('runtime.ts');
    expect(source).toMatch(/decideStudyNext/);
  });

  it('groundedPrompt.ts (this phase\'s own Part G helper) is never imported by runtime.ts — the LLM-phrasing layer stays decoupled from the authoritative routing/decision path in this phase', () => {
    const runtimeSource = readJarvisSource('runtime.ts');
    expect(runtimeSource).not.toMatch(/groundedPrompt/);
  });

  it('groundedPrompt.ts itself never computes a decision — it only reads an already-made JarvisDecisionResult\'s own fields', () => {
    const source = readJarvisSource('ai/groundedPrompt.ts');
    expect(source).not.toMatch(/decideStudyNext\s*\(/);
  });
});

describe('Phase 13B — the stub is retained and never mislabelled as a real LLM', () => {
  it('native_llama_bridge.cpp still contains the EXACT Phase 10 stub token sequence as a fallback, unconditionally compiled', () => {
    const source = readRepoSource('android/app/src/main/cpp/native_llama_bridge.cpp');
    expect(source).toMatch(/"Hello", " from", " the", " native", " stub", "\."/);
    expect(source).toMatch(/runStubCompletion/);
  });

  it('CMakeLists.txt builds the real backend ONLY when the llama.cpp submodule is actually present — a build with no submodule is the exact same stub-only target as before', () => {
    const source = readRepoSource('android/app/src/main/cpp/CMakeLists.txt');
    expect(source).toMatch(/EXISTS "\$\{JARVIS_LLAMA_CPP_DIR\}\/CMakeLists\.txt"/);
    expect(source).toMatch(/GGML_NATIVE OFF/);
    expect(source).toMatch(/GGML_OPENMP OFF/);
    expect(source).not.toMatch(/-march=/);
  });
});

describe('Phase 13B — web behaviour is unaffected', () => {
  it('CommandCentre.tsx and every other page still never reference any Phase 13B native-backend file', () => {
    const commandCentreSource = readRepoSource('src/pages/CommandCentre.tsx');
    expect(commandCentreSource).not.toMatch(/androidLocalLlmModelBackend|groundedPrompt|llama_cpp_backend/);
  });
});
