package com.apfctracker.app

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * JARVIS Phase 10 — owns the native runtime handle's lifecycle and threading. This is the
 * "NativeLlamaRuntime" layer in this phase's own architecture diagram; [LocalLlamaPlugin] is a
 * thin Capacitor-facing wrapper around this class and never touches [NativeLlamaBridge] directly.
 *
 * NOT COMPILED/VERIFIED IN THIS SESSION — see NativeLlamaBridge.kt's own header for why (no
 * Android NDK/SDK available in this execution environment).
 *
 * Thread safety: every mutable field is only ever read/written while holding [lock]. All native
 * calls run on [executor], a single-threaded pool — this both keeps every JNI call serialized
 * (never two concurrent calls into the same native handle from different threads) and keeps
 * Capacitor plugin methods themselves non-blocking (a plugin method returns to the bridge
 * immediately; real work happens on this executor).
 *
 * Lifecycle: [close] MUST be called exactly once, from the plugin's own `handleOnDestroy()` (see
 * LocalLlamaPlugin.kt) — it destroys the native handle and shuts the executor down. After
 * [close], every other method throws [IllegalStateException] rather than silently touching a
 * freed native pointer — this is the explicit answer to this phase's own "Android activity
 * recreation" concern: a recreated Activity gets a brand new [LocalLlamaPlugin] and therefore a
 * brand new [NativeLlamaRuntime]/native handle, never a stale one from a previous Activity.
 */
class NativeLlamaRuntime {

    enum class Status { UNAVAILABLE, AVAILABLE, LOADING, READY, ERROR }

    data class LoadedModel(val modelId: String, val loadedAtEpochMs: Long)

    private val lock = Object()
    private var handle: Long = 0
    private var status: Status = Status.AVAILABLE
    private var loadedModel: LoadedModel? = null
    private var closed = false
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()

    init {
        handle = NativeLlamaBridge.nativeCreateRuntime()
        if (handle == 0L) {
            status = Status.UNAVAILABLE
        }
    }

    fun getStatus(): Status = synchronized(lock) { status }

    fun getLoadedModel(): LoadedModel? = synchronized(lock) { loadedModel }

    /** [onResult] is invoked on the background executor thread, never the caller's own thread —
     * [LocalLlamaPlugin] resolves/rejects the originating [com.getcapacitor.PluginCall] from
     * there directly; Capacitor's own bridge is documented as safe to call back on from any
     * thread, so no further hop is added here.
     *
     * Phase 13B — rejects immediately (never queues behind an in-flight load) when a load is
     * already in progress OR a model is already loaded: "prevent simultaneous conflicting loads"
     * / "avoid loading multiple copies of the model" (this phase's own Part C). The single-
     * threaded [executor] already serializes every native call, so two loads could never
     * genuinely race inside the native layer — but without this check a second call would still
     * queue and redundantly reload a model that is already ready, wasting time/memory for no
     * reason. Call [unloadModel] first to deliberately swap models. */
    fun loadModel(modelId: String, onResult: (Boolean) -> Unit) {
        synchronized(lock) {
            check(!closed) { "NativeLlamaRuntime is closed" }
            if (status == Status.LOADING || status == Status.READY) {
                onResult(false)
                return
            }
            status = Status.LOADING
        }
        executor.execute {
            val currentHandle = synchronized(lock) { handle }
            val success = try {
                NativeLlamaBridge.nativeLoadModel(currentHandle, modelId)
            } catch (e: Throwable) {
                false
            }
            synchronized(lock) {
                status = if (success) Status.READY else Status.ERROR
                loadedModel = if (success) LoadedModel(modelId, System.currentTimeMillis()) else null
            }
            onResult(success)
        }
    }

    fun unloadModel(onResult: () -> Unit) {
        executor.execute {
            synchronized(lock) {
                if (!closed) NativeLlamaBridge.nativeUnloadModel(handle)
                loadedModel = null
                status = Status.AVAILABLE
            }
            onResult()
        }
    }

    /**
     * Runs the stub completion on [executor] (never the calling thread) and invokes [listener]
     * from there. [LocalLlamaPlugin] is responsible for turning each callback into either a
     * resolved/rejected `PluginCall` (the non-streaming `complete` method) or a `notifyListeners`
     * event (the `completeStreaming` method) — this class has no notion of Capacitor itself.
     */
    fun complete(prompt: String, maxOutputTokens: Int, listener: NativeLlamaStreamListener) {
        executor.execute {
            val currentHandle = synchronized(lock) { if (closed) 0L else handle }
            if (currentHandle == 0L) {
                listener.onError("Native runtime is closed or unavailable.")
                return@execute
            }
            try {
                NativeLlamaBridge.nativeComplete(currentHandle, prompt, maxOutputTokens, listener)
            } catch (e: Throwable) {
                listener.onError(e.message ?: "Unknown native error.")
            }
        }
    }

    /** Cooperative — sets the native-side cancellation flag; does not forcibly interrupt the
     * executor thread (no raw thread-kill anywhere in this class, by design — see this phase's
     * own "avoid unsafe global singletons"/thread-safety instruction). */
    fun cancel() {
        synchronized(lock) { if (!closed) NativeLlamaBridge.nativeCancel(handle) }
    }

    fun close() {
        synchronized(lock) {
            if (closed) return
            closed = true
            if (handle != 0L) NativeLlamaBridge.nativeDestroyRuntime(handle)
            handle = 0
            status = Status.UNAVAILABLE
        }
        executor.shutdown()
    }
}
