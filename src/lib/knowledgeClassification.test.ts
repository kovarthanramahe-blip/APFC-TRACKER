import { describe, it, expect } from 'vitest';
import {
  tokenize,
  normalizeForMatch,
  classifyTextLexically,
  createLexicalClassifications,
  createManualClassification,
  mergeProposedClassifications,
  confirmClassification,
  rejectClassification,
  deleteClassification,
  deleteClassificationsForItem,
  listClassificationsForItem,
  listClassificationsForTopic,
  listReviewQueue,
  taxonomyForWorkspace,
  APFC_TOPIC_KEYWORD_ALIASES,
  UPSC_CSE_TOPIC_KEYWORD_ALIASES,
  expandUpscCseAbbreviations,
  type KnowledgeClassification,
} from './knowledgeClassification';
import { listApfcTopicsFlat } from './apfcSyllabusTaxonomy';
import { listUpscCseTopicsFlat, isValidUpscCseTopicId } from './upscCseKnowledgeTaxonomy';
import type { ApfcTopicTaxonomyEntry } from './apfcSyllabusTaxonomy';

const TOPICS: ApfcTopicTaxonomyEntry[] = [
  { subjectId: 'economy', subjectTitle: 'Economy', topicId: 'topic-inflation', topicTitle: 'Inflation and Monetary Policy' },
  { subjectId: 'polity', subjectTitle: 'Polity', topicId: 'topic-parliament', topicTitle: 'Parliament and Legislature' },
  { subjectId: 'science', subjectTitle: 'Science', topicId: 'topic-stopwords', topicTitle: 'The And Of' },
];

const MANUAL_RATIONALE_FOR_TEST = 'Manually classified by the user.';

function classification(overrides: Partial<KnowledgeClassification> = {}): KnowledgeClassification {
  return {
    id: overrides.id ?? 'c1',
    workspaceId: 'apfc',
    itemId: 'item-1',
    itemType: 'imported_content',
    taxonomy: 'apfc',
    topicId: 'topic-inflation',
    confidence: 0.6,
    rationale: 'Matched terms: inflation, monetary',
    status: 'proposed',
    source: 'lexical',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops stopwords and short tokens, and dedupes', () => {
    const terms = tokenize('The RBI raised rates. Rates, rates!');
    expect(terms.has('the')).toBe(false); // stopword
    expect(terms.has('rbi')).toBe(true);
    expect(terms.has('raised')).toBe(true);
    expect(terms.has('rates')).toBe(true);
    expect([...terms].filter((t) => t === 'rates')).toHaveLength(1); // deduped
  });
});

describe('classifyTextLexically', () => {
  it('matches a topic whose title words genuinely appear in the text, with an honest rationale', () => {
    const text = 'The central bank raised rates to control inflation under its monetary policy framework.';
    const result = classifyTextLexically(text, TOPICS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].topicId).toBe('topic-inflation');
    expect(result[0].confidence).toBeCloseTo(1, 5);
    expect(result[0].rationale).toContain('inflation');
    expect(result[0].rationale).toContain('monetary');
  });

  it('never proposes a topic with zero matching terms', () => {
    const text = 'A completely unrelated article about painting techniques and brush strokes.';
    const result = classifyTextLexically(text, TOPICS);
    expect(result).toEqual([]);
  });

  it('never proposes a topic below the minConfidence floor (guards against a single incidental shared word)', () => {
    const text = 'Parliament convened today.'; // matches only "parliament" out of "Parliament and Legislature"
    const result = classifyTextLexically(text, TOPICS, { minConfidence: 0.9 });
    expect(result.find((r) => r.topicId === 'topic-parliament')).toBeUndefined();
  });

  it('skips a topic whose title is entirely stopwords, without throwing', () => {
    const text = 'The and of are common words in this text about the and of.';
    expect(() => classifyTextLexically(text, TOPICS)).not.toThrow();
    expect(classifyTextLexically(text, TOPICS).find((r) => r.topicId === 'topic-stopwords')).toBeUndefined();
  });

  it('respects maxResults', () => {
    const text = 'Inflation monetary policy and Parliament legislature discussion today.';
    const result = classifyTextLexically(text, TOPICS, { maxResults: 1, minConfidence: 0.1 });
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('returns an empty array for empty text, never throws', () => {
    expect(classifyTextLexically('', TOPICS)).toEqual([]);
  });

  it('returns an empty array when given no candidate topics', () => {
    expect(classifyTextLexically('inflation monetary policy', [])).toEqual([]);
  });
});

describe('classifyTextLexically — alias-weighted evidence (P0.2)', () => {
  // P0.2 Classification Intelligence: the lexical classifier originally scored a topic purely by
  // |matched title words| / |title words|. That made a topic with a short title and ONE
  // coincidental shared word (e.g. "Mensuration: Area & Volume" matching only "area" in an
  // unrelated article about coral reefs) outscore a topic that genuinely matched a specific,
  // multi-word real-world phrase. These tests prove the fix directly, independent of the real
  // syllabus or the built-in alias map, using a small fixture so the behaviour itself (not the
  // curated content) is what's under test.
  const SHORT_TITLE_TOPIC: ApfcTopicTaxonomyEntry = { subjectId: 'quant', subjectTitle: 'Quant', topicId: 'topic-area', topicTitle: 'Mensuration: Area and Volume' };
  const ALIASED_TOPIC: ApfcTopicTaxonomyEntry = { subjectId: 'science', subjectTitle: 'Science', topicId: 'topic-ecology', topicTitle: 'Environmental Science and Ecology' };
  const FIXTURE_ALIASES = { 'Environmental Science and Ecology': ['coral reef', 'marine protected area'] };

  it('a specific multi-word alias phrase match outranks one incidental shared title word', () => {
    const text = 'Scientists restored a coral reef and enforced marine protected area rules along the coastline.';
    const result = classifyTextLexically(text, [SHORT_TITLE_TOPIC, ALIASED_TOPIC], { aliases: FIXTURE_ALIASES, minConfidence: 0 });
    const byId = new Map(result.map((r) => [r.topicId, r]));
    expect(byId.get('topic-ecology')!.confidence).toBeGreaterThan(byId.get('topic-area')!.confidence);
  });

  it('without alias phrases, behaves exactly like the original title-only ratio', () => {
    const text = 'A short piece mentioning area only.';
    const withAliases = classifyTextLexically(text, [SHORT_TITLE_TOPIC], { aliases: {}, minConfidence: 0 });
    const withoutAliasEntry = classifyTextLexically(text, [SHORT_TITLE_TOPIC], { aliases: FIXTURE_ALIASES, minConfidence: 0 }); // this topic has no entry in FIXTURE_ALIASES
    expect(withAliases[0].confidence).toBeCloseTo(1 / 3, 5); // "area" out of {mensuration, area, volume}
    expect(withoutAliasEntry[0].confidence).toBeCloseTo(1 / 3, 5);
  });

  it('a topic gains confidence only when the article genuinely contains its alias phrase, never a fabricated boost', () => {
    const unrelatedText = 'A story entirely about stamp collecting and philately clubs.';
    const result = classifyTextLexically(unrelatedText, [ALIASED_TOPIC], { aliases: FIXTURE_ALIASES, minConfidence: 0 });
    expect(result).toEqual([]);
  });

  it('an alias phrase only counts as matched when EVERY one of its words is present', () => {
    const partialText = 'A story about marine life in general, no mention of protection or area.';
    const result = classifyTextLexically(partialText, [ALIASED_TOPIC], { aliases: FIXTURE_ALIASES, minConfidence: 0 });
    expect(result).toEqual([]); // "marine" alone is not enough to satisfy "marine protected area"
  });
});

describe('APFC_TOPIC_KEYWORD_ALIASES (P0.2)', () => {
  it('never fabricates a syllabus topic — every alias key is a real topicTitle in the live APFC syllabus', () => {
    const realTitles = new Set(listApfcTopicsFlat().map((t) => t.topicTitle));
    for (const key of Object.keys(APFC_TOPIC_KEYWORD_ALIASES)) {
      expect(realTitles.has(key)).toBe(true);
    }
  });

  it('every alias phrase is non-empty and tokenizes to at least one real word', () => {
    for (const phrases of Object.values(APFC_TOPIC_KEYWORD_ALIASES)) {
      for (const phrase of phrases) {
        expect(tokenize(phrase).size).toBeGreaterThan(0);
      }
    }
  });
});

describe('classifyTextLexically against the real APFC syllabus (P0.2 acceptance regressions)', () => {
  // Five synthetic articles spanning economy, polity/governance, international relations,
  // environment/science, and social issues — the exact scenario the P0.2 brief was written
  // against (the original classifier proposed nothing for 4 of these 5). Run with the real,
  // default candidate topics and the real, default alias map — no fixtures — so this test fails
  // honestly if a future change to the syllabus or the alias map regresses real-world recall.
  const REAL_TOPICS = listApfcTopicsFlat();

  it('classifies a fiscal-deficit/economy article', () => {
    const text =
      'Fiscal Deficit Narrows on Stronger Tax Receipts. The Ministry of Finance reported today that the fiscal deficit for the current quarter narrowed, with officials citing stronger direct tax collections and a reduction in subsidy outgo. Disinvestment receipts also exceeded budget estimates, giving the government headroom for capital expenditure.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.length).toBeGreaterThan(0);
  });

  it('classifies a Parliament/governance article under the Parliament topic', () => {
    const text =
      'Parliament Clears Civil Services Examination Reform Bill. The lower house of Parliament passed a bill amending recruitment examinations for the civil services, introducing a standing committee to review syllabus updates. The law minister clarified existing reservation policies remain unchanged.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].topicId).toBe(REAL_TOPICS.find((t) => t.topicTitle === 'Parliament: Lok Sabha & Rajya Sabha, Law Making')!.topicId);
  });

  it('classifies an international river-sharing article under International Relations & Summits', () => {
    const text =
      'Neighbouring Nations Sign Framework on River Water Sharing. Representatives of three neighbouring countries concluded a framework agreement on a trans-boundary river basin. The agreement establishes a joint monitoring commission, and analysts described broader cooperation on regional trade corridors along the shared border.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].topicId).toBe(REAL_TOPICS.find((t) => t.topicTitle === 'International Relations & Summits')!.topicId);
  });

  it('classifies a coral-reef/environment article under Environmental Science & Ecology, not an incidental Quant match', () => {
    const text =
      'Coral Reef Restoration Project Shows Early Recovery Signs. A coral reef restoration programme has recorded increased live coral cover, per a survey from marine research institutes. Scientists called for stronger enforcement of existing marine protected area regulations.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].topicId).toBe(REAL_TOPICS.find((t) => t.topicTitle === 'Environmental Science & Ecology')!.topicId);
  });

  it('classifies a rural-healthcare/social-issues article under Poverty, Unemployment & Inclusive Growth', () => {
    const text =
      'Survey Highlights Gaps in Rural Healthcare Access for Women. A nationwide household survey found women in rural districts face barriers accessing primary healthcare. Social policy researchers noted outreach programmes in rural districts had shown improvement.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].topicId).toBe(REAL_TOPICS.find((t) => t.topicTitle === 'Poverty, Unemployment & Inclusive Growth')!.topicId);
  });

  it('never proposes anything for a genuinely unrelated article (false-positive guard)', () => {
    const text =
      "Local Bakery Wins Regional Pastry Competition. A small family-run bakery took home the top prize at this year's regional pastry competition, impressing judges with an inventive layered dessert combining seasonal fruit and dark chocolate ganache.";
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result).toEqual([]);
  });

  it('proposes more than one topic for an article that genuinely spans two syllabus areas', () => {
    const text =
      'Parliament Clears Civil Services Examination Reform Bill. The lower house of Parliament passed a bill amending the conduct of recruitment examinations for the civil services, introducing a standing committee to review syllabus updates every five years. The law minister clarified that existing reservation policies and age-relaxation norms remain unchanged under the new framework, and that the bill was drafted after extensive consultation with state public service commissions.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('re-running the improved scorer against an item with an existing confirmed/rejected classification never overwrites either (merge semantics are untouched by P0.2)', () => {
    const text = 'Coral Reef Restoration Project Shows Early Recovery Signs. A coral reef restoration programme has recorded increased live coral cover, per a survey from marine research institutes.';
    const ecologyTopicId = REAL_TOPICS.find((t) => t.topicTitle === 'Environmental Science & Ecology')!.topicId;
    const existing: KnowledgeClassification[] = [
      { ...classification({ id: 'manual-confirm', itemId: 'item-x', topicId: ecologyTopicId, status: 'confirmed', source: 'manual', confidence: 1, rationale: 'Manually classified by the user.' }) },
    ];
    const fresh = createLexicalClassifications({ workspaceId: 'apfc', itemId: 'item-x', itemType: 'imported_content', text, candidateTopics: REAL_TOPICS });
    const merged = mergeProposedClassifications(existing, fresh);
    const ecologyRecord = merged.find((c) => c.topicId === ecologyTopicId);
    expect(ecologyRecord!.status).toBe('confirmed');
    expect(ecologyRecord!.source).toBe('manual');
    expect(merged.filter((c) => c.topicId === ecologyTopicId)).toHaveLength(1); // never duplicated
  });
});

describe('classifyTextLexically — P0.3 Current Events alias-coverage gaps', () => {
  // The read-only coverage audit found FIVE "Current Events" topics with zero alias coverage —
  // each a category daily newspaper reporting produces constantly, yet whose own syllabus title is
  // a short, PLURAL summary label ("Awards, Honours & Prizes", "Sports Events & Winners", …) that
  // essentially never appears verbatim in a report about one specific award/match/appointment.
  // These tests prove each of the five now gets a real, floor-clearing, review-queue-eligible
  // proposal for natural newspaper wording — including a SECOND phrasing per topic that
  // deliberately exercises a different verb tense or near-synonym, per this phase's own brief.
  const REAL_TOPICS = listApfcTopicsFlat();

  function topicIdFor(title: string): string {
    return REAL_TOPICS.find((t) => t.topicTitle === title)!.topicId;
  }

  it('classifies an awards/honours article (present-tense "conferred", "award ceremony")', () => {
    const text =
      'Veteran Classical Vocalist Conferred Padma Shri. The veteran classical vocalist was conferred the Padma Shri at a ceremony held at Rashtrapati Bhavan. The award ceremony also honoured several other artists from the fields of literature and social work.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Awards, Honours & Prizes'));
  });

  it('classifies an awards/honours article using a different named award and "honoured" (word-form variant)', () => {
    const text =
      'Scientist Honoured With National Award For Research. A senior scientist received the Jnanpith Award this week for a body of research spanning three decades, with the award ceremony drawing praise from the scientific community.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Awards, Honours & Prizes'));
  });

  it('classifies a sports article using present-tense "wins"/"won"', () => {
    const text =
      'National Team Wins Gold At Asian Games. The national hockey team won the gold medal at the Asian Games after a tense final, clinching the title in a closely fought match.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Sports Events & Winners'));
  });

  it('classifies a sports article using "clinched" instead of "won" (verb-form variant)', () => {
    const text =
      "Sprinter Clinches Bronze At World Championships. The young sprinter clinched the bronze medal at the World Championships, capping a breakthrough season after last year's Commonwealth Games.";
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Sports Events & Winners'));
  });

  it('classifies an appointments article using present-tense "appointed"/"take charge"', () => {
    const text =
      "Senior Bureaucrat Appointed As New Cabinet Secretary. The senior bureaucrat was appointed as the new Cabinet Secretary this week, and will take charge as the government's top civil servant from next month.";
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Important Appointments (National/International)'));
  });

  it('classifies an appointments article using past-tense "sworn in"/"appointment" (word-form variant)', () => {
    const text =
      "Veteran Diplomat Sworn In As Ambassador. The veteran diplomat was sworn in as the country's new ambassador to a key partner nation. The appointment was announced by the foreign ministry, and the envoy is expected to take charge of the embassy next week.";
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Important Appointments (National/International)'));
  });

  it('classifies an indices/rankings article mentioning a named index', () => {
    const text =
      "India Improves Rank In Global Hunger Index. India improved its position in this year's Global Hunger Index, according to a report released by the issuing organisation, though it continues to rank behind several regional neighbours.";
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Important Indices & Rankings (India in)'));
  });

  it('classifies an indices/rankings article about ease of doing business (word-form variant: "rankings" plural)', () => {
    const text =
      'India Climbs In Ease Of Doing Business Rankings. A new World Bank report shows India climbing several places in the ease of doing business rankings, driven by reforms to starting a business.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Important Indices & Rankings (India in)'));
  });

  it('classifies an obituary article using "passed away"', () => {
    const text =
      'Renowned Novelist Passed Away At 82. The renowned novelist, celebrated for a decades-long body of work, passed away at the age of 82 after a prolonged illness, prompting tributes from across the literary world.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Books, Authors & Obituaries'));
  });

  it('classifies an obituary article using the idiom "breathed his last" (word-form variant)', () => {
    const text =
      'Noted Historian Breathed His Last. The noted historian and author of several acclaimed books on medieval India breathed his last at his residence on Sunday, with condolences pouring in from fellow scholars.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).toContain(topicIdFor('Books, Authors & Obituaries'));
  });

  it('never proposes any of the five new topics for an unrelated business/contract article mentioning "awarded"', () => {
    const text =
      'Construction Firm Awarded Highway Contract. A construction firm was awarded a major highway contract by the state government this week, with work expected to begin on the 40-kilometre stretch within two months.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    const newTopicIds = new Set(
      ['Awards, Honours & Prizes', 'Sports Events & Winners', 'Important Appointments (National/International)', 'Important Indices & Rankings (India in)', 'Books, Authors & Obituaries'].map(
        topicIdFor,
      ),
    );
    expect(result.some((r) => newTopicIds.has(r.topicId))).toBe(false);
  });

  it('never proposes Awards/Honours for an unrelated court-damages article mentioning "awarded"/"awards"', () => {
    const text =
      'Court Awards Damages In Property Dispute. A civil court awarded damages to the plaintiff in a long-running property dispute, ruling that the defendant had encroached on a portion of the disputed land.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).not.toContain(topicIdFor('Awards, Honours & Prizes'));
  });

  it('never proposes Important Appointments for an unrelated private-sector appointment (ambiguous generic term guard)', () => {
    const text =
      'Private Firm Appoints New Regional Sales Head. A private logistics firm appointed a new regional sales head this week as part of a broader restructuring of its leadership team across three states.';
    const result = classifyTextLexically(text, REAL_TOPICS);
    expect(result.map((r) => r.topicId)).not.toContain(topicIdFor('Important Appointments (National/International)'));
  });

  it('still proposes nothing from the five new topics for the genuinely unrelated bakery article', () => {
    const text =
      "Local Bakery Wins Regional Pastry Competition. A small family-run bakery took home the top prize at this year's regional pastry competition, impressing judges with an inventive layered dessert.";
    const result = classifyTextLexically(text, REAL_TOPICS);
    const newTopicIds = new Set(
      ['Awards, Honours & Prizes', 'Sports Events & Winners', 'Important Appointments (National/International)', 'Important Indices & Rankings (India in)', 'Books, Authors & Obituaries'].map(
        topicIdFor,
      ),
    );
    expect(result.some((r) => newTopicIds.has(r.topicId))).toBe(false);
  });
});

describe('createLexicalClassifications', () => {
  it('wraps lexical matches as proposed/lexical KnowledgeClassification records', () => {
    const result = createLexicalClassifications({
      workspaceId: 'apfc',
      itemId: 'item-1',
      itemType: 'imported_content',
      text: 'Inflation and monetary policy were the focus of today\'s RBI briefing.',
      candidateTopics: TOPICS,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].status).toBe('proposed');
    expect(result[0].source).toBe('lexical');
    expect(result[0].taxonomy).toBe('apfc');
    expect(result[0].itemId).toBe('item-1');
  });

  it('returns an empty array when nothing matches, never fabricating a classification', () => {
    const result = createLexicalClassifications({
      workspaceId: 'apfc',
      itemId: 'item-1',
      itemType: 'imported_content',
      text: 'Completely unrelated painting article.',
      candidateTopics: TOPICS,
    });
    expect(result).toEqual([]);
  });
});

describe('createManualClassification', () => {
  it('builds a confirmed, full-confidence, manual-source record', () => {
    const result = createManualClassification({ workspaceId: 'apfc', itemId: 'item-1', itemType: 'imported_content', topicId: 'topic-inflation' });
    expect(result!.status).toBe('confirmed');
    expect(result!.source).toBe('manual');
    expect(result!.confidence).toBe(1);
    expect(result!.topicId).toBe('topic-inflation');
  });
});

describe('mergeProposedClassifications', () => {
  it('adds a brand-new candidate with no existing match', () => {
    const result = mergeProposedClassifications([], [classification()]);
    expect(result).toHaveLength(1);
  });

  it('never overwrites an existing confirmed classification for the same item+topic', () => {
    const existing = [classification({ status: 'confirmed', confidence: 1, rationale: MANUAL_RATIONALE_FOR_TEST })];
    const incoming = classification({ id: 'c2', confidence: 0.2, rationale: 'weaker match' });
    const result = mergeProposedClassifications(existing, [incoming]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('confirmed');
    expect(result[0].confidence).toBe(1);
  });

  it('never resurrects an existing rejected classification for the same item+topic', () => {
    const existing = [classification({ status: 'rejected' })];
    const incoming = classification({ id: 'c2', confidence: 0.9 });
    const result = mergeProposedClassifications(existing, [incoming]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('rejected');
  });

  it('refreshes an existing proposed classification in place rather than duplicating it', () => {
    const existing = [classification({ id: 'c1', confidence: 0.4, rationale: 'old rationale' })];
    const incoming = classification({ id: 'c2', confidence: 0.8, rationale: 'new rationale', source: 'ai' });
    const result = mergeProposedClassifications(existing, [incoming]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1'); // id/createdAt/status of the ORIGINAL record are kept
    expect(result[0].confidence).toBe(0.8);
    expect(result[0].rationale).toBe('new rationale');
    expect(result[0].source).toBe('ai');
  });

  it('is a no-op for an empty candidate batch', () => {
    const existing = [classification()];
    expect(mergeProposedClassifications(existing, [])).toEqual(existing);
  });

  it('treats a different topicId on the same item as a separate, independently-added classification', () => {
    const existing = [classification({ topicId: 'topic-inflation' })];
    const incoming = classification({ id: 'c2', topicId: 'topic-parliament' });
    const result = mergeProposedClassifications(existing, [incoming]);
    expect(result).toHaveLength(2);
  });
});

describe('confirmClassification / rejectClassification / deleteClassification', () => {
  it('confirmClassification sets status to confirmed and re-stamps updatedAt', () => {
    const result = confirmClassification([classification()], 'c1', '2026-02-02T00:00:00.000Z');
    expect(result[0].status).toBe('confirmed');
    expect(result[0].updatedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('rejectClassification sets status to rejected', () => {
    const result = rejectClassification([classification()], 'c1');
    expect(result[0].status).toBe('rejected');
  });

  it('deleteClassification removes exactly the matching record', () => {
    const result = deleteClassification([classification({ id: 'c1' }), classification({ id: 'c2' })], 'c1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c2');
  });

  it('an unknown id is a no-op for confirm/reject/delete', () => {
    const items = [classification()];
    expect(confirmClassification(items, 'nope')).toEqual(items);
    expect(rejectClassification(items, 'nope')).toEqual(items);
    expect(deleteClassification(items, 'nope')).toEqual(items);
  });
});

describe('deleteClassificationsForItem', () => {
  it('removes every classification for the given item, leaving others untouched', () => {
    const items = [classification({ id: 'c1', itemId: 'item-1' }), classification({ id: 'c2', itemId: 'item-2' })];
    const result = deleteClassificationsForItem(items, 'item-1');
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe('item-2');
  });
});

describe('listClassificationsForItem / listClassificationsForTopic / listReviewQueue', () => {
  const items = [
    classification({ id: 'c1', itemId: 'item-1', topicId: 'topic-inflation', status: 'proposed', confidence: 0.5 }),
    classification({ id: 'c2', itemId: 'item-1', topicId: 'topic-parliament', status: 'confirmed' }),
    classification({ id: 'c3', itemId: 'item-2', topicId: 'topic-inflation', status: 'proposed', confidence: 0.9 }),
  ];

  it('listClassificationsForItem scopes to one item', () => {
    expect(listClassificationsForItem(items, 'item-1')).toHaveLength(2);
  });

  it('listClassificationsForTopic scopes to one topic, optionally by status', () => {
    expect(listClassificationsForTopic(items, 'topic-inflation')).toHaveLength(2);
    expect(listClassificationsForTopic(items, 'topic-inflation', ['confirmed'])).toHaveLength(0);
    expect(listClassificationsForTopic(items, 'topic-parliament', ['confirmed'])).toHaveLength(1);
  });

  it('listReviewQueue returns only proposed items, most confident first', () => {
    const queue = listReviewQueue(items);
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe('c3'); // confidence 0.9
    expect(queue[1].id).toBe('c1'); // confidence 0.5
  });
});

describe('classifyTextLexically — P0.5 reproducing the P0.4-identified defects (against the REAL syllabus)', () => {
  // P0.4 was a read-only audit that hand-traced these scores manually — it never executed a test.
  // These tests execute the exact same scenarios for real, against the real APFC_TOPIC_KEYWORD_ALIASES
  // and the real SYLLABUS, to confirm (or refute) the P0.4 findings before any production code changes.
  const REAL_TOPICS = listApfcTopicsFlat();

  function topicIdFor(title: string): string {
    return REAL_TOPICS.find((t) => t.topicTitle === title)!.topicId;
  }

  describe('defect 1 — word-form mismatches cause false negatives on genuinely on-topic content', () => {
    it('FIXED by P0.5: an on-topic Depreciation note is now proposed, even though it uses "method"/"calculated" rather than the title\'s own "methods"/"calculation" (heading deliberately does NOT restate the topic title, matching how a user\'s own revision-note heading would read)', () => {
      const text =
        "Revision Notes — Depreciation Basics. Depreciation is the systematic allocation of an asset's cost over its useful life, commonly calculated using the straight-line method or the written-down value method, and is recorded as a non-cash expense in the profit and loss account.";
      const result = classifyTextLexically(text, REAL_TOPICS);
      const depreciationTopicId = topicIdFor('Depreciation: Methods & Calculation');
      const match = result.find((r) => r.topicId === depreciationTopicId);
      expect(match).toBeDefined();
      expect(match!.confidence).toBeGreaterThanOrEqual(0.34);
    });

    it('FIXED by P0.5: a textbook Data Interpretation question is now proposed, even though it says "chart"/"interpreted" rather than the title\'s own "charts"/"interpretation" (heading deliberately does NOT restate the topic title)', () => {
      const text =
        'Quant Practice Question Of The Day. A bar chart displaying quarterly sales data can be interpreted by comparing the height of each bar relative to the scale on the y-axis, while a pie chart represents proportions as segments of a circle.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      const diTopicId = topicIdFor('Data Interpretation (Tables, Charts, Graphs)');
      const match = result.find((r) => r.topicId === diTopicId);
      expect(match).toBeDefined();
      expect(match!.confidence).toBeGreaterThanOrEqual(0.34);
    });

    it('does NOT over-normalise: "calculation" (noun) and "calculated" (verb) still do not count as the same word — a conservative, disclosed limitation', () => {
      // Isolates the one word pair P0.5 does NOT fix (see normalizeForMatch's own header) from the
      // Depreciation test above, which passes only because "method"/"methods" ALSO matched.
      const onlyCalculationWord = tokenize('Calculation');
      const onlyCalculatedWord = tokenize('calculated figures were used');
      expect(normalizeForMatch([...onlyCalculationWord][0])).not.toBe(normalizeForMatch([...onlyCalculatedWord].find((w) => w.startsWith('calculat'))!));
    });
  });

  describe('defect 2 — a single generic word incorrectly proposes a short, generic topic title', () => {
    it('FIXED by P0.5: the word "work" ALONE no longer proposes "Time & Work" for a completely unrelated article', () => {
      const text =
        'Veteran Classical Vocalist Conferred Padma Shri. The award ceremony also honoured several other artists from the fields of literature and social work.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      const timeWorkTopicId = topicIdFor('Time & Work');
      expect(result.map((r) => r.topicId)).not.toContain(timeWorkTopicId);
    });

    it('does not suppress "Time & Work" when the article genuinely contains BOTH of its title words', () => {
      const text = 'Time Management And Work-Life Balance Tips. Experts recommend structuring your work day around focused blocks of time to improve productivity.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      const timeWorkTopicId = topicIdFor('Time & Work');
      expect(result.map((r) => r.topicId)).toContain(timeWorkTopicId);
    });

    it('does not suppress a genuinely single-word topic title ("Percentage") matching on its one real word', () => {
      const text = 'A discount of 20 percentage points was applied to the original price during the festive sale.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      const percentageTopicId = topicIdFor('Percentage');
      expect(result.map((r) => r.topicId)).toContain(percentageTopicId);
    });
  });

  describe('named Acts, movements and schemes (proper-noun topics) keep matching reliably after P0.5', () => {
    it('a note on the Payment of Gratuity Act, 1972 is classified correctly', () => {
      const text =
        'Labour Law Notes. The Payment of Gratuity Act, 1972 entitles an employee to a lump-sum gratuity payment after completing five years of continuous service, calculated as 15 days’ wages for every completed year of service.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      expect(result.map((r) => r.topicId)).toContain(topicIdFor('Payment of Gratuity Act, 1972'));
    });

    it('a note on the Quit India Movement is classified correctly', () => {
      const text =
        'Freedom Struggle Revision. The Quit India Movement was launched in August 1942 by the Indian National Congress, calling for an immediate end to British rule and leading to widespread arrests.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      expect(result.map((r) => r.topicId)).toContain(topicIdFor('Quit India Movement (1942)'));
    });

    it('a note on the Employees’ Pension Scheme (EPS-95) is classified correctly', () => {
      const text =
        'EPFO Notes. The Employees’ Pension Scheme, 1995 (EPS-95) provides a monthly pension to EPF subscribers after retirement, calculated based on pensionable salary and years of pensionable service.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      expect(result.map((r) => r.topicId)).toContain(topicIdFor('Employees’ Pension Scheme (EPS-95)'));
    });
  });

  describe('genuine multi-topic articles vs. spurious co-proposals (documented, not newly fixed)', () => {
    it('a genuinely two-topic article (Parliament + Centre-State Relations) still proposes both', () => {
      const text =
        'Parliament Clears Civil Services Examination Reform Bill. The lower house of Parliament passed a bill amending the conduct of recruitment examinations for the civil services, introducing a standing committee to review syllabus updates every five years. The law minister clarified that existing reservation policies and age-relaxation norms remain unchanged under the new framework, and that the bill was drafted after extensive consultation with state public service commissions.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      expect(result.map((r) => r.topicId)).toContain(topicIdFor('Parliament: Lok Sabha & Rajya Sabha, Law Making'));
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('DOCUMENTS (not fixed by P0.5): a fiscal-deficit article still spuriously co-proposes an unrelated Accounting topic ("Capital & Revenue Expenditure/Receipts") above the correct Economy topics — a 4-word, un-aliased title not covered by the short-title guard', () => {
      const text =
        'Fiscal Deficit Narrows on Stronger Tax Receipts. The Ministry of Finance reported today that the fiscal deficit for the current quarter narrowed, with officials citing stronger direct tax collections and a reduction in subsidy outgo. Disinvestment receipts also exceeded budget estimates, giving the government headroom for capital expenditure.';
      const result = classifyTextLexically(text, REAL_TOPICS);
      const capitalRevenueId = topicIdFor('Capital & Revenue Expenditure/Receipts');
      // Still present — this specific spurious co-proposal is OUT OF SCOPE for the short-title guard
      // (title has 4 words, already "safe" by the floor's own pre-existing arithmetic, so P0.5
      // neither targets nor changes it). Documented here so it is never silently assumed fixed.
      expect(result.map((r) => r.topicId)).toContain(capitalRevenueId);
    });
  });
});

describe('taxonomyForWorkspace (P1.1 — explicit, type-safe workspace-to-taxonomy mapping)', () => {
  it('maps the apfc workspace to the apfc taxonomy', () => {
    expect(taxonomyForWorkspace('apfc')).toBe('apfc');
  });

  it('maps the upsc_cse workspace to the upsc_cse taxonomy', () => {
    expect(taxonomyForWorkspace('upsc_cse')).toBe('upsc_cse');
  });

  it('returns undefined for phd_research — no taxonomy exists for it yet, never a silent fallback to apfc', () => {
    expect(taxonomyForWorkspace('phd_research')).toBeUndefined();
  });
});

describe('createManualClassification (P1.1 — taxonomy derived from workspaceId)', () => {
  it('stamps taxonomy "apfc" for the apfc workspace', () => {
    const result = createManualClassification({ workspaceId: 'apfc', itemId: 'item-1', itemType: 'imported_content', topicId: 'topic-inflation' });
    expect(result?.taxonomy).toBe('apfc');
    expect(result?.status).toBe('confirmed');
  });

  it('stamps taxonomy "upsc_cse" for the upsc_cse workspace, using a real granular CSE topic id', () => {
    const realCseTopicId = listUpscCseTopicsFlat()[0].topicId;
    const result = createManualClassification({ workspaceId: 'upsc_cse', itemId: 'item-1', itemType: 'imported_content', topicId: realCseTopicId });
    expect(result?.taxonomy).toBe('upsc_cse');
    expect(result?.topicId).toBe(realCseTopicId);
    expect(isValidUpscCseTopicId(result!.topicId)).toBe(true);
  });

  it('returns undefined (never fabricates) for phd_research, which has no taxonomy yet', () => {
    const result = createManualClassification({ workspaceId: 'phd_research', itemId: 'item-1', itemType: 'imported_content', topicId: 'anything' });
    expect(result).toBeUndefined();
  });
});

describe('createLexicalClassifications (P1.1 — same workspace-to-taxonomy mapping as manual classification)', () => {
  it('stamps taxonomy "apfc" when the workspace is apfc', () => {
    const result = createLexicalClassifications({
      workspaceId: 'apfc',
      itemId: 'item-1',
      itemType: 'imported_content',
      text: 'Inflation and monetary policy were the focus of today\'s RBI briefing.',
      candidateTopics: TOPICS,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((c) => c.taxonomy === 'apfc')).toBe(true);
  });

  it('stamps taxonomy "upsc_cse" when the workspace is upsc_cse, using real granular CSE topic ids', () => {
    const cseTopics = listUpscCseTopicsFlat();
    const text = cseTopics
      .slice(0, 5)
      .map((t) => t.topicTitle)
      .join('. ');
    const result = createLexicalClassifications({
      workspaceId: 'upsc_cse',
      itemId: 'item-1',
      itemType: 'imported_content',
      text,
      candidateTopics: cseTopics,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((c) => c.taxonomy === 'upsc_cse')).toBe(true);
    expect(result.every((c) => isValidUpscCseTopicId(c.topicId))).toBe(true);
  });

  it('returns [] (never fabricates) for phd_research, regardless of how well the text matches the candidate topics', () => {
    const result = createLexicalClassifications({
      workspaceId: 'phd_research',
      itemId: 'item-1',
      itemType: 'imported_content',
      text: 'Inflation and monetary policy were the focus of today\'s RBI briefing.',
      candidateTopics: TOPICS,
    });
    expect(result).toEqual([]);
  });
});

describe('APFC and CSE topic taxonomies never overlap (P1.1)', () => {
  it('listApfcTopicsFlat and listUpscCseTopicsFlat produce disjoint topicId sets', () => {
    const apfcIds = new Set(listApfcTopicsFlat().map((t) => t.topicId));
    const cseIds = new Set(listUpscCseTopicsFlat().map((t) => t.topicId));
    const overlap = [...apfcIds].filter((id) => cseIds.has(id));
    expect(overlap).toEqual([]);
  });

  it('a CSE topic id is never valid as an APFC topic id and vice versa', () => {
    const realCseTopicId = listUpscCseTopicsFlat()[0].topicId;
    const realApfcTopicId = listApfcTopicsFlat()[0].topicId;
    expect(isValidUpscCseTopicId(realApfcTopicId)).toBe(false);
    expect(listApfcTopicsFlat().some((t) => t.topicId === realCseTopicId)).toBe(false);
  });
});

describe('cross-workspace taxonomy mismatches are rejected by mergeProposedClassifications (P1.1)', () => {
  it('an APFC and a CSE classification sharing the same itemId AND the same literal topicId string are NEVER treated as the same record — taxonomy is part of the merge key', () => {
    // Deliberately contrived: pick a literal string that happens to exist in BOTH taxonomies'
    // id spaces is not realistic (ids are disjoint, per the test above), so this proves the
    // MECHANISM (sameTarget's own taxonomy comparison) rather than a realistic collision.
    const sharedLiteralId = 'shared-literal-id';
    const apfcRecord = classification({ id: 'c1', itemId: 'item-1', taxonomy: 'apfc', topicId: sharedLiteralId, status: 'confirmed' });
    const cseCandidate = { ...classification({ id: 'c2', itemId: 'item-1', taxonomy: 'upsc_cse', topicId: sharedLiteralId }) };
    const result = mergeProposedClassifications([apfcRecord], [cseCandidate]);
    // Both records coexist — the CSE candidate is NOT merged into/confused with the APFC one.
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.taxonomy === 'apfc')!.status).toBe('confirmed');
    expect(result.find((c) => c.taxonomy === 'upsc_cse')!.status).toBe('proposed');
  });
});

// P1.3 — targeted fix for the four concrete false negatives the P1.3 read-only audit measured
// (0/296 CSE topics had any alias coverage before this; a coincidental title collision with an
// APFC alias key aside). UPSC_CSE_TOPIC_KEYWORD_ALIASES is id-keyed (never title-keyed, unlike
// APFC's own map) specifically because two real CSE topics legitimately share a title string —
// see the duplicate-title isolation tests below.
describe('UPSC_CSE_TOPIC_KEYWORD_ALIASES (P1.3)', () => {
  it('never fabricates a syllabus topic — every alias key is a real, live topicId in the CSE taxonomy', () => {
    const realIds = new Set(listUpscCseTopicsFlat().map((t) => t.topicId));
    for (const key of Object.keys(UPSC_CSE_TOPIC_KEYWORD_ALIASES)) {
      expect(realIds.has(key)).toBe(true);
    }
  });

  it('every alias phrase is non-empty and tokenizes to at least one real word', () => {
    for (const phrases of Object.values(UPSC_CSE_TOPIC_KEYWORD_ALIASES)) {
      for (const phrase of phrases) {
        expect(tokenize(phrase).size).toBeGreaterThan(0);
      }
    }
  });

  it('is keyed by topicId, never by topicTitle — APFC_TOPIC_KEYWORD_ALIASES stays the only title-keyed map', () => {
    const realTitles = new Set(listUpscCseTopicsFlat().map((t) => t.topicTitle));
    for (const key of Object.keys(UPSC_CSE_TOPIC_KEYWORD_ALIASES)) {
      // A topicId never collides with a topicTitle string in this taxonomy's own id scheme
      // (ids are generated with `__t-` segments, titles are human-readable phrases) — this just
      // guards against someone accidentally pasting a title in as a key in the future.
      expect(realTitles.has(key)).toBe(false);
    }
  });
});

describe('classifyTextLexically — aliasesById is additive and taxonomy-isolated (P1.3)', () => {
  it('a topic with no aliasesById entry behaves exactly as before — APFC default path is untouched', () => {
    const withDefault = classifyTextLexically('inflation and monetary policy report', TOPICS);
    const withEmptyAliasesById = classifyTextLexically('inflation and monetary policy report', TOPICS, { aliasesById: {} });
    expect(withDefault).toEqual(withEmptyAliasesById);
  });

  it('aliasesById and the title-keyed aliases option combine additively for the same topic', () => {
    const topics = [{ subjectId: 's', subjectTitle: 'S', topicId: 'topic-x', topicTitle: 'Alpha Beta Gamma Delta' }];
    // Title alone (4 words) needs a high match ratio; one alias word from each source should combine.
    const withBoth = classifyTextLexically('alpha zzz-title-alias zzz-id-alias', topics, {
      aliases: { 'Alpha Beta Gamma Delta': ['zzz-title-alias'] },
      aliasesById: { 'topic-x': ['zzz-id-alias'] },
    });
    expect(withBoth).toHaveLength(1);
    // tokenize() strips hyphens to spaces and drops words under 3 chars, so "zzz-id-alias"'s own
    // "id" is dropped — a matched phrase's own rationale reads space-joined on the surviving words.
    expect(withBoth[0].rationale).toContain('zzz title alias');
    expect(withBoth[0].rationale).toContain('zzz alias');
  });

  it('duplicate-titled CSE topics ("Data Sufficiency") are isolated by id — an alias on one never leaks to its sibling', () => {
    const cseTopics = listUpscCseTopicsFlat();
    const dataSufficiencyTopics = cseTopics.filter((t) => t.topicTitle === 'Data Sufficiency');
    expect(dataSufficiencyTopics.length).toBe(2);
    const [idA, idB] = dataSufficiencyTopics.map((t) => t.topicId);

    const results = classifyTextLexically('sufficiency zzzuniquephrase', cseTopics, { aliasesById: { [idA]: ['zzzuniquephrase'] } });
    const matchedIds = results.map((r) => r.topicId);
    expect(matchedIds).toContain(idA);
    expect(matchedIds).not.toContain(idB);
  });
});

describe('createLexicalClassifications auto-applies UPSC_CSE_TOPIC_KEYWORD_ALIASES for upsc_cse only (P1.3)', () => {
  const CSE_TOPICS = listUpscCseTopicsFlat();

  it('Centre-State Relations: a real-world paraphrase that scored 0 candidates pre-P1.3 now clears the floor', () => {
    const text = 'Several state governments objected to the union government encroaching on subjects reserved for the states, reviving the federal tussle.';
    const result = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS });
    expect(result.map((r) => r.topicId)).toContain('mains-gs2-constitution-polity-union-state-functions__t-centre-state-relations');
  });

  it('Fiscal Policy Tools: a real-world paraphrase that scored 0 candidates pre-P1.3 now clears the floor', () => {
    const text = 'The finance ministry adjusted its tax and spending plans for the year, aiming to balance growth with fiscal discipline.';
    const result = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS });
    expect(result.map((r) => r.topicId)).toContain('mains-gs3-economy-government-budgeting__t-fiscal-policy-tools');
  });

  it('Earthquakes & Tsunamis: a colloquial "quake" (not an inflection normalizeForMatch can bridge) now clears the floor', () => {
    const text = 'A powerful quake and the tsunami it triggered struck the coastal belt, prompting evacuation of fishing villages.';
    const result = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS });
    expect(result.map((r) => r.topicId)).toContain('mains-gs1-geography-geophysical-phenomena__t-earthquakes-tsunamis');
  });

  it('Earthquakes & Tsunamis: a plain "earthquake" (singular) mention now clears the floor too', () => {
    const text = 'A moderate earthquake rattled a hill state overnight, though no tsunami warning was issued.';
    const result = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS });
    expect(result.map((r) => r.topicId)).toContain('mains-gs1-geography-geophysical-phenomena__t-earthquakes-tsunamis');
  });

  it('Indus Valley Civilization: the audited false positive is fixed — the correct topic is returned AND outranks "Smart Cities & Urban Planning"', () => {
    const text = 'Harappan Cities Unearthed\n\nArchaeologists excavating sites along the Indus river uncovered granaries and drainage systems from the Harappan urban centres.';
    const result = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS });
    const ivcId = 'prelims-gs1-history-ancient__t-ivc';
    const smartCitiesId = CSE_TOPICS.find((t) => t.topicTitle === 'Smart Cities & Urban Planning')!.topicId;
    expect(result.map((r) => r.topicId)).toContain(ivcId);
    expect(result.map((r) => r.topicId)).toContain(smartCitiesId);
    const ivcEntry = result.find((r) => r.topicId === ivcId)!;
    const smartCitiesEntry = result.find((r) => r.topicId === smartCitiesId)!;
    expect(ivcEntry.confidence).toBeGreaterThan(smartCitiesEntry.confidence);
    // Sorted by confidence descending — IVC must be ranked ahead of the previously-top-ranked wrong candidate.
    expect(result.findIndex((r) => r.topicId === ivcId)).toBeLessThan(result.findIndex((r) => r.topicId === smartCitiesId));
  });

  it('a topic with no UPSC_CSE_TOPIC_KEYWORD_ALIASES entry is completely unaffected (confidence identical with and without the auto-applied map)', () => {
    const text = 'Climatology Update: Monsoon Patterns\n\nRecent climatology research tracked monsoon rainfall and climatology-linked ocean temperature anomalies.';
    const withDefault = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS });
    const withAliasingDisabled = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS, options: { aliasesById: {} } });
    // Compare the scoring-relevant fields only — id/createdAt/updatedAt legitimately differ between
    // two separate calls (uuid() and the clock both advance), which is not what this test is about.
    const strip = (rs: KnowledgeClassification[]) => rs.map((r) => ({ topicId: r.topicId, confidence: r.confidence, rationale: r.rationale }));
    expect(strip(withDefault)).toEqual(strip(withAliasingDisabled));
  });

  it('an explicit caller-supplied aliasesById overrides the automatic CSE default rather than merging with it', () => {
    // The Centre-State Relations regression scenario above: one title word ("state") plus the
    // "federal tussle" alias phrase together clear the floor; neither alone does (see
    // UPSC_CSE_TOPIC_KEYWORD_ALIASES' own header on why its phrase lists are kept minimal). An
    // explicit override to {} must switch this back off entirely.
    const text = 'Several state governments objected to the union government encroaching on subjects reserved for the states, reviving the federal tussle.';
    const withDefault = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS });
    const withOverride = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: CSE_TOPICS, options: { aliasesById: {} } });
    const centreStateId = 'mains-gs2-constitution-polity-union-state-functions__t-centre-state-relations';
    expect(withDefault.map((r) => r.topicId)).toContain(centreStateId);
    expect(withOverride.map((r) => r.topicId)).not.toContain(centreStateId);
  });

  it('the APFC taxonomy never receives CSE aliasing or abbreviation expansion', () => {
    const apfcTopics = listApfcTopicsFlat();
    const text = 'FDI PPP federal tussle tax and spending quake harappan';
    const result = createLexicalClassifications({ workspaceId: 'apfc', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: apfcTopics });
    // None of the CSE-only alias/abbreviation vocabulary above should spuriously classify an
    // APFC article — if it did, these words would have to coincidentally match a real APFC
    // topic's own title/alias vocabulary, which this input was chosen to avoid.
    expect(result).toEqual([]);
  });
});

describe('expandUpscCseAbbreviations (P1.3)', () => {
  it('expands a standalone "PPP" by appending its canonical expansion (never replacing the original text)', () => {
    const expanded = expandUpscCseAbbreviations('A PPP model was proposed for the highway.');
    expect(expanded).toContain('PPP');
    expect(expanded).toContain('public private partnership');
  });

  it('expands a standalone "FDI" by appending its canonical expansion', () => {
    const expanded = expandUpscCseAbbreviations('FDI inflows rose sharply this quarter.');
    expect(expanded).toContain('foreign direct investment');
  });

  it('is case-insensitive', () => {
    expect(expandUpscCseAbbreviations('fdi inflows rose.')).toContain('foreign direct investment');
  });

  it('never expands a substring inside a longer word — whole-word boundary only', () => {
    expect(expandUpscCseAbbreviations('The FDIC insures deposits.')).not.toContain('foreign direct investment');
    expect(expandUpscCseAbbreviations('Configure your router for PPPoE.')).not.toContain('public private partnership');
  });

  it('is a no-op (returns the input unchanged) when no known abbreviation is present', () => {
    const text = 'A plain sentence with no abbreviations.';
    expect(expandUpscCseAbbreviations(text)).toBe(text);
  });

  it('PPP: via full end-to-end dispatch, an abbreviation-only article now matches "Public-Private Partnership" at full confidence', () => {
    const cseTopics = listUpscCseTopicsFlat();
    const text = 'PPP Model for New Highway\n\nThe highway will be built under a PPP arrangement between the state and a private concessionaire.';
    const result = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: cseTopics });
    const match = result.find((r) => r.topicId === cseTopics.find((t) => t.topicTitle === 'Public-Private Partnership')!.topicId);
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(1);
  });

  it('FDI: via full end-to-end dispatch, an abbreviation-only article now matches "Foreign Direct Investment" at full confidence', () => {
    const cseTopics = listUpscCseTopicsFlat();
    const text = 'FDI Inflows Rise Sharply\n\nFDI inflows into the manufacturing sector rose sharply this quarter according to new data.';
    const result = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text, candidateTopics: cseTopics });
    const match = result.find((r) => r.topicId === cseTopics.find((t) => t.topicTitle === 'Foreign Direct Investment')!.topicId);
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(1);
  });

  it('FDIC/PPPoE whole-word boundary controls: via full end-to-end dispatch, these never spuriously match Public-Private Partnership or Foreign Direct Investment', () => {
    const cseTopics = listUpscCseTopicsFlat();
    const fdicText = 'The FDIC insures bank deposits up to a certain limit.';
    const pppoeText = 'Configure your internet router for a PPPoE connection.';
    const fdicResult = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text: fdicText, candidateTopics: cseTopics });
    const pppoeResult = createLexicalClassifications({ workspaceId: 'upsc_cse', itemId: 'i1', itemType: 'imported_content', text: pppoeText, candidateTopics: cseTopics });
    const fdiTopicId = cseTopics.find((t) => t.topicTitle === 'Foreign Direct Investment')!.topicId;
    const pppTopicId = cseTopics.find((t) => t.topicTitle === 'Public-Private Partnership')!.topicId;
    expect(fdicResult.map((r) => r.topicId)).not.toContain(fdiTopicId);
    expect(pppoeResult.map((r) => r.topicId)).not.toContain(pppTopicId);
  });
});
