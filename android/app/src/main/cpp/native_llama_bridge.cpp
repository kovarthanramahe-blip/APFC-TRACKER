// JARVIS Phase 10 (stub) + Phase 13B (real backend) + Phase 13D (physical-device routing fix:
// Qwen3 chat templating + diagnostics in llama_cpp_backend.cpp; THIS file's own branching logic
// was already correct and is unchanged by Phase 13D) — JNI boundary.
//
// *** THE DETERMINISTIC STUB BELOW STILL EXISTS, UNCHANGED, AS THE EXPLICIT FALLBACK/TEST ***
// *** BACKEND — Phase 13B's own Part D: "Do not remove the stub implementation. Retain it as ***
// *** deterministic test/fallback backend." *** It is used whenever JARVIS_HAVE_LLAMA_CPP is not
// defined (no llama.cpp submodule checked out — see LLAMA_CPP_SETUP.md) OR a real model has not
// actually been loaded yet. It is NEVER presented as a real model — see
// androidLocalLlamaProvider.ts's own `providerHealth === 'model_ready'` gate on the TypeScript
// side, which this file's own honest status reporting feeds.
//
// *** STILL NOT LINKED/RUN ON A REAL ANDROID DEVICE IN THIS SESSION. *** This sandbox has no
// Android NDK/SDK at all (confirmed, unchanged, since Phase 10's own report). Every llama.cpp call
// this file or llama_cpp_backend.cpp uses was verified against the actual pinned submodule tag's
// real downloaded header/source (see llama_cpp_backend.cpp's own header for the Phase 13D fetch
// details), and THIS file was host-compiled clean, with zero warnings, in BOTH configurations —
// stub-only AND with JARVIS_HAVE_LLAMA_CPP actually defined (linking against the same real,
// downloaded llama.h/ggml headers llama_cpp_backend.cpp uses) — proving the branching logic
// between the stub and the real backend is itself type-correct in the exact configuration a real
// submodule-present build would use. That does NOT prove this links against the real NDK
// toolchain or runs on arm64 — DO NOT CLAIM ANDROID INFERENCE WORKS until it is built and tested
// on the physical Xiaomi Pad 6 with the llama.cpp submodule actually checked out — see this
// phase's own final report for why the submodule's absence, not this file's logic, is the most
// likely reason a build might still observe stub output.
//
// The stub portion below was, like Phase 10's own version of this file, syntax- and type-checked
// via the host JDK's own jni.h (`g++ -std=c++17 -Wall -Wextra -Wpedantic -Werror -c`) — that
// confirms the JNI surface is sound, never the Android NDK toolchain itself.
#include <jni.h>
#include <atomic>
#include <chrono>
#include <cstring>
#include <memory>
#include <string>
#include <thread>

#ifdef JARVIS_HAVE_LLAMA_CPP
#include "llama_cpp_backend.h"
#endif

namespace {

struct StubRuntime {
    std::atomic<bool> cancelRequested{false};
#ifdef JARVIS_HAVE_LLAMA_CPP
    // Constructed unconditionally alongside the stub state — holding this object costs nothing
    // until loadModel() is actually called (LlamaCppBackend's own constructor only calls
    // llama_backend_init(), never loads anything). This is what lets `nativeLoadModel` try the
    // real path first and fall back to the stub's own behaviour below when it isn't applicable.
    std::unique_ptr<jarvis::LlamaCppBackend> llamaBackend = std::make_unique<jarvis::LlamaCppBackend>();
#endif
};

// A fixed, hand-written token sequence — never randomised, never read from any file. Exists only
// so the Kotlin/TypeScript side has something deterministic to assert against in a bridge test,
// and now also so the app still has an honest, working fallback path when no real model is
// present — see this file's own header.
constexpr const char* kStubTokens[] = {"Hello", " from", " the", " native", " stub", "."};
constexpr int kStubTokenCount = 6;
constexpr int kStubTokenDelayMs = 150;

jmethodID findMethod(JNIEnv* env, jobject listener, const char* name, const char* signature) {
    jclass cls = env->GetObjectClass(listener);
    jmethodID id = env->GetMethodID(cls, name, signature);
    env->DeleteLocalRef(cls);
    return id;
}

// The stub's own deterministic completion loop, extracted verbatim from Phase 10's original
// implementation (behaviour is byte-for-byte identical to before this phase) so it can be called
// both as the "no real backend compiled in" path and the "real backend exists but has no model
// loaded yet" path, without duplicating it.
void runStubCompletion(JNIEnv* env, StubRuntime* runtime, jobject listener) {
    runtime->cancelRequested.store(false);

    jmethodID onToken = findMethod(env, listener, "onToken", "(Ljava/lang/String;)V");
    jmethodID onCompleted = findMethod(env, listener, "onCompleted", "(II)V");
    jmethodID onCancelled = findMethod(env, listener, "onCancelled", "()V");

    int generated = 0;
    for (int i = 0; i < kStubTokenCount; ++i) {
        if (runtime->cancelRequested.load()) {
            if (onCancelled != nullptr) env->CallVoidMethod(listener, onCancelled);
            return;
        }
        if (onToken != nullptr) {
            jstring token = env->NewStringUTF(kStubTokens[i]);
            env->CallVoidMethod(listener, onToken, token);
            env->DeleteLocalRef(token);
        }
        ++generated;
        if (i < kStubTokenCount - 1) std::this_thread::sleep_for(std::chrono::milliseconds(kStubTokenDelayMs));
    }

    if (onCompleted != nullptr) {
        env->CallVoidMethod(listener, onCompleted, static_cast<jint>(1), static_cast<jint>(generated));
    }
}

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeCreateRuntime(JNIEnv* /*env*/, jobject /*thiz*/) {
    auto* runtime = new StubRuntime();
    return reinterpret_cast<jlong>(runtime);
}

JNIEXPORT jboolean JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeLoadModel(JNIEnv* env, jobject /*thiz*/, jlong handle, jstring modelId) {
    if (handle == 0) return JNI_FALSE;

    const char* idChars = env->GetStringUTFChars(modelId, nullptr);
    std::string modelPath = idChars != nullptr ? std::string(idChars) : std::string();
    if (idChars != nullptr) env->ReleaseStringUTFChars(modelId, idChars);
    if (modelPath.empty()) return JNI_FALSE;

    auto* runtime = reinterpret_cast<StubRuntime*>(handle);

#ifdef JARVIS_HAVE_LLAMA_CPP
    // Phase 13B — `modelId` is now treated as an absolute on-device GGUF file path (see
    // LocalLlmModelStorage.kt, the Kotlin-side model discovery this phase adds); the real backend
    // itself never downloads or interprets it as anything else (no network, ever — see this
    // file's own header and this phase's own "no network for inference" rule).
    using jarvis::LlamaCppLoadResult;
    const LlamaCppLoadResult result = runtime->llamaBackend->loadModel(modelPath);
    if (result == LlamaCppLoadResult::kSuccess) {
        return JNI_TRUE;
    }
    // kFileNotFound / kLoadFailed / kAlreadyLoaded all honestly fail this call — never silently
    // falling back to the stub's "pretend this loaded" behaviour once a real backend exists.
    // "Falls back to the stub" means the COMPLETION path still works without a model (see
    // nativeComplete below), never that loadModel() itself is faked.
    return JNI_FALSE;
#else
    // No llama.cpp submodule compiled in — preserve Phase 10's exact original stub behaviour: it
    // never reads a real model file, it only validates that a non-empty model id crossed the
    // bridge intact, and simulates a brief, fixed "loading" delay so the LOADING -> READY status
    // transition is actually observable, not instantaneous.
    (void)runtime;
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    return JNI_TRUE;
#endif
}

JNIEXPORT void JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeUnloadModel(JNIEnv* /*env*/, jobject /*thiz*/, jlong handle) {
    if (handle == 0) return;
#ifdef JARVIS_HAVE_LLAMA_CPP
    auto* runtime = reinterpret_cast<StubRuntime*>(handle);
    runtime->llamaBackend->unloadModel();
#else
    // Stub is stateless beyond the cancellation flag — nothing to release for a model that was
    // never really loaded.
    (void)handle;
#endif
}

JNIEXPORT void JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeComplete(JNIEnv* env, jobject /*thiz*/, jlong handle, jstring prompt, jint maxOutputTokens, jobject listener) {
#ifndef JARVIS_HAVE_LLAMA_CPP
    (void)maxOutputTokens;  // only consumed by the real-backend branch below
#endif
    jmethodID onError = findMethod(env, listener, "onError", "(Ljava/lang/String;)V");

    if (handle == 0) {
        if (onError != nullptr) {
            jstring message = env->NewStringUTF("Native runtime handle is invalid.");
            env->CallVoidMethod(listener, onError, message);
            env->DeleteLocalRef(message);
        }
        return;
    }

    auto* runtime = reinterpret_cast<StubRuntime*>(handle);

    // Touch `prompt` only to prove it crossed the bridge intact in the no-real-backend case —
    // never echoed back as if it were a real model response, which would misrepresent what the
    // stub actually does.
    const char* promptChars = env->GetStringUTFChars(prompt, nullptr);
    std::string promptText = promptChars != nullptr ? std::string(promptChars) : std::string();
    if (promptChars != nullptr) env->ReleaseStringUTFChars(prompt, promptChars);

#ifdef JARVIS_HAVE_LLAMA_CPP
    // Real backend exists in this build — but only USE it once a model has genuinely been loaded
    // (isReady()). Otherwise, fall through to the exact same stub completion below: Phase 13B's
    // own Part D, "retain the stub as a fallback", applies to every build, not only the
    // no-submodule one.
    if (runtime->llamaBackend->isReady()) {
        jmethodID onToken = findMethod(env, listener, "onToken", "(Ljava/lang/String;)V");
        jmethodID onCompleted = findMethod(env, listener, "onCompleted", "(II)V");
        jmethodID onCancelled = findMethod(env, listener, "onCancelled", "()V");

        int promptTokens = 0;
        int generatedTokens = 0;
        const jarvis::LlamaCppCompletionStatus status = runtime->llamaBackend->complete(
            promptText,
            static_cast<int>(maxOutputTokens),
            [env, listener, onToken](const std::string& tokenText) {
                if (onToken == nullptr) return;
                jstring token = env->NewStringUTF(tokenText.c_str());
                env->CallVoidMethod(listener, onToken, token);
                env->DeleteLocalRef(token);
            },
            &promptTokens,
            &generatedTokens);

        switch (status) {
            case jarvis::LlamaCppCompletionStatus::kCompleted:
                if (onCompleted != nullptr) {
                    env->CallVoidMethod(listener, onCompleted, static_cast<jint>(promptTokens), static_cast<jint>(generatedTokens));
                }
                return;
            case jarvis::LlamaCppCompletionStatus::kCancelled:
                if (onCancelled != nullptr) env->CallVoidMethod(listener, onCancelled);
                return;
            case jarvis::LlamaCppCompletionStatus::kError:
                if (onError != nullptr) {
                    jstring message = env->NewStringUTF("The local LLM backend failed to generate a response.");
                    env->CallVoidMethod(listener, onError, message);
                    env->DeleteLocalRef(message);
                }
                return;
            case jarvis::LlamaCppCompletionStatus::kRejectedNotReady:
                // Fall through to the stub below — this should not normally happen, since this
                // branch already checked isReady(), but a model could in principle be unloaded by
                // another call between that check and this one; never treat that race as a crash.
                break;
        }
    }
#endif

    runStubCompletion(env, runtime, listener);
}

JNIEXPORT void JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeCancel(JNIEnv* /*env*/, jobject /*thiz*/, jlong handle) {
    if (handle == 0) return;
    auto* runtime = reinterpret_cast<StubRuntime*>(handle);
    runtime->cancelRequested.store(true);
#ifdef JARVIS_HAVE_LLAMA_CPP
    runtime->llamaBackend->cancel();
#endif
}

JNIEXPORT void JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeDestroyRuntime(JNIEnv* /*env*/, jobject /*thiz*/, jlong handle) {
    if (handle == 0) return;
    delete reinterpret_cast<StubRuntime*>(handle);
}

}  // extern "C"
