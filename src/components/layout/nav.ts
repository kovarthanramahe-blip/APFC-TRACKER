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
  { to: '/upsc-dashboard', label: 'UPSC CSE Dashboard', icon: Compass },
  { to: '/upsc-syllabus', label: 'UPSC CSE Syllabus', icon: ListTree },
  { to: '/pyq', label: 'Question Bank', icon: BookOpenCheck },
  { to: '/pyq-test', label: 'PYQs', icon: FileQuestion },
  { to: '/upsc-pyq-test', label: 'UPSC CSE PYQs', icon: ClipboardCheck },
  { to: '/mock-tests', label: 'Mock Tests', icon: FileClock },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/repository', label: 'Repository', icon: Library },
  { to: '/phd-research', label: 'PhD Research', icon: GraduationCap },
  { to: '/pomodoro', label: 'Pomodoro', icon: Timer },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/study-plan', label: 'Study Plan', icon: CalendarRange },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Subset shown in the mobile bottom bar
const MOBILE_ROUTES = ['/', '/syllabus', '/mock-tests', '/pomodoro', '/notes'];
export const MOBILE_NAV_ITEMS: NavItem[] = MOBILE_ROUTES.map((to) => NAV_ITEMS.find((item) => item.to === to)!);
