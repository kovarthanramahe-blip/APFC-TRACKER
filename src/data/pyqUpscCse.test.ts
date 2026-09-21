import { describe, it, expect } from 'vitest';
import { UPSC_CSE_PYQ_BANK } from './pyqUpscCse';
import { PYQ_BANK } from './pyq';

const VALID_VERIFICATION_STATUSES = ['official', 'cross_verified', 'provisional', 'disputed'];

describe('UPSC_CSE_PYQ_BANK — Stage 3B-2A pilot dataset', () => {
  it('is empty — no authoritative UPSC CSE source was reachable this stage (see file header)', () => {
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });

  it('is a real, correctly-typed array (not undefined/null) — the registry can resolve to it safely', () => {
    expect(Array.isArray(UPSC_CSE_PYQ_BANK)).toBe(true);
  });

  it('does not share any reference or content with APFC\'s PYQ_BANK', () => {
    expect(UPSC_CSE_PYQ_BANK).not.toBe(PYQ_BANK);
  });

  // Vacuously true today (the array is empty) — this guard is here so the moment Stage 3B-2B adds
  // a real question, every one of its fields is checked automatically rather than trusted blindly.
  it('every entry (once any exist) has a genuine id, a valid verificationStatus, options and a correctOptionId that matches one of them', () => {
    for (const q of UPSC_CSE_PYQ_BANK) {
      expect(q.id.length).toBeGreaterThan(0);
      expect(VALID_VERIFICATION_STATUSES).toContain(q.verificationStatus);
      expect(q.options.length).toBeGreaterThan(0);
      expect(q.options.some((o) => o.id === q.correctOptionId)).toBe(true);
    }
  });

  it('every entry\'s id is unique within the dataset (once any exist)', () => {
    const ids = UPSC_CSE_PYQ_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
