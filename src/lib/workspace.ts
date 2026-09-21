// Multi-Workspace Personal Study & Research OS.
//
// A Workspace is a top-level, mutually-exclusive study/research context: APFC (the app's original
// and, for a while, only real workspace), UPSC CSE, and PhD Research. Stage 1 introduced the type
// and this static registry; Stage 2 (lib/store.ts's `activeWorkspaceId` + `inactiveWorkspaceOwnedData`)
// made switching between them safe and isolated at the data layer, with no UI yet. Stage 3A adds
// the first real UI: a switcher (see components/layout/AppShell.tsx) and workspace-aware
// navigation/empty-states, but ONLY for workspaces marked `status: 'active'` below — PhD Research
// stays `status: 'comingSoon'`, present in the registry (so later stages don't need another
// registry redesign) but never selectable or reachable from any UI.
export type WorkspaceKind = 'apfc' | 'upsc_cse' | 'phd_research';

export interface WorkspaceMeta {
  id: WorkspaceKind;
  /** Full name, used in the workspace switcher's option list. */
  label: string;
  /** Short form for tight spaces (sidebar title, mobile chips). */
  shortLabel: string;
  /** Sidebar subtitle — what this workspace is, in a few words. */
  tagline: string;
  /** 'exam' workspaces (APFC, UPSC CSE) reuse the existing syllabus/PYQ/mock-test architecture
   * (with an empty/"coming next" state until that workspace's own content exists); 'research'
   * workspaces (PhD Research) are a structurally different domain (projects/chapters/sources/
   * bibliography) with no equivalent UI yet. */
  kind: 'exam' | 'research';
  /** 'active': selectable in the switcher and fully reachable. 'comingSoon': stays in the
   * registry for internal reference (types, future planning) but is filtered out of
   * ACTIVE_WORKSPACES below, so it never appears in the switcher and is never a usable workspace. */
  status: 'active' | 'comingSoon';
}

export const WORKSPACES: readonly WorkspaceMeta[] = [
  { id: 'apfc', label: 'APFC (UPSC EPFO)', shortLabel: 'APFC', tagline: 'UPSC EPFO Prep', kind: 'exam', status: 'active' },
  { id: 'upsc_cse', label: 'UPSC CSE', shortLabel: 'UPSC CSE', tagline: 'Civil Services Prep', kind: 'exam', status: 'active' },
  { id: 'phd_research', label: 'PhD Research', shortLabel: 'PhD', tagline: 'Research Workspace', kind: 'research', status: 'comingSoon' },
];

/** The only workspaces a switcher (or any other UI) should ever offer — filters out anything not
 * yet ready (today: PhD Research). Use this instead of WORKSPACES for anything user-facing. */
export const ACTIVE_WORKSPACES: readonly WorkspaceMeta[] = WORKSPACES.filter((w) => w.status === 'active');

export const DEFAULT_WORKSPACE_ID: WorkspaceKind = 'apfc';

export function getWorkspaceMeta(id: WorkspaceKind): WorkspaceMeta {
  return WORKSPACES.find((w) => w.id === id) ?? WORKSPACES[0];
}
