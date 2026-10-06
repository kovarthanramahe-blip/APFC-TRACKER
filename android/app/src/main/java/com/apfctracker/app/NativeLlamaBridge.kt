package com.apfctracker.app

/**
 * JARVIS Phase 10 — JNI boundary onto the native runtime stub.
 *
 * *** THE NATIVE SIDE THIS CALLS INTO IS A DETERMINISTIC BRIDGE-VALIDATION STUB, NOT LLAMA.CPP, ***
 * *** NOT A REAL MODEL. *** See native_llama_bridge.cpp's own header and this phase's final
 * report for the exact, honest boundary of what is proven here. Nothing on this file's own JVM
 * side knows or cares that the native side is a stub — that honesty lives in the native code and
 * in NativeLlamaRuntime.kt's/the plugin's own status reporting, never faked at this layer either.
 *
 * NOT COMPILED/VERIFIED IN THIS SESSION: this execution environment has no Android NDK/SDK (see
 * this phase's own report for the exact, reproduced Gradle failure — dl.google.com is blocked by
 * this sandbox's own egress proxy, unrelated to anything this phase changed). This file is
 * written to standard Kotlin/JNI convention and reviewed carefully, but has not been compiled.
 *
 * Every method takes or returns a plain `Long` native-pointer handle. Ownership is explicit:
 * [nativeCreateRuntime] allocates; [nativeDestroyRuntime] is the ONLY method that frees it; every
 * other method only operates on an already-live handle. Calling anything here on a handle after
 * [nativeDestroyRuntime] has already been called on it is undefined behaviour, exactly like any
 * other raw native pointer — there is no reference counting. [NativeLlamaRuntime] is the one
 * place in this project responsible for respecting that contract.
 *
 * This object is the ONLY file in this project declaring `external fun` — a deliberately narrow
 * JNI surface (five functions, matching this phase's own brief's method list), never a general
 * "call any native method" escape hatch.
 */
object NativeLlamaBridge {
    init {
        System.loadLibrary("jarvis_llama_bridge")
    }

    /** Allocates a new native runtime instance. Returns an opaque handle; never 0 on success — 0
     * is reserved to mean "no runtime". */
    external fun nativeCreateRuntime(): Long

    /** Synchronously stub-"loads" a model by id. Returns true on success. The current native
     * implementation never reads a real model file from disk — see native_llama_bridge.cpp. */
    external fun nativeLoadModel(handle: Long, modelId: String): Boolean

    external fun nativeUnloadModel(handle: Long)

    /**
     * Runs the stub's deterministic completion for [prompt], invoking [listener]'s
     * `onToken`/`onCompleted`/`onCancelled`/`onError` once per emitted event — synchronously, on
     * the CALLING thread. The native stub spawns no thread of its own; [NativeLlamaRuntime] is
     * responsible for calling this from its own background executor, never the caller's thread.
     */
    external fun nativeComplete(handle: Long, prompt: String, maxOutputTokens: Int, listener: NativeLlamaStreamListener)

    /** Cooperative cancellation: sets a flag the in-progress [nativeComplete] call checks between
     * emitted tokens. A no-op if no completion is currently in progress on this handle. */
    external fun nativeCancel(handle: Long)

    external fun nativeDestroyRuntime(handle: Long)
}

/**
 * The JNI callback interface [NativeLlamaBridge.nativeComplete] invokes from C++ via
 * `CallVoidMethod` — implemented by [NativeLlamaRuntime]. Kept separate from that class (not
 * `NativeLlamaRuntime` itself implementing it directly) so the JNI side only ever needs to resolve
 * these four method signatures, never anything else [NativeLlamaRuntime] happens to expose.
 */
interface NativeLlamaStreamListener {
    fun onToken(token: String)
    fun onCompleted(promptTokens: Int, generatedTokens: Int)
    fun onCancelled()
    fun onError(message: String)
}
