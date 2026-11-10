import type { WorkspaceKind } from './workspace';
import { uuid } from './utils';
import { APFC_SYLLABUS_TAXONOMY_ID } from './apfcSyllabusTaxonomy';
import { UPSC_CSE_SYLLABUS_TAXONOMY_ID } from './upscCseKnowledgeTaxonomy';

// Knowledge Librarian (P0), Phase 2 — Syllabus <-> Knowledge classification.
//
// lib/contentImport.ts's ImportedContentMetadata.apfcTopicId already models "this item's ONE
// primary APFC topic" (a plain optional FK, never auto-filled — see its own header). That stays
// exactly as it is; this module does NOT replace it. What's genuinely missing, and what this module
// adds, is everything a single optional string can't express: MULTIPLE legitimate topic mappings
// per item, a confidence score, a short honest rationale, and a review state distinguishing a
// proposed (AI/lexical-suggested) classification from one a human has actually confirmed or
// rejected. A KnowledgeClassification record IS the many-to-many link between a knowledge item and
// a syllabus topic — there is no separate "relationship" object for it (lib/contentRelationships.ts
// is reused as-is for ImportedContent<->ImportedContent/Note links; this is a different, adjacent
// relationship kind that genuinely needs extra fields ContentRelationship doesn't have).
//
// Workspace scoping, stable ids, and the array-of-records-with-pure-reducer shape all follow this
// repository's existing convention (contentRelationships.ts, folders.ts) — not a new architecture.

export type KnowledgeItemType = 'imported_content';

export type KnowledgeClassificationSource = 'lexical' | 'ai' | 'manual';

export type KnowledgeClassificationStatus = 'proposed' | 'confirmed' | 'rejected';

/** P1.1 — 'apfc' (data/syllabus.ts) and 'upsc_cse' (the granular CSE syllabus,
 * lib/upscCseKnowledgeTaxonomy.ts) both exist today. PhD research deliberately has NO taxonomy
 * yet — see `taxonomyForWorkspace`'s own header for exactly what "no taxonomy" means for that
 * workspace, and this feature's own P1.1 report for what a future PhD taxonomy would need. The
 * union stays closed (not an open `string`) so adding a genuinely new taxonomy is a one-place,
 * compiler-checked change — every switch/lookup over this type fails to compile until updated. */
export type KnowledgeTaxonomyId = 'apfc' | 'upsc_cse';

/** A flattened, taxonomy-agnostic topic entry — the one shape both lib/apfcSyllabusTaxonomy.ts's
 * `ApfcTopicTaxonomyEntry` and lib/upscCseKnowledgeTaxonomy.ts's `UpscCseTopicTaxonomyEntry` are
 * structurally identical to (by design, not coincidence), so `classifyTextLexically` and the
 * manual-classification picker can work against either taxonomy's flattened list without caring
 * which one it actually is. */
export interface KnowledgeTopicTaxonomyEntry {
  subjectId: string;
  subjectTitle: string;
  topicId: string;
  topicTitle: string;
}

/** P1.1 — the ONE explicit, type-safe workspace-to-taxonomy mapping every classification path
 * (lexical and manual alike) must go through, replacing the old hardcoded "always APFC" constant.
 * A `WorkspaceKind` with no entry here (today: 'phd_research') returns `undefined` — a deliberate,
 * honest "no taxonomy exists for this workspace yet" signal, never a silent fallback to APFC's
 * taxonomy. Every caller below treats `undefined` as "do not create/propose a classification",
 * never as an error to throw — consistent with this module's existing "never fabricate, never
 * throw" convention (see classifyTextLexically's own header). */
const WORKSPACE_TAXONOMY: Readonly<Partial<Record<WorkspaceKind, KnowledgeTaxonomyId>>> = {
  apfc: APFC_SYLLABUS_TAXONOMY_ID,
  upsc_cse: UPSC_CSE_SYLLABUS_TAXONOMY_ID,
};

export function taxonomyForWorkspace(workspaceId: WorkspaceKind): KnowledgeTaxonomyId | undefined {
  return WORKSPACE_TAXONOMY[workspaceId];
}

export interface KnowledgeClassification {
  id: string;
  workspaceId: WorkspaceKind;
  itemId: string;
  itemType: KnowledgeItemType;
  taxonomy: KnowledgeTaxonomyId;
  topicId: string;
  /** 0..1 — never fabricated: 1 for a manual classification (the user picked it directly), the
   * lexical/AI-derived score otherwise (see classifyTextLexically / jarvis/knowledgeClassifierAi.ts). */
  confidence: number;
  /** A short, honest explanation — for 'lexical' the actual matched terms, for 'ai' the model's own
   * stated reasoning (validated, never invented by this module), for 'manual' a fixed, accurate
   * statement that a human chose it directly. Never empty. */
  rationale: string;
  status: KnowledgeClassificationStatus;
  source: KnowledgeClassificationSource;
  createdAt: string;
  updatedAt: string;
}

const MANUAL_RATIONALE = 'Manually classified by the user.';

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// ================================================================================================
// Pure builders
// ================================================================================================

/** A human explicitly assigning a topic is always treated as already-decided (`status: 'confirmed'`,
 * confidence 1) — there is nothing left to "review" about a choice the user just made themselves.
 *
 * P1.1 — `taxonomy` is now DERIVED from `input.workspaceId` via `taxonomyForWorkspace`, never
 * hardcoded to APFC. The caller (lib/store.ts's addManualKnowledgeClassification) is responsible
 * for passing the STORE's own trusted `activeWorkspaceId` here, never an arbitrary caller-supplied
 * one — this function has no way to verify that itself, so it trusts its input exactly as far as
 * the existing workspace-ownership convention already does elsewhere in this app. Returns
 * `undefined` (never throws, never fabricates) when the workspace has no taxonomy yet (today: PhD
 * research) — a UI should never offer a topic picker in that case, but if one somehow did, this is
 * the backstop that stops a manual classification being silently mis-tagged. */
export function createManualClassification(input: {
  workspaceId: WorkspaceKind;
  itemId: string;
  itemType: KnowledgeItemType;
  topicId: string;
  createdAt?: string;
}): KnowledgeClassification | undefined {
  const taxonomy = taxonomyForWorkspace(input.workspaceId);
  if (!taxonomy) return undefined;
  const now = input.createdAt ?? new Date().toISOString();
  return {
    id: uuid(),
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    itemType: input.itemType,
    taxonomy,
    topicId: input.topicId,
    confidence: 1,
    rationale: MANUAL_RATIONALE,
    status: 'confirmed',
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

// ================================================================================================
// Lexical classifier — a deterministic, dependency-free, zero-AI baseline. This is what makes
// "classify articles against available syllabus data" true even when NO AI provider is available
// on this platform/device (see this feature's own hard constraint). It never invents a topic:
// every candidate it returns is one of the exact topics it was given, and its rationale lists only
// terms that genuinely appear in both the text and that topic's own title.
// ================================================================================================

/** A deliberately small, generic English stopword list — just enough to stop near-universal words
 * ("the", "and", "of") from diluting every topic's match score equally; never domain-specific
 * enough to risk hiding a real syllabus term. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'and', 'or', 'to', 'is', 'are', 'was', 'were', 'for', 'with',
  'as', 'by', 'at', 'from', 'that', 'this', 'it', 'its', 'be', 'been', 'has', 'have', 'had', 'will',
  'would', 'can', 'could', 'not', 'no', 'but', 'into', 'about', 'over', 'after', 'before', 'than',
  'which', 'their', 'they', 'his', 'her', 'he', 'she', 'we', 'you', 'i', 'also', 'said', 'says',
]);

/** Lowercases, strips punctuation, splits on whitespace, drops stopwords and anything shorter than
 * 3 characters, and dedupes — the same simple tokenisation applied to both the article text and
 * each topic's own title, so the two sides are compared on equal terms. */
export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return new Set(words);
}

// ================================================================================================
// P0.5 — conservative word-form comparison, kept SEPARATE from tokenize() on purpose.
//
// P0.4's audit found genuinely on-topic content (a Depreciation revision note, a Data
// Interpretation question) scoring below the confidence floor purely because the article used a
// different inflected form of a title word than the title itself ("method"/"calculated" vs the
// title's own "methods"/"calculation"; "chart" vs "charts"). `tokenize()` has no stemming and
// never has — it is directly unit-tested on its own exact contract ("lowercases, strips
// punctuation... never stems") and reused nowhere else in the app (confirmed: no other module
// imports it). Changing it would be a global change to a function whose job is NOT "normalise for
// comparison" — it would also silently change what `tokenize()` returns for its own existing tests.
// Instead, `normalizeForMatch` is a SEPARATE, narrow step applied only inside the matching
// comparison below: both sides of a comparison are normalised through it before being checked for
// equality, while `tokenize()` itself — and everything else that calls it — is byte-for-byte
// unchanged.
//
// Deliberately conservative: strips only the common English INFLECTIONAL endings (plural "-s"/
// "-es"/"-ies", and the verb endings "-ed"/"-ing") that P0.4's own examples needed ("methods" ->
// "method", "charts" -> "chart"), never a full stemmer. It does NOT reconcile every derivational
// pair (e.g. "calculation" vs "calculated" still don't normalise to the same form — the two words
// diverge at the stem, not just the ending, which conservative suffix-stripping cannot reach; see
// this module's own report for the before/after this still achieves without that). Guards against
// over-stripping short or already-irregular-looking words: a trailing "s" is only ever removed when
// the word doesn't end in "ss" (never "class", "glass", "address") and at least 3 characters would
// remain; "-ed"/"-ing"/"-es"/"-ies" are only stripped when at least 5 characters remain, so short
// genuinely-base words are left alone.
export function normalizeForMatch(term: string): string {
  if (term.endsWith('ss')) return term;
  if (term.length > 5 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
  if (term.length > 5 && term.endsWith('ing')) return term.slice(0, -3);
  if (term.length > 5 && term.endsWith('ed')) return term.slice(0, -2);
  if (term.length > 5 && term.endsWith('es')) return term.slice(0, -2);
  if (term.length > 3 && term.endsWith('s')) return term.slice(0, -1);
  return term;
}

/** A normalised view of a token set — every member passed through `normalizeForMatch`, as a Set
 * (collapsing e.g. "chart"/"charts" to the same member if both were literally present, which is
 * harmless: it only ever makes membership checks slightly more permissive, never fewer). */
function normalizedTermSet(terms: ReadonlySet<string>): Set<string> {
  return new Set([...terms].map(normalizeForMatch));
}

export interface LexicalClassificationCandidate {
  topicId: string;
  confidence: number;
  rationale: string;
}

/** Keyed by a topic's exact `topicTitle` (not its id — ids are generated positionally by
 * data/syllabus.ts's own `nid()` counter and are not a stable, human-reviewable key to curate
 * against; a title is both stable in practice — see apfcSyllabusTaxonomy.ts's own versioning rule —
 * and immediately readable when someone is extending this list). Each entry is a short list of
 * real-world phrasings that a human would recognise as "clearly about this topic" even when the
 * topic's own (often short, formal) title words don't literally appear in the article. This is NOT
 * a second taxonomy and adds no topic that doesn't already exist in data/syllabus.ts — it only
 * widens the VOCABULARY this classifier recognises as evidence FOR an existing topic.
 *
 * P0.2 hardening (classification intelligence): the original lexical classifier scored a topic
 * purely by `|matched title words| / |title words|`. For the UPSC EPFO APFC syllabus — whose
 * "Current Events" subject topics are short umbrella labels like "Economic Developments & Reports"
 * — almost no real newspaper sentence contains most of a topic's own title verbatim, so genuine,
 * on-topic articles routinely scored 0. This list is the fix: a maintainable, hand-curated set of
 * phrases per topic, scoped (deliberately, not exhaustively) to the topics that actually recur in
 * daily current-affairs coverage — Current Events, Economy, Polity, Science/Environment, and the
 * labour-welfare topics most likely to appear in a "social issues" story. Topics with no entry here
 * behave EXACTLY as before (title-words-only) — this is additive, never a replacement.
 *
 * A dedicated test (knowledgeClassification.test.ts) asserts every key here is a real topicTitle in
 * the live APFC syllabus — this list can enrich evidence for an existing topic, but can never
 * silently invent one that doesn't exist in data/syllabus.ts. */
export const APFC_TOPIC_KEYWORD_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'Economic Developments & Reports': ['fiscal deficit', 'tax collection', 'disinvestment', 'economic survey', 'capital expenditure', 'gdp growth', 'trade deficit', 'union budget'],
  'Basic Concepts: GDP, GNP, Inflation, Fiscal Deficit': ['fiscal deficit', 'inflation rate', 'gdp growth', 'current account deficit'],
  'Union Budget & Fiscal Policy Basics': ['union budget', 'fiscal deficit', 'tax collection', 'capital expenditure', 'disinvestment', 'subsidy outgo'],
  'Monetary Policy & Role of RBI': ['monetary policy', 'repo rate', 'interest rate', 'central bank'],
  'Poverty, Unemployment & Inclusive Growth': ['household survey', 'social policy', 'inclusive growth', 'welfare programme', 'rural healthcare', 'rural districts'],
  'International Trade & Balance of Payments': ['trade deficit', 'balance of payments', 'export growth', 'import duty'],
  'Government Schemes & Policies': ['welfare transfer', 'public service commission', 'grievance redressal', 'reservation policy', 'cabinet approved', 'scheme launched'],
  'International Relations & Summits': ['bilateral', 'trans boundary', 'river water sharing', 'framework agreement', 'neighbouring countries', 'joint commission', 'diplomatic', 'trade corridor', 'border cooperation'],
  'Science & Technology News': ['research institute', 'marine research', 'restoration project', 'space mission', 'satellite launch'],
  'Defence & Security News': ['border security', 'defence cooperation', 'security forces'],
  'EPFO / Labour Ministry Current Developments': ['labour ministry', 'social security scheme', 'provident fund'],
  'Parliament: Lok Sabha & Rajya Sabha, Law Making': ['lok sabha', 'rajya sabha', 'parliament passed', 'standing committee', 'bill passed', 'law minister', 'recruitment examination'],
  'Centre–State Relations': ['state government', 'union territory', 'state public service'],
  'Constitutional Bodies (Election Commission, CAG, UPSC)': ['election commission', 'public service commission', 'grievance redressal cell'],
  'Environmental Science & Ecology': ['coral reef', 'marine protected area', 'biodiversity', 'conservation programme', 'restoration project', 'ecosystem', 'climate change'],
  'Space & Recent Scientific Developments': ['space mission', 'satellite launch', 'research institute'],
  'Maternity Benefit Act, 1961': ['maternity benefit', 'women welfare', 'pregnant women'],
  'Minimum Wages Act, 1948': ['minimum wage', 'wage revision'],
  'Code on Social Security, 2020': ['social security scheme', 'welfare programme'],
  // P0.3 — the five "Current Events" topics the read-only coverage audit found with ZERO alias
  // coverage, each one a category daily newspaper coverage produces constantly.
  //
  // Each list below mixes TWO deliberately different kinds of evidence unit:
  //  (a) the topic's own title words, but in the SINGULAR/BASE form a real single-event article
  //      actually uses — e.g. "award", "honoured", "winner" — never the topic title's own PLURAL
  //      summary-label form ("Awards", "Honours", "Winners"), which `tokenize()` (no stemming)
  //      treats as a completely different token and which essentially never appears verbatim in a
  //      report about ONE specific award/match/appointment. This is the "word-form handling" this
  //      phase's brief asks for — handled as explicit extra single-word evidence units, not by
  //      changing tokenize() itself (that would affect all 134 topics, not just these five).
  //  (b) a short list (deliberately NOT exhaustive — seven-plus near-synonymous named entities were
  //      tried here first and measurably made things WORSE: a long list of mutually-exclusive named
  //      awards/events only ever has ONE member present in a given article, so it inflates the
  //      denominator — the topic's total recognised evidence — far more than it ever adds to the
  //      numerator for any single real article, which actually suppressed confidence below the
  //      floor rather than raising it; see this module's own report for the measured before/after)
  //      of the most common specific phrasings, each still topic-distinctive (a gold/silver/bronze
  //      medal, a named national award, a named index), never a bare generic word.
  // A single matched word-form unit (weight 1) can never alone clear `minConfidence` (0.34) given
  // these topics' own title weight alone already exceeds 1/0.34 ≈ 2.9 — so these never introduce a
  // new false-positive mode by themselves; they only count when combined with something else, which
  // is exactly the intended "two independent signals together are stronger evidence" effect.
  'Awards, Honours & Prizes': ['award', 'awarded', 'honoured', 'award ceremony', 'prize', 'padma', 'jnanpith', 'nobel prize'],
  'Sports Events & Winners': ['won', 'wins', 'medal', 'clinched', 'asian games', 'commonwealth games'],
  'Important Appointments (National/International)': ['appointed', 'appointment', 'sworn', 'charge', 'take charge'],
  'Important Indices & Rankings (India in)': ['index', 'ease of doing business', 'global hunger index', 'world bank report'],
  'Books, Authors & Obituaries': ['passed away', 'novelist', 'author', 'breathed his last', 'literary', 'historian'],
};

/** P1.3 — the UPSC CSE counterpart to APFC_TOPIC_KEYWORD_ALIASES, keyed by `topicId` rather than
 * `topicTitle`. Title-keying (APFC's own convention) is unsafe for CSE: two real, distinct granular
 * topics legitimately share the exact same title string today ("Data Sufficiency" under both
 * Analytical Ability and Data Interpretation; "Socio-Religious Reform Movements" under both Modern
 * Indian History and Indian National Movement — see lib/upscCseKnowledgeTaxonomy.ts's own data), so
 * a title-keyed entry would silently apply to both at once. Id-keying makes that impossible by
 * construction — see classifyTextLexically's own `aliasesById` lookup below, which is additive to
 * (never a replacement for) the title-keyed `aliases` map APFC already uses, so APFC's own aliasing
 * behaviour is completely unaffected by this map's existence.
 *
 * P1.3 read-only audit (evaluation corpus of 30 synthetic current-affairs cases) measured 0/296 CSE
 * topics with any genuine alias coverage (one coincidental title collision with an APFC alias key
 * aside) and found four concrete, representative false negatives — this map seeds exactly those
 * four, each with the SMALLEST phrase list that clears the 0.34 floor on the audited failing case,
 * not an exhaustive list: the same audit also measured that each additional alias phrase RAISES a
 * topic's own evidence denominator for every future article scored against it, so an unmatched extra
 * phrase actively dilutes genuine matches rather than being free coverage (see this module's own
 * confidence formula below) — scoped narrowly on purpose, exactly as APFC_TOPIC_KEYWORD_ALIASES'
 * own P0.2/P0.3 precedent was.
 *
 * Every key here is asserted (in knowledgeClassification.test.ts) to be a real, live topicId from
 * lib/upscCseKnowledgeTaxonomy.ts's listUpscCseTopicsFlat() — this list can enrich evidence for an
 * existing CSE topic, but can never silently invent one. */
export const UPSC_CSE_TOPIC_KEYWORD_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // Mains GS2 — Functions & Responsibilities of Union & States. "federal tussle" is a real, specific
  // phrasing common to centre-state reporting, genuinely distinct from the title's own "centre"/
  // "state"/"relations" words. ("state autonomy"/"governor's role"/"president's rule" were tried
  // too; each cleared the audited failure on its own but added evidence-pool weight this topic never
  // needed for any demonstrated case — dropped, since every extra unmatched alias phrase only
  // dilutes a FUTURE article's own genuine match, per this constant's own header.)
  'mains-gs2-constitution-polity-union-state-functions__t-centre-state-relations': ['federal tussle'],
  // Mains GS3 — Government Budgeting. "tax and spending" is a specific, common real-world fiscal-
  // policy phrasing distinct from the bare title words. ("fiscal stimulus" was tried too, but
  // re-running the full P1.3 audit corpus after adding it measurably REGRESSED a working case: a
  // genuinely multi-topic article (the audit corpus's "m1") that correctly tagged both "Schemes for
  // Women & Children" and this topic at 67% pre-patch dropped to a single tag post-patch, because
  // "fiscal stimulus"'s own unmatched weight pushed that article's otherwise-genuine 2-of-3 title
  // match below the 0.34 floor — a concrete, measured instance of this constant's own documented
  // dilution risk, not a hypothetical one. Dropped as a direct result.)
  'mains-gs3-economy-government-budgeting__t-fiscal-policy-tools': ['tax and spending'],
  // Mains GS1 — Geophysical Phenomena. The title itself is exactly 2 words ("Earthquakes" +
  // "Tsunamis"), so classifyTextLexically's own P0.5 short-title guard requires BOTH to appear
  // before this topic can match at all — a single-hazard "earthquake" article with no tsunami
  // mention, or a colloquial "quake" (not an inflection normalizeForMatch can bridge — it only
  // strips endings, "quake" is a different word entirely), both failed to match at all pre-P1.3.
  // These two singular/colloquial word-form aliases are the SAME technique APFC's own P0.3 aliases
  // already use for exactly this class of gap (see APFC_TOPIC_KEYWORD_ALIASES' own header) — and
  // adding them also lifts this topic's total evidence weight above 2, which switches it off the
  // all-or-nothing guard entirely (graded confidence becomes possible, not just 0% or 100%).
  'mains-gs1-geography-geophysical-phenomena__t-earthquakes-tsunamis': ['earthquake', 'quake'],
  // Prelims GS1 — Ancient India. "harappan" and "granaries" are specific, textbook-standard Indus
  // Valley Civilization hallmarks, genuinely distinct from the title's own "indus"/"valley"/
  // "civilization" words — a real article can plausibly describe IVC archaeology without ever using
  // the word "civilization" itself.
  'prelims-gs1-history-ancient__t-ivc': ['harappan', 'granaries'],
};

/** P1.3 — a small, separate pre-pass (distinct from aliasing above) for abbreviation-only current-
 * affairs phrasing ("FDI inflows rose", "PPP model for the highway"), which no amount of aliasing
 * can bridge since an alias phrase still requires its own words to appear in the text. Each
 * expansion here is verified against the exact CSE topic's OWN canonical description in
 * data/upscCseGranularTopics.ts, never assumed from outside general knowledge:
 *  - PPP -> data/upscCseGranularTopics.ts:1190, topic "Public-Private Partnership", canonical
 *    description "PPP models in India." No other topic anywhere in the live 296-node taxonomy
 *    expands PPP differently (e.g. no "Purchasing Power Parity" topic exists) — unambiguous.
 *  - FDI -> data/upscCseGranularTopics.ts:1191, topic "Foreign Direct Investment", canonical
 *    description "FDI policy and trends." — unambiguous.
 * Deliberately NOT exhaustive (GST/RBI/SDG/etc. are real gaps too, but unaudited — see this
 * module's own P1.3 report for why only the two demonstrated failures are seeded). */
const UPSC_CSE_ABBREVIATION_EXPANSIONS: Readonly<Record<string, string>> = {
  PPP: 'public private partnership',
  FDI: 'foreign direct investment',
};

/** Expands any whole-word occurrence (case-insensitive word-boundary match — never a substring
 * inside a longer word, so "FDIC" or "PPPoE" are never touched) of a known CSE abbreviation by
 * APPENDING its full expansion alongside the original text — never replacing or removing the
 * abbreviation itself, so tokenize()'s own output for the unmodified text is always a subset of
 * this function's output. A no-op (returns `text` unchanged, by reference) when no known
 * abbreviation appears at all. */
export function expandUpscCseAbbreviations(text: string): string {
  const additions: string[] = [];
  for (const [abbreviation, expansion] of Object.entries(UPSC_CSE_ABBREVIATION_EXPANSIONS)) {
    if (new RegExp(`\\b${abbreviation}\\b`, 'i').test(text)) additions.push(expansion);
  }
  return additions.length === 0 ? text : `${text} ${additions.join(' ')}`;
}

export interface LexicalClassificationOptions {
  /** Minimum fraction of a topic's own recognised evidence vocabulary (its title words, plus any
   * curated alias phrases — see APFC_TOPIC_KEYWORD_ALIASES) that must appear in the text for that
   * topic to be proposed at all — guards against a single incidental shared word (e.g. "the") ever
   * producing a near-zero-confidence, meaningless proposal. UNCHANGED from the original title-only
   * classifier's own default, 0.34 — see this module's own report for the comparative evidence
   * behind keeping it exactly as-is rather than lowering it: on the P0.2 synthetic acceptance set,
   * every genuine match already clears 0.34 once evidence is weighted by phrase specificity (see
   * below); lowering the floor instead was tried and measurably admitted a false positive on a
   * deliberately unrelated article (a single incidental title word, "home", scoring 0.333), so the
   * floor itself was left untouched and the scoring formula was fixed instead. */
  minConfidence?: number;
  /** Caps how many proposals come back per article — a long article can legitimately touch several
   * topics, but an unbounded list would overwhelm the review queue. Default 3. */
  maxResults?: number;
  /** Overrides the built-in APFC_TOPIC_KEYWORD_ALIASES map — keyed exactly like it (by topicTitle).
   * Defaults to the real, curated map; tests pass a small fixture map (or {} to disable aliasing
   * entirely and exercise the original title-only behaviour) so this function stays directly
   * testable against synthetic topics that don't exist in the real syllabus. */
  aliases?: Readonly<Record<string, readonly string[]>>;
  /** P1.3 — a SECOND, additive alias source keyed by `topic.topicId` instead of `topic.topicTitle`.
   * `createLexicalClassifications` below passes UPSC_CSE_TOPIC_KEYWORD_ALIASES here automatically
   * for the upsc_cse taxonomy; APFC's own `aliases` map and behaviour are completely untouched by
   * this option's existence — a candidate topic's evidence units are simply the union of whatever
   * `aliases[topic.topicTitle]` and `aliasesById[topic.topicId]` each separately contribute (either
   * or both may be empty/absent). Defaults to `{}` (no id-keyed aliasing) so every existing caller
   * that doesn't pass it is entirely unaffected. */
  aliasesById?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Scores `text` against every candidate topic using that topic's own recognised EVIDENCE
 * VOCABULARY: its title's distinctive words (one evidence unit each) plus — when this topic has an
 * entry in `aliases` — a short curated list of real-world phrasings (one evidence unit per phrase).
 * A phrase unit counts as matched when EVERY one of its words appears somewhere in the text's own
 * token set (order- and distance-independent, the same bag-of-words comparison already used for
 * single title words) — this is deliberately more forgiving than requiring the exact phrase
 * substring, because real news prose rarely repeats a curated phrase verbatim (e.g. "a joint
 * monitoring commission" should still satisfy the alias "joint commission"); the documented
 * trade-off is a small amount of extra false-positive risk when a phrase's words happen to appear
 * scattered in an unrelated sentence, which is why phrases here are kept short, specific, and
 * topic-distinctive rather than generic.
 *
 * Each evidence unit is WEIGHTED by its own word count (a single title word weighs 1; a 3-word
 * alias phrase weighs 3) and confidence is `sum(weight of matched units) / sum(weight of all
 * units)` — this is the one real fix P0.2 made to the scoring itself, not just an added vocabulary:
 * the original unweighted version let one coincidental shared word on a short title (e.g.
 * "Mensuration: Area & Volume" matching only "area") outscore a topic that matched a specific,
 * multi-word alias phrase ("Environmental Science & Ecology" matching "coral reef" + "marine
 * protected area"), because both counted as "1 of N" regardless of how distinctive the match
 * actually was. Weighting by phrase length makes a specific multi-word match count for what it's
 * worth — see this module's own report for the before/after numbers this was measured against. A
 * topic with no aliases behaves exactly as the original title-only scoring did (every unit weighs
 * 1, so the formula reduces to the original ratio); a topic that gained aliases scores higher only
 * when the article text genuinely contains that extra evidence — never a fabricated boost. A topic
 * with no evidence units at all (e.g. an all-stopword title and no aliases) can never match and is
 * silently skipped — never a divide-by-zero, never a fabricated score. Every emitted candidate is
 * still never more than `maxResults` entries, still never below `minConfidence`, so a long article
 * touching many topics is never reported as confidently matching all of them.
 */
export function classifyTextLexically(
  text: string,
  candidateTopics: readonly KnowledgeTopicTaxonomyEntry[],
  options: LexicalClassificationOptions = {},
): LexicalClassificationCandidate[] {
  const minConfidence = options.minConfidence ?? 0.34;
  const maxResults = options.maxResults ?? 3;
  const aliases = options.aliases ?? APFC_TOPIC_KEYWORD_ALIASES;
  const aliasesById = options.aliasesById ?? {};
  const textTerms = tokenize(text);
  if (textTerms.size === 0) return [];
  // P0.5 — comparison-only normalisation (see normalizeForMatch's own header); textTerms itself
  // stays the exact tokenize() output, unused for comparison from here on but kept for callers that
  // might inspect it indirectly through the rationale text below.
  const normalizedTextTerms = normalizedTermSet(textTerms);

  const candidates: LexicalClassificationCandidate[] = [];
  for (const topic of candidateTopics) {
    const titleUnits = [...tokenize(topic.topicTitle)].map((term) => [term]);
    // P1.3 — the title-keyed and id-keyed alias sources are unioned; either, both, or neither may
    // contribute phrases for a given topic. A topic absent from both behaves exactly as before.
    const aliasPhrases = [...(aliases[topic.topicTitle] ?? []), ...(aliasesById[topic.topicId] ?? [])];
    const aliasUnits = aliasPhrases.map((phrase) => [...tokenize(phrase)]).filter((unit) => unit.length > 0);
    const evidenceUnits = [...titleUnits, ...aliasUnits];
    const totalWeight = evidenceUnits.reduce((sum, unit) => sum + unit.length, 0);
    if (totalWeight === 0) continue;

    const matchedUnits = evidenceUnits.filter((unit) => unit.every((term) => normalizedTextTerms.has(normalizeForMatch(term))));
    if (matchedUnits.length === 0) continue;
    const matchedWeight = matchedUnits.reduce((sum, unit) => sum + unit.length, 0);

    // P0.5 — a SHORT, un-aliased topic (its title's own words are its ONLY evidence, and there are
    // at most two of them, e.g. "Time & Work") can have a single common word push its ratio above
    // the floor purely because its denominator is tiny (1/2 = 0.5), never because the article is
    // actually about that topic. This guard requires a FULL match (every one of the title's own
    // words, not just one) for exactly that narrow case — topics with 3+ words or any alias already
    // sit safely below the floor on a single incidental word (1/3 ≈ 0.33 < 0.34), so this never
    // touches them; a genuinely single-word title ("Percentage", "Syllogism") is entirely unaffected
    // either, since matching its one word already IS a full match (matchedWeight === totalWeight).
    // This is deliberately scoped to this one narrow structural shape, never a general "require 2+
    // matches" rule — a topic with a longer title or any alias can still be proposed from a single
    // genuinely distinctive matched unit, exactly as before.
    if (totalWeight <= 2 && matchedWeight < totalWeight) continue;

    const confidence = matchedWeight / totalWeight;
    if (confidence < minConfidence) continue;

    const matchedPhrases = matchedUnits.map((unit) => unit.join(' '));
    candidates.push({
      topicId: topic.topicId,
      confidence: clampConfidence(confidence),
      rationale: `Matched term${matchedPhrases.length === 1 ? '' : 's'}: ${matchedPhrases.join(', ')}`,
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence || a.topicId.localeCompare(b.topicId));
  return candidates.slice(0, maxResults);
}

/** Wraps classifyTextLexically's output as real KnowledgeClassification records — `status:
 * 'proposed'` (a lexical match is a suggestion, never a decision), `source: 'lexical'`. Every
 * emitted topicId is necessarily one of `input.candidateTopics`'s own ids (classifyTextLexically
 * can only score and return topics it was given) — never invented. Callers that want this
 * validated against a REAL, live taxonomy pass that taxonomy's own flattened topic list (e.g.
 * lib/apfcSyllabusTaxonomy.ts's listApfcTopicsFlat() or lib/upscCseKnowledgeTaxonomy.ts's
 * listUpscCseTopicsFlat()) as candidateTopics, exactly as lib/knowledgeIngestion.ts does; this
 * function itself stays taxonomy-agnostic so it remains directly testable against small fixtures.
 *
 * P1.1 — `taxonomy` is DERIVED from `input.workspaceId` (same `taxonomyForWorkspace` mapping
 * `createManualClassification` uses, so lexical and manual classification can never disagree about
 * which taxonomy a given workspace means). Returns `[]` (never fabricates) for a workspace with no
 * taxonomy yet — the original document is still always saved by the caller regardless; only the
 * classification step is skipped. */
export function createLexicalClassifications(input: {
  workspaceId: WorkspaceKind;
  itemId: string;
  itemType: KnowledgeItemType;
  text: string;
  candidateTopics: readonly KnowledgeTopicTaxonomyEntry[];
  options?: LexicalClassificationOptions;
  createdAt?: string;
}): KnowledgeClassification[] {
  const taxonomy = taxonomyForWorkspace(input.workspaceId);
  if (!taxonomy) return [];
  const now = input.createdAt ?? new Date().toISOString();
  // P1.3 — the upsc_cse taxonomy gets UPSC_CSE_TOPIC_KEYWORD_ALIASES applied automatically (same
  // "lexical and manual classification can never disagree about which taxonomy a workspace means"
  // discipline taxonomyForWorkspace's own header already established, extended here to aliasing),
  // UNLESS the caller already supplied its own `aliasesById` (e.g. a test exercising a fixture map,
  // or a future caller that wants no CSE aliasing) — mirrors exactly how `options.aliases` already
  // defaults to APFC_TOPIC_KEYWORD_ALIASES only when the caller doesn't override it. Every other
  // taxonomy (today: apfc) is completely unaffected — this branch only ever fires for upsc_cse.
  const effectiveOptions: LexicalClassificationOptions =
    taxonomy === 'upsc_cse' && input.options?.aliasesById === undefined
      ? { ...input.options, aliasesById: UPSC_CSE_TOPIC_KEYWORD_ALIASES }
      : (input.options ?? {});
  // P1.3 — same taxonomy-gated dispatch as the aliasing above: only upsc_cse text ever passes
  // through the abbreviation pre-pass; APFC's own text is scored completely unchanged.
  const textForClassification = taxonomy === 'upsc_cse' ? expandUpscCseAbbreviations(input.text) : input.text;
  const candidates = classifyTextLexically(textForClassification, input.candidateTopics, effectiveOptions);
  return candidates.map((c) => ({
      id: uuid(),
      workspaceId: input.workspaceId,
      itemId: input.itemId,
      itemType: input.itemType,
      taxonomy,
      topicId: c.topicId,
      confidence: c.confidence,
      rationale: c.rationale,
      status: 'proposed' as const,
      source: 'lexical' as const,
      createdAt: now,
      updatedAt: now,
    }));
}

// ================================================================================================
// Queries
// ================================================================================================

export function listClassificationsForItem(
  classifications: readonly KnowledgeClassification[],
  itemId: string,
  itemType: KnowledgeItemType = 'imported_content',
): KnowledgeClassification[] {
  return classifications.filter((c) => c.itemId === itemId && c.itemType === itemType);
}

export function listClassificationsForTopic(
  classifications: readonly KnowledgeClassification[],
  topicId: string,
  statusFilter?: readonly KnowledgeClassificationStatus[],
): KnowledgeClassification[] {
  return classifications.filter((c) => c.topicId === topicId && (!statusFilter || statusFilter.includes(c.status)));
}

/** Every classification still awaiting a human decision, most-confident first (the quickest, most
 * likely-correct ones to triage first) with a stable tie-break by createdAt so the order never
 * jitters between renders for equal-confidence entries. */
export function listReviewQueue(classifications: readonly KnowledgeClassification[]): KnowledgeClassification[] {
  return classifications
    .filter((c) => c.status === 'proposed')
    .slice()
    .sort((a, b) => b.confidence - a.confidence || a.createdAt.localeCompare(b.createdAt));
}

// ================================================================================================
// Reducers — pure array transforms, mirroring every other store-backed collection in this app
// (contentRelationships.ts, folders.ts): the store action calls these, never mutates in place.
// ================================================================================================

function sameTarget(a: Pick<KnowledgeClassification, 'itemId' | 'itemType' | 'taxonomy' | 'topicId'>, b: typeof a): boolean {
  return a.itemId === b.itemId && a.itemType === b.itemType && a.taxonomy === b.taxonomy && a.topicId === b.topicId;
}

/**
 * Merges a batch of freshly-computed candidates (from the lexical classifier, or a future AI pass)
 * into an existing collection, enforcing at most one classification per (itemId, itemType,
 * taxonomy, topicId):
 *  - no existing record for that pair -> the new candidate is added as-is.
 *  - an existing 'confirmed' record -> left untouched (a human already decided; a re-run of the
 *    automatic classifier must never overwrite that).
 *  - an existing 'rejected' record -> left untouched (a human already said "no"; an automatic
 *    re-proposal of the exact same pairing would be exactly the "AI keeps suggesting what I already
 *    rejected" annoyance this guards against). A human can still re-add it manually later via
 *    createManualClassification, which this function has no special-casing against.
 *  - an existing 'proposed' record -> refreshed in place (confidence/rationale/source updated,
 *    updatedAt re-stamped, id/status/createdAt kept) rather than duplicated.
 * Never throws; a batch with zero candidates is a no-op returning the input unchanged (by value).
 */
export function mergeProposedClassifications(
  existing: readonly KnowledgeClassification[],
  candidates: readonly KnowledgeClassification[],
): KnowledgeClassification[] {
  if (candidates.length === 0) return [...existing];

  let result = [...existing];
  for (const candidate of candidates) {
    const matchIndex = result.findIndex((c) => sameTarget(c, candidate));
    if (matchIndex === -1) {
      result = [...result, candidate];
      continue;
    }
    const current = result[matchIndex];
    if (current.status !== 'proposed') continue; // confirmed/rejected are never overwritten
    result = result.map((c, i) => (i === matchIndex ? { ...c, confidence: candidate.confidence, rationale: candidate.rationale, source: candidate.source, updatedAt: candidate.updatedAt } : c));
  }
  return result;
}

export function confirmClassification(classifications: readonly KnowledgeClassification[], id: string, updatedAt: string = new Date().toISOString()): KnowledgeClassification[] {
  return classifications.map((c) => (c.id === id ? { ...c, status: 'confirmed' as const, updatedAt } : c));
}

export function rejectClassification(classifications: readonly KnowledgeClassification[], id: string, updatedAt: string = new Date().toISOString()): KnowledgeClassification[] {
  return classifications.map((c) => (c.id === id ? { ...c, status: 'rejected' as const, updatedAt } : c));
}

export function deleteClassification(classifications: readonly KnowledgeClassification[], id: string): KnowledgeClassification[] {
  return classifications.filter((c) => c.id !== id);
}

/** Cascade helper for deleting a knowledge item itself — removes every classification that
 * references it, mirroring lib/repository.ts's deleteRepositoryImportedContent's own relationship
 * cascade. */
export function deleteClassificationsForItem(classifications: readonly KnowledgeClassification[], itemId: string, itemType: KnowledgeItemType = 'imported_content'): KnowledgeClassification[] {
  return classifications.filter((c) => !(c.itemId === itemId && c.itemType === itemType));
}
