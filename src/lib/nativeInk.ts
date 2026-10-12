import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import type { NormalizedPoint } from './annotations';

// Native Android low-latency stylus ink bridge (see android/app/src/main/java/com/apfctracker/app/
// NativeInkPlugin.kt and NativeInkOverlayView.kt for the native side). The Jetpack Ink API surface
// those files use is verified against a real `gradlew assembleDebug` BUILD SUCCESSFUL (commit
// 0d83729 on `main`), not guessed against documentation — see NativeInkOverlayView.kt's own header.
//
// A finished native stroke is emitted to JS and, in DocumentAnnotator.tsx, committed through the
// EXISTING handleCommitStroke/createInkAnnotation/addAnnotation/history path — the same one a
// JS-drawn stroke already uses — rather than a second, parallel persistence mechanism.
//
// COORDINATE MAPPING: setDocumentBounds tells the native side where AnnotationLayer.tsx's own
// wrapper content box currently sits on screen (CSS pixels + devicePixelRatio), so a finished
// native stroke's points are normalized against that SAME coordinate space the JS layer already
// uses, not the overlay's own on-screen viewport bounds. DocumentAnnotator.tsx calls this whenever
// that box's bounding rect changes (mount, resize, scroll settling) — see its own effect for when.
//
// BRUSH CONFIG: setBrushConfig lets the JS annotation toolbar's tool/colour/thickness/opacity
// selection reach the native brush. It does not touch stroke lifecycle, prediction, or touch
// handling — see NativeInkPlugin.kt's own setBrushConfig for exactly what it changes.
export interface NativeInkStrokeFinishedEvent {
  points: NormalizedPoint[];
}

export interface NativeInkDocumentBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface NativeInkBrushConfig {
  /** "#rrggbb" hex string. */
  color: string;
  /** Stroke size in device pixels. */
  size: number;
  /** 0-1. */
  opacity: number;
}

export interface NativeInkPlugin {
  enableNativeInk(): Promise<void>;
  disableNativeInk(): Promise<void>;
  clearNativeInk(): Promise<void>;
  setBrushConfig(config: NativeInkBrushConfig): Promise<void>;
  setDocumentBounds(bounds: NativeInkDocumentBounds): Promise<void>;
  addListener(eventName: 'nativeInkStrokeFinished', listenerFunc: (event: NativeInkStrokeFinishedEvent) => void): Promise<PluginListenerHandle>;
}

/** Converts the JS toolbar's current colour/thickness/opacity (CSS pixels, matching what
 * AnnotationLayer's own canvas already uses) into the native brush config payload.
 *
 * Pen-STYLE mapping note: the five PenStyle variants (fine/ballpoint/pencil/brush/marker) are not
 * mapped to different native Brush FAMILIES here — this project has only ever verified ONE real
 * Jetpack Ink stock brush family against an actual compiling build (StockBrushes.pressurePen(), see
 * NativeInkOverlayView.kt's own header); guessing at additional family names (e.g. a hypothetical
 * "marker" or "pencil" family) would repeat the exact unverified-API mistake this project has
 * already been burned by twice. Instead, each style's already-real, already-verified thickness/
 * opacity defaults (lib/annotations.ts's PEN_STYLE_DEFAULTS, applied when the toolbar switches
 * style) are what reaches native here — a real, honest "closest supported configuration" rather
 * than a fabricated brush-family lookup.
 *
 * `size` is scaled by devicePixelRatio: the native overlay's MotionEvents (and its brush size) are
 * in physical device pixels, while `thicknessCssPx` is the same CSS-pixel value the JS canvas path
 * already uses (itself scaled by devicePixelRatio at render time — see AnnotationLayer's own
 * sizeCanvas) — this keeps stroke thickness visually consistent between the native and JS paths. */
export function toNativeBrushConfig(color: string, thicknessCssPx: number, opacity: number, devicePixelRatio: number): NativeInkBrushConfig {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return {
    color,
    size: thicknessCssPx * dpr,
    opacity: Math.min(1, Math.max(0, opacity)),
  };
}

const NativeInk = registerPlugin<NativeInkPlugin>('NativeInk');

/** Only meaningful on Android — iOS/web builds never load the native plugin implementation, so
 * every call here is gated on this the same way nativeAuth.ts gates its own native-only paths. */
export const isNativeInkAvailable = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export default NativeInk;
