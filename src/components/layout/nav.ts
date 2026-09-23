import {
  LayoutDashboard,
  ListChecks,
  ListTree,
  BookOpenCheck,
  FileClock,
  FileQuestion,
  ClipboardCheck,
  NotebookPen,
  Timer,
  BarChart3,
  CalendarRange,
  Settings,
  GraduationCap,
  Library,
  Compass,
  FileText,
  BookMarked,
  Target,
  type LucideIcon,
} from 'lucide-react';
import type { WorkspaceKind } from '../../lib/workspace';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Passed straight through to NavLink's own `end` prop — required whenever this item's `to` is
   * itself a path PREFIX of another item in the SAME workspace's list (e.g. '/phd-research' is a
   * prefix of '/phd-research/bibliography'), so only the exact route highlights as active rather
   * than both. Defaults to true for '/' (every route is technically a "child" of '/'), false
   * otherwise — see AppShell.tsx's use of `item.end ?? item.to === '/'`. */
  end?: boolean;
}

// Multi-Workspace OS — each workspace (lib/workspace.ts) gets its OWN navigation list rather than
// one flat list shown regardless of which workspace is active. A route only appears under a
// workspace here when its page is genuinely reachable/functional for that workspace today:
//   - APFC-only pages (Question Bank/pyq, PYQs/pyq-test, Mock Tests, Analytics, Study Plan) gate
//     themselves to activeWorkspaceId === 'apfc' already (see e.g. pages/MockTests.tsx,
//     pages/Analytics.tsx, pages/StudyPlan.tsx) and would show nothing but an empty
//     WorkspaceComingSoon placeholder under UPSC CSE or PhD Research — so they are NOT listed
//     there; showing a live link to a placeholder is exactly the "duplicate dashboard" class of bug
//     this stage fixes, not something to repeat for other pages.
//   - Notes, Repository and Pomodoro are genuinely workspace-aware already (each workspace's own
//     notes/imported content/sessions, via the existing workspace-owned store architecture) and
//     work correctly for all three, so they appear in all three lists.
//   - Settings is a global, workspace-agnostic app setting (theme, sync, data export/import/reset —
//     see pages/Settings.tsx, which has no workspace gating at all), so it appears everywhere too.
//   - UPSC CSE and PhD Research each get their own dashboard/content routes — never the generic `/`
//     Dashboard, which is APFC's own page and renders nothing useful for another workspace.
const WORKSPACE_NAV_ITEMS: Record<WorkspaceKind, NavItem[]> = {
  apfc: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/syllabus', label: 'Syllabus', icon: ListChecks },
    { to: '/pyq', label: 'Question Bank', icon: BookOpenCheck },
    { to: '/pyq-test', label: 'PYQs', icon: FileQuestion },
    { to: '/mock-tests', label: 'Mock Tests', icon: FileClock },
    { to: '/notes', label: 'Notes', icon: NotebookPen },
    { to: '/repository', label: 'Repository', icon: Library },
    { to: '/pomodoro', label: 'Pomodoro', icon: Timer },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/study-plan', label: 'Study Plan', icon: CalendarRange },
    { to: '/settings', label: 'Settings', icon: Settings },
  ],
  upsc_cse: [
    { to: '/upsc-dashboard', label: 'UPSC CSE Dashboard', icon: Compass, end: true },
    { to: '/upsc-syllabus', label: 'UPSC CSE Syllabus', icon: ListTree },
    { to: '/upsc-pyq-test', label: 'UPSC CSE PYQs', icon: ClipboardCheck },
    { to: '/upsc-study-plan', label: 'Study Plan', icon: CalendarRange },
    { to: '/upsc-analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/notes', label: 'Notes', icon: NotebookPen },
    { to: '/repository', label: 'Repository', icon: Library },
    { to: '/pomodoro', label: 'Pomodoro', icon: Timer },
    { to: '/settings', label: 'Settings', icon: Settings },
  ],
  phd_research: [
    { to: '/phd-dashboard', label: 'PhD Dashboard', icon: GraduationCap, end: true },
    // `end: true` — '/phd-research' would otherwise also match (and highlight) on
    // '/phd-research/bibliography' since that path starts with it.
    { to: '/phd-research', label: 'Research Documents', icon: FileText, end: true },
    { to: '/phd-research/bibliography', label: 'Working Bibliography', icon: BookMarked },
    { to: '/phd-plan', label: 'Research Plan', icon: Target },
    { to: '/phd-analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/repository', label: 'Repository', icon: Library },
    { to: '/notes', label: 'Notes', icon: NotebookPen },
    { to: '/pomodoro', label: 'Pomodoro', icon: Timer },
    { to: '/settings', label: 'Settings', icon: Settings },
  ],
};

export function getNavItemsForWorkspace(workspaceId: WorkspaceKind): NavItem[] {
  return WORKSPACE_NAV_ITEMS[workspaceId];
}

/**
 * Which of `items` is "active" for `pathname` — the same rule NavLink itself applies (exact match
 * for an `end` item, exact-or-path-prefix otherwise), pulled out as a pure function so it's
 * unit-testable without rendering (see AppShell.tsx's own header title, which uses this to avoid
 * "multiple sidebar items appear selected" bugs — e.g. '/phd-research' must NOT resolve as active
 * while on '/phd-research/bibliography', since that item is marked `end: true` for exactly this
 * reason). Returns undefined when nothing in `items` matches.
 */
export function resolveActiveNavItem(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return items.find((item) => {
    const exactOnly = item.end ?? item.to === '/';
    return exactOnly ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
  });
}

// The full set of every distinct route registered ANYWHERE across the three workspace nav lists,
// deduplicated by `to` — kept for callers that only need "is this route reachable from some
// sidebar" (existing tests written before this stage), not for rendering any actual sidebar.
export const NAV_ITEMS: NavItem[] = Object.values(WORKSPACE_NAV_ITEMS).reduce<NavItem[]>((all, items) => {
  for (const item of items) {
    if (!all.some((existing) => existing.to === item.to)) all.push(item);
  }
  return all;
}, []);

// Mobile bottom bar — a short (5-item) subset per workspace, following the exact same "dashboard,
// primary content, secondary content/practice, focus timer, notes" shape for each workspace.
// APFC's own subset is unchanged from before this stage (same 5 routes, same order).
const WORKSPACE_MOBILE_ROUTES: Record<WorkspaceKind, string[]> = {
  apfc: ['/', '/syllabus', '/mock-tests', '/pomodoro', '/notes'],
  upsc_cse: ['/upsc-dashboard', '/upsc-syllabus', '/upsc-pyq-test', '/pomodoro', '/notes'],
  phd_research: ['/phd-dashboard', '/phd-research', '/phd-research/bibliography', '/pomodoro', '/notes'],
};

export function getMobileNavItemsForWorkspace(workspaceId: WorkspaceKind): NavItem[] {
  const items = WORKSPACE_NAV_ITEMS[workspaceId];
  return WORKSPACE_MOBILE_ROUTES[workspaceId].map((to) => items.find((item) => item.to === to)!);
}

// Kept for any existing caller that imports the default (APFC) mobile subset directly.
export const MOBILE_NAV_ITEMS: NavItem[] = getMobileNavItemsForWorkspace('apfc');
