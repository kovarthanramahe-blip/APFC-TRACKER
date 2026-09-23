import { describe, it, expect } from 'vitest';
import { EXAM_TARGETS, examTargetsForWorkspace, describeExamTarget } from './examTarget';
import { daysUntil } from './utils';

describe('EXAM_TARGETS', () => {
  it('CSE Mains 2026 is status awaiting_result, scheduled for 21 August 2026', () => {
    const target = EXAM_TARGETS.find((t) => t.id === 'upsc-cse-mains-2026')!;
    expect(target.status).toBe('awaiting_result');
    expect(target.examDate).toBe('2026-08-21');
    expect(target.workspaceId).toBe('upsc_cse');
  });

  it('CSE Prelims 2027 is status scheduled for 23 May 2027', () => {
    const target = EXAM_TARGETS.find((t) => t.id === 'upsc-cse-prelims-2027')!;
    expect(target.status).toBe('scheduled');
    expect(target.examDate).toBe('2027-05-23');
    expect(target.workspaceId).toBe('upsc_cse');
  });

  it('APFC CAPF (ACs) 2027 is status scheduled for 4 July 2027, owned by the apfc workspace', () => {
    const target = EXAM_TARGETS.find((t) => t.id === 'apfc-capf-acs-2027')!;
    expect(target.status).toBe('scheduled');
    expect(target.examDate).toBe('2027-07-04');
    expect(target.workspaceId).toBe('apfc');
  });
});

describe('examTargetsForWorkspace', () => {
  it('returns only upsc_cse targets for upsc_cse (CSE Mains 2026 + CSE Prelims 2027)', () => {
    const targets = examTargetsForWorkspace('upsc_cse');
    expect(targets.map((t) => t.id).sort()).toEqual(['upsc-cse-mains-2026', 'upsc-cse-prelims-2027']);
  });

  it('returns only the apfc target for apfc', () => {
    const targets = examTargetsForWorkspace('apfc');
    expect(targets.map((t) => t.id)).toEqual(['apfc-capf-acs-2027']);
  });

  it('returns nothing for phd_research — no exam targets defined for that workspace', () => {
    expect(examTargetsForWorkspace('phd_research')).toEqual([]);
  });
});

describe('describeExamTarget', () => {
  it('never computes a countdown for an awaiting_result target', () => {
    const target = EXAM_TARGETS.find((t) => t.id === 'upsc-cse-mains-2026')!;
    expect(describeExamTarget(target).daysRemaining).toBeNull();
  });

  it('computes a live days-remaining figure for a scheduled target, matching lib/utils.ts\'s daysUntil directly', () => {
    const target = EXAM_TARGETS.find((t) => t.id === 'upsc-cse-prelims-2027')!;
    const { daysRemaining } = describeExamTarget(target);
    expect(daysRemaining).toBe(daysUntil('2027-05-23'));
    expect(daysRemaining).toBeGreaterThan(0); // 23 May 2027 is in the future relative to this app's development window
  });

  it('CAPF (ACs) 2027 also gets a live, positive days-remaining figure', () => {
    const target = EXAM_TARGETS.find((t) => t.id === 'apfc-capf-acs-2027')!;
    const { daysRemaining } = describeExamTarget(target);
    expect(daysRemaining).toBe(daysUntil('2027-07-04'));
    expect(daysRemaining).toBeGreaterThan(0);
  });
});
