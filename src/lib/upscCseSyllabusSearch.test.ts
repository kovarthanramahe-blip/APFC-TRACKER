import { describe, it, expect } from 'vitest';
import { matchesMicrosyllabusQuery, filterMicrosyllabusBySubject, subjectHasMicrosyllabusMatch } from './upscCseSyllabusSearch';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';

const polity = UPSC_CSE_PRELIMS_SYLLABUS.subjects.find((s) => s.title === 'Indian Polity & Governance')!;
const constitutionItem = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.subjectId === polity.id && m.title === 'Constitution')!;

describe('UPSC CSE Syllabus search — matchesMicrosyllabusQuery', () => {
  it('a blank/whitespace query matches everything', () => {
    expect(matchesMicrosyllabusQuery(constitutionItem, '')).toBe(true);
    expect(matchesMicrosyllabusQuery(constitutionItem, '   ')).toBe(true);
  });

  it('matches case-insensitively on title', () => {
    expect(matchesMicrosyllabusQuery(constitutionItem, 'constitution')).toBe(true);
    expect(matchesMicrosyllabusQuery(constitutionItem, 'CONSTITUTION')).toBe(true);
  });

  it('matches on the stored syllabus wording (description), not just the title', () => {
    expect(matchesMicrosyllabusQuery(constitutionItem, 'Governance')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesMicrosyllabusQuery(constitutionItem, 'photosynthesis')).toBe(false);
  });
});

describe('UPSC CSE Syllabus search — filterMicrosyllabusBySubject', () => {
  it('a blank query returns every item for the subject, in deterministic order', () => {
    const items = filterMicrosyllabusBySubject(UPSC_CSE_PRELIMS_SYLLABUS, polity.id, '');
    expect(items.map((i) => i.title)).toEqual(['Constitution', 'Political System', 'Panchayati Raj', 'Public Policy', 'Rights Issues']);
  });

  it('a query narrows to only matching items', () => {
    const items = filterMicrosyllabusBySubject(UPSC_CSE_PRELIMS_SYLLABUS, polity.id, 'panchayati');
    expect(items.map((i) => i.title)).toEqual(['Panchayati Raj']);
  });

  it('a query with no matches returns an empty array, never throws', () => {
    expect(filterMicrosyllabusBySubject(UPSC_CSE_PRELIMS_SYLLABUS, polity.id, 'zzz-no-such-topic')).toEqual([]);
  });
});

describe('UPSC CSE Syllabus search — subjectHasMicrosyllabusMatch', () => {
  it('is always true for a blank query', () => {
    expect(subjectHasMicrosyllabusMatch(UPSC_CSE_PRELIMS_SYLLABUS, polity.id, '')).toBe(true);
  });

  it('is true when at least one item matches', () => {
    expect(subjectHasMicrosyllabusMatch(UPSC_CSE_PRELIMS_SYLLABUS, polity.id, 'rights')).toBe(true);
  });

  it('is false when nothing in the subject matches', () => {
    expect(subjectHasMicrosyllabusMatch(UPSC_CSE_PRELIMS_SYLLABUS, polity.id, 'photosynthesis')).toBe(false);
  });

  it('works identically against the Mains tree', () => {
    const ethics = UPSC_CSE_MAINS_SYLLABUS.subjects.find((s) => s.title === 'Ethics, Integrity & Aptitude')!;
    expect(subjectHasMicrosyllabusMatch(UPSC_CSE_MAINS_SYLLABUS, ethics.id, 'case studies')).toBe(true);
    expect(subjectHasMicrosyllabusMatch(UPSC_CSE_MAINS_SYLLABUS, ethics.id, 'photosynthesis')).toBe(false);
  });
});
