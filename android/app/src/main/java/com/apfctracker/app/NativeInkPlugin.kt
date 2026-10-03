package com.apfctracker.app

import android.graphics.Color
import android.view.ViewGroup
import androidx.ink.strokes.Stroke
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for the native Jetpack Ink overlay (see NativeInkOverlayView's own header for
 * the verified-against-real-build API notes).
 *
 * Five methods, one event:
 * - enableNativeInk() / disableNativeInk() / clearNativeInk() — overlay lifecycle.
 * - setBrushConfig({ color, size, opacity }) — lets the JS annotation toolbar's tool/colour/
 *   thickness/opacity selection reach the native brush, without touching the stroke lifecycle.
 * - nativeInkStrokeFinished event — a finished stroke, converted to normalized points and
 *   delivered to JS, which commits it through the EXISTING annotation persistence path
 *   (DocumentAnnotator.tsx's handleNativeInkStroke), not a second, parallel one.
 *
 * Phase 17 regression experiment: setDocumentBounds and the documentBoundsPx coordinate mapping
 * it fed were removed here — that mapping was never confirmed against an actual successful build/
 * device test. emitStrokeFinished has returned to the proven primitive behaviour: normalizing
 * against this overlay's own on-screen viewport bounds. JS still calls NativeInk.setDocumentBounds
 * (DocumentAnnotator.tsx is explicitly out of scope for this experiment); that call now simply has
 * no native-side implementation and rejects, caught by the existing .catch() already in that JS
 * call site — the same graceful-failure path already exercised when a native method isn't present.
 *
 * The overlay is added/removed from the Capacitor WebView's own parent ViewGroup entirely (not
 * just hidden) on enable/disable, so normal WebView interaction is unaffected whenever native ink
 * isn't explicitly turned on.
 */
@CapacitorPlugin(name = "NativeInk")
class NativeInkPlugin : Plugin() {

    private var overlay: NativeInkOverlayView? = null

    @PluginMethod
    fun enableNativeInk(call: PluginCall) {
        activity.runOnUiThread {
            attachOverlay()
            call.resolve()
        }
    }

    @PluginMethod
    fun disableNativeInk(call: PluginCall) {
        activity.runOnUiThread {
            detachOverlay()
            call.resolve()
        }
    }

    @PluginMethod
    fun clearNativeInk(call: PluginCall) {
        activity.runOnUiThread {
            overlay?.clearStrokes()
            call.resolve()
        }
    }

    /** Called by the JS toolbar whenever the active tool/colour/thickness/opacity changes (see
     * DocumentAnnotator.tsx). Colour is an opaque "#rrggbb" hex string; opacity (0-1) is folded
     * into the brush's own alpha channel since Jetpack Ink's Brush colour is itself ARGB. A no-op
     * when the overlay isn't currently attached — the next enableNativeInk() will pick up whatever
     * brush config was last sent, since updateBrush's result is stored on the overlay instance,
     * not reset on attach. */
    @PluginMethod
    fun setBrushConfig(call: PluginCall) {
        val colorHex = call.getString("color") ?: "#000000"
        val sizePx = (call.getFloat("size") ?: 6f)
        val opacity = (call.getFloat("opacity") ?: 1f).coerceIn(0f, 1f)
        val colorArgb = try {
            val parsed = Color.parseColor(colorHex)
            val alpha = Math.round(opacity * 255f)
            (parsed and 0x00FFFFFF) or (alpha shl 24)
        } catch (e: IllegalArgumentException) {
            Color.BLACK
        }
        activity.runOnUiThread {
            overlay?.updateBrush(colorArgb, sizePx)
            call.resolve()
        }
    }

    private fun attachOverlay() {
        if (overlay != null) return
        val webView = bridge.webView ?: return
        val parent = webView.parent as? ViewGroup ?: return
        val newOverlay = NativeInkOverlayView(activity)
        newOverlay.onStrokeCommitted = { stroke -> emitStrokeFinished(stroke, newOverlay) }
        overlay = newOverlay
        parent.addView(newOverlay, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    private fun detachOverlay() {
        val current = overlay ?: return
        current.onStrokeCommitted = null
        current.clearStrokes()
        (current.parent as? ViewGroup)?.removeView(current)
        overlay = null
    }

    /** Converts Jetpack Ink StrokeInput values into the normalized point format the existing JS
     * annotation path consumes. IMPORTANT (verified against a real build): Jetpack Ink 1.0.0
     * exposes Stroke.inputs, not Stroke.points.
     *
     * Phase 17 regression experiment: normalizes against this overlay's own on-screen viewport
     * bounds (overlay.width/overlay.height) — the proven primitive behaviour — rather than a
     * document-content-box mapping. */
    private fun emitStrokeFinished(stroke: Stroke, overlay: NativeInkOverlayView) {
        val width = overlay.width.toFloat()
        val height = overlay.height.toFloat()
        if (width <= 0f || height <= 0f) return

        val pointsArray = JSArray()
        val inputs = stroke.inputs
        for (index in 0 until inputs.size) {
            val point = inputs[index]
            val p = JSObject()
            p.put("x", (point.x / width).toDouble())
            p.put("y", (point.y / height).toDouble())
            p.put("pressure", point.pressure.toDouble())
            pointsArray.put(p)
        }
        val payload = JSObject()
        payload.put("points", pointsArray)
        notifyListeners("nativeInkStrokeFinished", payload)
    }
}
