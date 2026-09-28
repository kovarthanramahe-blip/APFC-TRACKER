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
import { getStroke } from 'perfect-freehand';
import type { NormalizedPoint, PenStyle } from './annotations';

export interface StrokeStyleOptions {
  thinning: number;
  smoothing: number;
  streamline: number;
}

// Three distinct pen "feels", differentiated only by how strongly pressure affects width and how
// aggressively the path is smoothed/streamlined — genuinely different presets, not a cosmetic
// relabelling of the same numbers.
export const PEN_STYLE_OPTIONS: Record<PenStyle, StrokeStyleOptions> = {
  pen: { thinning: 0.55, smoothing: 0.5, streamline: 0.5 },
  pencil: { thinning: 0.25, smoothing: 0.3, streamline: 0.25 },
  fountain: { thinning: 0.85, smoothing: 0.6, streamline: 0.55 },
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

/** The style preset for a given ink annotation's tool — pen/pencil/fountain share the same
 * pressure-shape family, a highlighter is always its own flat-marker style regardless of
 * `penStyle` (which highlighterInk annotations don't even carry). */
export function styleForPenStyle(penStyle: PenStyle): StrokeStyleOptions {
  return PEN_STYLE_OPTIONS[penStyle] ?? PEN_STYLE_OPTIONS.pen;
}
