// Multi-Workspace Personal Study & Research OS — Stage 1 (foundation only).
//
// A Workspace is a top-level, mutually-exclusive study/research context: APFC (the app's original
// and, for now, only real workspace), UPSC CSE, and PhD Research. This stage only introduces the
// type and a static registry of what workspaces exist — nothing reads WORKSPACES yet, there is no
// switcher UI, no per-workspace syllabus/question data, and no navigation change. See
// lib/store.ts's `activeWorkspaceId` (always 'apfc' today) and its persist migration, which stamps
// existing pre-workspace data as belonging to 'apfc' so nothing already saved is lost or
// reinterpreted. UPSC CSE and PhD Research exist here only as named placeholders for later stages.
export type WorkspaceKind = 'apfc' | 'upsc_cse' | 'phd_research';

export interface WorkspaceMeta {
  id: WorkspaceKind;
  label: string;
  shortLabel: string;
  /** 'exam' workspaces (APFC, UPSC CSE) are expected to reuse the existing syllabus/PYQ/mock-test
   * architecture; 'research' workspaces (PhD Research) are a structurally different domain
   * (projects/chapters/sources/bibliography) with no equivalent yet. Not read anywhere yet — this
   * only documents the intended shape for the stages that build on this one. */
  kind: 'exam' | 'research';
}

export const WORKSPACES: readonly WorkspaceMeta[] = [
  { id: 'apfc', label: 'APFC (UPSC EPFO)', shortLabel: 'APFC', kind: 'exam' },
  { id: 'upsc_cse', label: 'UPSC CSE', shortLabel: 'UPSC CSE', kind: 'exam' },
  { id: 'phd_research', label: 'PhD Research', shortLabel: 'PhD', kind: 'research' },
];

export const DEFAULT_WORKSPACE_ID: WorkspaceKind = 'apfc';
