import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { NAV_ITEMS } from '../components/layout/nav';
import { getPapersForStage, getSubjectsForPaper, getMicrosyllabusForSubject, resolveMicrosyllabusPath } from '../lib/upscCseSyllabus';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { computeCoverageSummary, getCoverageState } from '../lib/upscCseSyllabusCoverage';
import { subjectHasMicrosyllabusMatch } from '../lib/upscCseSyllabusSearch';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';

// This page has no rendering test here (no React Testing Library / DOM environment in this repo —
// see every other *.test.ts file for the established convention). These tests exercise exactly what
// pages/UpscCseSyllabus.tsx itself calls: the tree resolvers (lib/upscCseSyllabus.ts), the pure
// search/filter helpers it renders through (lib/upscCseSyllabusSearch.ts — "hierarchy expansion
// while searching" is driven by subjectHasMicrosyllabusMatch, exercised below and exhaustively in
// upscCseSyllabusSearch.test.ts), the coverage model (lib/upscCseSyllabusCoverage.ts), and the real
// store action it calls (setUpscCseCoverageState) — plus route/nav registration. A manual browser
// smoke check (see the task report) covers the actual on-screen tabs/accordion/search/picker flow.

function fullReset() {
  useAppStore.setState({
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: {},
    completedTopics: {},
    upscCseSyllabusCoverage: {},
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

describe('UPSC CSE Syllabus page — navigation', () => {
  it('registers a dedicated /upsc-syllabus nav entry, separate from the APFC /syllabus route', () => {
    const item = NAV_ITEMS.find((n) => n.to === '/upsc-syllabus');
    expect(item).toBeDefined();
    expect(item!.label).toBe('UPSC CSE Syllabus');
    expect(NAV_ITEMS.some((n) => n.to === '/syllabus')).toBe(true);
  });
});

describe('UPSC CSE Syllabus page — rendering Prelims', () => {
  it('resolves exactly GS Paper I and CSAT / GS Paper II, in order', () => {
    const papers = getPapersForStage(UPSC_CSE_PRELIMS_SYLLABUS);
    expect(papers.map((p) => p.title)).toEqual(['General Studies Paper I', 'CSAT / General Studies Paper II']);
  });

  it('every paper resolves a non-empty, ordered subject -> microsyllabus chain the page can render', () => {
    for (const paper of getPapersForStage(UPSC_CSE_PRELIMS_SYLLABUS)) {
      const subjects = getSubjectsForPaper(UPSC_CSE_PRELIMS_SYLLABUS, paper.id);
      expect(subjects.length).toBeGreaterThan(0);
      for (const subject of subjects) {
        expect(getMicrosyllabusForSubject(UPSC_CSE_PRELIMS_SYLLABUS, subject.id).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('UPSC CSE Syllabus page — rendering Mains', () => {
  it('resolves all six official papers, in order', () => {
    const papers = getPapersForStage(UPSC_CSE_MAINS_SYLLABUS);
    expect(papers.map((p) => p.shortTitle)).toEqual(['Essay', 'GS-I', 'GS-II', 'GS-III', 'GS-IV', 'Optional']);
  });

  it('every paper resolves a non-empty, ordered subject -> microsyllabus chain the page can render', () => {
    for (const paper of getPapersForStage(UPSC_CSE_MAINS_SYLLABUS)) {
      const subjects = getSubjectsForPaper(UPSC_CSE_MAINS_SYLLABUS, paper.id);
      expect(subjects.length).toBeGreaterThan(0);
      for (const subject of subjects) {
        expect(getMicrosyllabusForSubject(UPSC_CSE_MAINS_SYLLABUS, subject.id).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('UPSC CSE Syllabus page — hierarchy expansion (search-driven visibility)', () => {
  it('a subject with no matching microsyllabus item collapses out of view while searching', () => {
    const gs1 = getPapersForStage(UPSC_CSE_PRELIMS_SYLLABUS).find((p) => p.title === 'General Studies Paper I')!;
    const historySubject = getSubjectsForPaper(UPSC_CSE_PRELIMS_SYLLABUS, gs1.id).find((s) => s.title === 'History')!;
    expect(subjectHasMicrosyllabusMatch(UPSC_CSE_PRELIMS_SYLLABUS, historySubject.id, 'photosynthesis')).toBe(false);
  });

  it('a subject with a matching microsyllabus item stays visible (auto-expanded) while searching', () => {
    const gs1 = getPapersForStage(UPSC_CSE_PRELIMS_SYLLABUS).find((p) => p.title === 'General Studies Paper I')!;
    const historySubject = getSubjectsForPaper(UPSC_CSE_PRELIMS_SYLLABUS, gs1.id).find((s) => s.title === 'History')!;
    expect(subjectHasMicrosyllabusMatch(UPSC_CSE_PRELIMS_SYLLABUS, historySubject.id, 'Ancient')).toBe(true);
  });

  it('a blank query keeps every subject visible — the default (manually toggled) expand/collapse state applies', () => {
    const gs1 = getPapersForStage(UPSC_CSE_PRELIMS_SYLLABUS).find((p) => p.title === 'General Studies Paper I')!;
    for (const subject of getSubjectsForPaper(UPSC_CSE_PRELIMS_SYLLABUS, gs1.id)) {
      expect(subjectHasMicrosyllabusMatch(UPSC_CSE_PRELIMS_SYLLABUS, subject.id, '')).toBe(true);
    }
  });
});

describe('UPSC CSE Syllabus page — coverage state changes', () => {
  beforeEach(fullReset);

  it('setUpscCseCoverageState writes the microsyllabus id -> state map the page reads', () => {
    const item = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0];
    useAppStore.getState().setUpscCseCoverageState(item.id, 'learning');
    expect(getCoverageState(useAppStore.getState().upscCseSyllabusCoverage, item.id)).toBe('learning');

    useAppStore.getState().setUpscCseCoverageState(item.id, 'strong');
    expect(getCoverageState(useAppStore.getState().upscCseSyllabusCoverage, item.id)).toBe('strong');
  });

  it('an untouched item defaults to not_started, matching the aggregate progress the page shows on first load', () => {
    const ids = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.map((m) => m.id);
    const summary = computeCoverageSummary(ids, useAppStore.getState().upscCseSyllabusCoverage);
    expect(summary.weightedPct).toBe(0);
    expect(summary.counts.not_started).toBe(ids.length);
  });

  it('setting one item to strong moves the aggregate percentage for its subject/paper/stage', () => {
    const item = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.subjectId === UPSC_CSE_PRELIMS_SYLLABUS.subjects.find((s) => s.title === 'Comprehension')!.id)!;
    useAppStore.getState().setUpscCseCoverageState(item.id, 'strong');
    const subjectIds = getMicrosyllabusForSubject(UPSC_CSE_PRELIMS_SYLLABUS, item.subjectId).map((m) => m.id);
    const summary = computeCoverageSummary(subjectIds, useAppStore.getState().upscCseSyllabusCoverage);
    expect(summary.weightedPct).toBe(100); // Comprehension has exactly one microsyllabus item
  });

  it('does not touch completedTopics (APFC\'s own tracking field)', () => {
    const item = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0];
    useAppStore.getState().setUpscCseCoverageState(item.id, 'strong');
    expect(useAppStore.getState().completedTopics).toEqual({});
  });
});

describe('UPSC CSE Syllabus page — persistence / reload', () => {
  beforeEach(fullReset);

  it('exportAllData / importAllData round-trips coverage state (simulated reload)', () => {
    const item = UPSC_CSE_MAINS_SYLLABUS.microsyllabus[0];
    useAppStore.getState().setUpscCseCoverageState(item.id, 'revised');
    const json = exportAllData();

    fullReset(); // simulate a fresh page load with nothing in memory yet
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({});

    importAllData(json);
    expect(getCoverageState(useAppStore.getState().upscCseSyllabusCoverage, item.id)).toBe('revised');
  });

  it('migrateAppStorage backfills upscCseSyllabusCoverage to {} for a pre-existing export that predates this field', () => {
    const legacyPersisted = { completedTopics: {}, notes: [], attempts: [], pyqAttempts: [], activeWorkspaceId: 'apfc' };
    const migrated = migrateAppStorage(legacyPersisted, 6) as { upscCseSyllabusCoverage: unknown };
    expect(migrated.upscCseSyllabusCoverage).toEqual({});
  });

  it('migrateAppStorage backfills upscCseSyllabusCoverage inside an archived (inactive) workspace snapshot too', () => {
    const legacyPersisted = {
      activeWorkspaceId: 'apfc',
      inactiveWorkspaceOwnedData: { upsc_cse: { notes: [], completedTopics: {} } },
    };
    const migrated = migrateAppStorage(legacyPersisted, 6) as { inactiveWorkspaceOwnedData: Record<string, { upscCseSyllabusCoverage: unknown }> };
    expect(migrated.inactiveWorkspaceOwnedData.upsc_cse.upscCseSyllabusCoverage).toEqual({});
  });
});

describe('UPSC CSE Syllabus page — UPSC workspace isolation', () => {
  beforeEach(fullReset);

  it('coverage set while upsc_cse is active is invisible after switching to apfc, and restored on switching back', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const item = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0];
    useAppStore.getState().setUpscCseCoverageState(item.id, 'strong');
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({ [item.id]: 'strong' });

    useAppStore.getState().setActiveWorkspaceId('apfc');
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({});

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({ [item.id]: 'strong' });
  });

  it('a third, never-visited workspace (phd_research) never inherits UPSC coverage', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().setUpscCseCoverageState(UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0].id, 'strong');
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({});
  });

  it('resetAllData clears coverage for every workspace, not just the active one', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    useAppStore.getState().setUpscCseCoverageState(UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0].id, 'strong');
    useAppStore.getState().setActiveWorkspaceId('apfc'); // archives it under upsc_cse
    useAppStore.getState().resetAllData();
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({});
  });
});

describe('UPSC CSE Syllabus page — APFC syllabus data remains unchanged', () => {
  it('data/syllabus.ts\'s SYLLABUS is unchanged: 13 subjects, 134 total topics', () => {
    expect(SYLLABUS.length).toBe(13);
    expect(SYLLABUS.reduce((sum, subject) => sum + subject.topics.length, 0)).toBe(134);
  });

  it('data/pyq.ts\'s PYQ_BANK is unchanged: 458 questions', () => {
    expect(PYQ_BANK.length).toBe(458);
  });
});

describe('UPSC CSE Syllabus page — stable microsyllabus IDs', () => {
  it('every microsyllabus id used as a coverage key resolves back to the exact same node via resolveMicrosyllabusPath', () => {
    for (const item of UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus) {
      const path = resolveMicrosyllabusPath(UPSC_CSE_PRELIMS_SYLLABUS, item.id);
      expect(path?.item.id).toBe(item.id);
    }
    for (const item of UPSC_CSE_MAINS_SYLLABUS.microsyllabus) {
      const path = resolveMicrosyllabusPath(UPSC_CSE_MAINS_SYLLABUS, item.id);
      expect(path?.item.id).toBe(item.id);
    }
  });

  it('a coverage id survives an export/import round-trip verbatim (no id mutation/rewriting)', () => {
    fullReset();
    const id = UPSC_CSE_MAINS_SYLLABUS.microsyllabus[10].id;
    useAppStore.getState().setUpscCseCoverageState(id, 'learning');
    const json = exportAllData();
    fullReset();
    importAllData(json);
    expect(Object.keys(useAppStore.getState().upscCseSyllabusCoverage)).toEqual([id]);
  });
});
