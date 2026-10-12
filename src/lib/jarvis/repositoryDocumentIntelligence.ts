// Wave 4A, Scope A — the thin adapter connecting the REAL Repository content (pages/
// RepositoryDetail.tsx's Notes/ImportedContent entries, read as plain already-extracted text —
// never a file upload) to the existing, already-tested JARVIS Document Intelligence foundation
// (./documents/*) and the existing document-grounded prompt builder (./ai/documentGroundingPrompt).
//
// This file is deliberately NOT inside ./documents/ — that subsystem's own header states it is
// "completely independent of, and never imports, the Repository/Knowledge Library's existing
// ImportedContent model" (see documents/types.ts). This adapter is the one place that legitimately
// bridges the two: it imports FROM ./documents/* and reads a Repository entry's raw text, but
// nothing under ./documents/ imports anything from here or from Repository code.
//
// Entry point into the real AI call: `runJarvisRequest` (./runtime.ts) — the ONE existing,
// protected composition of orchestrator -> routing -> Android local AI this app has. This file
// reuses it exactly as exported, never bypassing it with a second provider composition (that
// would be a parallel AI system).
//
// RELIABILITY FIX (Wave 4A acceptance audit, approved, 2nd round): `runJarvisRequest` previously
// forwarded a single `query: string` as BOTH the text handleJarvisRequest()'s conservative intent
// resolver reads AND the literal provider message — so real document evidence (which legitimately
// contains words like "due" or "revision" in ordinary UPSC/APFC prose: "due process," "the 2019
// revision of the Act") could make a genuinely document-grounded request misclassify as
// 'study_next' and never reach the AI provider at all, even when one was ready. runtime.ts now
// exposes an approved, narrowly-scoped, additive `promptOverride?: string` field on
// RunJarvisRequestInput (see its own doc comment) that decouples the two: this adapter passes a
// SHORT, FIXED, pre-vetted `query` (ACTION_QUERY below — never derived from user input or document
// content, so it can never itself trip `orchestrator.ts`'s 'study_next' rule) purely to drive
// intent/routing, while the FULL grounded prompt (system preamble + labelled evidence + the real
// question) goes through as `promptOverride`, which is what the model actually sees. Routing
// itself still depends on `hasDocumentContext: true`, exactly as before — this fix only changes
// WHICH TEXT is classified, never the routing/provider-selection logic itself (both live in
// protected, unmodified orchestrator.ts/routingPolicy.ts/runtime.ts code).
import { toJarvisWorkspace } from './applicationTools';
import type { JarvisContext } from './types';
import type { WorkspaceKind } from '../workspace';
import { runJarvisRequest } from './runtime';
import { buildDocumentGroundedMessages } from './ai/documentGroundingPrompt';
import { getDocumentTaskRequirement } from './ai/documentTaskRequirements';
import { normalizeExtractedText, buildDocumentChunks, buildEvidenceForQuestion, type JarvisDocumentEvidence, type JarvisDocumentChunk } from './documents';

// ================================================================================================
// Repository text -> JARVIS document chunks
// ================================================================================================

const CITATION_QUOTE_MAX_LENGTH = 200;

function truncateQuote(text: string): string {
  return text.length > CITATION_QUOTE_MAX_LENGTH ? `${text.slice(0, CITATION_QUOTE_MAX_LENGTH)}…` : text;
}

/**
 * Chunks a Repository entry's already-extracted raw text (Note.content / ImportedContent.rawContent
 * — never a file upload, since Repository content has no bytes to ingest, only text already in the
 * store) using the EXISTING Phase 7 chunker (documents/ingestion.ts's buildDocumentChunks), the
 * same function a real file ingestion would feed. Repository content has no real page concept
 * (see lib/annotations.ts's own DEFAULT_PAGE_NUMBER doc comment for the identical, pre-existing
 * honest limitation) — chunks are therefore sectioned by Markdown heading only, never a fabricated
 * page number.
 */
export function buildRepositoryDocumentChunks(documentId: string, rawText: string): readonly JarvisDocumentChunk[] {
  const normalized = normalizeExtractedText(rawText);
  if (!normalized) return [];
  const { chunks } = buildDocumentChunks({ documentId, extracted: { text: normalized, format: 'markdown' } });
  return chunks;
}

// ================================================================================================
// Grounded prompt composition (sent as promptOverride — see this file's own header)
// ================================================================================================

/** Flattens buildDocumentGroundedMessages' own multi-message output into the single string
 * runJarvisRequest's `promptOverride` accepts (runtime.ts's provider call still only takes one
 * message string — see this file's own header). Order is preserved exactly as that function
 * already produces it: system preamble, then context (if any), then the labelled evidence block,
 * then the question last — never reordered here. This is what the model actually sees; it is NEVER
 * used as `query` (see ACTION_QUERY below). */
function composeGroundedPrompt(question: string, evidence: readonly JarvisDocumentEvidence[]): string {
  const messages = buildDocumentGroundedMessages({ question, evidence });
  return messages
    .flatMap((message) => message.content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map((part) => part.text))
    .join('\n\n');
}

/**
 * The SHORT, FIXED strings each Scope A action sends as `query` (never `promptOverride`) — the
 * one and only input to orchestrator.ts's intent resolver and routingPolicy.ts's routing decision.
 * Deliberately NEVER derived from user input or document content (unlike the real evidence, which
 * only ever travels through `promptOverride`), so none of these can ever themselves trip
 * orchestrator.ts's 'study_next' rule (`/\b(study next|what should i study|revise|revision|due)\b/`)
 * — verified by this file's own test suite. Routing still correctly reaches
 * 'document_retrieval_local_ai' via `hasDocumentContext: true` regardless of which of these fires
 * which OTHER intent (e.g. 'explain' resolves 'question' — harmless, since only 'study_next' short-
 * circuits routing away from hasDocumentContext).
 */
const ACTION_QUERY = {
  explain: 'Explain this passage from my document.',
  summarize: 'Summarise this document.',
  ask: 'Answer a question about this document.',
} as const;

// ================================================================================================
// The action outcome — always honest about where the text came from
// ================================================================================================

export type DocumentIntelligenceOutcomeKind = 'ai_answer' | 'source_fallback' | 'no_evidence';

export interface DocumentIntelligenceOutcome {
  kind: DocumentIntelligenceOutcomeKind;
  /** The real AI completion text — present ONLY when `kind === 'ai_answer'`, i.e. only when
   * `provenance.source === 'android_local_ai'` genuinely reported a real, loaded model answered.
   * Never populated from a deterministic/canned/native-stub response — see this file's own header. */
  aiAnswerText?: string;
  /** The real retrieved/selected evidence this action grounded on — always present except for
   * `'no_evidence'`, so a caller can show the real source passage(s) regardless of outcome. */
  evidence: readonly JarvisDocumentEvidence[];
  /** Human-readable reason, present for 'source_fallback' (why no real AI answer came back) and
   * 'no_evidence' (why there was nothing to ground on) — never a raw thrown error. */
  reason?: string;
  /** Present only for summarizeDocument — whether `evidence` covers the WHOLE document or only a
   * bounded prefix of it (see SHORT_DOCUMENT_SUMMARY's own token-capacity policy below). A caller
   * MUST surface `coverage.truncated` visibly whenever true — this outcome never claims full-
   * document coverage when only part of it was actually processed, and every citation in `evidence`
   * only ever points at material that was genuinely part of the covered prefix. */
  coverage?: { coveredChunks: number; totalChunks: number; truncated: boolean };
}

export interface DocumentIntelligenceRequestBase {
  documentId: string;
  activeWorkspaceId: WorkspaceKind;
  route?: string;
  /** ISO 8601 date-time, caller-supplied — matches this codebase's "no Date.now() in a pure
   * function" convention; see lib/jarvis/types.ts's own JarvisContext.timestamp doc comment. */
  timestamp: string;
}

async function runDocumentIntelligenceAction(
  request: DocumentIntelligenceRequestBase & {
    /** One of ACTION_QUERY's fixed, pre-vetted strings — drives intent/routing only. */
    query: string;
    /** The real instruction/question used to compose the grounded prompt sent as promptOverride. */
    instruction: string;
    evidence: readonly JarvisDocumentEvidence[];
    coverage?: DocumentIntelligenceOutcome['coverage'];
  },
): Promise<DocumentIntelligenceOutcome> {
  if (request.evidence.length === 0) {
    return { kind: 'no_evidence', evidence: [], reason: 'Nothing in this document matches that yet.' };
  }

  const promptOverride = composeGroundedPrompt(request.instruction, request.evidence);
  const context: JarvisContext = { workspace: toJarvisWorkspace(request.activeWorkspaceId), route: request.route, timestamp: request.timestamp };

  const result = await runJarvisRequest({ context, query: request.query, promptOverride, hasDocumentContext: true });

  if (result.provenance.source === 'android_local_ai') {
    return { kind: 'ai_answer', aiAnswerText: result.response.responseText, evidence: request.evidence, coverage: request.coverage };
  }

  return {
    kind: 'source_fallback',
    evidence: request.evidence,
    reason: result.provenance.degradedReason ?? 'AI is not available right now — showing the matching source passage instead.',
    coverage: request.coverage,
  };
}

// ================================================================================================
// The three Scope A user-triggered actions
// ================================================================================================

/** A selection IS its own evidence — the user explicitly chose this exact text, so this never runs
 * it back through keyword retrieval (a short selection's own words can be entirely stopwords, which
 * would retrieve nothing — see documents/retrieval.ts's STOPWORDS). Citation carries no page number
 * (Repository content has none — see this file's own header), only the real selected text. */
function evidenceForSelection(documentId: string, selectedText: string): JarvisDocumentEvidence {
  const chunk: JarvisDocumentChunk = { id: `${documentId}::selection`, documentId, sectionId: `${documentId}::selection`, order: 0, text: selectedText };
  return { chunk, score: 1, citation: { documentId, chunkId: chunk.id, quote: truncateQuote(selectedText) } };
}

export interface ExplainSelectionRequest extends DocumentIntelligenceRequestBase {
  selectedText: string;
}

/** "Explain with JARVIS" (ContextualSelectionToolbar / DocumentAnnotator.onExplainSelection). */
export function explainSelection(request: ExplainSelectionRequest): Promise<DocumentIntelligenceOutcome> {
  const trimmed = request.selectedText.trim();
  if (!trimmed) return Promise.resolve({ kind: 'no_evidence', evidence: [], reason: 'No text was selected.' });
  return runDocumentIntelligenceAction({
    ...request,
    query: ACTION_QUERY.explain,
    instruction: 'Explain the following passage from the user\'s document in plain, simple language. Use only what the passage itself says — do not add information that is not present in it.',
    evidence: [evidenceForSelection(request.documentId, trimmed)],
  });
}

/**
 * Token budget for "Summarise this document", using the EXISTING, already-declared
 * SHORT_DOCUMENT_SUMMARY policy (lib/jarvis/ai/documentTaskRequirements.ts's own
 * DOCUMENT_TASK_POLICY — never a new, invented number) rather than an arbitrary fixed chunk count.
 * A document whose own chunks fit within this budget gets COMPLETE, evidence-grounded coverage —
 * not an arbitrary prefix — so most real Repository notes (typically well under this budget) are
 * summarised in full. Only a document that genuinely exceeds it is bounded, and that bound is
 * always disclosed via the returned outcome's own `coverage` field (see
 * DocumentIntelligenceOutcome's own doc comment) — never silently presented as exhaustive.
 * `PROMPT_OVERHEAD_TOKENS` reserves headroom for the system preamble, the evidence labels, and the
 * instruction text that buildDocumentGroundedMessages/composeGroundedQuery add on top of the raw
 * chunk text itself, so the full composed prompt — not just the evidence alone — stays within the
 * policy's declared capacity.
 */
const PROMPT_OVERHEAD_TOKENS = 500;

function selectChunksWithinBudget(chunks: readonly JarvisDocumentChunk[]): { selected: JarvisDocumentChunk[]; truncated: boolean } {
  const budget = getDocumentTaskRequirement('SHORT_DOCUMENT_SUMMARY').minContextCapacityTokens - PROMPT_OVERHEAD_TOKENS;
  const selected: JarvisDocumentChunk[] = [];
  let usedTokens = 0;
  for (const chunk of chunks) {
    const chunkTokens = chunk.tokenCountEstimate ?? Math.ceil(chunk.text.length / 4);
    if (selected.length > 0 && usedTokens + chunkTokens > budget) {
      return { selected, truncated: true };
    }
    selected.push(chunk);
    usedTokens += chunkTokens;
  }
  return { selected, truncated: false };
}

export interface SummarizeDocumentRequest extends DocumentIntelligenceRequestBase {
  rawText: string;
}

/** "Summarise this document" — prefers COMPLETE, evidence-grounded coverage of the whole document
 * (see selectChunksWithinBudget above); only bounds coverage when the document genuinely exceeds
 * the declared SHORT_DOCUMENT_SUMMARY token budget, and always discloses that truncation via the
 * returned outcome's `coverage` field rather than silently claiming full coverage. Every citation
 * in the returned evidence only ever points at a chunk that was actually included. */
export function summarizeDocument(request: SummarizeDocumentRequest): Promise<DocumentIntelligenceOutcome> {
  const chunks = buildRepositoryDocumentChunks(request.documentId, request.rawText);
  const { selected, truncated } = selectChunksWithinBudget(chunks);
  const evidence: JarvisDocumentEvidence[] = selected.map((chunk) => ({
    chunk,
    score: 1,
    citation: { documentId: chunk.documentId, chunkId: chunk.id, page: chunk.startPage, quote: truncateQuote(chunk.text) },
  }));
  return runDocumentIntelligenceAction({
    ...request,
    query: ACTION_QUERY.summarize,
    instruction: 'Summarise this document in a few clear sentences, using only what the evidence below actually states.',
    evidence,
    coverage: { coveredChunks: selected.length, totalChunks: chunks.length, truncated },
  });
}

export interface AskDocumentQuestionRequest extends DocumentIntelligenceRequestBase {
  rawText: string;
  question: string;
}

/** "Ask a question about this document" — real retrieval (Phase 7's buildEvidenceForQuestion),
 * scoped to this one document only. */
export function askDocumentQuestion(request: AskDocumentQuestionRequest): Promise<DocumentIntelligenceOutcome> {
  const trimmedQuestion = request.question.trim();
  if (!trimmedQuestion) return Promise.resolve({ kind: 'no_evidence', evidence: [], reason: 'No question was entered.' });
  const chunks = buildRepositoryDocumentChunks(request.documentId, request.rawText);
  const evidence = buildEvidenceForQuestion(chunks, { documentIds: [request.documentId], question: trimmedQuestion });
  // NOTE: the user's own real question text travels only through `instruction` (composed into
  // promptOverride) — never through `query`, which stays the fixed ACTION_QUERY.ask string. This
  // is deliberate: a user's own question ("What is due process?") could itself contain a trigger
  // word, and `query` must never carry anything but this file's own pre-vetted, safe strings.
  return runDocumentIntelligenceAction({ ...request, query: ACTION_QUERY.ask, instruction: trimmedQuestion, evidence });
}
