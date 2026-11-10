import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 13H — regression/boundary tests for Phase 13G's Qwen3 thinking-suppression
// mechanism and Phase 13H's own new timing instrumentation, following this repo's established
// grep-based source-text testing convention (phase11/phase13aArchitecturalBoundary.test.ts,
// phase13bArchitecturalBoundary.test.ts, phase13cArchitecturalBoundary.test.ts). This repo has no
// C++ test runner wired into any build/CI — the native backend only compiles against the real
// llama.cpp submodule and NDK, neither of which exists in this sandbox (see LLAMA_CPP_SETUP.md).
// These tests therefore pin exactly what the suppression mechanism DOES and DOES NOT claim,
// directly from the real, shipped source — not a mock, not a description — so a future edit can't
// silently weaken the exact-match guarantee, widen the ban beyond the first token, or delete the
// "unverified on real hardware" disclosure while leaving the mechanism itself unverified.
//
// What this file intentionally does NOT and CANNOT do: prove that Qwen3 actually stops reasoning
// on a real device. That requires a genuine on-device run (Xiaomi Pad 6 + a real llama.cpp build +
// a real GGUF model) — see the diagnostic report this phase implements for exactly what that test
// looks like. The negative assertions below exist specifically so no future change can claim that
// verification here without it actually having happened.
const cppDir = dirname(fileURLToPath(import.meta.url));

function readCppSource(filename: string): string {
  return readFileSync(join(cppDir, filename), 'utf-8');
}

const backendCpp = readCppSource('llama_cpp_backend.cpp');
const backendH = readCppSource('llama_cpp_backend.h');

describe('Phase 13G/13H — the thinking-suppression mechanism, exactly as shipped', () => {
  it('matches the "<think>" vocabulary token by EXACT text equality (std::strcmp == 0), never a substring/prefix match', () => {
    expect(backendH).toMatch(/std::strcmp\(text, targetText\) == 0/);
    expect(backendCpp).toMatch(/kThinkTokenText = "<think>"/);
    // Guards against a future "helpful" simplification to strstr/starts_with, which would
    // false-positive on an unrelated token that merely contains the text.
    expect(backendCpp).not.toMatch(/strstr\(/);
  });

  it('the pure matching core is extracted to a single, reused implementation — findThinkTokenId delegates, it does not duplicate the scan', () => {
    expect(backendH).toMatch(/findExactTokenId/);
    expect(backendCpp).toMatch(/jarvis::detail::findExactTokenId\(nVocab, kThinkTokenText/);
    // Only one hand-written linear scan over vocabulary text should exist in the .cpp file itself
    // (the real one now lives in the header-only helper) — a second copy would be exactly the
    // "second implementation to keep in sync" this extraction's own comment says it avoids.
    const strcmpOccurrencesInCpp = (backendCpp.match(/std::strcmp\(/g) ?? []).length;
    expect(strcmpOccurrencesInCpp).toBe(0);
  });

  it('the ban applies to exactly ONE sampling call — the first generated token of a request — never a standing ban across the whole response', () => {
    expect(backendCpp).toMatch(/generated == 0 && firstTokenSampler != nullptr/);
    expect(backendCpp).toMatch(/if \(generated == 0\) \{/);
    // "Only generated == 0" must stay true in prose too — not just in the one ternary above —
    // since a future edit could widen the condition without touching that exact line.
    expect(backendCpp).toMatch(/Only generated == 0 .* ever uses firstTokenSampler/);
  });

  it('never fabricates suppression on a model/vocabulary with no "<think>" token — thinkTokenId_ defaults to -1 and that is respected, not overridden', () => {
    expect(backendH).toMatch(/int32_t thinkTokenId_ = -1;/);
    expect(backendCpp).toMatch(/const bool thinkingSuppressed = thinkTokenId_ >= 0;/);
    // unloadModel() must reset it, so a second model loaded into the same instance never inherits
    // a stale token id discovered on a previous, different vocabulary.
    expect(backendCpp).toMatch(/thinkTokenId_ = -1;/);
  });

  it('still honestly discloses this has not been verified on real Android hardware — this guard exists so a future edit cannot silently delete that disclosure while the mechanism itself remains unverified', () => {
    expect(backendH).toMatch(/NOT LINKED\/RUN ON A REAL ANDROID DEVICE/);
    expect(backendCpp).toMatch(/did not work: the model still opened its own fresh `<think>` regardless/);
  });

  it('never claims, anywhere in this file, that suppression is confirmed/verified/proven to work — only that it is a mechanism which MAY suppress it', () => {
    const overclaimPatterns = [/verified to suppress/i, /confirmed (it )?(works|suppresses|disables)/i, /proven to (disable|suppress|stop) (the )?(model'?s? )?reasoning/i, /guaranteed to (suppress|disable|prevent) thinking/i];
    for (const pattern of overclaimPatterns) {
      expect(backendCpp).not.toMatch(pattern);
      expect(backendH).not.toMatch(pattern);
    }
  });
});

describe('Phase 13H — new timing instrumentation is log-only and never logs prompt/user content', () => {
  it('model-load timing uses a monotonic clock (steady_clock), never wall-clock time', () => {
    expect(backendCpp).toMatch(/std::chrono::steady_clock::now\(\)/);
    // system_clock is only ever mentioned in prose (explaining why it was NOT chosen) — never
    // actually instantiated/called anywhere in this file.
    expect(backendCpp).not.toMatch(/std::chrono::system_clock/);
  });

  it('loadModel() logs a duration (loadMs) on its success path', () => {
    expect(backendCpp).toMatch(/loadMs=%lld/);
    expect(backendCpp).toMatch(/const long long loadMs = static_cast<long long>\(loadElapsedMs\(\)\);/);
  });

  it('complete() logs time-to-first-token (ttftMs) separately from total duration (elapsedMs), and never fabricates a ttft when no token was ever generated', () => {
    expect(backendCpp).toMatch(/ttftMs=%lld/);
    expect(backendCpp).toMatch(/hasFirstToken \? static_cast<long long>/);
    // The honest "no token produced" sentinel is -1, matching thinkTokenId_'s own "-1 means
    // absent, never guessed" convention elsewhere in this same file.
    expect(backendCpp).toMatch(/: -1;/);
  });

  it('a per-process request sequence number (requestSeq_) ties a request\'s "started" and "completed" log lines together without crossing the JNI boundary or changing any method signature', () => {
    expect(backendH).toMatch(/uint64_t requestSeq_ = 0;/);
    expect(backendCpp).toMatch(/requestSeq=%llu/);
    // Confirms this stays a same-process logging aid: no new JNI function parameter was added for
    // it anywhere in the native bridge.
    const bridgeCpp = readCppSource('native_llama_bridge.cpp');
    expect(bridgeCpp).not.toMatch(/requestSeq/);
  });

  it('none of the new log format strings bind the prompt text itself as an argument — only its size (promptChars), never prompt.c_str()/formattedPrompt.c_str() for the new diagnostic lines', () => {
    const startedLineIdx = backendCpp.indexOf('complete: inference started');
    const startedLineEnd = backendCpp.indexOf(');', startedLineIdx);
    const startedCallSite = backendCpp.slice(startedLineIdx, startedLineEnd);
    expect(startedCallSite).toMatch(/prompt\.size\(\)/);
    expect(startedCallSite).not.toMatch(/prompt\.c_str\(\)/);
    expect(startedCallSite).not.toMatch(/formattedPrompt\.c_str\(\)/);

    const completedLineIdx = backendCpp.indexOf('complete: inference completed');
    const completedLineEnd = backendCpp.indexOf(');', completedLineIdx);
    const completedCallSite = backendCpp.slice(completedLineIdx, completedLineEnd);
    expect(completedCallSite).not.toMatch(/prompt\.c_str\(\)/);
    expect(completedCallSite).not.toMatch(/formattedPrompt\.c_str\(\)/);
  });

  it('timing is logged once per call, never per token — the generation loop\'s only log call remains the single pre-existing decode-failure error line, no new per-token diagnostic was added', () => {
    const loopStart = backendCpp.indexOf('for (; generated < maxOutputTokens; ++generated) {');
    const loopEnd = backendCpp.indexOf('\n    }\n', loopStart);
    const loopBody = backendCpp.slice(loopStart, loopEnd);
    const logCallsInLoop = loopBody.match(/__android_log_print/g) ?? [];
    expect(logCallsInLoop).toHaveLength(1);
    expect(loopBody).toMatch(/llama_decode of generation batch failed/);
  });
});
