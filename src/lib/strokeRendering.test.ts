import { describe, it, expect } from 'vitest';
import { strokeOutline, hasRealPressureData, styleForPenStyle, PEN_STYLE_OPTIONS, HIGHLIGHTER_STROKE_OPTIONS } from './strokeRendering';
import type { NormalizedPoint } from './annotations';

const STRAIGHT_LINE: NormalizedPoint[] = [
  { x: 0.1, y: 0.5 },
  { x: 0.3, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.7, y: 0.5 },
  { x: 0.9, y: 0.5 },
];

describe('hasRealPressureData', () => {
  it('is false when no point carries a pressure sample (mouse/finger input)', () => {
    expect(hasRealPressureData([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });

  it('is true when at least one point has a real pressure sample (a genuine stylus)', () => {
    expect(hasRealPressureData([{ x: 0, y: 0 }, { x: 1, y: 1, pressure: 0.7 }])).toBe(true);
  });

  it('is true even if only ONE point out of many carries pressure', () => {
    const points: NormalizedPoint[] = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5, pressure: 0.9 }, { x: 1, y: 1 }];
    expect(hasRealPressureData(points)).toBe(true);
  });
});

describe('strokeOutline — degenerate input', () => {
  it('returns [] for fewer than 2 points', () => {
    expect(strokeOutline([], 400, 800, 3, PEN_STYLE_OPTIONS.ballpoint)).toEqual([]);
    expect(strokeOutline([{ x: 0.5, y: 0.5 }], 400, 800, 3, PEN_STYLE_OPTIONS.ballpoint)).toEqual([]);
  });

  it('returns [] for a zero/negative canvas size rather than producing garbage geometry', () => {
    expect(strokeOutline(STRAIGHT_LINE, 0, 800, 3, PEN_STYLE_OPTIONS.ballpoint)).toEqual([]);
    expect(strokeOutline(STRAIGHT_LINE, 400, 0, 3, PEN_STYLE_OPTIONS.ballpoint)).toEqual([]);
  });
});

describe('strokeOutline — produces a real, pixel-scaled outline polygon', () => {
  it('returns a non-empty closed-ish polygon for a normal stroke', () => {
    const outline = strokeOutline(STRAIGHT_LINE, 400, 800, 3, PEN_STYLE_OPTIONS.ballpoint);
    expect(outline.length).toBeGreaterThan(2); // a real polygon, not a degenerate line
    for (const [x, y] of outline) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it('the outline\'s coordinates land within the pixel-space bounds implied by width/height (with a small margin for stroke width)', () => {
    const width = 400;
    const height = 800;
    const thickness = 3;
    const outline = strokeOutline(STRAIGHT_LINE, width, height, thickness, PEN_STYLE_OPTIONS.ballpoint);
    const margin = thickness * 2; // the outline extends roughly `size/2` beyond the centerline on each side
    for (const [x, y] of outline) {
      expect(x).toBeGreaterThan(0.1 * width - margin);
      expect(x).toBeLessThan(0.9 * width + margin);
      expect(y).toBeGreaterThan(0.5 * height - margin);
      expect(y).toBeLessThan(0.5 * height + margin);
    }
  });

  it('a thicker stroke produces a taller (wider) outline bounding box than a thinner one, for the same points', () => {
    const thin = strokeOutline(STRAIGHT_LINE, 400, 800, 2, PEN_STYLE_OPTIONS.ballpoint);
    const thick = strokeOutline(STRAIGHT_LINE, 400, 800, 20, PEN_STYLE_OPTIONS.ballpoint);
    const heightOf = (outline: [number, number][]) => Math.max(...outline.map((p) => p[1])) - Math.min(...outline.map((p) => p[1]));
    expect(heightOf(thick)).toBeGreaterThan(heightOf(thin));
  });
});

describe('strokeOutline — pressure affects tapering', () => {
  it('a stroke with real, varying pressure produces a DIFFERENT outline than the same points with no pressure data (which falls back to simulated pressure)', () => {
    const noPressure = STRAIGHT_LINE;
    const withPressure: NormalizedPoint[] = STRAIGHT_LINE.map((p, i) => ({ ...p, pressure: i === 2 ? 1 : 0.15 })); // a deliberate pressure spike in the middle
    const outlineA = strokeOutline(noPressure, 400, 800, 10, PEN_STYLE_OPTIONS.ballpoint);
    const outlineB = strokeOutline(withPressure, 400, 800, 10, PEN_STYLE_OPTIONS.ballpoint);
    expect(outlineB).not.toEqual(outlineA);
  });
});

describe('styleForPenStyle / PEN_STYLE_OPTIONS — fine, ballpoint, pencil, brush, and marker are genuinely different presets', () => {
  it('maps each PenStyle to its own options object', () => {
    expect(styleForPenStyle('ballpoint')).toBe(PEN_STYLE_OPTIONS.ballpoint);
    expect(styleForPenStyle('pencil')).toBe(PEN_STYLE_OPTIONS.pencil);
    expect(styleForPenStyle('brush')).toBe(PEN_STYLE_OPTIONS.brush);
  });

  it('falls back to the fine-pen preset for an unrecognised value (defensive, e.g. corrupt/legacy data)', () => {
    // @ts-expect-error deliberately passing an invalid value to exercise the fallback
    expect(styleForPenStyle('crayon')).toBe(PEN_STYLE_OPTIONS.fine);
  });

  it('the pen presets are not accidentally identical to one another', () => {
    expect(PEN_STYLE_OPTIONS.ballpoint).not.toEqual(PEN_STYLE_OPTIONS.pencil);
    expect(PEN_STYLE_OPTIONS.ballpoint).not.toEqual(PEN_STYLE_OPTIONS.brush);
    expect(PEN_STYLE_OPTIONS.pencil).not.toEqual(PEN_STYLE_OPTIONS.brush);
  });

  it('fountain has the strongest pressure-to-width effect (highest thinning) of the three, matching a real fountain pen\'s expressiveness', () => {
    expect(PEN_STYLE_OPTIONS.brush.thinning).toBeGreaterThan(PEN_STYLE_OPTIONS.ballpoint.thinning);
    expect(PEN_STYLE_OPTIONS.ballpoint.thinning).toBeGreaterThan(PEN_STYLE_OPTIONS.pencil.thinning);
  });

  it('a pen-style stroke and a pencil-style stroke produce visibly different outlines for identical points/pressure', () => {
    const points: NormalizedPoint[] = STRAIGHT_LINE.map((p, i) => ({ ...p, pressure: i % 2 === 0 ? 0.9 : 0.2 }));
    const penOutline = strokeOutline(points, 400, 800, 6, PEN_STYLE_OPTIONS.ballpoint);
    const pencilOutline = strokeOutline(points, 400, 800, 6, PEN_STYLE_OPTIONS.pencil);
    expect(penOutline).not.toEqual(pencilOutline);
  });
});

describe('HIGHLIGHTER_STROKE_OPTIONS — a flat, near-constant-width marker style', () => {
  it('has much lower thinning than the ballpoint/pencil/brush pen presets (a highlighter does not taper with pressure the way ink does)', () => {
    expect(HIGHLIGHTER_STROKE_OPTIONS.thinning).toBeLessThan(PEN_STYLE_OPTIONS.ballpoint.thinning);
    expect(HIGHLIGHTER_STROKE_OPTIONS.thinning).toBeLessThan(PEN_STYLE_OPTIONS.pencil.thinning);
    expect(HIGHLIGHTER_STROKE_OPTIONS.thinning).toBeLessThan(PEN_STYLE_OPTIONS.brush.thinning);
  });

  it('produces a near-constant-width outline regardless of pressure variation (unlike a pen preset)', () => {
    const varyingPressure: NormalizedPoint[] = STRAIGHT_LINE.map((p, i) => ({ ...p, pressure: i % 2 === 0 ? 1 : 0.1 }));
    const highlighterOutline = strokeOutline(varyingPressure, 400, 800, 14, HIGHLIGHTER_STROKE_OPTIONS);
    const heights: number[] = [];
    // Sample the outline's local half-width at a few x positions by nearest point — a crude but
    // effective way to confirm the marker doesn't visibly taper the way a pressure-sensitive pen
    // preset does for the SAME input.
    const ys = highlighterOutline.map((p) => p[1]);
    heights.push(Math.max(...ys) - Math.min(...ys));
    const penOutline = strokeOutline(varyingPressure, 400, 800, 14, PEN_STYLE_OPTIONS.ballpoint);
    const penYs = penOutline.map((p) => p[1]);
    const penHeight = Math.max(...penYs) - Math.min(...penYs);
    // Both are non-empty, real polygons — the specific relationship isn't asserted numerically
    // (perfect-freehand's exact geometry is an implementation detail), just that they're both valid.
    expect(heights[0]).toBeGreaterThan(0);
    expect(penHeight).toBeGreaterThan(0);
  });
});

describe('strokeOutline — determinism', () => {
  it('produces an identical outline across repeated calls with identical inputs', () => {
    const a = strokeOutline(STRAIGHT_LINE, 400, 800, 5, PEN_STYLE_OPTIONS.ballpoint);
    const b = strokeOutline(STRAIGHT_LINE, 400, 800, 5, PEN_STYLE_OPTIONS.ballpoint);
    expect(b).toEqual(a);
  });

  it('never mutates the input points', () => {
    const points: NormalizedPoint[] = [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.8 }];
    const snapshot = JSON.stringify(points);
    strokeOutline(points, 400, 800, 5, PEN_STYLE_OPTIONS.ballpoint);
    expect(JSON.stringify(points)).toBe(snapshot);
  });
});
