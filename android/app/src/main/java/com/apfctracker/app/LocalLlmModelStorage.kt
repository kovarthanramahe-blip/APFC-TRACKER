package com.apfctracker.app

import android.content.Context
import java.io.File

/**
 * JARVIS Phase 13B — model discovery for the real llama.cpp backend.
 *
 * NOT COMPILED/VERIFIED IN THIS SESSION — see NativeLlamaBridge.kt's own header for why (no
 * Android NDK/SDK in this sandbox); this file needs only the Android SDK (not the NDK) to compile,
 * but is still unverified here for the same reason every Android-targeted file in this project is.
 *
 * This is the WHOLE of this app's own "model management" on the Android side (Phase 13B's own
 * Part D): it only ever LISTS an already-present `.gguf` file under this app's own external files
 * directory — it never downloads, fetches, or writes a model file itself, and never touches the
 * network. The user/operator places the file there themselves (see LLAMA_CPP_SETUP.md, this
 * project's cpp/ directory) — e.g. via `adb push`, a file manager app, or a future
 * import-from-Downloads feature in a LATER phase (explicitly out of scope here).
 *
 * `getExternalFilesDir` (not `getFilesDir`/internal storage) is used deliberately: it is still
 * app-private (not visible to other apps, not shared/public storage) but is the directory a user
 * can reach via USB/MTP file transfer or `adb push` without root — internal storage
 * (`/data/data/...`) is not reachable that way on a non-rooted device, which would make it
 * impossible for a user to ever place a 1.28 GB file there themselves.
 */
object LocalLlmModelStorage {
    private const val MODELS_SUBDIRECTORY = "models"
    private const val GGUF_EXTENSION = ".gguf"

    data class DiscoveredModel(val modelId: String, val absolutePath: String, val sizeBytes: Long)

    /**
     * Lists every `.gguf` file under `<externalFilesDir>/models/`, largest first (the most likely
     * "the one the user actually means" when more than one is present — never a guess beyond
     * ordering; the caller decides which, if any, to load). Returns an empty list — never throws —
     * when the directory does not exist or Android denies access to external storage for any
     * reason (e.g. the OS returning null external storage), matching this project's own "never a
     * guessed/fabricated result" convention.
     */
    fun listDiscoveredModels(context: Context): List<DiscoveredModel> {
        val baseDir = context.getExternalFilesDir(null) ?: return emptyList()
        val modelsDir = File(baseDir, MODELS_SUBDIRECTORY)
        val files = modelsDir.listFiles() ?: return emptyList()

        return files
            .filter { it.isFile && it.name.endsWith(GGUF_EXTENSION, ignoreCase = true) }
            .map { DiscoveredModel(modelId = it.name, absolutePath = it.absolutePath, sizeBytes = it.length()) }
            .sortedByDescending { it.sizeBytes }
    }

    /** The single model `loadModel()` (LocalLlamaPlugin) should use when the caller does not name
     * one explicitly — the largest `.gguf` file found, or null if none exists. Never fabricates a
     * model when the directory is empty. */
    fun findDefaultModel(context: Context): DiscoveredModel? = listDiscoveredModels(context).firstOrNull()
}
