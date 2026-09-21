// Core domain types for the APFC Tracker app

import type { WorkspaceKind } from './workspace';

export interface SyllabusTopic {
  id: string;
  title: string;
  notes?: string;
}

export interface SyllabusSubject {
  id: string;
  title: string;
  shortTitle: string;
  colorKey: SubjectColorKey;
  weightageHint: string;
  topics: SyllabusTopic[];
}

export type SubjectColorKey =
  | 'english'
  | 'freedomStruggle'
  | 'currentAffairs'
  | 'science'
  | 'polity'
  | 'economy'
  | 'historyCulture'
  | 'accounting'
  | 'labourLaw'
  | 'computer'
  | 'quant'
  | 'reasoning'
  | 'labourMovement';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  subject: SubjectColorKey;
  topic: string;
  tag: 'Practice' | 'PYQ-Style';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  question: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
}

export type PYQVerificationStatus = 'official' | 'cross_verified' | 'provisional' | 'disputed';

export interface PYQOption {
  id: string;
  text: string;
}

// --- Unified Question Architecture, Stage 1 (type-level only — see lib/practiceQuestion.ts) -----
// The common shape a question needs to be usable by the shared practice/mock session UI, regardless
// of where it came from. PYQ (below) already has every one of these fields, so it satisfies this
// interface structurally with no data changes — see the explicit `extends` on PYQ.
export interface PracticeQuestion {
  id: string;
  subject: SubjectColorKey;
  topicId: string; // FK -> SyllabusTopic.id
  question: string;
  options: PYQOption[];
  correctOptionId: string;
  explanation: string;
}

/** An authentic previous-year question's provenance — the exact fields PYQ already carries flat,
 * just viewable as one discriminated value (see lib/practiceQuestion.ts's toPyqProvenance). */
export interface PyqProvenance {
  kind: 'pyq';
  year: number;
  verificationStatus: PYQVerificationStatus;
  verificationNote?: string;
  source?: string;
}

/** A source-backed generated question's lifecycle state — deliberately distinct from
 * PYQVerificationStatus, which is about trust in a REAL historical question's answer key, not
 * about where a generated candidate sits in an authoring/review pipeline. */
export type GeneratedVerificationStatus = 'draft' | 'verified' | 'published' | 'retired';

/** A source-backed generated question's provenance (e.g. calibrated against PIB, India Code,
 * Ministry of Labour, EPFO, RBI material) — Stage 6A (type-level + validation only; see
 * lib/generatedQuestionValidation.ts). No generated questions exist yet and none are created by
 * this stage; this only gives a future generation pipeline a shape to produce and validate
 * against, so it can be added without another provenance redesign. */
export interface GeneratedProvenance {
  kind: 'generated';
  /** e.g. 'PIB' | 'India Code' | 'Ministry of Labour' | 'EPFO' | 'RBI' */
  sourceAuthority: string;
  /** Human-readable title/citation of the specific source document (e.g. "PIB Press Release:
   * EPFO Raises Wage Ceiling, dated 12 Mar 2025") — distinct from sourceReference, which
   * identifies WHERE to find it, not what it's called. */
  sourceTitle: string;
  /** URL or official document reference identifying the specific source material. Not required to
   * be a URL — an official document reference (e.g. a Gazette notification number) is equally
   * valid, since not every authoritative source is web-hosted. */
  sourceReference: string;
  /** The SOURCE's own publication/effective date (ISO date), when known — distinct from
   * `generatedAt` below, which is when THIS question was generated from that source. */
  sourcePublishedAt?: string;
  /** FK -> SyllabusTopic.id — the syllabus concept/topic this question was generated for. */
  topicId: string;
  /** PYQ ids this question's pattern/difficulty was calibrated against. */
  calibratedAgainstPyqIds?: string[];
  verificationStatus: GeneratedVerificationStatus;
  /** ISO timestamp of when this question was generated. */
  generatedAt: string;
}

/** A candidate source-backed generated question — not yet part of QUESTION_BANK, PYQ_BANK, or any
 * catalog. Structurally the same "PracticeQuestion + its own provenance" shape PYQ already
 * establishes, but for generated content and always GeneratedProvenance specifically (narrower
 * than the general QuestionProvenance union), since this type exists purely so
 * lib/generatedQuestionValidation.ts has something concrete to validate ahead of any real
 * generation pipeline. */
export interface GeneratedQuestionDraft extends PracticeQuestion {
  provenance: GeneratedProvenance;
}

/** The existing hand-authored practice bank's (data/questionBank.ts) own provenance — distinct from
 * GeneratedProvenance above: these questions are neither authentic PYQs nor calibrated against a
 * cited official source, so labelling them 'generated' would fabricate a citation that doesn't
 * exist. `tag` carries Question's own existing 'Practice'/'PYQ-Style' classification through as-is. */
export interface PracticeBankProvenance {
  kind: 'practice_bank';
  tag: 'Practice' | 'PYQ-Style';
}

export type QuestionProvenance = PyqProvenance | GeneratedProvenance | PracticeBankProvenance;

export interface PYQ extends PracticeQuestion {
  year: number;
  subtopic?: string;
  verificationStatus: PYQVerificationStatus;
  verificationNote?: string;
  source?: string;
}

export interface PYQAttempt {
  id: string;
  submittedAt: string;
  year: number | 'all'; // the selection filter used to build the test, not a per-question value
  subject: SubjectColorKey | 'all'; // the selection filter used to build the test, not a per-question value
  topicId: string | 'all';
  questionIds: string[]; // preserves the exact question order used in the test
  answers: Record<string, string | null>; // questionId -> optionId | null (unanswered)
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  score: number;
  accuracy: number;
  /** Multi-Workspace OS, Stage 1 — which workspace this attempt belongs to. Optional because it
   * doesn't exist on data saved before this field was introduced; lib/store.ts's persist migration
   * stamps it onto every existing item as 'apfc'. Nothing writes or reads it yet beyond that
   * migration — a later stage is what actually stamps it on newly created items and filters by it. */
  workspaceId?: WorkspaceKind;
}

export interface MockTestBlueprint {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  subjects: SubjectColorKey[] | 'all';
  questionCount: number;
  marksPerCorrect: number;
  negativeMarkFraction: number; // e.g. 1/3
}

export interface MockTestAttempt {
  id: string;
  blueprintId: string;
  blueprintTitle: string;
  startedAt: string;
  submittedAt: string;
  durationMinutes: number;
  questionIds: string[];
  answers: Record<string, string | null>; // questionId -> optionId | null (skipped)
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  score: number;
  maxScore: number;
  subjectBreakdown: Record<string, { correct: number; wrong: number; skipped: number; total: number }>;
  /** Multi-Workspace OS, Stage 1 — see PYQAttempt.workspaceId above; same optionality/migration. */
  workspaceId?: WorkspaceKind;
}

export interface Note {
  id: string;
  subject: SubjectColorKey | 'general';
  topicId?: string; // FK -> SyllabusTopic.id; absent = "general" notes or pre-Phase 2E notes with no topic yet
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  /** Multi-Workspace OS, Stage 1 — see PYQAttempt.workspaceId above; same optionality/migration. */
  workspaceId?: WorkspaceKind;
}

export interface PomodoroSession {
  id: string;
  mode: 'focus' | 'shortBreak' | 'longBreak';
  subject?: SubjectColorKey | 'general';
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  completedFully: boolean;
  /** Multi-Workspace OS, Stage 1 — see PYQAttempt.workspaceId above; same optionality/migration. */
  workspaceId?: WorkspaceKind;
}

export interface StudyLogEntry {
  date: string; // yyyy-mm-dd
  focusMinutes: number;
  topicsCompleted: number;
  testsCompleted: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';
