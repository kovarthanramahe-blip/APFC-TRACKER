import { describe, it, expect } from 'vitest';
import { buildGroundedLlmPrompt } from './groundedPrompt';
import { decideStudyNext } from '../decisionEngine';

describe('buildGroundedLlmPrompt — Part G: phrase, never replace, the Decision Engine\'s own output', () => {
  it('returns null for "insufficient_data" — nothing grounded to phrase', () => {
    const decision = decideStudyNext({ workspace: 'apfc' });
    expect(decision.kind).toBe('insufficient_data');
    expect(buildGroundedLlmPrompt(decision)).toBeNull();
  });

  it('returns null for "no_action" — the decision\'s own honest text is already final, not something to re-phrase', () => {
    const decision = decideStudyNext({ workspace: 'upsc', upscItems: [] });
    expect(decision.kind).toBe('no_action');
    expect(buildGroundedLlmPrompt(decision)).toBeNull();
  });

  it('builds a prompt for a "recommendation" that instructs the model to never invent facts', () => {
    const decision = decideStudyNext({
      workspace: 'upsc',
      upscItems: [{ id: 'syllabus-1', kind: 'syllabus', title: 'Ancient India', description: 'Not Started.', actionLabel: 'Open Syllabus', actionHref: '/upsc-syllabus' }],
    });
    expect(decision.kind).toBe('recommendation');

    const prompt = buildGroundedLlmPrompt(decision);
    expect(prompt).not.toBeNull();
    expect(prompt!.systemInstruction).toMatch(/do not invent/i);
    expect(prompt!.systemInstruction).toMatch(/do not recommend anything other than/i);
  });

  it('the grounded facts in userContent are copied verbatim from the decision — never a different number/title', () => {
    const decision = decideStudyNext({
      workspace: 'apfc',
      apfcStudy: { sourceTool: 'apfc.study_state', dueRevisionCount: 4, weakTopicCount: 1, lowestWeakTopicAccuracyPct: 35 },
    });

    const prompt = buildGroundedLlmPrompt(decision)!;
    expect(prompt.userContent).toContain(decision.recommendation);
    expect(prompt.userContent).toContain(decision.rationale);
    expect(prompt.userContent).toContain('4 PYQs');
  });

  it('lists every real candidate, in the SAME order the Decision Engine already returned them — never re-ranked', () => {
    const decision = decideStudyNext({
      workspace: 'upsc',
      upscItems: [
        { id: 'a', kind: 'syllabus', title: 'First Topic', description: 'desc a', actionLabel: 'Open', actionHref: '/a' },
        { id: 'b', kind: 'revision', title: 'Second Topic', description: 'desc b', actionLabel: 'Open', actionHref: '/b' },
      ],
    });

    const prompt = buildGroundedLlmPrompt(decision)!;
    const indexA = prompt.userContent.indexOf('First Topic');
    const indexB = prompt.userContent.indexOf('Second Topic');
    expect(indexA).toBeGreaterThan(-1);
    expect(indexB).toBeGreaterThan(indexA);
  });

  it('is deterministic — the same decision always produces the same prompt', () => {
    const decision = decideStudyNext({ workspace: 'phd', phdResearch: { sourceTool: 'phd.research_state', overdueMicroTargetCount: 2, mostOverdueDays: 5, researchDocumentsToContinueCount: 1, bibliographyToContinueCount: 0 } });
    expect(buildGroundedLlmPrompt(decision)).toEqual(buildGroundedLlmPrompt(decision));
  });
});
