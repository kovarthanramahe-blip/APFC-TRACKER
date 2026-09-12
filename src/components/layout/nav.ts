import {
  LayoutDashboard,
  ListChecks,
  BookOpenCheck,
  FileClock,
  NotebookPen,
  Timer,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/syllabus', label: 'Syllabus', icon: ListChecks },
  { to: '/pyq', label: 'Question Bank', icon: BookOpenCheck },
  { to: '/mock-tests', label: 'Mock Tests', icon: FileClock },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/pomodoro', label: 'Pomodoro', icon: Timer },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Subset shown in the mobile bottom bar
export const MOBILE_NAV_ITEMS: NavItem[] = [
  NAV_ITEMS[0],
  NAV_ITEMS[1],
  NAV_ITEMS[3],
  NAV_ITEMS[5],
  NAV_ITEMS[4],
];
