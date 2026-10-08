package com.apfctracker.app

import android.graphics.Color
import android.graphics.RectF
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
 * Six methods, one event:
 * - enableNativeInk() / disableNativeInk() / clearNativeInk() — overlay lifecycle.
 * - setBrushConfig({ color, size, opacity }) — lets the JS annotation toolbar's tool/colour/
 *   thickness/opacity selection reach the native brush, without touching the stroke lifecycle.
 * - setDocumentBounds({ left, top, width, height, devicePixelRatio }) — lets JS
 *   (AnnotationLayer.tsx) tell the native side where the document's own scrollable content box
 *   currently sits on screen, in CSS pixels, so a finished stroke's points can be normalized
 *   against that same coordinate space instead of this overlay's own viewport bounds. This is the
 *   real fix for the coordinate-offset gap that was previously left as a known, deliberate
 *   limitation.
 * - nativeInkStrokeFinished event — a finished stroke, converted to normalized points and
 *   delivered to JS, which commits it through the EXISTING annotation persistence path
 *   (DocumentAnnotator.tsx's handleNativeInkStroke), not a second, parallel one.
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

    /** Called by AnnotationLayer.tsx (via DocumentAnnotator.tsx) whenever the document content
     * box's own bounding rect changes — mount, resize, or scroll settling. `left`/`top`/`width`/
     * `height` are CSS pixels (exactly what element.getBoundingClientRect() returns);
     * `devicePixelRatio` converts them into the same physical-pixel space this overlay's own
     * MotionEvents report coordinates in. Both this overlay and the WebView are MATCH_PARENT
     * siblings of the same parent ViewGroup, so no additional offset between them is needed. */
    @PluginMethod
    fun setDocumentBounds(call: PluginCall) {
        val left = call.getFloat("left") ?: 0f
        val top = call.getFloat("top") ?: 0f
        val width = call.getFloat("width") ?: 0f
        val height = call.getFloat("height") ?: 0f
        val dpr = (call.getFloat("devicePixelRatio") ?: 1f).let { if (it > 0f) it else 1f }
        activity.runOnUiThread {
            overlay?.documentBoundsPx = RectF(left * dpr, top * dpr, (left + width) * dpr, (top + height) * dpr)
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
     * Coordinate fix: normalizes against the document content box (overlay.documentBoundsPx, set
     * by setDocumentBounds above) when it's known, falling back to this overlay's own on-screen
     * viewport bounds only if JS hasn't reported the document box yet (e.g. the very first stroke
     * before any layout effect has fired) — this preserves the old behaviour as a safety net
     * rather than silently producing a divide-by-zero or a stroke normalized against a zero-size
     * box. */
    private fun emitStrokeFinished(stroke: Stroke, overlay: NativeInkOverlayView) {
        val bounds = overlay.documentBoundsPx
        val left: Float
        val top: Float
        val width: Float
        val height: Float
        if (bounds != null && bounds.width() > 0f && bounds.height() > 0f) {
            left = bounds.left
            top = bounds.top
            width = bounds.width()
            height = bounds.height()
        } else {
            left = 0f
            top = 0f
            width = overlay.width.toFloat()
            height = overlay.height.toFloat()
        }
        if (width <= 0f || height <= 0f) return

        val pointsArray = JSArray()
        val inputs = stroke.inputs
        for (index in 0 until inputs.size) {
            val point = inputs[index]
            val p = JSObject()
            p.put("x", ((point.x - left) / width).toDouble())
            p.put("y", ((point.y - top) / height).toDouble())
            p.put("pressure", point.pressure.toDouble())
            pointsArray.put(p)
        }
        val payload = JSObject()
        payload.put("points", pointsArray)
        notifyListeners("nativeInkStrokeFinished", payload)
    }
}
