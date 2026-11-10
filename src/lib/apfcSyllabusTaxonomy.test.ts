import { describe, it, expect } from 'vitest';
import { listApfcTopicsFlat, isValidApfcTopicId, APFC_SYLLABUS_TAXONOMY_VERSION, APFC_SYLLABUS_TAXONOMY_PROVENANCE } from './apfcSyllabusTaxonomy';
import { SYLLABUS } from '../data/syllabus';
import type { SyllabusSubject } from './types';

function subjects(): SyllabusSubject[] {
  return [
    { id: 's1', title: 'Subject One', shortTitle: 'S1', colorKey: 'english', weightageHint: '', topics: [{ id: 't1', title: 'Topic One' }, { id: 't2', title: 'Topic Two' }] },
    { id: 's2', title: 'Subject Two', shortTitle: 'S2', colorKey: 'science', weightageHint: '', topics: [{ id: 't3', title: 'Topic Three' }] },
  ];
}

describe('listApfcTopicsFlat', () => {
  it('flattens every subject/topic pair with the owning subject attached', () => {
    const flat = listApfcTopicsFlat(subjects());
    expect(flat).toEqual([
      { subjectId: 's1', subjectTitle: 'Subject One', topicId: 't1', topicTitle: 'Topic One' },
      { subjectId: 's1', subjectTitle: 'Subject One', topicId: 't2', topicTitle: 'Topic Two' },
      { subjectId: 's2', subjectTitle: 'Subject Two', topicId: 't3', topicTitle: 'Topic Three' },
    ]);
  });

  it('defaults to the real, live SYLLABUS data when no argument is given', () => {
    const flat = listApfcTopicsFlat();
    const expectedCount = SYLLABUS.reduce((sum, s) => sum + s.topics.length, 0);
    expect(flat.length).toBe(expectedCount);
    expect(flat.length).toBeGreaterThan(0);
  });

  it('returns an empty array for an empty subject list, never throws', () => {
    expect(listApfcTopicsFlat([])).toEqual([]);
  });
});

describe('isValidApfcTopicId', () => {
  it('returns true for a topic id that genuinely exists', () => {
    expect(isValidApfcTopicId('t2', subjects())).toBe(true);
  });

  it('returns false for a fabricated/unknown topic id', () => {
    expect(isValidApfcTopicId('does-not-exist', subjects())).toBe(false);
  });

  it('returns false for a subject id mistakenly passed as a topic id', () => {
    expect(isValidApfcTopicId('s1', subjects())).toBe(false);
  });

  it('validates against the real, live SYLLABUS by default', () => {
    const realTopicId = SYLLABUS[0].topics[0].id;
    expect(isValidApfcTopicId(realTopicId)).toBe(true);
    expect(isValidApfcTopicId('totally-fake-id')).toBe(false);
  });
});

describe('taxonomy version/provenance', () => {
  it('exposes a stable version number and a non-empty, honest provenance note', () => {
    expect(APFC_SYLLABUS_TAXONOMY_VERSION).toBeGreaterThanOrEqual(1);
    expect(APFC_SYLLABUS_TAXONOMY_PROVENANCE.length).toBeGreaterThan(10);
  });
});
