import type { WorkspaceKind } from './workspace';

// Workspace Visual Identity — each workspace's accent colour, defined ONCE here and read by every
// UI element that needs to reflect the currently active workspace (switcher, sidebar/nav active
// state, page header accents, selected controls, progress bars). Nothing outside this file should
// hard-code a workspace-specific colour class directly — read it from WORKSPACE_ACCENTS/
// getWorkspaceAccent instead, so all consumers stay in sync automatically and switching workspaces
// can never leave a stale colour behind in one place but not another.
//
// UPSC CSE reuses the app's existing default "brand" blue (already the app-wide default accent
// used everywhere with no workspace context) rather than introducing a second, redundant blue.
// APFC uses Tailwind's `green` family — deliberately NOT `emerald`, which
// components/ui/Primitives.tsx's own Badge `success` tone already uses: keeping APFC's workspace
// green and the app's semantic success green in two visually distinct Tailwind colour families
// means they are never confusable, even where both could appear near each other (e.g. an APFC
// page showing a success badge). PhD Research uses `violet`. None of these three families are used
// as a semantic colour (error/warning/success) anywhere else in this app.

export interface WorkspaceAccent {
  /** Solid background for an active pill/nav item (workspace switcher's selected chip, the active
   * sidebar/bottom-nav link, a selected control). */
  bg: string;
  /** Matching shadow tint for the same solid element. */
  shadow: string;
  /** Coloured text/icon, light + dark mode variants included. */
  text: string;
  /** Sidebar logo gradient start/end. */
  gradientFrom: string;
  gradientTo: string;
  /** Progress bar / accent bar fill. */
  bar: string;
}

export const WORKSPACE_ACCENTS: Record<WorkspaceKind, WorkspaceAccent> = {
  apfc: {
    bg: 'bg-green-600',
    shadow: 'shadow-green-600/30',
    text: 'text-green-600 dark:text-green-400',
    gradientFrom: 'from-green-600',
    gradientTo: 'to-green-900',
    bar: 'bg-green-500',
  },
  upsc_cse: {
    bg: 'bg-brand-600',
    shadow: 'shadow-brand-600/30',
    text: 'text-brand-600 dark:text-brand-400',
    gradientFrom: 'from-brand-600',
    gradientTo: 'to-brand-900',
    bar: 'bg-brand-500',
  },
  phd_research: {
    bg: 'bg-violet-600',
    shadow: 'shadow-violet-600/30',
    text: 'text-violet-600 dark:text-violet-400',
    gradientFrom: 'from-violet-600',
    gradientTo: 'to-violet-900',
    bar: 'bg-violet-500',
  },
};

export function getWorkspaceAccent(id: WorkspaceKind): WorkspaceAccent {
  return WORKSPACE_ACCENTS[id];
}
