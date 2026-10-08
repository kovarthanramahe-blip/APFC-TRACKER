#pragma once
// JARVIS Phase 13B (real llama.cpp-backed inference) + Phase 13D (Qwen3 chat templating +
// diagnostics) + Phase 13G (Qwen3 initial-token thinking suppression via a discovered vocabulary
// token id, replacing Phase 13D's own prompt-text injection attempt, which physical-device testing
// showed did not work — see llama_cpp_backend.cpp's own header for the full mechanism and why),
// sitting behind the EXISTING JNI boundary (native_llama_bridge.cpp). See LLAMA_CPP_SETUP.md (this
// directory) for how to fetch and pin the llama.cpp submodule this file depends on.
//
// NOT LINKED/RUN ON A REAL ANDROID DEVICE IN THIS SESSION — no Android NDK/SDK is available here,
// the same pre-existing limitation every earlier native-code phase (2, 10, 13B) has hit and
// documented; this is a build/link-time limitation that cannot be worked around from here. It WAS
// host-compiled (`g++ -std=c++17 -Wall -Wextra -Wpedantic -Werror`, zero warnings) against the
// REAL pinned llama.cpp tag's own downloaded `include/llama.h` + full `ggml/include/*.h` headers
// (not written from memory — see this phase's own final report for the exact fetch/compile
// commands), proving every llama.cpp API call here — including the Phase 13D chat-template
// additions — is correctly spelled, typed, and used. That proves the C++ is sound; it does not
// prove this links against the real NDK toolchain or runs on arm64, which requires an actual
// Android build.
//
// A pure C++ class — no JNI type (jobject/JNIEnv) appears anywhere in this header, matching this
// project's own existing layering (NativeLlamaRuntime.kt/LocalLlamaPlugin.kt's own JNI-vs-logic
// split, applied here one level lower, in C++). native_llama_bridge.cpp is the ONLY file that
// bridges this class's plain C++ callback (LlamaCppTokenCallback) into real JNI calls.
//
// Memory-safety rules this class enforces ITSELF, never left to a caller to remember (Phase 13B's
// own Part C):
//   - every method takes `mutex_` — no two threads may call load/unload/complete concurrently;
//   - a second loadModel() while one is already loaded, or while another load is still in
//     progress, is REJECTED (kAlreadyLoaded) — never silently layered on top of an existing model;
//   - complete() REJECTS (kRejectedNotReady) running before a model is genuinely loaded;
//   - unloadModel() and the destructor free every native llama.cpp handle exactly once, and are
//     safe to call when nothing is loaded;
//   - this class holds ONLY llama.cpp's own opaque handles plus plain C++/POD state — never an
//     Android Activity/View/JNIEnv/jobject reference of any kind, so it cannot leak or outlive one;
//   - the context size is a fixed, conservative constant (see llama_cpp_backend.cpp), never taken
//     from unvalidated caller input.
#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>

struct llama_model;
struct llama_context;

namespace jarvis {

enum class LlamaCppLoadResult { kSuccess, kAlreadyLoaded, kFileNotFound, kLoadFailed };

enum class LlamaCppCompletionStatus { kCompleted, kCancelled, kError, kRejectedNotReady };

/** Invoked once per generated token's decoded text piece — synchronous, on the calling thread,
 * exactly like the existing stub's own `nativeComplete` contract (see native_llama_bridge.cpp). */
using LlamaCppTokenCallback = std::function<void(const std::string& tokenText)>;

class LlamaCppBackend {
public:
    LlamaCppBackend();
    ~LlamaCppBackend();

    LlamaCppBackend(const LlamaCppBackend&) = delete;
    LlamaCppBackend& operator=(const LlamaCppBackend&) = delete;

    bool isReady() const;

    /** Loads a GGUF model from an ABSOLUTE on-device file path — never a URL, never fetched or
     * downloaded by this class (see this phase's own "no network for inference" rule). Rejects a
     * second load while one is already loaded (call unloadModel() first) or while another load is
     * concurrently in progress. */
    LlamaCppLoadResult loadModel(const std::string& modelFilePath);

    /** Frees every native handle this instance currently owns. Safe to call when nothing is
     * loaded (a no-op in that case). */
    void unloadModel();

    /** Cooperative — sets a flag the generation loop checks between tokens, exactly like the
     * existing stub's own cancellation contract. A no-op if no completion is in progress. */
    void cancel();

    /**
     * Runs one completion for `prompt`, invoking `onToken` once per generated token's text piece.
     * Returns the final status. Returns kRejectedNotReady WITHOUT calling `onToken` at all, and
     * without touching any native state, if no model is currently loaded — enforcing "reject
     * inference before model_ready" here, not leaving it to the Kotlin/TS caller to remember.
     * `outPromptTokens`/`outGeneratedTokens` (may be null) report token counts for telemetry,
     * matching the existing stub's own `onCompleted(promptTokens, generatedTokens)` contract.
     */
    LlamaCppCompletionStatus complete(
        const std::string& prompt,
        int maxOutputTokens,
        const LlamaCppTokenCallback& onToken,
        int* outPromptTokens,
        int* outGeneratedTokens);

private:
    mutable std::mutex mutex_;
    std::atomic<bool> cancelRequested_{false};
    std::atomic<bool> loadInProgress_{false};
    bool backendInitialized_ = false;

    llama_model* model_ = nullptr;
    llama_context* context_ = nullptr;

    /** Phase 13G — the vocabulary token id whose exact text is "<think>" on the currently loaded
     * model, discovered once in loadModel() by scanning the real vocabulary (never hardcoded,
     * never guessed) — see llama_cpp_backend.cpp's own header for the full mechanism. `-1` (the
     * same sentinel value as llama.h's own LLAMA_TOKEN_NULL; not spelled that way here so this
     * header still never needs to include <llama.h>) means no such token was found on this
     * model/vocabulary — complete() must then behave exactly as it did before this phase, never
     * fabricating a suppression that isn't actually possible. */
    int32_t thinkTokenId_ = -1;
};

}  // namespace jarvis
