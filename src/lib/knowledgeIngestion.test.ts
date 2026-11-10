import { describe, it, expect } from 'vitest';
import { ingestMarkdownAsArticles } from './knowledgeIngestion';
import { listReviewQueue } from './knowledgeClassification';
import { listUpscCseTopicsFlat, isValidUpscCseTopicId } from './upscCseKnowledgeTaxonomy';
import type { ApfcTopicTaxonomyEntry } from './apfcSyllabusTaxonomy';

const TOPICS: ApfcTopicTaxonomyEntry[] = [
  { subjectId: 'economy', subjectTitle: 'Economy', topicId: 'topic-inflation', topicTitle: 'Inflation and Monetary Policy' },
  { subjectId: 'polity', subjectTitle: 'Polity', topicId: 'topic-parliament', topicTitle: 'Parliament and Legislature' },
];

function run(rawContent: string, overrides: Partial<Parameters<typeof ingestMarkdownAsArticles>[0]> = {}) {
  return ingestMarkdownAsArticles({
    workspaceId: 'apfc',
    filename: 'clippings.md',
    rawContent,
    originalFormat: 'markdown',
    candidateTopics: TOPICS,
    ...overrides,
  });
}

describe('ingestMarkdownAsArticles', () => {
  it('always preserves the full original document, unedited, regardless of extraction outcome', () => {
    const raw = '## Inflation Rises\nInflation and monetary policy concerns dominate today\'s briefing.\n\n## Parliament Session\nParliament and legislature debate continues.';
    const batch = run(raw);
    expect(batch.originalDocument.contentType).toBe('document');
    expect(batch.originalDocument.rawContent).toBe(raw.replace(/\r\n/g, '\n').trim());
    expect(batch.originalDocument.provenance.sourceFilename).toBe('clippings.md');
  });

  it('titles the original document from the FILENAME, never the same heading-derived title as its first article (avoids an identical-looking pair of cards)', () => {
    const raw = '## Inflation Rises\nInflation and monetary policy concerns dominate the discussion on rising prices today.';
    const batch = run(raw, { filename: 'march-clippings.md' });
    expect(batch.originalDocument.title).toBe('march-clippings');
    expect(batch.articles[0].title).toBe('Inflation Rises');
    expect(batch.originalDocument.title).not.toBe(batch.articles[0].title);
  });

  it('produces one current_affairs ImportedContent per extracted article', () => {
    const raw = '## Inflation Rises\nInflation and monetary policy concerns dominate.\n\n## Parliament Session\nParliament and legislature debate continues.';
    const batch = run(raw);
    expect(batch.articles).toHaveLength(2);
    expect(batch.articles.every((a) => a.contentType === 'current_affairs')).toBe(true);
    expect(batch.articles[0].title).toBe('Inflation Rises');
    expect(batch.articles[1].title).toBe('Parliament Session');
  });

  it('carries Date:/Source: metadata through to each article\'s ImportedContentMetadata', () => {
    const raw = '## Budget Day\nDate: 2026-02-01\nSource: The Hindu\n\nFull coverage of the budget announcement with monetary policy implications.';
    const batch = run(raw);
    expect(batch.articles[0].metadata?.eventDate).toBe('2026-02-01');
    expect(batch.articles[0].metadata?.source).toBe('The Hindu');
  });

  it('links the original document to every extracted article via a related_to relationship', () => {
    const raw = '## A\nInflation and monetary policy text here.\n\n## B\nParliament and legislature text here.';
    const batch = run(raw);
    expect(batch.relationships).toHaveLength(2);
    for (const rel of batch.relationships) {
      expect(rel.sourceId).toBe(batch.originalDocument.id);
      expect(rel.sourceType).toBe('imported_content');
      expect(rel.type).toBe('related_to');
    }
    const targetIds = batch.relationships.map((r) => r.targetId).sort();
    const articleIds = batch.articles.map((a) => a.id).sort();
    expect(targetIds).toEqual(articleIds);
  });

  it('produces lexical classification proposals per article that genuinely matches a topic', () => {
    const raw = '## Inflation Rises\nInflation and monetary policy concerns dominate the discussion on rising prices.';
    const batch = run(raw);
    expect(batch.classifications.length).toBeGreaterThan(0);
    expect(batch.classifications[0].itemId).toBe(batch.articles[0].id);
    expect(batch.classifications[0].topicId).toBe('topic-inflation');
    expect(batch.classifications[0].status).toBe('proposed');
    expect(batch.classifications[0].source).toBe('lexical');
  });

  it('produces no classification for an article that matches no topic, without throwing', () => {
    const raw = '## Unrelated\nA completely unrelated article about painting techniques and brush strokes.';
    const batch = run(raw);
    expect(batch.classifications).toEqual([]);
    expect(batch.articles).toHaveLength(1); // the article is still saved
  });

  it('still saves the original document, with zero articles and a clear warning, for an empty file', () => {
    const batch = run('');
    expect(batch.originalDocument).toBeDefined();
    expect(batch.originalDocument.rawContent).toBe('');
    expect(batch.articles).toEqual([]);
    expect(batch.classifications).toEqual([]);
    expect(batch.relationships).toEqual([]);
    expect(batch.warnings.some((w) => w.toLowerCase().includes('empty'))).toBe(true);
    expect(batch.warnings.some((w) => w.includes('original document has still been saved'))).toBe(true);
  });

  it('still saves the original document for a file with no headings, as a single extracted article, with a warning', () => {
    const batch = run('Just a plain paragraph of real text content with no heading structure at all in it.');
    expect(batch.originalDocument).toBeDefined();
    expect(batch.articles).toHaveLength(1);
    expect(batch.warnings.some((w) => w.includes('No headings were found'))).toBe(true);
  });

  it('never throws on malformed/garbage markdown, and still preserves the original document', () => {
    const malformed = '### \n#\n##\n**Date:**\nSource:\n```broken fence with no close';
    expect(() => run(malformed)).not.toThrow();
    const batch = run(malformed);
    expect(batch.originalDocument.rawContent.length).toBeGreaterThan(0);
  });

  it('defaults candidateTopics to the real, live APFC syllabus when none is passed', () => {
    const batch = ingestMarkdownAsArticles({
      workspaceId: 'apfc',
      filename: 'f.md',
      rawContent: '## Heading\nSome reasonably long body text about a topic, to avoid the near-empty-file guard.',
      originalFormat: 'markdown',
    });
    expect(batch.originalDocument).toBeDefined();
    // Not asserting on specific classifications here (the real syllabus can change) — only that
    // calling without candidateTopics doesn't throw and still produces a usable batch.
    expect(batch.articles).toHaveLength(1);
  });

  it('passes sourceHash/sourceFileSize through to both the original document and each article', () => {
    const batch = run('## A\nInflation and monetary policy discussion text here for the article body.', {
      sourceHash: 'hash-123',
      sourceFileSize: 4096,
    });
    expect(batch.originalDocument.provenance.sourceHash).toBe('hash-123');
    expect(batch.originalDocument.provenance.sourceFileSize).toBe(4096);
    expect(batch.articles[0].provenance.sourceHash).toBe('hash-123');
    expect(batch.articles[0].provenance.sourceFileSize).toBe(4096);
  });
});

describe('ingestMarkdownAsArticles — P0.2 real-syllabus acceptance regression', () => {
  // The exact five-domain synthetic compilation the P0.2 brief was written against, run end to
  // end through the real pipeline (extraction + lexical classification against the real, live
  // APFC syllabus — candidateTopics intentionally omitted). Before P0.2, this produced a
  // classification for only 1 of these 5 articles.
  const FIVE_ARTICLE_COMPILATION = [
    '## Fiscal Deficit Narrows on Stronger Tax Receipts',
    'The Ministry of Finance reported today that the fiscal deficit for the current quarter narrowed, with officials citing stronger direct tax collections and a reduction in subsidy outgo. Disinvestment receipts also exceeded budget estimates, giving the government headroom for capital expenditure.',
    '',
    '## Parliament Clears Civil Services Examination Reform Bill',
    'The lower house of Parliament passed a bill amending the conduct of recruitment examinations for the civil services, introducing a standing committee to review syllabus updates every five years. The law minister clarified that existing reservation policies remain unchanged, and that the bill was drafted after extensive consultation with state public service commissions.',
    '',
    '## Neighbouring Nations Sign Framework on River Water Sharing',
    'Representatives of three neighbouring countries concluded a framework agreement on a trans-boundary river basin. The agreement establishes a joint monitoring commission, and analysts described broader cooperation on regional trade corridors along the shared border.',
    '',
    '## Coral Reef Restoration Project Shows Early Recovery Signs',
    'A coral reef restoration programme has recorded increased live coral cover, per a survey from marine research institutes. Scientists called for stronger enforcement of existing marine protected area regulations.',
    '',
    '## Survey Highlights Gaps in Rural Healthcare Access for Women',
    'A nationwide household survey found that women in rural districts face barriers accessing primary healthcare. Social policy researchers noted that outreach programmes in rural districts had shown measurable improvement.',
  ].join('\n');

  it('produces at least one classification proposal for every one of the five synthetic articles', () => {
    const batch = ingestMarkdownAsArticles({
      workspaceId: 'apfc',
      filename: 'acceptance-clippings.md',
      rawContent: FIVE_ARTICLE_COMPILATION,
      originalFormat: 'markdown',
    });
    expect(batch.articles).toHaveLength(5);
    for (const article of batch.articles) {
      const own = batch.classifications.filter((c) => c.itemId === article.id);
      expect(own.length).toBeGreaterThan(0);
    }
  });

  it('still produces zero classifications for an unrelated article in the same batch, never a forced match', () => {
    const raw = `${FIVE_ARTICLE_COMPILATION}\n\n## Local Bakery Wins Regional Pastry Competition\nA small family-run bakery took home the top prize at this year's regional pastry competition, impressing judges with an inventive layered dessert.`;
    const batch = ingestMarkdownAsArticles({ workspaceId: 'apfc', filename: 'acceptance-clippings.md', rawContent: raw, originalFormat: 'markdown' });
    const bakeryArticle = batch.articles.find((a) => a.title.includes('Bakery'))!;
    expect(bakeryArticle).toBeDefined();
    expect(batch.classifications.filter((c) => c.itemId === bakeryArticle.id)).toEqual([]);
  });
});

describe('ingestMarkdownAsArticles — P0.3 Current Events alias-coverage gaps reach the review queue', () => {
  // The read-only coverage audit's five un-aliased "Current Events" topics (awards, sports,
  // appointments, indices/rankings, obituaries), run end to end through the real ingestion
  // pipeline — proving the fix reaches actual daily-use ingestion, not just the unit-level scorer,
  // and that every proposal still lands as `status: 'proposed'` in the review queue rather than
  // ever being auto-confirmed (human confirmation is never bypassed).
  const CURRENT_EVENTS_COMPILATION = [
    '## Veteran Classical Vocalist Conferred Padma Shri',
    'The veteran classical vocalist was conferred the Padma Shri at a ceremony held at Rashtrapati Bhavan. The award ceremony also honoured several other artists.',
    '',
    '## National Team Wins Gold At Asian Games',
    'The national hockey team won the gold medal at the Asian Games after a tense final, clinching the title in a closely fought match.',
    '',
    '## Senior Bureaucrat Appointed As New Cabinet Secretary',
    "The senior bureaucrat was appointed as the new Cabinet Secretary this week, and will take charge as the government's top civil servant from next month.",
    '',
    '## India Climbs In Ease Of Doing Business Rankings',
    'A new World Bank report shows India climbing several places in the ease of doing business rankings, driven by reforms to starting a business.',
    '',
    '## Renowned Novelist Passed Away At 82',
    'The renowned novelist, celebrated for a decades-long body of work, passed away at the age of 82 after a prolonged illness, prompting tributes from across the literary world.',
  ].join('\n');

  it('produces at least one classification proposal for every one of the five Current Events articles', () => {
    const batch = ingestMarkdownAsArticles({
      workspaceId: 'apfc',
      filename: 'current-events-clippings.md',
      rawContent: CURRENT_EVENTS_COMPILATION,
      originalFormat: 'markdown',
    });
    expect(batch.articles).toHaveLength(5);
    for (const article of batch.articles) {
      const own = batch.classifications.filter((c) => c.itemId === article.id);
      expect(own.length).toBeGreaterThan(0);
    }
  });

  it('every proposal from this batch is `status: proposed` and appears in listReviewQueue — human confirmation is never bypassed', () => {
    const batch = ingestMarkdownAsArticles({
      workspaceId: 'apfc',
      filename: 'current-events-clippings.md',
      rawContent: CURRENT_EVENTS_COMPILATION,
      originalFormat: 'markdown',
    });
    expect(batch.classifications.length).toBeGreaterThan(0);
    expect(batch.classifications.every((c) => c.status === 'proposed' && c.source === 'lexical')).toBe(true);
    const reviewQueue = listReviewQueue(batch.classifications);
    const queuedItemIds = new Set(reviewQueue.map((c) => c.itemId));
    for (const article of batch.articles) {
      expect(queuedItemIds.has(article.id)).toBe(true);
    }
  });
});

describe('ingestMarkdownAsArticles — P1.1 workspace-aware taxonomy', () => {
  it('a upsc_cse workspace batch defaults candidateTopics to the real granular CSE syllabus and stamps taxonomy "upsc_cse"', () => {
    const cseTopics = listUpscCseTopicsFlat();
    const sampleTitle = cseTopics[0].topicTitle;
    const raw = `## ${sampleTitle}\n${sampleTitle}. A note whose heading repeats a real granular CSE topic title, so the lexical classifier has a genuine match to find.`;
    const batch = ingestMarkdownAsArticles({ workspaceId: 'upsc_cse', filename: 'cse-notes.md', rawContent: raw, originalFormat: 'markdown' });
    expect(batch.articles).toHaveLength(1);
    expect(batch.classifications.length).toBeGreaterThan(0);
    expect(batch.classifications.every((c) => c.taxonomy === 'upsc_cse')).toBe(true);
    expect(batch.classifications.every((c) => isValidUpscCseTopicId(c.topicId))).toBe(true);
  });

  it('an apfc workspace batch never produces a upsc_cse-taxonomy classification, and vice versa', () => {
    const apfcBatch = ingestMarkdownAsArticles({
      workspaceId: 'apfc',
      filename: 'clippings.md',
      rawContent: '## Inflation Rises\nInflation and monetary policy concerns dominate the discussion on rising prices today.',
      candidateTopics: undefined,
      originalFormat: 'markdown',
    });
    expect(apfcBatch.classifications.every((c) => c.taxonomy === 'apfc')).toBe(true);
  });

  it('a phd_research workspace batch produces ZERO classifications but still preserves the original document and extracted articles in full', () => {
    const raw = '## Research Note\nSome genuinely on-topic text about a research finding, long enough to avoid the near-empty guard.';
    const batch = ingestMarkdownAsArticles({ workspaceId: 'phd_research', filename: 'phd-notes.md', rawContent: raw, originalFormat: 'markdown' });
    expect(batch.originalDocument).toBeDefined();
    expect(batch.originalDocument.rawContent.length).toBeGreaterThan(0);
    expect(batch.articles).toHaveLength(1);
    expect(batch.classifications).toEqual([]);
  });
});

// Smart Document Upload — document-TYPE classification (lib/documentTypeClassification.ts) is
// wired into BOTH the original document and every extracted article, independently of
// syllabus-topic classification above (which a phd_research batch always skips) — document type is
// workspace-agnostic by design, so a PhD research upload still gets a real proposal even though it
// gets zero `classifications` entries.
describe('ingestMarkdownAsArticles — Smart Document Upload: document-type metadata wiring', () => {
  it('stamps the original document with a document-type proposal derived from its own full text', () => {
    const raw = 'Government of India, Ministry of Labour. Office Memorandum. In pursuance of the powers conferred, the following is notified.';
    const batch = run(raw, { filename: 'notification.md' });
    expect(batch.originalDocument.metadata?.documentType).toBe('official_notification');
    expect(batch.originalDocument.metadata?.documentTypeStatus).toBe('predicted');
    expect(batch.originalDocument.metadata?.documentTypeConfidence).toBeGreaterThan(0);
    expect(batch.originalDocument.metadata?.documentTypeRationale).toBeTruthy();
  });

  it('stamps each extracted article with its OWN document-type proposal, derived from that article\'s own heading+content, not the whole original document', () => {
    const raw = [
      '## Lecture Notes',
      'Lecture 3 notes. Today we will discuss inflation and monetary policy in detail.',
      '',
      '## Abstract Research Summary',
      'Abstract: this paper reviews parliament and legislature procedure. Keywords: polity. Methodology: literature review. References. DOI: 10.1/abc',
    ].join('\n');
    const batch = run(raw);
    expect(batch.articles).toHaveLength(2);
    expect(batch.articles[0].metadata?.documentType).toBe('lecture_notes');
    expect(batch.articles[0].metadata?.lectureOrUnitNumber).toBe(3);
    expect(batch.articles[1].metadata?.documentType).toBe('research_paper');
  });

  it('document-type classification still runs for a phd_research workspace batch even though syllabus-topic classification is empty — never assumes every document is APFC', () => {
    const raw = '## Research Abstract\nAbstract: a longitudinal study. Keywords: policy. Literature Review. Methodology. References. DOI: 10.9/xyz';
    const batch = ingestMarkdownAsArticles({ workspaceId: 'phd_research', filename: 'phd-notes.md', rawContent: raw, originalFormat: 'markdown' });
    expect(batch.classifications).toEqual([]); // no syllabus taxonomy for this workspace
    expect(batch.articles[0].metadata?.documentType).toBe('research_paper'); // but document type still works
  });

  it('every freshly-ingested item starts with a status that is always safe to refresh later — never "confirmed" (that only ever comes from an explicit human action, which ingestion never performs)', () => {
    const batch = run('## Report\nAnnual Report. Executive Summary. Findings of the report and recommendations follow.');
    expect(batch.originalDocument.metadata?.documentTypeStatus).not.toBe('confirmed');
    for (const article of batch.articles) {
      expect(article.metadata?.documentTypeStatus).not.toBe('confirmed');
    }
  });

  it('an empty/unreadable original document still gets an honest "unclassified" document-type status, never a fabricated guess', () => {
    const batch = run('   ');
    expect(batch.originalDocument.metadata?.documentTypeStatus).toBe('unclassified');
  });
});
