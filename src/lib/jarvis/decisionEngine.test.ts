import { describe, it, expect } from 'vitest';
import { decideStudyNext, type DecideStudyNextInput, type JarvisDecisionCandidate } from './decisionEngine';
import type { JarvisApfcStudySection, JarvisPhdResearchSection } from './contextEngine';

// JARVIS Phase 12 — Decision & Recommendation Engine tests.
//
// Fixtures use the REAL shapes these candidates/sections already have (UpscStudyStateItem's own
// id/kind/title/description/actionLabel/actionHref; contextEngine.ts's own JarvisApfcStudySection/
// JarvisPhdResearchSection) — never an invented parallel shape. decideStudyNext is a pure function
// (no registry, no tool run, no network, no browser global), so these tests call it directly.

function upscItem(overrides: Partial<{ id: string; kind: string; title: string; description: string; actionLabel: string; actionHref: string }> = {}) {
  return {
    id: 'syllabus-anc-1',
    kind: 'syllabus',
    title: 'Ancient India',
    description: 'Prelims microsyllabus — currently marked "Not Started".',
    actionLabel: 'Open Syllabus',
    actionHref: '/upsc-syllabus?microsyllabusId=anc-1',
    ...overrides,
  };
}

const WORKSPACE_UPSC: DecideStudyNextInput['workspace'] = 'upsc';
const WORKSPACE_APFC: DecideStudyNextInput['workspace'] = 'apfc';
const WORKSPACE_PHD: DecideStudyNextInput['workspace'] = 'phd';

describe('decideStudyNext — item-level candidates (upsc.study_state)', () => {
  it('1. selects a valid actionable study item as selectedCandidate', () => {
    const items = [upscItem()];
    const result = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: items });

    expect(result.kind).toBe('recommendation');
    expect(result.selectedCandidate).toBeDefined();
    expect(result.selectedCandidate!.id).toBe('syllabus-anc-1');
    expect(result.selectedCandidate!.title).toBe('Ancient India');
  });

  it('2. prioritises the existing engine\'s own "due today" items (revision/current_affairs_revision kinds) in the order it already returned them — never re-sorted', () => {
    // generateTodaysStudyItems' own fixed order places 'syllabus' before 'revision' — this engine
    // never reorders that; the test proves the FIRST array element wins regardless of kind.
    const items = [upscItem({ id: 'syllabus-1', kind: 'syllabus', title: 'Polity Basics' }), upscItem({ id: 'revision-due', kind: 'revision', title: '3 questions due for revision' })];
    const result = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: items });

    expect(result.selectedCandidate!.id).toBe('syllabus-1');
    expect(result.rationale).toContain('not started');
  });

  it('3. never fabricates or reads an "explicit priority" field that does not exist on the real candidate shape — selection still falls through to the existing ordering signal only', () => {
    const items = [upscItem({ id: 'a', title: 'First' }), upscItem({ id: 'b', title: 'Second' })];
    const result = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: items });

    // No `priority` field exists anywhere on JarvisDecisionCandidate or the input shape — selection
    // is driven purely by array position, proving no invented priority signal was consulted.
    expect(Object.keys(result.selectedCandidate as object)).not.toContain('priority');
    expect(result.selectedCandidate!.id).toBe('a');
  });

  it('4. handles incomplete/not-started state correctly — a "syllabus" kind item\'s rationale cites that it is not started/learning, verbatim from the existing kind, never invented', () => {
    const items = [upscItem({ kind: 'syllabus', title: 'Modern History' })];
    const result = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: items });

    expect(result.rationale).toContain('not started or still being learned');
  });

  it('5. produces deterministic results — the same input always returns the same recommendation', () => {
    const items = [upscItem({ id: 'x', title: 'Economy Basics' }), upscItem({ id: 'y', kind: 'revision', title: '2 questions due' })];
    const input: DecideStudyNextInput = { workspace: WORKSPACE_UPSC, upscItems: items };

    const first = decideStudyNext(input);
    const second = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: [...items] });

    expect(second).toEqual(first);
  });

  it('6. preserves candidate ordering deterministically — candidates[] matches the input array order exactly, never re-sorted', () => {
    const items = [upscItem({ id: 'first', title: 'A' }), upscItem({ id: 'second', kind: 'revision', title: 'B' }), upscItem({ id: 'third', kind: 'weak_area', title: 'C' })];
    const result = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: items });

    expect(result.candidates.map((c) => c.id)).toEqual(['first', 'second', 'third']);
  });

  it('7. returns "no_action" (truthful, never fabricated) when upscItems is an empty array — the tool ran and genuinely found nothing', () => {
    const result = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: [] });

    expect(result.kind).toBe('no_action');
    expect(result.selectedCandidate).toBeUndefined();
    expect(result.candidates).toEqual([]);
    expect(result.recommendation).not.toContain('undefined');
  });

  it('9. preserves provenance — records upsc.study_state as the source tool', () => {
    const result = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: [upscItem()] });
    expect(result.provenance.sourceTools).toEqual(['upsc.study_state']);
  });

  it('candidate fields are copied verbatim from the real UpscStudyStateItem shape — never recomputed', () => {
    const item = upscItem({ id: 'weak-geo-1', kind: 'weak_area', title: 'Weak area: Geography', description: '1/5 correct so far (20% accuracy).', actionLabel: 'Practice This Area', actionHref: '/upsc-pyq-test?microsyllabusId=geo-1' });
    const result = decideStudyNext({ workspace: WORKSPACE_UPSC, upscItems: [item] });
    const candidate: JarvisDecisionCandidate = result.selectedCandidate!;

    expect(candidate).toEqual({
      id: 'weak-geo-1',
      kind: 'weak_area',
      title: 'Weak area: Geography',
      description: '1/5 correct so far (20% accuracy).',
      actionLabel: 'Practice This Area',
      actionHref: '/upsc-pyq-test?microsyllabusId=geo-1',
      sourceTool: 'upsc.study_state',
    });
  });
});

describe('decideStudyNext — count-only workspaces (apfc.study_state, phd.research_state)', () => {
  it('8a. returns a truthful count-only recommendation for apfc, never fabricating a specific PYQ/topic name', () => {
    const apfcStudy: JarvisApfcStudySection = { sourceTool: 'apfc.study_state', dueRevisionCount: 4, weakTopicCount: 1, lowestWeakTopicAccuracyPct: 35 };
    const result = decideStudyNext({ workspace: WORKSPACE_APFC, apfcStudy });

    expect(result.kind).toBe('recommendation');
    expect(result.selectedCandidate).toBeUndefined();
    expect(result.candidates).toEqual([]);
    expect(result.recommendation).toContain('4 PYQs due for revision');
    expect(result.recommendation).toContain('1 weak topic');
    expect(result.provenance.sourceTools).toEqual(['apfc.study_state']);
  });

  it('returns "no_action" for apfc when every count is genuinely zero', () => {
    const apfcStudy: JarvisApfcStudySection = { sourceTool: 'apfc.study_state', dueRevisionCount: 0, weakTopicCount: 0, lowestWeakTopicAccuracyPct: null };
    const result = decideStudyNext({ workspace: WORKSPACE_APFC, apfcStudy });

    expect(result.kind).toBe('no_action');
  });

  it('8b. returns a truthful count-only recommendation for phd, citing mostOverdueDays only when it is actually known', () => {
    const phdResearch: JarvisPhdResearchSection = {
      sourceTool: 'phd.research_state',
      overdueMicroTargetCount: 2,
      mostOverdueDays: 10,
      researchDocumentsToContinueCount: 1,
      bibliographyToContinueCount: 0,
    };
    const result = decideStudyNext({ workspace: WORKSPACE_PHD, phdResearch });

    expect(result.kind).toBe('recommendation');
    expect(result.selectedCandidate).toBeUndefined();
    expect(result.recommendation).toContain('2 overdue micro-targets');
    expect(result.recommendation).toContain('10 days overdue');
    expect(result.provenance.sourceTools).toEqual(['phd.research_state']);
  });

  it('never fabricates an overdue-days figure when mostOverdueDays is null', () => {
    const phdResearch: JarvisPhdResearchSection = {
      sourceTool: 'phd.research_state',
      overdueMicroTargetCount: 1,
      mostOverdueDays: null,
      researchDocumentsToContinueCount: 0,
      bibliographyToContinueCount: 0,
    };
    const result = decideStudyNext({ workspace: WORKSPACE_PHD, phdResearch });

    expect(result.recommendation).not.toContain('null');
    expect(result.recommendation).not.toMatch(/\bdays? overdue\)/);
  });

  it('returns "no_action" for phd when every count is genuinely zero', () => {
    const phdResearch: JarvisPhdResearchSection = { sourceTool: 'phd.research_state', overdueMicroTargetCount: 0, mostOverdueDays: null, researchDocumentsToContinueCount: 0, bibliographyToContinueCount: 0 };
    const result = decideStudyNext({ workspace: WORKSPACE_PHD, phdResearch });

    expect(result.kind).toBe('no_action');
  });
});

describe('decideStudyNext — insufficient data', () => {
  it('8c. returns "insufficient_data" rather than fabricating a recommendation when nothing is grounded at all', () => {
    const result = decideStudyNext({ workspace: WORKSPACE_APFC });

    expect(result.kind).toBe('insufficient_data');
    expect(result.recommendation).toBe('');
    expect(result.selectedCandidate).toBeUndefined();
    expect(result.candidates).toEqual([]);
    expect(result.provenance.sourceTools).toEqual([]);
  });
});
