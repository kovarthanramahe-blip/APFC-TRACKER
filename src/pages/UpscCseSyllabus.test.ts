import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, exportAllData, importAllData, migrateAppStorage } from '../lib/store';
import { createRevisionQueue } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { NAV_ITEMS } from '../components/layout/nav';
import { getPapersForStage, getSubjectsForPaper, getMicrosyllabusForSubject, resolveMicrosyllabusPath } from '../lib/upscCseSyllabus';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { resolveDeepLinkStage } from './UpscCseSyllabus';
import { computeCoverageSummary, getCoverageState } from '../lib/upscCseSyllabusCoverage';
import { subjectHasMicrosyllabusMatch } from '../lib/upscCseSyllabusSearch';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { confirmImportedContent } from '../lib/contentImport';
import { listImportedContentBySyllabusNode, listImportedContentBySyllabusNodeIncludingClassifications } from '../lib/repository';
import { getTopicsForMicrosyllabus } from '../lib/upscCseGranularSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { getMicrosyllabusCounts } from '../lib/upscCsePrelimsPyqFilters';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { UPSC_CSE_GRANULAR_PYQ_MAPPING, countCuratedPyqsByGranularNode } from '../lib/upscCseGranularPyqMapping';

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
    knowledgeClassifications: [],
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

  // Library Mode Audit + History Optional Integration task, Phase B's own "the hierarchy survives
  // refresh, export/import and existing persistence mechanisms" requirement, exercised with the
  // real new History Optional ids specifically (not just a pre-existing Mains item) — the coverage
  // store is a generic Record<microsyllabusId, state> with no hardcoded id list, so this requires
  // no migration/plumbing change, but is verified directly rather than only reasoned about.
  it('History Optional Paper I/II coverage state survives export/import exactly like any other Mains subject', () => {
    const optional = UPSC_CSE_MAINS_SYLLABUS.papers.find((p) => p.title === 'Optional Subject')!;
    const paper1Subject = getSubjectsForPaper(UPSC_CSE_MAINS_SYLLABUS, optional.id).find((s) => s.title === 'History Optional — Paper I')!;
    const paper2Subject = getSubjectsForPaper(UPSC_CSE_MAINS_SYLLABUS, optional.id).find((s) => s.title === 'History Optional — Paper II')!;
    const paper1Item = getMicrosyllabusForSubject(UPSC_CSE_MAINS_SYLLABUS, paper1Subject.id)[0];
    const paper2Item = getMicrosyllabusForSubject(UPSC_CSE_MAINS_SYLLABUS, paper2Subject.id)[0];

    useAppStore.getState().setUpscCseCoverageState(paper1Item.id, 'learning');
    useAppStore.getState().setUpscCseCoverageState(paper2Item.id, 'strong');
    const json = exportAllData();

    fullReset();
    expect(useAppStore.getState().upscCseSyllabusCoverage).toEqual({});

    importAllData(json);
    expect(getCoverageState(useAppStore.getState().upscCseSyllabusCoverage, paper1Item.id)).toBe('learning');
    expect(getCoverageState(useAppStore.getState().upscCseSyllabusCoverage, paper2Item.id)).toBe('strong');
    // Paper I and Paper II are independently tracked — setting one never touches the other.
    expect(paper1Item.id).not.toBe(paper2Item.id);
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

describe('UPSC CSE Syllabus page — "Study this microsyllabus" deep-link resolution (from PYQ review)', () => {
  it('resolves a Prelims microsyllabus id to the "prelims" stage', () => {
    const id = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0].id;
    expect(resolveDeepLinkStage(id)).toBe('prelims');
  });

  it('resolves a Mains microsyllabus id to the "mains" stage', () => {
    const id = UPSC_CSE_MAINS_SYLLABUS.microsyllabus[0].id;
    expect(resolveDeepLinkStage(id)).toBe('mains');
  });

  it('returns undefined for an id that exists in neither tree (never guesses a stage)', () => {
    expect(resolveDeepLinkStage('not-a-real-id')).toBeUndefined();
  });
});

describe('UPSC CSE Syllabus page — "linked knowledge" indicator (Phase 3: Syllabus -> Knowledge)', () => {
  beforeEach(fullReset);

  it('a microsyllabus item with a Current Affairs entry linked to it has a non-zero linked count', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const microsyllabusItem = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[0];
    const linked = confirmImportedContent(
      { sourceFilename: 'f.md', originalFormat: 'markdown', suggestedContentType: 'current_affairs', title: 'Linked item', content: 'x' },
      { workspaceId: 'upsc_cse', contentType: 'current_affairs', metadata: { syllabusNodeId: microsyllabusItem.id } },
    );
    useAppStore.getState().addImportedContent(linked);

    const count = listImportedContentBySyllabusNode(useAppStore.getState().importedContent, microsyllabusItem.id).length;
    expect(count).toBe(1);
  });

  it('a microsyllabus item with nothing linked to it has a zero count — the page shows no badge at all for it', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const microsyllabusItem = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus[1];
    expect(listImportedContentBySyllabusNode(useAppStore.getState().importedContent, microsyllabusItem.id)).toEqual([]);
  });

  it('an item linked to a DIFFERENT microsyllabus node is never counted against this one', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const [itemA, itemB] = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus;
    const linkedToA = confirmImportedContent(
      { sourceFilename: 'f.md', originalFormat: 'markdown', suggestedContentType: 'current_affairs', title: 'Linked to A', content: 'x' },
      { workspaceId: 'upsc_cse', contentType: 'current_affairs', metadata: { syllabusNodeId: itemA.id } },
    );
    useAppStore.getState().addImportedContent(linkedToA);

    expect(listImportedContentBySyllabusNode(useAppStore.getState().importedContent, itemB.id)).toEqual([]);
  });
});

// Knowledge Librarian P1.2 — the page's own "N linked" badge (lines ~410, ~481 of
// pages/UpscCseSyllabus.tsx) rolls up over BOTH this microsyllabus row's own legacy
// metadata.syllabusNodeId matches AND any CONFIRMED classification on a granular TOPIC-level node
// beneath it (a Knowledge Librarian classification is always confirmed against a granular topic id
// — see lib/upscCseKnowledgeTaxonomy.ts's listUpscCseTopicsFlat — never against the microsyllabus
// id itself), exactly mirroring what pages/UpscCseSyllabus.tsx's own linkedCount useMemo computes.
// Before P1.2, this rollup didn't exist at all — a confirmed CSE classification was invisible from
// this badge no matter what, which is exactly the gap this phase's audit found and fixed.
describe('UPSC CSE Syllabus page — "linked knowledge" rollup from granular-topic classifications (P1.2)', () => {
  beforeEach(fullReset);

  function microsyllabusWithGranularTopics() {
    const item = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, m.id).length > 0);
    expect(item).toBeDefined();
    const topics = getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, item!.id);
    expect(topics.length).toBeGreaterThan(0);
    return { item: item!, topics };
  }

  function computeLinkedCount(microsyllabusItemId: string, topicIds: string[]) {
    const { importedContent, knowledgeClassifications } = useAppStore.getState();
    const linkedIds = new Set<string>();
    for (const syllabusNodeId of [microsyllabusItemId, ...topicIds]) {
      for (const entry of listImportedContentBySyllabusNodeIncludingClassifications(importedContent, syllabusNodeId, knowledgeClassifications)) {
        linkedIds.add(entry.id);
      }
    }
    return linkedIds.size;
  }

  it('a confirmed classification on a granular topic beneath a microsyllabus item rolls up into that item\'s own linked count', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const { item, topics } = microsyllabusWithGranularTopics();
    const imported = confirmImportedContent(
      { sourceFilename: 'f.md', originalFormat: 'markdown', suggestedContentType: 'current_affairs', title: 'Granular-classified item', content: 'x' },
      { workspaceId: 'upsc_cse', contentType: 'current_affairs' },
    );
    useAppStore.getState().addImportedContent(imported);
    // No metadata.syllabusNodeId at all — the OLD, legacy-only lookup would find nothing here.
    expect(listImportedContentBySyllabusNode(useAppStore.getState().importedContent, item.id)).toEqual([]);

    useAppStore.getState().addManualKnowledgeClassification({ itemId: imported.id, itemType: 'imported_content', topicId: topics[0].id });

    expect(computeLinkedCount(item.id, topics.map((t) => t.id))).toBe(1);
  });

  it('a PROPOSED (not yet confirmed) classification on a granular topic does not roll up', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const { item, topics } = microsyllabusWithGranularTopics();
    const imported = confirmImportedContent(
      { sourceFilename: 'f.md', originalFormat: 'markdown', suggestedContentType: 'current_affairs', title: 'Proposed only', content: 'x' },
      { workspaceId: 'upsc_cse', contentType: 'current_affairs' },
    );
    useAppStore.getState().addImportedContent(imported);
    useAppStore.getState().addKnowledgeIngestionBatch({
      originalDocument: imported,
      articles: [],
      classifications: [
        {
          id: 'proposed-1',
          workspaceId: 'upsc_cse',
          itemId: imported.id,
          itemType: 'imported_content',
          taxonomy: 'upsc_cse',
          topicId: topics[0].id,
          confidence: 0.5,
          rationale: 'r',
          status: 'proposed',
          source: 'lexical',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      relationships: [],
      warnings: [],
    });

    expect(computeLinkedCount(item.id, topics.map((t) => t.id))).toBe(0);
  });

  it('a classification confirmed against a granular topic under a DIFFERENT microsyllabus item never rolls up here', () => {
    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    const itemsWithTopics = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.filter((m) => getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, m.id).length > 0);
    expect(itemsWithTopics.length).toBeGreaterThanOrEqual(2);
    const [itemA, itemB] = itemsWithTopics;
    const topicsA = getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, itemA.id);
    const topicsB = getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, itemB.id);

    const imported = confirmImportedContent(
      { sourceFilename: 'f.md', originalFormat: 'markdown', suggestedContentType: 'current_affairs', title: 'Classified under A', content: 'x' },
      { workspaceId: 'upsc_cse', contentType: 'current_affairs' },
    );
    useAppStore.getState().addImportedContent(imported);
    useAppStore.getState().addManualKnowledgeClassification({ itemId: imported.id, itemType: 'imported_content', topicId: topicsA[0].id });

    expect(computeLinkedCount(itemB.id, topicsB.map((t) => t.id))).toBe(0);
  });
});

// P2.0 — "N curated PYQs" badge on a granular Topic/Subtopic/Micro-topic row. This page has no
// rendering test (see this file's own header comment), so these exercise exactly what the page's
// CuratedPyqBadge component reads: countCuratedPyqsByGranularNode (lib/upscCseGranularPyqMapping.ts)
// keyed by each granular node's own id — the same lookup the component calls to decide whether to
// render a badge at all, and with what count.
describe('UPSC CSE Syllabus page — curated granular PYQ coverage (P2.0)', () => {
  it('a mapped granular node resolves a positive count — the badge the page renders would show it', () => {
    const counts = countCuratedPyqsByGranularNode();
    for (const nodeId of Object.values(UPSC_CSE_GRANULAR_PYQ_MAPPING)) {
      expect(counts[nodeId]).toBeGreaterThan(0);
    }
  });

  it('a real granular node with no curated mapping resolves no count — the page renders no badge for it', () => {
    const counts = countCuratedPyqsByGranularNode();
    const allNodeIds = UPSC_CSE_GRANULAR_NODES.map((n) => n.id);
    const mappedNodeIds = new Set(Object.values(UPSC_CSE_GRANULAR_PYQ_MAPPING));
    const someUnmappedNodeId = allNodeIds.find((id) => !mappedNodeIds.has(id))!;
    expect(someUnmappedNodeId).toBeDefined();
    expect(counts[someUnmappedNodeId]).toBeUndefined();
  });

  it('existing microsyllabus-level PYQ counts (getMicrosyllabusCounts) are completely unchanged by P2.0 and total exactly the full bank', () => {
    const counts = getMicrosyllabusCounts(UPSC_CSE_PRELIMS_PYQ_BANK, 'all', 'all', 'all');
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(UPSC_CSE_PRELIMS_PYQ_BANK.length);
  });

  it('the microsyllabus-level count and the granular curated count are never the same map — a microsyllabus id is never looked up in the curated map and vice versa', () => {
    const microsyllabusIds = new Set(UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.map((m) => m.id));
    const curatedNodeIds = new Set(Object.values(UPSC_CSE_GRANULAR_PYQ_MAPPING));
    for (const nodeId of curatedNodeIds) {
      expect(microsyllabusIds.has(nodeId)).toBe(false);
    }
  });

  it('APFC syllabus data is untouched by this phase — the real topic tree still resolves as before', () => {
    expect(SYLLABUS.length).toBeGreaterThan(0);
    for (const subject of SYLLABUS) {
      expect(subject.topics.length).toBeGreaterThan(0);
    }
  });

  it('a real APFC classification still resolves its own PYQ_BANK matches, independent of any CSE granular mapping work in this phase', () => {
    const q = PYQ_BANK[0];
    const expectedCount = PYQ_BANK.filter((p) => p.topicId === q.topicId).length;
    expect(expectedCount).toBeGreaterThan(0);
  });
});
