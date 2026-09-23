import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Hourglass, FolderKanban, Target, FileText, History as HistoryIcon, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getLocalDateString, formatDate, cx } from '../lib/utils';
import { Card, PageHeader, WorkspaceComingSoon } from '../components/ui/Primitives';
import { PhdResearchTabs } from '../components/phdResearch/PhdResearchTabs';
import { computePhdAnalytics } from '../lib/phdAnalytics';
import { listNotesForWorkspace } from '../lib/repository';

function StatTile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' | 'brand' }) {
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

export default function PhdAnalytics() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const researchStartDate = useAppStore((s) => s.phdResearchStartDate);
  const topicAreas = useAppStore((s) => s.phdTopicAreas);
  const microTargets = useAppStore((s) => s.phdMicroTargets);
  const importedContent = useAppStore((s) => s.importedContent);
  const notes = useAppStore((s) => s.notes);

  const today = useMemo(() => getLocalDateString(), []);
  const notesCount = useMemo(() => listNotesForWorkspace(notes, activeWorkspaceId).length, [notes, activeWorkspaceId]);

  const analytics = useMemo(
    () => computePhdAnalytics({ researchStartDate, topicAreas, microTargets, importedContent, notesCount, today }),
    [researchStartDate, topicAreas, microTargets, importedContent, notesCount, today],
  );

  if (activeWorkspaceId !== 'phd_research') {
    return (
      <div>
        <PageHeader eyebrow="PhD Research" title="Analytics" />
        <WorkspaceComingSoon icon={GraduationCap} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="PhD Research" title="Analytics" description="Real research timeline, Topic Area statistics, and micro-target progress — never a fabricated completion percentage." />
      <PhdResearchTabs />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Research Started</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">{formatDate(analytics.researchStartDate)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Duration</p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-lg font-bold text-slate-900 dark:text-white">
            <Hourglass className="h-4 w-4 text-brand-500" />
            {analytics.duration.years}y {analytics.duration.months}m {analytics.duration.days}d
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Topic Areas</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">{analytics.topicAreaCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Target Completion</p>
          <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">{analytics.completionRatePct}%</p>
        </Card>
      </div>

      {/* Topic Area analytics */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Topic Areas</h3>
        </div>
        {analytics.topicAreas.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No Topic Areas yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {analytics.topicAreas.map((entry) => (
              <li key={entry.topicArea.id}>
                <Link to="/phd-dashboard" className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{entry.topicArea.title}</span>
                  <span className="flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>{entry.linkedContentCount} linked item{entry.linkedContentCount === 1 ? '' : 's'}</span>
                    <span>{entry.activeTargetCount} active</span>
                    <span className="text-emerald-500">{entry.completedTargetCount} completed</span>
                    {entry.overdueTargetCount > 0 && <span className="text-rose-500">{entry.overdueTargetCount} overdue</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Research material */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Research Material</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link to="/phd-research">
            <StatTile label="Research Documents" value={`${analytics.materialCounts.researchDocuments}`} />
          </Link>
          <Link to="/phd-research/bibliography">
            <StatTile label="Bibliography Records" value={`${analytics.materialCounts.bibliographyRecords}`} />
          </Link>
          <Link to="/notes">
            <StatTile label="Notes" value={`${analytics.materialCounts.notes}`} />
          </Link>
          <Link to="/repository">
            <StatTile label="Other Imported Content" value={`${analytics.materialCounts.otherImportedContent}`} />
          </Link>
        </div>
      </Card>

      {/* Micro-target analytics */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Micro-Targets</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Pending" value={`${analytics.microTargetCounts.pending}`} />
          <StatTile label="In Progress" value={`${analytics.microTargetCounts.in_progress}`} tone="brand" />
          <StatTile label="Completed" value={`${analytics.microTargetCounts.completed}`} tone="success" />
          <StatTile label="Overdue" value={`${analytics.overdueTargetCount}`} tone={analytics.overdueTargetCount > 0 ? 'danger' : 'neutral'} />
        </div>
        <Link to="/phd-plan" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
          Open Research Plan
        </Link>
      </Card>

      {/* Activity */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Activity Over Time</h3>
        </div>
        {analytics.activityByDate.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No recorded activity yet.</p>
        ) : (
          <ul className="space-y-1">
            {analytics.activityByDate.slice(0, 14).map((day) => (
              <li key={day.date} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300">
                <span>{formatDate(day.date)}</span>
                <span className="flex gap-3 text-xs text-slate-400">
                  {day.completedTargets > 0 && (
                    <span className="inline-flex items-center gap-1 text-emerald-500">
                      <CheckCircle2 className="h-3 w-3" /> {day.completedTargets} target{day.completedTargets === 1 ? '' : 's'}
                    </span>
                  )}
                  {day.importedContent > 0 && (
                    <span className="inline-flex items-center gap-1">{day.importedContent} item{day.importedContent === 1 ? '' : 's'} added</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
