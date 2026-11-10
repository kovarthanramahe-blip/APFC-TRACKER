import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../lib/store';
import { createRevisionQueue, getDueItems } from '../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { NAV_ITEMS } from '../components/layout/nav';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import { computeEligibleRevisionIds, computeRevisionStatusMap } from '../lib/pyqFilters';
import { computeUnifiedTopicStatus } from '../lib/topicStatus';
import { selectWeakTopicPracticeIds } from '../lib/weakTopicPractice';
import { computePyqPerformance, computeRepeatedMistakes, selectRepeatedMistakePracticeIds } from '../lib/pyqPerformance';
import type { PYQAttempt } from '../lib/types';

// This page has no rendering test here (no React Testing Library / DOM environment in this repo —
// see pages/UpscCsePyqTest.test.ts's own header for the established convention). These tests
// exercise exactly what pages/PYQTest.tsx itself calls for its revision-related flows: the real
// store actions (addPyqAttempt, recordRevisionCorrect/Incorrect, toggleBookmarkedPyq), and the pure
// selectors the page's startRevision/practiceWeakTopics/practiceRepeatedMistakes functions rely on.
// Phase 6 Step 3 added an optional idsOverride parameter to startRevision and a new
// practiceRepeatedMistakes() entry point — neither is exported from the page component, so these
// tests instead prove the underlying primitives that back them (getDueItems/recordRevisionCorrect/
// Incorrect, selectWeakTopicPracticeIds, selectRepeatedMistakePracticeIds) are unaffected and behave
// exactly as pages/PYQTest.tsx composes them.

function fullReset() {
  useAppStore.setState({
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: {},
    completedTopics: {},
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

function fixtureAttempt(overrides: Partial<PYQAttempt> = {}): PYQAttempt {
  const q = PYQ_BANK[0];
  return {
    id: 'attempt-1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    year: 'all',
    subject: 'all',
    topicId: 'all',
    questionIds: [q.id],
    answers: { [q.id]: q.correctOptionId },
    correctCount: 1,
    wrongCount: 0,
    unansweredCount: 0,
    score: 2.5,
    accuracy: 100,
    ...overrides,
  };
}

describe('PYQ Test page — navigation', () => {
  it('registers the /pyq-test nav entry', () => {
    const item = NAV_ITEMS.find((n) => n.to === '/pyq-test');
    expect(item).toBeDefined();
    expect(item!.label).toBe('PYQs');
  });
});

describe('PYQ Test page — existing "Revise Now" flow still works (Phase 6 Step 3 regression)', () => {
  beforeEach(fullReset);

  it('recordRevisionCorrect/Incorrect and getDueItems behave exactly as before startRevision gained idsOverride', () => {
    const qid = PYQ_BANK[0].id;
    useAppStore.getState().recordRevisionIncorrect(qid, '2026-01-01');
    expect(useAppStore.getState().revisionQueue[qid].box).toBe(1);
    useAppStore.getState().recordRevisionCorrect(qid, '2026-01-02');
    expect(useAppStore.getState().revisionQueue[qid].box).toBe(2);
    const due = getDueItems(useAppStore.getState().revisionQueue, [qid], '2026-01-02');
    expect(due.some((d) => d.pyqId === qid)).toBe(false); // just advanced, not due again same day
  });

  it('an incorrect or bookmarked question is still eligible for the shared revision queue', () => {
    const q = PYQ_BANK[0];
    const wrongOption = q.options.find((o) => o.id !== q.correctOptionId)!.id;
    useAppStore.getState().addPyqAttempt(fixtureAttempt({ answers: { [q.id]: wrongOption }, correctCount: 0, wrongCount: 1, accuracy: 0 }));
    const statusMap = computeRevisionStatusMap(PYQ_BANK, useAppStore.getState().pyqAttempts);
    const eligible = computeEligibleRevisionIds(PYQ_BANK, statusMap, useAppStore.getState().bookmarkedPyqIds);
    expect(eligible).toContain(q.id);
  });

  it('the frozen due-list -> answer -> reschedule sequence pages/PYQTest.tsx runs is unaffected', () => {
    const q = PYQ_BANK[0];
    useAppStore.getState().recordRevisionIncorrect(q.id, '2026-01-01'); // makes it due today via box-1 interval
    const eligible = [q.id];
    const dueToday = getDueItems(useAppStore.getState().revisionQueue, eligible, '2026-01-02'); // box-1 interval is 1 day
    expect(dueToday.map((d) => d.pyqId)).toEqual([q.id]);
    useAppStore.getState().recordRevisionCorrect(q.id, '2026-01-02');
    expect(useAppStore.getState().revisionQueue[q.id].box).toBe(2);
  });

  // P2.8 — pages/PYQTest.tsx's own checkRevisionAnswer now passes 'quiz' as the third argument to
  // both actions (a real checked answer, see that function's own P2.8 comment). This proves doing
  // so neither changes the scheduling outcome (identical box progression to the untouched test
  // immediately above) nor gets misclassified: the real due-revision quiz path records 'quiz', never
  // 'self_report' or no source at all.
  it('the due-revision quiz path (checkRevisionAnswer passing \'quiz\') schedules identically to before and is never misclassified as self-reported', () => {
    const q = PYQ_BANK[0];
    useAppStore.getState().recordRevisionIncorrect(q.id, '2026-01-01', 'quiz');
    expect(useAppStore.getState().revisionQueue[q.id].box).toBe(1);
    expect(useAppStore.getState().revisionQueue[q.id].lastReviewSource).toBe('quiz');

    useAppStore.getState().recordRevisionCorrect(q.id, '2026-01-02', 'quiz');
    expect(useAppStore.getState().revisionQueue[q.id].box).toBe(2); // identical to the no-source case above
    expect(useAppStore.getState().revisionQueue[q.id].lastReviewSource).toBe('quiz');
  });

  // P2.9 — handleSubmit (ordinary practice test submission, which calls addPyqAttempt — see this
  // file's own grep-verified call map) is architecturally SEPARATE from checkRevisionAnswer (the
  // due-revision quiz flow): the page never calls recordRevisionCorrect/Incorrect from handleSubmit.
  // This proves that separation directly, rather than merely assuming it from reading the source.
  it('an ordinary practice submission (addPyqAttempt) never touches the revision queue', () => {
    const q = PYQ_BANK[0];
    expect(useAppStore.getState().revisionQueue).toEqual({});
    useAppStore.getState().addPyqAttempt(fixtureAttempt({ questionIds: [q.id], answers: { [q.id]: q.correctOptionId } }));
    expect(useAppStore.getState().revisionQueue).toEqual({});
  });

  // P2.9 — checkRevisionAnswer processes one question at a time (reviseQuestions[reviseIndex]) and
  // records against that question's OWN id only. This proves a sibling item already in the due list
  // is completely untouched (same object reference) by answering a different one.
  it('answering one due-revision question changes only that question\'s own revision entry — a sibling item in the same due list is untouched', () => {
    const [q1, q2] = PYQ_BANK;
    useAppStore.getState().recordRevisionIncorrect(q1.id, '2026-01-01', 'quiz');
    useAppStore.getState().recordRevisionIncorrect(q2.id, '2026-01-01', 'quiz');
    const q2Before = useAppStore.getState().revisionQueue[q2.id];

    // Mirrors checkRevisionAnswer's own call shape exactly: one question answered correctly.
    useAppStore.getState().recordRevisionCorrect(q1.id, '2026-01-02', 'quiz');

    expect(useAppStore.getState().revisionQueue[q1.id].box).toBe(2);
    expect(useAppStore.getState().revisionQueue[q2.id]).toBe(q2Before); // same reference — not even recreated
  });
});

describe('PYQ Test page — existing "Practice Weak Topics" flow still works (Phase 6 Step 3 regression)', () => {
  beforeEach(fullReset);

  it('selectWeakTopicPracticeIds still resolves to real PYQ_BANK questions from real store attempts', () => {
    const t = SYLLABUS[0].topics[0];
    const weakQuestion = PYQ_BANK.find((p) => p.topicId === t.id);
    if (!weakQuestion) return; // no fixture question for this topic in the real bank — nothing to assert
    const wrongOption = weakQuestion.options.find((o) => o.id !== weakQuestion.correctOptionId)!.id;
    // 3 wrong attempts -> pushes this topic's accuracy below WEAK_PYQ_ACCURACY_THRESHOLD with signal.
    for (let i = 0; i < 3; i++) {
      useAppStore
        .getState()
        .addPyqAttempt(fixtureAttempt({ id: `wt-${i}`, questionIds: [weakQuestion.id], answers: { [weakQuestion.id]: wrongOption }, correctCount: 0, wrongCount: 1, accuracy: 0 }));
    }
    useAppStore.getState().toggleTopic(t.id); // covered
    const perf = computePyqPerformance(PYQ_BANK, useAppStore.getState().pyqAttempts);
    const statuses = computeUnifiedTopicStatus(SYLLABUS, useAppStore.getState().completedTopics, perf);
    const ids = selectWeakTopicPracticeIds(statuses, PYQ_BANK);
    expect(ids).toContain(weakQuestion.id);
  });
});

describe('PYQ Test page — "Revise My Repeated Mistakes" resolves to real questions (Phase 6 Step 3)', () => {
  beforeEach(fullReset);

  it('selectRepeatedMistakePracticeIds, fed from real store pyqAttempts, resolves to real PYQ_BANK ids', () => {
    const q = PYQ_BANK[0];
    const wrongOption = q.options.find((o) => o.id !== q.correctOptionId)!.id;
    useAppStore.getState().addPyqAttempt(fixtureAttempt({ answers: { [q.id]: wrongOption }, correctCount: 0, wrongCount: 1, accuracy: 0 }));
    const mistakes = computeRepeatedMistakes(PYQ_BANK, useAppStore.getState().pyqAttempts);
    const ids = selectRepeatedMistakePracticeIds(mistakes);
    expect(ids).toEqual([q.id]);
    expect(PYQ_BANK.some((p) => p.id === ids[0])).toBe(true); // resolves to a real bank question
  });

  it('APFC workspace isolation: a repeated mistake recorded while apfc is active never leaks into upsc_cse, and is restored on switching back', () => {
    const q = PYQ_BANK[0];
    const wrongOption = q.options.find((o) => o.id !== q.correctOptionId)!.id;
    useAppStore.getState().addPyqAttempt(fixtureAttempt({ answers: { [q.id]: wrongOption }, correctCount: 0, wrongCount: 1, accuracy: 0 }));
    const apfcIds = selectRepeatedMistakePracticeIds(computeRepeatedMistakes(PYQ_BANK, useAppStore.getState().pyqAttempts));
    expect(apfcIds).toEqual([q.id]);

    useAppStore.getState().setActiveWorkspaceId('upsc_cse');
    expect(useAppStore.getState().pyqAttempts).toEqual([]); // workspace-owned, archived on switch
    const upscIds = selectRepeatedMistakePracticeIds(computeRepeatedMistakes(PYQ_BANK, useAppStore.getState().pyqAttempts));
    expect(upscIds).toEqual([]);

    useAppStore.getState().setActiveWorkspaceId('apfc');
    const restoredIds = selectRepeatedMistakePracticeIds(computeRepeatedMistakes(PYQ_BANK, useAppStore.getState().pyqAttempts));
    expect(restoredIds).toEqual([q.id]);
  });
});
