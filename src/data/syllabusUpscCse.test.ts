import { describe, it, expect } from 'vitest';
import { UPSC_CSE_SYLLABUS } from './syllabusUpscCse';
import { SYLLABUS } from './syllabus';

const VALID_COLOR_KEYS = [
  'english',
  'freedomStruggle',
  'currentAffairs',
  'science',
  'polity',
  'economy',
  'historyCulture',
  'accounting',
  'labourLaw',
  'computer',
  'quant',
  'reasoning',
  'labourMovement',
];

describe('UPSC_CSE_SYLLABUS — Stage 3B-1 structural foundation', () => {
  it('has exactly the 8 top-level areas specified for this stage', () => {
    expect(UPSC_CSE_SYLLABUS.map((s) => s.shortTitle)).toEqual([
      'GS Paper I',
      'GS Paper II',
      'GS Paper III',
      'GS Paper IV',
      'Essay',
      'CSAT',
      'Optional',
      'Current Affairs',
    ]);
  });

  it('GS Paper I covers Indian Heritage & Culture, History, Geography, Society', () => {
    const gs1 = UPSC_CSE_SYLLABUS.find((s) => s.shortTitle === 'GS Paper I')!;
    expect(gs1.topics.map((t) => t.title)).toEqual(['Indian Heritage & Culture', 'History', 'Geography', 'Society']);
  });

  it('GS Paper II covers Constitution & Polity, Governance, Social Justice, International Relations', () => {
    const gs2 = UPSC_CSE_SYLLABUS.find((s) => s.shortTitle === 'GS Paper II')!;
    expect(gs2.topics.map((t) => t.title)).toEqual(['Constitution & Polity', 'Governance', 'Social Justice', 'International Relations']);
  });

  it('GS Paper III covers Economy, Agriculture, Science & Technology, Environment & Ecology, Internal Security, Disaster Management', () => {
    const gs3 = UPSC_CSE_SYLLABUS.find((s) => s.shortTitle === 'GS Paper III')!;
    expect(gs3.topics.map((t) => t.title)).toEqual([
      'Economy',
      'Agriculture',
      'Science & Technology',
      'Environment & Ecology',
      'Internal Security',
      'Disaster Management',
    ]);
  });

  it('GS Paper IV, Essay and CSAT are each a single, clearly-marked placeholder topic (no invented subtopics)', () => {
    for (const shortTitle of ['GS Paper IV', 'Essay', 'CSAT']) {
      const subj = UPSC_CSE_SYLLABUS.find((s) => s.shortTitle === shortTitle)!;
      expect(subj.topics).toHaveLength(1);
      expect(subj.topics[0].notes).toBeTruthy();
    }
  });

  it('Optional Subject is a clean placeholder — no optional subjects are populated yet', () => {
    const optional = UPSC_CSE_SYLLABUS.find((s) => s.shortTitle === 'Optional')!;
    expect(optional.topics).toHaveLength(1);
    expect(optional.topics[0].notes?.toLowerCase()).toContain('no optional subjects are populated');
  });

  it('Current Affairs is a single cross-cutting area, not a fixed topic list', () => {
    const ca = UPSC_CSE_SYLLABUS.find((s) => s.shortTitle === 'Current Affairs')!;
    expect(ca.topics).toHaveLength(1);
    expect(ca.topics[0].notes?.toLowerCase()).toContain('cross-cutting');
  });

  it('every subject has a valid, existing SubjectColorKey (reuses the existing type/utility, does not invent a new one)', () => {
    for (const subj of UPSC_CSE_SYLLABUS) {
      expect(VALID_COLOR_KEYS).toContain(subj.colorKey);
    }
  });

  it('every subject and topic id is unique within UPSC_CSE_SYLLABUS', () => {
    const subjectIds = UPSC_CSE_SYLLABUS.map((s) => s.id);
    expect(new Set(subjectIds).size).toBe(subjectIds.length);
    const topicIds = UPSC_CSE_SYLLABUS.flatMap((s) => s.topics.map((t) => t.id));
    expect(new Set(topicIds).size).toBe(topicIds.length);
  });

  it('no subject or topic id collides with APFC\'s own SYLLABUS ids', () => {
    const apfcSubjectIds = new Set(SYLLABUS.map((s) => s.id));
    const apfcTopicIds = new Set(SYLLABUS.flatMap((s) => s.topics.map((t) => t.id)));
    for (const subj of UPSC_CSE_SYLLABUS) {
      expect(apfcSubjectIds.has(subj.id)).toBe(false);
      for (const topic of subj.topics) {
        expect(apfcTopicIds.has(topic.id)).toBe(false);
      }
    }
  });

  it('every subject has a non-empty title, shortTitle and weightageHint, and at least one topic', () => {
    for (const subj of UPSC_CSE_SYLLABUS) {
      expect(subj.title.length).toBeGreaterThan(0);
      expect(subj.shortTitle.length).toBeGreaterThan(0);
      expect(subj.weightageHint.length).toBeGreaterThan(0);
      expect(subj.topics.length).toBeGreaterThan(0);
      for (const topic of subj.topics) {
        expect(topic.title.length).toBeGreaterThan(0);
      }
    }
  });
});
