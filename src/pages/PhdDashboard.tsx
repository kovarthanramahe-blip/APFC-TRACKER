import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  CalendarClock,
  Hourglass,
  FolderKanban,
  Target,
  Plus,
  Trash2,
  Pencil,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle2,
  History as HistoryIcon,
  FileText,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getLocalDateString, formatDate, cx, uuid } from '../lib/utils';
import { Card, Button, Badge, PageHeader, WorkspaceComingSoon } from '../components/ui/Primitives';
import { PhdResearchTabs } from '../components/phdResearch/PhdResearchTabs';
import { computePhdDashboardSnapshot } from '../lib/phdDashboard';
import { isValidTopicAreaTitle, searchPhdTopicAreas, getPhdTopicAreaById, type PhdTopicArea } from '../lib/phdTopicArea';
import { isValidMicroTargetTitle, type MicroTarget, type MicroTargetPriority } from '../lib/microTarget';

// PhD Research Dashboard — the research-start/duration overview plus Topic Area and micro-target
// management for the PhD Research workspace. Reuses the existing repository architecture for
// "Topic Area -> linked material" (a document/note links to a Topic Area via its own
// ImportedContentMetadata.topicAreaId — see lib/contentImport.ts) rather than a new relationship
// model, and lib/microTarget.ts's generic, reusable target model (also usable by future workspaces)
// for micro-targets — never a third, PhD-specific target implementation. Every number here is
// either a real elapsed-time calculation (lib/phdResearch.ts) or a direct count/list of real,
// user-created records; nothing is a fabricated progress percentage or synthetic activity feed.

const PRIORITY_TONE: Record<MicroTargetPriority, 'neutral' | 'brand' | 'danger'> = { low: 'neutral', medium: 'brand', high: 'danger' };

function TargetRow({
  target,
  topicAreaTitle,
  onToggleStatus,
  onDelete,
}: {
  target: MicroTarget;
  topicAreaTitle: string | undefined;
  onToggleStatus: (id: string, status: MicroTarget['status']) => void;
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
        <span className={cx('text-sm', target.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300')}>
          {target.title}
        </span>
        {target.description && <p className="text-xs text-slate-400 mt-0.5">{target.description}</p>}
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

export default function PhdDashboard() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const researchStartDate = useAppStore((s) => s.phdResearchStartDate);
  const topicAreas = useAppStore((s) => s.phdTopicAreas);
  const addTopicArea = useAppStore((s) => s.addPhdTopicArea);
  const updateTopicArea = useAppStore((s) => s.updatePhdTopicArea);
  const deleteTopicArea = useAppStore((s) => s.deletePhdTopicArea);
  const microTargets = useAppStore((s) => s.phdMicroTargets);
  const addMicroTarget = useAppStore((s) => s.addPhdMicroTarget);
  const setMicroTargetStatus = useAppStore((s) => s.setPhdMicroTargetStatus);
  const deleteMicroTarget = useAppStore((s) => s.deletePhdMicroTarget);
  const importedContent = useAppStore((s) => s.importedContent);

  const today = useMemo(() => getLocalDateString(), []);

  const snapshot = useMemo(
    () => computePhdDashboardSnapshot({ researchStartDate, topicAreas, microTargets, importedContent, today }),
    [researchStartDate, topicAreas, microTargets, importedContent, today],
  );

  // Topic Areas
  const [areaQuery, setAreaQuery] = useState('');
  const [areaTitle, setAreaTitle] = useState('');
  const [areaDescription, setAreaDescription] = useState('');
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editAreaTitle, setEditAreaTitle] = useState('');
  const [editAreaDescription, setEditAreaDescription] = useState('');
  const visibleAreas = useMemo(() => searchPhdTopicAreas(topicAreas, areaQuery), [topicAreas, areaQuery]);

  function submitNewArea() {
    if (!isValidTopicAreaTitle(areaTitle)) return;
    const now = new Date().toISOString();
    addTopicArea({ id: uuid(), title: areaTitle.trim(), description: areaDescription.trim() || undefined, createdAt: now, updatedAt: now });
    setAreaTitle('');
    setAreaDescription('');
  }

  function startEditArea(area: PhdTopicArea) {
    setEditingAreaId(area.id);
    setEditAreaTitle(area.title);
    setEditAreaDescription(area.description ?? '');
  }

  function saveEditArea() {
    if (!editingAreaId || !isValidTopicAreaTitle(editAreaTitle)) return;
    updateTopicArea(editingAreaId, { title: editAreaTitle, description: editAreaDescription });
    setEditingAreaId(null);
  }

  // Micro-targets
  const [targetTitle, setTargetTitle] = useState('');
  const [targetDescription, setTargetDescription] = useState('');
  const [targetTopicAreaId, setTargetTopicAreaId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [targetMinutes, setTargetMinutes] = useState('');
  const [targetPriority, setTargetPriority] = useState<MicroTargetPriority>('medium');

  function submitNewTarget() {
    if (!isValidMicroTargetTitle(targetTitle)) return;
    const minutes = targetMinutes.trim() ? Math.max(1, Math.round(Number(targetMinutes))) : undefined;
    addMicroTarget(
      {
        title: targetTitle,
        description: targetDescription || undefined,
        contextId: targetTopicAreaId || undefined,
        targetDate: targetDate || undefined,
        estimatedMinutes: Number.isFinite(minutes) ? minutes : undefined,
        priority: targetPriority,
      },
      uuid(),
      new Date().toISOString(),
    );
    setTargetTitle('');
    setTargetDescription('');
    setTargetDate('');
    setTargetMinutes('');
    setTargetPriority('medium');
  }

  if (activeWorkspaceId !== 'phd_research') {
    return (
      <div>
        <PageHeader eyebrow="PhD Research" title="Dashboard" />
        <WorkspaceComingSoon icon={GraduationCap} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  const overdueIds = new Set(snapshot.overdueTargets.map((t) => t.id));

  return (
    <div>
      <PageHeader eyebrow="PhD Research" title="Dashboard" description="Your research timeline, Topic Areas, and micro-targets — all in one place." />
      <PhdResearchTabs />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Research Started</p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-lg font-bold text-slate-900 dark:text-white">
            <CalendarClock className="h-4 w-4 text-brand-500" /> {formatDate(researchStartDate)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Research Duration</p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-lg font-bold text-slate-900 dark:text-white">
            <Hourglass className="h-4 w-4 text-brand-500" />
            {snapshot.duration.years}y {snapshot.duration.months}m {snapshot.duration.days}d
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Topic Areas</p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-lg font-bold text-slate-900 dark:text-white">
            <FolderKanban className="h-4 w-4 text-brand-500" /> {snapshot.topicAreaCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Active Targets</p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-lg font-bold text-slate-900 dark:text-white">
            <Target className="h-4 w-4 text-brand-500" /> {snapshot.activeTargets.length}
          </p>
          {snapshot.overdueTargets.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-500">
              <AlertTriangle className="h-3 w-3" /> {snapshot.overdueTargets.length} overdue
            </p>
          )}
        </Card>
      </div>

      {/* Topic Areas */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Topic Areas</h3>
        </div>

        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            submitNewArea();
          }}
        >
          <input
            value={areaTitle}
            onChange={(e) => setAreaTitle(e.target.value)}
            placeholder="New Topic Area title…"
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <input
            value={areaDescription}
            onChange={(e) => setAreaDescription(e.target.value)}
            placeholder="Optional description…"
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <Button type="submit" disabled={!isValidTopicAreaTitle(areaTitle)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>

        {topicAreas.length > 0 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={areaQuery}
              onChange={(e) => setAreaQuery(e.target.value)}
              placeholder="Search Topic Areas…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        )}

        {topicAreas.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No Topic Areas yet — create one above to start organising your research documents, notes and bibliography.
          </p>
        ) : visibleAreas.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No Topic Areas match "{areaQuery}".</p>
        ) : (
          <ul className="space-y-1.5">
            {visibleAreas.map((area) => {
              const linkedCount = importedContent.filter((c) => c.metadata?.topicAreaId === area.id).length;
              return (
                <li key={area.id} className="rounded-lg px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                  {editingAreaId === area.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={editAreaTitle}
                        onChange={(e) => setEditAreaTitle(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-1.5 text-sm"
                      />
                      <input
                        value={editAreaDescription}
                        onChange={(e) => setEditAreaDescription(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-1.5 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEditArea} disabled={!isValidTopicAreaTitle(editAreaTitle)}>
                          Save
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingAreaId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{area.title}</p>
                        {area.description && <p className="text-xs text-slate-400 mt-0.5">{area.description}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {linkedCount} linked item{linkedCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button onClick={() => startEditArea(area)} title="Edit" className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-brand-500 dark:text-slate-600">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteTopicArea(area.id)}
                        title="Delete Topic Area"
                        className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-rose-500 dark:text-slate-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Micro-targets */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Micro-Targets</h3>
        </div>

        <form
          className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitNewTarget();
          }}
        >
          <input
            value={targetTitle}
            onChange={(e) => setTargetTitle(e.target.value)}
            placeholder="Target title (e.g. Draft literature review section)…"
            className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <input
            value={targetDescription}
            onChange={(e) => setTargetDescription(e.target.value)}
            placeholder="Optional description…"
            className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <select
            value={targetTopicAreaId}
            onChange={(e) => setTargetTopicAreaId(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <option value="">No Topic Area</option>
            {topicAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <select
            value={targetPriority}
            onChange={(e) => setTargetPriority(e.target.value as MicroTargetPriority)}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <input
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            type="date"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <input
            value={targetMinutes}
            onChange={(e) => setTargetMinutes(e.target.value)}
            type="number"
            min={1}
            placeholder="Estimated minutes (optional)"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <Button type="submit" disabled={!isValidMicroTargetTitle(targetTitle)} className="sm:col-span-2">
            <Plus className="h-4 w-4" /> Add Micro-Target
          </Button>
        </form>

        {microTargets.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No micro-targets yet — add one above (e.g. "Read source X", "Draft chapter 2 intro").</p>
        ) : (
          <div className="space-y-5">
            {snapshot.overdueTargets.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-500">
                  <AlertTriangle className="h-3.5 w-3.5" /> Overdue
                </p>
                <ul className="space-y-1.5">
                  {snapshot.overdueTargets.map((t) => (
                    <TargetRow
                      key={t.id}
                      target={t}
                      topicAreaTitle={t.contextId ? getPhdTopicAreaById(topicAreas, t.contextId)?.title : undefined}
                      onToggleStatus={setMicroTargetStatus}
                      onDelete={deleteMicroTarget}
                    />
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Active {snapshot.activeTargets.length > 0 && `(${snapshot.activeTargets.length})`}
              </p>
              {snapshot.activeTargets.filter((t) => !overdueIds.has(t.id)).length === 0 ? (
                <p className="py-2 text-sm text-slate-400">Nothing active right now.</p>
              ) : (
                <ul className="space-y-1.5">
                  {snapshot.activeTargets
                    .filter((t) => !overdueIds.has(t.id))
                    .map((t) => (
                      <TargetRow
                        key={t.id}
                        target={t}
                        topicAreaTitle={t.contextId ? getPhdTopicAreaById(topicAreas, t.contextId)?.title : undefined}
                        onToggleStatus={setMicroTargetStatus}
                        onDelete={deleteMicroTarget}
                      />
                    ))}
                </ul>
              )}
            </div>

            {snapshot.recentlyCompletedTargets.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Recently Completed
                </p>
                <ul className="space-y-1.5">
                  {snapshot.recentlyCompletedTargets.map((t) => (
                    <TargetRow
                      key={t.id}
                      target={t}
                      topicAreaTitle={t.contextId ? getPhdTopicAreaById(topicAreas, t.contextId)?.title : undefined}
                      onToggleStatus={setMicroTargetStatus}
                      onDelete={deleteMicroTarget}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Recent Activity */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Recent Activity</h3>
        </div>
        {snapshot.recentlyImportedContent.length === 0 && snapshot.recentlyCompletedTargets.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No research activity recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.recentlyImportedContent.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <Link to={c.contentType === 'bibliography' ? '/phd-research/bibliography' : '/phd-research'} className="truncate hover:underline">
                  {c.title}
                </Link>
                <span className="ml-auto shrink-0 text-[11px] text-slate-400">{formatDate(c.provenance.importedAt.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
