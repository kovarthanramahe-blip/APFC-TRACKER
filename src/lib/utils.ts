import type { SubjectColorKey } from './types';

export const SUBJECT_COLORS: Record<
  SubjectColorKey,
  { text: string; bg: string; border: string; dot: string; chart: string }
> = {
  english: { text: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-50 dark:bg-sky-500/10', border: 'border-sky-200 dark:border-sky-500/30', dot: 'bg-sky-500', chart: '#0284c7' },
  freedomStruggle: { text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/30', dot: 'bg-amber-500', chart: '#b45309' },
  currentAffairs: { text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-500/30', dot: 'bg-rose-500', chart: '#e11d48' },
  science: { text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/30', dot: 'bg-emerald-500', chart: '#059669' },
  polity: { text: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-200 dark:border-indigo-500/30', dot: 'bg-indigo-500', chart: '#4338ca' },
  economy: { text: 'text-teal-700 dark:text-teal-300', bg: 'bg-teal-50 dark:bg-teal-500/10', border: 'border-teal-200 dark:border-teal-500/30', dot: 'bg-teal-500', chart: '#0d9488' },
  historyCulture: { text: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/30', dot: 'bg-orange-500', chart: '#c2410c' },
  accounting: { text: 'text-cyan-700 dark:text-cyan-300', bg: 'bg-cyan-50 dark:bg-cyan-500/10', border: 'border-cyan-200 dark:border-cyan-500/30', dot: 'bg-cyan-500', chart: '#0891b2' },
  labourLaw: { text: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-50 dark:bg-violet-500/10', border: 'border-violet-200 dark:border-violet-500/30', dot: 'bg-violet-500', chart: '#7c3aed' },
  computer: { text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/30', dot: 'bg-blue-500', chart: '#1d4ed8' },
  quant: { text: 'text-fuchsia-700 dark:text-fuchsia-300', bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10', border: 'border-fuchsia-200 dark:border-fuchsia-500/30', dot: 'bg-fuchsia-500', chart: '#a21caf' },
  reasoning: { text: 'text-lime-700 dark:text-lime-300', bg: 'bg-lime-50 dark:bg-lime-500/10', border: 'border-lime-200 dark:border-lime-500/30', dot: 'bg-lime-600', chart: '#4d7c0f' },
  labourMovement: { text: 'text-pink-700 dark:text-pink-300', bg: 'bg-pink-50 dark:bg-pink-500/10', border: 'border-pink-200 dark:border-pink-500/30', dot: 'bg-pink-500', chart: '#be185d' },
};

/** The LOCAL calendar date as yyyy-mm-dd — never `toISOString()`, which is always UTC and can
 * report the wrong calendar day for a positive-offset timezone (e.g. IST, UTC+5:30) during the
 * early hours of the morning. Accepts an optional Date so callers (and tests) can pass a specific
 * instant instead of relying on the system clock; reads that Date's own local getters, so the
 * result always matches whatever timezone the JS runtime is actually configured for. */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function cx(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(' ');
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
