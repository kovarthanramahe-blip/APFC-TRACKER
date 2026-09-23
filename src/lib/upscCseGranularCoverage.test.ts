import { describe, it, expect } from 'vitest';
import { bucketWeightedPctToCoverageState, effectiveMicrosyllabusCoverageState, migrateGranularCoverageBackfill } from './upscCseGranularCoverage';
import { leafGranularIdsForMicrosyllabus } from './upscCseGranularSyllabus';
import type { UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';

const CONSTITUTION_ID = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Constitution')!.id;
const ANCIENT_INDIA_ID = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Ancient India')!.id;

describe('bucketWeightedPctToCoverageState', () => {
  it('buckets the four weighted-percentage boundaries correctly', () => {
    expect(bucketWeightedPctToCoverageState(0)).toBe('not_started');
    expect(bucketWeightedPctToCoverageState(20)).toBe('learning');
    expect(bucketWeightedPctToCoverageState(67)).toBe('revised');
    expect(bucketWeightedPctToCoverageState(100)).toBe('strong');
  });
});

describe('effectiveMicrosyllabusCoverageState', () => {
  it('falls back to the direct coverage entry for a microsyllabus item with no granular children (unchanged behaviour)', () => {
    const coverage: UpscCseSyllabusCoverage = { [ANCIENT_INDIA_ID]: 'strong' };
    expect(effectiveMicrosyllabusCoverageState(ANCIENT_INDIA_ID, coverage, UPSC_CSE_GRANULAR_NODES)).toBe('strong');
    expect(effectiveMicrosyllabusCoverageState('never-touched-id', {}, UPSC_CSE_GRANULAR_NODES)).toBe('not_started');
  });

  it('rolls up from granular leaves for a granularized item, ignoring any stale direct entry', () => {
    const leaves = leafGranularIdsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    const coverage: UpscCseSyllabusCoverage = { [CONSTITUTION_ID]: 'not_started' };
    for (const id of leaves) coverage[id] = 'strong';
    expect(effectiveMicrosyllabusCoverageState(CONSTITUTION_ID, coverage, UPSC_CSE_GRANULAR_NODES)).toBe('strong');
  });

  it('reads as not_started for a granularized item whose leaves have never been touched', () => {
    expect(effectiveMicrosyllabusCoverageState(CONSTITUTION_ID, {}, UPSC_CSE_GRANULAR_NODES)).toBe('not_started');
  });

  it('reflects a mixed roll-up (some leaves strong, some not_started) as a partial state', () => {
    const leaves = leafGranularIdsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    const coverage: UpscCseSyllabusCoverage = { [leaves[0]]: 'strong' };
    const state = effectiveMicrosyllabusCoverageState(CONSTITUTION_ID, coverage, UPSC_CSE_GRANULAR_NODES);
    expect(state).not.toBe('not_started'); // at least one leaf contributes something
    expect(state).not.toBe('strong'); // but not all leaves are strong
  });
});

describe('migrateGranularCoverageBackfill', () => {
  it('preserves an existing microsyllabus-level coverage entry by seeding it onto fresh granular leaves', () => {
    const coverage: UpscCseSyllabusCoverage = { [CONSTITUTION_ID]: 'strong' };
    const migrated = migrateGranularCoverageBackfill(coverage, UPSC_CSE_GRANULAR_NODES);
    const leaves = leafGranularIdsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    expect(leaves.length).toBeGreaterThan(0);
    for (const id of leaves) expect(migrated[id]).toBe('strong');
    // the original direct entry itself is untouched
    expect(migrated[CONSTITUTION_ID]).toBe('strong');
  });

  it('never overwrites a leaf that already has its own real coverage entry', () => {
    const leaves = leafGranularIdsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, CONSTITUTION_ID);
    const coverage: UpscCseSyllabusCoverage = { [CONSTITUTION_ID]: 'strong', [leaves[0]]: 'learning' };
    const migrated = migrateGranularCoverageBackfill(coverage, UPSC_CSE_GRANULAR_NODES);
    // real granular progress already existed for this item -> the whole item is left untouched
    expect(migrated[leaves[0]]).toBe('learning');
    expect(migrated[leaves[1]]).toBeUndefined();
  });

  it('does nothing for a microsyllabus item with no direct coverage entry at all', () => {
    const migrated = migrateGranularCoverageBackfill({}, UPSC_CSE_GRANULAR_NODES);
    expect(migrated).toEqual({});
  });

  it('leaves a non-granularized item untouched', () => {
    const coverage: UpscCseSyllabusCoverage = { [ANCIENT_INDIA_ID]: 'revised' };
    const migrated = migrateGranularCoverageBackfill(coverage, UPSC_CSE_GRANULAR_NODES);
    expect(migrated).toEqual({ [ANCIENT_INDIA_ID]: 'revised' });
  });

  it('is idempotent — running it twice produces the same result as running it once', () => {
    const coverage: UpscCseSyllabusCoverage = { [CONSTITUTION_ID]: 'learning' };
    const once = migrateGranularCoverageBackfill(coverage, UPSC_CSE_GRANULAR_NODES);
    const twice = migrateGranularCoverageBackfill(once, UPSC_CSE_GRANULAR_NODES);
    expect(twice).toEqual(once);
  });

  it('does not mutate the original coverage object', () => {
    const coverage: UpscCseSyllabusCoverage = { [CONSTITUTION_ID]: 'strong' };
    const before = { ...coverage };
    migrateGranularCoverageBackfill(coverage, UPSC_CSE_GRANULAR_NODES);
    expect(coverage).toEqual(before);
  });
});
