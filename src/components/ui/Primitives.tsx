import { type ReactNode, type ButtonHTMLAttributes, type HTMLAttributes, type SelectHTMLAttributes, type InputHTMLAttributes, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion';
import { ChevronDown, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../lib/utils';
import { useAppStore } from '../../lib/store';
import { getWorkspaceAccent } from '../../lib/workspaceAccent';

/** `elevated` — design-system pass: every Card used to render at the exact same visual weight, so
 * a page's single most important/actionable card looked no different from its least important
 * one (see Dashboard.tsx's "Today's Study" card for the first real use). Deliberately opt-in and
 * meant to be rare — reach for it a few times per page at most, never as a new default, or every
 * card ends up "elevated" again and nothing stands out. Swaps the `.surface` background/border for
 * the slightly stronger `.surface-elevated` (index.css) and steps the shadow up one notch; nothing
 * else about Card's contract changes. */
export function Card({
  children,
  className,
  as: As = 'div',
  elevated = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
  elevated?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <As className={cx(elevated ? 'surface-elevated shadow-md shadow-slate-900/8' : 'surface shadow-sm shadow-slate-900/5', 'rounded-2xl', className)} {...rest}>
      {children}
    </As>
  );
}

/** `colorClassName` defaults to the ACTIVE workspace's own accent bar colour (see
 * lib/workspaceAccent.ts) rather than a hard-coded blue, so every caller that doesn't need a
 * specific semantic colour (e.g. accuracy-based green/red) automatically reflects the current
 * workspace. A caller passing its own `colorClassName` is unaffected — this default is only ever
 * used when one isn't supplied. */
export function ProgressBar({
  value,
  max = 100,
  colorClassName,
  trackClassName,
  height = 'h-2',
}: {
  value: number;
  max?: number;
  colorClassName?: string;
  trackClassName?: string;
  height?: string;
}) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const resolvedColor = colorClassName ?? getWorkspaceAccent(activeWorkspaceId).bar;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cx('w-full rounded-full bg-slate-200/70 dark:bg-slate-700/50 overflow-hidden', height, trackClassName)}>
      <motion.div
        className={cx('h-full rounded-full', resolvedColor)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
    </div>
  );
}

/** Small labelled number tile used across the dashboard/analytics pages (UPSC CSE Analytics, PhD
 * Analytics) — extracted here from two byte-identical local copies so both stay in sync rather
 * than drifting independently. */
export function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'danger' | 'brand';
}) {
  const tones: Record<string, string> = {
    neutral: 'text-slate-800 dark:text-slate-100',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-rose-600 dark:text-rose-400',
    brand: 'text-brand-600 dark:text-brand-400',
  };
  return (
    <Card className="p-4 text-center">
      <p className={cx('font-display text-xl font-bold', tones[tone])}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </Card>
  );
}

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'brand' | 'gold' | 'success' | 'danger' | 'warning' | 'jarvis';
}) {
  // Phase 15 — success/danger/warning now read from the --color-success-*/--color-danger-*/
  // --color-warning-* tokens (index.css) instead of repeating bare emerald/rose/amber classes;
  // every token mirrors its old Tailwind family's exact values, so nothing here renders any
  // differently than before. `jarvis` is new (Step 7's "Badge tone including JARVIS") — indigo,
  // this app's only unclaimed accent hue (see index.css's own --color-jarvis-* header comment).
  const tones: Record<string, string> = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    brand: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    gold: 'bg-gold-100 text-gold-800 dark:bg-gold-500/15 dark:text-gold-300',
    success: 'bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300',
    danger: 'bg-danger-100 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300',
    warning: 'bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300',
    jarvis: 'bg-jarvis-100 text-jarvis-700 dark:bg-jarvis-500/15 dark:text-jarvis-300',
  };
  // UI audit — Badge is used across the app for dynamic, content-derived text (syllabus topic/
  // subject names, bibliography categories, study tags), none of which this component can bound
  // in advance. `max-w-full` lets a badge actually shrink to fit inside a constrained flex/grid
  // parent instead of forcing that parent wider; `truncate` then ellipsizes gracefully instead of
  // the label spilling past the pill's own rounded background. Every existing short-label badge is
  // unaffected — truncation only ever engages once content already exceeds the available width.
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Shared colour mapping for Button AND IconButton (Phase 15) — pulled out so both read the exact
 * same variant colours from one place rather than IconButton repeating Button's own literal
 * classes (the "don't choose arbitrary colours repeatedly" rule applied to components, not just
 * tokens). Button's own rendered output is unchanged — this is the same strings it used inline
 * before, just named. */
export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/30',
  // Design system — secondary used to be a borderless flat fill (bg-slate-100), which on a Card's
  // own near-white `.surface` background reads as barely-there — a secondary action next to a
  // primary one lost most of its own visual identity as a distinct, clickable control. A subtle
  // border restores that without adding real visual weight (still clearly lighter than primary).
  secondary: 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
        BUTTON_VARIANT_CLASSES[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Icon-only button (Phase 15) — shares Button's own variant colours (BUTTON_VARIANT_CLASSES
 * above) so an IconButton next to a Button never looks like it belongs to a different system.
 * `label` is required and becomes the button's aria-label — this component has no visible text
 * for a screen reader to fall back to, so an accessible name can never be forgotten. Sized so
 * every variant meets the 44px minimum touch target at `md` (the default) and up; `sm` (36px) is
 * for dense toolbars where the surrounding layout already affords larger tap padding. */
export function IconButton({
  icon: Icon,
  label,
  className,
  variant = 'ghost',
  size = 'md',
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes: Record<string, string> = {
    sm: 'h-9 w-9',
    md: 'h-11 w-11',
    lg: 'h-12 w-12',
  };
  const iconSizes: Record<string, string> = {
    sm: 'h-4 w-4',
    md: 'h-4.5 w-4.5',
    lg: 'h-5 w-5',
  };
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
        BUTTON_VARIANT_CLASSES[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      <Icon className={iconSizes[size]} strokeWidth={2.2} />
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const accent = getWorkspaceAccent(activeWorkspaceId);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        {eyebrow && <p className={cx('text-xs font-semibold uppercase tracking-widest mb-1', accent.text)}>{eyebrow}</p>}
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm sm:text-base">{description}</p>}
      </div>
      {/* No shrink-0 here (there was previously): a flex item with flex-shrink:0 is sized at its
          MAX-CONTENT width — i.e. as if every button inside it sat on one unbroken line — which
          defeats the action content's own `flex-wrap` (every page passing more than a couple of
          buttons, e.g. pages/Repository.tsx, relies on that wrap to avoid horizontal overflow at
          narrower desktop/tablet widths). min-w-0 additionally lets this item shrink past its
          content's intrinsic min-width (the default `min-width: auto` flex quirk), so it can never
          force the page wider than its container even in the extreme case where a single button's
          own label doesn't fit. A short, single-element action (the common case elsewhere) renders
          identically either way, since its min-content width already equals its max-content width —
          there is nothing for it to shrink into. */}
      {action && <div className="min-w-0">{action}</div>}
    </div>
  );
}

/**
 * Multi-Workspace OS, Stage 3A — the shared empty state for an exam-oriented page (Syllabus,
 * Question Bank, PYQs, Mock Tests, Study Plan, Analytics) when a non-APFC exam workspace (e.g.
 * UPSC CSE) is active. Deliberately generic and reused verbatim rather than per-page copy: it
 * never fabricates or hints at syllabus/question/PYQ content that doesn't exist yet for that
 * workspace. `workspaceLabel` names the actual active workspace so the message never claims to be
 * about APFC when it isn't.
 */
export function WorkspaceComingSoon({ icon: Icon, workspaceLabel }: { icon: LucideIcon; workspaceLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-20 px-6 text-center">
      <Icon className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
      <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">{workspaceLabel} content coming next</h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-400">
        We're still building out the syllabus, question bank and mock tests for this workspace. Your Notes and Pomodoro sessions already work here.
      </p>
    </div>
  );
}

// ============================================================================
// JARVIS Aura Design System (Phase 15) — new primitives below. Every one of these is ADDITIVE:
// no component above was renamed, had a prop removed, or changed its default rendered output.
// ============================================================================

/** Richer sibling to StatTile above — StatTile itself is untouched (two existing pages still use
 * it as-is). StatCard adds an icon, an optional trend indicator, and an accent colour, for the
 * roadmap's "Dashboard/statistics" surfaces that need more than a bare number. */
export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  accentClassName = 'text-brand-600 dark:text-brand-400',
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  /** Positive renders success-toned with an up arrow, negative danger-toned with a down arrow,
   * zero/omitted shows no trend row at all — never a fabricated "no change" indicator. */
  trend?: { value: number; label?: string };
  accentClassName?: string;
  className?: string;
}) {
  return (
    <Card className={cx('p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
        {Icon && (
          <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800', accentClassName)}>
            <Icon className="h-4.5 w-4.5" strokeWidth={2.2} />
          </span>
        )}
      </div>
      {trend && trend.value !== 0 && (
        <p className={cx('mt-2 flex items-center gap-1 text-xs font-medium', trend.value > 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400')}>
          <span aria-hidden="true">{trend.value > 0 ? '↑' : '↓'}</span>
          {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </Card>
  );
}

/**
 * Circular progress indicator (Step 6) — extracted verbatim from the maths/markup
 * pages/Pomodoro.tsx and pages/Syllabus.tsx each already hand-rolled separately (same
 * circumference/offset formula, same track-circle-plus-animated-circle structure); both are
 * switched to call this directly, pixel-for-pixel identical, as part of this same phase. Renders
 * ONLY the ring itself (no centred label) — Pomodoro's timer text and Syllabus's percentage label
 * both already render as a sibling of the ring, not inside it, so this never needs a `children`
 * slot. `className` controls the SVG's own rendered size/position (e.g. `"h-10 w-10"` for a small
 * standalone ring, or `"absolute inset-0"` to fill a parent that also holds centred content) —
 * the exact same flexibility each original inline implementation already had, just named.
 */
export function ProgressRing({
  value,
  max = 100,
  radius,
  strokeWidth,
  colorClassName,
  trackClassName = 'text-slate-200 dark:text-slate-800',
  animateFromZero = false,
  transition,
  className,
}: {
  value: number;
  max?: number;
  radius: number;
  strokeWidth: number;
  colorClassName?: string;
  trackClassName?: string;
  /** Animates the ring filling in from empty on mount (Syllabus's own original behaviour) —
   * false (Pomodoro's own original behaviour) renders already at `value` and only animates
   * subsequent changes. */
  animateFromZero?: boolean;
  /** Omitted entirely (the default) lets framer-motion use its own default spring, exactly like
   * Syllabus's original RadialProgress, which never passed one. Pomodoro's own 0.4s linear tick
   * is passed explicitly by its own call site. */
  transition?: Transition;
  className?: string;
}) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const resolvedColor = colorClassName ?? getWorkspaceAccent(activeWorkspaceId).solidText;
  const size = (radius + strokeWidth) * 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={cx('-rotate-90', className)}>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={trackClassName} />
      <motion.circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={resolvedColor}
        strokeDasharray={circumference}
        {...(animateFromZero ? { initial: { strokeDashoffset: circumference } } : {})}
        animate={{ strokeDashoffset: offset }}
        {...(transition ? { transition } : {})}
      />
    </svg>
  );
}

/** Smaller, section/card-level heading — distinct from PageHeader above, which is for a whole
 * page. Used inside a Card to introduce a sub-area (e.g. the Design System Showcase's own
 * sections) without repeating PageHeader's larger display type and workspace-accent eyebrow. */
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export interface TabItem {
  id: string;
  label: string;
}

/** Pill-style tab list (Step 6) — the same sliding-pill pattern components/layout/AppShell.tsx's
 * own WorkspaceSwitch/ThemeSwitch already use (motion.span with a shared layoutId), generalised
 * here into a reusable component instead of a third hand-rolled copy. AppShell's own two switches
 * are left exactly as they are (not in this phase's approved file list) — this is for NEW call
 * sites (e.g. the Showcase) going forward. */
export function Tabs({ tabs, activeId, onChange, layoutId = 'aura-tabs-pill' }: { tabs: readonly TabItem[]; activeId: string; onChange: (id: string) => void; layoutId?: string }) {
  return (
    <div role="tablist" className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-slate-800 p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cx(
              'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {isActive && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-primary-600" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Labelled text input (Step 6) — every existing raw `<input>` across the app (e.g.
 * AnnotationToolbar.tsx's colour/thickness controls, Pomodoro.tsx's subject select) stays exactly
 * as it is; this is for new Aura-era call sites. `h-11` (44px) meets the Step 10 touch-target
 * minimum. */
export function Input({ label, error, className, id, ...rest }: { label?: string; error?: string; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={cx(
          'h-11 w-full rounded-input border border-slate-200 bg-white px-3.5 text-sm text-slate-800 placeholder:text-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-focus/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
          error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/30',
          className,
        )}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-danger-600 dark:text-danger-400">{error}</p>}
    </div>
  );
}

/** Labelled select (Step 6) — a styled wrapper around the native `<select>` (never a custom
 * listbox/combobox reimplementation, so native keyboard/screen-reader behaviour is never at
 * risk), with the same chevron-affordance pattern this app already uses nowhere consistently. */
export function Select({
  label,
  className,
  id,
  children,
  ...rest
}: { label?: string; className?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cx(
            'h-11 w-full appearance-none rounded-input border border-slate-200 bg-white px-3.5 pr-9 text-sm text-slate-800 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-focus/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}

/** Accessible on/off switch (Step 6) — a real `<button role="switch">`, not a styled checkbox, so
 * `aria-checked` and keyboard activation (Space/Enter, native to `<button>`) come for free. 44px
 * minimum hit area via the wrapping padding even though the visible track is smaller, matching
 * Step 10's touch-target rule without inflating the track's own visual size. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 w-14 shrink-0 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 rounded-pill"
    >
      <span className={cx('relative h-6 w-11 rounded-pill transition-colors', checked ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700')}>
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
          animate={{ left: checked ? '1.375rem' : '0.125rem' }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

/** Modal/bottom-sheet dialog (Step 6) — generalises the bottom-sheet markup duplicated across
 * ~9 existing components (Notes.tsx's FolderNameDialog/DeleteFolderDialog/NoteEditor,
 * LinkedNotesModal.tsx, the various Repository/UpscCse import modals, etc.) into one primitive.
 * None of those existing call sites are migrated to it in this phase (each has its own
 * focus/close-button/animation details that need individual verification — flagged as a
 * follow-on phase in the Phase 15 plan); this is the primitive itself plus its Showcase demo.
 * Escape-to-close and backdrop-click-to-close match every existing hand-rolled modal's own
 * behaviour; focus moves to the dialog on open and returns to the trigger on close. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={reduceMotion ? { duration: 0.1 } : { type: 'spring', stiffness: 360, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-modal sm:inset-0 sm:top-1/3 sm:bottom-auto sm:h-fit sm:rounded-modal bg-white dark:bg-slate-900 shadow-2xl focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <h3 id={titleId} className="font-display font-semibold text-slate-800 dark:text-slate-100">
                {title}
              </h3>
              <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
            </div>
            <div className="px-5 py-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export type ToastTone = 'neutral' | 'success' | 'jarvis' | 'gold';

/** Toast notification (Step 6) — generalises components/RewardCelebration.tsx's own one-off
 * markup into a reusable primitive; RewardCelebration itself is switched to render through this
 * in the same phase (its own unlock-detection/5s-dismiss logic is untouched, only the JSX moved).
 * Presentational only — no queue/provider; a caller owns its own open/close state, exactly as
 * RewardCelebration already did before this change. */
export function Toast({
  open,
  onClose,
  icon: Icon,
  title,
  message,
  tone = 'neutral',
}: {
  open: boolean;
  onClose: () => void;
  icon: LucideIcon;
  title: string;
  message: string;
  tone?: ToastTone;
}) {
  const reduceMotion = useReducedMotion();
  // 'gold' exists specifically so components/RewardCelebration.tsx's own pre-existing gold/trophy
  // reward styling renders identically after adopting this primitive — see that component's own
  // comment at its call site.
  const toneClasses: Record<ToastTone, { border: string; iconBg: string; iconText: string; titleText: string }> = {
    neutral: { border: 'border-slate-200/60 dark:border-slate-700/60', iconBg: 'bg-slate-100 dark:bg-slate-800', iconText: 'text-slate-600 dark:text-slate-300', titleText: 'text-slate-700 dark:text-slate-300' },
    success: { border: 'border-success-300/60 dark:border-success-500/30', iconBg: 'bg-success-100 dark:bg-success-500/15', iconText: 'text-success-600 dark:text-success-400', titleText: 'text-success-700 dark:text-success-400' },
    jarvis: { border: 'border-jarvis-300/60 dark:border-jarvis-500/30', iconBg: 'bg-jarvis-100 dark:bg-jarvis-500/15', iconText: 'text-jarvis-600 dark:text-jarvis-400', titleText: 'text-jarvis-700 dark:text-jarvis-400' },
    gold: { border: 'border-gold-300/60 dark:border-gold-500/30', iconBg: 'bg-gold-100 dark:bg-gold-500/15', iconText: 'text-gold-600 dark:text-gold-400', titleText: 'text-gold-700 dark:text-gold-400' },
  };
  const t = toneClasses[tone];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.95 }}
          transition={reduceMotion ? { duration: 0.1 } : { type: 'spring', stiffness: 320, damping: 28 }}
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0"
        >
          <div className={cx('flex items-center gap-3 rounded-2xl border bg-white/95 dark:bg-slate-900/95 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur-xl', t.border)}>
            <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', t.iconBg)}>
              <Icon className={cx('h-4.5 w-4.5', t.iconText)} />
            </span>
            <div className="min-w-0">
              <p className={cx('text-xs font-semibold', t.titleText)}>{title}</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{message}</p>
            </div>
            <IconButton icon={X} label="Dismiss" size="sm" variant="ghost" className="ml-2 h-8 w-8" onClick={onClose} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Simple hover/focus tooltip (Step 6) — no portal, no floating-ui dependency (this app has none
 * and doesn't need one for a short, non-interactive label): `absolute` positioning off a
 * `relative` wrapper, shown on hover OR keyboard focus so it's never mouse-only. Intended for
 * short labels only (icon buttons, truncated text) — not a rich/interactive popover. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onFocus={() => setVisible(true)} onBlur={() => setVisible(false)}>
      {children}
      <AnimatePresence>
        {visible && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-slate-700"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Loading placeholder block (Step 6) — a named wrapper around the pre-existing `.animate-shimmer`
 * class (index.css), already used by App.tsx's own RouteFallback; this just gives it a reusable
 * component form with sensible size defaults instead of each call site repeating the same
 * `h-* rounded-2xl animate-shimmer` div. App.tsx's own RouteFallback is untouched. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('rounded-2xl animate-shimmer', className ?? 'h-24 w-full')} aria-hidden="true" />;
}

/** Generic empty state (Step 6) — a more broadly-reusable sibling to WorkspaceComingSoon above,
 * which stays exactly as it is for its existing 6 call sites (its copy is specific to "exam
 * workspace content coming soon"). This is for any other "nothing here yet" surface — an optional
 * `action` (e.g. a "Create your first X" button) is the one thing WorkspaceComingSoon's own fixed
 * copy doesn't support. */
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-20 px-6 text-center">
      <Icon className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
      <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Page/section-level loading state (Step 6) — distinct from a single Skeleton block: a small
 * stack of them plus an optional label, for "this whole area is still loading" rather than one
 * placeholder value. */
export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {label && <p className="text-sm text-slate-400">{label}</p>}
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** JARVIS visual language (Step 7) — a Card with the jarvis accent, for a recommendation/insight
 * JARVIS surfaces inside the OS (Command Centre, Dashboard, etc. — not the chat page itself, which
 * already has its own UI). Deliberately restrained: one thin accent border + a small badge, never
 * a differently-shaped card or a chat-bubble look, so it reads as "this card came from JARVIS"
 * without the surrounding page feeling like a chatbot. */
export function JarvisCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cx('border-l-2 !border-l-jarvis-500', className)}>{children}</Card>;
}

/** A JarvisCard pre-composed for a single insight/recommendation — icon + title + body text +
 * optional action, the shape Command Centre's own "what should I do next" items and a future
 * JARVIS insight surface both need. */
export function JarvisInsightCard({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <JarvisCard className={cx('p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-jarvis-100 text-jarvis-600 dark:bg-jarvis-500/15 dark:text-jarvis-400">
          {Icon ? <Icon className="h-4.5 w-4.5" strokeWidth={2.2} /> : <span className="text-sm font-display font-bold">J</span>}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
            <Badge tone="jarvis">JARVIS</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </JarvisCard>
  );
}

/** JARVIS's "thinking" state (Step 7) — three small pulsing dots, restrained rather than a full
 * chat "typing…" bubble, reused wherever JARVIS is composing a response (chat, an insight card
 * still loading). Reduced-motion aware: becomes a static (non-pulsing) indicator rather than
 * disabling itself entirely, since it's still conveying real state ("JARVIS is working"). */
export function JarvisThinkingIndicator({ label = 'JARVIS is thinking' }: { label?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-jarvis-500"
            animate={reduceMotion ? {} : { opacity: [0.3, 1, 0.3] }}
            transition={reduceMotion ? undefined : { duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </span>
    </div>
  );
}

// ---- Motion system (Step 8) — named, reusable variants, extending fadeUp/staggerContainer below
// rather than replacing them. Each generalises a pattern already proven somewhere in this app
// (AppShell's page transition/drawer spring, RewardCelebration's toast spring, ProgressBar's width
// tween) so adopting these is a naming exercise, not new, unproven motion. ----

export const cardEntrance = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: 'easeOut' } } as const;

/** Generalises Button's own `active:scale-[0.97]` CSS into a framer-motion variant for
 * non-`<button>` pressable elements (e.g. a whole Card acting as a tap target). */
export const pressScale = { whileTap: { scale: 0.97 } } as const;

export const expandCollapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.25, ease: 'easeOut' },
} as const;

/** A brief scale "pop" for a just-completed action (e.g. ticking off a task) — short and
 * single-shot, never a looping/attention-seeking animation. */
export const completionPulse = { animate: { scale: [1, 1.08, 1] }, transition: { duration: 0.35, ease: 'easeOut' } } as const;

/** Shares RewardCelebration's own existing spring values — xpGain is for a smaller, inline "+XP"
 * moment (e.g. next to a completed task) rather than RewardCelebration's own full toast. */
export const xpGain = { initial: { opacity: 0, y: 6, scale: 0.9 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -6 }, transition: { type: 'spring', stiffness: 400, damping: 28 } } as const;

export const modalEnter = { initial: { opacity: 0, y: 24, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 12, scale: 0.97 }, transition: { type: 'spring', stiffness: 360, damping: 32 } } as const;

export const toastEnter = { initial: { opacity: 0, y: 20, scale: 0.95 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 10, scale: 0.95 }, transition: { type: 'spring', stiffness: 320, damping: 28 } } as const;

/** Names components/layout/AppShell.tsx's own existing page-transition values (unchanged there —
 * AppShell isn't modified in this phase) so a future caller elsewhere can reuse the exact same
 * feel without re-guessing the numbers. */
export const navTransition = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.25, ease: 'easeOut' } } as const;

export const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' },
} as const;

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
} as const;
