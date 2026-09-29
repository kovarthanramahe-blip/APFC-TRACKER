package com.apfctracker.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import androidx.ink.authoring.InProgressStrokeId
import androidx.ink.authoring.InProgressStrokesFinishedListener
import androidx.ink.authoring.InProgressStrokesView
import androidx.ink.brush.Brush
import androidx.ink.brush.StockBrushes
import androidx.ink.rendering.android.canvas.CanvasStrokeRenderer
import androidx.ink.strokes.Stroke
import androidx.input.motionprediction.MotionEventPredictor

/**
 * Native low-latency stylus ink overlay for APFC Tracker.
 *
 * Phase 2 / 2B scope:
 * - Native Jetpack Ink rendering for stylus input.
 * - Finger/touch input is passed through to the WebView.
 * - Finished strokes are retained in a native dry-ink layer.
 * - Finished strokes are also reported to NativeInkPlugin for JS persistence.
 *
 * Coordinate limitation:
 * Finished points are normalised against this overlay's visible width/height.
 * Document scroll/zoom mapping is intentionally outside this phase.
 */
class NativeInkOverlayView(context: Context) : FrameLayout(context) {

    private val strokeRenderer = CanvasStrokeRenderer.create()
    private val identityMatrix = Matrix()
    private val finishedStrokes = mutableListOf<Stroke>()

    /**
     * Dry-ink layer.
     *
     * Finished strokes are drawn here only after the Ink authoring layer
     * reports them as complete.
     */
    private val finishedStrokesView = object : View(context) {
        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)

            for (stroke in finishedStrokes) {
                strokeRenderer.draw(
                    canvas,
                    stroke,
                    identityMatrix
                )
            }
        }
    }

    /**
     * Wet-ink layer.
     *
     * Jetpack Ink handles low-latency rendering of the active stroke.
     */
    private val inProgressStrokesView = InProgressStrokesView(context)

    private val predictor = MotionEventPredictor.newInstance(this)

    private val pointerIdToStrokeId =
        mutableMapOf<Int, InProgressStrokeId>()

    /**
     * Called by NativeInkPlugin when a stroke has finished.
     */
    var onStrokeCommitted: ((Stroke) -> Unit)? = null

    /**
     * Single fixed pressure-sensitive pen for this proof of concept.
     */
    private val brush: Brush = Brush.createWithColorIntArgb(
        family = StockBrushes.pressurePen(),
        colorIntArgb = Color.RED,
        size = 6f,
        epsilon = 0.1f
    )

    /**
     * Jetpack Ink 1.0.0 listener implementation.
     *
     * InProgressStrokesFinishedListener is an interface, so it must be
     * implemented rather than constructed as a lambda.
     */
    private val finishedStrokesListener =
        object : InProgressStrokesFinishedListener {

            override fun onStrokesFinished(
                strokes: Map<InProgressStrokeId, Stroke>
            ) {
                finishedStrokes.addAll(strokes.values)

                inProgressStrokesView.removeFinishedStrokes(
                    strokes.keys
                )

                finishedStrokesView.invalidate()

                for (stroke in strokes.values) {
                    onStrokeCommitted?.invoke(stroke)
                }
            }
        }

    init {
        addView(
            finishedStrokesView,
            LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
            )
        )

        addView(
            inProgressStrokesView,
            LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
            )
        )

        inProgressStrokesView.addFinishedStrokesListener(
            finishedStrokesListener
        )
    }

    /**
     * Clears only the native overlay's own strokes.
     *
     * This does not modify the existing JS annotation store.
     */
    fun clearStrokes() {
        for ((_, strokeId) in pointerIdToStrokeId) {
            inProgressStrokesView.cancelStroke(
                strokeId,
                null
            )
        }

        pointerIdToStrokeId.clear()
        finishedStrokes.clear()
        finishedStrokesView.invalidate()
    }

    /**
     * Reject non-stylus pointers before child views receive them.
     *
     * This allows normal WebView touch/scroll behaviour to continue
     * when the user interacts with the page using a finger.
     */
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        val pointerIndex = event.actionIndex
        val toolType = event.getToolType(pointerIndex)

        val isStylus =
            toolType == MotionEvent.TOOL_TYPE_STYLUS ||
            toolType == MotionEvent.TOOL_TYPE_ERASER

        when (event.actionMasked) {

            MotionEvent.ACTION_DOWN,
            MotionEvent.ACTION_POINTER_DOWN -> {

                if (!isStylus) {
                    return false
                }

                requestUnbufferedDispatch(event)
                predictor.record(event)

                val pointerId =
                    event.getPointerId(pointerIndex)

                val strokeId =
                    inProgressStrokesView.startStroke(
                        event,
                        pointerId,
                        brush,
                        identityMatrix
                    )

                pointerIdToStrokeId[pointerId] = strokeId

                return true
            }

            MotionEvent.ACTION_MOVE -> {

                if (pointerIdToStrokeId.isEmpty()) {
                    return false
                }

                predictor.record(event)

                val predicted = predictor.predict()

                try {
                    for (i in 0 until event.pointerCount) {

                        val pointerId =
                            event.getPointerId(i)

                        val strokeId =
                            pointerIdToStrokeId[pointerId]
                                ?: continue

                        inProgressStrokesView.addToStroke(
                            event,
                            pointerId,
                            strokeId,
                            predicted
                        )
                    }
                } finally {
                    predicted?.recycle()
                }

                return true
            }

            MotionEvent.ACTION_UP,
            MotionEvent.ACTION_POINTER_UP -> {

                val pointerId =
                    event.getPointerId(pointerIndex)

                val strokeId =
                    pointerIdToStrokeId.remove(pointerId)
                        ?: return false

                inProgressStrokesView.finishStroke(
                    event,
                    pointerId,
                    strokeId
                )

                return true
            }

            MotionEvent.ACTION_CANCEL -> {

                if (pointerIdToStrokeId.isEmpty()) {
                    return false
                }

                for ((_, strokeId) in pointerIdToStrokeId) {
                    inProgressStrokesView.cancelStroke(
                        strokeId,
                        event
                    )
                }

                pointerIdToStrokeId.clear()

                return true
            }
        }

        return false
    }
}
