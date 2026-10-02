import { describe, it, expect } from 'vitest';
import {
  generateUpNextItems,
  type GenerateUpNextItemsInput,
  type ApfcCommandCentreData,
  type UpscCseCommandCentreData,
  type PhdCommandCentreData,
} from './commandCentre';
import { createRevisionQueue, type RevisionQueue } from './revisionQueue';
import type { PYQAttempt } from './types';
import { PYQ_BANK } from '../data/pyq';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { migrateGranularCoverageBackfill } from './upscCseGranularCoverage';
import type { UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import type { MicroTarget } from './microTarget';
import type { ImportedContent } from './contentImport';

// Command Centre — these tests exercise generateUpNextItems exactly as pages/CommandCentre.tsx
// will call it: pure data in, a flat CommandCentreItem[] out. No store access here (the module
// itself never touches the store — see its own header), so "inactive workspace" is simulated
// simply by passing data that did NOT come from the live active-workspace fields — the function
// has no way to tell the difference, by design.

function emptyApfc(overrides: Partial<ApfcCommandCentreData> = {}): ApfcCommandCentreData {
  return { completedTopics: {}, pyqAttempts: [], bookmarkedPyqIds: [], revisionQueue: createRevisionQueue(), ...overrides };
}

function emptyUpscCse(overrides: Partial<UpscCseCommandCentreData> = {}): UpscCseCommandCentreData {
  return { coverage: {}, attempts: [], bookmarkedPyqIds: [], revisionQueue: createRevisionQueue(), importedContent: [], ...overrides };
}

// Every UPSC CSE microsyllabus item marked 'strong' — the same technique
// lib/upscCseTodaysStudy.test.ts's own "returns nothing" test uses for the syllabus signal
// specifically. The real UPSC_CSE_PRELIMS_PYQ_BANK also has its own unanswered/incorrect/weak-area
// signals, which this intentionally leaves untouched here — see the test below, which checks only
// that the SYLLABUS signal goes quiet once coverage is complete, not that the whole real question
// bank (hundreds of real questions) is somehow fully resolved by a fixture.
function fullyCoveredUpscCseSyllabus(): UpscCseSyllabusCoverage {
  let coverage: UpscCseSyllabusCoverage = {};
  for (const m of [...UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus, ...UPSC_CSE_MAINS_SYLLABUS.microsyllabus]) coverage[m.id] = 'strong';
  // commandCentre.ts (like pages/UpscCseDashboard.tsx) reads coverage through the REAL granular
  // nodes, which roll a microsyllabus item's effective state up from its own leaf entries when it
  // has any — migrateGranularCoverageBackfill (lib/upscCseGranularCoverage.ts) is the existing,
  // already-tested tool for seeding every leaf with its parent's state, used here only to build a
  // genuinely fully-covered fixture, never duplicated rollup logic of our own.
  return migrateGranularCoverageBackfill(coverage, UPSC_CSE_GRANULAR_NODES);
}

function emptyPhd(overrides: Partial<PhdCommandCentreData> = {}): PhdCommandCentreData {
  return { researchStartDate: '2023-12-21', topicAreas: [], microTargets: [], importedContent: [], notesCount: 0, ...overrides };
}

function baseInput(overrides: Partial<GenerateUpNextItemsInput> = {}): GenerateUpNextItemsInput {
  return {
    today: '2026-09-22',
    apfc: emptyApfc(),
    upscCse: emptyUpscCse(),
    phdResearch: emptyPhd(),
    ...overrides,
  };
}

function attempt(overrides: Partial<PYQAttempt> = {}): PYQAttempt {
  return {
    id: 'a1',
    submittedAt: '2026-09-01T00:00:00.000Z',
    year: 'all',
    subject: 'all',
    topicId: 'all',
    questionIds: [],
    answers: {},
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    score: 0,
    accuracy: 0,
    ...overrides,
  };
}

function microTarget(overrides: Partial<MicroTarget> = {}): MicroTarget {
  return { id: 't1', title: 'Draft chapter 2', status: 'pending', priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function importedContent(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: 'c1',
    workspaceId: 'phd_research',
    contentType: 'research_document',
    title: 'A document',
    rawContent: 'x',
    provenance: { sourceFilename: 'x.md', originalFormat: 'markdown', importedAt: '2026-01-01T00:00:00.000Z' },
    ...overrides,
  };
}

describe('generateUpNextItems — empty/all-caught-up state', () => {
  it('returns an empty list, never throwing, when nothing is kept from any workspace (maxPerWorkspace: 0), even with real due/overdue/not_started signals present everywhere — never padded with filler to fill the gap', () => {
    const dueQueue: RevisionQueue = { q1: { pyqId: 'q1', box: 1, dueDate: '2026-09-20', lastReviewedDate: '2026-09-10', reviewCount: 1 } };
    const input = baseInput({
      apfc: emptyApfc({ bookmarkedPyqIds: ['q1'], revisionQueue: dueQueue }),
      upscCse: emptyUpscCse(), // has real not_started syllabus items by default
      phdResearch: emptyPhd({ microTargets: [microTarget({ id: 'overdue1', status: 'pending', targetDate: '2026-09-01' })] }),
      maxPerWorkspace: 0,
    });
    expect(() => generateUpNextItems(input)).not.toThrow();
    expect(generateUpNextItems(input)).toEqual([]);
  });
});

describe('generateUpNextItems — APFC item composition', () => {
  it('surfaces a due-for-revision item using the real revisionQueue/pyqFilters engines, with the existing /pyq-test route', () => {
    const dueQueue: RevisionQueue = { q1: { pyqId: 'q1', box: 1, dueDate: '2026-09-20', lastReviewedDate: '2026-09-10', reviewCount: 1 } };
    const items = generateUpNextItems(baseInput({ apfc: emptyApfc({ bookmarkedPyqIds: ['q1'], revisionQueue: dueQueue }) }));
    const apfcItems = items.filter((i) => i.workspaceId === 'apfc');
    expect(apfcItems).toHaveLength(1);
    expect(apfcItems[0]).toMatchObject({ id: 'apfc-revision-due', actionHref: '/pyq-test', actionLabel: 'Revise Now' });
    expect(apfcItems[0].title).toContain('1 PYQ');
  });

  it('contributes nothing when there is no bookmarked/due PYQ and no attempt data at all', () => {
    const items = generateUpNextItems(baseInput());
    expect(items.filter((i) => i.workspaceId === 'apfc')).toEqual([]);
  });

  it('caps APFC items at maxPerWorkspace', () => {
    const dueQueue: RevisionQueue = { q1: { pyqId: 'q1', box: 1, dueDate: '2026-09-20', lastReviewedDate: '2026-09-10', reviewCount: 1 } };
    const items = generateUpNextItems(baseInput({ apfc: emptyApfc({ bookmarkedPyqIds: ['q1'], revisionQueue: dueQueue }), maxPerWorkspace: 1 }));
    expect(items.filter((i) => i.workspaceId === 'apfc').length).toBeLessThanOrEqual(1);
  });

  // Phase 15 — the weak-topics item must count real TOPICS (lib/weakTopicPractice.ts's
  // selectWeakTopics), never the PYQ QUESTION ids selectWeakTopicPracticeIds returns for the actual
  // practice session — a single weak topic can carry many real PYQs, so the two numbers genuinely
  // differ. `en-1` ("Reading Comprehension") is real production data with 18+ real PYQs, used here
  // (found dynamically, never hardcoded) precisely because it demonstrates that divergence.
  function realTopicWithAtLeastNPyqs(n: number): { topicId: string; questions: typeof PYQ_BANK } {
    const byTopic = new Map<string, typeof PYQ_BANK>();
    for (const q of PYQ_BANK) byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), q]);
    const found = [...byTopic.entries()].find(([, qs]) => qs.length >= n);
    if (!found) throw new Error(`No real syllabus topic in PYQ_BANK has at least ${n} questions — fixture assumption broken.`);
    return { topicId: found[0], questions: found[1].slice(0, n) };
  }

  it('counts the real number of weak TOPICS, not the (larger) number of associated PYQ question ids, for a topic with many real PYQs', () => {
    const { topicId, questions } = realTopicWithAtLeastNPyqs(3);
    // One correct, two wrong — real accuracy ~33%, well under WEAK_PYQ_ACCURACY_THRESHOLD (60), so
    // this single topic is genuinely 'needs_revision' with >=3 real PYQs behind it.
    const answers: Record<string, string> = {};
    questions.forEach((q, i) => {
      answers[q.id] = i === 0 ? q.correctOptionId : q.options.find((o) => o.id !== q.correctOptionId)!.id;
    });
    const weakAttempt: PYQAttempt = {
      id: 'weak-attempt',
      submittedAt: '2026-09-01T00:00:00.000Z',
      year: 'all',
      subject: 'all',
      topicId: 'all',
      questionIds: questions.map((q) => q.id),
      answers,
      correctCount: 1,
      wrongCount: questions.length - 1,
      unansweredCount: 0,
      score: 1,
      accuracy: 100 / questions.length,
    };

    const items = generateUpNextItems(baseInput({ apfc: emptyApfc({ completedTopics: { [topicId]: true }, pyqAttempts: [weakAttempt] }) }));
    const weakTopicItem = items.find((i) => i.id === 'apfc-weak-topics');
    expect(weakTopicItem).toBeDefined();
    // Exactly 1 real weak topic, never the question count (3, or up to 20 for a bigger topic).
    expect(weakTopicItem!.title).toBe('1 weak topic to practice');
  });

  it('adds a "Lowest recent accuracy" context using the real, already-computed pyqAccuracy — never a fabricated or re-derived number', () => {
    const { topicId, questions } = realTopicWithAtLeastNPyqs(3);
    const answers: Record<string, string> = {};
    questions.forEach((q, i) => {
      answers[q.id] = i === 0 ? q.correctOptionId : q.options.find((o) => o.id !== q.correctOptionId)!.id;
    });
    const weakAttempt: PYQAttempt = {
      id: 'weak-attempt',
      submittedAt: '2026-09-01T00:00:00.000Z',
      year: 'all',
      subject: 'all',
      topicId: 'all',
      questionIds: questions.map((q) => q.id),
      answers,
      correctCount: 1,
      wrongCount: questions.length - 1,
      unansweredCount: 0,
      score: 1,
      accuracy: 100 / questions.length,
    };

    const items = generateUpNextItems(baseInput({ apfc: emptyApfc({ completedTopics: { [topicId]: true }, pyqAttempts: [weakAttempt] }) }));
    const weakTopicItem = items.find((i) => i.id === 'apfc-weak-topics');
    const expectedAccuracy = Math.round((1 / questions.length) * 100);
    expect(weakTopicItem!.context).toBe(`Lowest recent accuracy: ${expectedAccuracy}%`);
  });

  it('never adds an accuracy context when every selected weak topic has null pyqAccuracy (covered, but zero PYQ attempts — honestly "needs practice", not a fabricated 0%)', () => {
    const { topicId } = realTopicWithAtLeastNPyqs(1);
    // Covered, but pyqAttempts is empty entirely — this topic is 'needs_practice' (covered + <3
    // attempts), which selectWeakTopics still includes, but with pyqAccuracy === null (never 0).
    const items = generateUpNextItems(baseInput({ apfc: emptyApfc({ completedTopics: { [topicId]: true }, pyqAttempts: [] }) }));
    const weakTopicItem = items.find((i) => i.id === 'apfc-weak-topics');
    expect(weakTopicItem).toBeDefined();
    expect(weakTopicItem!.context).toBeUndefined();
  });
});

describe('generateUpNextItems — UPSC CSE item composition', () => {
  it('reuses generateTodaysStudyItems verbatim — a not_started microsyllabus item surfaces with its existing actionHref', () => {
    const items = generateUpNextItems(baseInput({ upscCse: emptyUpscCse() }));
    const upscItems = items.filter((i) => i.workspaceId === 'upsc_cse');
    expect(upscItems.length).toBeGreaterThan(0);
    expect(upscItems[0].actionHref).toMatch(/^\/upsc-syllabus\?microsyllabusId=/);
    expect(upscItems[0].id).toMatch(/^upsc-cse-/);
  });

  it('surfaces no syllabus item once every microsyllabus is already strong (the real PYQ bank\'s own unanswered/incorrect signals are untouched by coverage and may still surface — see lib/upscCseTodaysStudy.ts)', () => {
    const items = generateUpNextItems(baseInput({ upscCse: emptyUpscCse({ coverage: fullyCoveredUpscCseSyllabus() }) }));
    const upscItems = items.filter((i) => i.workspaceId === 'upsc_cse');
    expect(upscItems.some((i) => i.id.startsWith('upsc-cse-syllabus'))).toBe(false);
  });

  it('caps UPSC CSE items at maxPerWorkspace', () => {
    const items = generateUpNextItems(baseInput({ upscCse: emptyUpscCse(), maxPerWorkspace: 1 }));
    expect(items.filter((i) => i.workspaceId === 'upsc_cse').length).toBeLessThanOrEqual(1);
  });
});

describe('generateUpNextItems — PhD Research item composition', () => {
  it('surfaces overdue micro-targets via the real computePhdDashboardSnapshot engine, with the existing /phd-plan route', () => {
    const items = generateUpNextItems(
      baseInput({
        phdResearch: emptyPhd({ microTargets: [microTarget({ id: 'overdue1', status: 'pending', targetDate: '2026-09-01' })] }),
      }),
    );
    const phdItems = items.filter((i) => i.workspaceId === 'phd_research');
    expect(phdItems.some((i) => i.id === 'phd-overdue-targets' && i.actionHref === '/phd-plan')).toBe(true);
  });

  it('surfaces unread/reading research documents and bibliography records to continue, via the real computePhdAnalytics engine', () => {
    const items = generateUpNextItems(
      baseInput({
        phdResearch: emptyPhd({
          importedContent: [
            importedContent({ id: 'doc1', contentType: 'research_document', metadata: { readingStatus: 'unread' } }),
            importedContent({ id: 'bib1', contentType: 'bibliography', metadata: { readingStatus: 'reading' } }),
          ],
        }),
      }),
    );
    const phdItems = items.filter((i) => i.workspaceId === 'phd_research');
    expect(phdItems.some((i) => i.id === 'phd-continue-documents' && i.actionHref === '/phd-research')).toBe(true);
    expect(phdItems.some((i) => i.id === 'phd-continue-bibliography' && i.actionHref === '/phd-research/bibliography')).toBe(true);
  });

  it('contributes nothing when there are no micro-targets and no research material at all', () => {
    const items = generateUpNextItems(baseInput({ phdResearch: emptyPhd() }));
    expect(items.filter((i) => i.workspaceId === 'phd_research')).toEqual([]);
  });

  it('caps PhD items at maxPerWorkspace', () => {
    const items = generateUpNextItems(
      baseInput({
        phdResearch: emptyPhd({
          microTargets: [microTarget({ id: 'overdue1', status: 'pending', targetDate: '2026-09-01' })],
          importedContent: [
            importedContent({ id: 'doc1', contentType: 'research_document', metadata: { readingStatus: 'unread' } }),
            importedContent({ id: 'bib1', contentType: 'bibliography', metadata: { readingStatus: 'reading' } }),
          ],
        }),
        maxPerWorkspace: 1,
      }),
    );
    expect(items.filter((i) => i.workspaceId === 'phd_research').length).toBeLessThanOrEqual(1);
  });
});

describe('generateUpNextItems — cross-workspace ordering', () => {
  it('orders items APFC first, then UPSC CSE, then PhD Research, with priority matching the final array position', () => {
    const dueQueue: RevisionQueue = { q1: { pyqId: 'q1', box: 1, dueDate: '2026-09-20', lastReviewedDate: '2026-09-10', reviewCount: 1 } };
    const items = generateUpNextItems(
      baseInput({
        apfc: emptyApfc({ bookmarkedPyqIds: ['q1'], revisionQueue: dueQueue }),
        upscCse: emptyUpscCse(),
        phdResearch: emptyPhd({ microTargets: [microTarget({ id: 'overdue1', status: 'pending', targetDate: '2026-09-01' })] }),
      }),
    );
    expect(items.length).toBeGreaterThan(0);
    const workspaceOrder = items.map((i) => i.workspaceId);
    const firstUpsc = workspaceOrder.indexOf('upsc_cse');
    const firstPhd = workspaceOrder.indexOf('phd_research');
    const lastApfc = workspaceOrder.lastIndexOf('apfc');
    expect(lastApfc).toBeLessThan(firstUpsc);
    expect(firstUpsc).toBeLessThan(firstPhd);
    // priority is deterministic and matches each item's own index in the returned array.
    items.forEach((item, index) => expect(item.priority).toBe(index));
  });

  it('is deterministic: identical input always produces an identical list in the same order', () => {
    const input = baseInput({ apfc: emptyApfc({ pyqAttempts: [attempt()] }) });
    expect(generateUpNextItems(input)).toEqual(generateUpNextItems(input));
  });
});

describe('generateUpNextItems — inactive workspace data', () => {
  it('produces the identical result regardless of which workspace is "active" — the function has no notion of active/inactive, only the data it is given', () => {
    // Simulates the caller resolving one workspace's data from the LIVE store fields (as if it
    // were active) and another's from lib/store.ts's inactiveWorkspaceOwnedData archive (as if it
    // were not) — generateUpNextItems treats both identically, since it never reads the store.
    const dueQueue: RevisionQueue = { q1: { pyqId: 'q1', box: 1, dueDate: '2026-09-20', lastReviewedDate: '2026-09-10', reviewCount: 1 } };
    const asIfActive = generateUpNextItems(baseInput({ apfc: emptyApfc({ bookmarkedPyqIds: ['q1'], revisionQueue: dueQueue }) }));
    const asIfInactiveArchiveSlice = generateUpNextItems(baseInput({ apfc: emptyApfc({ bookmarkedPyqIds: ['q1'], revisionQueue: { ...dueQueue } }) }));
    expect(asIfActive).toEqual(asIfInactiveArchiveSlice);
  });

  it('never mutates any of the data it is given (no mutation merely to render the Command Centre)', () => {
    const revisionQueue: RevisionQueue = { q1: { pyqId: 'q1', box: 1, dueDate: '2026-09-20', lastReviewedDate: '2026-09-10', reviewCount: 1 } };
    const microTargets = [microTarget({ id: 'overdue1', status: 'pending', targetDate: '2026-09-01' })];
    const importedContentList = [importedContent({ id: 'doc1', contentType: 'research_document' })];
    const input = baseInput({
      apfc: emptyApfc({ bookmarkedPyqIds: ['q1'], revisionQueue }),
      phdResearch: emptyPhd({ microTargets, importedContent: importedContentList }),
    });
    const snapshotBefore = JSON.stringify(input);
    generateUpNextItems(input);
    expect(JSON.stringify(input)).toBe(snapshotBefore);
  });
});

describe('generateUpNextItems — existing actionHref preservation', () => {
  it('every item\'s actionHref is a real, already-existing route this app already serves', () => {
    const dueQueue: RevisionQueue = { q1: { pyqId: 'q1', box: 1, dueDate: '2026-09-20', lastReviewedDate: '2026-09-10', reviewCount: 1 } };
    const items = generateUpNextItems(
      baseInput({
        apfc: emptyApfc({ bookmarkedPyqIds: ['q1'], revisionQueue: dueQueue }),
        upscCse: emptyUpscCse(),
        phdResearch: emptyPhd({
          microTargets: [microTarget({ id: 'overdue1', status: 'pending', targetDate: '2026-09-01' })],
          importedContent: [
            importedContent({ id: 'doc1', contentType: 'research_document', metadata: { readingStatus: 'unread' } }),
            importedContent({ id: 'bib1', contentType: 'bibliography', metadata: { readingStatus: 'reading' } }),
          ],
        }),
      }),
    );
    const knownRoutes = [/^\/pyq-test/, /^\/upsc-syllabus/, /^\/upsc-pyq-test/, /^\/repository/, /^\/phd-plan$/, /^\/phd-research$/, /^\/phd-research\/bibliography$/];
    for (const item of items) {
      expect(knownRoutes.some((re) => re.test(item.actionHref))).toBe(true);
    }
  });
});
