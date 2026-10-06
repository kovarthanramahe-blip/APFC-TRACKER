import { describe, it, expect } from 'vitest';
import { buildUnsupportedAnswer, isWellGroundedAnswer, type JarvisGroundedAnswer } from './groundedAnswer';

describe('buildUnsupportedAnswer — mandatory grounding rule', () => {
  it('sets unsupported: true and includes the required phrase verbatim', () => {
    const answer = buildUnsupportedAnswer('The chapter discusses taxation, not merchant capitalism.');
    expect(answer.unsupported).toBe(true);
    expect(answer.segments[0].text).toContain('The uploaded source does not establish this.');
  });

  it('preserves the given reason exactly, never silently filling in a different one', () => {
    const answer = buildUnsupportedAnswer('No section of this document addresses this question.');
    expect(answer.unsupportedReason).toBe('No section of this document addresses this question.');
  });

  it('never fabricates a citation on the unsupported segment', () => {
    const answer = buildUnsupportedAnswer('reason');
    expect(answer.segments[0].citations).toBeUndefined();
  });
});

describe('isWellGroundedAnswer', () => {
  it('accepts an unsupported answer unconditionally', () => {
    expect(isWellGroundedAnswer(buildUnsupportedAnswer('reason'))).toBe(true);
  });

  it('rejects a "source" segment with no citation at all', () => {
    const answer: JarvisGroundedAnswer = { unsupported: false, segments: [{ label: 'source', text: 'The author claims X.' }] };
    expect(isWellGroundedAnswer(answer)).toBe(false);
  });

  it('accepts a "source" segment with a well-formed citation', () => {
    const answer: JarvisGroundedAnswer = {
      unsupported: false,
      segments: [{ label: 'source', text: 'The author claims X.', citations: [{ documentId: 'doc-1', chunkId: 'chunk-1' }] }],
    };
    expect(isWellGroundedAnswer(answer)).toBe(true);
  });

  it('allows a "jarvis_analysis" segment with no citation', () => {
    const answer: JarvisGroundedAnswer = { unsupported: false, segments: [{ label: 'jarvis_analysis', text: 'Taken together, these sections suggest...' }] };
    expect(isWellGroundedAnswer(answer)).toBe(true);
  });

  it('rejects any segment carrying a malformed (empty-id) citation, regardless of label', () => {
    const answer: JarvisGroundedAnswer = {
      unsupported: false,
      segments: [{ label: 'jarvis_analysis', text: 'synthesis', citations: [{ documentId: '', chunkId: 'chunk-1' }] }],
    };
    expect(isWellGroundedAnswer(answer)).toBe(false);
  });

  it('distinguishes a web_research segment from source/jarvis_analysis', () => {
    const answer: JarvisGroundedAnswer = {
      unsupported: false,
      segments: [
        { label: 'source', text: 'The document states X.', citations: [{ documentId: 'doc-1', chunkId: 'chunk-1' }] },
        { label: 'web_research', text: 'External reporting on this topic says Y.' },
      ],
    };
    expect(answer.segments.map((s) => s.label)).toEqual(['source', 'web_research']);
    expect(isWellGroundedAnswer(answer)).toBe(true);
  });
});
