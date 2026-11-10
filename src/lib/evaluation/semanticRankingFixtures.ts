// Semantic-ranking evaluation fixtures (diagnostic-only — see semanticRankingEval.test.ts).
//
// A small, fixed workspace corpus plus a query set, used to compare 4 chunking/embedding
// variants of the SAME real retrieval pipeline (buildWorkspaceDocumentChunks + the local
// embedding provider + semanticSearchChunks). Nothing here is unit-under-test on its own — it is
// shared test data, kept in its own file so semanticRankingEval.test.ts stays focused on the
// comparison logic rather than fixture authoring.
import type { Note } from '../types';
import type { ImportedContent } from '../contentImport';
import type { WorkspaceKind } from '../workspace';

export const SEMANTIC_RANKING_WORKSPACE_ID: WorkspaceKind = 'apfc';

function note(overrides: Partial<Note> & { id: string; title: string; content: string }): Note {
  return {
    subject: 'general',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pinned: false,
    workspaceId: SEMANTIC_RANKING_WORKSPACE_ID,
    ...overrides,
  };
}

function importedContent(overrides: Partial<ImportedContent> & { id: string; title: string; rawContent: string }): ImportedContent {
  return {
    workspaceId: SEMANTIC_RANKING_WORKSPACE_ID,
    contentType: 'document',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z', origin: 'manual' },
    ...overrides,
  };
}

// A long, single paragraph (no blank-line breaks), deliberately over chunkText's 1200-char
// DEFAULT_MAX_CHUNK_CHARS, so that the leading "[Page 1]\n\n" paragraph gets split off into its
// own, content-free chunk by buildDocumentChunks — reproducing the real "[Page 1]"-only chunk a
// genuine OCR'd/PDF-derived ImportedContent item produces, not a synthetic shortcut.
const PDF_PAGE_BODY =
  'The actuarial valuation of the pension corpus for the financial year was carried out by the appointed actuary and placed before the trustees for consideration. ' +
  'The valuation examined the adequacy of the corpus against projected future pension liabilities, taking into account mortality assumptions, the discount rate used ' +
  'to value future cash flows, and the salary growth assumption applied to active members still in service. The actuary reported that the pension corpus surplus, ' +
  'after setting aside the required reserve for existing pensioners and deferred members, remained positive for the year under review, though the margin had ' +
  'narrowed compared with the previous valuation on account of a lower discount rate and a higher-than-assumed rate of early exits. The trustees noted the finding ' +
  'and directed that the next actuarial valuation of the pension corpus be conducted on the same basis so that the trend in the surplus could be tracked ' +
  'consistently from one year to the next, rather than against a basis that changes each time the valuation is redone.';

export const SEMANTIC_RANKING_NOTES: Note[] = [
  note({
    id: 'n-jurisdiction',
    title: 'Jurisdictional Boundaries of Provident Fund Appellate Tribunals',
    content: 'This note examines statutory reach under the relevant sections of the Act.',
  }),
  note({
    id: 'n-circular',
    title: 'Circular No. 14/2026 — Revision of Provident Fund interest rates',
    content:
      'Circular No. 14/2026 — Revision of Provident Fund interest rates. The Board revises the annual rate of interest payable on Provident Fund member contributions for the relevant financial year, as notified by this circular.',
  }),
  note({
    id: 'n-epf-withdrawal',
    title: 'EPF Withdrawal Rules',
    content:
      'A member may make a partial withdrawal from their Employees Provident Fund account for specified purposes, including medical treatment, purchase or construction of a house, and the marriage or education of children, subject to the minimum service and documentation conditions set out in the scheme.',
  }),
  note({
    id: 'n-eps-pension',
    title: "Employees' Pension Scheme (EPS) overview",
    content:
      "The Employees' Pension Scheme provides a monthly pension to eligible members of the organised sector after they complete the minimum qualifying period of service, with the pension amount calculated from the member's pensionable salary and total pensionable service.",
  }),
  note({
    id: 'n-wage-code',
    title: 'The Code on Wages, 2019',
    content:
      'The Code on Wages consolidates earlier wage legislation and introduces a universal minimum wage that applies across all employments, along with provisions for the timely payment of wages to every employee regardless of the sector in which they are engaged.',
  }),
  note({
    id: 'n-social-security-code',
    title: 'The Code on Social Security, 2020',
    content:
      'The Code on Social Security consolidates several earlier enactments, including the Employees Provident Fund and Miscellaneous Provisions Act, the Employees State Insurance Act, the Maternity Benefit Act, and the Payment of Gratuity Act, into a single framework.',
  }),
  note({
    id: 'n-control-monetary-policy',
    title: 'RBI Monetary Policy Committee Decisions',
    content:
      'The Monetary Policy Committee reviews the repo rate at its scheduled meeting, weighing the inflation outlook against growth considerations before deciding whether to hold, raise, or cut the policy rate.',
  }),
  note({
    id: 'n-control-history',
    title: 'The Non-Cooperation Movement',
    content:
      'In 1920 the call for non-cooperation urged a boycott of British goods, courts, and educational institutions as a mass, non-violent response to colonial rule.',
  }),
];

export const SEMANTIC_RANKING_IMPORTED_CONTENT: ImportedContent[] = [
  importedContent({
    id: 'c-pdf-pension-valuation',
    title: 'Pension Fund Actuarial Valuation Extract (scanned)',
    rawContent: `[Page 1]\n\n${PDF_PAGE_BODY}`,
  }),
];

export type SemanticRankingQueryTag = 'specific' | 'ambiguous';

export interface SemanticRankingQuery {
  id: string;
  text: string;
  /** Workspace-bridge-prefixed documentId(s) (toWorkspaceDocumentId's own shape) this query
   * should retrieve. */
  expectedTopIds: readonly string[];
  tag: SemanticRankingQueryTag;
}

export const SEMANTIC_RANKING_QUERIES: SemanticRankingQuery[] = [
  {
    id: 'q1-jurisdiction-ambiguous',
    text: 'appeals body authority over retirement savings conflicts',
    expectedTopIds: ['note:n-jurisdiction'],
    tag: 'ambiguous',
  },
  {
    id: 'q2-jurisdiction-specific',
    text: 'statutory rules for tribunal reach over fund disputes',
    expectedTopIds: ['note:n-jurisdiction'],
    tag: 'specific',
  },
  {
    id: 'q3-circular-specific',
    text: 'interest rate revision on Provident Fund contributions',
    expectedTopIds: ['note:n-circular'],
    tag: 'specific',
  },
  {
    id: 'q4-circular-ambiguous',
    text: 'how much extra money builds up each year on retirement savings held with the Board',
    expectedTopIds: ['note:n-circular'],
    tag: 'ambiguous',
  },
  {
    id: 'q5-pension-valuation-specific',
    text: 'actuarial valuation of the pension corpus surplus',
    expectedTopIds: ['imported_content:c-pdf-pension-valuation'],
    tag: 'specific',
  },
  {
    id: 'q6-pension-valuation-ambiguous',
    text: 'yearly audit of a retirement fund excess reserve by an appointed expert',
    expectedTopIds: ['imported_content:c-pdf-pension-valuation'],
    tag: 'ambiguous',
  },
  {
    id: 'q7-withdrawal-specific',
    text: 'partial withdrawal for medical treatment from Provident Fund',
    expectedTopIds: ['note:n-epf-withdrawal'],
    tag: 'specific',
  },
  {
    id: 'q8-withdrawal-ambiguous',
    text: 'taking money out early for a hospital bill from retirement savings',
    expectedTopIds: ['note:n-epf-withdrawal'],
    tag: 'ambiguous',
  },
  {
    id: 'q9-pension-service-ambiguous',
    text: 'how long someone must work before getting a monthly retirement payout tied to their final earnings',
    expectedTopIds: ['note:n-eps-pension'],
    tag: 'ambiguous',
  },
  {
    id: 'q10-wage-code-specific',
    text: 'universal minimum wage applicability across all employments',
    expectedTopIds: ['note:n-wage-code'],
    tag: 'specific',
  },
];
