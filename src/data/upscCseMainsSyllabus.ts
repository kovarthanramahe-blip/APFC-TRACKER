import type { UpscCseSyllabusTree } from '../lib/upscCseSyllabus';

// UPSC CSE Mains syllabus — the completely separate counterpart to
// data/upscCsePrelimsSyllabus.ts's Prelims tree (see that file's and lib/upscCseSyllabus.ts's own
// headers for why the two are never merged, even where a subject name coincides — e.g. this tree's
// GS-I "History" is a different paper, different official clause, and a fully distinct id space
// from Prelims GS Paper I's own "History").
//
// Six papers: Essay, GS-I through GS-IV, and Optional Subject — matching UPSC's own official Mains
// structure. Essay has no further official sub-topic breakdown to draw from (it is graded as a
// single paper on a chosen essay topic, not a fixed syllabus) and Optional Subject is an
// intentional, explicit placeholder — UPSC CSE Mains requires choosing ONE optional subject from a
// long list this stage does not populate (matching the same placeholder discipline
// data/syllabusUpscCse.ts's own earlier Stage 3B-1 file already used, and this task's own explicit
// "Optional Subject as an extensible placeholder for now" instruction) — so both get exactly one
// placeholder subject/microsyllabus node rather than invented content.
//
// GS-I through GS-IV's subjects are the official UPSC Mains GS syllabus headings this task itself
// lists (Indian Heritage & Culture/History/Geography/Society for GS-I; Constitution & Polity/
// Governance/Social Justice/International Relations for GS-II; Economy/Agriculture/Science &
// Technology/Environment/Disaster Management/Internal Security for GS-III; Ethics, Integrity &
// Aptitude for GS-IV). Each subject's microsyllabus items are the component phrases already named
// within that subject's own official Mains syllabus clause (e.g. GS-II's Polity heading officially
// covers "Indian Constitution — historical underpinnings, evolution, features, amendments,
// significant provisions and basic structure", "Functions and responsibilities of the Union and
// the States", "separation of powers between various organs" etc. — those clauses are what each
// microsyllabus item below traces back to) — a faithful concise representation, never a deeper
// invented taxonomy. GS-IV's "Case Studies" is itself an official, named component of that paper's
// syllabus (not an addition), reflecting that GS-IV is explicitly assessed partly through case
// studies on the same ethics/aptitude themes.

let order = 0;
const nextOrder = () => ++order;

const ESSAY_PAPER_ID = 'mains-essay';
const GS1_PAPER_ID = 'mains-gs1';
const GS2_PAPER_ID = 'mains-gs2';
const GS3_PAPER_ID = 'mains-gs3';
const GS4_PAPER_ID = 'mains-gs4';
const OPTIONAL_PAPER_ID = 'mains-optional';

function subjectId(paper: string, subject: string): string {
  return `mains-${paper}-${subject}`;
}

function microsyllabusId(paper: string, subject: string, item: string): string {
  return `mains-${paper}-${subject}-${item}`;
}

const papers = [
  { id: ESSAY_PAPER_ID, stage: 'mains' as const, title: 'Essay', shortTitle: 'Essay', order: nextOrder() },
  { id: GS1_PAPER_ID, stage: 'mains' as const, title: 'General Studies I', shortTitle: 'GS-I', order: nextOrder() },
  { id: GS2_PAPER_ID, stage: 'mains' as const, title: 'General Studies II', shortTitle: 'GS-II', order: nextOrder() },
  { id: GS3_PAPER_ID, stage: 'mains' as const, title: 'General Studies III', shortTitle: 'GS-III', order: nextOrder() },
  { id: GS4_PAPER_ID, stage: 'mains' as const, title: 'General Studies IV', shortTitle: 'GS-IV', order: nextOrder() },
  { id: OPTIONAL_PAPER_ID, stage: 'mains' as const, title: 'Optional Subject', shortTitle: 'Optional', order: nextOrder() },
];

interface SubjectSeed {
  key: string;
  title: string;
  microsyllabus: { key: string; title: string; description: string }[];
}

const ESSAY_SUBJECTS: SubjectSeed[] = [
  {
    key: 'essay',
    title: 'Essay',
    microsyllabus: [{ key: 'core', title: 'Essay Writing', description: 'Candidates are required to write essays on multiple topics — no fixed syllabus.' }],
  },
];

const GS1_SUBJECTS: SubjectSeed[] = [
  {
    key: 'heritage-culture',
    title: 'Indian Heritage & Culture',
    microsyllabus: [
      { key: 'art-forms', title: 'Art Forms', description: 'Indian culture — salient aspects of Art Forms from ancient to modern times.' },
      { key: 'literature', title: 'Literature', description: 'Indian culture — salient aspects of Literature from ancient to modern times.' },
      { key: 'architecture', title: 'Architecture', description: 'Indian culture — salient aspects of Architecture from ancient to modern times.' },
    ],
  },
  {
    key: 'history',
    title: 'History',
    microsyllabus: [
      { key: 'modern-indian-history', title: 'Modern Indian History', description: 'Modern Indian history from about the middle of the eighteenth century until the present — significant events, personalities, issues.' },
      { key: 'freedom-struggle', title: 'Freedom Struggle', description: 'The Freedom Struggle — its various stages and important contributors/contributions from different parts of the country.' },
      { key: 'post-independence-consolidation', title: 'Post-Independence Consolidation', description: 'Post-independence consolidation and reorganization within the country.' },
      { key: 'world-history', title: 'World History', description: 'History of the world — industrial revolution, world wars, redrawal of national boundaries, colonization, decolonization, political philosophies.' },
    ],
  },
  {
    key: 'geography',
    title: 'Geography',
    microsyllabus: [
      { key: 'physical-geography', title: 'Physical Geography of India and the World', description: 'Salient geographical features and their location — changes in critical geographical features.' },
      { key: 'natural-resources', title: 'Distribution of Natural Resources', description: 'Distribution of key natural resources across the world, including South Asia and the Indian sub-continent.' },
      { key: 'industrial-location', title: 'Industrial Location Factors', description: 'Factors responsible for the location of primary, secondary and tertiary sector industries.' },
      { key: 'geophysical-phenomena', title: 'Geophysical Phenomena', description: 'Important Geophysical phenomena such as earthquakes, Tsunami, volcanic activity, cyclones, etc.' },
    ],
  },
  {
    key: 'society',
    title: 'Society',
    microsyllabus: [
      { key: 'indian-society-diversity', title: 'Indian Society & Diversity', description: 'Salient features of Indian Society, Diversity of India.' },
      { key: 'role-of-women', title: "Role of Women & Women's Organizations", description: "Role of women and women's organization." },
      { key: 'population-issues', title: 'Population & Associated Issues', description: 'Population and associated issues.' },
      { key: 'poverty-developmental-issues', title: 'Poverty & Developmental Issues', description: 'Poverty and developmental issues.' },
      { key: 'urbanization', title: 'Urbanization', description: 'Urbanization, their problems and their remedies.' },
      { key: 'globalization-effects', title: 'Effects of Globalization on Indian Society', description: 'Effects of globalization on Indian society.' },
      { key: 'social-empowerment', title: 'Social Empowerment', description: 'Social empowerment.' },
      { key: 'communalism-regionalism-secularism', title: 'Communalism, Regionalism & Secularism', description: 'Communalism, regionalism and secularism.' },
    ],
  },
];

const GS2_SUBJECTS: SubjectSeed[] = [
  {
    key: 'constitution-polity',
    title: 'Constitution & Polity',
    microsyllabus: [
      { key: 'constitution-evolution', title: 'Constitution — Evolution & Features', description: 'Indian Constitution — historical underpinnings, evolution, features, amendments, significant provisions and basic structure.' },
      { key: 'union-state-functions', title: 'Functions & Responsibilities of Union & States', description: 'Functions and responsibilities of the Union and the States, issues and challenges pertaining to the federal structure.' },
      { key: 'separation-of-powers', title: 'Separation of Powers', description: 'Separation of powers between various organs, dispute redressal mechanisms and institutions.' },
      { key: 'parliament-legislatures', title: 'Parliament & State Legislatures', description: 'Parliament and State Legislatures — structure, functioning, conduct of business, powers & privileges.' },
      { key: 'executive-judiciary', title: 'Executive & Judiciary', description: 'Structure, organization and functioning of the Executive and the Judiciary — Ministries and Departments.' },
    ],
  },
  {
    key: 'governance',
    title: 'Governance',
    microsyllabus: [
      { key: 'government-policies', title: 'Government Policies & Interventions', description: 'Government policies and interventions for development in various sectors and issues arising out of their design and implementation.' },
      { key: 'development-processes', title: 'Development Processes & the Development Industry', description: 'Development processes and the development industry — role of NGOs, SHGs, various groups and associations.' },
      { key: 'welfare-schemes', title: 'Welfare Schemes for Vulnerable Sections', description: 'Welfare schemes for vulnerable sections of the population by the Centre and States.' },
      { key: 'egovernance', title: 'E-Governance', description: 'E-governance — applications, models, successes, limitations and potential.' },
      { key: 'transparency-accountability', title: 'Transparency & Accountability', description: "Citizens' charters, transparency and accountability and institutional and other measures." },
    ],
  },
  {
    key: 'social-justice',
    title: 'Social Justice',
    microsyllabus: [
      { key: 'social-sector-development', title: 'Development & Management of Social Sector/Services', description: 'Issues relating to development and management of Social Sector/Services relating to Health, Education, Human Resources.' },
      { key: 'poverty-hunger', title: 'Poverty & Hunger Issues', description: 'Issues relating to poverty and hunger.' },
    ],
  },
  {
    key: 'international-relations',
    title: 'International Relations',
    microsyllabus: [
      { key: 'india-neighborhood', title: "India & its Neighborhood", description: "India and its neighborhood — relations." },
      { key: 'bilateral-regional-global', title: 'Bilateral, Regional & Global Groupings', description: 'Bilateral, regional and global groupings and agreements involving India and/or affecting India\'s interests.' },
      { key: 'diaspora', title: 'Indian Diaspora', description: 'Effect of policies and politics of developed and developing countries on India\'s interests, Indian diaspora.' },
      { key: 'international-institutions', title: 'Important International Institutions', description: 'Important International institutions, agencies and fora — their structure, mandate.' },
    ],
  },
];

const GS3_SUBJECTS: SubjectSeed[] = [
  {
    key: 'economy',
    title: 'Economy',
    microsyllabus: [
      { key: 'indian-economy', title: 'Indian Economy — Planning, Resources, Growth', description: 'Indian Economy and issues relating to planning, mobilization of resources, growth, development and employment.' },
      { key: 'government-budgeting', title: 'Government Budgeting', description: 'Government Budgeting.' },
      { key: 'inclusive-growth', title: 'Inclusive Growth', description: 'Inclusive growth and issues arising from it.' },
      { key: 'land-reforms', title: 'Land Reforms', description: 'Land reforms in India.' },
      { key: 'liberalization-effects', title: 'Effects of Liberalization on the Economy', description: 'Effects of liberalization on the economy, changes in industrial policy and their effects on industrial growth.' },
      { key: 'infrastructure', title: 'Infrastructure', description: 'Infrastructure — Energy, Ports, Roads, Airports, Railways, etc.' },
      { key: 'investment-models', title: 'Investment Models', description: 'Investment models.' },
    ],
  },
  {
    key: 'agriculture',
    title: 'Agriculture',
    microsyllabus: [
      { key: 'cropping-patterns', title: 'Major Crops & Cropping Patterns', description: 'Major crops — cropping patterns in various parts of the country, irrigation systems.' },
      { key: 'storage-transport-marketing', title: 'Storage, Transport & Marketing of Agricultural Produce', description: 'Storage, transport and marketing of agricultural produce and issues and related constraints.' },
      { key: 'e-technology-farmers', title: 'E-Technology in Aid of Farmers', description: 'E-technology in the aid of farmers.' },
      { key: 'food-processing', title: 'Food Processing & Related Industries', description: 'Issues related to Food Processing and related industries in India.' },
      { key: 'pds-food-security', title: 'Public Distribution System & Food Security', description: 'Public Distribution System — objectives, functioning, limitations, revamping; issues of buffer stocks and food security.' },
    ],
  },
  {
    key: 'science-technology',
    title: 'Science & Technology',
    microsyllabus: [
      { key: 'developments-applications', title: 'Developments & their Applications', description: 'Science and Technology — developments and their applications and effects in everyday life.' },
      { key: 'indian-achievements', title: 'Achievements of Indians in Science & Technology', description: 'Achievements of Indians in science & technology; indigenization of technology and developing new technology.' },
      { key: 'awareness-emerging-tech', title: 'Awareness in IT, Space, Computers, Robotics, Nano/Biotechnology', description: 'Awareness in the fields of IT, Space, Computers, robotics, nano-technology, bio-technology.' },
      { key: 'intellectual-property', title: 'Intellectual Property Rights', description: 'Issues relating to intellectual property rights.' },
    ],
  },
  {
    key: 'environment',
    title: 'Environment',
    microsyllabus: [
      { key: 'conservation-pollution', title: 'Conservation, Pollution & Degradation', description: 'Conservation, environmental pollution and degradation, environmental impact assessment.' },
    ],
  },
  {
    key: 'disaster-management',
    title: 'Disaster Management',
    microsyllabus: [{ key: 'basics', title: 'Disaster & Disaster Management', description: 'Disaster and disaster management.' }],
  },
  {
    key: 'internal-security',
    title: 'Internal Security',
    microsyllabus: [
      { key: 'organized-crime-terrorism', title: 'Linkages of Organized Crime with Terrorism', description: 'Linkages of organized crime with terrorism.' },
      { key: 'external-non-state-actors', title: 'Role of External State & Non-State Actors', description: 'Role of external state and non-state actors in creating challenges to internal security.' },
      { key: 'border-security', title: 'Security Challenges in Border Areas', description: 'Security challenges and their management in border areas.' },
      { key: 'cyber-security', title: 'Cyber Security', description: 'Basics of cyber security.' },
      { key: 'money-laundering', title: 'Money Laundering & its Prevention', description: 'Money-laundering and its prevention.' },
    ],
  },
];

const GS4_SUBJECTS: SubjectSeed[] = [
  {
    key: 'ethics-integrity-aptitude',
    title: 'Ethics, Integrity & Aptitude',
    microsyllabus: [
      { key: 'ethics-human-interface', title: 'Ethics & Human Interface', description: 'Essence, determinants and consequences of Ethics in human actions.' },
      { key: 'attitude', title: 'Attitude', description: 'Attitude — content, structure, function; its influence and relation with thought and behaviour; moral and political attitudes.' },
      { key: 'aptitude-foundational-values', title: 'Aptitude & Foundational Values for Civil Service', description: 'Aptitude and foundational values for Civil Service, integrity, impartiality and non-partisanship.' },
      { key: 'emotional-intelligence', title: 'Emotional Intelligence', description: 'Emotional intelligence — concepts and their utilities and application in administration and governance.' },
      { key: 'probity-in-governance', title: 'Probity in Governance', description: 'Concept of public service; Philosophical basis of governance and probity.' },
      { key: 'case-studies', title: 'Case Studies', description: 'Case studies on the above issues.' },
    ],
  },
];

const OPTIONAL_SUBJECTS: SubjectSeed[] = [
  {
    key: 'not-selected',
    title: 'Optional Subject Not Yet Selected',
    microsyllabus: [
      {
        key: 'placeholder',
        title: 'Optional Subject Not Yet Selected',
        description: 'UPSC CSE Mains requires choosing ONE optional subject (two papers) from UPSC\'s official list — not yet populated; an extensible placeholder for now.',
      },
    ],
  },
];

function buildSubjectsAndMicrosyllabus(paperId: string, paperKey: string, seeds: SubjectSeed[]) {
  const subjects = [];
  const microsyllabus = [];
  for (const seed of seeds) {
    const sId = subjectId(paperKey, seed.key);
    subjects.push({ id: sId, paperId, stage: 'mains' as const, title: seed.title, order: nextOrder() });
    for (const m of seed.microsyllabus) {
      microsyllabus.push({
        id: microsyllabusId(paperKey, seed.key, m.key),
        parentId: sId,
        subjectId: sId,
        paperId,
        stage: 'mains' as const,
        title: m.title,
        description: m.description,
        order: nextOrder(),
      });
    }
  }
  return { subjects, microsyllabus };
}

const essay = buildSubjectsAndMicrosyllabus(ESSAY_PAPER_ID, 'essay', ESSAY_SUBJECTS);
const gs1 = buildSubjectsAndMicrosyllabus(GS1_PAPER_ID, 'gs1', GS1_SUBJECTS);
const gs2 = buildSubjectsAndMicrosyllabus(GS2_PAPER_ID, 'gs2', GS2_SUBJECTS);
const gs3 = buildSubjectsAndMicrosyllabus(GS3_PAPER_ID, 'gs3', GS3_SUBJECTS);
const gs4 = buildSubjectsAndMicrosyllabus(GS4_PAPER_ID, 'gs4', GS4_SUBJECTS);
const optional = buildSubjectsAndMicrosyllabus(OPTIONAL_PAPER_ID, 'optional', OPTIONAL_SUBJECTS);

export const UPSC_CSE_MAINS_SYLLABUS: UpscCseSyllabusTree = {
  stage: 'mains',
  papers,
  subjects: [...essay.subjects, ...gs1.subjects, ...gs2.subjects, ...gs3.subjects, ...gs4.subjects, ...optional.subjects],
  microsyllabus: [...essay.microsyllabus, ...gs1.microsyllabus, ...gs2.microsyllabus, ...gs3.microsyllabus, ...gs4.microsyllabus, ...optional.microsyllabus],
};
