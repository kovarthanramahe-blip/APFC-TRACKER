// UPSC CSE Prelims PYQ practice attempts — the UPSC-specific counterpart to lib/types.ts's
// PYQAttempt. Not reused directly: PYQAttempt.subject is typed `SubjectColorKey | 'all'` (APFC's
// own closed 13-value union) and .topicId is an FK into data/syllabus.ts's APFC topic tree —
// neither can honestly represent a UPSC CSE attempt (freeform subject strings like "History", and
// a microsyllabus id FK into data/upscCsePrelimsSyllabus.ts instead of a topicId) without either
// fabricating a fake SubjectColorKey or forcing an unrelated topic tree's id space onto it. This is
// the same "smallest UPSC-specific adapter" discipline already used for
// lib/upscCsePrelimsPyqBatchImport.ts's UpscCsePrelimsBatchPyq (vs lib/types.ts's PYQ).
//
// No fabricated marking scheme: unlike APFC's PYQAttempt (which carries a `score` in APFC's own
// +2.5/-0.833 marks), this type deliberately has no marks-based score field — this app has no
// authoritative UPSC CSE marking scheme on file, and inventing one would be exam-content
// fabrication. `accuracy` (correct / attempted * 100) is purely derived from real answers, not an
// invented weighting.
//
// Workspace-owned exactly like every other UPSC CSE store field (lib/store.ts's
// upscCsePrelimsPyqAttempts) — no per-item workspaceId, archived/restored by setActiveWorkspaceId's
// swap, so this is structurally absent whenever a workspace other than upsc_cse is active.

export interface UpscCsePrelimsPyqAttempt {
  id: string;
  submittedAt: string;
  /** The selection filter used to build this test — not a per-question value; 'all' for a mixed
   * test, matching PYQAttempt's own convention. */
  year: number | 'all';
  paper: string | 'all';
  subject: string | 'all';
  microsyllabusId: string | 'all';
  questionIds: string[];
  answers: Record<string, string | null>;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  accuracy: number;
}
