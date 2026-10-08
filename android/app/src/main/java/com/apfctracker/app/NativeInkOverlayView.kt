package com.apfctracker.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.RectF
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
 * This is the verified-against-real-build version: the API surface below (StockBrushes.pressurePen(),
 * CanvasStrokeRenderer.draw(canvas, stroke, matrix) argument order, InProgressStrokesFinishedListener
 * implemented as an object rather than a lambda) was confirmed by an actual `gradlew assembleDebug`
 * BUILD SUCCESSFUL on the real androidx.ink 1.0.0 artifacts (see commit 0d83729 on `main`, pushed
 * from the developer's own Windows machine) — not guessed against documentation the way earlier
 * revisions of this file in this sandbox were, which used APIs (`pressurePenLatest`,
 * `draw(stroke, canvas, matrix)`, a lambda listener, `Stroke.points`) that do not exist on this
 * library version and would not have compiled.
 *
 * Architecture:
 * - Native Jetpack Ink rendering for stylus/eraser-tip input (InProgressStrokesView = wet ink,
 *   CanvasStrokeRenderer-drawn finishedStrokesView = dry ink).
 * - Finger/touch input is passed through untouched to the WebView (dispatchTouchEvent returns
 *   false for it before either child view or this ViewGroup's own handling ever sees it).
 * - Finished strokes are retained in the native dry-ink layer and reported to NativeInkPlugin,
 *   which converts and forwards them to the existing JS annotation persistence path.
 * - `documentBoundsPx` (set by NativeInkPlugin.setDocumentBounds, driven by
 *   AnnotationLayer.tsx's own wrapper bounding rect) is what a finished stroke's points are
 *   normalized against — the SAME coordinate space the JS annotation layer already uses (the
 *   document's own scrollable content box), not this overlay's on-screen viewport bounds. This
 *   replaces the earlier, deliberately-deferred "coordinate limitation" with a real fix: see
 *   NativeInkPlugin.kt's emitStrokeFinished.
 *
 * `onInterceptTouchEvent()` was tried in an earlier hand-edited version of this file and removed:
 * dispatchTouchEvent is fully overridden here and never calls super.dispatchTouchEvent(), so
 * onInterceptTouchEvent is never actually invoked by the framework for this ViewGroup — adding it
 * back would be dead code, not a real fix. Parent scroll-lock (see lockParentTouchHandling below)
 * is instead called directly from dispatchTouchEvent's own DOWN/UP/CANCEL branches, where it is
 * actually reachable.
 */
class NativeInkOverlayView(context: Context) : FrameLayout(context) {

    private val strokeRenderer = CanvasStrokeRenderer.create()
    private val identityMatrix = Matrix()
    private val finishedStrokes = mutableListOf<Stroke>()

    /** Dry-ink layer — everything already finished, redrawn only when [finishedStrokes] changes. */
    private val finishedStrokesView = object : View(context) {
        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            for (stroke in finishedStrokes) {
                strokeRenderer.draw(canvas, stroke, identityMatrix)
            }
        }
    }

    /** Wet-ink layer — Jetpack Ink's own low-latency rendering of the ACTIVE stroke only. */
    private val inProgressStrokesView = InProgressStrokesView(context)

    private val predictor = MotionEventPredictor.newInstance(this)
    private val pointerIdToStrokeId = mutableMapOf<Int, InProgressStrokeId>()

    /** Set by NativeInkPlugin right after construction; invoked once per finished stroke. */
    var onStrokeCommitted: ((Stroke) -> Unit)? = null

    /**
     * The document content box's own on-screen bounds, in the same pixel space this View's
     * MotionEvents report coordinates in — set by NativeInkPlugin.setDocumentBounds, which JS
     * drives from AnnotationLayer.tsx's wrapper bounding rect (converted to device pixels via
     * devicePixelRatio). Null until JS has reported it at least once (e.g. immediately after the
     * overlay attaches, before the first resize/layout event fires) — emitStrokeFinished falls
     * back to this overlay's own viewport bounds in that case, exactly as before.
     */
    var documentBoundsPx: RectF? = null

    /** Mutable so the JS toolbar's tool/colour/thickness/opacity selection can reach the native
     * brush via NativeInkPlugin.setBrushConfig -> updateBrush, without touching the stroke
     * lifecycle, coordinate handling, or prediction below. Defaults to a plain black pen — never a
     * hardcoded test colour. */
    var brush: Brush = Brush.createWithColorIntArgb(
        family = StockBrushes.pressurePen(),
        colorIntArgb = Color.BLACK,
        size = 6f,
        epsilon = 0.1f,
    )
        private set

    fun updateBrush(colorIntArgb: Int, sizePx: Float) {
        brush = Brush.createWithColorIntArgb(
            family = StockBrushes.pressurePen(),
            colorIntArgb = colorIntArgb,
            size = sizePx.coerceIn(1f, 48f),
            epsilon = 0.1f,
        )
    }

    private val finishedStrokesListener = object : InProgressStrokesFinishedListener {
        override fun onStrokesFinished(strokes: Map<InProgressStrokeId, Stroke>) {
            finishedStrokes.addAll(strokes.values)
            inProgressStrokesView.removeFinishedStrokes(strokes.keys)
            finishedStrokesView.invalidate()
            for (stroke in strokes.values) onStrokeCommitted?.invoke(stroke)
        }
    }

    init {
        addView(finishedStrokesView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(inProgressStrokesView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        inProgressStrokesView.addFinishedStrokesListener(finishedStrokesListener)
        // NOTE: an earlier revision of this file called inProgressStrokesView.eagerInit() here as
        // a "pre-warm the first stroke" step. That call was never seen in any actually-compiling
        // version of this file (only in a secondhand, ChatGPT-memory-reconstructed description that
        // separately turned out to be wrong about onInterceptTouchEvent too — see this class's own
        // header) and there is no verified evidence InProgressStrokesView exposes such a method on
        // this androidx.ink version. Omitted rather than guessed at again: its absence has no
        // correctness impact, only a possible one-time setup cost on the first stroke of a session.
    }

    /** [NativeInkPlugin.clearNativeInk] — wipes every finished stroke drawn so far on THIS native
     * overlay layer and cancels whatever's currently mid-draw. Never touches the JS annotation
     * store — "clear" is scoped to this native layer's own transient display only. */
    fun clearStrokes() {
        for ((_, strokeId) in pointerIdToStrokeId) {
            inProgressStrokesView.cancelStroke(strokeId, null)
        }
        pointerIdToStrokeId.clear()
        finishedStrokes.clear()
        finishedStrokesView.invalidate()
    }

    /** Walks every ancestor to disallow touch interception for the duration of a stylus gesture,
     * so a scroll container above this overlay in the view hierarchy cannot claim the gesture as a
     * page scroll mid-stroke. Called from dispatchTouchEvent's own DOWN/UP/CANCEL branches below,
     * where it is actually reachable (see this class's own header for why onInterceptTouchEvent is
     * deliberately NOT used here). */
    private fun lockParentTouchHandling() {
        var currentParent = parent
        while (currentParent != null) {
            currentParent.requestDisallowInterceptTouchEvent(true)
            currentParent = currentParent.parent
        }
    }

    private fun unlockParentTouchHandling() {
        var currentParent = parent
        while (currentParent != null) {
            currentParent.requestDisallowInterceptTouchEvent(false)
            currentParent = currentParent.parent
        }
    }

    // Overriding dispatchTouchEvent (not onTouchEvent) so a non-stylus pointer can be rejected
    // BEFORE either child view (or this ViewGroup's own touch handling) ever sees it: returning
    // false here is what lets Android's normal touch dispatch offer the event to the next view
    // down in z-order — the WebView, which this overlay sits directly on top of as a sibling.
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        val pointerIndex = event.actionIndex
        val toolType = event.getToolType(pointerIndex)
        val isStylus = toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                if (!isStylus) return false
                requestUnbufferedDispatch(event)
                predictor.record(event)
                val pointerId = event.getPointerId(pointerIndex)
                val strokeId = inProgressStrokesView.startStroke(event, pointerId, brush, identityMatrix)
                pointerIdToStrokeId[pointerId] = strokeId
                lockParentTouchHandling()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (pointerIdToStrokeId.isEmpty()) return false
                predictor.record(event)
                val predicted = predictor.predict()
                try {
                    for (i in 0 until event.pointerCount) {
                        val pointerId = event.getPointerId(i)
                        val strokeId = pointerIdToStrokeId[pointerId] ?: continue
                        inProgressStrokesView.addToStroke(event, pointerId, strokeId, predicted)
                    }
                } finally {
                    predicted?.recycle()
                }
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                val pointerId = event.getPointerId(pointerIndex)
                val strokeId = pointerIdToStrokeId.remove(pointerId) ?: return false
                inProgressStrokesView.finishStroke(event, pointerId, strokeId)
                if (pointerIdToStrokeId.isEmpty()) unlockParentTouchHandling()
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                if (pointerIdToStrokeId.isEmpty()) return false
                for ((_, strokeId) in pointerIdToStrokeId) {
                    inProgressStrokesView.cancelStroke(strokeId, event)
                }
                pointerIdToStrokeId.clear()
                unlockParentTouchHandling()
                return true
            }
        }
        return false
    }
}
