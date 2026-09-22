import type { UpscCseSyllabusTree } from '../lib/upscCseSyllabus';

// UPSC CSE Prelims syllabus — one of two completely separate trees (see the Mains counterpart,
// data/upscCseMainsSyllabus.ts, and lib/upscCseSyllabus.ts's own module header for why these are
// never merged even where a subject NAME coincides, e.g. Prelims GS-I's "History" vs Mains GS-I's
// "History": different paper, different official syllabus clause, different id space entirely).
//
// Two papers: General Studies Paper I (the substantive paper) and CSAT / General Studies Paper II
// (the qualifying aptitude paper) — matching UPSC's own official Prelims structure exactly.
//
// GS Paper I's seven subjects below (History, Geography, Indian Polity & Governance, Economic &
// Social Development, Environment & Ecology, Science & Technology, Current Affairs) are the
// official UPSC Prelims GS Paper I syllabus headings verbatim. Each subject's microsyllabus items
// are the component phrases already named within THAT SAME subject's own official syllabus clause
// (e.g. GS Paper I's Polity heading officially reads "Indian Polity and Governance-Constitution,
// Political System, Panchayati Raj, Public Policy, Rights Issues, etc." — "Constitution",
// "Political System", "Panchayati Raj", "Public Policy" and "Rights Issues" are drawn directly from
// that clause, not invented) — a faithful concise representation, never a deeper invented taxonomy.
// "Science & Technology" and "Current Affairs" have official clauses too terse to name distinct
// components ("General Science"; "Current events of national and international importance"), so
// each gets the smallest reasonable breakdown a terse heading like that actually needs to be
// classifiable at all, rather than being left as one single opaque node or padded out further.
//
// CSAT / GS Paper II's eight subjects (Comprehension, Interpersonal/communication skills, Logical
// reasoning, Analytical ability, Decision making/problem solving, General mental ability, Basic
// numeracy, Data interpretation) are UPSC's own official CSAT syllabus item list verbatim — already
// atomic, skill-based headings with no further official sub-breakdown to draw from, so each gets
// exactly one microsyllabus item restating itself (never fabricated extra granularity just to make
// every subject look equally deep — see lib/upscCseSyllabus.ts's own "do not over-invent" note).

let order = 0;
const nextOrder = () => ++order;

const GS1_PAPER_ID = 'prelims-gs1';
const CSAT_PAPER_ID = 'prelims-csat';

function subjectId(paper: string, subject: string): string {
  return `prelims-${paper}-${subject}`;
}

function microsyllabusId(paper: string, subject: string, item: string): string {
  return `prelims-${paper}-${subject}-${item}`;
}

const papers = [
  { id: GS1_PAPER_ID, stage: 'prelims' as const, title: 'General Studies Paper I', shortTitle: 'GS Paper I', order: nextOrder() },
  { id: CSAT_PAPER_ID, stage: 'prelims' as const, title: 'CSAT / General Studies Paper II', shortTitle: 'CSAT', order: nextOrder() },
];

interface SubjectSeed {
  key: string;
  title: string;
  microsyllabus: { key: string; title: string; description: string }[];
}

const GS1_SUBJECTS: SubjectSeed[] = [
  {
    key: 'history',
    title: 'History',
    microsyllabus: [
      { key: 'ancient', title: 'Ancient India', description: 'History of India — ancient period.' },
      { key: 'medieval', title: 'Medieval India', description: 'History of India — medieval period.' },
      { key: 'modern', title: 'Modern India', description: 'History of India — modern period.' },
      { key: 'freedom-movement', title: 'Indian National Movement', description: 'History of India and Indian National Movement.' },
    ],
  },
  {
    key: 'geography',
    title: 'Geography',
    microsyllabus: [
      { key: 'physical', title: 'Physical Geography', description: 'Indian and World Geography — Physical Geography of India and the World.' },
      { key: 'social', title: 'Social Geography', description: 'Indian and World Geography — Social Geography of India and the World.' },
      { key: 'economic', title: 'Economic Geography', description: 'Indian and World Geography — Economic Geography of India and the World.' },
    ],
  },
  {
    key: 'polity',
    title: 'Indian Polity & Governance',
    microsyllabus: [
      { key: 'constitution', title: 'Constitution', description: 'Indian Polity and Governance — Constitution.' },
      { key: 'political-system', title: 'Political System', description: 'Indian Polity and Governance — Political System.' },
      { key: 'panchayati-raj', title: 'Panchayati Raj', description: 'Indian Polity and Governance — Panchayati Raj.' },
      { key: 'public-policy', title: 'Public Policy', description: 'Indian Polity and Governance — Public Policy.' },
      { key: 'rights-issues', title: 'Rights Issues', description: 'Indian Polity and Governance — Rights Issues.' },
    ],
  },
  {
    key: 'economic-social-development',
    title: 'Economic & Social Development',
    microsyllabus: [
      { key: 'sustainable-development', title: 'Sustainable Development', description: 'Economic and Social Development — Sustainable Development.' },
      { key: 'poverty-inclusion', title: 'Poverty & Inclusion', description: 'Economic and Social Development — Poverty, Inclusion.' },
      { key: 'demographics', title: 'Demographics', description: 'Economic and Social Development — Demographics.' },
      { key: 'social-sector-initiatives', title: 'Social Sector Initiatives', description: 'Economic and Social Development — Social Sector initiatives.' },
    ],
  },
  {
    key: 'environment-ecology',
    title: 'Environment & Ecology',
    microsyllabus: [
      { key: 'environmental-ecology', title: 'Environmental Ecology', description: 'General issues on Environmental Ecology.' },
      { key: 'biodiversity', title: 'Biodiversity', description: 'General issues on Bio-diversity.' },
      { key: 'climate-change', title: 'Climate Change', description: 'General issues on Climate Change.' },
    ],
  },
  {
    key: 'science-technology',
    title: 'Science & Technology',
    microsyllabus: [
      { key: 'general-science', title: 'General Science', description: 'General Science.' },
      { key: 'everyday-science', title: 'Science & Technology in Everyday Life', description: 'General Science — applications relevant to everyday life.' },
    ],
  },
  {
    key: 'current-affairs',
    title: 'Current Affairs',
    microsyllabus: [
      { key: 'national', title: 'National Current Affairs', description: 'Current events of national importance.' },
      { key: 'international', title: 'International Current Affairs', description: 'Current events of international importance.' },
    ],
  },
];

const CSAT_SUBJECTS: SubjectSeed[] = [
  { key: 'comprehension', title: 'Comprehension', microsyllabus: [{ key: 'core', title: 'Comprehension', description: 'Comprehension.' }] },
  {
    key: 'interpersonal-communication',
    title: 'Interpersonal/Communication Skills',
    microsyllabus: [{ key: 'core', title: 'Interpersonal/Communication Skills', description: 'Interpersonal skills including communication skills.' }],
  },
  { key: 'logical-reasoning', title: 'Logical Reasoning', microsyllabus: [{ key: 'core', title: 'Logical Reasoning', description: 'Logical reasoning and analytical ability.' }] },
  { key: 'analytical-ability', title: 'Analytical Ability', microsyllabus: [{ key: 'core', title: 'Analytical Ability', description: 'Logical reasoning and analytical ability.' }] },
  {
    key: 'decision-making',
    title: 'Decision Making/Problem Solving',
    microsyllabus: [{ key: 'core', title: 'Decision Making/Problem Solving', description: 'Decision making and problem solving.' }],
  },
  { key: 'mental-ability', title: 'General Mental Ability', microsyllabus: [{ key: 'core', title: 'General Mental Ability', description: 'General mental ability.' }] },
  { key: 'basic-numeracy', title: 'Basic Numeracy', microsyllabus: [{ key: 'core', title: 'Basic Numeracy', description: 'Basic numeracy (numbers and their relations, orders of magnitude, etc.) — Class X level.' }] },
  { key: 'data-interpretation', title: 'Data Interpretation', microsyllabus: [{ key: 'core', title: 'Data Interpretation', description: 'Data interpretation (charts, graphs, tables, data sufficiency, etc.) — Class X level.' }] },
];

function buildSubjectsAndMicrosyllabus(paperId: string, paperKey: string, seeds: SubjectSeed[]) {
  const subjects = [];
  const microsyllabus = [];
  for (const seed of seeds) {
    const sId = subjectId(paperKey, seed.key);
    subjects.push({ id: sId, paperId, stage: 'prelims' as const, title: seed.title, order: nextOrder() });
    for (const m of seed.microsyllabus) {
      microsyllabus.push({
        id: microsyllabusId(paperKey, seed.key, m.key),
        parentId: sId,
        subjectId: sId,
        paperId,
        stage: 'prelims' as const,
        title: m.title,
        description: m.description,
        order: nextOrder(),
      });
    }
  }
  return { subjects, microsyllabus };
}

const gs1 = buildSubjectsAndMicrosyllabus(GS1_PAPER_ID, 'gs1', GS1_SUBJECTS);
const csat = buildSubjectsAndMicrosyllabus(CSAT_PAPER_ID, 'csat', CSAT_SUBJECTS);

export const UPSC_CSE_PRELIMS_SYLLABUS: UpscCseSyllabusTree = {
  stage: 'prelims',
  papers,
  subjects: [...gs1.subjects, ...csat.subjects],
  microsyllabus: [...gs1.microsyllabus, ...csat.microsyllabus],
};
