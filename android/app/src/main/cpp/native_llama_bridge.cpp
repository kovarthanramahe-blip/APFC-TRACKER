// JARVIS Phase 10 — JNI boundary stub (Steps 4 + 5 combined).
//
// *** THIS IS A DETERMINISTIC BRIDGE-VALIDATION STUB, NOT A REAL AI MODEL. ***
// No llama.cpp, no model file, no Vulkan, no real inference of any kind happens in this file.
// Its only job is to prove the JNI call path end to end (Kotlin -> JNI -> C++ -> callback ->
// Kotlin) with a deterministic, hand-written response — matching this phase's own brief: "the
// important thing is proving [the bridge]... without introducing model complexity prematurely."
//
// *** NOT BUILT THROUGH THE ANDROID NDK/GRADLE IN THIS SESSION. *** This execution environment
// has no Android NDK and no Android SDK at all: attempting `./gradlew tasks` here fails before
// even reaching NDK/CMake, because the Android Gradle Plugin itself cannot be resolved —
// `dl.google.com` (Google's own Maven repository, required for `com.android.tools.build:gradle`)
// returns HTTP 403 through this sandbox's own egress proxy. This is a pre-existing, environment-
// wide limitation, reproduced and confirmed (both before and after this phase's own changes, with
// an identical failure point either way) before writing this file, not something this phase
// caused or can fix by editing code — see this phase's own final report for the exact
// reproduction.
//
// It WAS, however, syntax- and type-checked for real: `g++ -std=c++17 -Wall -Wextra -c -fPIC`
// against the host JDK's own jni.h (the same JNI type/function surface the Android NDK's jni.h
// also implements) compiles this file to an object with zero errors and zero warnings. That
// confirms the JNI code itself is syntactically and semantically sound — correct method
// signatures, correct JNIEnv usage, no undefined identifiers — but it is NOT the Android NDK
// toolchain, so it confirms nothing about the actual arm64-v8a ABI, linking against Android's
// `liblog`, or the CMake/Gradle wiring in this same directory actually succeeding end to end.
//
// The small sleeps between emitted tokens exist ONLY so a human doing the device smoke test in
// Step 11 can actually observe multiple distinct events arriving over time, rather than the whole
// stream appearing to happen instantaneously — they are not a simulation of real model latency
// and must never be read as one.
#include <jni.h>
#include <atomic>
#include <chrono>
#include <cstring>
#include <thread>

namespace {

struct StubRuntime {
    std::atomic<bool> cancelRequested{false};
};

// A fixed, hand-written token sequence — never randomised, never read from any file. Exists only
// so the Kotlin/TypeScript side has something deterministic to assert against in a bridge test.
constexpr const char* kStubTokens[] = {"Hello", " from", " the", " native", " stub", "."};
constexpr int kStubTokenCount = 6;
constexpr int kStubTokenDelayMs = 150;

jmethodID findMethod(JNIEnv* env, jobject listener, const char* name, const char* signature) {
    jclass cls = env->GetObjectClass(listener);
    jmethodID id = env->GetMethodID(cls, name, signature);
    env->DeleteLocalRef(cls);
    return id;
}

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeCreateRuntime(JNIEnv* /*env*/, jobject /*thiz*/) {
    auto* runtime = new StubRuntime();
    return reinterpret_cast<jlong>(runtime);
}

JNIEXPORT jboolean JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeLoadModel(JNIEnv* env, jobject /*thiz*/, jlong handle, jstring modelId) {
    if (handle == 0) return JNI_FALSE;
    // The stub never reads a real model file. It only validates that a non-empty model id made
    // it across the bridge intact, and simulates a brief, fixed "loading" delay so the
    // LOADING -> READY status transition is actually observable, not instantaneous.
    const char* idChars = env->GetStringUTFChars(modelId, nullptr);
    bool valid = idChars != nullptr && std::strlen(idChars) > 0;
    if (idChars != nullptr) env->ReleaseStringUTFChars(modelId, idChars);
    if (!valid) return JNI_FALSE;

    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    return JNI_TRUE;
}

JNIEXPORT void JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeUnloadModel(JNIEnv* /*env*/, jobject /*thiz*/, jlong /*handle*/) {
    // Stateless beyond the cancellation flag — nothing to release for a model that was never
    // really loaded.
}

JNIEXPORT void JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeComplete(JNIEnv* env, jobject /*thiz*/, jlong handle, jstring prompt, jint /*maxOutputTokens*/, jobject listener) {
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
    runtime->cancelRequested.store(false);

    // Touch `prompt` only to prove it crossed the bridge intact — never echoed back as if it
    // were a real model response, which would misrepresent what this stub actually does.
    const char* promptChars = env->GetStringUTFChars(prompt, nullptr);
    if (promptChars != nullptr) env->ReleaseStringUTFChars(prompt, promptChars);

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

JNIEXPORT void JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeCancel(JNIEnv* /*env*/, jobject /*thiz*/, jlong handle) {
    if (handle == 0) return;
    reinterpret_cast<StubRuntime*>(handle)->cancelRequested.store(true);
}

JNIEXPORT void JNICALL Java_com_apfctracker_app_NativeLlamaBridge_nativeDestroyRuntime(JNIEnv* /*env*/, jobject /*thiz*/, jlong handle) {
    if (handle == 0) return;
    delete reinterpret_cast<StubRuntime*>(handle);
}

}  // extern "C"
