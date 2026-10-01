import { describe, it, expect } from 'vitest';
import { resolveApfcTopicPath } from './apfcSyllabus';
import { SYLLABUS } from '../data/syllabus';

describe('resolveApfcTopicPath', () => {
  it('resolves a real topic id to its owning subject', () => {
    const subject = SYLLABUS[0];
    const topic = subject.topics[0];
    const resolved = resolveApfcTopicPath(topic.id);
    expect(resolved).toBeDefined();
    expect(resolved?.subject.id).toBe(subject.id);
    expect(resolved?.topic.id).toBe(topic.id);
    expect(resolved?.topic.title).toBe(topic.title);
  });

  it('resolves topics across more than one subject correctly (never returns the first subject by accident)', () => {
    const lastSubject = SYLLABUS[SYLLABUS.length - 1];
    const topic = lastSubject.topics[0];
    const resolved = resolveApfcTopicPath(topic.id);
    expect(resolved?.subject.id).toBe(lastSubject.id);
  });

  it('returns undefined for an unknown/stale id, never throwing', () => {
    expect(() => resolveApfcTopicPath('not-a-real-topic-id')).not.toThrow();
    expect(resolveApfcTopicPath('not-a-real-topic-id')).toBeUndefined();
  });
});
