import { describe, it, expect } from 'vitest';
import { handleJarvisRequest, resolveIntent } from './orchestrator';
import type { JarvisContext } from './types';

const baseContext: JarvisContext = {
  workspace: 'apfc',
  timestamp: '2026-10-03T00:00:00.000Z',
};

describe('resolveIntent', () => {
  it('resolves a question', () => {
    expect(resolveIntent('What topics am I weak in?')).toBe('question');
  });

  it('resolves study_next', () => {
    expect(resolveIntent('What should I study next')).toBe('study_next');
  });

  it('resolves research', () => {
    expect(resolveIntent('Add this paper to my bibliography')).toBe('research');
  });

  it('resolves diagnose', () => {
    expect(resolveIntent('The app crashed when I opened the syllabus')).toBe('diagnose');
  });

  it('resolves action', () => {
    expect(resolveIntent('Mark this topic as complete')).toBe('action');
  });

  it('returns unknown for an empty query or text matching no conservative rule', () => {
    expect(resolveIntent('   ')).toBe('unknown');
    expect(resolveIntent('purple elephants dance quietly')).toBe('unknown');
  });
});

describe('handleJarvisRequest', () => {
  it('returns a structured response for a recognised intent', () => {
    const response = handleJarvisRequest(baseContext, 'What should I study next?');

    expect(response.intent).toBe('study_next');
    expect(response.responseText.length).toBeGreaterThan(0);
    expect(response.signals).toEqual([]);
    expect(response.toolResults).toEqual([]);
  });

  it('handles an unrecognised query conservatively rather than guessing', () => {
    const response = handleJarvisRequest(baseContext, 'asdkjasldkj');

    expect(response.intent).toBe('unknown');
    expect(response.responseText).toMatch(/didn't recognise/i);
  });

  it('never executes a tool or produces a signal in this phase, for any intent', () => {
    const queries = ['What should I study next?', 'Mark this as done', 'asdkjasldkj'];
    for (const query of queries) {
      const response = handleJarvisRequest(baseContext, query);
      expect(response.toolResults).toHaveLength(0);
      expect(response.signals).toHaveLength(0);
    }
  });

  it('always reports that further processing is required, since no AI/tool layer exists yet', () => {
    expect(handleJarvisRequest(baseContext, 'What should I study next?').requiresFurtherProcessing).toBe(true);
    expect(handleJarvisRequest(baseContext, 'asdkjasldkj').requiresFurtherProcessing).toBe(true);
  });

  it('is read-only and deterministic: repeated calls with the same input never diverge', () => {
    const first = handleJarvisRequest(baseContext, 'What should I study next?');
    const second = handleJarvisRequest(baseContext, 'What should I study next?');
    expect(second).toEqual(first);
  });

  it('does not require context.query to be set — the query argument is independent', () => {
    const response = handleJarvisRequest({ ...baseContext, query: undefined }, 'Diagnose this crash');
    expect(response.intent).toBe('diagnose');
  });

  it('accepts context from any JarvisWorkspace without throwing', () => {
    for (const workspace of ['apfc', 'upsc', 'phd', 'global'] as const) {
      expect(() => handleJarvisRequest({ ...baseContext, workspace }, 'hello')).not.toThrow();
    }
  });
});
