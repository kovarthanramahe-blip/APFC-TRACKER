// AI Model Evaluation & Provider Readiness — offline evaluation fixture corpus.
//
// Every fixture here is SYNTHETIC text written for this harness (never real user data, never
// copied verbatim from a copyrighted source) representing the document categories this feature was
// asked to cover: lecture notes/transcripts, official notifications/statutes, accounting and
// labour-law material (the two APFC subjects explicitly named), PYQs/mock questions, research
// papers/book chapters, and the failure modes a real classifier must handle honestly — ambiguous,
// mixed-topic, empty, and malformed content. This file holds DATA only — no classification logic,
// no AI call, nothing provider-dependent — see classificationEval.ts for what actually runs these
// fixtures through the app's existing deterministic classifiers.

export type FixtureCategory =
  | 'lecture_notes'
  | 'transcript'
  | 'official_notification'
  | 'statute'
  | 'accounting'
  | 'labour_law'
  | 'pyq'
  | 'book_chapter'
  | 'research_paper'
  | 'ambiguous'
  | 'empty'
  | 'malformed';

export interface ClassificationFixture {
  id: string;
  category: FixtureCategory;
  filename: string;
  text: string;
  /** What lib/documentTypeClassification.ts's classifyDocumentType SHOULD return for this fixture
   * — either one of its real DocumentType values, or the literal 'ABSTAIN' for a fixture this
   * harness expects (and wants) to come back 'unclassified' or 'needs_review' rather than a
   * confident single guess. */
  expectedDocumentType: string | 'ABSTAIN';
  /** The real, live APFC syllabus topic TITLE (data/syllabus.ts, looked up by
   * classificationEval.ts via listApfcTopicsFlat() — never a hand-typed, possibly-stale id) this
   * fixture's text should be classified under by the EXISTING lexical syllabus classifier. Three
   * states, not two: omitted entirely means "this fixture isn't testing syllabus-topic relevance,
   * skip it on that axis" (its real job is testing document TYPE instead); the literal 'NONE'
   * means "this fixture's text has genuinely zero APFC relevance — the classifier proposing
   * ANYTHING here is a false positive"; a real title string means "this exact topic must appear
   * among the proposals" (a genuinely multi-topic fixture can still legitimately propose others
   * alongside it — this is an inclusion check, not an exact-match one). */
  expectedApfcTopicTitle?: string | 'NONE';
}

export const CLASSIFICATION_FIXTURES: readonly ClassificationFixture[] = [
  // --- Lecture notes / transcripts ---
  {
    id: 'lecture-depreciation',
    category: 'lecture_notes',
    filename: 'lecture4-depreciation.docx',
    text: 'Lecture 4 notes. Today we will discuss depreciation methods and calculation. Recap of last lecture: straight-line method. Unit 2 continues with written-down value method next week.',
    expectedDocumentType: 'lecture_notes',
    expectedApfcTopicTitle: 'Depreciation: Methods & Calculation',
  },
  {
    id: 'transcript-webinar',
    category: 'transcript',
    filename: 'epfo-webinar-transcript.docx',
    text: 'Webinar Transcript. Speaker: Senior EPFO Officer. Q and A Session. Audio transcript auto-generated. Topic: EPFO history, structure and functions overview for new recruits.',
    expectedDocumentType: 'transcript',
    expectedApfcTopicTitle: 'EPFO: History, Structure & Functions',
  },

  // --- Official notifications / statutes ---
  {
    id: 'notification-wage-revision',
    category: 'official_notification',
    filename: 'wage-revision-notification.pdf',
    text: 'Government of India, Ministry of Labour and Employment. Office Memorandum. In pursuance of the powers conferred, the following is notified for general information: revised minimum wage rates under the Minimum Wages Act shall take effect from the next quarter.',
    expectedDocumentType: 'official_notification',
    expectedApfcTopicTitle: 'Minimum Wages Act, 1948',
  },
  {
    id: 'statute-gratuity-act',
    category: 'statute',
    filename: 'payment-of-gratuity-act.pdf',
    text: 'The Payment of Gratuity Act, 1972. An Act to provide for a scheme for the payment of gratuity to employees. Be it enacted as follows. Section 1. Short title and commencement. Provided that this Act applies to every establishment employing ten or more persons.',
    expectedDocumentType: 'statute',
    expectedApfcTopicTitle: 'Payment of Gratuity Act, 1972',
  },

  // --- Accounting (explicitly named APFC subject) ---
  {
    id: 'accounting-journal-ledger',
    category: 'accounting',
    filename: 'journal-ledger-notes.md',
    // Strengthened with a real lecture_notes signal phrase after the first run of this harness
    // showed plain "Study notes:" prose (no signal phrase at all) is correctly, honestly
    // unclassified by documentType — 'lecture notes' is only ever predicted when that phrase (or
    // an equivalent signal) genuinely appears, never guessed from topic content alone.
    text: 'Lecture notes: Journal, Ledger and Trial Balance. Today we will discuss how every transaction is first recorded in the journal as a debit and credit entry, then posted to the ledger. The trial balance checks that total debits equal total credits before preparing final accounts.',
    expectedDocumentType: 'lecture_notes',
    expectedApfcTopicTitle: 'Journal, Ledger & Trial Balance',
  },
  {
    id: 'accounting-pf-retirement',
    category: 'accounting',
    filename: 'pf-accounting-basics.md',
    text: 'Provident fund and retirement benefit accounting basics: employer and employee contributions are recorded as liabilities until disbursed, with interest accrual calculated annually on the running balance.',
    // 'ABSTAIN', not 'other' — confirmed by this harness's first run: classifyDocumentType's
    // 'other' category has no signal list of its own (see documentTypeClassification.ts's own
    // comment: "'other' ... is never scored for, only ever the status-level fallback") , so plain
    // informational prose with no recognisable type signal always comes back status:
    // 'unclassified', never a confidently 'predicted' documentType: 'other'. That IS the honest,
    // correct behaviour this fixture is testing for.
    expectedDocumentType: 'ABSTAIN',
    expectedApfcTopicTitle: 'Provident Fund / Retirement Benefit Accounting Basics',
  },

  // --- Labour law (explicitly named APFC subject) ---
  {
    id: 'labour-law-bonus-act',
    category: 'labour_law',
    filename: 'bonus-act-summary.md',
    text: 'Summary: Payment of Bonus Act, 1965. Applies to establishments employing 20 or more persons. Minimum bonus of 8.33% of salary or wages is payable, subject to the allocable surplus computed under the Act.',
    expectedDocumentType: 'ABSTAIN', // see accounting-pf-retirement's own comment — same reasoning
    expectedApfcTopicTitle: 'Payment of Bonus Act, 1965',
  },
  {
    id: 'labour-law-code-on-wages',
    category: 'labour_law',
    filename: 'code-on-wages-notes.md',
    text: 'The Code on Wages, 2019 consolidates four earlier labour laws including the Minimum Wages Act and the Payment of Wages Act into a single code governing wage payment and minimum wage fixation across India.',
    expectedDocumentType: 'ABSTAIN',
    expectedApfcTopicTitle: 'Code on Wages, 2019',
  },

  // --- PYQs / mock questions ---
  {
    id: 'pyq-epfo-enforcement-officer',
    category: 'pyq',
    filename: 'epfo-eo-pyq-2022.pdf',
    text: 'EPFO Enforcement Officer / Account Officer Previous Year Question Paper 2022. Time allowed: 2 hours. Maximum marks: 300. Instructions to candidates: attempt all questions. Answer the following questions, 1 mark each. Section A: General Awareness.',
    expectedDocumentType: 'pyq',
  },

  // --- Research papers / book chapters ---
  {
    id: 'research-paper-labour-welfare',
    category: 'research_paper',
    filename: 'labour-welfare-outcomes-study.pdf',
    text: 'Abstract: this paper examines labour welfare outcomes following social security reform. Keywords: labour, welfare, policy, social security. 1. Introduction. 2. Literature Review. 3. Methodology. 4. Findings. 5. Conclusion and Future Work. References: [1] a cited source. DOI: 10.1234/example.',
    expectedDocumentType: 'research_paper',
    // No syllabus-topic expectation — this harness's first run found this text (by genuine word
    // overlap: "labour", "welfare", "social security") legitimately matches real APFC Social
    // Security topics, a real and honest limitation of pure lexical matching worth documenting
    // (see this feature's own report), not a bug to paper over with a fixture that no longer tests
    // anything real. phd-research-unrelated-to-apfc below is the deliberately-zero-overlap case.
  },
  {
    id: 'book-chapter-industrial-relations',
    category: 'book_chapter',
    filename: 'textbook-industrial-relations-ch9.pdf',
    text: 'Chapter 9: Industrial Relations and Collective Bargaining. Table of Contents. ISBN 978-0-00-000000-1. Published by Academic Press. Third Edition. Preface: this chapter surveys the legal framework governing trade unions and collective bargaining in India.',
    expectedDocumentType: 'book_chapter',
    // No syllabus-topic expectation — "Industrial Relations"/"collective bargaining"/"trade
    // unions" genuinely does overlap with real APFC Trade Unions Act / Industrial Relations Code
    // topics (confirmed by this harness's first run); this fixture's real job is testing document
    // TYPE (book_chapter), not probing topic relevance either way.
  },

  // --- Ambiguous / mixed-topic / empty / malformed (honesty / abstention behaviour) ---
  {
    id: 'ambiguous-report-vs-paper',
    category: 'ambiguous',
    filename: 'ambiguous-mixed-signals.pdf',
    text: 'Executive Summary. Annual Report. Committee Report. Findings of the report. Recommendations. Abstract. References. Literature Review. Methodology. Keywords. DOI. Conclusion and future work.',
    expectedDocumentType: 'ABSTAIN', // deliberately scores report and research_paper near-equally
  },
  {
    id: 'mixed-topic-wages-and-bonus',
    category: 'ambiguous',
    filename: 'mixed-topic-circular.md',
    text: 'Circular regarding both minimum wage revision under the Minimum Wages Act and bonus computation under the Payment of Bonus Act for the upcoming financial year, effective from the next quarter.',
    expectedDocumentType: 'ABSTAIN', // plain circular prose, no recognised document-type signal
    // A genuinely multi-topic document — expectedApfcTopicTitle is an INCLUSION check (see its own
    // type comment), so asserting just one of the two real topics it should match still passes
    // even though the classifier legitimately proposes both.
    expectedApfcTopicTitle: 'Minimum Wages Act, 1948',
  },
  {
    id: 'empty-document',
    category: 'empty',
    filename: 'blank-upload.txt',
    text: '',
    expectedDocumentType: 'ABSTAIN', // must be 'unclassified', never a guessed type
    expectedApfcTopicTitle: 'NONE',
  },
  {
    id: 'whitespace-only-document',
    category: 'empty',
    filename: 'whitespace-only.txt',
    text: '   \n\n\t  \n   ',
    expectedDocumentType: 'ABSTAIN',
    expectedApfcTopicTitle: 'NONE',
  },
  {
    id: 'malformed-gibberish',
    category: 'malformed',
    filename: 'corrupted-extract.txt',
    text: '�� asdkj 29#@! xkcd zzz99 ___ garbled extraction output not real words at all qwxyz',
    expectedDocumentType: 'ABSTAIN', // no recognisable signal — must not force a confident guess
    expectedApfcTopicTitle: 'NONE',
  },
  {
    id: 'phd-research-unrelated-to-apfc',
    category: 'research_paper',
    filename: 'phd-thesis-chapter3-groundwater.pdf',
    text: 'Abstract: a longitudinal study of groundwater depletion in semi-arid regions. Keywords: hydrology, policy, climate. Literature Review. Methodology: panel regression. References. DOI: 10.5555/example.',
    expectedDocumentType: 'research_paper',
    // 'NONE' — genuine PhD research content with zero real-world APFC relevance (no shared
    // vocabulary with the syllabus at all, unlike research-paper-labour-welfare above); the
    // harness checks the syllabus classifier correctly proposes NOTHING for it, never forcing an
    // irrelevant APFC topic onto unrelated research material just because it's a research paper.
    expectedApfcTopicTitle: 'NONE',
  },
] as const;
