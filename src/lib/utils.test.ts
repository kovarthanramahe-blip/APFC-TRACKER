import { describe, it, expect } from 'vitest';
import { getLocalDateString } from './utils';

// P1 fix #4 — regression tests for the shared "today" helper. These deliberately never depend on
// the machine's own timezone offset: every assertion either (a) constructs a Date via the local
// wall-clock constructor (`new Date(year, monthIndex, day, ...)`, which always represents that
// exact local date regardless of what timezone the process is running in) and checks the
// formatted string matches, or (b) checks the function's output is self-consistent with the same
// Date object's own local getters. Neither depends on what offset this machine happens to have.
describe('getLocalDateString', () => {
  it('formats a local date as yyyy-mm-dd, padding single-digit month and day', () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05'); // Jan 5
  });

  it('formats a date with a double-digit month and day correctly', () => {
    expect(getLocalDateString(new Date(2026, 11, 31))).toBe('2026-12-31'); // Dec 31
  });

  it('is unaffected by the time-of-day component of the Date — only the local calendar date matters', () => {
    const midnight = new Date(2026, 8, 14, 0, 0, 0);
    const almostMidnight = new Date(2026, 8, 14, 23, 59, 59);
    expect(getLocalDateString(midnight)).toBe('2026-09-14');
    expect(getLocalDateString(almostMidnight)).toBe('2026-09-14');
  });

  it('handles a year boundary correctly', () => {
    expect(getLocalDateString(new Date(2025, 11, 31, 23, 59, 59))).toBe('2025-12-31');
    expect(getLocalDateString(new Date(2026, 0, 1, 0, 0, 1))).toBe('2026-01-01');
  });

  it('is always self-consistent with the same Date instance\'s own local getters (true in any timezone)', () => {
    const d = new Date(2026, 2, 7, 6, 15, 0);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(getLocalDateString(d)).toBe(expected);
  });

  it('defaults to the current local date and returns a well-formed yyyy-mm-dd string', () => {
    expect(getLocalDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
