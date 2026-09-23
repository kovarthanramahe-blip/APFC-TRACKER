import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Target, Plus, Trash2, AlertTriangle, CheckCircle2, CalendarClock, Clock, FolderKanban, ExternalLink } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getLocalDateString, formatDate, cx, uuid } from '../lib/utils';
import { Card, Button, Badge, PageHeader, WorkspaceComingSoon } from '../components/ui/Primitives';
import { PhdResearchTabs } from '../components/phdResearch/PhdResearchTabs';
import { getPhdTopicAreaById } from '../lib/phdTopicArea';
import {
  isValidMicroTargetTitle,
  overdueMicroTargets,
  upcomingMicroTargets,
  type MicroTarget,
  type MicroTargetPriority,
  type MicroTargetStatus,
} from '../lib/microTarget';

const PRIORITY_TONE: Record<MicroTargetPriority, 'neutral' | 'brand' | 'danger'> = { low: 'neutral', medium: 'brand', high: 'danger' };
type ViewFilter = 'today' | 'upcoming' | 'overdue' | 'completed' | 'topic_area' | 'timeline';

function TargetRow({
  target,
  topicAreaTitle,
  linkedContentTitle,
  onToggleStatus,
  onDelete,
}: {
  target: MicroTarget;
  topicAreaTitle: string | undefined;
  linkedContentTitle: string | undefined;
  onToggleStatus: (id: string, status: MicroTargetStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
      <button
        onClick={() => onToggleStatus(target.id, target.status === 'completed' ? 'pending' : 'completed')}
        className={cx(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
          target.status === 'completed' ? 'border-transparent bg-brand-500' : 'border-slate-300 dark:border-slate-600',
        )}
        aria-label={target.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
      >
        {target.status === 'completed' && <span className="text-[10px] font-bold text-white">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
        <span className={cx('text-sm', target.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300')}>{target.title}</span>
        {target.description && <p className="text-xs text-slate-400 mt-0.5">{target.description}</p>}
        {target.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{target.notes}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {topicAreaTitle && <Badge tone="neutral">{topicAreaTitle}</Badge>}
          {target.targetDate && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <CalendarClock className="h-3 w-3" /> {formatDate(target.targetDate)}
            </span>
          )}
          {target.estimatedMinutes !== undefined && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" /> {target.estimatedMinutes}m
            </span>
          )}
          <Badge tone={PRIORITY_TONE[target.priority]}>{target.priority}</Badge>
          {linkedContentTitle && (
            <Link to="/repository" className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline dark:text-brand-400">
              <ExternalLink className="h-3 w-3" /> {linkedContentTitle}
            </Link>
          )}
        </div>
      </div>
      {target.status !== 'completed' && (
        <button
          onClick={() => onToggleStatus(target.id, target.status === 'in_progress' ? 'pending' : 'in_progress')}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
        >
          {target.status === 'in_progress' ? 'In Progress' : 'Start'}
        </button>
      )}
      <button onClick={() => onDelete(target.id)} title="Delete target" className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-rose-500 dark:text-slate-600">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export default function PhdPlan() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const topicAreas = useAppStore((s) => s.phdTopicAreas);
  const microTargets = useAppStore((s) => s.phdMicroTargets);
  const addMicroTarget = useAppStore((s) => s.addPhdMicroTarget);
  const setMicroTargetStatus = useAppStore((s) => s.setPhdMicroTargetStatus);
  const deleteMicroTarget = useAppStore((s) => s.deletePhdMicroTarget);
  const importedContent = useAppStore((s) => s.importedContent);

  const today = useMemo(() => getLocalDateString(), []);

  // Defaults to 'timeline', not 'today' — unlike UPSC CSE study tasks (which always carry a real
  // date), a PhD research micro-target's targetDate is genuinely optional and often absent (many
  // research activities have no fixed deadline), so a 'today'-only default would make an entirely
  // real, just-created target appear to have vanished. Timeline shows every target regardless of
  // date (undated ones sort last), so it's the only view guaranteed to reflect the real data.
  const [view, setView] = useState<ViewFilter>('timeline');
  const [showAddTarget, setShowAddTarget] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [topicAreaId, setTopicAreaId] = useState('');
  const [linkedContentId, setLinkedContentId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [priority, setPriority] = useState<MicroTargetPriority>('medium');
  const [notes, setNotes] = useState('');

  function submitTarget() {
    if (!isValidMicroTargetTitle(title)) return;
    const minutes = estimatedMinutes.trim() ? Math.max(1, Math.round(Number(estimatedMinutes))) : undefined;
    addMicroTarget(
      {
        title,
        description: description || undefined,
        contextId: topicAreaId || undefined,
        targetDate: targetDate || undefined,
        estimatedMinutes: Number.isFinite(minutes) ? minutes : undefined,
        priority,
        notes: notes || undefined,
        linkedContentId: linkedContentId || undefined,
      },
      uuid(),
      new Date().toISOString(),
    );
    setTitle('');
    setDescription('');
    setTopicAreaId('');
    setLinkedContentId('');
    setTargetDate('');
    setEstimatedMinutes('');
    setNotes('');
    setPriority('medium');
    setShowAddTarget(false);
    // A target created with no target date (a real, common case — many research micro-targets
    // have no hard deadline) would otherwise vanish from the default 'today' view, which only
    // matches an exact date. Timeline shows every target regardless of date, so it's the one view
    // guaranteed to surface what was just added.
    if (!targetDate) setView('timeline');
  }

  const todayTargets = useMemo(() => microTargets.filter((t) => t.targetDate === today), [microTargets, today]);
  const overdue = useMemo(() => overdueMicroTargets(microTargets, today), [microTargets, today]);
  const upcoming = useMemo(() => upcomingMicroTargets(microTargets, today), [microTargets, today]);
  const completed = useMemo(() => microTargets.filter((t) => t.status === 'completed'), [microTargets]);

  const visibleTargets = useMemo(() => {
    if (view === 'today') return todayTargets;
    if (view === 'overdue') return overdue;
    if (view === 'upcoming') return upcoming;
    if (view === 'completed') return completed;
    if (view === 'timeline') return [...microTargets].sort((a, b) => (a.targetDate ?? '9999-99-99').localeCompare(b.targetDate ?? '9999-99-99'));
    return [];
  }, [view, todayTargets, overdue, upcoming, completed, microTargets]);

  const targetsByTopicArea = useMemo(() => {
    const map = new Map<string, MicroTarget[]>();
    for (const t of microTargets) {
      if (!t.contextId) continue;
      map.set(t.contextId, [...(map.get(t.contextId) ?? []), t]);
    }
    return map;
  }, [microTargets]);

  if (activeWorkspaceId !== 'phd_research') {
    return (
      <div>
        <PageHeader eyebrow="PhD Research" title="Research Plan" />
        <WorkspaceComingSoon icon={GraduationCap} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="PhD Research" title="Research Plan" description="Real research micro-targets, organised by date and Topic Area — never auto-generated activity." />
      <PhdResearchTabs />

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Research Micro-Targets</h3>
          </div>
          <Button size="sm" onClick={() => setShowAddTarget((v) => !v)}>
            <Plus className="h-4 w-4" /> Add Research Micro-target
          </Button>
        </div>

        {showAddTarget && (
          <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            {topicAreas.length === 0 && (
              <p className="text-xs text-slate-400">
                No Topic Areas yet —{' '}
                <Link to="/phd-dashboard" className="text-brand-600 hover:underline dark:text-brand-400">
                  create one on the Dashboard
                </Link>{' '}
                to link this target to one (optional).
              </p>
            )}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Target title (e.g. Read primary source on Permanent Settlement)…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select value={topicAreaId} onChange={(e) => setTopicAreaId(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm">
                <option value="">No Topic Area</option>
                {topicAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
              <select value={linkedContentId} onChange={(e) => setLinkedContentId(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm">
                <option value="">No linked material</option>
                {importedContent.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm" />
              <input
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="Minutes"
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
              />
              <select value={priority} onChange={(e) => setPriority(e.target.value as MicroTargetPriority)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
            />
            <Button size="sm" onClick={submitTarget} disabled={!isValidMicroTargetTitle(title)}>
              Add Micro-target
            </Button>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-1.5">
          {(['today', 'upcoming', 'overdue', 'completed', 'topic_area', 'timeline'] as ViewFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cx('rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', view === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}
            >
              {v === 'overdue' && <AlertTriangle className="mr-1 inline h-3 w-3" />}
              {v === 'completed' && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
              {v === 'topic_area' && <FolderKanban className="mr-1 inline h-3 w-3" />}
              {v.replace('_', ' ')}
            </button>
          ))}
        </div>

        {view === 'topic_area' ? (
          topicAreas.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No Topic Areas yet.</p>
          ) : (
            <div className="space-y-4">
              {topicAreas.map((area) => {
                const areaTargets = targetsByTopicArea.get(area.id) ?? [];
                return (
                  <div key={area.id}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {area.title} ({areaTargets.length})
                    </p>
                    {areaTargets.length === 0 ? (
                      <p className="py-2 text-sm text-slate-400">No micro-targets in this Topic Area yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {areaTargets.map((t) => (
                          <TargetRow
                            key={t.id}
                            target={t}
                            topicAreaTitle={undefined}
                            linkedContentTitle={t.linkedContentId ? importedContent.find((c) => c.id === t.linkedContentId)?.title : undefined}
                            onToggleStatus={setMicroTargetStatus}
                            onDelete={deleteMicroTarget}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : visibleTargets.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nothing here yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {visibleTargets.map((t) => (
              <TargetRow
                key={t.id}
                target={t}
                topicAreaTitle={t.contextId ? getPhdTopicAreaById(topicAreas, t.contextId)?.title : undefined}
                linkedContentTitle={t.linkedContentId ? importedContent.find((c) => c.id === t.linkedContentId)?.title : undefined}
                onToggleStatus={setMicroTargetStatus}
                onDelete={deleteMicroTarget}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
