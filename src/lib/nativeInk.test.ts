import { describe, it, expect } from 'vitest';
import { toNativeBrushConfig } from './nativeInk';

describe('toNativeBrushConfig — JS toolbar selection -> native brush payload mapping', () => {
  it('passes the colour straight through as an opaque hex string (no hardcoded test colour)', () => {
    expect(toNativeBrushConfig('#000000', 6, 1, 1).color).toBe('#000000');
    expect(toNativeBrushConfig('#2563eb', 6, 1, 1).color).toBe('#2563eb');
    expect(toNativeBrushConfig('#ea580c', 6, 1, 1).color).toBe('#ea580c');
  });

  it('scales thickness (CSS pixels) by devicePixelRatio into native size (device pixels)', () => {
    expect(toNativeBrushConfig('#000000', 6, 1, 1).size).toBe(6);
    expect(toNativeBrushConfig('#000000', 6, 1, 2).size).toBe(12);
    expect(toNativeBrushConfig('#000000', 2.5, 1, 3).size).toBeCloseTo(7.5);
  });

  it('treats a non-positive devicePixelRatio as 1 rather than dividing/zeroing the size', () => {
    expect(toNativeBrushConfig('#000000', 6, 1, 0).size).toBe(6);
    expect(toNativeBrushConfig('#000000', 6, 1, -1).size).toBe(6);
  });

  it('clamps opacity into the valid 0-1 range rather than passing a corrupt/out-of-range value through', () => {
    expect(toNativeBrushConfig('#000000', 6, 1.5, 1).opacity).toBe(1);
    expect(toNativeBrushConfig('#000000', 6, -0.5, 1).opacity).toBe(0);
    expect(toNativeBrushConfig('#000000', 6, 0.35, 1).opacity).toBe(0.35);
  });

  it('a marker-style config (thick, semi-opaque) and a fine-pen-style config (thin, fully opaque) produce visibly different payloads for the same colour', () => {
    const marker = toNativeBrushConfig('#000000', 12, 0.55, 2);
    const fine = toNativeBrushConfig('#000000', 1.5, 1, 2);
    expect(marker.size).toBeGreaterThan(fine.size);
    expect(marker.opacity).toBeLessThan(fine.opacity);
  });
});
