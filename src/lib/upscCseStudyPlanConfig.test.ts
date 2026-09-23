import { describe, it, expect } from 'vitest';
import { validateUpscCseStudyPlanConfig, createUpscCseStudyPlanConfig, computeUpscCseStudyPlanProgress, type UpscCseStudyPlanConfig } from './upscCseStudyPlanConfig';

describe('validateUpscCseStudyPlanConfig', () => {
  const valid = { startDate: '2026-09-22', targetDate: '2026-12-22', daysPerWeek: 5, minutesPerDay: 60, planType: 'balanced' as const };

  it('returns no issues for a valid balanced config', () => {
    expect(validateUpscCseStudyPlanConfig(valid)).toEqual([]);
  });

  it('requires a start date', () => {
    const issues = validateUpscCseStudyPlanConfig({ ...valid, startDate: '' });
    expect(issues).toContainEqual({ field: 'startDate', message: expect.any(String) });
  });

  it('requires a target date', () => {
    const issues = validateUpscCseStudyPlanConfig({ ...valid, targetDate: '' });
    expect(issues).toContainEqual({ field: 'targetDate', message: expect.any(String) });
  });

  it('rejects a target date before the start date', () => {
    const issues = validateUpscCseStudyPlanConfig({ ...valid, startDate: '2026-12-22', targetDate: '2026-09-22' });
    expect(issues.some((i) => i.field === 'targetDate')).toBe(true);
  });

  it('accepts a target date equal to the start date', () => {
    const issues = validateUpscCseStudyPlanConfig({ ...valid, targetDate: valid.startDate });
    expect(issues.some((i) => i.field === 'targetDate')).toBe(false);
  });

  it('rejects daysPerWeek outside 1-7', () => {
    expect(validateUpscCseStudyPlanConfig({ ...valid, daysPerWeek: 0 }).some((i) => i.field === 'daysPerWeek')).toBe(true);
    expect(validateUpscCseStudyPlanConfig({ ...valid, daysPerWeek: 8 }).some((i) => i.field === 'daysPerWeek')).toBe(true);
  });

  it('rejects minutesPerDay <= 0', () => {
    expect(validateUpscCseStudyPlanConfig({ ...valid, minutesPerDay: 0 }).some((i) => i.field === 'minutesPerDay')).toBe(true);
    expect(validateUpscCseStudyPlanConfig({ ...valid, minutesPerDay: -10 }).some((i) => i.field === 'minutesPerDay')).toBe(true);
  });

  it('requires a focusSubject for subject_focus plans', () => {
    const issues = validateUpscCseStudyPlanConfig({ ...valid, planType: 'subject_focus' });
    expect(issues).toContainEqual({ field: 'focusSubject', message: expect.any(String) });
  });

  it('accepts a subject_focus plan once focusSubject is set', () => {
    const issues = validateUpscCseStudyPlanConfig({ ...valid, planType: 'subject_focus', focusSubject: 'History' });
    expect(issues).toEqual([]);
  });

  it('never requires focusSubject for custom plans', () => {
    const issues = validateUpscCseStudyPlanConfig({ ...valid, planType: 'custom' });
    expect(issues.some((i) => i.field === 'focusSubject')).toBe(false);
  });
});

describe('createUpscCseStudyPlanConfig', () => {
  it('rounds daysPerWeek/minutesPerDay, sorts preferredDays, and stamps createdAt/updatedAt', () => {
    const config = createUpscCseStudyPlanConfig(
      { startDate: '2026-09-22', targetDate: '2026-12-22', daysPerWeek: 5.4, minutesPerDay: 59.6, preferredDays: [3, 1, 5], planType: 'balanced' },
      '2026-09-22T08:00:00.000Z',
    );
    expect(config.daysPerWeek).toBe(5);
    expect(config.minutesPerDay).toBe(60);
    expect(config.preferredDays).toEqual([1, 3, 5]);
    expect(config.createdAt).toBe('2026-09-22T08:00:00.000Z');
    expect(config.updatedAt).toBe('2026-09-22T08:00:00.000Z');
  });

  it('defaults preferredDays to an empty array when not supplied', () => {
    const config = createUpscCseStudyPlanConfig({ startDate: '2026-09-22', targetDate: '2026-12-22', daysPerWeek: 5, minutesPerDay: 60, planType: 'balanced' }, 'now');
    expect(config.preferredDays).toEqual([]);
  });

  it('keeps focusSubject only for subject_focus plans, trimmed', () => {
    const focused = createUpscCseStudyPlanConfig(
      { startDate: '2026-09-22', targetDate: '2026-12-22', daysPerWeek: 5, minutesPerDay: 60, planType: 'subject_focus', focusSubject: '  History  ' },
      'now',
    );
    expect(focused.focusSubject).toBe('History');

    const balanced = createUpscCseStudyPlanConfig(
      { startDate: '2026-09-22', targetDate: '2026-12-22', daysPerWeek: 5, minutesPerDay: 60, planType: 'balanced', focusSubject: 'History' },
      'now',
    );
    expect(balanced.focusSubject).toBeUndefined();
  });
});

describe('computeUpscCseStudyPlanProgress', () => {
  const config: UpscCseStudyPlanConfig = {
    startDate: '2026-09-01',
    targetDate: '2026-09-21',
    daysPerWeek: 5,
    minutesPerDay: 60,
    preferredDays: [],
    planType: 'balanced',
    createdAt: 'x',
    updatedAt: 'x',
  };

  it('computes elapsed/remaining/percent for a date within the window', () => {
    const progress = computeUpscCseStudyPlanProgress(config, '2026-09-11');
    expect(progress.totalDays).toBe(20);
    expect(progress.elapsedDays).toBe(10);
    expect(progress.remainingDays).toBe(10);
    expect(progress.timeElapsedPct).toBe(50);
  });

  it('clamps to 0 when today is before the start date (never negative)', () => {
    const progress = computeUpscCseStudyPlanProgress(config, '2026-08-01');
    expect(progress.elapsedDays).toBe(0);
    expect(progress.timeElapsedPct).toBe(0);
    expect(progress.remainingDays).toBe(progress.totalDays);
  });

  it('clamps to totalDays when today is after the target date (never over 100%)', () => {
    const progress = computeUpscCseStudyPlanProgress(config, '2026-10-01');
    expect(progress.elapsedDays).toBe(progress.totalDays);
    expect(progress.remainingDays).toBe(0);
    expect(progress.timeElapsedPct).toBe(100);
  });

  it('is exactly 0% on the start date and 100% on the target date', () => {
    expect(computeUpscCseStudyPlanProgress(config, config.startDate).timeElapsedPct).toBe(0);
    expect(computeUpscCseStudyPlanProgress(config, config.targetDate).timeElapsedPct).toBe(100);
  });

  it('never divides by zero when startDate equals targetDate', () => {
    const sameDay: UpscCseStudyPlanConfig = { ...config, targetDate: config.startDate };
    const progress = computeUpscCseStudyPlanProgress(sameDay, config.startDate);
    expect(progress.totalDays).toBe(0);
    expect(progress.timeElapsedPct).toBe(0);
  });
});
