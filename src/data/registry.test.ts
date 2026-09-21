import { describe, it, expect } from 'vitest';
import { getSyllabusForWorkspace } from './registry';
import { SYLLABUS } from './syllabus';
import { UPSC_CSE_SYLLABUS } from './syllabusUpscCse';

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
