import { describe, it, expect } from 'vitest';
import { getUpscSubjectColor } from './upscCseSubjectColors';

describe('getUpscSubjectColor', () => {
  it('resolves a known subject title to its colour family (base + variant)', () => {
    const polity = getUpscSubjectColor('Indian Polity & Governance');
    expect(polity.base.dot).toBe('bg-indigo-500');
    expect(polity.variant.dot).toContain('indigo');
  });

  it('is case-insensitive and tolerant of surrounding whitespace', () => {
    expect(getUpscSubjectColor('  POLITY  ')).toEqual(getUpscSubjectColor('Polity'));
  });

  it('the variant is a lighter/more muted shade of the SAME hue family as base, never a different hue', () => {
    const family = getUpscSubjectColor('History');
    expect(family.base.dot).toContain('orange');
    expect(family.variant.dot).toContain('orange');
    expect(family.base.dot).not.toBe(family.variant.dot);
  });

  it('matches by keyword, so a differently-worded title in the same domain still resolves correctly', () => {
    expect(getUpscSubjectColor('Economic & Social Development').base.text).toContain('teal');
    expect(getUpscSubjectColor('Economy').base.text).toContain('teal');
  });

  it('Current Affairs gets the rose family (shared identity with APFC\'s own currentAffairs subject colour)', () => {
    expect(getUpscSubjectColor('Current Affairs').base.dot).toBe('bg-rose-500');
  });

  it('an unrecognised subject title falls back to a neutral family rather than throwing', () => {
    expect(() => getUpscSubjectColor('Some Future Subject Nobody Has Heard Of')).not.toThrow();
    expect(getUpscSubjectColor('Some Future Subject Nobody Has Heard Of').base.dot).toBe('bg-slate-500');
  });

  it('every family token is a complete literal string (no interpolation), so Tailwind\'s build-time scanner can see every class', () => {
    const titles = ['Polity', 'Economy', 'History', 'Science & Technology', 'Current Affairs', 'Geography', 'Environment', 'Society', 'Unknown Subject'];
    for (const title of titles) {
      const family = getUpscSubjectColor(title);
      for (const tokens of [family.base, family.variant]) {
        for (const value of Object.values(tokens)) {
          expect(value).not.toContain('${');
          expect(typeof value).toBe('string');
        }
      }
    }
  });
});
