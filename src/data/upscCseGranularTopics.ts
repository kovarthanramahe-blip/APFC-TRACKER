import type { UpscCseExamStage } from '../lib/upscCseSyllabus';
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
];
