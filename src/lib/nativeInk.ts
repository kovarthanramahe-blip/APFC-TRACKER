import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import type { NormalizedPoint } from './annotations';

// Phase 2 / 2B (native Android low-latency stylus ink) — the smallest possible bridge to the
// native overlay (see android/app/src/main/java/com/apfctracker/app/NativeInkPlugin.kt and
// NativeInkOverlayView.kt for the native side and their own "architectural honesty" notes on what
// is/isn't verified — the exact androidx.ink method signatures involved have NOT been compiled
// against the real library in this session; see this phase's own report for why). Still not the
// full production bridge described in this session's architecture report (no setTool/setPenStyle/
// setDocumentTransform/setZoom) — but Phase 2B adds the one piece Phase 2 deliberately deferred:
// a finished native stroke is now emitted to JS and, in DocumentAnnotator.tsx, committed through
// the EXISTING handleCommitStroke/createInkAnnotation/addAnnotation/history path — the same one a
// JS-drawn stroke already uses — rather than a second, parallel persistence mechanism.
//
// COORDINATE LIMITATION (read before assuming a native stroke lines up with the document): the
// native side normalizes each point by the OVERLAY VIEW's own on-screen width/height at the
// moment the stroke finishes — i.e. fractions of the visible screen area the overlay covers, NOT
// fractions of AnnotationLayer.tsx's own content box (which can be far taller than the viewport
// and is offset by scroll position — see this session's own canvas-sizing findings). A stroke
// drawn while the document is scrolled, or committed through the JS path afterward, will NOT
// necessarily land in the same visual spot a JS-drawn stroke at those same fractions would. This
// is a known, deliberately unsolved gap, not an oversight — full scroll/zoom-aware coordinate
// mapping was explicitly out of scope for this phase (see Phase 1's own coordinate-mapping risk
// item) and needs its own dedicated pass before this is anything but a proof of concept.
export interface NativeInkStrokeFinishedEvent {
  points: NormalizedPoint[];
}

export interface NativeInkPlugin {
  enableNativeInk(): Promise<void>;
  disableNativeInk(): Promise<void>;
  clearNativeInk(): Promise<void>;
  addListener(eventName: 'nativeInkStrokeFinished', listenerFunc: (event: NativeInkStrokeFinishedEvent) => void): Promise<PluginListenerHandle>;
}

const NativeInk = registerPlugin<NativeInkPlugin>('NativeInk');

/** Only meaningful on Android — iOS/web builds never load the native plugin implementation, so
 * every call here is gated on this the same way nativeAuth.ts gates its own native-only paths. */
export const isNativeInkAvailable = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export default NativeInk;