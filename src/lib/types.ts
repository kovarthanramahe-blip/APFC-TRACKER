// Core domain types for the APFC Tracker app

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

/** A future source-backed generated question's provenance (e.g. calibrated against PIB, India
 * Code, Ministry of Labour, EPFO, RBI material) — no generated questions exist yet; this only
 * reserves the shape so a later question type can be added without another provenance redesign. */
export interface GeneratedProvenance {
  kind: 'generated';
  sourceAuthority: string; // e.g. 'PIB' | 'India Code' | 'Ministry of Labour' | 'EPFO' | 'RBI'
  sourceReference: string; // citation/URL/document identifying the specific source material
  generatedAt: string; // ISO timestamp
  calibratedAgainstPyqIds?: string[]; // PYQ ids this question's pattern/difficulty was calibrated against
}

export type QuestionProvenance = PyqProvenance | GeneratedProvenance;

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
}

export interface PomodoroSession {
  id: string;
  mode: 'focus' | 'shortBreak' | 'longBreak';
  subject?: SubjectColorKey | 'general';
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  completedFully: boolean;
}

export interface StudyLogEntry {
  date: string; // yyyy-mm-dd
  focusMinutes: number;
  topicsCompleted: number;
  testsCompleted: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';
