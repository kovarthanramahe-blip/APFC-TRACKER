// Premium Study Reader — Stylus Stroke Rendering (Phase C). The ONLY module that calls
// perfect-freehand: turns a list of already-captured NormalizedPoints (see lib/annotations.ts —
// 0-1 fractions of the reading container, exactly as before) into a pixel-space outline polygon
// ready to fill on a canvas. Pointer input handling (capture, coalesced samples, touch/pen
// classification), the normalized storage format, and persistence are all UNCHANGED by this module
// — perfect-freehand only ever affects stroke SHAPE, computed fresh at render time from the same
// normalized points that were always stored, so nothing here is a second geometry representation.
//
// perfect-freehand was added specifically because pen quality is a primary requirement: it
// produces genuinely tapered, pressure-aware outlines (not a constant-width centerline connected
// by straight segments), it is tiny (~3-4kB min+gzip) with zero runtime dependencies of its own,
// and it degrades gracefully to a velocity-based synthetic taper (`simulatePressure`) for
// mouse input that never reports real pressure — never a hard requirement on stylus hardware.
//
// Phase 8J — strokeOutline()'s real per-point cost (tangent/normal/outline computation) made it too
// expensive to call on every animation frame during an ACTIVE gesture on real Android/Chromium
// WebView hardware (confirmed on two physical devices) — a Phase 8I attempt to cap the input point
// count only bounded the cost, it didn't make it cheap. strokeOutline/getStroke is therefore only
// ever called from AnnotationLayer.tsx's COMMITTED-canvas redraw now (once, exactly when a stroke
// actually finishes — see its own effect's dependency array), never from the live in-progress
// preview, which uses its own separate, deliberately cheap renderer (drawLivePreviewStroke, a plain
// stroked polyline with no perfect-freehand involvement — the same technique
// components/annotations/NoteEditorDialog.tsx's MiniInkCanvas already uses and which is proven fast
// on the same hardware). This module's own scope is unchanged: it is still the only place that
// calls perfect-freehand, still only ever for the final, high-quality, persisted render.
import { getStroke } from 'perfect-freehand';
import type { NormalizedPoint, PenStyle } from './annotations';

export interface StrokeStyleOptions {
  thinning: number;
  smoothing: number;
  streamline: number;
}

// Five distinct pen "feels", differentiated by how strongly pressure affects width and how
// aggressively the path is smoothed/streamlined — genuinely different presets, not a cosmetic
// relabelling of the same numbers. Fine/ballpoint are both fairly hard-edged (a fine tip barely
// tapers at all; a ballpoint tapers a bit more), pencil is grainy/textured-feeling (low smoothing),
// brush and marker both taper heavily like a soft/felt tip (brush more so, matching its much larger
// default thickness — see PEN_STYLE_DEFAULTS in lib/annotations.ts).
export const PEN_STYLE_OPTIONS: Record<PenStyle, StrokeStyleOptions> = {
  fine: { thinning: 0.35, smoothing: 0.45, streamline: 0.45 },
  ballpoint: { thinning: 0.55, smoothing: 0.5, streamline: 0.5 },
  pencil: { thinning: 0.25, smoothing: 0.3, streamline: 0.25 },
  brush: { thinning: 0.85, smoothing: 0.65, streamline: 0.6 },
  marker: { thinning: 0.15, smoothing: 0.4, streamline: 0.3 },
};

// A highlighter is a flat, constant-width translucent marker — near-zero thinning, light
// smoothing (just enough to avoid visibly jagged corners at typical highlighter thickness).
export const HIGHLIGHTER_STROKE_OPTIONS: StrokeStyleOptions = { thinning: 0.05, smoothing: 0.3, streamline: 0.2 };

/** True when at least one captured point carries a real pressure sample (i.e. the stroke was drawn
 * with an actual pressure-reporting stylus) — used to decide whether perfect-freehand should trust
 * that real pressure data or fall back to its own velocity-based `simulatePressure` for input (a
 * mouse) that never reports pressure at all. Never assumes stylus availability; always degrades. */
export function hasRealPressureData(points: readonly NormalizedPoint[]): boolean {
  return points.some((p) => p.pressure !== undefined);
}

/**
 * Converts normalized (0-1) points into a pixel-space outline polygon for `width`x`height` — the
 * current canvas render size. Calling this fresh on every render (never caching an outline across
 * a resize) is what keeps ink pixel-crisp and correctly scaled after a zoom/orientation change,
 * exactly like the plain-line renderer it replaces. Returns [] for fewer than 2 points (nothing to
 * draw) — callers should gate on lib/annotations.ts's own isMeaningfulStroke before this matters.
 */
export function strokeOutline(points: readonly NormalizedPoint[], width: number, height: number, thicknessPx: number, style: StrokeStyleOptions): [number, number][] {
  if (points.length < 2 || width <= 0 || height <= 0) return [];
  const pixelPoints: [number, number, number][] = points.map((p) => [p.x * width, p.y * height, p.pressure ?? 0.5]);
  const outline = getStroke(pixelPoints, {
    size: thicknessPx,
    thinning: style.thinning,
    smoothing: style.smoothing,
    streamline: style.streamline,
    simulatePressure: !hasRealPressureData(points),
  });
  return outline as [number, number][];
}

/** The style preset for a given ink annotation's tool — a highlighter is always its own flat-marker
 * style regardless of `penStyle` (which highlighterInk annotations don't even carry). */
export function styleForPenStyle(penStyle: PenStyle): StrokeStyleOptions {
  return PEN_STYLE_OPTIONS[penStyle] ?? PEN_STYLE_OPTIONS.fine;
}
