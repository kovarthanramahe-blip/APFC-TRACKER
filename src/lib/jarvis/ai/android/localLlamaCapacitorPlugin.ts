// JARVIS Phase 10 — the literal "Capacitor Native Plugin" layer in this phase's own architecture
// diagram, expressed exactly the way this project's existing native bridge already does it (see
// lib/nativeInk.ts, Phase 2): a typed plugin interface passed to registerPlugin(), plus a
// platform-gate constant. The native (Kotlin) side is
// android/app/src/main/java/com/apfctracker/app/LocalLlamaPlugin.kt — registered under the exact
// plugin name 'LocalLlamaRuntime' used below.
//
// This file is the ONLY place anything in src/lib/jarvis/ touches @capacitor/core — everything
// above it (nativeLlamaRuntime.ts, androidLocalLlamaProvider.ts) depends only on
// NativeLlamaRuntimeContract.ts's own types, never on this module or on @capacitor/core directly.
import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import type { JarvisAndroidRuntimeStatus, JarvisAndroidLoadedModel, NativeLlamaFinishReason } from './nativeLlamaRuntimeContract';

export interface LocalLlamaCompleteOptions {
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LocalLlamaCompleteResult {
  text: string;
  promptTokens?: number;
  generatedTokens?: number;
  finishReason: NativeLlamaFinishReason;
}

export interface LocalLlamaStreamOptions extends LocalLlamaCompleteOptions {
  /** Caller-generated — lets multiple in-flight streams (now or in the future) and their
   * cancellation be told apart on the native side; the current native stub supports one
   * in-flight stream, but the id is part of the contract from the start rather than retrofitted
   * later. */
  requestId: string;
}

/** A JSON-serializable subset of the existing JarvisAiStreamEvent union (ai/types.ts) — the wire
 * shape emitted over the 'localLlamaStreamEvent' event below. Deliberately NOT a redefinition of
 * that union's meaning, only of which of its cases can cross a Capacitor bridge as plain JSON
 * (an AbortSignal, for instance, never could) — see nativeLlamaRuntime.ts for where this is
 * reassembled into the real JarvisAiStreamEvent values callers receive. */
export type LocalLlamaStreamWireEvent =
  | { requestId: string; type: 'text_delta'; delta: string }
  | { requestId: string; type: 'text_done'; text: string }
  | { requestId: string; type: 'completed'; promptTokens?: number; generatedTokens?: number; finishReason: NativeLlamaFinishReason }
  | { requestId: string; type: 'error'; code: string; message: string };

export interface LocalLlamaRuntimePlugin {
  getRuntimeStatus(): Promise<{ status: JarvisAndroidRuntimeStatus }>;
  getLoadedModel(): Promise<{ model: JarvisAndroidLoadedModel | null }>;
  loadModel(options: { modelId: string }): Promise<void>;
  unloadModel(): Promise<void>;
  complete(options: LocalLlamaCompleteOptions): Promise<LocalLlamaCompleteResult>;
  /** Resolves once the native side has ACCEPTED and started the streaming request — actual
   * tokens arrive only via the 'localLlamaStreamEvent' listener below, never as this promise's
   * own resolved value (this is what makes it genuinely streaming rather than a buffered
   * single-shot call dressed up as one). */
  completeStreaming(options: LocalLlamaStreamOptions): Promise<void>;
  cancel(options: { requestId: string }): Promise<void>;
  addListener(eventName: 'localLlamaStreamEvent', listenerFunc: (event: LocalLlamaStreamWireEvent) => void): Promise<PluginListenerHandle>;
}

const LocalLlamaRuntime = registerPlugin<LocalLlamaRuntimePlugin>('LocalLlamaRuntime');

/** Only meaningful on Android — iOS/web builds never load the native plugin implementation (no
 * such implementation is written for those platforms in this phase), so every call site gates on
 * this exactly the way lib/nativeInk.ts's own isNativeInkAvailable already does. */
export const isLocalLlamaRuntimeAvailable = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export default LocalLlamaRuntime;
