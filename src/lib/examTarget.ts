import type { WorkspaceKind } from './workspace';
import { daysUntil } from './utils';

// Exam Targets / Countdowns — a small, reusable model for a fixed, officially-scheduled exam
// milestone (never a user-created record): a label, a real calendar date, and a status that
// distinguishes "still upcoming" from "already happened, result pending". These are official facts
// (UPSC's own published exam calendar), not user data, so they live as a plain constant list here
// rather than as persisted store state — nothing to migrate, export/import, or lose on reset, and
// nothing here is ever fabricated: every date below is the one this stage was explicitly given.
//
// `daysUntil` (lib/utils.ts) already exists and is exactly this app's established convention for a
// live countdown (see pages/Dashboard.tsx's own `const days = daysUntil(examDate)`) — reused as-is
// here rather than reinventing a second date-math helper. It recomputes from the real "now" on every
// call, so a rendered countdown is always current as of whenever the page was last loaded/rendered —
// the same "updates automatically" guarantee the app's existing APFC exam countdown already relies
// on, not a stored, staleable number.

export type ExamTargetStatus = 'scheduled' | 'awaiting_result';

export interface ExamTarget {
  id: string;
  workspaceId: WorkspaceKind;
  label: string;
  /** yyyy-mm-dd — the real (or officially scheduled) exam date, never a precomputed countdown. */
  examDate: string;
  status: ExamTargetStatus;
  /** Shown only for 'awaiting_result' — the honest statement of what happened, never framed as an
   * upcoming countdown. */
  statusNote?: string;
  /** Shown for 'scheduled' targets — UPSC's own calendar is subject to revision. */
  scheduleCaveat?: string;
}

export const EXAM_TARGETS: readonly ExamTarget[] = [
  {
    id: 'upsc-cse-mains-2026',
    workspaceId: 'upsc_cse',
    label: 'CSE Mains 2026',
    examDate: '2026-08-21',
    status: 'awaiting_result',
    statusNote: 'The 2026 CSE Mains examination was scheduled from 21 August 2026 and has concluded — awaiting result.',
  },
  {
    id: 'upsc-cse-prelims-2027',
    workspaceId: 'upsc_cse',
    label: 'CSE Prelims 2027',
    examDate: '2027-05-23',
    status: 'scheduled',
    scheduleCaveat: "UPSC's official calendar dates are subject to change.",
  },
  {
    id: 'apfc-capf-acs-2027',
    workspaceId: 'apfc',
    label: 'CAPF (ACs) 2027',
    examDate: '2027-07-04',
    status: 'scheduled',
    scheduleCaveat: "UPSC's official calendar dates are subject to change.",
  },
];

export function examTargetsForWorkspace(workspaceId: WorkspaceKind): ExamTarget[] {
  return EXAM_TARGETS.filter((t) => t.workspaceId === workspaceId);
}

export interface ExamTargetDisplay {
  target: ExamTarget;
  /** Only meaningful (and only ever shown) when status === 'scheduled' — never computed or
   * displayed as a countdown for an 'awaiting_result' target, per this feature's own core rule that
   * a concluded exam is never presented as an upcoming countdown. Can be negative if the scheduled
   * date has quietly passed without a status update yet — callers should treat <= 0 as "today or
   * past" rather than hiding the target. */
  daysRemaining: number | null;
}

/** Resolves an ExamTarget into exactly what a dashboard should render: the target itself, plus a
 * live days-remaining figure ONLY for a 'scheduled' target (null for 'awaiting_result', so a caller
 * can never accidentally render a countdown for a concluded exam). */
export function describeExamTarget(target: ExamTarget): ExamTargetDisplay {
  return { target, daysRemaining: target.status === 'scheduled' ? daysUntil(target.examDate) : null };
}
