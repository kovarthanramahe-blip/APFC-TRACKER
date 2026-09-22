import { describe, it, expect } from 'vitest';
import {
  getPapersForStage,
  getSubjectsForPaper,
  getMicrosyllabusForSubject,
  getPaperById,
  getSubjectById,
  getMicrosyllabusItemById,
  resolveMicrosyllabusPath,
  validateUpscCseSyllabusTree,
  type UpscCseSyllabusTree,
} from './upscCseSyllabus';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { UPSC_CSE_SYLLABUS } from '../data/syllabusUpscCse';
import { UPSC_CSE_PYQ_BANK } from '../data/pyqUpscCse';
import { getSyllabusForWorkspace, getPyqBankForWorkspace } from '../data/registry';

const TREES: { name: string; tree: UpscCseSyllabusTree }[] = [
  { name: 'Prelims', tree: UPSC_CSE_PRELIMS_SYLLABUS },
  { name: 'Mains', tree: UPSC_CSE_MAINS_SYLLABUS },
];

describe('UPSC CSE Syllabus Foundation — structural validity', () => {
  for (const { name, tree } of TREES) {
    it(`${name}: validateUpscCseSyllabusTree reports zero issues`, () => {
      expect(validateUpscCseSyllabusTree(tree)).toEqual([]);
    });

    it(`${name}: every node's own \`stage\` field matches the tree's stage`, () => {
      expect(tree.papers.every((p) => p.stage === tree.stage)).toBe(true);
      expect(tree.subjects.every((s) => s.stage === tree.stage)).toBe(true);
      expect(tree.microsyllabus.every((m) => m.stage === tree.stage)).toBe(true);
    });
  }

  it('Prelims tree is stage "prelims" and Mains tree is stage "mains"', () => {
    expect(UPSC_CSE_PRELIMS_SYLLABUS.stage).toBe('prelims');
    expect(UPSC_CSE_MAINS_SYLLABUS.stage).toBe('mains');
  });
});

describe('UPSC CSE Syllabus Foundation — unique IDs', () => {
  for (const { name, tree } of TREES) {
    it(`${name}: paper ids are unique`, () => {
      const ids = tree.papers.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it(`${name}: subject ids are unique`, () => {
      const ids = tree.subjects.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it(`${name}: microsyllabus ids are unique`, () => {
      const ids = tree.microsyllabus.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
});

describe('UPSC CSE Syllabus Foundation — Prelims/Mains separation', () => {
  it('no paper id appears in both trees', () => {
    const prelimsIds = new Set(UPSC_CSE_PRELIMS_SYLLABUS.papers.map((p) => p.id));
    const overlap = UPSC_CSE_MAINS_SYLLABUS.papers.filter((p) => prelimsIds.has(p.id));
    expect(overlap).toEqual([]);
  });

  it('no subject id appears in both trees', () => {
    const prelimsIds = new Set(UPSC_CSE_PRELIMS_SYLLABUS.subjects.map((s) => s.id));
    const overlap = UPSC_CSE_MAINS_SYLLABUS.subjects.filter((s) => prelimsIds.has(s.id));
    expect(overlap).toEqual([]);
  });

  it('no microsyllabus id appears in both trees', () => {
    const prelimsIds = new Set(UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.map((m) => m.id));
    const overlap = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.filter((m) => prelimsIds.has(m.id));
    expect(overlap).toEqual([]);
  });

  it('subject names may coincide (e.g. "History") but the underlying ids and content differ', () => {
    const prelimsHistory = UPSC_CSE_PRELIMS_SYLLABUS.subjects.find((s) => s.title === 'History');
    const mainsHistory = UPSC_CSE_MAINS_SYLLABUS.subjects.find((s) => s.title === 'History');
    expect(prelimsHistory).toBeDefined();
    expect(mainsHistory).toBeDefined();
    expect(prelimsHistory!.id).not.toBe(mainsHistory!.id);
    const prelimsHistoryItems = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.filter((m) => m.subjectId === prelimsHistory!.id).map((m) => m.title);
    const mainsHistoryItems = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.filter((m) => m.subjectId === mainsHistory!.id).map((m) => m.title);
    expect(prelimsHistoryItems).not.toEqual(mainsHistoryItems);
  });
});

describe('UPSC CSE Syllabus Foundation — valid parent relationships / no orphan nodes', () => {
  for (const { name, tree } of TREES) {
    it(`${name}: every subject references a paperId that exists in this tree`, () => {
      const paperIds = new Set(tree.papers.map((p) => p.id));
      expect(tree.subjects.every((s) => paperIds.has(s.paperId))).toBe(true);
    });

    it(`${name}: every microsyllabus item's parentId equals its subjectId, and both resolve`, () => {
      const subjectIds = new Set(tree.subjects.map((s) => s.id));
      for (const item of tree.microsyllabus) {
        expect(item.parentId).toBe(item.subjectId);
        expect(subjectIds.has(item.subjectId)).toBe(true);
      }
    });

    it(`${name}: every microsyllabus item's paperId matches its subject's own paperId`, () => {
      const subjectById = new Map(tree.subjects.map((s) => [s.id, s]));
      for (const item of tree.microsyllabus) {
        const subject = subjectById.get(item.subjectId)!;
        expect(item.paperId).toBe(subject.paperId);
      }
    });

    it(`${name}: no orphan microsyllabus nodes — every subject with items is reachable from a paper`, () => {
      const paperIds = new Set(tree.papers.map((p) => p.id));
      for (const item of tree.microsyllabus) {
        expect(paperIds.has(item.paperId)).toBe(true);
      }
    });

    it(`${name}: every subject has at least one microsyllabus item`, () => {
      for (const subject of tree.subjects) {
        const items = tree.microsyllabus.filter((m) => m.subjectId === subject.id);
        expect(items.length).toBeGreaterThan(0);
      }
    });

    it(`${name}: every paper has at least one subject`, () => {
      for (const paper of tree.papers) {
        const subjects = tree.subjects.filter((s) => s.paperId === paper.id);
        expect(subjects.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('UPSC CSE Syllabus Foundation — valid stage/paper references via resolvers', () => {
  for (const { name, tree } of TREES) {
    it(`${name}: getPapersForStage returns only papers matching this tree's stage`, () => {
      const papers = getPapersForStage(tree);
      expect(papers.every((p) => p.stage === tree.stage)).toBe(true);
      expect(papers.length).toBe(tree.papers.length);
    });

    it(`${name}: getSubjectsForPaper / getMicrosyllabusForSubject resolve consistently for every node`, () => {
      for (const paper of tree.papers) {
        const subjects = getSubjectsForPaper(tree, paper.id);
        expect(subjects.every((s) => s.paperId === paper.id)).toBe(true);
        for (const subject of subjects) {
          const items = getMicrosyllabusForSubject(tree, subject.id);
          expect(items.every((m) => m.subjectId === subject.id)).toBe(true);
        }
      }
    });

    it(`${name}: getPaperById/getSubjectById/getMicrosyllabusItemById find every real node and reject unknown ids`, () => {
      for (const paper of tree.papers) expect(getPaperById(tree, paper.id)?.id).toBe(paper.id);
      for (const subject of tree.subjects) expect(getSubjectById(tree, subject.id)?.id).toBe(subject.id);
      for (const item of tree.microsyllabus) expect(getMicrosyllabusItemById(tree, item.id)?.id).toBe(item.id);
      expect(getPaperById(tree, 'does-not-exist')).toBeUndefined();
      expect(getSubjectById(tree, 'does-not-exist')).toBeUndefined();
      expect(getMicrosyllabusItemById(tree, 'does-not-exist')).toBeUndefined();
    });

    it(`${name}: resolveMicrosyllabusPath returns a full, internally-consistent ancestor path for every real item`, () => {
      for (const item of tree.microsyllabus) {
        const path = resolveMicrosyllabusPath(tree, item.id);
        expect(path).toBeDefined();
        expect(path!.item.id).toBe(item.id);
        expect(path!.subject.id).toBe(item.subjectId);
        expect(path!.paper.id).toBe(item.paperId);
      }
      expect(resolveMicrosyllabusPath(tree, 'does-not-exist')).toBeUndefined();
    });
  }
});

describe('UPSC CSE Syllabus Foundation — deterministic ordering', () => {
  for (const { name, tree } of TREES) {
    it(`${name}: getPapersForStage sorts by order regardless of input array order`, () => {
      const shuffled: UpscCseSyllabusTree = { ...tree, papers: [...tree.papers].reverse() };
      const result = getPapersForStage(shuffled);
      for (let i = 1; i < result.length; i++) expect(result[i].order).toBeGreaterThan(result[i - 1].order);
    });

    it(`${name}: getSubjectsForPaper sorts by order regardless of input array order`, () => {
      const shuffled: UpscCseSyllabusTree = { ...tree, subjects: [...tree.subjects].reverse() };
      for (const paper of tree.papers) {
        const result = getSubjectsForPaper(shuffled, paper.id);
        for (let i = 1; i < result.length; i++) expect(result[i].order).toBeGreaterThan(result[i - 1].order);
      }
    });

    it(`${name}: getMicrosyllabusForSubject sorts by order regardless of input array order`, () => {
      const shuffled: UpscCseSyllabusTree = { ...tree, microsyllabus: [...tree.microsyllabus].reverse() };
      for (const subject of tree.subjects) {
        const result = getMicrosyllabusForSubject(shuffled, subject.id);
        for (let i = 1; i < result.length; i++) expect(result[i].order).toBeGreaterThan(result[i - 1].order);
      }
    });

    it(`${name}: order values are unique within each level (papers, subjects, microsyllabus)`, () => {
      expect(new Set(tree.papers.map((p) => p.order)).size).toBe(tree.papers.length);
      expect(new Set(tree.subjects.map((s) => s.order)).size).toBe(tree.subjects.length);
      expect(new Set(tree.microsyllabus.map((m) => m.order)).size).toBe(tree.microsyllabus.length);
    });
  }
});

describe('UPSC CSE Syllabus Foundation — required Prelims coverage', () => {
  it('GS Paper I and CSAT / GS Paper II both exist', () => {
    const titles = UPSC_CSE_PRELIMS_SYLLABUS.papers.map((p) => p.title);
    expect(titles).toContain('General Studies Paper I');
    expect(titles).toContain('CSAT / General Studies Paper II');
  });

  it('GS Paper I has exactly the seven official subjects the task requires', () => {
    const gs1 = UPSC_CSE_PRELIMS_SYLLABUS.papers.find((p) => p.title === 'General Studies Paper I')!;
    const subjects = getSubjectsForPaper(UPSC_CSE_PRELIMS_SYLLABUS, gs1.id).map((s) => s.title);
    expect(subjects).toEqual([
      'History',
      'Geography',
      'Indian Polity & Governance',
      'Economic & Social Development',
      'Environment & Ecology',
      'Science & Technology',
      'Current Affairs',
    ]);
  });

  it('CSAT has exactly the eight official subjects the task requires', () => {
    const csat = UPSC_CSE_PRELIMS_SYLLABUS.papers.find((p) => p.title === 'CSAT / General Studies Paper II')!;
    const subjects = getSubjectsForPaper(UPSC_CSE_PRELIMS_SYLLABUS, csat.id).map((s) => s.title);
    expect(subjects).toEqual([
      'Comprehension',
      'Interpersonal/Communication Skills',
      'Logical Reasoning',
      'Analytical Ability',
      'Decision Making/Problem Solving',
      'General Mental Ability',
      'Basic Numeracy',
      'Data Interpretation',
    ]);
  });
});

describe('UPSC CSE Syllabus Foundation — required Mains coverage', () => {
  it('all six official papers exist: Essay, GS-I..GS-IV, Optional Subject', () => {
    const titles = UPSC_CSE_MAINS_SYLLABUS.papers.map((p) => p.title);
    expect(titles).toEqual(['Essay', 'General Studies I', 'General Studies II', 'General Studies III', 'General Studies IV', 'Optional Subject']);
  });

  it('GS-I covers Indian Heritage & Culture, History, Geography, Society', () => {
    const gs1 = UPSC_CSE_MAINS_SYLLABUS.papers.find((p) => p.title === 'General Studies I')!;
    const subjects = getSubjectsForPaper(UPSC_CSE_MAINS_SYLLABUS, gs1.id).map((s) => s.title);
    expect(subjects).toEqual(['Indian Heritage & Culture', 'History', 'Geography', 'Society']);
  });

  it('GS-II covers Constitution & Polity, Governance, Social Justice, International Relations', () => {
    const gs2 = UPSC_CSE_MAINS_SYLLABUS.papers.find((p) => p.title === 'General Studies II')!;
    const subjects = getSubjectsForPaper(UPSC_CSE_MAINS_SYLLABUS, gs2.id).map((s) => s.title);
    expect(subjects).toEqual(['Constitution & Polity', 'Governance', 'Social Justice', 'International Relations']);
  });

  it('GS-III covers Economy, Agriculture, Science & Technology, Environment, Disaster Management, Internal Security', () => {
    const gs3 = UPSC_CSE_MAINS_SYLLABUS.papers.find((p) => p.title === 'General Studies III')!;
    const subjects = getSubjectsForPaper(UPSC_CSE_MAINS_SYLLABUS, gs3.id).map((s) => s.title);
    expect(subjects).toEqual(['Economy', 'Agriculture', 'Science & Technology', 'Environment', 'Disaster Management', 'Internal Security']);
  });

  it('GS-IV covers Ethics, Integrity & Aptitude, and includes a Case Studies microsyllabus item', () => {
    const gs4 = UPSC_CSE_MAINS_SYLLABUS.papers.find((p) => p.title === 'General Studies IV')!;
    const subjects = getSubjectsForPaper(UPSC_CSE_MAINS_SYLLABUS, gs4.id);
    expect(subjects.map((s) => s.title)).toEqual(['Ethics, Integrity & Aptitude']);
    const items = getMicrosyllabusForSubject(UPSC_CSE_MAINS_SYLLABUS, subjects[0].id).map((m) => m.title);
    expect(items).toContain('Case Studies');
  });

  it('Optional Subject is an extensible placeholder (exactly one placeholder subject/item, not fabricated content)', () => {
    const optional = UPSC_CSE_MAINS_SYLLABUS.papers.find((p) => p.title === 'Optional Subject')!;
    const subjects = getSubjectsForPaper(UPSC_CSE_MAINS_SYLLABUS, optional.id);
    expect(subjects.length).toBe(1);
    const items = getMicrosyllabusForSubject(UPSC_CSE_MAINS_SYLLABUS, subjects[0].id);
    expect(items.length).toBe(1);
  });
});

describe('UPSC CSE Syllabus Foundation — no fabricated PYQ content', () => {
  it('neither tree contains any field resembling a question, option, or answer key', () => {
    for (const { tree } of TREES) {
      for (const item of tree.microsyllabus) {
        expect(Object.keys(item)).not.toContain('question');
        expect(Object.keys(item)).not.toContain('options');
        expect(Object.keys(item)).not.toContain('correctAnswer');
      }
    }
  });

  it('UPSC_CSE_PYQ_BANK remains empty — this stage does not populate it', () => {
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });
});

describe('UPSC CSE Syllabus Foundation — workspace isolation', () => {
  it('the new trees carry no workspaceId field — they belong to upsc_cse by construction, matching UPSC_CSE_PYQ_BANK\'s own convention', () => {
    for (const { tree } of TREES) {
      for (const paper of tree.papers) expect((paper as unknown as Record<string, unknown>).workspaceId).toBeUndefined();
      for (const subject of tree.subjects) expect((subject as unknown as Record<string, unknown>).workspaceId).toBeUndefined();
      for (const item of tree.microsyllabus) expect((item as unknown as Record<string, unknown>).workspaceId).toBeUndefined();
    }
  });

  it('registry.ts\'s workspace resolution is unaffected by this stage: upsc_cse still resolves to the existing UPSC_CSE_SYLLABUS/UPSC_CSE_PYQ_BANK, unchanged', () => {
    expect(getSyllabusForWorkspace('upsc_cse')).toBe(UPSC_CSE_SYLLABUS);
    expect(getPyqBankForWorkspace('upsc_cse')).toBe(UPSC_CSE_PYQ_BANK);
  });

  it('data/syllabusUpscCse.ts\'s existing UPSC_CSE_SYLLABUS is untouched by this stage (still 8 flat entries)', () => {
    expect(UPSC_CSE_SYLLABUS.length).toBe(8);
  });
});

describe('UPSC CSE Syllabus Foundation — APFC protected-data safety', () => {
  it('data/syllabus.ts\'s SYLLABUS is unchanged: 13 subjects, 134 total topics', () => {
    expect(SYLLABUS.length).toBe(13);
    expect(SYLLABUS.reduce((sum, subject) => sum + subject.topics.length, 0)).toBe(134);
  });

  it('data/pyq.ts\'s PYQ_BANK is unchanged: 458 questions', () => {
    expect(PYQ_BANK.length).toBe(458);
  });

  it('APFC workspace resolution is unaffected by this stage\'s new UPSC CSE trees', () => {
    expect(getSyllabusForWorkspace('apfc')).toBe(SYLLABUS);
    expect(getPyqBankForWorkspace('apfc')).toBe(PYQ_BANK);
  });
});
