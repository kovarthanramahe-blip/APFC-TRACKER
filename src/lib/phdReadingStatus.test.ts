import { describe, it, expect } from 'vitest';
import { getReadingStatus, countByReadingStatus, isReadingStatus, READING_STATUSES, READING_STATUS_LABELS } from './phdReadingStatus';
import type { ImportedContent } from './contentImport';

function item(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: 'c1',
    workspaceId: 'phd_research',
    contentType: 'bibliography',
    title: 'A Source',
    rawContent: '',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z' },
    ...overrides,
  };
}

describe('isReadingStatus', () => {
  it('accepts only the four known statuses', () => {
    for (const s of READING_STATUSES) expect(isReadingStatus(s)).toBe(true);
    expect(isReadingStatus('done')).toBe(false);
    expect(isReadingStatus(undefined)).toBe(false);
    expect(isReadingStatus(42)).toBe(false);
  });
});

describe('getReadingStatus', () => {
  it('defaults to unread when metadata is absent', () => {
    expect(getReadingStatus(item())).toBe('unread');
  });

  it('defaults to unread when metadata exists but has no readingStatus', () => {
    expect(getReadingStatus(item({ metadata: { tags: ['x'] } }))).toBe('unread');
  });

  it('returns a genuinely set status', () => {
    expect(getReadingStatus(item({ metadata: { readingStatus: 'reading' } }))).toBe('reading');
    expect(getReadingStatus(item({ metadata: { readingStatus: 'reviewed' } }))).toBe('reviewed');
  });

  it('falls back to unread for a garbage/legacy value rather than throwing', () => {
    expect(getReadingStatus(item({ metadata: { readingStatus: 'archived' } }))).toBe('unread');
  });
});

describe('countByReadingStatus', () => {
  it('returns all-zero counts for an empty collection', () => {
    expect(countByReadingStatus([])).toEqual({ unread: 0, reading: 0, read: 0, reviewed: 0 });
  });

  it('counts each item exactly once, defaulting untouched items to unread', () => {
    const items = [
      item({ id: 'a', metadata: { readingStatus: 'read' } }),
      item({ id: 'b', metadata: { readingStatus: 'read' } }),
      item({ id: 'c', metadata: { readingStatus: 'reviewed' } }),
      item({ id: 'd' }),
      item({ id: 'e', metadata: { readingStatus: 'reading' } }),
    ];
    expect(countByReadingStatus(items)).toEqual({ unread: 1, reading: 1, read: 2, reviewed: 1 });
  });

  it('every status has a human-readable label', () => {
    for (const s of READING_STATUSES) expect(READING_STATUS_LABELS[s]).toBeTruthy();
  });
});
