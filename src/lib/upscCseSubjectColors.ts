// UPSC CSE Syllabus Visual Identity (Knowledge Library Phase 2) — a restrained, premium colour
// system for Syllabus/Repository/Notes surfaces: SUBJECT gets a strong identity (one hue per
// subject FAMILY), MICROSYLLABUS gets a controlled, lighter variant of that SAME hue, never an
// unrelated colour of its own. This is deliberately a small, fixed palette (roughly one hue per
// well-known UPSC subject area) rather than one colour per syllabus node — exactly what this
// phase's own instructions ask for ("not dozens of unrelated colours").
//
// Every class below is a complete literal (never built via string interpolation — Tailwind's
// build-time scanner can't see a dynamically-assembled class name), matching this codebase's
// existing convention for per-key colour tokens (see lib/utils.ts's SUBJECT_COLORS, and
// lib/workspaceAccent.ts's own header note on the same rule). This module intentionally does NOT
// import or modify lib/utils.ts's SUBJECT_COLORS (APFC's own subject identity) — the two stay
// fully independent so neither can regress the other — but where a UPSC subject genuinely IS the
// same knowledge domain as an existing APFC subject (Polity, Economy, History, Science, Current
// Affairs), the SAME hue family is deliberately reused here, so that shared knowledge keeps one
// visual identity across lenses (see this phase's "ONE KNOWLEDGE CORE" product direction) without
// the two modules depending on each other.
//
// Foundation only, scoped to Syllabus for this phase (restrained rollout) — the same tokens are
// safe to reuse on Repository/Notes/Current Affairs/Study Plan/Analytics later without any change
// here.

export interface SubjectColorTokens {
  /** Strong, subject-level identity — a subject row's own colour. */
  text: string;
  bg: string;
  border: string;
  dot: string;
}

export interface SubjectColorFamily {
  /** The subject's own strong identity. */
  base: SubjectColorTokens;
  /** A controlled, lighter variant of the SAME hue — for microsyllabus/child rows beneath this
   * subject, so they read as "part of this subject" rather than an unrelated colour. */
  variant: SubjectColorTokens;
}

const FAMILIES = {
  // Shared with lib/utils.ts's SUBJECT_COLORS.polity — same knowledge domain, same identity.
  indigo: {
    base: { text: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-200 dark:border-indigo-500/30', dot: 'bg-indigo-500' },
    variant: { text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50/60 dark:bg-indigo-500/5', border: 'border-indigo-100 dark:border-indigo-500/15', dot: 'bg-indigo-300 dark:bg-indigo-400/70' },
  },
  // Shared with lib/utils.ts's SUBJECT_COLORS.economy.
  teal: {
    base: { text: 'text-teal-700 dark:text-teal-300', bg: 'bg-teal-50 dark:bg-teal-500/10', border: 'border-teal-200 dark:border-teal-500/30', dot: 'bg-teal-500' },
    variant: { text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50/60 dark:bg-teal-500/5', border: 'border-teal-100 dark:border-teal-500/15', dot: 'bg-teal-300 dark:bg-teal-400/70' },
  },
  // Shared with lib/utils.ts's SUBJECT_COLORS.historyCulture.
  orange: {
    base: { text: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/30', dot: 'bg-orange-500' },
    variant: { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50/60 dark:bg-orange-500/5', border: 'border-orange-100 dark:border-orange-500/15', dot: 'bg-orange-300 dark:bg-orange-400/70' },
  },
  // Shared with lib/utils.ts's SUBJECT_COLORS.science.
  emerald: {
    base: { text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/30', dot: 'bg-emerald-500' },
    variant: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50/60 dark:bg-emerald-500/5', border: 'border-emerald-100 dark:border-emerald-500/15', dot: 'bg-emerald-300 dark:bg-emerald-400/70' },
  },
  // Shared with lib/utils.ts's SUBJECT_COLORS.currentAffairs — reused everywhere "Current Affairs"
  // appears (Syllabus subject, Repository content type) so it keeps ONE visual identity app-wide.
  rose: {
    base: { text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-500/30', dot: 'bg-rose-500' },
    variant: { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50/60 dark:bg-rose-500/5', border: 'border-rose-100 dark:border-rose-500/15', dot: 'bg-rose-300 dark:bg-rose-400/70' },
  },
  cyan: {
    base: { text: 'text-cyan-700 dark:text-cyan-300', bg: 'bg-cyan-50 dark:bg-cyan-500/10', border: 'border-cyan-200 dark:border-cyan-500/30', dot: 'bg-cyan-500' },
    variant: { text: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50/60 dark:bg-cyan-500/5', border: 'border-cyan-100 dark:border-cyan-500/15', dot: 'bg-cyan-300 dark:bg-cyan-400/70' },
  },
  lime: {
    base: { text: 'text-lime-700 dark:text-lime-300', bg: 'bg-lime-50 dark:bg-lime-500/10', border: 'border-lime-200 dark:border-lime-500/30', dot: 'bg-lime-600' },
    variant: { text: 'text-lime-600 dark:text-lime-400', bg: 'bg-lime-50/60 dark:bg-lime-500/5', border: 'border-lime-100 dark:border-lime-500/15', dot: 'bg-lime-300 dark:bg-lime-400/70' },
  },
  sky: {
    base: { text: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-50 dark:bg-sky-500/10', border: 'border-sky-200 dark:border-sky-500/30', dot: 'bg-sky-500' },
    variant: { text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50/60 dark:bg-sky-500/5', border: 'border-sky-100 dark:border-sky-500/15', dot: 'bg-sky-300 dark:bg-sky-400/70' },
  },
  pink: {
    base: { text: 'text-pink-700 dark:text-pink-300', bg: 'bg-pink-50 dark:bg-pink-500/10', border: 'border-pink-200 dark:border-pink-500/30', dot: 'bg-pink-500' },
    variant: { text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50/60 dark:bg-pink-500/5', border: 'border-pink-100 dark:border-pink-500/15', dot: 'bg-pink-300 dark:bg-pink-400/70' },
  },
  violet: {
    base: { text: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-50 dark:bg-violet-500/10', border: 'border-violet-200 dark:border-violet-500/30', dot: 'bg-violet-500' },
    variant: { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50/60 dark:bg-violet-500/5', border: 'border-violet-100 dark:border-violet-500/15', dot: 'bg-violet-300 dark:bg-violet-400/70' },
  },
  amber: {
    base: { text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/30', dot: 'bg-amber-500' },
    variant: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50/60 dark:bg-amber-500/5', border: 'border-amber-100 dark:border-amber-500/15', dot: 'bg-amber-300 dark:bg-amber-400/70' },
  },
  red: {
    base: { text: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/30', dot: 'bg-red-500' },
    variant: { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50/60 dark:bg-red-500/5', border: 'border-red-100 dark:border-red-500/15', dot: 'bg-red-300 dark:bg-red-400/70' },
  },
  // Neutral fallback — used for a subject this module doesn't yet recognise, so a future/unlisted
  // subject still renders cleanly instead of crashing or looking broken.
  slate: {
    base: { text: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-500/10', border: 'border-slate-200 dark:border-slate-500/30', dot: 'bg-slate-500' },
    variant: { text: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-500/5', border: 'border-slate-200/70 dark:border-slate-500/15', dot: 'bg-slate-300 dark:bg-slate-400/70' },
  },
} as const satisfies Record<string, SubjectColorFamily>;

type FamilyName = keyof typeof FAMILIES;

/** UPSC CSE subject TITLE (exactly as data/upscCsePrelimsSyllabus.ts / data/upscCseMainsSyllabus.ts
 * spell it) -> colour family. Matched by normalised title rather than subject id, since the SAME
 * subject area (e.g. "History") legitimately gets its own id in each of Prelims/Mains/CSAT but
 * should read as one identity everywhere — and matched by a small set of KEYWORDS (not an exact
 * map) so a subject title this list doesn't literally contain (a future syllabus edit, a slightly
 * different wording) still gets a sensible family instead of silently falling through to the
 * neutral default. Order matters: the first matching keyword wins. */
const TITLE_KEYWORD_FAMILIES: readonly { keyword: string; family: FamilyName }[] = [
  { keyword: 'current affairs', family: 'rose' },
  { keyword: 'polity', family: 'indigo' },
  { keyword: 'constitution', family: 'indigo' },
  { keyword: 'governance', family: 'sky' },
  { keyword: 'social justice', family: 'pink' },
  { keyword: 'economy', family: 'teal' },
  { keyword: 'economic', family: 'teal' },
  { keyword: 'agriculture', family: 'amber' },
  { keyword: 'history', family: 'orange' },
  { keyword: 'heritage', family: 'orange' },
  { keyword: 'culture', family: 'orange' },
  { keyword: 'geography', family: 'cyan' },
  { keyword: 'environment', family: 'lime' },
  { keyword: 'science', family: 'emerald' },
  { keyword: 'society', family: 'pink' },
  { keyword: 'international relations', family: 'sky' },
  { keyword: 'disaster management', family: 'red' },
  { keyword: 'internal security', family: 'red' },
  { keyword: 'ethics', family: 'violet' },
  { keyword: 'aptitude', family: 'violet' },
  { keyword: 'reasoning', family: 'violet' },
  { keyword: 'numeracy', family: 'violet' },
  { keyword: 'comprehension', family: 'violet' },
  { keyword: 'mental ability', family: 'violet' },
  { keyword: 'data interpretation', family: 'violet' },
  { keyword: 'decision making', family: 'violet' },
];

/** Resolves a UPSC CSE subject (paper, optional subject, microsyllabus — whichever is on hand;
 * pass a subject/paper title) to its colour family — a strong base identity plus a lighter
 * microsyllabus variant of the SAME hue. Falls back to the neutral `slate` family for a title that
 * matches no known keyword, so this never throws and never silently renders unstyled. */
export function getUpscSubjectColor(subjectTitle: string): SubjectColorFamily {
  const normalized = subjectTitle.trim().toLowerCase();
  for (const { keyword, family } of TITLE_KEYWORD_FAMILIES) {
    if (normalized.includes(keyword)) return FAMILIES[family];
  }
  return FAMILIES.slate;
}
