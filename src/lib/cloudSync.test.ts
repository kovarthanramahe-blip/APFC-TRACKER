import { describe, it, expect } from 'vitest';
import { hasMeaningfulData } from './cloudSync';

// hasMeaningfulData gates both directions of cloud sync (whether to upload local data as the
// initial cloud copy, and whether every subsequent local change gets pushed at all) — see
// reconcileOnSignIn / startCloudSync in this file. These tests exercise it directly as a pure
// function, so no Supabase/network mocking is needed.

describe('hasMeaningfulData — empty state', () => {
  it('returns false for a completely empty data object', () => {
    expect(hasMeaningfulData({})).toBe(false);
  });

  it('returns false when every known field is present but empty', () => {
    expect(
      hasMeaningfulData({
        completedTopics: {},
        notes: [],
        attempts: [],
        sessions: [],
        studyLog: {},
        starredQuestionIds: [],
        pyqAttempts: [],
        bookmarkedPyqIds: [],
      }),
    ).toBe(false);
  });
});

describe('hasMeaningfulData — PYQ-only activity (the F1 bug)', () => {
  it('returns true when only pyqAttempts is non-empty', () => {
    expect(hasMeaningfulData({ pyqAttempts: [{ id: 'a1' }] })).toBe(true);
  });

  it('returns true when only bookmarkedPyqIds is non-empty', () => {
    expect(hasMeaningfulData({ bookmarkedPyqIds: ['pyq-2025-1'] })).toBe(true);
  });

  it('returns true when a user has PYQ activity but nothing else at all', () => {
    expect(
      hasMeaningfulData({
        completedTopics: {},
        notes: [],
        attempts: [],
        sessions: [],
        studyLog: {},
        starredQuestionIds: [],
        pyqAttempts: [{ id: 'a1' }, { id: 'a2' }],
        bookmarkedPyqIds: [],
      }),
    ).toBe(true);
  });
});

describe('hasMeaningfulData — existing (pre-F1) data types still work', () => {
  it('returns true for completedTopics', () => {
    expect(hasMeaningfulData({ completedTopics: { 'en-1': true } })).toBe(true);
  });

  it('returns true for notes', () => {
    expect(hasMeaningfulData({ notes: [{ id: 'n1' }] })).toBe(true);
  });

  it('returns true for mock-test attempts', () => {
    expect(hasMeaningfulData({ attempts: [{ id: 'm1' }] })).toBe(true);
  });

  it('returns true for sessions', () => {
    expect(hasMeaningfulData({ sessions: [{ id: 's1' }] })).toBe(true);
  });

  it('returns true for studyLog', () => {
    expect(hasMeaningfulData({ studyLog: { '2026-01-01': {} } })).toBe(true);
  });

  it('returns true for starredQuestionIds', () => {
    expect(hasMeaningfulData({ starredQuestionIds: ['q1'] })).toBe(true);
  });
});

describe('hasMeaningfulData — tolerates missing/malformed fields', () => {
  it('does not throw when fields are undefined', () => {
    expect(() => hasMeaningfulData({})).not.toThrow();
  });

  it('treats a non-array/non-object field defensively rather than throwing', () => {
    // Object.keys(null ?? {}) / (undefined ?? []) both fall back safely; this guards against a
    // corrupt cloud payload still resolving to "no meaningful data" instead of crashing sync.
    expect(() => hasMeaningfulData({ pyqAttempts: null, bookmarkedPyqIds: undefined })).not.toThrow();
  });
});

// Multi-Workspace OS, Stage 2 — a device whose active workspace's fields are all empty but which
// has archived data under a DIFFERENT (inactive) workspace still has meaningful data: reconciling
// against an empty cloud row must not treat this as "nothing to upload" and silently drop it.
describe('hasMeaningfulData — Multi-Workspace OS Stage 2 (inactiveWorkspaceOwnedData)', () => {
  it('returns false when inactiveWorkspaceOwnedData is empty (today\'s only real case)', () => {
    expect(hasMeaningfulData({ completedTopics: {}, notes: [], inactiveWorkspaceOwnedData: {} })).toBe(false);
  });

  it('returns true when inactiveWorkspaceOwnedData holds another workspace\'s archived data, even with an otherwise-empty active workspace', () => {
    expect(
      hasMeaningfulData({
        completedTopics: {},
        notes: [],
        attempts: [],
        sessions: [],
        studyLog: {},
        starredQuestionIds: [],
        pyqAttempts: [],
        bookmarkedPyqIds: [],
        inactiveWorkspaceOwnedData: { upsc_cse: { notes: [{ id: 'n1' }] } },
      }),
    ).toBe(true);
  });
});
