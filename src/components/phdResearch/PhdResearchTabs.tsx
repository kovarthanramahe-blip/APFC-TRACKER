import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, BookMarked, Target, BarChart3 } from 'lucide-react';
import { cx } from '../../lib/utils';

// PhD Research has five views sharing the same workspace: the research-start/duration + Topic
// Areas + micro-targets dashboard (pages/PhdDashboard.tsx), research documents
// (pages/PhdResearch.tsx), the Working Bibliography (pages/WorkingBibliography.tsx), the Research
// Plan (pages/PhdPlan.tsx), and Analytics (pages/PhdAnalytics.tsx). All five are ALSO reachable as
// their own sidebar entries (see components/layout/nav.ts's phd_research list) — this tab row is
// additional, in-page cross-navigation between them, rendered by all five pages.
const TABS = [
  { to: '/phd-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/phd-research', label: 'Research Documents', icon: FileText },
  { to: '/phd-research/bibliography', label: 'Working Bibliography', icon: BookMarked },
  { to: '/phd-plan', label: 'Research Plan', icon: Target },
  { to: '/phd-analytics', label: 'Analytics', icon: BarChart3 },
] as const;

export function PhdResearchTabs() {
  return (
    <div className="mb-5 flex w-fit items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            cx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )
          }
        >
          <tab.icon className="h-3.5 w-3.5" /> {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
