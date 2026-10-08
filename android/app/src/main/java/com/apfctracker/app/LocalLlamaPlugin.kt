package com.apfctracker.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ConcurrentHashMap

/**
 * JARVIS Phase 10 — Capacitor bridge for the Android local AI runtime proof-of-integration.
 * Phase 13B adds model discovery (`getModelStorageInfo`) and resolves a real on-device model file
 * for `loadModel` — everything else below is unchanged from Phase 10.
 *
 * Seven typed methods plus ONE event ('localLlamaStreamEvent') — never an arbitrary/general
 * native-method passthrough. Opens no network port, starts no foreground service, runs no
 * localhost server, and never downloads anything: every call here goes straight to
 * [NativeLlamaRuntime]'s own in-process method calls, or (for `getModelStorageInfo`) to
 * [LocalLlmModelStorage]'s own local-filesystem-only lookup.
 *
 * *** HONEST STATUS: as of Phase 13B, the native side behind [NativeLlamaRuntime] attempts a ***
 * *** REAL llama.cpp-backed completion ONLY once a real model file has actually been loaded; ***
 * *** otherwise it still falls back to the exact same deterministic bridge-validation STUB ***
 * *** Phase 10 shipped — see native_llama_bridge.cpp's own header. *** This plugin reports
 * whatever status/result the native side actually returns; it never claims "ready"/"model_ready"
 * on its behalf (see TypeScript-side ai/android/androidLocalLlamaProvider.ts's own
 * `getAndroidLocalLlamaHealth` for where that honesty is enforced on the other side of the
 * bridge).
 *
 * NOT COMPILED/VERIFIED IN THIS SESSION — see NativeLlamaBridge.kt's own header for why.
 *
 * Matches this project's own established plugin convention exactly (see NativeInkPlugin.kt,
 * Phase 2): `@CapacitorPlugin` + `Plugin` + `@PluginMethod` + `PluginCall.resolve()/reject()` +
 * `notifyListeners()` for events.
 */
@CapacitorPlugin(name = "LocalLlamaRuntime")
class LocalLlamaPlugin : Plugin() {

    private lateinit var runtime: NativeLlamaRuntime

    /** Tracks which `requestId`s currently have an in-flight `completeStreaming` call, so
     * [cancel] never forwards a cancellation for a request that has already finished or that
     * never existed — see this phase's own "cancellation does not crash" success criterion. */
    private val activeStreams = ConcurrentHashMap<String, Boolean>()

    override fun load() {
        runtime = NativeLlamaRuntime()
    }

    override fun handleOnDestroy() {
        runtime.close()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getRuntimeStatus(call: PluginCall) {
        val result = JSObject()
        result.put("status", runtime.getStatus().name.lowercase(Locale.US))
        call.resolve(result)
    }

    @PluginMethod
    fun getLoadedModel(call: PluginCall) {
        val loaded = runtime.getLoadedModel()
        val result = JSObject()
        if (loaded != null) {
            val model = JSObject()
            model.put("modelId", loaded.modelId)
            model.put("loadedAt", formatIso8601(loaded.loadedAtEpochMs))
            result.put("model", model)
        } else {
            result.put("model", JSONObject.NULL)
        }
        call.resolve(result)
    }

    /**
     * Phase 13B — reports whether a real `.gguf` model file is present under this app's own
     * external files directory, WITHOUT loading it (see [LocalLlmModelStorage]'s own header: a
     * pure local-filesystem listing, never a network call). `loadModel` below resolves its own
     * path the exact same way when the caller doesn't supply one explicitly.
     */
    @PluginMethod
    fun getModelStorageInfo(call: PluginCall) {
        val discovered = LocalLlmModelStorage.findDefaultModel(context)
        val result = JSObject()
        if (discovered != null) {
            result.put("modelAvailable", true)
            result.put("modelId", discovered.modelId)
            result.put("modelPath", discovered.absolutePath)
            result.put("modelSizeBytes", discovered.sizeBytes)
        } else {
            result.put("modelAvailable", false)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun loadModel(call: PluginCall) {
        // Phase 13B — an explicit `modelId` (when the TS caller already resolved one via
        // `getModelStorageInfo`) is used as-is; otherwise this resolves the same default model
        // discovery would, so a caller can always just call loadModel() directly. Either way this
        // never fabricates a path — a genuinely empty models/ directory still rejects honestly.
        val modelId = call.getString("modelId") ?: LocalLlmModelStorage.findDefaultModel(context)?.absolutePath
        if (modelId == null) {
            call.reject("No .gguf model file was found under this app's external files directory (see LLAMA_CPP_SETUP.md).")
            return
        }
        runtime.loadModel(modelId) { success ->
            if (success) {
                call.resolve()
            } else {
                call.reject("Failed to load model \"$modelId\" — either no real llama.cpp backend is compiled into this build, the file is not a valid GGUF model, or a load was already in progress.")
            }
        }
    }

    @PluginMethod
    fun unloadModel(call: PluginCall) {
        runtime.unloadModel { call.resolve() }
    }

    @PluginMethod
    fun complete(call: PluginCall) {
        val prompt = call.getString("prompt")
        if (prompt == null) {
            call.reject("prompt is required")
            return
        }
        val maxOutputTokens = call.getInt("maxOutputTokens") ?: DEFAULT_MAX_OUTPUT_TOKENS
        val textBuilder = StringBuilder()

        runtime.complete(prompt, maxOutputTokens, object : NativeLlamaStreamListener {
            override fun onToken(token: String) {
                textBuilder.append(token)
            }

            override fun onCompleted(promptTokens: Int, generatedTokens: Int) {
                val result = JSObject()
                result.put("text", textBuilder.toString())
                result.put("promptTokens", promptTokens)
                result.put("generatedTokens", generatedTokens)
                result.put("finishReason", "stop")
                call.resolve(result)
            }

            override fun onCancelled() {
                call.reject("cancelled")
            }

            override fun onError(message: String) {
                call.reject(message)
            }
        })
    }

    @PluginMethod
    fun completeStreaming(call: PluginCall) {
        val requestId = call.getString("requestId")
        val prompt = call.getString("prompt")
        if (requestId == null || prompt == null) {
            call.reject("requestId and prompt are required")
            return
        }
        val maxOutputTokens = call.getInt("maxOutputTokens") ?: DEFAULT_MAX_OUTPUT_TOKENS
        activeStreams[requestId] = true

        runtime.complete(prompt, maxOutputTokens, object : NativeLlamaStreamListener {
            override fun onToken(token: String) {
                emitStreamEvent(requestId, "text_delta") { it.put("delta", token) }
            }

            override fun onCompleted(promptTokens: Int, generatedTokens: Int) {
                activeStreams.remove(requestId)
                emitStreamEvent(requestId, "completed") {
                    it.put("promptTokens", promptTokens)
                    it.put("generatedTokens", generatedTokens)
                    it.put("finishReason", "stop")
                }
            }

            override fun onCancelled() {
                activeStreams.remove(requestId)
                emitStreamEvent(requestId, "error") {
                    it.put("code", "cancelled")
                    it.put("message", "The request was cancelled.")
                }
            }

            override fun onError(message: String) {
                activeStreams.remove(requestId)
                emitStreamEvent(requestId, "error") {
                    it.put("code", "unknown_error")
                    it.put("message", message)
                }
            }
        })

        // Resolves once the request has been ACCEPTED and started — never once it has finished.
        // Actual tokens arrive only through 'localLlamaStreamEvent' (see
        // src/lib/jarvis/ai/android/localLlamaCapacitorPlugin.ts's own doc comment on this exact
        // method, which this implements).
        call.resolve()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val requestId = call.getString("requestId")
        if (requestId != null && activeStreams.containsKey(requestId)) {
            runtime.cancel()
        }
        call.resolve()
    }

    private fun emitStreamEvent(requestId: String, type: String, fill: (JSObject) -> Unit) {
        val payload = JSObject()
        payload.put("requestId", requestId)
        payload.put("type", type)
        fill(payload)
        notifyListeners("localLlamaStreamEvent", payload)
    }

    private fun formatIso8601(epochMs: Long): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date(epochMs))
    }

    companion object {
        private const val DEFAULT_MAX_OUTPUT_TOKENS = 256
    }
}
