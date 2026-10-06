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
 *
 * Six typed methods (this phase's own Step 3 list) plus ONE event ('localLlamaStreamEvent') —
 * never an arbitrary/general native-method passthrough. Opens no network port, starts no
 * foreground service, runs no localhost server: every call here goes straight to
 * [NativeLlamaRuntime]'s own in-process method calls.
 *
 * *** HONEST STATUS: the native side behind [NativeLlamaRuntime] is, as of this phase, a ***
 * *** deterministic bridge-validation STUB — NOT llama.cpp, NOT a real model. *** This plugin
 * reports whatever status/result the native stub actually returns; it never claims
 * "ready"/"model_ready" on the stub's behalf (see TypeScript-side ai/android/
 * androidLocalLlamaProvider.ts's own `getAndroidLocalLlamaHealth` for where that honesty is
 * enforced on the other side of the bridge).
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

    @PluginMethod
    fun loadModel(call: PluginCall) {
        val modelId = call.getString("modelId")
        if (modelId == null) {
            call.reject("modelId is required")
            return
        }
        runtime.loadModel(modelId) { success ->
            if (success) call.resolve() else call.reject("Failed to load model \"$modelId\" (native stub reported failure).")
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
