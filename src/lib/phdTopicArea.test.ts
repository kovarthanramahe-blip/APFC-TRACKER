import { describe, it, expect } from 'vitest';
import { isValidTopicAreaTitle, createPhdTopicArea, updatePhdTopicArea, deletePhdTopicArea, searchPhdTopicAreas, getPhdTopicAreaById, type PhdTopicArea } from './phdTopicArea';

describe('isValidTopicAreaTitle', () => {
  it('accepts a non-blank title, rejects blank/whitespace', () => {
    expect(isValidTopicAreaTitle('Colonial Historiography')).toBe(true);
    expect(isValidTopicAreaTitle('')).toBe(false);
    expect(isValidTopicAreaTitle('   ')).toBe(false);
  });
});

describe('createPhdTopicArea', () => {
  it('builds a new area with trimmed title/description and matching created/updated timestamps', () => {
    const area = createPhdTopicArea({ title: '  Land Revenue Systems  ', description: 'Chapter 2 focus.' }, 'a1', '2026-09-22T00:00:00.000Z');
    expect(area).toEqual<PhdTopicArea>({
      id: 'a1',
      title: 'Land Revenue Systems',
      description: 'Chapter 2 focus.',
      createdAt: '2026-09-22T00:00:00.000Z',
      updatedAt: '2026-09-22T00:00:00.000Z',
    });
  });

  it('omits description when not supplied', () => {
    const area = createPhdTopicArea({ title: 'X' }, 'a1', '2026-09-22T00:00:00.000Z');
    expect(area.description).toBeUndefined();
  });
});

describe('updatePhdTopicArea', () => {
  const base: PhdTopicArea = { id: 'a1', title: 'Original', createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z' };

  it('updates title/description and stamps updatedAt', () => {
    const [updated] = updatePhdTopicArea([base], 'a1', { title: 'Renamed', description: 'New desc' }, '2026-09-23T00:00:00.000Z');
    expect(updated.title).toBe('Renamed');
    expect(updated.description).toBe('New desc');
    expect(updated.updatedAt).toBe('2026-09-23T00:00:00.000Z');
    expect(updated.createdAt).toBe('2026-09-22T00:00:00.000Z');
  });

  it('ignores a blank title update', () => {
    const [updated] = updatePhdTopicArea([base], 'a1', { title: '   ' }, '2026-09-23T00:00:00.000Z');
    expect(updated.title).toBe('Original');
  });

  it('is a no-op for an unknown id', () => {
    expect(updatePhdTopicArea([base], 'missing', { title: 'X' }, '2026-09-23T00:00:00.000Z')).toEqual([base]);
  });
});

describe('deletePhdTopicArea', () => {
  it('removes only the matching area', () => {
    const areas: PhdTopicArea[] = [
      { id: 'a1', title: 'A', createdAt: 'x', updatedAt: 'x' },
      { id: 'a2', title: 'B', createdAt: 'x', updatedAt: 'x' },
    ];
    expect(deletePhdTopicArea(areas, 'a1')).toEqual([areas[1]]);
  });
});

describe('searchPhdTopicAreas', () => {
  const areas: PhdTopicArea[] = [
    { id: 'a1', title: 'Colonial Land Revenue', description: 'Ryotwari and zamindari systems.', createdAt: 'x', updatedAt: 'x' },
    { id: 'a2', title: 'Post-Independence Reform', createdAt: 'x', updatedAt: 'x' },
  ];

  it('matches on title, case-insensitively', () => {
    expect(searchPhdTopicAreas(areas, 'colonial').map((a) => a.id)).toEqual(['a1']);
  });

  it('matches on description too', () => {
    expect(searchPhdTopicAreas(areas, 'zamindari').map((a) => a.id)).toEqual(['a1']);
  });

  it('a blank query returns everything', () => {
    expect(searchPhdTopicAreas(areas, '')).toHaveLength(2);
  });

  it('returns nothing for a query that matches neither area', () => {
    expect(searchPhdTopicAreas(areas, 'zzz')).toEqual([]);
  });
});

describe('getPhdTopicAreaById', () => {
  it('resolves a known id and returns undefined for an unknown one', () => {
    const areas: PhdTopicArea[] = [{ id: 'a1', title: 'A', createdAt: 'x', updatedAt: 'x' }];
    expect(getPhdTopicAreaById(areas, 'a1')).toBe(areas[0]);
    expect(getPhdTopicAreaById(areas, 'missing')).toBeUndefined();
  });
});
