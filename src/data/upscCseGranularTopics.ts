import type { UpscCseExamStage, UpscCseMicrosyllabusItem } from '../lib/upscCseSyllabus';
import type { UpscCseGranularNode } from '../lib/upscCseGranularSyllabus';
import { UPSC_CSE_PRELIMS_SYLLABUS } from './upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from './upscCseMainsSyllabus';

// UPSC CSE Granular Syllabus data — Topic -> Subtopic -> Micro-topic breakdowns layered beneath a
// deliberately chosen SUBSET of the existing 97 microsyllabus items (see
// lib/upscCseGranularSyllabus.ts's module header for why an item having no rows here is a
// legitimate, honest state, not a gap to be filled reflexively). The 12 items below were chosen to
// cover EVERY one of the seven required papers (Prelims GS Paper I, Prelims CSAT, Mains Essay,
// Mains GS-I through GS-IV) with at least one real, meaningful breakdown each, while keeping this
// hand-authored dataset a size a human can actually review for accuracy — not a mechanically padded
// "every node gets children" pass. Optional Subject is untouched (kept exactly as the existing
// placeholder, per this stage's own instruction).
//
// Every title/description below is a DERIVED STUDY UNIT (a reasonable, standard way UPSC aspirants
// break a syllabus clause into revisable chunks) — never a claim that this is official UPSC wording;
// the microsyllabus item's own `description` (untouched, still the official clause) remains the
// single source of official wording. Each node's `origin: 'derived_study_unit'` marks this
// explicitly (see lib/upscCseGranularSyllabus.ts's UpscCseGranularNode).

interface MicroTopicSeed {
  key: string;
  title: string;
  description: string;
}
interface SubtopicSeed {
  key: string;
  title: string;
  description: string;
  microTopics: MicroTopicSeed[];
}
interface TopicSeed {
  key: string;
  title: string;
  description: string;
  subtopics: SubtopicSeed[];
}

function buildGranularNodesForMicrosyllabus(
  microsyllabusId: string,
  stage: UpscCseExamStage,
  paperId: string,
  subjectId: string,
  topics: TopicSeed[],
): UpscCseGranularNode[] {
  const nodes: UpscCseGranularNode[] = [];
  let order = 0;
  for (const t of topics) {
    const topicId = `${microsyllabusId}__t-${t.key}`;
    nodes.push({
      id: topicId,
      level: 'topic',
      parentId: microsyllabusId,
      stage,
      paperId,
      subjectId,
      microsyllabusId,
      topicId,
      title: t.title,
      description: t.description,
      origin: 'derived_study_unit',
      order: ++order,
    });
    let subOrder = 0;
    for (const st of t.subtopics) {
      const subtopicId = `${topicId}__s-${st.key}`;
      nodes.push({
        id: subtopicId,
        level: 'subtopic',
        parentId: topicId,
        stage,
        paperId,
        subjectId,
        microsyllabusId,
        topicId,
        subtopicId,
        title: st.title,
        description: st.description,
        origin: 'derived_study_unit',
        order: ++subOrder,
      });
      let mtOrder = 0;
      for (const mt of st.microTopics) {
        const microTopicId = `${subtopicId}__m-${mt.key}`;
        nodes.push({
          id: microTopicId,
          level: 'microtopic',
          parentId: subtopicId,
          stage,
          paperId,
          subjectId,
          microsyllabusId,
          topicId,
          subtopicId,
          microTopicId,
          title: mt.title,
          description: mt.description,
          origin: 'derived_study_unit',
          order: ++mtOrder,
        });
      }
    }
  }
  return nodes;
}

const PRELIMS_GS1_PAPER = UPSC_CSE_PRELIMS_SYLLABUS.papers.find((p) => p.shortTitle === 'GS Paper I')!.id;
const PRELIMS_CSAT_PAPER = UPSC_CSE_PRELIMS_SYLLABUS.papers.find((p) => p.shortTitle === 'CSAT')!.id;
const polityConstitution = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Constitution' && m.paperId === PRELIMS_GS1_PAPER)!;
const geographyPhysicalPrelims = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Physical Geography' && m.paperId === PRELIMS_GS1_PAPER)!;
const basicNumeracy = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Basic Numeracy' && m.paperId === PRELIMS_CSAT_PAPER)!;

const essayWriting = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Essay Writing')!;
const modernIndianHistory = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Modern Indian History')!;
const geographyPhysicalMains = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Physical Geography of India and the World')!;
const constitutionEvolution = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Constitution — Evolution & Features')!;
const indiaNeighborhood = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'India & its Neighborhood')!;
const indianEconomy = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Indian Economy — Planning, Resources, Growth')!;
const scienceTechApplications = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Developments & their Applications')!;
const ethicsHumanInterface = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Ethics & Human Interface')!;
const caseStudies = UPSC_CSE_MAINS_SYLLABUS.microsyllabus.find((m) => m.title === 'Case Studies')!;

// Phase 6 — Prelims GS Paper I: History's four existing microsyllabus items (Ancient/Medieval/
// Modern India, Indian National Movement), broken into era-topic study units. Ids/titles below are
// unchanged from data/upscCsePrelimsSyllabus.ts; only new topic-level rows are added beneath them.
const ancientIndia = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Ancient India' && m.paperId === PRELIMS_GS1_PAPER)!;
const medievalIndia = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Medieval India' && m.paperId === PRELIMS_GS1_PAPER)!;
const modernIndia = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Modern India' && m.paperId === PRELIMS_GS1_PAPER)!;
const indianNationalMovement = UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus.find((m) => m.title === 'Indian National Movement' && m.paperId === PRELIMS_GS1_PAPER)!;

// Phase 6A — full Prelims/Mains coverage beyond History. Same architecture as every entry above
// (buildGranularNodesForMicrosyllabus, topic-level only — no subtopics/microtopics, matching
// Phase 6's own History rows), just DRYed up: fromPrelims/fromMains look up a microsyllabus item by
// its EXISTING, unchanged title and build its granular rows in one call, instead of a separate named
// const per item (72 of them here — a named const per item would just be repetitive boilerplate).
function granularLookup(tree: 'prelims' | 'mains', title: string): UpscCseMicrosyllabusItem {
  const microsyllabus = tree === 'prelims' ? UPSC_CSE_PRELIMS_SYLLABUS.microsyllabus : UPSC_CSE_MAINS_SYLLABUS.microsyllabus;
  return microsyllabus.find((m) => m.title === title)!;
}
function fromPrelims(title: string, topics: TopicSeed[]): UpscCseGranularNode[] {
  const m = granularLookup('prelims', title);
  return buildGranularNodesForMicrosyllabus(m.id, 'prelims', m.paperId, m.subjectId, topics);
}
function fromMains(title: string, topics: TopicSeed[]): UpscCseGranularNode[] {
  const m = granularLookup('mains', title);
  return buildGranularNodesForMicrosyllabus(m.id, 'mains', m.paperId, m.subjectId, topics);
}
/** No-subtopic topic shorthand — every Phase 6A topic is title+description only. */
function t(title: string, description: string): TopicSeed {
  return { key: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), title, description, subtopics: [] };
}

export const UPSC_CSE_GRANULAR_NODES: UpscCseGranularNode[] = [
  // --- Prelims GS Paper I: Polity > Constitution ---
  ...buildGranularNodesForMicrosyllabus(polityConstitution.id, 'prelims', polityConstitution.paperId, polityConstitution.subjectId, [
    {
      key: 'historical-evolution',
      title: 'Historical Underpinnings & Evolution',
      description: 'How the Constitution took shape — the Constituent Assembly and the sources it drew on.',
      subtopics: [
        {
          key: 'constituent-assembly',
          title: 'Constituent Assembly',
          description: 'Formation, composition and working of the body that drafted the Constitution.',
          microTopics: [
            { key: 'composition', title: 'Composition & Working', description: 'How members were chosen and how the Assembly conducted its business.' },
            { key: 'objectives-resolution', title: 'Objectives Resolution', description: "Nehru's Objectives Resolution and its influence on the Preamble." },
          ],
        },
        {
          key: 'sources',
          title: 'Sources of the Constitution',
          description: 'Where the framers drew inspiration and structure from.',
          microTopics: [
            { key: 'goi-act-1935', title: 'Government of India Act 1935', description: 'Structural and administrative provisions carried over from the 1935 Act.' },
            { key: 'borrowed-features', title: 'Borrowed Features from Other Constitutions', description: 'Features drawn from the UK, US, Irish, Canadian and other constitutions.' },
          ],
        },
      ],
    },
    {
      key: 'salient-features',
      title: 'Salient Features & Basic Structure',
      description: 'What defines the Constitution\'s character and its unamendable core.',
      subtopics: [
        {
          key: 'preamble',
          title: 'Preamble',
          description: 'The Preamble\'s wording and its status as part of the Constitution.',
          microTopics: [
            { key: 'preamble-keywords', title: 'Keywords in the Preamble', description: 'Sovereign, Socialist, Secular, Democratic, Republic — meaning of each term.' },
            { key: 'preamble-amendability', title: 'Amendability of the Preamble', description: "The 42nd Amendment's changes and the Kesavananda Bharati ruling on amendability." },
          ],
        },
        {
          key: 'basic-structure',
          title: 'Basic Structure Doctrine',
          description: 'The judicially evolved limit on Parliament\'s amending power.',
          microTopics: [
            { key: 'kesavananda-bharati', title: 'Kesavananda Bharati Case', description: 'The 1973 case that established the basic structure doctrine.' },
            { key: 'basic-structure-elements', title: 'Elements Held to be Basic Structure', description: 'Federalism, judicial review, secularism and other elements courts have held as basic structure.' },
          ],
        },
      ],
    },
  ]),

  // --- Prelims GS Paper I: Geography > Physical Geography ---
  ...buildGranularNodesForMicrosyllabus(geographyPhysicalPrelims.id, 'prelims', geographyPhysicalPrelims.paperId, geographyPhysicalPrelims.subjectId, [
    {
      key: 'physiography',
      title: 'Physiography of India',
      description: 'India\'s major landform divisions.',
      subtopics: [
        {
          key: 'himalayan-system',
          title: 'Himalayan Mountain System',
          description: 'The structure and sub-ranges of the Himalayas.',
          microTopics: [
            { key: 'himalaya-ranges', title: 'Trans/Greater/Lesser/Outer Himalaya', description: 'The four broad longitudinal divisions of the Himalayan range.' },
            { key: 'himalayan-passes', title: 'Major Himalayan Passes', description: 'Key passes such as Nathu La, Shipki La and Zoji La and their significance.' },
          ],
        },
        {
          key: 'plains-plateau',
          title: 'Northern Plains & Peninsular Plateau',
          description: 'The alluvial plains and the older peninsular block.',
          microTopics: [
            { key: 'plains-zones', title: 'Bhabar-Terai-Bhangar-Khadar', description: 'The north-south zonation of the Northern Plains.' },
            { key: 'ghats', title: 'Western & Eastern Ghats', description: 'The bordering hill ranges of the Peninsular Plateau.' },
          ],
        },
      ],
    },
    {
      key: 'climatology',
      title: 'Climatology',
      description: 'The factors and systems that drive India\'s climate.',
      subtopics: [
        {
          key: 'monsoon-system',
          title: 'Indian Monsoon System',
          description: 'The seasonal wind reversal that governs India\'s climate.',
          microTopics: [
            { key: 'monsoon-onset-withdrawal', title: 'Onset & Withdrawal of Monsoon', description: 'The typical timeline and mechanism of monsoon onset and retreat.' },
            { key: 'el-nino-la-nina', title: 'El Niño & La Niña Effects', description: 'How Pacific Ocean anomalies influence Indian monsoon performance.' },
          ],
        },
        {
          key: 'jet-streams',
          title: 'Jet Streams & Western Disturbances',
          description: 'Upper-air wind systems affecting Indian weather.',
          microTopics: [
            { key: 'tropical-easterly-jet', title: 'Tropical Easterly Jet', description: 'The jet stream associated with the strength of the summer monsoon.' },
            { key: 'western-disturbances', title: 'Western Disturbances & Winter Rainfall', description: 'Extratropical storms bringing winter precipitation to north India.' },
          ],
        },
      ],
    },
  ]),

  // --- Prelims CSAT: Basic Numeracy ---
  ...buildGranularNodesForMicrosyllabus(basicNumeracy.id, 'prelims', basicNumeracy.paperId, basicNumeracy.subjectId, [
    {
      key: 'number-systems',
      title: 'Number Systems',
      description: 'The foundational classification and properties of numbers.',
      subtopics: [
        {
          key: 'types-of-numbers',
          title: 'Types of Numbers',
          description: 'The different classes of numbers and their relationships.',
          microTopics: [
            { key: 'number-classes', title: 'Natural, Whole, Integers, Rational/Irrational', description: 'The standard classification hierarchy of numbers.' },
            { key: 'hcf-lcm', title: 'HCF & LCM', description: 'Finding highest common factor and lowest common multiple.' },
          ],
        },
        {
          key: 'divisibility',
          title: 'Divisibility & Factors',
          description: 'Rules and techniques for factor-based problems.',
          microTopics: [
            { key: 'divisibility-rules', title: 'Divisibility Rules', description: 'Quick rules for checking divisibility by common numbers.' },
            { key: 'prime-factorization', title: 'Prime Factorization', description: 'Breaking a number down into its prime factors.' },
          ],
        },
      ],
    },
    {
      key: 'arithmetic-applications',
      title: 'Arithmetic Operations & Applications',
      description: 'Applied numeracy problems commonly tested in CSAT.',
      subtopics: [
        {
          key: 'ratio-proportion',
          title: 'Ratio, Proportion & Percentage',
          description: 'Comparative and proportional reasoning problems.',
          microTopics: [
            { key: 'ratio-basics', title: 'Ratio & Proportion Basics', description: 'Core rules for solving ratio and proportion problems.' },
            { key: 'percentage-change', title: 'Percentage Change Problems', description: 'Calculating and applying percentage increase/decrease.' },
          ],
        },
        {
          key: 'time-speed-distance',
          title: 'Time, Speed, Distance & Work',
          description: 'Rate-based word problems.',
          microTopics: [
            { key: 'relative-speed', title: 'Relative Speed', description: 'Speed problems involving two or more moving objects.' },
            { key: 'time-work', title: 'Time & Work Problems', description: 'Problems on individual and combined work rates.' },
          ],
        },
      ],
    },
  ]),

  // --- Mains Essay: Essay Writing ---
  ...buildGranularNodesForMicrosyllabus(essayWriting.id, 'mains', essayWriting.paperId, essayWriting.subjectId, [
    {
      key: 'essay-themes',
      title: 'Essay Themes',
      description: 'The broad categories UPSC Essay topics are typically drawn from.',
      subtopics: [
        {
          key: 'philosophical-abstract',
          title: 'Philosophical & Abstract Themes',
          description: 'Value- and quote-based abstract essay topics.',
          microTopics: [
            { key: 'ethical-value-prompts', title: 'Ethical/Value-based Prompts', description: 'Topics built around a moral or philosophical proposition.' },
            { key: 'abstract-quote-prompts', title: 'Abstract Quote-based Prompts', description: 'Topics framed as a quotation to be interpreted and developed.' },
          ],
        },
        {
          key: 'social-political-economic',
          title: 'Social, Political & Economic Themes',
          description: 'Essay topics grounded in current governance and society.',
          microTopics: [
            { key: 'governance-policy-themes', title: 'Governance & Policy Themes', description: 'Topics on public policy, administration and reform.' },
            { key: 'socio-economic-issues', title: 'Contemporary Socio-Economic Issues', description: 'Topics on current social and economic challenges facing India.' },
          ],
        },
      ],
    },
    {
      key: 'essay-craft',
      title: 'Essay Craft',
      description: 'The writing technique that shapes how a topic is developed.',
      subtopics: [
        {
          key: 'structuring',
          title: 'Structuring an Essay',
          description: 'How a well-organised essay is built.',
          microTopics: [
            { key: 'intro-thesis', title: 'Introduction & Thesis Framing', description: 'Opening an essay with a clear thesis or line of argument.' },
            { key: 'balanced-body', title: 'Balanced Multi-dimensional Body', description: 'Covering an essay topic from social, economic, political and ethical angles.' },
          ],
        },
        {
          key: 'examples-evidence',
          title: 'Use of Examples & Evidence',
          description: 'Substantiating an essay\'s arguments.',
          microTopics: [
            { key: 'data-committee-reports', title: 'Using Data & Committee Reports', description: 'Citing statistics and official reports to strengthen an argument.' },
            { key: 'illustrations', title: 'Illustrations from History & Current Affairs', description: 'Using historical and contemporary examples to ground abstract points.' },
          ],
        },
      ],
    },
  ]),

  // --- Mains GS-I: History > Modern Indian History ---
  ...buildGranularNodesForMicrosyllabus(modernIndianHistory.id, 'mains', modernIndianHistory.paperId, modernIndianHistory.subjectId, [
    {
      key: 'company-rule',
      title: 'Company Rule & Early Resistance',
      description: 'British expansion and the first major armed uprising against it.',
      subtopics: [
        {
          key: 'expansion',
          title: 'Expansion of British Power',
          description: 'How the East India Company extended political control across India.',
          microTopics: [
            { key: 'lapse-subsidiary', title: 'Doctrine of Lapse & Subsidiary Alliance', description: 'The two key policy tools used for territorial annexation.' },
            { key: 'anglo-indian-wars', title: 'Major Anglo-Indian Wars', description: 'The Anglo-Mysore, Anglo-Maratha and Anglo-Sikh Wars.' },
          ],
        },
        {
          key: 'revolt-1857',
          title: '1857 Revolt',
          description: 'The first large-scale uprising against Company rule.',
          microTopics: [
            { key: 'revolt-causes', title: 'Causes of the Revolt', description: 'Political, economic, social and military causes of 1857.' },
            { key: 'revolt-consequences', title: 'Consequences & Government of India Act 1858', description: 'The transfer of power from the Company to the Crown.' },
          ],
        },
      ],
    },
    {
      key: 'reform-movements',
      title: 'Socio-Religious Reform Movements',
      description: '19th-century movements that reshaped Indian society.',
      subtopics: [
        {
          key: 'bengal-reform',
          title: 'Reform Movements in Bengal',
          description: 'Early reform movements centred in Bengal.',
          microTopics: [
            { key: 'brahmo-samaj', title: 'Brahmo Samaj', description: "Raja Ram Mohan Roy's reform movement and its core tenets." },
            { key: 'young-bengal', title: 'Young Bengal Movement', description: "Derozio's radical student movement in Bengal." },
          ],
        },
        {
          key: 'other-reform',
          title: 'Reform Movements Elsewhere in India',
          description: 'Reform movements beyond Bengal.',
          microTopics: [
            { key: 'arya-samaj', title: 'Arya Samaj', description: "Swami Dayananda Saraswati's reform movement and 'Back to the Vedas'." },
            { key: 'aligarh-movement', title: 'Aligarh Movement', description: "Sir Syed Ahmed Khan's movement for modern education among Muslims." },
          ],
        },
      ],
    },
  ]),

  // --- Mains GS-I: Geography > Physical Geography of India and the World ---
  ...buildGranularNodesForMicrosyllabus(geographyPhysicalMains.id, 'mains', geographyPhysicalMains.paperId, geographyPhysicalMains.subjectId, [
    {
      key: 'landforms',
      title: 'Landforms & Geomorphology',
      description: 'How erosional and depositional processes shape the land.',
      subtopics: [
        {
          key: 'fluvial-glacial',
          title: 'Fluvial & Glacial Landforms',
          description: 'Landforms created by rivers and glaciers.',
          microTopics: [
            { key: 'river-landforms', title: 'River Erosional & Depositional Features', description: 'Meanders, oxbow lakes, deltas and other river-formed features.' },
            { key: 'glacial-landforms', title: 'Glacial Landform Features', description: 'Cirques, moraines, U-shaped valleys and other glacier-formed features.' },
          ],
        },
        {
          key: 'coastal-landforms',
          title: 'Coastal Landforms',
          description: 'Landforms shaped by wave and tidal action.',
          microTopics: [
            { key: 'coral-reefs', title: 'Coral Reefs & Atolls', description: 'Formation and types of coral reef structures.' },
            { key: 'coastal-erosion-deposition', title: 'Coastal Erosion & Deposition Features', description: 'Cliffs, spits, bars and other coastal features.' },
          ],
        },
      ],
    },
    {
      key: 'oceanography',
      title: 'Oceanography',
      description: 'The physical features and circulation of the world\'s oceans.',
      subtopics: [
        {
          key: 'ocean-currents',
          title: 'Ocean Currents',
          description: 'Major surface current systems and their effects.',
          microTopics: [
            { key: 'warm-cold-currents', title: 'Warm & Cold Ocean Currents', description: 'Major warm and cold current systems and their climatic effects.' },
            { key: 'enso', title: 'El Niño Southern Oscillation', description: 'The ENSO cycle and its global climatic impact.' },
          ],
        },
        {
          key: 'ocean-floor',
          title: 'Ocean Floor Relief',
          description: 'The major relief features of the ocean basin.',
          microTopics: [
            { key: 'continental-shelf-slope', title: 'Continental Shelf & Slope', description: 'The submerged margins of the continents.' },
            { key: 'ridges-trenches', title: 'Mid-Ocean Ridges & Trenches', description: 'Divergent and convergent plate boundary features on the ocean floor.' },
          ],
        },
      ],
    },
  ]),

  // --- Mains GS-II: Constitution & Polity > Constitution — Evolution & Features ---
  ...buildGranularNodesForMicrosyllabus(constitutionEvolution.id, 'mains', constitutionEvolution.paperId, constitutionEvolution.subjectId, [
    {
      key: 'making-of-constitution',
      title: 'Making of the Constitution',
      description: 'The drafting process and the influences that shaped it.',
      subtopics: [
        {
          key: 'assembly-debates',
          title: 'Constituent Assembly Debates',
          description: 'Key committees and deliberations of the Constituent Assembly.',
          microTopics: [
            { key: 'drafting-committee', title: 'Drafting Committee', description: "Composition and role of Dr. B.R. Ambedkar's Drafting Committee." },
            { key: 'key-committees', title: 'Key Constituent Assembly Committees', description: 'Other major committees such as the Union Powers and Fundamental Rights committees.' },
          ],
        },
        {
          key: 'sources-borrowed',
          title: 'Sources & Borrowed Features',
          description: 'Constitutional provisions traced to earlier statutes and other constitutions.',
          microTopics: [
            { key: 'goi-1935-influence', title: 'Government of India Act 1935 Influence', description: 'Administrative and federal provisions carried over from 1935.' },
            { key: 'other-constitution-features', title: 'Features from Other Constitutions', description: 'Fundamental Rights (US), Directive Principles (Ireland) and other borrowed features.' },
          ],
        },
      ],
    },
    {
      key: 'key-amendments',
      title: 'Key Amendments',
      description: 'Landmark constitutional amendments and their effects.',
      subtopics: [
        {
          key: 'amendment-42',
          title: '42nd Amendment',
          description: 'The 1976 amendment often called the "Mini-Constitution".',
          microTopics: [
            { key: 'mini-constitution', title: 'Mini-Constitution Changes', description: 'The sweeping structural changes made by the 42nd Amendment.' },
            { key: 'fundamental-duties', title: 'Fundamental Duties Introduced', description: 'Addition of Part IVA (Fundamental Duties) to the Constitution.' },
          ],
        },
        {
          key: 'amendment-44',
          title: '44th Amendment',
          description: 'The 1978 amendment that reversed several 42nd Amendment changes.',
          microTopics: [
            { key: 'right-to-property', title: 'Right to Property Reclassified', description: 'Removal of the Right to Property from Fundamental Rights to a legal right.' },
            { key: 'emergency-safeguards', title: 'Safeguards Against Emergency Misuse', description: 'Procedural safeguards added after the experience of the 1975 Emergency.' },
          ],
        },
      ],
    },
  ]),

  // --- Mains GS-II: International Relations > India & its Neighborhood ---
  ...buildGranularNodesForMicrosyllabus(indiaNeighborhood.id, 'mains', indiaNeighborhood.paperId, indiaNeighborhood.subjectId, [
    {
      key: 'south-asian-neighbours',
      title: 'South Asian Neighbours',
      description: 'India\'s relations with its immediate neighbours.',
      subtopics: [
        {
          key: 'india-pakistan',
          title: 'India-Pakistan Relations',
          description: 'The key dimensions of the India-Pakistan relationship.',
          microTopics: [
            { key: 'bilateral-disputes', title: 'Bilateral Disputes & Confidence-Building', description: 'Kashmir, Indus Waters and related confidence-building measures.' },
            { key: 'cross-border-terrorism', title: 'Cross-Border Terrorism Concerns', description: 'The security dimension shaping bilateral relations.' },
          ],
        },
        {
          key: 'bangladesh-nepal',
          title: 'India-Bangladesh & Nepal Relations',
          description: 'Cooperation and friction points with these neighbours.',
          microTopics: [
            { key: 'river-water-sharing', title: 'River Water Sharing Issues', description: 'Treaties and disputes over shared river waters.' },
            { key: 'connectivity-trade', title: 'Connectivity & Trade Agreements', description: 'Transit and trade arrangements with Bangladesh and Nepal.' },
          ],
        },
      ],
    },
    {
      key: 'extended-neighbourhood',
      title: 'Extended Neighbourhood',
      description: 'India\'s relations further afield in Asia.',
      subtopics: [
        {
          key: 'india-china',
          title: 'India-China Relations',
          description: 'The border and strategic dimensions of the relationship.',
          microTopics: [
            { key: 'border-lac', title: 'Border Issues & LAC', description: 'The Line of Actual Control and related border disputes.' },
            { key: 'trade-strategic-competition', title: 'Trade & Strategic Competition', description: 'Economic interdependence alongside strategic rivalry.' },
          ],
        },
        {
          key: 'myanmar-asean',
          title: 'India-Myanmar & ASEAN Links',
          description: 'India\'s engagement with South-East Asia.',
          microTopics: [
            { key: 'act-east-policy', title: 'Act East Policy', description: "India's policy of deepening engagement with South-East Asia." },
            { key: 'connectivity-projects', title: 'Connectivity Projects (Kaladan, Trilateral Highway)', description: 'Major infrastructure links to South-East Asia.' },
          ],
        },
      ],
    },
  ]),

  // --- Mains GS-III: Economy > Indian Economy — Planning, Resources, Growth ---
  ...buildGranularNodesForMicrosyllabus(indianEconomy.id, 'mains', indianEconomy.paperId, indianEconomy.subjectId, [
    {
      key: 'planning-resources',
      title: 'Planning & Resource Mobilization',
      description: 'How India has planned development and raised resources for it.',
      subtopics: [
        {
          key: 'plans-niti-aayog',
          title: 'Five-Year Plans & NITI Aayog',
          description: 'The evolution of India\'s planning institutions.',
          microTopics: [
            { key: 'planning-commission-to-niti', title: 'Evolution from Planning Commission to NITI Aayog', description: 'The 2015 transition and its rationale.' },
            { key: 'cooperative-federalism', title: 'Cooperative & Competitive Federalism in Planning', description: "NITI Aayog's role in centre-state planning coordination." },
          ],
        },
        {
          key: 'resource-mobilization',
          title: 'Fiscal & Monetary Resource Mobilization',
          description: 'How the government raises resources for development.',
          microTopics: [
            { key: 'tax-non-tax-revenue', title: 'Tax vs Non-Tax Revenue', description: 'The composition of government revenue sources.' },
            { key: 'borrowing-disinvestment', title: 'Public Borrowing & Disinvestment', description: 'Deficit financing and disinvestment as resource-raising tools.' },
          ],
        },
      ],
    },
    {
      key: 'growth-employment',
      title: 'Growth & Employment',
      description: 'How growth is measured and how it translates into jobs.',
      subtopics: [
        {
          key: 'gdp-measurement',
          title: 'GDP & Growth Measurement',
          description: 'How national income and growth are measured.',
          microTopics: [
            { key: 'gdp-gnp-nnp', title: 'GDP vs GNP vs NNP', description: 'The distinctions between the core national income aggregates.' },
            { key: 'sectoral-growth', title: 'Sectoral Composition of Growth', description: "The share of agriculture, industry and services in India's growth." },
          ],
        },
        {
          key: 'employment-trends',
          title: 'Employment & Labour Market Trends',
          description: 'The structure of India\'s workforce.',
          microTopics: [
            { key: 'formal-informal-employment', title: 'Formal vs Informal Employment', description: 'The divide between organised and unorganised sector employment.' },
            { key: 'labour-force-participation', title: 'Labour Force Participation Rate', description: 'Trends and gaps in workforce participation.' },
          ],
        },
      ],
    },
  ]),

  // --- Mains GS-III: Science & Technology > Developments & their Applications ---
  ...buildGranularNodesForMicrosyllabus(scienceTechApplications.id, 'mains', scienceTechApplications.paperId, scienceTechApplications.subjectId, [
    {
      key: 'emerging-technologies',
      title: 'Emerging Technologies',
      description: 'Frontier technologies of current relevance.',
      subtopics: [
        {
          key: 'ai-robotics',
          title: 'Artificial Intelligence & Robotics',
          description: 'AI and robotics fundamentals and their governance implications.',
          microTopics: [
            { key: 'ml-basics', title: 'Machine Learning Basics', description: 'Core concepts underlying modern AI systems.' },
            { key: 'ai-governance-defence', title: 'Applications in Governance & Defence', description: 'How AI is being applied in public administration and defence.' },
          ],
        },
        {
          key: 'biotech-genetics',
          title: 'Biotechnology & Genetic Engineering',
          description: 'Biotechnology developments and their regulatory debates.',
          microTopics: [
            { key: 'crispr', title: 'Genome Editing (CRISPR)', description: 'The CRISPR gene-editing technique and its applications.' },
            { key: 'gm-crops', title: 'GM Crops & Regulatory Issues', description: 'Genetically modified crops and India\'s regulatory framework.' },
          ],
        },
      ],
    },
    {
      key: 'everyday-applications',
      title: 'Applications in Daily Life',
      description: 'How science and technology touch everyday concerns.',
      subtopics: [
        {
          key: 'health-medicine',
          title: 'Health & Medicine',
          description: 'Technology applications in healthcare delivery.',
          microTopics: [
            { key: 'vaccine-technology', title: 'Vaccine Technology', description: 'The science behind modern vaccine platforms.' },
            { key: 'telemedicine', title: 'Telemedicine & Digital Health', description: 'Remote healthcare delivery and digital health infrastructure.' },
          ],
        },
        {
          key: 'agri-environment',
          title: 'Agriculture & Environment',
          description: 'Technology applications in farming and environmental monitoring.',
          microTopics: [
            { key: 'precision-farming', title: 'Precision Farming', description: 'Data-driven farming techniques to improve yield and resource use.' },
            { key: 'remote-sensing-environment', title: 'Remote Sensing for Environment Monitoring', description: 'Satellite-based monitoring of environmental change.' },
          ],
        },
      ],
    },
  ]),

  // --- Mains GS-IV: Ethics, Integrity & Aptitude > Ethics & Human Interface ---
  ...buildGranularNodesForMicrosyllabus(ethicsHumanInterface.id, 'mains', ethicsHumanInterface.paperId, ethicsHumanInterface.subjectId, [
    {
      key: 'foundations-of-ethics',
      title: 'Foundations of Ethics',
      description: 'What shapes ethical conduct and what follows from it.',
      subtopics: [
        {
          key: 'determinants',
          title: 'Determinants of Ethics',
          description: 'The factors that shape a person\'s ethical outlook.',
          microTopics: [
            { key: 'family-society-religion', title: 'Family, Society & Religion as Determinants', description: 'Social institutions that shape ethical values.' },
            { key: 'education-personal-values', title: 'Education & Personal Values', description: 'The role of education in forming ethical character.' },
          ],
        },
        {
          key: 'consequences',
          title: 'Consequences of Ethical/Unethical Actions',
          description: 'What follows, for individuals and institutions, from ethical conduct.',
          microTopics: [
            { key: 'individual-institutional-consequences', title: 'Individual vs Institutional Consequences', description: 'How ethical lapses affect both individuals and the institutions they serve.' },
            { key: 'trust-deficit', title: 'Trust Deficit from Unethical Conduct', description: 'How unethical conduct erodes public trust in institutions.' },
          ],
        },
      ],
    },
    {
      key: 'ethics-in-administration',
      title: 'Ethics in Public Administration',
      description: 'Applying ethical principles within governance.',
      subtopics: [
        {
          key: 'conflict-of-interest',
          title: 'Conflict of Interest',
          description: 'Situations where personal interest may compromise official duty.',
          microTopics: [
            { key: 'types-conflict-interest', title: 'Types of Conflict of Interest', description: 'Actual, potential and perceived conflicts of interest.' },
            { key: 'managing-conflict-interest', title: 'Managing Conflict of Interest', description: 'Institutional mechanisms for disclosure and recusal.' },
          ],
        },
        {
          key: 'ethical-dilemmas',
          title: 'Ethical Dilemmas in Governance',
          description: 'Recurring tensions civil servants must navigate.',
          microTopics: [
            { key: 'public-private-interest', title: 'Public vs Private Interest', description: 'Balancing personal/private interest against public duty.' },
            { key: 'whistleblowing', title: 'Whistleblowing Considerations', description: 'The ethical and institutional dimensions of whistleblowing.' },
          ],
        },
      ],
    },
  ]),

  // --- Mains GS-IV: Ethics, Integrity & Aptitude > Case Studies ---
  ...buildGranularNodesForMicrosyllabus(caseStudies.id, 'mains', caseStudies.paperId, caseStudies.subjectId, [
    {
      key: 'administrative-dilemmas',
      title: 'Administrative Dilemma Case Studies',
      description: 'Common scenario types tested in GS-IV case studies.',
      subtopics: [
        {
          key: 'conflict-scenarios',
          title: 'Conflict of Interest Scenarios',
          description: 'Case studies built around conflicting personal and official interests.',
          microTopics: [
            { key: 'personal-gain-cases', title: 'Public Servant Personal Gain Cases', description: 'Scenarios where a public servant stands to personally gain from a decision.' },
            { key: 'family-political-pressure', title: 'Family/Political Pressure Cases', description: 'Scenarios involving pressure from family or political connections.' },
          ],
        },
        {
          key: 'whistleblower-scenarios',
          title: 'Whistleblower Scenarios',
          description: 'Case studies on reporting wrongdoing.',
          microTopics: [
            { key: 'reporting-corruption', title: 'Reporting Corruption Cases', description: 'Scenarios testing how to respond to observed corruption.' },
            { key: 'loyalty-integrity-balance', title: 'Balancing Loyalty & Integrity', description: 'Scenarios weighing institutional loyalty against personal integrity.' },
          ],
        },
      ],
    },
    {
      key: 'case-study-approach',
      title: 'Case Study Approach & Technique',
      description: 'A structured method for answering GS-IV case studies.',
      subtopics: [
        {
          key: 'stakeholders-options',
          title: 'Identifying Stakeholders & Options',
          description: 'The first step in analysing any case study.',
          microTopics: [
            { key: 'stakeholder-identification', title: 'Stakeholder Identification Technique', description: 'Systematically identifying everyone affected by a decision.' },
            { key: 'weighing-values', title: 'Weighing Competing Values', description: 'Comparing the values at stake in each possible course of action.' },
          ],
        },
        {
          key: 'structuring-response',
          title: 'Structuring the Response',
          description: 'How to present a case study answer clearly.',
          microTopics: [
            { key: 'course-of-action-format', title: 'Course of Action Format', description: 'A standard format for presenting the chosen course of action.' },
            { key: 'justifying-option', title: 'Justifying the Chosen Option', description: 'Explaining why the chosen option is the most ethically sound.' },
          ],
        },
      ],
    },
  ]),

  // --- Prelims GS Paper I: History > Ancient India ---
  ...buildGranularNodesForMicrosyllabus(ancientIndia.id, 'prelims', ancientIndia.paperId, ancientIndia.subjectId, [
    { key: 'prehistoric-india', title: 'Prehistoric India', description: 'Palaeolithic, Mesolithic and Neolithic phases of human settlement in the Indian subcontinent.', subtopics: [] },
    { key: 'ivc', title: 'Indus Valley Civilization', description: 'The Harappan urban civilization — town planning, economy, script and major sites.', subtopics: [] },
    { key: 'vedic-age', title: 'Vedic Age', description: 'Early and Later Vedic society, polity, economy and religion as reflected in the Vedic texts.', subtopics: [] },
    { key: 'mahajanapadas', title: 'Mahajanapadas', description: 'The sixteen great territorial states of post-Vedic India and their rise.', subtopics: [] },
    { key: 'buddhism-jainism', title: 'Buddhism & Jainism', description: 'The origin, teachings and spread of Buddhism and Jainism in ancient India.', subtopics: [] },
    { key: 'mauryan-period', title: 'Mauryan Period', description: 'The Mauryan empire under Chandragupta, Bindusara and Ashoka, its administration and edicts.', subtopics: [] },
    { key: 'post-mauryan-period', title: 'Post-Mauryan Period', description: 'The Shunga, Kanva, Indo-Greek, Kushana and Satavahana dynasties after Mauryan decline.', subtopics: [] },
    { key: 'gupta-period', title: 'Gupta Period', description: "The Gupta empire's polity, economy and the classical age of art, science and literature.", subtopics: [] },
    { key: 'post-gupta-early-medieval', title: 'Post-Gupta / Early Medieval India', description: 'Regional kingdoms and transitions following Gupta decline, including Harshavardhana.', subtopics: [] },
    { key: 'arab-invasion', title: 'Arab Invasion', description: 'The early Arab expeditions into Sindh and their limited, localized impact on India.', subtopics: [] },
  ]),

  // --- Prelims GS Paper I: History > Medieval India ---
  ...buildGranularNodesForMicrosyllabus(medievalIndia.id, 'prelims', medievalIndia.paperId, medievalIndia.subjectId, [
    { key: 'early-medieval-india', title: 'Early Medieval India', description: 'Regional powers — Rajputs, Palas, Pratiharas and Rashtrakutas — before the Delhi Sultanate.', subtopics: [] },
    { key: 'delhi-sultanate', title: 'Delhi Sultanate', description: 'The five dynasties (Slave, Khalji, Tughlaq, Sayyid, Lodi) that ruled Delhi, 1206–1526.', subtopics: [] },
    { key: 'regional-kingdoms', title: 'Regional Kingdoms', description: 'Independent regional powers that arose alongside or after the Delhi Sultanate.', subtopics: [] },
    { key: 'vijayanagara-bahmani', title: 'Vijayanagara & Bahmani', description: 'The Vijayanagara empire and the Bahmani Sultanate in the Deccan and South India.', subtopics: [] },
    { key: 'mughal-empire', title: 'Mughal Empire', description: 'The Mughal dynasty from Babur to Aurangzeb — administration, economy and culture.', subtopics: [] },
    { key: 'marathas', title: 'Marathas', description: 'The rise of the Maratha kingdom under Shivaji and the later Maratha confederacy.', subtopics: [] },
    { key: 'later-medieval-india', title: 'Later Medieval India', description: 'Decline of Mughal central authority and the rise of successor and regional states.', subtopics: [] },
  ]),

  // --- Prelims GS Paper I: History > Modern India (British-era administration/economy, plus
  // post-independence consolidation — no separate microsyllabus item exists for the latter, so it
  // is attached here rather than forced under Indian National Movement or invented as a new item) ---
  ...buildGranularNodesForMicrosyllabus(modernIndia.id, 'prelims', modernIndia.paperId, modernIndia.subjectId, [
    { key: 'european-expansion', title: 'European Expansion', description: 'The arrival of the Portuguese, Dutch, French and English trading companies in India.', subtopics: [] },
    { key: 'british-expansion-consolidation', title: 'British Expansion & Consolidation', description: "The East India Company's territorial expansion through wars, treaties and annexation.", subtopics: [] },
    { key: 'economic-impact-british-rule', title: 'Economic Impact of British Rule', description: 'Land revenue systems, deindustrialization and drain of wealth under colonial rule.', subtopics: [] },
    { key: 'constitutional-development', title: 'Constitutional Development', description: "Key British-era legislative acts shaping India's governance before independence.", subtopics: [] },
    { key: 'integration-of-states', title: 'Integration of States', description: 'Accession and integration of over 500 princely states into the Indian Union after independence.', subtopics: [] },
    { key: 'nation-building', title: 'Nation Building', description: 'Post-independence institution building, states reorganization and early nation-building challenges.', subtopics: [] },
  ]),

  // --- Prelims GS Paper I: History > Indian National Movement ---
  ...buildGranularNodesForMicrosyllabus(indianNationalMovement.id, 'prelims', indianNationalMovement.paperId, indianNationalMovement.subjectId, [
    { key: 'revolt-1857', title: 'Revolt of 1857', description: 'Causes, course and consequences of the 1857 uprising against Company rule.', subtopics: [] },
    { key: 'socio-religious-reform', title: 'Socio-Religious Reform Movements', description: '19th-century reform movements addressing social and religious practices.', subtopics: [] },
    { key: 'indian-national-movement', title: 'Indian National Movement', description: 'The Indian National Congress and the phases of the freedom struggle up to independence.', subtopics: [] },
    { key: 'independence-partition', title: 'Independence & Partition', description: 'The events leading to independence in 1947 and the partition of India.', subtopics: [] },
  ]),

  // ============================================================================================
  // Phase 6A — Prelims GS Paper I: Geography (Social, Economic — Physical already covered above)
  // ============================================================================================
  ...fromPrelims('Social Geography', [
    t('Human Geography Fundamentals', 'Man-environment relationships and the scope of human geography.'),
    t('Population Geography', 'Distribution, density and composition of population.'),
    t('Settlement Geography', 'Rural and urban settlement types and patterns.'),
    t('Migration Patterns', 'Internal and international migration and its social impact.'),
  ]),
  ...fromPrelims('Economic Geography', [
    t('Agricultural Geography', 'Cropping patterns and agro-climatic regions.'),
    t('Industrial Geography', 'Location factors and distribution of major industries.'),
    t('Resource Geography', 'Distribution of mineral, energy and natural resources.'),
    t('Transport & Trade Geography', 'Transport networks and trade patterns.'),
  ]),

  // ============================================================================================
  // Phase 6A — Prelims GS Paper I: Indian Polity & Governance (Constitution already covered above)
  // ============================================================================================
  ...fromPrelims('Political System', [
    t('Union Executive', 'President, Vice-President, Prime Minister and Council of Ministers.'),
    t('Union Legislature', 'Parliament — composition and functioning.'),
    t('State Executive & Legislature', 'Governor, State Council of Ministers and State Legislature.'),
    t('Judiciary', 'Supreme Court, High Courts and the judicial system.'),
    t('Elections', 'The Election Commission and the electoral process.'),
  ]),
  ...fromPrelims('Panchayati Raj', [
    t('73rd & 74th Amendments', 'Constitutional basis of local self-government.'),
    t('Panchayati Raj Structure', 'Gram Panchayat, Panchayat Samiti and Zila Parishad.'),
    t('Urban Local Bodies', 'Municipalities, Municipal Corporations and Nagar Panchayats.'),
    t('Decentralization Issues', 'Devolution of powers, finances and functions.'),
  ]),
  ...fromPrelims('Public Policy', [
    t('Policy Formulation & Implementation', 'Stages of the public policy cycle.'),
    t('Government Schemes', 'Major central and state welfare schemes.'),
    t('Regulatory Bodies', 'Role of regulatory and statutory bodies.'),
  ]),
  ...fromPrelims('Rights Issues', [
    t('Fundamental Rights', 'Part III of the Constitution.'),
    t('Directive Principles of State Policy', 'Part IV of the Constitution.'),
    t('Fundamental Duties', 'Part IVA of the Constitution.'),
    t('Human Rights Bodies', 'National and State Human Rights Commissions.'),
  ]),

  // ============================================================================================
  // Phase 6A — Prelims GS Paper I: Economic & Social Development
  // ============================================================================================
  ...fromPrelims('Sustainable Development', [
    t('Sustainable Development Goals', "The UN SDGs and India's progress."),
    t('Green Economy & Growth', 'Sustainable growth models and green economy initiatives.'),
  ]),
  ...fromPrelims('Poverty & Inclusion', [
    t('Poverty Measurement', 'Poverty lines and estimation methodology.'),
    t('Financial Inclusion', 'Banking access and financial inclusion schemes.'),
    t('Social Inclusion Programmes', 'Affirmative action and inclusion policies.'),
  ]),
  ...fromPrelims('Demographics', [
    t('Census & Population Data', 'Census of India and key demographic indicators.'),
    t('Demographic Dividend', 'Age structure and workforce implications.'),
  ]),
  ...fromPrelims('Social Sector Initiatives', [
    t('Health Sector Initiatives', 'National health programmes and missions.'),
    t('Education Sector Initiatives', 'National education programmes and missions.'),
    t('Nutrition & Sanitation Initiatives', 'National nutrition and sanitation missions.'),
  ]),

  // ============================================================================================
  // Phase 6A — Prelims GS Paper I: Environment & Ecology
  // ============================================================================================
  ...fromPrelims('Environmental Ecology', [
    t('Ecosystem Basics', 'Structure, function and types of ecosystems.'),
    t('Environmental Legislation', 'Key environmental protection laws in India.'),
    t('Environmental Institutions', 'Regulatory and monitoring bodies.'),
  ]),
  ...fromPrelims('Biodiversity', [
    t('Biodiversity Hotspots', 'Global and Indian biodiversity hotspots.'),
    t('Protected Areas', 'National parks, sanctuaries and biosphere reserves.'),
    t('Wildlife Conservation', 'Conservation laws and flagship species programmes.'),
  ]),
  ...fromPrelims('Climate Change', [
    t('Climate Change Science', 'Causes and mechanisms of global warming.'),
    t('International Climate Agreements', 'UNFCCC, the Paris Agreement and related frameworks.'),
    t("India's Climate Policy", "India's national action plans on climate change."),
  ]),

  // ============================================================================================
  // Phase 6A — Prelims GS Paper I: Science & Technology, Current Affairs
  // ============================================================================================
  ...fromPrelims('General Science', [
    t('Physics Fundamentals', 'Core physics concepts relevant to general awareness.'),
    t('Chemistry Fundamentals', 'Core chemistry concepts relevant to general awareness.'),
    t('Biology Fundamentals', 'Core biology concepts relevant to general awareness.'),
  ]),
  ...fromPrelims('Science & Technology in Everyday Life', [
    t('Health & Medicine', 'Everyday applications of science in health and medicine.'),
    t('Digital Technology', 'Everyday applications of IT and digital tools.'),
    t('Agriculture & Food Technology', 'Everyday science in agriculture and food.'),
  ]),
  ...fromPrelims('National Current Affairs', [
    t('Government Schemes & Policies', 'Recent national schemes and policy announcements.'),
    t('National Appointments & Awards', 'Key appointments, awards and honours.'),
  ]),
  ...fromPrelims('International Current Affairs', [
    t('International Relations Events', 'Bilateral and multilateral developments.'),
    t('Global Summits & Agreements', 'Major international summits and agreements.'),
  ]),

  // ============================================================================================
  // Phase 6A — CSAT (Basic Numeracy already covered above)
  // ============================================================================================
  ...fromPrelims('Comprehension', [
    t('Passage-Based Comprehension', 'Reading and inference from passages.'),
    t('Vocabulary in Context', 'Word meaning derived from context.'),
    t('Critical Reasoning in Passages', 'Identifying argument structure and tone.'),
  ]),
  ...fromPrelims('Interpersonal/Communication Skills', [
    t('Communication Skills', 'Verbal and written communication fundamentals.'),
    t('Interpersonal Skills', 'Teamwork and interpersonal effectiveness.'),
  ]),
  ...fromPrelims('Logical Reasoning', [
    t('Verbal Reasoning', 'Syllogisms, statements and assumptions.'),
    t('Non-Verbal Reasoning', 'Series, patterns and visual reasoning.'),
    t('Analytical Reasoning', 'Puzzles, arrangements and logical deduction.'),
  ]),
  ...fromPrelims('Analytical Ability', [
    t('Analytical Puzzles', 'Arrangement and grouping puzzles.'),
    t('Data Sufficiency', 'Analytical data-sufficiency questions.'),
  ]),
  ...fromPrelims('Decision Making/Problem Solving', [
    t('Decision-Making Frameworks', 'Structured approaches to making decisions.'),
    t('Problem-Solving Techniques', 'Structured approaches to problem solving.'),
  ]),
  ...fromPrelims('General Mental Ability', [
    t('Number Series & Patterns', 'Numerical pattern recognition.'),
    t('Coding-Decoding', 'Coding and decoding techniques.'),
    t('Blood Relations & Directions', 'Relation- and direction-based reasoning.'),
  ]),
  ...fromPrelims('Data Interpretation', [
    t('Tables & Graphs', 'Interpreting tabular and graphical data.'),
    t('Data Sufficiency', 'Sufficiency-based data interpretation.'),
    t('Pie Charts & Bar Diagrams', 'Interpreting chart-based data.'),
  ]),

  // ============================================================================================
  // Phase 6A — Mains GS-I (Modern Indian History, Physical Geography already covered above)
  // ============================================================================================
  ...fromMains('Art Forms', [
    t('Classical Dance Forms', 'The eight classical dance forms of India.'),
    t('Classical Music Traditions', 'Hindustani and Carnatic music traditions.'),
    t('Painting Traditions', 'Major Indian painting styles and schools.'),
    t('Theatre & Folk Arts', 'Folk and traditional performing art forms.'),
  ]),
  ...fromMains('Literature', [
    t('Ancient & Classical Literature', 'Sanskrit, Pali and Prakrit literary traditions.'),
    t('Medieval Literature', 'Bhakti and Sufi literary movements.'),
    t('Modern Indian Literature', 'Literature from the colonial and post-colonial periods.'),
  ]),
  ...fromMains('Architecture', [
    t('Ancient & Buddhist Architecture', 'Rock-cut and Buddhist architectural traditions.'),
    t('Temple Architecture', 'Nagara, Dravida and Vesara styles.'),
    t('Indo-Islamic Architecture', 'Sultanate and Mughal architectural styles.'),
    t('Colonial & Modern Architecture', 'Colonial-era and post-independence architecture.'),
  ]),
  ...fromMains('Freedom Struggle', [
    t('Early Nationalist Phase', 'Moderates and Extremists in the Indian National Congress.'),
    t('Gandhian Era Movements', 'Non-Cooperation, Civil Disobedience and Quit India.'),
    t('Revolutionary Movements', 'Armed revolutionary activities and organizations.'),
    t('Contributions from the Regions', 'Regional leaders and movements across India.'),
  ]),
  ...fromMains('Post-Independence Consolidation', [
    t('Integration of Princely States', 'Accession and integration process after independence.'),
    t('Linguistic Reorganization of States', 'The States Reorganisation Act and its aftermath.'),
    t('Early Institution Building', 'The Planning Commission and early institutional frameworks.'),
  ]),
  ...fromMains('World History', [
    t('Industrial Revolution', 'Causes and global impact of the Industrial Revolution.'),
    t('World Wars', 'Causes, course and consequences of the two World Wars.'),
    t('Colonization & Decolonization', 'Colonial expansion and decolonization movements.'),
    t('Political Philosophies', 'Capitalism, socialism, communism and other ideologies.'),
  ]),
  ...fromMains('Distribution of Natural Resources', [
    t('Mineral Resources', 'Global and South Asian mineral resource distribution.'),
    t('Energy Resources', 'Global and South Asian energy resource distribution.'),
    t('Water Resources', 'Distribution and management of water resources.'),
  ]),
  ...fromMains('Industrial Location Factors', [
    t('Primary Sector Location Factors', 'Factors governing agriculture and extraction industries.'),
    t('Secondary Sector Location Factors', 'Factors governing manufacturing industries.'),
    t('Tertiary Sector Location Factors', 'Factors governing service-sector location.'),
  ]),
  ...fromMains('Geophysical Phenomena', [
    t('Earthquakes & Tsunamis', 'Causes and global distribution of earthquakes and tsunamis.'),
    t('Volcanic Activity', 'Types and distribution of volcanic activity.'),
    t('Cyclones & Storms', 'Formation and tracking of tropical cyclones.'),
  ]),
  ...fromMains('Indian Society & Diversity', [
    t('Religious & Linguistic Diversity', "India's plural religious and linguistic composition."),
    t('Caste & Social Structure', 'The caste system and its evolution.'),
    t('Regional Cultural Diversity', 'Cultural variation across Indian regions.'),
  ]),
  ...fromMains("Role of Women & Women's Organizations", [
    t("Women's Movements in India", 'Historical and contemporary women\'s movements.'),
    t("Women's Organizations", "Major women's organizations and their role."),
    t('Gender Empowerment Policies', "Legal and policy measures for women's empowerment."),
  ]),
  ...fromMains('Population & Associated Issues', [
    t('Population Growth Trends', 'The demographic transition in India.'),
    t('Population Policy', 'National population policy and family planning.'),
    t('Population-Related Challenges', 'Issues arising from population pressure.'),
  ]),
  ...fromMains('Poverty & Developmental Issues', [
    t('Poverty Dimensions', 'Multidimensional poverty and its measurement.'),
    t('Rural Development Issues', 'Challenges in rural development.'),
    t('Urban Poverty', 'Urban poverty and slum-related issues.'),
  ]),
  ...fromMains('Urbanization', [
    t('Urbanization Trends', 'Patterns and drivers of urbanization in India.'),
    t('Urban Infrastructure Challenges', 'Housing, sanitation and civic infrastructure issues.'),
    t('Smart Cities & Urban Planning', 'Urban planning initiatives and the Smart Cities Mission.'),
  ]),
  ...fromMains('Effects of Globalization on Indian Society', [
    t('Economic Effects of Globalization', 'Impact of globalization on the Indian economy and society.'),
    t('Cultural Effects of Globalization', "Impact of globalization on India's culture and lifestyle."),
    t('Social Effects of Globalization', 'Impact of globalization on social structures and values.'),
  ]),
  ...fromMains('Social Empowerment', [
    t('Empowerment of Marginalized Groups', 'SC/ST/OBC empowerment measures.'),
    t('Empowerment through Education', 'The role of education in social empowerment.'),
    t('Empowerment through Legislation', 'Affirmative action and legal empowerment.'),
  ]),
  ...fromMains('Communalism, Regionalism & Secularism', [
    t('Communalism in India', 'Causes and manifestations of communal tension.'),
    t('Regionalism & Sub-Nationalism', 'Regional identity movements.'),
    t('Secularism', 'The Indian model of secularism.'),
  ]),

  // ============================================================================================
  // Phase 6A — Mains GS-II (Constitution — Evolution & Features, India & its Neighborhood already
  // covered above)
  // ============================================================================================
  ...fromMains('Functions & Responsibilities of Union & States', [
    t('Centre-State Relations', 'Legislative, administrative and financial relations.'),
    t('Federal Structure Challenges', "Issues and challenges in India's federal system."),
    t('Inter-State Councils', 'Bodies for inter-state and Centre-State coordination.'),
  ]),
  ...fromMains('Separation of Powers', [
    t('Doctrine of Separation of Powers', 'Theory and Indian application of separation of powers.'),
    t('Checks & Balances', "Mechanisms limiting each organ's power."),
    t('Dispute Redressal Institutions', 'Tribunals and dispute-resolution bodies.'),
  ]),
  ...fromMains('Parliament & State Legislatures', [
    t('Parliamentary Structure & Composition', 'The Lok Sabha and Rajya Sabha.'),
    t('Legislative Procedure', 'How a bill becomes law.'),
    t('Powers & Privileges', 'Parliamentary privileges and conduct of business.'),
    t('State Legislatures', 'Structure and functioning of state legislatures.'),
  ]),
  ...fromMains('Executive & Judiciary', [
    t('Union Executive Structure', 'Organization of ministries and departments.'),
    t('Judicial Structure', 'Organization of the Supreme Court and High Courts.'),
    t('Judicial Review & Activism', 'Judicial review powers and judicial activism.'),
  ]),
  ...fromMains('Government Policies & Interventions', [
    t('Sectoral Policy Interventions', 'Government policies across key development sectors.'),
    t('Policy Design Issues', 'Challenges in policy design.'),
    t('Policy Implementation Issues', 'Challenges in policy implementation.'),
  ]),
  ...fromMains('Development Processes & the Development Industry', [
    t('Role of NGOs', 'Non-governmental organizations in development.'),
    t('Self-Help Groups', 'SHGs and their developmental role.'),
    t('Civil Society Groups', 'Associations and civil society participation.'),
  ]),
  ...fromMains('Welfare Schemes for Vulnerable Sections', [
    t('Schemes for SC/ST/OBC', 'Welfare schemes for scheduled and backward communities.'),
    t('Schemes for Women & Children', 'Welfare schemes for women and children.'),
    t('Schemes for Elderly & Disabled', 'Welfare schemes for elderly and differently-abled persons.'),
  ]),
  ...fromMains('E-Governance', [
    t('E-Governance Models', 'Models and frameworks for digital governance.'),
    t('Digital India Initiatives', 'Flagship e-governance programmes.'),
    t('E-Governance Challenges', 'Limitations and implementation challenges.'),
  ]),
  ...fromMains('Transparency & Accountability', [
    t('Right to Information', 'The RTI Act and its implementation.'),
    t("Citizens' Charters", 'Service-delivery accountability mechanisms.'),
    t('Accountability Institutions', 'CAG, Lokpal and related institutions.'),
  ]),
  ...fromMains('Development & Management of Social Sector/Services', [
    t('Health Sector Management', 'Issues in health sector development.'),
    t('Education Sector Management', 'Issues in education sector development.'),
    t('Human Resource Development', 'HR development in the social sector.'),
  ]),
  ...fromMains('Poverty & Hunger Issues', [
    t('Hunger & Malnutrition', 'Food insecurity and malnutrition issues.'),
    t('Food Security Mechanisms', 'The PDS and food-security frameworks.'),
    t('Poverty Alleviation Programmes', 'Major anti-poverty programmes.'),
  ]),
  ...fromMains('Bilateral, Regional & Global Groupings', [
    t('Bilateral Relations', "India's key bilateral relationships."),
    t('Regional Groupings', 'SAARC, BIMSTEC and regional cooperation.'),
    t('Global Groupings', 'G20, BRICS and other global forums.'),
  ]),
  ...fromMains('Indian Diaspora', [
    t('Indian Diaspora Overview', 'Distribution and significance of the Indian diaspora.'),
    t('Diaspora Policy', 'Government engagement with overseas Indians.'),
    t("Developed Countries' Policies", "Effect of developed nations' policies on India."),
  ]),
  ...fromMains('Important International Institutions', [
    t('United Nations System', "UN bodies and India's role."),
    t('International Financial Institutions', 'IMF, World Bank and related bodies.'),
    t('Trade & Other Institutions', 'WTO and other international institutions.'),
  ]),

  // ============================================================================================
  // Phase 6A — Mains GS-III (Indian Economy — Planning/Resources/Growth, Developments & their
  // Applications already covered above)
  // ============================================================================================
  ...fromMains('Government Budgeting', [
    t('Budget Process', 'Formulation and passage of the Union Budget.'),
    t('Fiscal Policy Tools', 'Taxation, expenditure and fiscal-deficit management.'),
    t('Budgetary Reforms', 'Reforms in budgeting practices.'),
  ]),
  ...fromMains('Inclusive Growth', [
    t('Inclusive Growth Concept', 'Meaning and dimensions of inclusive growth.'),
    t('Financial Inclusion Measures', 'Schemes promoting inclusive growth.'),
    t('Regional Disparities', 'Addressing regional imbalance in growth.'),
  ]),
  ...fromMains('Land Reforms', [
    t('Land Reform History', 'Land-reform measures since independence.'),
    t('Land Ceiling & Tenancy', 'Land-ceiling laws and tenancy reforms.'),
    t('Land Records Modernization', 'Digitization and land-record reforms.'),
  ]),
  ...fromMains('Effects of Liberalization on the Economy', [
    t('Industrial Policy Changes', "Evolution of India's industrial policy."),
    t('LPG Reforms', 'The Liberalization, Privatization and Globalization reforms of 1991.'),
    t('Effects on Industrial Growth', 'Impact of liberalization on industrial growth.'),
  ]),
  ...fromMains('Infrastructure', [
    t('Energy Infrastructure', 'Power generation and distribution infrastructure.'),
    t('Transport Infrastructure', 'Roads, railways, ports and airports.'),
    t('Infrastructure Financing', 'Models for financing infrastructure projects.'),
  ]),
  ...fromMains('Investment Models', [
    t('Public-Private Partnership', 'PPP models in India.'),
    t('Foreign Direct Investment', 'FDI policy and trends.'),
    t('Infrastructure Investment Trusts', 'InvITs and related investment vehicles.'),
  ]),
  ...fromMains('Major Crops & Cropping Patterns', [
    t('Major Crops of India', 'Staple and cash-crop distribution.'),
    t('Cropping Seasons', 'Kharif, Rabi and Zaid cropping patterns.'),
    t('Irrigation Systems', 'Major irrigation methods and networks.'),
  ]),
  ...fromMains('Storage, Transport & Marketing of Agricultural Produce', [
    t('Agricultural Storage', 'Warehousing and storage infrastructure.'),
    t('Agricultural Marketing', 'APMC and agricultural marketing reforms.'),
    t('Transport Constraints', 'Logistics challenges in agriculture.'),
  ]),
  ...fromMains('E-Technology in Aid of Farmers', [
    t('Digital Advisory Services', 'E-technology for farm advisory services.'),
    t('Agri-Tech Platforms', 'Digital platforms for farmers.'),
    t('Precision Farming', 'Technology-driven farming techniques.'),
  ]),
  ...fromMains('Food Processing & Related Industries', [
    t('Food Processing Industry', "The structure of India's food processing sector."),
    t('Value Addition', 'Value chains in food processing.'),
    t('Food Processing Policy', 'Government schemes for food processing.'),
  ]),
  ...fromMains('Public Distribution System & Food Security', [
    t('PDS Structure', 'Objectives and functioning of the Public Distribution System.'),
    t('PDS Reforms', 'Revamping and technology use in the PDS.'),
    t('Buffer Stock Management', 'Food security and buffer-stock policy.'),
  ]),
  ...fromMains('Achievements of Indians in Science & Technology', [
    t('Space Achievements', "ISRO's major missions and achievements."),
    t('Defence Technology', 'Indigenous defence technology development.'),
    t('Indigenization Efforts', 'Make in India and technology indigenization.'),
  ]),
  ...fromMains('Awareness in IT, Space, Computers, Robotics, Nano/Biotechnology', [
    t('Information Technology', 'IT sector developments and applications.'),
    t('Space Technology', 'Space technology applications.'),
    t('Robotics & Nanotechnology', 'Emerging robotics and nanotechnology applications.'),
    t('Biotechnology', 'Biotechnology applications and developments.'),
  ]),
  ...fromMains('Intellectual Property Rights', [
    t('IPR Framework', 'Patents, copyrights and trademarks in India.'),
    t('IPR Enforcement', 'Enforcement mechanisms and challenges.'),
    t('International IPR Agreements', 'TRIPS and related international frameworks.'),
  ]),
  ...fromMains('Conservation, Pollution & Degradation', [
    t('Pollution Types & Sources', 'Air, water and soil pollution.'),
    t('Environmental Impact Assessment', 'The EIA process and framework.'),
    t('Conservation Strategies', 'Conservation approaches and policies.'),
  ]),
  ...fromMains('Disaster & Disaster Management', [
    t('Disaster Types', 'Natural and man-made disaster classification.'),
    t('Disaster Management Cycle', 'Mitigation, preparedness, response and recovery.'),
    t('Disaster Management Institutions', 'The NDMA and related institutional framework.'),
  ]),
  ...fromMains('Linkages of Organized Crime with Terrorism', [
    t('Organized Crime Networks', 'The structure of organized crime in India.'),
    t('Terror Financing', 'Linkages between organized crime and terror financing.'),
    t('Counter-Terrorism Measures', 'Legal and institutional counter-terrorism framework.'),
  ]),
  ...fromMains('Role of External State & Non-State Actors', [
    t('State-Sponsored Threats', 'External state-sponsored security challenges.'),
    t('Non-State Actors', 'The role of non-state actors in internal security threats.'),
    t('Proxy Warfare', 'Proxy war and asymmetric threats.'),
  ]),
  ...fromMains('Security Challenges in Border Areas', [
    t('Land Border Challenges', "Challenges along India's land borders."),
    t('Coastal Security', 'Maritime and coastal security challenges.'),
    t('Border Management Institutions', 'Agencies managing border security.'),
  ]),
  ...fromMains('Cyber Security', [
    t('Cyber Threats', 'Types of cyber threats and attacks.'),
    t('Cyber Security Framework', 'National cyber-security policy and institutions.'),
    t('Critical Infrastructure Protection', 'Protecting critical information infrastructure.'),
  ]),
  ...fromMains('Money Laundering & its Prevention', [
    t('Money Laundering Methods', 'Techniques of money laundering.'),
    t('Legal Framework', 'The PMLA and related legislation.'),
    t('Enforcement Mechanisms', 'Agencies combating money laundering.'),
  ]),

  // ============================================================================================
  // Phase 6A — Mains GS-IV (Ethics & Human Interface, Case Studies already covered above)
  // ============================================================================================
  ...fromMains('Attitude', [
    t('Attitude Structure', 'Cognitive, affective and behavioural components.'),
    t('Attitude Formation', 'Factors influencing attitude formation and change.'),
    t('Moral & Political Attitudes', 'Attitudes relevant to public administration.'),
  ]),
  ...fromMains('Aptitude & Foundational Values for Civil Service', [
    t('Civil Service Values', 'Foundational values for public service.'),
    t('Integrity & Impartiality', 'Core administrative values.'),
    t('Non-Partisanship', 'Objectivity in public administration.'),
  ]),
  ...fromMains('Emotional Intelligence', [
    t('EI Concepts', 'Components and models of emotional intelligence.'),
    t('EI in Administration', 'Application of emotional intelligence in governance.'),
    t('Developing EI', 'Techniques for developing emotional intelligence.'),
  ]),
  ...fromMains('Probity in Governance', [
    t('Concept of Public Service', 'The philosophical basis of public service.'),
    t('Codes of Conduct', 'Codes of ethics and conduct for civil servants.'),
    t('Work Culture & Quality of Service', 'Probity in the delivery of public services.'),
  ]),
];
