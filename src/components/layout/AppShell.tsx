import { type ReactNode, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap, Menu, X, Moon, Sun, Laptop } from 'lucide-react';
import { NAV_ITEMS, MOBILE_NAV_ITEMS } from './nav';
import { useAppStore } from '../../lib/store';
import { ACTIVE_WORKSPACES, getWorkspaceMeta } from '../../lib/workspace';
import { daysUntil } from '../../lib/utils';
import { cx } from '../../lib/utils';

// Multi-Workspace OS, Stage 3A — the first real UI on top of Stage 2's already-tested
// activeWorkspaceId/setActiveWorkspaceId. Only ACTIVE_WORKSPACES (APFC, UPSC CSE) are offered —
// PhD Research stays in the registry but is filtered out, so it's never selectable here.
function WorkspaceSwitch() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  return (
    <div className="flex items-center rounded-full bg-slate-100 dark:bg-slate-800 p-1 gap-0.5">
      {ACTIVE_WORKSPACES.map((w) => (
        <button
          key={w.id}
          onClick={() => setActiveWorkspaceId(w.id)}
          aria-label={`Switch to ${w.label}`}
          aria-pressed={activeWorkspaceId === w.id}
          className={cx(
            'relative rounded-full px-3 py-1 text-xs font-semibold transition-colors',
            activeWorkspaceId === w.id ? 'text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {activeWorkspaceId === w.id && (
            <motion.span
              layoutId="workspace-pill"
              className="absolute inset-0 rounded-full bg-brand-600"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative">{w.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}

function ThemeSwitch() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const options: Array<{ key: typeof theme; icon: typeof Sun }> = [
    { key: 'light', icon: Sun },
    { key: 'system', icon: Laptop },
    { key: 'dark', icon: Moon },
  ];
  return (
    <div className="flex items-center rounded-full bg-slate-100 dark:bg-slate-800 p-1 gap-0.5">
      {options.map(({ key, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          aria-label={`${key} theme`}
          className={cx(
            'relative flex h-7 w-7 items-center justify-center rounded-full transition-colors',
            theme === key ? 'text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200',
          )}
        >
          {theme === key && (
            <motion.span
              layoutId="theme-pill"
              className="absolute inset-0 rounded-full bg-brand-600"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Icon className="relative h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      ))}
    </div>
  );
}

function CountdownChip() {
  // Multi-Workspace OS, Stage 3A — APFC's exam date (store.ts's `examDate`) is a single global
  // field, not workspace-scoped (see Stage 2's field-by-field inspection); showing it under a
  // non-APFC workspace's branding would be a fabricated date for an exam this app knows nothing
  // about, so the chip simply doesn't render rather than any store/migration change being needed.
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const examDate = useAppStore((s) => s.examDate);
  if (activeWorkspaceId !== 'apfc') return null;
  const days = daysUntil(examDate);
  return (
    <div className="hidden sm:flex items-center gap-2 rounded-full border border-gold-300/60 bg-gold-50 dark:bg-gold-500/10 dark:border-gold-500/30 px-3.5 py-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-gold-500 animate-pulse" />
      <span className="text-xs font-semibold text-gold-800 dark:text-gold-300">
        {days} days to Prelims Day
      </span>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const workspace = getWorkspaceMeta(activeWorkspaceId);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-900 text-gold-300 shadow-lg shadow-brand-900/30">
          <GraduationCap className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div>
          <p className="font-display font-bold text-slate-900 dark:text-white leading-tight">{workspace.shortLabel} Tracker</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">{workspace.tagline}</p>
        </div>
      </div>

      <div className="px-5 pb-4">
        <WorkspaceSwitch />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
              )
            }
          >
            <item.icon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Multi-Workspace OS, Stage 3A — same reasoning as CountdownChip: no fabricated exam date
          for a workspace that doesn't have one. */}
      {activeWorkspaceId === 'apfc' && <div className="px-5 py-4 text-[11px] text-slate-400 dark:text-slate-600">Exam Day: 20 Dec 2026</div>}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  // Match exactly, or as a path segment prefix (e.g. "/mock-tests/run/1" matches "/mock-tests")
  // — a plain startsWith would also match "/pyq-test" against "/pyq", which is wrong.
  const activeLabel =
    NAV_ITEMS.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname === n.to || location.pathname.startsWith(`${n.to}/`)))?.label ??
    'APFC Tracker';

  return (
    <div className="min-h-screen bg-grid">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-950/60 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-950 lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
              <button
                className="absolute right-4 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200/70 dark:border-slate-800/70 bg-white/75 dark:bg-slate-950/60 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center justify-between gap-3 px-3 sm:h-16 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <h2 className="font-display text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">{activeLabel}</h2>
            </div>
            <div className="flex items-center gap-3">
              <CountdownChip />
              <ThemeSwitch />
            </div>
          </div>
        </header>

        <main className="px-3 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="mx-auto max-w-6xl"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 dark:border-slate-800/70 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="flex items-center justify-around py-2">
          {MOBILE_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors',
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                  {item.label.split(' ')[0]}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
