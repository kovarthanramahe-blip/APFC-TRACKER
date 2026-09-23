import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { describeExamTarget, type ExamTarget } from '../../lib/examTarget';
import { formatDate } from '../../lib/utils';
import { Card, Badge } from './Primitives';

// A small, reusable exam-target/countdown card (lib/examTarget.ts) — shared by the UPSC CSE and
// APFC dashboards. Deliberately makes the exam-date/countdown/status/result-status distinction this
// stage's own instruction requires impossible to blur in a single component: a 'scheduled' target
// always shows a live days-remaining count (recomputed on every render, via describeExamTarget ->
// lib/utils.ts's own daysUntil — never a stored, staleable number) plus the "subject to change"
// caveat; an 'awaiting_result' target NEVER shows a countdown at all, only the concluded-exam note.

export function ExamTargetCard({ target }: { target: ExamTarget }) {
  const { daysRemaining } = describeExamTarget(target);
  const isScheduled = target.status === 'scheduled';

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{target.label}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(target.examDate)}</p>
        </div>
        {isScheduled ? (
          <Badge tone="brand">
            <CalendarClock className="h-3 w-3" /> Scheduled
          </Badge>
        ) : (
          <Badge tone="warning">
            <CheckCircle2 className="h-3 w-3" /> Awaiting Result
          </Badge>
        )}
      </div>

      {isScheduled && daysRemaining !== null ? (
        <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white">
          {daysRemaining >= 0 ? daysRemaining : 0} <span className="text-sm font-medium text-slate-400">days remaining</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{target.statusNote}</p>
      )}

      {isScheduled && target.scheduleCaveat && <p className="mt-2 text-[11px] text-slate-400">{target.scheduleCaveat}</p>}
    </Card>
  );
}
