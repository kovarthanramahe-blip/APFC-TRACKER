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

export interface PYQ {
  id: string;
  year: number;
  subject: SubjectColorKey;
  topicId: string; // FK -> SyllabusTopic.id
  subtopic?: string;
  question: string;
  options: PYQOption[];
  correctOptionId: string;
  explanation: string;
  verificationStatus: PYQVerificationStatus;
  verificationNote?: string;
  source?: string;
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
