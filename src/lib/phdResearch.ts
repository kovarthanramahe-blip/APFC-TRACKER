// PhD Research — pure duration math over the persisted research start date (lib/store.ts's
// `phdResearchStartDate`). No progress percentage is computed anywhere here or elsewhere in this
// stage: elapsed TIME is a real, honest fact derivable from two dates; research PROGRESS is not
// something this app has any real signal for, so it is never fabricated.

export interface ResearchDuration {
  totalDays: number;
  years: number;
  months: number;
  /** Remaining days after `years` full years and `months` full months are subtracted out. */
  days: number;
}

/** Deterministic calendar-aware elapsed duration between `startDate` and `today` (both yyyy-mm-dd,
 * `today` supplied by the caller — see this app's established "no Date.now() in a pure function"
 * convention, e.g. lib/revisionQueue.ts). Returns all-zero when `today` is before `startDate`
 * (never a negative duration). `years`/`months`/`days` are true calendar years/months/days (e.g.
 * 21 Dec 2023 -> 22 Sep 2026 is 2 years, 9 months, 1 day) — not a flattened total/365 approximation
 * — alongside `totalDays`, the flat day count, for callers that want a single number too. */
export function computeResearchDuration(startDate: string, today: string): ResearchDuration {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(today + 'T00:00:00');
  if (end.getTime() <= start.getTime()) return { totalDays: 0, years: 0, months: 0, days: 0 };

  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const daysInPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    days += daysInPrevMonth;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { totalDays, years, months, days };
}
