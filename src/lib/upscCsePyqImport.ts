import type { PYQVerificationStatus } from './types';
import { uuid } from './utils';

// UPSC CSE Prelims PYQ Import Foundation.
//
// FILE -> EXTRACT -> DETECT -> PREVIEW -> VALIDATE -> USER CONFIRMS -> IMPORT.
// EXTRACT reuses lib/contentImport.ts's extractContentFromFile exactly as every other import flow
// in this app does — nothing new there. This module is DETECT (parseUpscCsePrelimsSource) +
// VALIDATE (validateUpscCsePrelimsCandidate) + PREVIEW (buildUpscCsePrelimsImportPreview): pure
// functions, no store access, no side effects, and — the one rule every function here is built
// around — NEVER fabricates a field. A field the source doesn't state stays absent on the
// resulting record; it is never guessed, defaulted to something plausible-looking, or silently
// invented. If a block of text cannot be confidently parsed into a question, it is reported as
// rejected/unstructured with a reason, never force-converted.
//
// WHY A NEW TYPE, NOT lib/types.ts's EXISTING PYQ:
// PYQ extends PracticeQuestion, which MANDATES `subject: SubjectColorKey` (a closed union of
// APFC/UPSC-EPFO's own thirteen syllabus subjects — english, freedomStruggle, accounting,
// labourLaw, etc.), `topicId: string` (a foreign key into data/syllabus.ts's APFC-specific topic
// tree), `correctOptionId: string` (mandatory), and `explanation: string` (mandatory). A genuine
// UPSC CSE Prelims source:
//   - has no honest APFC/UPSC-EPFO subject to assign — forcing one would misclassify the question,
//     not describe it (UPSC_CSE_SYLLABUS's own colorKey reuse is a soft, cosmetic UI-theming
//     choice; PYQ.subject is load-bearing for every subject/topic filter, weak-topic analytics, and
//     revision feature in this app, so reusing it here would be a real, structural lie);
//   - has no APFC syllabus topicId to point at (UPSC CSE's own syllabus — data/syllabusUpscCse.ts —
//     is a completely separate topic tree with its own ids);
//   - very often has NO answer key at all in the raw source, and PYQ's `correctOptionId` is
//     mandatory — satisfying it would mean fabricating an answer, which this stage explicitly
//     forbids;
//   - very often has no explanation/rationale text, and PYQ's `explanation` is mandatory too.
// Every one of these mismatches is a MANDATORY field on PYQ that a real source frequently cannot
// honestly supply — exactly the "if it is not sufficient, create the smallest UPSC-specific
// adapter" case this stage's own instructions anticipate. UpscCsePrelimsPyq below is that adapter:
// the smallest addition that keeps every field PYQ already models, but makes precisely the ones a
// source may legitimately omit (correctOptionId, subject, topic, year, paper, questionNumber)
// optional instead of mandatory, and drops `explanation` and the APFC-specific `topicId`/`subject`
// typing entirely rather than force-fitting them. It reuses PYQVerificationStatus as-is (the
// existing 'official' | 'cross_verified' | 'provisional' | 'disputed' vocabulary already means
// exactly what it needs to mean here too — no new status vocabulary required).
//
// data/pyqUpscCse.ts's UPSC_CSE_PYQ_BANK is, like data/pyq.ts's own PYQ_BANK, a compile-time
// TypeScript source array — there is no runtime store field a browser session could append
// structured PYQs into. This stage therefore does not attempt to "persist" a structured PYQ at
// runtime: buildUpscCsePrelimsImportPreview is a review/validation tool a real, verified source
// file can be run through (in the browser, or in a test) to see exactly what would need to be
// hand-committed into that file — the array itself stays empty this stage, per this stage's own
// explicit instruction. What the browser UI *can* actually persist today is the raw uploaded file
// itself, via the existing repository import pipeline (lib/contentImport.ts/lib/repository.ts,
// contentType 'pyq', workspaceId 'upsc_cse') — see components/upscCse/UpscCsePyqImportModal.tsx.

export interface UpscCsePrelimsPyqOption {
  id: string;
  text: string;
}

export interface UpscCsePrelimsPyqProvenance {
  sourceFilename?: string;
  /** ISO timestamp of when this file was parsed — a fact about the import act, not exam content,
   * so it is never subject to the "never fabricate" rule the way year/options/answer are. */
  importedAt: string;
  /** Freeform, user-supplied attribution (e.g. "Official UPSC CSE 2023 Prelims GS Paper I") —
   * never auto-filled or guessed, matching lib/contentImport.ts's ImportedContentProvenance.sourceNote. */
  sourceNote?: string;
}

/**
 * A single structured UPSC CSE Prelims (objective) PYQ record — the UPSC-specific adapter this
 * module's header explains. Belongs exclusively to the `upsc_cse` workspace by construction (see
 * data/pyqUpscCse.ts's UPSC_CSE_PYQ_BANK, which this type is designed to eventually populate) —
 * there is no per-record workspaceId field, the same convention data/pyq.ts's own PYQ_BANK already
 * uses for APFC. Every field the source does not state is simply absent; nothing here is ever
 * defaulted to a plausible-looking value.
 */
export interface UpscCsePrelimsPyq {
  id: string;
  year?: number;
  /** Freeform, e.g. "General Studies Paper I" or "CSAT" — never a closed union, since exactly how
   * a source names its own paper varies (mirrors lib/types.ts's DescriptiveExamQuestion.paper). */
  paper?: string;
  questionNumber?: number;
  question: string;
  /** At least 2 when present — see validateUpscCsePrelimsOptions. Never fabricated: a source with
   * no recognisable options never produces an UpscCsePrelimsPyq at all (see parseUpscCsePrelimsSource). */
  options: UpscCsePrelimsPyqOption[];
  /** Absent whenever the source's own answer key is absent — see this module's header ("answer-key
   * safety"). Never defaulted to the first option or any other guess. */
  correctOptionId?: string;
  subject?: string;
  topic?: string;
  provenance: UpscCsePrelimsPyqProvenance;
  verificationStatus: PYQVerificationStatus;
}

// ============================================================================================
// DETECT — a conservative, explicit plain-text format. Anything not matching this shape is
// reported as unstructured rather than guessed at. The format:
//
//   Year: 2023
//   Paper: General Studies Paper I
//
//   Q1. Question text, optionally wrapping onto further lines before the first option.
//   A) Option A text
//   B) Option B text
//   C) Option C text
//   D) Option D text
//   Answer: B
//   Subject: Polity
//   Topic: Fundamental Rights
//
//   Q2. ...
//
// `Year`/`Paper` are file-level headers (read once, before the first Qn. line) — a single source
// file is assumed to cover one exam sitting, matching how such sources are actually compiled.
// `Answer`/`Subject`/`Topic` are per-question and entirely optional; their absence is never an
// error, only ever a smaller set of populated fields on the resulting record.
// ============================================================================================

const QUESTION_START = /^Q(\d+)[.)]\s*(.*)$/i;
const OPTION_LINE = /^([A-D])[.)]\s+(.+)$/;
const ANSWER_LINE = /^Answer:\s*([A-D])\s*$/i;
const SUBJECT_LINE = /^Subject:\s*(.+)$/i;
const TOPIC_LINE = /^Topic:\s*(.+)$/i;
const YEAR_HEADER = /^Year:\s*(\d{4})\s*$/i;
const PAPER_HEADER = /^Paper:\s*(.+)$/i;

export interface ParsedUpscCsePrelimsCandidate {
  questionNumber?: number;
  question: string;
  options: UpscCsePrelimsPyqOption[];
  correctOptionId?: string;
  subject?: string;
  topic?: string;
  /** Lines inside this question's block that matched none of the recognised patterns — never
   * silently absorbed into the question text or an option; their presence is itself a signal this
   * candidate may need a closer look, surfaced to validation as 'unrecognized_content'. */
  unrecognizedLines: string[];
}

export interface ParseUpscCsePrelimsSourceResult {
  /** False when NOT ONE recognisable "Qn." block was found anywhere in the text — the file should
   * be treated as unstructured source material, never force-converted (see this module's header). */
  structured: boolean;
  year?: number;
  paper?: string;
  candidates: ParsedUpscCsePrelimsCandidate[];
  /** Populated only when `structured` is false, explaining why. */
  reason?: string;
}

function classifyBlockLine(
  line: string,
  candidate: ParsedUpscCsePrelimsCandidate,
  sawFirstOption: { value: boolean },
): void {
  const optionMatch = line.match(OPTION_LINE);
  if (optionMatch) {
    sawFirstOption.value = true;
    candidate.options.push({ id: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() });
    return;
  }
  const answerMatch = line.match(ANSWER_LINE);
  if (answerMatch) {
    candidate.correctOptionId = answerMatch[1].toUpperCase();
    return;
  }
  const subjectMatch = line.match(SUBJECT_LINE);
  if (subjectMatch) {
    candidate.subject = subjectMatch[1].trim();
    return;
  }
  const topicMatch = line.match(TOPIC_LINE);
  if (topicMatch) {
    candidate.topic = topicMatch[1].trim();
    return;
  }
  if (!sawFirstOption.value) {
    // A wrapped continuation of the question text — only ever appended BEFORE the first option
    // line appears, never after (a stray line after options begin is unrecognised, not guessed at).
    candidate.question = candidate.question ? `${candidate.question} ${line}` : line;
    return;
  }
  candidate.unrecognizedLines.push(line);
}

/**
 * The DETECT pipeline stage: turns raw extracted text into zero or more ParsedUpscCsePrelimsCandidate
 * blocks, plus any file-level Year/Paper header. Never throws, never guesses a field it cannot
 * find in the text.
 */
export function parseUpscCsePrelimsSource(text: string): ParseUpscCsePrelimsSourceResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  let year: number | undefined;
  let paper: string | undefined;
  let firstQuestionLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (QUESTION_START.test(line)) {
      firstQuestionLineIndex = i;
      break;
    }
    const yearMatch = line.match(YEAR_HEADER);
    if (yearMatch) year = Number(yearMatch[1]);
    const paperMatch = line.match(PAPER_HEADER);
    if (paperMatch) paper = paperMatch[1].trim();
  }

  if (firstQuestionLineIndex === -1) {
    return {
      structured: false,
      year,
      paper,
      candidates: [],
      reason: 'No "Q1.", "Q2.", … question markers were found — this file could not be confidently parsed into structured questions.',
    };
  }

  const candidates: ParsedUpscCsePrelimsCandidate[] = [];
  let current: ParsedUpscCsePrelimsCandidate | null = null;
  let sawFirstOption = { value: false };

  for (let i = firstQuestionLineIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const startMatch = line.match(QUESTION_START);
    if (startMatch) {
      if (current) candidates.push(current);
      current = { questionNumber: Number(startMatch[1]), question: startMatch[2].trim(), options: [], unrecognizedLines: [] };
      sawFirstOption = { value: false };
      continue;
    }
    if (current) classifyBlockLine(line, current, sawFirstOption);
  }
  if (current) candidates.push(current);

  return { structured: true, year, paper, candidates };
}

// ============================================================================================
// VALIDATE — item 3's explicit checklist, one function per rule, never mutating the candidate.
// ============================================================================================

export type UpscCsePrelimsRejectionReason =
  | 'empty_question_text'
  | 'too_few_options'
  | 'empty_option_text'
  | 'duplicate_option_id'
  | 'correct_option_not_in_options'
  | 'invalid_year'
  | 'invalid_question_number'
  | 'duplicate_question'
  | 'unrecognized_content';

export interface UpscCsePrelimsValidationIssue {
  reason: UpscCsePrelimsRejectionReason;
  message: string;
}

const MIN_UPSC_CSE_YEAR = 1979; // the first UPSC CSE Prelims examination
const MIN_OPTION_COUNT = 2;

export function validateQuestionText(question: string): UpscCsePrelimsValidationIssue | undefined {
  if (!question.trim()) return { reason: 'empty_question_text', message: 'Question text is empty.' };
  return undefined;
}

export function validateOptions(options: readonly UpscCsePrelimsPyqOption[]): UpscCsePrelimsValidationIssue[] {
  const issues: UpscCsePrelimsValidationIssue[] = [];
  if (options.length < MIN_OPTION_COUNT) {
    issues.push({ reason: 'too_few_options', message: `Only ${options.length} option(s) found — at least ${MIN_OPTION_COUNT} are required.` });
  }
  if (options.some((o) => !o.text.trim())) {
    issues.push({ reason: 'empty_option_text', message: 'One or more options has no text.' });
  }
  const ids = options.map((o) => o.id);
  if (new Set(ids).size !== ids.length) {
    issues.push({ reason: 'duplicate_option_id', message: 'Two or more options share the same option letter.' });
  }
  return issues;
}

export function validateCorrectOption(options: readonly UpscCsePrelimsPyqOption[], correctOptionId: string | undefined): UpscCsePrelimsValidationIssue | undefined {
  if (correctOptionId === undefined) return undefined; // absent answer key is valid — see this module's header
  if (!options.some((o) => o.id === correctOptionId)) {
    return { reason: 'correct_option_not_in_options', message: `The stated answer ("${correctOptionId}") does not match any of this question's options.` };
  }
  return undefined;
}

export function validateYear(year: number | undefined): UpscCsePrelimsValidationIssue | undefined {
  if (year === undefined) return undefined; // absent year is valid — see this module's header
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < MIN_UPSC_CSE_YEAR || year > currentYear) {
    return { reason: 'invalid_year', message: `"${year}" is not a plausible UPSC CSE Prelims year (expected ${MIN_UPSC_CSE_YEAR}–${currentYear}).` };
  }
  return undefined;
}

export function validateQuestionNumber(questionNumber: number | undefined): UpscCsePrelimsValidationIssue | undefined {
  if (questionNumber === undefined) return undefined;
  if (!Number.isInteger(questionNumber) || questionNumber < 1) {
    return { reason: 'invalid_question_number', message: `"${questionNumber}" is not a valid question number.` };
  }
  return undefined;
}

/**
 * Validates one already-parsed candidate against every rule that doesn't require knowledge of
 * sibling candidates (duplicate detection is handled separately by
 * buildUpscCsePrelimsImportPreview, since it is inherently a cross-candidate check). Never
 * mutates `candidate`.
 */
export function validateUpscCsePrelimsCandidate(candidate: ParsedUpscCsePrelimsCandidate, year: number | undefined): UpscCsePrelimsValidationIssue[] {
  const issues: UpscCsePrelimsValidationIssue[] = [];
  const textIssue = validateQuestionText(candidate.question);
  if (textIssue) issues.push(textIssue);
  issues.push(...validateOptions(candidate.options));
  const correctOptionIssue = validateCorrectOption(candidate.options, candidate.correctOptionId);
  if (correctOptionIssue) issues.push(correctOptionIssue);
  const yearIssue = validateYear(year);
  if (yearIssue) issues.push(yearIssue);
  const questionNumberIssue = validateQuestionNumber(candidate.questionNumber);
  if (questionNumberIssue) issues.push(questionNumberIssue);
  if (candidate.unrecognizedLines.length > 0) {
    issues.push({
      reason: 'unrecognized_content',
      message: `${candidate.unrecognizedLines.length} line(s) in this question could not be understood: "${candidate.unrecognizedLines[0]}"${candidate.unrecognizedLines.length > 1 ? ', …' : ''}`,
    });
  }
  return issues;
}

// ============================================================================================
// PREVIEW — ties DETECT + VALIDATE together, adds cross-candidate duplicate detection and
// deterministic id derivation. Pure; never touches data/pyqUpscCse.ts or any store.
// ============================================================================================

export interface RejectedUpscCsePrelimsCandidate {
  candidate: ParsedUpscCsePrelimsCandidate;
  issues: UpscCsePrelimsValidationIssue[];
}

export interface UpscCsePrelimsImportPreview {
  structured: boolean;
  unstructuredReason?: string;
  year?: number;
  paper?: string;
  accepted: UpscCsePrelimsPyq[];
  rejected: RejectedUpscCsePrelimsCandidate[];
  /** True when at least one ACCEPTED question carries a correctOptionId — i.e. the source
   * included at least a partial answer key. False means no answer key was found anywhere in the
   * source; see this module's header on why that is never filled in. */
  hasAnswerKey: boolean;
  sourceFilename?: string;
}

/** A stable id derived from what's actually known (year + paper + question number) when all three
 * are present — so re-parsing the SAME source twice produces the SAME ids, matching this
 * codebase's existing "stable id" discipline (see lib/contentRelationships.ts's own header). Falls
 * back to a fresh uuid when any part is missing, since there is nothing stable to derive from. */
function deriveCandidateId(year: number | undefined, paper: string | undefined, questionNumber: number | undefined): string {
  if (year !== undefined && paper !== undefined && questionNumber !== undefined) {
    const paperSlug = paper.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `upsc-cse-pyq-${year}-${paperSlug}-${questionNumber}`;
  }
  return uuid();
}

/**
 * The single entry point a future UI (or a test harness reviewing a real, verified source file)
 * calls: DETECT + VALIDATE, cross-candidate duplicate detection, and a deterministic id per
 * accepted question. Never fabricates a field; never throws.
 */
export function buildUpscCsePrelimsImportPreview(text: string, sourceFilename: string | undefined, importedAt: string = new Date().toISOString()): UpscCsePrelimsImportPreview {
  const parsed = parseUpscCsePrelimsSource(text);

  if (!parsed.structured) {
    return {
      structured: false,
      unstructuredReason: parsed.reason,
      year: parsed.year,
      paper: parsed.paper,
      accepted: [],
      rejected: [],
      hasAnswerKey: false,
      sourceFilename,
    };
  }

  const accepted: UpscCsePrelimsPyq[] = [];
  const rejected: RejectedUpscCsePrelimsCandidate[] = [];
  const seenQuestionTexts = new Map<string, number>(); // normalised question text -> count seen so far
  const seenQuestionNumbers = new Set<number>();

  for (const candidate of parsed.candidates) {
    const issues = validateUpscCsePrelimsCandidate(candidate, parsed.year);

    const normalizedText = candidate.question.trim().toLowerCase();
    const priorCount = seenQuestionTexts.get(normalizedText) ?? 0;
    seenQuestionTexts.set(normalizedText, priorCount + 1);
    if (priorCount > 0) {
      issues.push({ reason: 'duplicate_question', message: 'This question text is identical to another question already seen in this same source.' });
    }

    // A repeated question number would otherwise derive the SAME stable id for two different
    // questions (see deriveCandidateId) — caught here, before that can ever happen.
    if (candidate.questionNumber !== undefined) {
      if (seenQuestionNumbers.has(candidate.questionNumber)) {
        issues.push({ reason: 'duplicate_question', message: `Question number ${candidate.questionNumber} appears more than once in this source.` });
      }
      seenQuestionNumbers.add(candidate.questionNumber);
    }

    if (issues.length > 0) {
      rejected.push({ candidate, issues });
      continue;
    }

    accepted.push({
      id: deriveCandidateId(parsed.year, parsed.paper, candidate.questionNumber),
      year: parsed.year,
      paper: parsed.paper,
      questionNumber: candidate.questionNumber,
      question: candidate.question,
      options: candidate.options,
      correctOptionId: candidate.correctOptionId,
      subject: candidate.subject,
      topic: candidate.topic,
      provenance: { sourceFilename, importedAt },
      // Never 'official' by default — that status is only ever earned by explicit user
      // confirmation of the source's authority, never inferred from parsing alone.
      verificationStatus: 'provisional',
    });
  }

  return {
    structured: true,
    year: parsed.year,
    paper: parsed.paper,
    accepted,
    rejected,
    hasAnswerKey: accepted.some((q) => q.correctOptionId !== undefined),
    sourceFilename,
  };
}
