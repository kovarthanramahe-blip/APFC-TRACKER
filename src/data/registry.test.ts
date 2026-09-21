import { describe, it, expect } from 'vitest';
import { getSyllabusForWorkspace, getPyqBankForWorkspace } from './registry';
import { SYLLABUS } from './syllabus';
import { UPSC_CSE_SYLLABUS } from './syllabusUpscCse';
import { PYQ_BANK } from './pyq';
import { UPSC_CSE_PYQ_BANK } from './pyqUpscCse';

describe('getSyllabusForWorkspace — Stage 3B-1 workspace/data registry', () => {
  it('apfc resolves to the exact, unmodified SYLLABUS array (same reference, not a copy)', () => {
    expect(getSyllabusForWorkspace('apfc')).toBe(SYLLABUS);
  });

  it('upsc_cse resolves to the exact, unmodified UPSC_CSE_SYLLABUS array (same reference)', () => {
    expect(getSyllabusForWorkspace('upsc_cse')).toBe(UPSC_CSE_SYLLABUS);
  });

  it('phd_research resolves to an empty array — no syllabus concept for a research workspace', () => {
    expect(getSyllabusForWorkspace('phd_research')).toEqual([]);
  });

  it('switching between apfc and upsc_cse always resolves the correct, distinct syllabus', () => {
    const sequence: Array<'apfc' | 'upsc_cse'> = ['apfc', 'upsc_cse', 'apfc', 'apfc', 'upsc_cse'];
    const resolved = sequence.map((id) => getSyllabusForWorkspace(id));
    expect(resolved[0]).toBe(SYLLABUS);
    expect(resolved[1]).toBe(UPSC_CSE_SYLLABUS);
    expect(resolved[2]).toBe(SYLLABUS);
    expect(resolved[3]).toBe(SYLLABUS);
    expect(resolved[4]).toBe(UPSC_CSE_SYLLABUS);
  });

  it('never mutates SYLLABUS or UPSC_CSE_SYLLABUS as a side effect of resolving', () => {
    const apfcSnapshot = JSON.stringify(SYLLABUS);
    const upscSnapshot = JSON.stringify(UPSC_CSE_SYLLABUS);
    getSyllabusForWorkspace('apfc');
    getSyllabusForWorkspace('upsc_cse');
    getSyllabusForWorkspace('phd_research');
    expect(JSON.stringify(SYLLABUS)).toBe(apfcSnapshot);
    expect(JSON.stringify(UPSC_CSE_SYLLABUS)).toBe(upscSnapshot);
  });
});

describe('getPyqBankForWorkspace — Stage 3B-2A workspace/data registry', () => {
  it('apfc resolves to the exact, unmodified PYQ_BANK array (same reference, not a copy)', () => {
    expect(getPyqBankForWorkspace('apfc')).toBe(PYQ_BANK);
  });

  it('apfc\'s resolved PYQ count is exactly 458 — unchanged by this stage', () => {
    expect(getPyqBankForWorkspace('apfc').length).toBe(458);
  });

  it('upsc_cse resolves to the exact, unmodified UPSC_CSE_PYQ_BANK array (same reference)', () => {
    expect(getPyqBankForWorkspace('upsc_cse')).toBe(UPSC_CSE_PYQ_BANK);
  });

  it('upsc_cse\'s resolved pool is empty this stage — no fabricated pilot content', () => {
    expect(getPyqBankForWorkspace('upsc_cse')).toEqual([]);
  });

  it('phd_research resolves to an empty array', () => {
    expect(getPyqBankForWorkspace('phd_research')).toEqual([]);
  });

  it('no question in the apfc pool ever appears in the upsc_cse pool, or vice versa — no cross-workspace leakage', () => {
    const apfcIds = new Set(getPyqBankForWorkspace('apfc').map((q) => q.id));
    const upscIds = new Set(getPyqBankForWorkspace('upsc_cse').map((q) => q.id));
    for (const id of upscIds) expect(apfcIds.has(id)).toBe(false);
    for (const id of apfcIds) expect(upscIds.has(id)).toBe(false);
  });

  it('switching between apfc and upsc_cse always resolves the correct, distinct pool', () => {
    const sequence: Array<'apfc' | 'upsc_cse'> = ['apfc', 'upsc_cse', 'apfc', 'apfc', 'upsc_cse'];
    const resolved = sequence.map((id) => getPyqBankForWorkspace(id));
    expect(resolved[0]).toBe(PYQ_BANK);
    expect(resolved[1]).toBe(UPSC_CSE_PYQ_BANK);
    expect(resolved[2]).toBe(PYQ_BANK);
    expect(resolved[3]).toBe(PYQ_BANK);
    expect(resolved[4]).toBe(UPSC_CSE_PYQ_BANK);
  });

  it('never mutates PYQ_BANK or UPSC_CSE_PYQ_BANK as a side effect of resolving', () => {
    const apfcSnapshot = JSON.stringify(PYQ_BANK);
    getPyqBankForWorkspace('apfc');
    getPyqBankForWorkspace('upsc_cse');
    getPyqBankForWorkspace('phd_research');
    expect(JSON.stringify(PYQ_BANK)).toBe(apfcSnapshot);
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });
});
