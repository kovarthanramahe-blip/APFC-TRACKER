import type { SyllabusSubject } from '../lib/types';

// Multi-Workspace OS, Stage 3B-1 — UPSC CSE syllabus FOUNDATION only.
//
// GS Paper I/II/III's topics below use the exact area headings supplied for this stage, matching
// the well-established official UPSC CSE syllabus structure for those papers. GS Paper IV, Essay,
// CSAT, Optional Subject and Current Affairs have no further official sub-topic breakdown given
// for this stage and this repo contains no other authoritative UPSC CSE syllabus source, so — per
// this stage's explicit instruction not to invent detailed subtopics just to look complete — each
// is represented by exactly ONE clearly-marked placeholder topic instead (see each one's `notes`
// field). Nothing here touches data/syllabus.ts (APFC's own syllabus) or any PYQ/question data.
//
// Optional Subject is a deliberate structural placeholder, not a real topic list: UPSC CSE Mains
// requires choosing ONE optional subject (from a long list this stage does not populate) — see its
// own `notes` below. Current Affairs is modelled as a single cross-cutting area rather than a
// topic list, since — unlike a fixed syllabus paper — it has no fixed content to enumerate.
let uid = 0;
const nid = (p: string) => `upsc-${p}-${++uid}`;

const PLACEHOLDER_NOTE = 'Structural placeholder for Stage 3B-1 — detailed sub-topics are not yet populated.';

export const UPSC_CSE_SYLLABUS: SyllabusSubject[] = [
  {
    id: 'upsc-gs1',
    title: 'General Studies Paper I',
    shortTitle: 'GS Paper I',
    colorKey: 'historyCulture',
    weightageHint: 'Mains — Indian heritage & culture, history, geography, society',
    topics: [
      { id: nid('gs1'), title: 'Indian Heritage & Culture' },
      { id: nid('gs1'), title: 'History' },
      { id: nid('gs1'), title: 'Geography' },
      { id: nid('gs1'), title: 'Society' },
    ],
  },
  {
    id: 'upsc-gs2',
    title: 'General Studies Paper II',
    shortTitle: 'GS Paper II',
    colorKey: 'polity',
    weightageHint: 'Mains — governance, constitution, social justice, international relations',
    topics: [
      { id: nid('gs2'), title: 'Constitution & Polity' },
      { id: nid('gs2'), title: 'Governance' },
      { id: nid('gs2'), title: 'Social Justice' },
      { id: nid('gs2'), title: 'International Relations' },
    ],
  },
  {
    id: 'upsc-gs3',
    title: 'General Studies Paper III',
    shortTitle: 'GS Paper III',
    colorKey: 'economy',
    weightageHint: 'Mains — economy, agriculture, science & tech, environment, security',
    topics: [
      { id: nid('gs3'), title: 'Economy' },
      { id: nid('gs3'), title: 'Agriculture' },
      { id: nid('gs3'), title: 'Science & Technology' },
      { id: nid('gs3'), title: 'Environment & Ecology' },
      { id: nid('gs3'), title: 'Internal Security' },
      { id: nid('gs3'), title: 'Disaster Management' },
    ],
  },
  {
    id: 'upsc-gs4',
    title: 'General Studies Paper IV',
    shortTitle: 'GS Paper IV',
    colorKey: 'reasoning',
    weightageHint: 'Mains — ethics, integrity & aptitude',
    topics: [{ id: nid('gs4'), title: 'Ethics, Integrity & Aptitude', notes: PLACEHOLDER_NOTE }],
  },
  {
    id: 'upsc-essay',
    title: 'Essay',
    shortTitle: 'Essay',
    colorKey: 'english',
    weightageHint: 'Mains — one paper',
    topics: [{ id: nid('essay'), title: 'Essay Writing', notes: PLACEHOLDER_NOTE }],
  },
  {
    id: 'upsc-csat',
    title: 'CSAT (General Studies Paper II — Prelims)',
    shortTitle: 'CSAT',
    colorKey: 'quant',
    weightageHint: 'Prelims — qualifying paper',
    topics: [{ id: nid('csat'), title: 'CSAT', notes: PLACEHOLDER_NOTE }],
  },
  {
    id: 'upsc-optional',
    title: 'Optional Subject',
    shortTitle: 'Optional',
    colorKey: 'computer',
    weightageHint: 'Mains — two papers on one chosen optional subject',
    topics: [
      {
        id: nid('optional'),
        title: 'Optional subject not yet selected',
        notes: 'No optional subjects are populated yet — a later stage will let one be chosen and tracked here.',
      },
    ],
  },
  {
    id: 'upsc-current-affairs',
    title: 'Current Affairs',
    shortTitle: 'Current Affairs',
    colorKey: 'currentAffairs',
    weightageHint: 'Cross-cutting — Prelims & Mains, ongoing',
    topics: [
      {
        id: nid('ca'),
        title: 'Current Affairs',
        notes: 'Cross-cutting study area, ongoing by nature — not broken into a fixed sub-topic list.',
      },
    ],
  },
];
