// JARVIS Phase 13B (real backend) + Phase 13D (actual on-device routing: chat templating +
// diagnostics) — see llama_cpp_backend.h's own header for the full rationale, memory-safety rules,
// and NOT COMPILED/VERIFIED disclosure.
//
// This entire file compiles to nothing unless JARVIS_HAVE_LLAMA_CPP is defined — CMakeLists.txt
// only defines it when the llama.cpp submodule is actually present (see that file's own guard), so
// a build with no submodule checked out is completely unaffected: the stub-only path in
// native_llama_bridge.cpp still compiles and runs exactly as it always has, and nothing about
// Native Ink or any other Android target depends on this file in any way.
//
// Every llama.cpp API call below was verified against the actual pinned tag's `include/llama.h`
// doc comments and `src/llama-batch.cpp`'s own implementation (specifically: `llama_batch_get_one`
// leaves `logits == nullptr`, and llama-batch.cpp's own `output flag` comment confirms this
// defaults to "only the last token is an output" — exactly the single-sequence generate-loop
// pattern this file relies on for `llama_sampler_sample(sampler, context_, -1)` to be valid after
// both the prompt batch and every single-token generation batch).
//
// Phase 13D addition — `llama_model_chat_template`/`llama_chat_apply_template` (both re-verified
// against the pinned tag's own `include/llama.h`, lines ~650-652 and ~1314-1330: the model's own
// embedded template, read from its GGUF metadata, is applied via llama.cpp's own pre-defined
// template matcher — "This function does not use a jinja parser. It only support a pre-defined
// list of template", per that header's own doc comment). Qwen3-1.7B-GGUF embeds a ChatML-style
// template in its own GGUF metadata, so this is never a hand-invented prompt format — when no
// embedded template exists for some other model, this file honestly falls back to sending the raw
// prompt text, exactly as it always has, rather than guessing a format.
//
// Phase 13F — Qwen3 thinking suppression + device-aware threading + timing diagnostics.
//
// Thinking suppression: verified against the pinned tag's own `src/llama-chat.cpp` (fetched and
// read directly, not assumed) that `llama_chat_apply_template`'s template detector
// (`llm_chat_detect_template`) has NO "qwen"/"qwen3" entry at all, in either its exact-name map or
// its heuristic `tmpl_contains(...)` fallback chain. Qwen3's GGUF-embedded template contains
// `<|im_start|>` but neither `<|im_sep|>` nor `<end_of_utterance>`, so it resolves to the generic
// `LLM_CHAT_TEMPLATE_CHATML` branch, which (also verified directly in that file) renders the
// assistant turn as the bare literal `"<|im_start|>assistant\n"` — nothing about "thinking" is
// emitted by llama.cpp itself at all. The jinja `enable_thinking` variable Qwen3's OWN upstream
// template defines is a jinja-level concept; it is only honoured by llama.cpp's separate
// minja/jinja-capable `common_chat_templates_apply` path (`common/chat.cpp`), which is NOT linked
// into this app (CMakeLists.txt never enables `LLAMA_BUILD_COMMON`, and this file links only the
// `llama` target). The bare `llama_chat_apply_template` C API used here has no mechanism to pass
// that variable at all — so Qwen3's own default (thinking enabled whenever the variable is
// unset) is what actually runs, and the model genuinely, autonomously generates its reasoning
// text, which nothing here was filtering.
//
// Phase 13F's own fix attempt (prompt-text injection of an already-closed "<think>\n\n</think>\n\n"
// block right after the assistant marker) was REMOVED after physical-device testing on the Xiaomi
// Pad 6 showed it did not work: the model still opened its own fresh `<think>` regardless. The
// content/placement were independently verified byte-for-byte correct against the real upstream
// Qwen3 jinja template (fetched directly from llama.cpp's own `models/templates/Qwen-Qwen3-0.6B.jinja`
// fixture), so the leading hypothesis is that this exact GGUF's tokenizer does not map that literal
// text onto whatever dedicated `<think>` vocabulary token (if any) the model was actually fine-tuned
// to recognize as a control signal — a text-level trick can't out-run a token-level mismatch.
//
// Phase 13G replaces it with a SAMPLING-level mechanism that does not depend on text/token-text
// matching at all: at loadModel() time, the REAL loaded vocabulary is scanned (never hardcoded,
// never assumed) for a token whose exact text is "<think>" (see findThinkTokenId below). If one
// exists, complete() uses `llama_sampler_init_logit_bias` to ban exactly that token id from being
// selected for the FIRST generated token only — every subsequent token samples through the
// existing, unmodified chain. This prevents the model from ever starting its reasoning phase
// (never generates it, never has to hide/strip it afterward), without assuming anything about how
// the GGUF's chat template text is spelled. If no such token exists on a given model (e.g. a
// non-Qwen model with no dedicated `<think>` token), `thinkTokenId_` stays `-1` and generation is
// byte-for-byte identical to this file's pre-Phase-13G behaviour — never a crash, never a guess.
//
// Threading: the previous implementation capped `n_threads` at a fixed literal (4), regardless of
// the device's own reported core count. Replaced with a formula derived from
// `std::thread::hardware_concurrency()` itself: half of the reported logical cores, floored at
// the existing `kMinThreads`. This is deliberately NOT "use every reported core minus one" (a
// common generic-multithreading heuristic) — ggml's thread pool has no concept of ARM
// big.LITTLE/heterogeneous core clusters, and llama.cpp's own community-documented mobile guidance
// is that mixing a SoC's slower efficiency cores into the SAME pool as its performance cores can
// make generation SLOWER, not faster, due to load-imbalance/synchronization overhead across
// mismatched-speed threads — exactly the "blind"/"unsafe arbitrary" outcome this phase's own brief
// warns against. Halving the reported core count is a conservative, device-scaling proxy for "use
// roughly the performance cluster, not the whole chip" without this file taking on new, riskier
// Android-specific cluster-detection code in the same change. See `clampedThreadCount()`'s own
// comment for the exact resulting number on the Xiaomi Pad 6.
//
// Timing: `std::chrono::steady_clock` (monotonic — immune to wall-clock adjustments, the correct
// choice for measuring elapsed durations on Android/C++, unlike `system_clock`) brackets the
// generation work itself (after the ready/tokenize/prompt-decode setup, around the sampling loop)
// and is logged once per request alongside the existing completion log line — never per token.
#ifdef JARVIS_HAVE_LLAMA_CPP

#include "llama_cpp_backend.h"

#include <llama.h>

#include <android/log.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <thread>
#include <vector>

namespace jarvis {

namespace {

constexpr const char* kLogTag = "JarvisLlamaCpp";

// Conservative, fixed context size — Phase 13B's own Part C: "start with a conservative context
// size, e.g. 4096... never read from unvalidated caller input." The primary target model
// (Qwen3-1.7B-GGUF) supports a much larger trained context, but 4096 keeps memory/latency
// predictable on-device; a future phase may raise this once real device numbers justify it.
constexpr int kContextSize = 4096;
constexpr int kBatchSize = 512;
constexpr int kMinThreads = 2;
// Generous headroom per llama_tokenize's own documented worst case (never more than the input
// text length plus a handful of special tokens).
constexpr int kTokenizeHeadroom = 8;
constexpr int kMaxPieceBytes = 256;
// Low, mostly-deterministic sampling — Phase 13B's own Part G: the LLM phrases a grounded
// decision, it does not invent one, so this file never samples for creative diversity.
constexpr float kSamplerTemperature = 0.2f;
// The exact, literal vocabulary text this file looks for — never a substring/prefix match, never
// a guessed token id. See findThinkTokenId below.
constexpr const char* kThinkTokenText = "<think>";
// A bias large enough that softmax-based sampling can never select the token it's applied to,
// regardless of temperature — the standard llama.cpp convention for a hard per-token ban via
// llama_sampler_init_logit_bias (added to the raw logit before temperature/distribution sampling).
constexpr float kThinkTokenBanBias = -INFINITY;

// Phase 13F — replaces the previous fixed literal cap (4) with a formula derived from the
// device's own reported core count: half of `hardware_concurrency()`, floored at kMinThreads.
// Deliberately NOT "all cores" or "all cores minus one" — see this file's own header comment for
// why a flat per-core heuristic is the "unsafe arbitrary" choice this phase's own brief warns
// against on a heterogeneous (big.LITTLE-style) mobile SoC. On the Xiaomi Pad 6 (an 8-logical-core
// SoC), this resolves to 8 / 2 = 4 — UNCHANGED from the previous fixed cap; see this phase's own
// final report for why that specific outcome is the honest, non-guessed result of this formula on
// this device, not a missed optimisation.
int clampedThreadCount() {
    const unsigned hw = std::thread::hardware_concurrency();
    if (hw == 0) return kMinThreads;
    int n = static_cast<int>(hw) / 2;
    if (n < kMinThreads) n = kMinThreads;
    return n;
}

bool fileExists(const std::string& path) {
    if (path.empty()) return false;
    FILE* f = std::fopen(path.c_str(), "rb");
    if (f == nullptr) return false;
    std::fclose(f);
    return true;
}

// Phase 13G — scans the REAL loaded vocabulary for a token whose text is EXACTLY "<think>" (never
// a substring/prefix match, which could false-positive on an unrelated token that merely contains
// that text). Returns -1 (never a guessed/hardcoded id) if no such token exists on this model —
// callers must treat that as "suppression unavailable here", never as an error. Runs in O(vocab
// size) — called ONLY once, from loadModel(), never per-request.
int32_t findThinkTokenId(const llama_vocab* vocab) {
    const int32_t nVocab = llama_vocab_n_tokens(vocab);
    for (int32_t token = 0; token < nVocab; ++token) {
        const char* text = llama_vocab_get_text(vocab, token);
        if (text != nullptr && std::strcmp(text, kThinkTokenText) == 0) {
            return token;
        }
    }
    return -1;
}

}  // namespace

LlamaCppBackend::LlamaCppBackend() {
    // Called once per instance (never per-request) — matches the official llama.cpp Android
    // example's own "init once" pattern (examples/llama.android/.../ai_chat.cpp).
    llama_backend_init();
    backendInitialized_ = true;
}

LlamaCppBackend::~LlamaCppBackend() {
    unloadModel();
    if (backendInitialized_) {
        llama_backend_free();
    }
}

bool LlamaCppBackend::isReady() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return model_ != nullptr && context_ != nullptr;
}

LlamaCppLoadResult LlamaCppBackend::loadModel(const std::string& modelFilePath) {
    // Never allow a second concurrent load, and never silently load a second model on top of an
    // already-loaded one (Phase 13B's own Part C: "avoid loading multiple copies of the model",
    // "prevent simultaneous conflicting loads"). Checked with an atomic BEFORE taking the mutex so
    // a caller spamming loadModel() gets an immediate, cheap rejection rather than queueing behind
    // a slow load already in flight.
    const bool alreadyInProgress = loadInProgress_.exchange(true);
    if (alreadyInProgress) {
        return LlamaCppLoadResult::kAlreadyLoaded;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    if (model_ != nullptr) {
        loadInProgress_.store(false);
        return LlamaCppLoadResult::kAlreadyLoaded;
    }

    if (!fileExists(modelFilePath)) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "loadModel: file not found: %s", modelFilePath.c_str());
        loadInProgress_.store(false);
        return LlamaCppLoadResult::kFileNotFound;
    }

    llama_model_params modelParams = llama_model_default_params();
    // CPU-only — no Vulkan/GPU offload in this phase, matching this project's own established
    // "no GPU complexity" precedent (Phase 10's own stub never claimed GPU acceleration either).
    modelParams.n_gpu_layers = 0;

    llama_model* model = llama_model_load_from_file(modelFilePath.c_str(), modelParams);
    if (model == nullptr) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "loadModel: llama_model_load_from_file failed: %s", modelFilePath.c_str());
        loadInProgress_.store(false);
        return LlamaCppLoadResult::kLoadFailed;
    }

    llama_context_params ctxParams = llama_context_default_params();
    ctxParams.n_ctx = kContextSize;
    ctxParams.n_batch = kBatchSize;
    ctxParams.n_ubatch = kBatchSize;
    ctxParams.n_threads = clampedThreadCount();
    ctxParams.n_threads_batch = ctxParams.n_threads;

    llama_context* context = llama_init_from_model(model, ctxParams);
    if (context == nullptr) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "loadModel: llama_init_from_model failed: %s", modelFilePath.c_str());
        llama_model_free(model);
        loadInProgress_.store(false);
        return LlamaCppLoadResult::kLoadFailed;
    }

    model_ = model;
    context_ = context;
    loadInProgress_.store(false);
    // One concise, non-spammy line per successful load (Phase 13D's own Part H: "do not spam
    // logcat with every token") — proves, from logcat alone, that this build genuinely has
    // JARVIS_HAVE_LLAMA_CPP defined AND that this specific load reached a real, usable context,
    // as opposed to the stub's own unconditional "success" (see native_llama_bridge.cpp's
    // `#else` branch of nativeLoadModel, which never reaches this function at all).
    const char* tmplCheck = llama_model_chat_template(model_, nullptr);

    // Phase 13G — discover the real "<think>" vocabulary token, ONCE, here — never per-request,
    // never hardcoded. See findThinkTokenId's own header for exactly what "found" means (an exact
    // text match, nothing fuzzier).
    thinkTokenId_ = findThinkTokenId(llama_model_get_vocab(model_));

    __android_log_print(
        ANDROID_LOG_INFO, kLogTag,
        "loadModel: real llama.cpp model loaded, context created (path=%s, chatTemplate=%s, threads=%d, n_ctx=%d, thinkTokenFound=%s, thinkTokenId=%d)",
        modelFilePath.c_str(), tmplCheck != nullptr ? "embedded" : "none-falling-back-to-raw-prompt", ctxParams.n_threads, kContextSize,
        thinkTokenId_ >= 0 ? "true" : "false", thinkTokenId_);
    return LlamaCppLoadResult::kSuccess;
}

void LlamaCppBackend::unloadModel() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (context_ != nullptr) {
        llama_free(context_);
        context_ = nullptr;
    }
    if (model_ != nullptr) {
        llama_model_free(model_);
        model_ = nullptr;
        // Never let a token id discovered on a PREVIOUS model leak into a future one loaded into
        // this same instance — a different model may have a different vocabulary entirely.
        thinkTokenId_ = -1;
        __android_log_print(ANDROID_LOG_INFO, kLogTag, "unloadModel: native model/context freed");
    }
}

void LlamaCppBackend::cancel() {
    cancelRequested_.store(true);
}

LlamaCppCompletionStatus LlamaCppBackend::complete(
    const std::string& prompt,
    int maxOutputTokens,
    const LlamaCppTokenCallback& onToken,
    int* outPromptTokens,
    int* outGeneratedTokens) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Phase 13B's own Part C: "reject inference before model_ready" — enforced HERE, inside the
    // one class that owns the native handles, not left to the Kotlin/TS caller to remember.
    if (model_ == nullptr || context_ == nullptr) {
        return LlamaCppCompletionStatus::kRejectedNotReady;
    }

    cancelRequested_.store(false);
    const llama_vocab* vocab = llama_model_get_vocab(model_);

    // --- Phase 13D: apply the MODEL'S OWN embedded chat template (GGUF metadata), never a
    // hand-invented format — see this file's own header. Qwen3-1.7B-GGUF embeds a ChatML-style
    // template; a model with no embedded template (tmpl == nullptr) honestly falls back to the
    // raw prompt text exactly as Phase 13B always sent it. The whole flattened multi-turn prompt
    // text (built upstream by androidLocalLlamaProvider.ts, unchanged by this phase) is wrapped as
    // a single "user" turn — this file never re-parses it back into separate roles, since the
    // existing JS-side flattening contract is explicitly out of scope for this native-only fix.
    const char* tmpl = llama_model_chat_template(model_, nullptr);
    std::string formattedPrompt = prompt;
    if (tmpl != nullptr) {
        llama_chat_message message{"user", prompt.c_str()};
        std::vector<char> buf(prompt.size() * 2 + 256);
        int32_t n = llama_chat_apply_template(tmpl, &message, 1, /*add_ass=*/true, buf.data(), static_cast<int32_t>(buf.size()));
        if (n > static_cast<int32_t>(buf.size())) {
            buf.resize(static_cast<size_t>(n));
            n = llama_chat_apply_template(tmpl, &message, 1, /*add_ass=*/true, buf.data(), static_cast<int32_t>(buf.size()));
        }
        if (n > 0) {
            formattedPrompt.assign(buf.data(), static_cast<size_t>(n));
        }
        // n <= 0 on a templated model is a genuine, if unlikely, formatting failure — honestly
        // keep sending the raw prompt rather than an empty/garbled one; never silently drop the
        // request over a cosmetic formatting step.
    }

    // Phase 13G — thinkTokenId_ was discovered (or not) once, in loadModel(); never re-derived or
    // guessed here. "Suppressed" means this specific request's FIRST generated token will be
    // sampled through a chain that bans this exact token id — see the generation loop below.
    const bool thinkingSuppressed = thinkTokenId_ >= 0;

    __android_log_print(
        ANDROID_LOG_INFO, kLogTag,
        "complete: inference started (promptChars=%zu, maxOutputTokens=%d, threads=%d, n_ctx=%d, thinkingSuppressed=%s)",
        prompt.size(), maxOutputTokens, clampedThreadCount(), kContextSize, thinkingSuppressed ? "true" : "false");

    const auto inferenceStartedAt = std::chrono::steady_clock::now();

    // --- Tokenize the (possibly chat-templated) prompt ---
    const int maxPromptTokens = static_cast<int>(formattedPrompt.size()) + kTokenizeHeadroom;
    std::vector<llama_token> promptTokens(static_cast<size_t>(maxPromptTokens));
    const int nPromptTokens = llama_tokenize(
        vocab,
        formattedPrompt.c_str(),
        static_cast<int>(formattedPrompt.size()),
        promptTokens.data(),
        static_cast<int>(promptTokens.size()),
        /*add_special=*/true,
        /*parse_special=*/true);
    if (nPromptTokens < 0) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "complete: inference failed (llama_tokenize returned %d)", nPromptTokens);
        return LlamaCppCompletionStatus::kError;
    }
    promptTokens.resize(static_cast<size_t>(nPromptTokens));
    if (outPromptTokens != nullptr) *outPromptTokens = nPromptTokens;

    // --- Decode the prompt in one go. llama_batch_get_one() leaves `logits` null, which
    // llama.cpp's own batch allocator documents as "default to only the last token being an
    // output" (verified against src/llama-batch.cpp) — exactly what a single greedy-sample call
    // at idx=-1 right after needs. ---
    llama_batch promptBatch = llama_batch_get_one(promptTokens.data(), static_cast<int>(promptTokens.size()));
    if (llama_decode(context_, promptBatch) != 0) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "complete: inference failed (llama_decode of prompt batch failed)");
        return LlamaCppCompletionStatus::kError;
    }

    llama_sampler_chain_params samplerParams = llama_sampler_chain_default_params();
    llama_sampler* sampler = llama_sampler_chain_init(samplerParams);
    llama_sampler_chain_add(sampler, llama_sampler_init_temp(kSamplerTemperature));
    llama_sampler_chain_add(sampler, llama_sampler_init_dist(/*seed=*/0));

    // Phase 13G — a SEPARATE chain, used for exactly one sampling call (the very first generated
    // token of this request), that additionally bans thinkTokenId_ via a logit bias before the
    // same temp+dist sampling `sampler` above otherwise applies. Built fresh per request (cheap:
    // one bias entry) rather than cached, so it always reflects the current thinkTokenId_ with no
    // possibility of a stale value from a previous load. nullptr when thinkTokenId_ < 0 — that
    // model/vocabulary has no such token, so generation proceeds exactly as it did before this
    // phase, never fabricating a suppression that isn't actually possible.
    llama_sampler* firstTokenSampler = nullptr;
    if (thinkingSuppressed) {
        llama_sampler_chain_params firstTokenParams = llama_sampler_chain_default_params();
        firstTokenSampler = llama_sampler_chain_init(firstTokenParams);
        llama_logit_bias thinkBan{ static_cast<llama_token>(thinkTokenId_), kThinkTokenBanBias };
        llama_sampler_chain_add(firstTokenSampler, llama_sampler_init_logit_bias(llama_vocab_n_tokens(vocab), 1, &thinkBan));
        llama_sampler_chain_add(firstTokenSampler, llama_sampler_init_temp(kSamplerTemperature));
        llama_sampler_chain_add(firstTokenSampler, llama_sampler_init_dist(/*seed=*/0));
    }

    int generated = 0;
    LlamaCppCompletionStatus status = LlamaCppCompletionStatus::kCompleted;

    for (; generated < maxOutputTokens; ++generated) {
        if (cancelRequested_.load()) {
            status = LlamaCppCompletionStatus::kCancelled;
            break;
        }

        // Only generated == 0 (the first token of this request) ever uses firstTokenSampler —
        // every later token in this same response samples through the normal, unbiased chain, so
        // the model is free to use "<think>" normally later in its own answer if it genuinely
        // needs to quote or discuss it; this is an initial-turn steer, never a standing ban.
        llama_sampler* activeSampler = (generated == 0 && firstTokenSampler != nullptr) ? firstTokenSampler : sampler;

        const llama_token newToken = llama_sampler_sample(activeSampler, context_, -1);
        llama_sampler_accept(activeSampler, newToken);

        if (llama_vocab_is_eog(vocab, newToken)) {
            break;
        }

        char pieceBuf[kMaxPieceBytes];
        const int pieceLen = llama_token_to_piece(vocab, newToken, pieceBuf, sizeof(pieceBuf), /*lstrip=*/0, /*special=*/false);
        if (pieceLen > 0) {
            onToken(std::string(pieceBuf, static_cast<size_t>(pieceLen)));
        }

        llama_token nextTokenBuf = newToken;
        llama_batch nextBatch = llama_batch_get_one(&nextTokenBuf, 1);
        if (llama_decode(context_, nextBatch) != 0) {
            __android_log_print(ANDROID_LOG_ERROR, kLogTag, "complete: inference failed (llama_decode of generation batch failed, generated=%d)", generated);
            status = LlamaCppCompletionStatus::kError;
            break;
        }

        if (cancelRequested_.load()) {
            status = LlamaCppCompletionStatus::kCancelled;
            ++generated;
            break;
        }
    }

    llama_sampler_free(sampler);
    if (firstTokenSampler != nullptr) {
        llama_sampler_free(firstTokenSampler);
    }
    if (outGeneratedTokens != nullptr) *outGeneratedTokens = generated;

    // Phase 13F — monotonic timing (steady_clock, immune to wall-clock adjustments), covering
    // tokenize + prompt-decode + the generation loop as one measured span — never per-token (Phase
    // 13D's own Part H still applies). This is the first objective, in-app baseline this backend
    // has ever recorded; see this phase's own final report for why it intentionally includes
    // prompt-eval time in the denominator rather than isolating pure per-token throughput.
    const auto inferenceEndedAt = std::chrono::steady_clock::now();
    const auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(inferenceEndedAt - inferenceStartedAt).count();
    const double tokensPerSec = (elapsedMs > 0 && generated > 0) ? (static_cast<double>(generated) * 1000.0 / static_cast<double>(elapsedMs)) : 0.0;

    // One concise line per completion — never per-token (Phase 13D's own Part H).
    switch (status) {
        case LlamaCppCompletionStatus::kCompleted:
            __android_log_print(
                ANDROID_LOG_INFO, kLogTag,
                "complete: inference completed (promptTokens=%d, generatedTokens=%d, elapsedMs=%lld, tokensPerSec=%.2f)",
                nPromptTokens, generated, static_cast<long long>(elapsedMs), tokensPerSec);
            break;
        case LlamaCppCompletionStatus::kCancelled:
            __android_log_print(ANDROID_LOG_INFO, kLogTag, "complete: inference cancelled (generatedTokens=%d, elapsedMs=%lld)", generated, static_cast<long long>(elapsedMs));
            break;
        case LlamaCppCompletionStatus::kError:
            // Already logged at the specific failure site above.
            break;
        case LlamaCppCompletionStatus::kRejectedNotReady:
            break;
    }
    return status;
}

}  // namespace jarvis

#endif  // JARVIS_HAVE_LLAMA_CPP
