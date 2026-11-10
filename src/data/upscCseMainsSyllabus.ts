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

// History Optional (Phase 1 Completion — Library Mode Audit + History Optional Integration task).
// The prior stage added only a structural placeholder (upsc.gov.in was unreachable from this
// environment — see git history for that blocker writeup). This stage replaces it with the full
// Paper I / Paper II unit hierarchy from a History Optional syllabus document the USER supplied
// directly in chat as this task's explicit source.
//
// SOURCE-VERIFICATION NOTE (read before trusting this as "the" official syllabus): this content
// comes from user-supplied Markdown, not a direct fetch of upsc.gov.in. The supplied text itself
// contains embedded hyperlink markup pointing at a coaching site (lotusarise.com) on three Paper II
// unit headings (ids ending -other-strands-in-the-national-movement, -consolidation-as-a-nation,
// -caste-and-ethnicity-after-1947) — that markup (the "[...](url)" wrapper) has been stripped here
// as pure web-page furniture, never as a content edit; the words themselves are unchanged. Every
// unit's title/description below is transcribed AS SUPPLIED, including its exact wording and any
// apparent typos (e.g. "casuses" in Paper II's unit 7) — never silently corrected, never
// paraphrased, never merged with another unit. Official verbatim accuracy against the primary
// upsc.gov.in notification has still NOT been independently established by this project — treat
// this as "as supplied by the user," not as independently fetched-and-verified official text, until
// that verification happens.
const HISTORY_OPTIONAL_PAPER_1: SubjectSeed = {
  key: 'history-optional-paper-1',
  title: 'History Optional — Paper I',
  microsyllabus: [
    { key: 'sources', title: 'Sources', description: 'Archaeological sources: Exploration, excavation, epigraphy, numismatics, monuments. Literary sources — Indigenous: Primary and secondary; poetry, scientific literature, literature, literature in regional languages, religious literature. Foreign account: Greek, Chinese and Arab writers.' },
    { key: 'pre-history-and-proto-history', title: 'Pre‐history and Proto‐history', description: 'Geographical factors; hunting and gathering (paleolithic and mesolithic); Beginning of agriculture (neolithic and chalcolithic).' },
    { key: 'indus-valley-civilization', title: 'Indus Valley Civilization', description: 'Origin, date, extent, characteristics-decline, survival and significance, art and architecture.' },
    { key: 'megalithic-cultures', title: 'Megalithic Cultures', description: 'Distribution of pastoral and farming cultures outside the Indus, Development of community life, Settlements, Development of agriculture, Crafts, Pottery, and Iron industry.' },
    { key: 'aryans-and-vedic-period', title: 'Aryans and Vedic Period', description: 'Expansions of Aryans in India. Vedic Period: Religious and philosophic literature; Transformation from Rig Vedic period to the later Vedic period; Political, social and economical life; Significance of the Vedic Age; Evolution of Monarchy and Varna system.' },
    { key: 'period-of-mahajanapadas', title: 'Period of Mahajanapadas', description: 'Formation of States (Mahajanapada): Republics and monarchies; Rise of urban centres; Trade routes; Economic growth; Introduction of coinage; Spread of Jainism and Buddism; Rise of Magadha and Nandas. Iranian and Mecedonian invasions and their impact.' },
    { key: 'mauryan-empire', title: 'Mauryan Empire', description: 'Foundation of the Mauryan Empire, Chandragupta, Kautilya and Arthashastra; Ashoka; Concept of Dharma; Edicts; Polity, Administration, Economy; Art, architecture and sculpture; External contacts; Religion; Spread of religion; Literature. Disintegration of the empire; sungas and Kanvas.' },
    { key: 'post-mauryan-period', title: 'Post‐Mauryan Period (Indo‐Greeks, Sakas, Kushanas, Western Kshatrapas)', description: 'Contact with outside world; growth of urban centres, economy, coinage, development of religions, Mahayana, social conditions, art, architecture, culture, literature and science.' },
    { key: 'early-state-and-society-eastern-india-deccan-south-india', title: 'Early State and Society in Eastern India, Deccan and South India', description: 'Kharavela, The Satavahanas, Tamil States of the Sangam Age; Administration, Economy, land grants, coinage, trade guilds and urban centres; Buddhist centres; Sangam literature and culture; Art and architecture.' },
    { key: 'guptas-vakatakas-and-vardhanas', title: 'Guptas, Vakatakas and Vardhanas', description: 'Polity and administration, Economic conditions, Coinage of the Guptas, Land grants, Decline of urban centres, Indian feudalism, Caste system, Position of women, Education and educational institutions; Nalanda, Vikramshila and Vallabhi, Literature, scientific literature, art and architecture.' },
    { key: 'regional-states-during-gupta-era', title: 'Regional States during Gupta Era', description: 'The Kadambas, Pallavas, Chalukyas of Badami; Polity and Administration, Trade guilds, Literature; growth of Vaishnava and Saiva religions. Tamil Bhakit movement, Shankaracharya; Vedanta; Institutions of temple and temple architecture; Palas, Senas, Rashtrakutas, Paramaras, Polity and administration; Cultural aspects. Arab conquest of Sind; Alberuni, The Chaluky as of Kalyana, Cholas, Hoysalas, Pandyas; Polity and Administration; Local Government; Growth of art and architecture, religious sects, Institution of temple and Mathas, Agraharas, education and literature, economy and society.' },
    { key: 'themes-in-early-indian-cultural-history', title: 'Themes in Early Indian Cultural History', description: 'Languages and texts, major stages in the evolution of art and architecture, major philosophical thinkers and schools, ideas in Science and Mathematics.' },
    { key: 'early-medieval-india-750-1200', title: 'Early Medieval India, 750‐1200', description: 'Polity: Major political developments in Northern India and the peninsula, origin and the rise of Rajputs. The Cholas: administration, village economy and society "Indian Feudalism". Agrarian economy and urban settlements. Trade and commerce. Society: the status of the Brahman and the new social order. Condition of women. Indian science and technology.' },
    { key: 'cultural-traditions-in-india-750-1200', title: 'Cultural Traditions in India, 750‐1200', description: 'Philosophy: Skankaracharya and Vedanta, Ramanuja and Vishishtadvaita, Madhva and Brahma-Mimansa. Religion: Forms and features of religion, Tamil devotional cult, growth of Bhakti, Islam and its arrival in India, Sufism. Literature: Literature in Sanskrit, growth of Tamil literature, literature in the newly developing languages, Kalhan’s Rajtarangini, Alberuni’s India. Art and Architecture: Temple architecture, sculpture, painting.' },
    { key: 'the-thirteenth-century', title: 'The Thirteenth Century', description: 'Establishment of the Delhi Sultanate: The Ghurian invasions – factors behind Ghurian success. Economic, Social and cultural consequences. Foundation of Delhi Sultanate and early Turkish Sultans. Consolidation: The rule of Iltutmish and Balban.' },
    { key: 'the-fourteenth-century', title: 'The Fourteenth Century', description: '"The Khalji Revolution". Alauddin Khalji: Conquests and territorial expansion, agrarian and economic measure. Muhammad Tughluq: Major projects, agrarian measures, bureaucracy of Muhammad Tughluq. Firuz Tugluq: Agrarian measures, achievements in civil engineering and public works, decline of the Sultanate, foreign contacts and Ibn Battuta’s account.' },
    { key: 'society-culture-and-economy-13th-14th-centuries', title: 'Society, Culture and Economy in the Thirteenth and Fourteenth Centuries', description: 'Society: composition of rural society, ruling classes, town dwellers, women, religious classes, caste and slavery under the Sultanate, Bhakti movement, Sufi movement. Culture: Persian literature, literature in the regional languages of North India, literaute in the languages of South India, Sultanate architecture and new structural forms, painting, evolution of a composite culture. Economy: Agricultural Production, rise of urban economy and non-agricultural production, trade and commerce.' },
    { key: 'fifteenth-early-sixteenth-century-political-developments-and-economy', title: 'The Fifteenth and Early Sixteenth Century‐Political Developments and Economy', description: 'Rise of Provincial Dynasties: Bengal, Kashmir (Zainul Abedin), Gujarat. Malwa, Bahmanids. The Vijayanagara Empire. Lodis. Mughal Empire, first phase: Babur, Humayun. The Sur Empire: Sher Shah’s administration. Portuguese colonial enterprise, Bhakti and Sufi Movements.' },
    { key: 'fifteenth-early-sixteenth-century-society-and-culture', title: 'The Fifteenth and Early Sixteenth Century‐ Society and culture', description: 'Regional cultures specificities. Literary traditions. Provincial architectural. Society, culture, literature and the arts in Vijayanagara Empire.' },
    { key: 'akbar', title: 'Akbar', description: 'Conquests and consolidation of empire. Establishment of jagir and mansab systems. Rajput policy. Evolution of religious and social outlook. Theory of Sulh‐i‐kul and religious policy. Court patronage of art and technology.' },
    { key: 'mughal-empire-in-the-seventeenth-century', title: 'Mughal Empire in the Seventeenth Century', description: 'Major administrative policies of Jahangir, Shahjahan and Aurangzeb. The Empire and the Zamindars. Religious policies of Jahangir, Shahjahan and Aurangzeb. Nature of the Mughal State. Late Seventeenth Century crisis and the revolts. The Ahom kingdom. Shivaji and the early Maratha Kingdom.' },
    { key: 'economy-and-society-16th-17th-centuries', title: 'Economy and society, in the 16th and 17th Centuries', description: 'Population Agricultural and craft production. Towns, commerce with Europe through Dutch, English and French companies: a trade revolution. Indian mercantile classes. Banking, insurance and credit systems. Conditions of peasants, Condition of Women. Evolution of the Sikh community and the Khalsa Panth.' },
    { key: 'culture-during-mughal-empire', title: 'Culture during Mughal Empire', description: 'Persian histories and other literature. Hindi and religious literatures. Mughal architecture. Mughal painting. Provincial architecture and painting. Classical music. Science and technology.' },
    { key: 'the-eighteenth-century', title: 'The Eighteenth Century', description: 'Factors for the decline of the Mughal Empire. The regional principalities: Nizam’s Deccan, Bengal, Awadh. Maratha ascendancy under the Peshwas. The Maratha fiscal and financial system. Emergence of Afghan power Battle of Panipat, 1761. State of, political, cultural and economic, on eve of the British conquest.' },
  ],
};

const HISTORY_OPTIONAL_PAPER_2: SubjectSeed = {
  key: 'history-optional-paper-2',
  title: 'History Optional — Paper II',
  microsyllabus: [
    { key: 'european-penetration-into-india', title: 'European Penetration into India', description: 'The Early European Settlements; The Portuguese and the Dutch; The English and the French East India Companies; Their struggle for supremacy; Carnatic Wars; Bengal-The conflict between the English and the Nawabs of Bengal; Siraj and the English; The Battle of Plassey; Significance of Plassey.' },
    { key: 'british-expansion-in-india', title: 'British Expansion in India', description: 'Bengal-Mir Jafar and Mir Kasim; The Battle of Buxar; Mysore; The Marathas; The three Anglo-Maratha Wars; The Punjab.' },
    { key: 'early-structure-of-the-british-raj', title: 'Early Structure of the British Raj', description: 'The Early administrative structure; From diarchy to direct contol; The Regulating Act (1773); The Pitt’s India Act (1784); The Charter Act (1833); The Voice of free trade and the changing character of British colonial rule; The English utilitarian and India.' },
    { key: 'economic-impact-of-british-colonial-rule', title: 'Economic Impact of British Colonial Rule', description: '(a) Land revenue settlements in British India; The Permanent Settlement; Ryotwari Settlement; Mahalwari Settlement; Economic impact of the revenue arrangements; Commercialization of agriculture; Rise of landless agrarian labourers; Impoverishment of the rural society. (b) Dislocation of traditional trade and commerce; De-industrialisation; Decline of traditional crafts; Drain of wealth; Economic transformation of India; Railroad and communication network including telegraph and postal services; Famine and poverty in the rural interior; European business enterprise and its limitations.' },
    { key: 'social-and-cultural-developments', title: 'Social and Cultural Developments', description: 'The state of indigenous education, its dislocation; Orientalist-Anglicist controversy, The introduction of western education in India; The rise of press, literature and public opinion; The rise of modern vernacular literature; Progress of Science; Christian missionary activities in India.' },
    { key: 'social-and-religious-reform-movements-bengal-and-other-areas', title: 'Social and Religious Reform Movements in Bengal and Other Areas', description: 'Ram Mohan Roy, The Brahmo Movement; Devendranath Tagore; Iswarchandra Vidyasagar; The Young Bengal Movement; Dayanada Saraswati; The social reform movements in India including Sati, widow remarriage, child marriage etc.; The contribution of Indian renaissance to the growth of modern India; Islamic revivalism-the Feraizi and Wahabi Movements.' },
    { key: 'indian-response-to-british-rule', title: 'Indian Response to British Rule', description: 'Peasant movement and tribal uprisings in the 18th and 19th centuries including the Rangpur Dhing (1783), the Kol Rebellion (1832), the Mopla Rebellion in Malabar (1841-1920), the Santal Hul (1855), Indigo Rebellion (1859-60), Deccan Uprising (1875) and the Munda Ulgulan (1899-1900); The Great Revolt of 1857 —Origin, character, casuses of failure, the consequences; The shift in the character of peasant uprisings in the post-1857 period; the peasant movements of the 1920s and 1930s.' },
    { key: 'birth-of-indian-nationalism', title: 'Factors leading to the birth of Indian Nationalism', description: 'Factors leading to the birth of Indian Nationalism; Politics of Association; The Foundation of the Indian National Congress; The Safety-valve thesis relating to the birth of the Congress; Programme and objectives of Early Congress; the social composition of early Congress leadership; the Moderates and Extremists; The Partition of Bengal (1905); The Swadeshi Movement in Bengal; the economic and political aspects of Swadeshi Movement; The beginning of revolutionary extremism in India.' },
    { key: 'rise-of-gandhi', title: 'Rise of Gandhi', description: 'Character of Gandhian nationalism; Gandhi’s popular appeal; Rowlatt Satyagraha; the Khilafat Movement; the Non-cooperation Movement; National politics from the end of the Non-cooperation movement to the beginning of the Civil Disobedience Movement; the two phases of the Civil Disobedience Movement; Simon Commission; The Nehru Report; the Round Table Conferences; Nationalism and the Peasant Movements; Nationalism and Working class movements; Women and Indian youth and students in Indian politics (1885-1947); the election of 1937 and the formation of ministries; Cripps Mission; the Quit India Movement; the Wavell Plan; The Cabinet Mission.' },
    { key: 'constitutional-developments-1858-1935', title: 'Constitutional Developments in the Colonial India between 1858 and 1935', description: 'Constitutional Developments in the Colonial India between 1858 and 1935.' },
    { key: 'other-strands-in-the-national-movement', title: 'Other strands in the National Movement', description: 'The Revolutionaries: Bengal, the Punjab, Maharashtra, U.P. the Madras Presidency, Outside India. The Left; The Left within the Congress: Jawaharlal Nehru, Subhas Chandra Bose, the Congress Socialist Party; the Communist Party of India, other left parties.' },
    { key: 'politics-of-separatism', title: 'Politics of Separatism', description: 'Politics of Separatism; the Muslim League; the Hindu Mahasabha; Communalism and the politics of partition; Transfer of power; Independence.' },
    { key: 'consolidation-as-a-nation', title: 'Consolidation as a Nation', description: 'Consolidation as a Nation; Nehru’s Foreign Policy; India and her neighbours (1947-1964); The linguistic reorganisation of States (1935-1947); Regionalism and regional inequality; Integration of Princely States; Princes in electoral politics; the Question of National Language.' },
    { key: 'caste-and-ethnicity-after-1947', title: 'Caste and Ethnicity after 1947', description: 'Caste and Ethnicity after 1947; Backward Castes and Tribes in post-colonial electoral politics; Dalit movements.' },
    { key: 'economic-development-and-political-change', title: 'Economic development and political change', description: 'Economic development and political change; Land reforms; the politics of planning and rural reconstruction; Ecology and environmental policy in post-colonial India; Progress of Science.' },
    { key: 'enlightenment-and-modern-ideas', title: 'Enlightenment and Modern ideas', description: 'Major Ideas of Enlightenment: Kant, Rousseau. Spread of Enlightenment in the colonies. Rise of socialist ideas (up to Marx); spread of Marxian Socialism.' },
    { key: 'origins-of-modern-politics', title: 'Origins of Modern Politics', description: 'European States System. American Revolution and the Constitution. French Revolution and Aftermath, 1789-1815. American Civil War with reference to Abraham Lincoln and the abolition of slavery. British Democratic politics, 1815-1850: Parliamentary Reformers, Free Traders, Chartists.' },
    { key: 'industrialization', title: 'Industrialization', description: 'English Industrial Revolution: Causes and Impact on Society. Industrialization in other countries: USA, Germany, Russia, Japan. Industrialization and Globalization.' },
    { key: 'nation-state-system', title: 'Nation‐State System', description: 'Rise of Nationalism in 19th century. Nationalism: State-building in Germany and Italy. Disintegration of Empires in the face of the emergence of nationalities across the World.' },
    { key: 'imperialism-and-colonialism', title: 'Imperialism and Colonialism', description: 'South and South-East Asia. Latin America and South Africa. Australia. Imperialism and free trade: Rise of neo-imperialism.' },
    { key: 'revolution-and-counter-revolution', title: 'Revolution and Counter‐Revolution', description: '19th Century European revolutions. The Russian Revolution of 1917-1921. Fascist Counter-Revolution, Italy and Germany. The Chinese Revolution of 1949.' },
    { key: 'world-wars', title: 'World Wars', description: '1st and 2nd World Wars as Total Wars: Societal implications. World War I: Causes and Consequences. World War II: Causes and Consequences.' },
    { key: 'the-world-after-world-war-ii', title: 'The World after World War II', description: 'Emergence of Two power blocs. Emergence of Third World and non-alignment. UNO and the global disputes.' },
    { key: 'liberation-from-colonial-rule', title: 'Liberation from Colonial Rule', description: 'Latin America-Bolivar. Arab World-Egypt. Africa-Apartheid to Democracy. South-East Asia-Vietnam.' },
    { key: 'decolonization-and-underdevelopment', title: 'Decolonization and Underdevelopment', description: 'Factors constraining Development; Latin America, Africa.' },
    { key: 'unification-of-europe', title: 'Unification of Europe', description: 'Post War Foundations; NATO and European Community. Consolidation and Expansion of European Community. European Union.' },
    { key: 'disintegration-of-soviet-union-and-rise-of-unipolar-world', title: 'Disintegration of Soviet Union and the Rise of the Unipolar World', description: 'Factors leading to the collapse of Soviet Communism and Soviet Union, 1985-1991. Political Changes in East Europe 1989-2001. End of the Cold War and US Ascendancy in the World as the lone superpower.' },
  ],
};

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
  HISTORY_OPTIONAL_PAPER_1,
  HISTORY_OPTIONAL_PAPER_2,
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
