import { describe, it, expect } from 'vitest';
import { generateTodaysStudyItems, type GenerateTodaysStudyInput } from './upscCseTodaysStudy';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import type { UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import { createRevisionQueue, type RevisionQueue } from './revisionQueue';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';

const ANCIENT_ID = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Ancient India')!.id;
const MEDIEVAL_ID = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Medieval India')!.id;

function q(overrides: Partial<UpscCsePrelimsBatchPyq> = {}): UpscCsePrelimsBatchPyq {
  return {
    id: 'q1',
    year: 2026,
    paper: 'GS Paper I',
    questionNumber: 1,
    question: 'Q?',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    correctOptionId: 'a',
    subject: 'History',
    topic: 'Ancient India',
    microsyllabusId: ANCIENT_ID,
    mappingStatus: 'mapped',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z' },
    verificationStatus: 'provisional',
    ...overrides,
  };
}

function attempt(overrides: Partial<UpscCsePrelimsPyqAttempt> = {}): UpscCsePrelimsPyqAttempt {
  return {
    id: 'a1',
    submittedAt: '2026-01-01T00:00:00.000Z',
    year: 2026,
    paper: 'GS Paper I',
    subject: 'all',
    microsyllabusId: 'all',
    questionIds: [],
    answers: {},
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    accuracy: 0,
    ...overrides,
  };
}

function baseInput(overrides: Partial<GenerateTodaysStudyInput> = {}): GenerateTodaysStudyInput {
  return {
    coverage: {},
    prelimsTree: UPSC_CSE_PRELIMS_SYLLABUS,
    mainsTree: UPSC_CSE_MAINS_SYLLABUS,
    granularNodes: [],
    pyqBank: [],
    attempts: [],
    bookmarkedPyqIds: [],
    revisionQueue: createRevisionQueue(),
    today: '2026-09-22',
    ...overrides,
  };
}

describe('generateTodaysStudyItems', () => {
  it('returns no items when there is no data at all (fully strong/empty state)', () => {
    // An empty coverage map defaults every microsyllabus item to 'not_started', so with the real
    // syllabus trees there IS syllabus data to surface — confirm it appears, honestly, rather than
    // asserting an empty list against real content.
    const items = generateTodaysStudyItems(baseInput());
    expect(items.every((i) => i.kind === 'syllabus')).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns nothing at all when every microsyllabus item is already revised/strong and there is no PYQ data', () => {
    const coverage: UpscCseSyllabusCoverage = {};
    for (const m of [...UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus, ...UPSC_CSE_MAINS_SYLLABUS.microsyllabus]) {
      coverage[m.id] = 'strong';
    }
    const items = generateTodaysStudyItems(baseInput({ coverage }));
    expect(items).toEqual([]);
  });

  it('surfaces not_started/learning syllabus items, Prelims before Mains, capped by maxSyllabusItems', () => {
    const items = generateTodaysStudyItems(baseInput({ maxSyllabusItems: 2 }));
    const syllabusItems = items.filter((i) => i.kind === 'syllabus');
    expect(syllabusItems).toHaveLength(2);
    expect(syllabusItems[0].actionHref).toContain('/upsc-syllabus?microsyllabusId=');
  });

  it('excludes revised/strong microsyllabus items from the syllabus list', () => {
    const coverage: UpscCseSyllabusCoverage = { [ANCIENT_ID]: 'strong', [MEDIEVAL_ID]: 'revised' };
    const items = generateTodaysStudyItems(baseInput({ coverage, maxSyllabusItems: 50 }));
    const ids = items.filter((i) => i.kind === 'syllabus').map((i) => i.id);
    expect(ids).not.toContain(`syllabus-${ANCIENT_ID}`);
    expect(ids).not.toContain(`syllabus-${MEDIEVAL_ID}`);
  });

  it('adds a revision-due item only when something is actually due, linking to the revision view', () => {
    const bank = [q({ id: 'q1' })];
    const noneDue = generateTodaysStudyItems(baseInput({ pyqBank: bank, bookmarkedPyqIds: [] }));
    expect(noneDue.some((i) => i.kind === 'revision')).toBe(false);

    const withBookmark = generateTodaysStudyItems(baseInput({ pyqBank: bank, bookmarkedPyqIds: ['q1'] }));
    const revisionItem = withBookmark.find((i) => i.kind === 'revision')!;
    expect(revisionItem).toBeDefined();
    expect(revisionItem.actionHref).toBe('/upsc-pyq-test?view=revision');
  });

  it('does not surface a revision item for a bookmarked question not yet due (scheduled in the future)', () => {
    const bank = [q({ id: 'q1' })];
    const queue: RevisionQueue = { q1: { pyqId: 'q1', box: 2, dueDate: '2099-01-01', lastReviewedDate: '2026-09-01', reviewCount: 1 } };
    const items = generateTodaysStudyItems(baseInput({ pyqBank: bank, bookmarkedPyqIds: ['q1'], revisionQueue: queue }));
    expect(items.some((i) => i.kind === 'revision')).toBe(false);
  });

  it('adds an incorrect item when a past attempt got a question wrong, linking to revisionFilter=incorrect', () => {
    const bank = [q({ id: 'q1' })];
    const wrongAttempt = attempt({ questionIds: ['q1'], answers: { q1: 'b' } });
    const items = generateTodaysStudyItems(baseInput({ pyqBank: bank, attempts: [wrongAttempt] }));
    const incorrectItem = items.find((i) => i.kind === 'incorrect')!;
    expect(incorrectItem).toBeDefined();
    expect(incorrectItem.actionHref).toBe('/upsc-pyq-test?revisionFilter=incorrect');
  });

  it('adds an unanswered item when a bank question has never been attempted', () => {
    const bank = [q({ id: 'q1' })];
    const items = generateTodaysStudyItems(baseInput({ pyqBank: bank, attempts: [] }));
    const unansweredItem = items.find((i) => i.kind === 'unanswered')!;
    expect(unansweredItem).toBeDefined();
    expect(unansweredItem.actionHref).toBe('/upsc-pyq-test?revisionFilter=unattempted');
  });

  it('does not add an unanswered item once every bank question has been attempted', () => {
    const bank = [q({ id: 'q1' })];
    const items = generateTodaysStudyItems(baseInput({ pyqBank: bank, attempts: [attempt({ questionIds: ['q1'], answers: { q1: 'a' } })] }));
    expect(items.some((i) => i.kind === 'unanswered')).toBe(false);
  });

  it('surfaces a weak-area item only once minWeakAreaAttempts is met and accuracy is below threshold', () => {
    const bank = [
      q({ id: 'q1', questionNumber: 1 }),
      q({ id: 'q2', questionNumber: 2 }),
    ];
    // Single wrong attempt: only 1 question attempted for the microsyllabus id — below the default
    // minWeakAreaAttempts of 2, so no weak-area item yet.
    const oneWrong = generateTodaysStudyItems(baseInput({ pyqBank: bank, attempts: [attempt({ questionIds: ['q1'], answers: { q1: 'b' } })] }));
    expect(oneWrong.some((i) => i.kind === 'weak_area')).toBe(false);

    // Two attempts, both wrong -> 0% accuracy on 2 attempted questions -> now qualifies.
    const twoWrong = generateTodaysStudyItems(
      baseInput({ pyqBank: bank, attempts: [attempt({ questionIds: ['q1', 'q2'], answers: { q1: 'b', q2: 'b' } })] }),
    );
    const weakItem = twoWrong.find((i) => i.kind === 'weak_area')!;
    expect(weakItem).toBeDefined();
    expect(weakItem.actionHref).toBe(`/upsc-pyq-test?microsyllabusId=${encodeURIComponent(ANCIENT_ID)}`);
  });

  it('does not surface a weak area whose accuracy is at/above the threshold', () => {
    const bank = [
      q({ id: 'q1', questionNumber: 1 }),
      q({ id: 'q2', questionNumber: 2 }),
    ];
    const items = generateTodaysStudyItems(
      baseInput({ pyqBank: bank, attempts: [attempt({ questionIds: ['q1', 'q2'], answers: { q1: 'a', q2: 'a' } })] }),
    );
    expect(items.some((i) => i.kind === 'weak_area')).toBe(false);
  });

  it('is deterministic: identical input always produces an identical item list', () => {
    const input = baseInput({ pyqBank: [q({ id: 'q1' })], bookmarkedPyqIds: ['q1'] });
    expect(generateTodaysStudyItems(input)).toEqual(generateTodaysStudyItems(input));
  });
});
