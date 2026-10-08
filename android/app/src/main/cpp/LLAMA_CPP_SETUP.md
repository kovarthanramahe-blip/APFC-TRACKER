# JARVIS Phase 13B — llama.cpp submodule & model setup

This directory's `CMakeLists.txt` builds a REAL llama.cpp-backed local LLM backend
(`llama_cpp_backend.cpp`) whenever the `llama.cpp/` submodule below is actually checked out — and
builds the exact, unchanged Phase 10 deterministic stub otherwise. Nothing is downloaded or
bundled automatically; every step below is something *you* run, once, on your real Windows/Android
dev machine.

## 1. Fetch and pin the llama.cpp submodule

This repository's `.gitmodules` already declares the submodule (added in this phase):

```
[submodule "android/app/src/main/cpp/llama.cpp"]
	path = android/app/src/main/cpp/llama.cpp
	url = https://github.com/ggml-org/llama.cpp.git
	branch = b11444
```

On your own machine, from the repository root:

```sh
git submodule update --init --recursive android/app/src/main/cpp/llama.cpp
```

This checks out the `b11444` branch tip. For a fully reproducible, byte-identical checkout (not
just "whatever `b11444` currently points to"), pin the exact commit this phase was written and
verified against:

```sh
cd android/app/src/main/cpp/llama.cpp
git checkout 4f5406761517648c23dbd60ea5ade37f77a316c9
cd -
git add android/app/src/main/cpp/llama.cpp
git commit -m "chore: pin llama.cpp submodule to b11444 (4f54067)"
```

Both the branch name and that exact commit SHA were confirmed to exist on
`https://github.com/ggml-org/llama.cpp` at the time this phase was written
(`git ls-remote --tags https://github.com/ggml-org/llama.cpp.git`). Pin a newer tag yourself if you
want to track upstream — `llama_cpp_backend.cpp` only calls long-stable, non-deprecated API
(`llama_model_load_from_file`, `llama_init_from_model`, `llama_decode`, the sampler-chain API,
`llama_tokenize`/`llama_token_to_piece`), but any future llama.cpp release could still rename or
change these; re-run the verification in step 4 below after re-pinning.

## 2. Build

No change to your existing build command — `./gradlew assembleDebug` (or Android Studio's own
build) picks up the submodule automatically once it's checked out: `CMakeLists.txt` detects
`llama.cpp/CMakeLists.txt` exists and adds `llama_cpp_backend.cpp` + links `llama` automatically. If
you skip step 1 entirely, the build is unaffected — you get the exact same stub-only
`jarvis_llama_bridge.so` this project has always produced.

First build will take noticeably longer (llama.cpp/ggml themselves compile) — this is expected and
one-time per clean build.

## 3. Obtain, verify, and place the model (NEVER bundled, NEVER downloaded by this app)

Primary target model: **Qwen3-1.7B-GGUF, Q4_K_M quantization** (`Qwen3-1.7B-Q4_K_M.gguf`, ≈1.28 GB,
Apache 2.0 license).

1. Download it yourself from its official Hugging Face repository (e.g. search
   `Qwen3-1.7B-GGUF` on huggingface.co and pick the `Q4_K_M` file) — this app never does this for
   you, and never will without you explicitly triggering it in a future phase.
2. Verify the download's integrity against the SHA256 the model's own Hugging Face repository page
   publishes for that exact file (check the repo's file listing / any published checksum manifest —
   Hugging Face does not always show a SHA256 in the UI, so if none is published, compute and note
   your own local hash so you can detect silent corruption on a later re-copy):
   ```sh
   sha256sum Qwen3-1.7B-Q4_K_M.gguf
   ```
3. Place it on the device under this app's own external files directory, in a `models/`
   subdirectory — this is what `LocalLlmModelStorage.kt` (this phase) scans:
   ```sh
   adb shell mkdir -p /sdcard/Android/data/com.apfctracker.app/files/models
   adb push Qwen3-1.7B-Q4_K_M.gguf /sdcard/Android/data/com.apfctracker.app/files/models/
   ```
   (Exact path may differ slightly by Android version/OEM — `Context.getExternalFilesDir(null)` is
   the authoritative source; the command above is the common case on both target devices, Xiaomi
   Pad 6 and Samsung S24 Ultra.)

## 4. Load it, test one prompt, test streaming, test cancellation

Once the APK with the real backend is installed and the file is in place:

1. Open Command Centre → Ask JARVIS. The provider health reported should move from `unavailable`
   to `available` once the app detects the `.gguf` file (via `getModelStorageInfo`), then to
   `model_ready` only after a successful `loadModel()` call.
2. **One prompt**: ask a simple question (e.g. "what should i study next" — still answered by the
   deterministic Decision Engine, per this phase's own architecture rule 2; try a free-form
   question instead to actually exercise the LLM path once a future phase routes one there, or
   drive `complete()` directly via the existing Capacitor plugin for a manual smoke test). Confirm
   the response text is coherent and provenance reports `android_local_ai` (never
   `android_native_stub`) — see `androidLocalLlamaProvider.ts`'s own `isRealModel` gate.
3. **Streaming**: use the existing `completeStreaming`/`localLlamaStreamEvent` path (unchanged by
   this phase) and confirm multiple `text_delta` events actually arrive incrementally, not as one
   batch — `adb logcat` timestamps on consecutive events should show real gaps, not all-at-once.
4. **Cancellation**: start a longer completion and call `cancel()` partway through; confirm
   generation stops promptly (no more `text_delta` events after cancellation) and no crash/leak
   follows — repeat a few times to rule out a race.
5. **RAM/latency**: capture `adb shell dumpsys meminfo com.apfctracker.app` before/after loading
   the model (expect the resident set to grow by roughly the model file's own size, ~1.3 GB, since
   this phase loads with `n_gpu_layers=0`, i.e. entirely into CPU-addressable memory — confirm
   neither target device OOM-kills the app) and time a short completion end-to-end (first-token
   latency and tokens/sec) on both the Xiaomi Pad 6 and the Samsung S24 Ultra.

**Nothing above has been run in this session** — no Android NDK/SDK, no device, no model file
exist in this sandbox. Every number/outcome must be captured by you on the real hardware before any
claim that on-device inference actually works.
