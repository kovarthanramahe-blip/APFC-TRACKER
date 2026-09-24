import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage } from '../lib/store';
import { createRevisionQueue, getDueItems } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { NAV_ITEMS } from '../components/layout/nav';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { computeEligibleRevisionIds, computeRevisionStatusMap } from '../lib/upscCsePrelimsPyqFilters';
import { computeUpscCsePrelimsPerformance } from '../lib/upscCsePrelimsPyqPerformance';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import type { UpscCsePrelimsPyqAttempt } from '../lib/upscCsePrelimsPyqAttempt';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { UPSC_CSE_PYQ_BANK } from '../data/pyqUpscCse';

// This page has no rendering test here (no React Testing Library / DOM environment in this repo —
// see every other *.test.ts file for the established convention). These tests exercise exactly what
// pages/UpscCsePyqTest.tsx itself calls: the real store action (addUpscCsePrelimsPyqAttempt), the
// GENERIC store fields it reuses as-is for UPSC ids (bookmarkedPyqIds, revisionQueue — see
// lib/revisionQueue.ts, entirely content-agnostic), the pure filter/performance helpers
// (exhaustively unit-tested in their own files), and route/nav registration. A manual browser smoke
// check (see the task report) covers the actual on-screen select/testing/results/review/analytics
// flow, including the "Study this microsyllabus" deep link into pages/UpscCseSyllabus.tsx.

function fullReset() {
  useAppStore.setState({
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: {},
    completedTopics: {},
    upscCseSyllabusCoverage: {},
    upscCsePrelimsPyqAttempts: [],
    notes: [],
    attempts: [],
    pyqAttempts: [],
    sessions: [],
    studyLog: {},
    starredQuestionIds: [],
    bookmarkedPyqIds: [],
    rewardUnlocks: {},
    studyPlan: null,
    studyPlanGeneratedAt: null,
    personalStudyPlanTasks: [],
    revisionQueue: createRevisionQueue(),
    importedContent: [],
    contentRelationships: [],
  });
}

function fixtureAttempt(overrides: Partial<UpscCsePrelimsPyqAttempt> = {}): UpscCsePrelimsPyqAttempt {
  const q = UPSC_CSE_PRELIMS_PYQ_BANK[0];
  return {
    id: 'attempt-1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    year: 'all',
    paper: 'all',
    subject: 'all',
    microsyllabusId: 'all',
    questionIds: [q.id],
    answers: { [q.id]: q.correctOptionId ?? null },
    correctCount: q.correctOptionId ? 1 : 0,
    wrongCount: q.correctOptionId ? 0 : 1,
    unansweredCount: 0,
    accuracy: q.correctOptionId ? 100 : 0,
    ...overrides,
  };
}

describe('UPSC CSE PYQ Test page — navigation', () => {
  it('registers a dedicated /upsc-pyq-test nav entry, separate from the APFC /pyq-test route', () => {
    const item = NAV_ITEMS.find((n) => n.to === '/upsc-pyq-test');
    expect(item).toBeDefined();
    expect(item!.label).toBe('UPSC CSE PYQs');
    expect(NAV_ITEMS.some((n) => n.to === '/pyq-test')).toBe(true);
  });
});

describe('UPSC CSE PYQ Test page — the 2026 dataset itself is unchanged by this stage', () => {
  const bank2026 = () => UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.year === 2026);

  it('exactly 100 questions, correctOptionId present on every one (Set A already attached)', () => {
    expect(bank2026()).toHaveLength(100);
    expect(bank2026().every((r) => r.correctOptionId !== undefined)).toBe(true);
  });

  it('every question number 1-100 appears exactly once', () => {
    const numbers = bank2026()
      .map((r) => r.questionNumber)
      .sort((a, b) => a! - b!);
    expect(numbers).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });
});

describe('UPSC CSE PYQ Test page — the 2025 batch is integrated alongside 2026, both usable by this page', () => {
  const bank2025 = () => UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.year === 2025);

  it('exactly 100 questions, correctOptionId present on every one (Set A already attached)', () => {
    expect(bank2025()).toHaveLength(100);
    expect(bank2025().every((r) => r.correctOptionId !== undefined)).toBe(true);
  });

  it('the 2026 + 2025 subset holds exactly 200 questions (the combined bank itself has since grown further — see data/pyqUpscCsePrelims.test.ts for its full current size)', () => {
    const bank2026 = UPSC_CSE_PRELIMS_PYQ_BANK.filter((r) => r.year === 2026);
    expect(bank2026.length + bank2025().length).toBe(200);
  });
});

describe('UPSC CSE PYQ Test page — attempt recording', () => {
  beforeEach(fullReset);

  it('addUpscCsePrelimsPyqAttempt writes to its own dedicated, workspace-owned field', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const attempt = fixtureAttempt();
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(attempt);
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toEqual([attempt]);
  });

  it('newest attempt is prepended, matching every other attempt-list field\'s convention', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(fixtureAttempt({ id: 'a1' }));
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(fixtureAttempt({ id: 'a2' }));
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts.map((a) => a.id)).toEqual(['a2', 'a1']);
  });

  it('recorded attempts feed computeUpscCsePrelimsPerformance correctly', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(fixtureAttempt());
    const snapshot = computeUpscCsePrelimsPerformance(UPSC_CSE_PRELIMS_PYQ_BANK, useAppStore.getState().upscCsePrelimsPyqAttempts, UPSC_CSE_PRELIMS_SYLLABUS);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.overall.testsCompleted).toBe(1);
  });
});

describe('UPSC CSE PYQ Test page — mark for revision reuses bookmarkedPyqIds/revisionQueue as-is', () => {
  beforeEach(fullReset);

  it('toggleBookmarkedPyq works for a UPSC question id exactly like it does for an APFC one', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const qid = UPSC_CSE_PRELIMS_PYQ_BANK[0].id;
    useAppStore.getState().toggleBookmarkedPyq(qid);
    expect(useAppStore.getState().bookmarkedPyqIds).toEqual([qid]);
  });

  it('an incorrect or bookmarked UPSC question becomes eligible for the shared revision queue', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const q = UPSC_CSE_PRELIMS_PYQ_BANK.find((r) => r.correctOptionId !== undefined)!;
    const wrongOption = q.options.find((o) => o.id !== q.correctOptionId)!.id;
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(
      fixtureAttempt({ questionIds: [q.id], answers: { [q.id]: wrongOption }, correctCount: 0, wrongCount: 1, accuracy: 0 }),
    );
    const revisionMap = computeRevisionStatusMap(UPSC_CSE_PRELIMS_PYQ_BANK, useAppStore.getState().upscCsePrelimsPyqAttempts);
    const eligible = computeEligibleRevisionIds(UPSC_CSE_PRELIMS_PYQ_BANK, revisionMap, useAppStore.getState().bookmarkedPyqIds);
    expect(eligible).toContain(q.id);
  });

  it('recordRevisionCorrect/Incorrect (lib/revisionQueue) work for a UPSC question id exactly like an APFC one', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const qid = UPSC_CSE_PRELIMS_PYQ_BANK[0].id;
    useAppStore.getState().recordRevisionIncorrect(qid, '2026-01-01');
    expect(useAppStore.getState().revisionQueue[qid].box).toBe(1);
    useAppStore.getState().recordRevisionCorrect(qid, '2026-01-02');
    expect(useAppStore.getState().revisionQueue[qid].box).toBe(2);
    const due = getDueItems(useAppStore.getState().revisionQueue, [qid], '2026-01-02');
    expect(due.some((d) => d.pyqId === qid)).toBe(false); // just advanced, not due again on the same day
  });
});

describe('UPSC CSE PYQ Test page — UPSC workspace isolation', () => {
  beforeEach(fullReset);

  it('upscCsePrelimsPyqAttempts set while upsc_cse is active is invisible after switching to apfc, and restored on switching back', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(fixtureAttempt());
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toHaveLength(1);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toHaveLength(1);
  });

  it('bookmarking a UPSC question id never leaks into APFC\'s own bookmarkedPyqIds', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const upscId = UPSC_CSE_PRELIMS_PYQ_BANK[0].id;
    useAppStore.getState().toggleBookmarkedPyq(upscId);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().bookmarkedPyqIds).toEqual([]);
    useAppStore.getState().toggleBookmarkedPyq('apfc-pyq-x');
    expect(useAppStore.getState().bookmarkedPyqIds).toEqual(['apfc-pyq-x']);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().bookmarkedPyqIds).toEqual([upscId]);
  });

  it('a third, never-visited workspace (phd_research) never inherits UPSC attempts', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(fixtureAttempt());
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toEqual([]);
  });

  it('resetAllData clears UPSC attempts for every workspace, not just the active one', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(fixtureAttempt());
    useAppStore.getState().setActiveWorkspaceId('apfc'); // archives it under upsc_cse
    useAppStore.getState().resetAllData();
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toEqual([]);
  });
});

describe('UPSC CSE PYQ Test page — persistence / reload', () => {
  beforeEach(fullReset);

  it('exportAllData / importAllData round-trips upscCsePrelimsPyqAttempts (simulated reload)', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(fixtureAttempt());
    const json = exportAllData();

    fullReset();
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toEqual([]);

    importAllData(json);
    expect(useAppStore.getState().upscCsePrelimsPyqAttempts).toHaveLength(1);
  });

  it('migrateAppStorage backfills upscCsePrelimsPyqAttempts to [] for a pre-existing export that predates this field', () => {
    const legacyPersisted = { completedTopics: {}, notes: [], attempts: [], pyqAttempts: [], activeWorkspaceId: 'apfc' };
    const migrated = migrateAppStorage(legacyPersisted, 7) as { upscCsePrelimsPyqAttempts: unknown };
    expect(migrated.upscCsePrelimsPyqAttempts).toEqual([]);
  });

  it('migrateAppStorage backfills upscCsePrelimsPyqAttempts inside an archived (inactive) workspace snapshot too', () => {
    const legacyPersisted = {
      activeWorkspaceId: 'apfc',
      inactiveWorkspaceOwnedData: { upsc_cse: { notes: [], completedTopics: {} } },
    };
    const migrated = migrateAppStorage(legacyPersisted, 7) as { inactiveWorkspaceOwnedData: Record<string, { upscCsePrelimsPyqAttempts: unknown }> };
    expect(migrated.inactiveWorkspaceOwnedData.upsc_cse.upscCsePrelimsPyqAttempts).toEqual([]);
  });
});

describe('UPSC CSE PYQ Test page — APFC/PhD regression', () => {
  it('data/pyq.ts\'s PYQ_BANK is unchanged: 458 questions', () => {
    expect(PYQ_BANK.length).toBe(458);
  });

  it('data/syllabus.ts\'s SYLLABUS is unchanged: 13 subjects, 134 topics', () => {
    expect(SYLLABUS.length).toBe(13);
    expect(SYLLABUS.reduce((sum, s) => sum + s.topics.length, 0)).toBe(134);
  });

  it('data/pyqUpscCse.ts\'s UPSC_CSE_PYQ_BANK remains empty (untouched, separate from this stage\'s new bank)', () => {
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });

  it('adding a UPSC CSE PYQ attempt never touches APFC\'s own pyqAttempts field', () => {
    useAppStore.setState({ activeWorkspaceId: 'upsc_cse', pyqAttempts: [] });
    useAppStore.getState().addUpscCsePrelimsPyqAttempt(fixtureAttempt());
    expect(useAppStore.getState().pyqAttempts).toEqual([]);
  });
});
