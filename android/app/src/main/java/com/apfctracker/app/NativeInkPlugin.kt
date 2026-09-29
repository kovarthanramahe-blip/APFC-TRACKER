package com.apfctracker.app

import android.view.ViewGroup
import androidx.ink.strokes.Stroke
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for the native Jetpack Ink overlay.
 *
 * Phase 2 / 2B:
 * - enableNativeInk()
 * - disableNativeInk()
 * - clearNativeInk()
 * - nativeInkStrokeFinished event
 *
 * Finished native strokes are converted to normalised points and
 * delivered to the existing JS annotation persistence path.
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

    private fun attachOverlay() {
        if (overlay != null) {
            return
        }

        val webView = bridge.webView ?: return
        val parent = webView.parent as? ViewGroup ?: return

        val newOverlay = NativeInkOverlayView(activity)

        newOverlay.onStrokeCommitted = { stroke ->
            emitStrokeFinished(
                stroke,
                newOverlay
            )
        }

        overlay = newOverlay

        parent.addView(
            newOverlay,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
    }

    private fun detachOverlay() {
        val current = overlay ?: return

        current.onStrokeCommitted = null
        current.clearStrokes()

        (current.parent as? ViewGroup)
            ?.removeView(current)

        overlay = null
    }

    /**
     * Converts Jetpack Ink StrokeInput values into the normalised
     * point format consumed by the existing JavaScript annotation path.
     *
     * IMPORTANT:
     * Jetpack Ink 1.0.0 exposes Stroke.inputs rather than Stroke.points.
     */
    private fun emitStrokeFinished(
        stroke: Stroke,
        overlay: NativeInkOverlayView
    ) {
        val width = overlay.width.toFloat()
        val height = overlay.height.toFloat()

        if (width <= 0f || height <= 0f) {
            return
        }

        val pointsArray = JSArray()

        val inputs = stroke.inputs

        for (index in 0 until inputs.size) {

            val point = inputs[index]

            val p = JSObject()

            p.put(
                "x",
                (point.x / width).toDouble()
            )

            p.put(
                "y",
                (point.y / height).toDouble()
            )

            p.put(
                "pressure",
                point.pressure.toDouble()
            )

            pointsArray.put(p)
        }

        val payload = JSObject()

        payload.put(
            "points",
            pointsArray
        )

        notifyListeners(
            "nativeInkStrokeFinished",
            payload
        )
    }
}