import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, RotateCcw, Search, NotebookPen, AlertTriangle, ListChecks, Target, CheckCircle2, CircleDashed, Trophy } from 'lucide-react';
import { PYQ_BANK } from '../data/pyq';
import { getSyllabusForWorkspace } from '../data/registry';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import { computePyqPerformance } from '../lib/pyqPerformance';
import { computeUnifiedTopicStatus, MIN_PYQ_ATTEMPTS_FOR_SIGNAL, WEAK_PYQ_ACCURACY_THRESHOLD } from '../lib/topicStatus';
import { computeSyllabusOverview } from '../lib/syllabusOS';
import { getTopicCounts } from '../lib/pyqFilters';
import { countNotesByTopic } from '../lib/noteOrganization';
import { SUBJECT_COLORS, cx } from '../lib/utils';
import { Card, ProgressBar, Button, Badge, StatCard, PageHeader, WorkspaceComingSoon, ProgressRing } from '../components/ui/Primitives';

// Multi-Workspace OS, Stage 3B-1 — per-workspace copy for the parts of the page that used to
// hardcode APFC's own wording. Structural/behavioural logic below stays workspace-generic
// (reading through `syllabus`, the resolved array), so this is the only place new workspace copy
// needs to be added when a future workspace's syllabus goes live.
const PAGE_COPY: Record<string, { eyebrow: string; description: string }> = {
  apfc: {
    eyebrow: 'Phase I · Recruitment Test',
    description: 'Official UPSC EPFO APFC syllabus broken into trackable topics — check off what you\'ve covered.',
  },
  upsc_cse: {
    eyebrow: 'Prelims & Mains',
    description: 'UPSC Civil Services Examination syllabus broken into trackable topics — check off what you\'ve covered.',
  },
};

export default function Syllabus() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  // Phase 6 — this page is shared between APFC and UPSC CSE (see PAGE_COPY above), so its accent
  // colour must come from the same per-workspace token every other shared surface reads
  // (lib/workspaceAccent.ts) rather than a hard-coded "brand" blue that was only ever correct for
  // one of the two workspaces that render this component.
  const accent = getWorkspaceAccent(activeWorkspaceId);
  const completedTopics = useAppStore((s) => s.completedTopics);
  const notes = useAppStore((s) => s.notes);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const toggleTopic = useAppStore((s) => s.toggleTopic);
  const markSubjectTopics = useAppStore((s) => s.markSubjectTopics);

  // Multi-Workspace OS, Stage 3B-1 — the ONE line that decides which syllabus this page shows;
  // everything else below reads `syllabus`, never a specific workspace's data file directly.
  const syllabus = useMemo(() => getSyllabusForWorkspace(activeWorkspaceId), [activeWorkspaceId]);

  // Same unified topic-status source of truth as Dashboard/Analytics (lib/topicStatus) — a topic
  // covered here but flagged elsewhere as weak from real PYQ performance must show that here too,
  // otherwise the checkmark alone would misleadingly read as "done". PYQ_BANK only ever contains
  // APFC questions, so for a workspace with no PYQ practice yet (pyqAttempts always []) this
  // naturally degrades to "no PYQ signal" for every topic — never a special case to handle here.
  const topicStatusById = useMemo(() => {
    const pyqPerf = computePyqPerformance(PYQ_BANK, pyqAttempts);
    const statuses = computeUnifiedTopicStatus(syllabus, completedTopics, pyqPerf);
    return new Map(statuses.map((t) => [t.topicId, t]));
  }, [syllabus, completedTopics, pyqAttempts]);
  const needsRevisionTopicIds = useMemo(
    () => new Set([...topicStatusById.values()].filter((t) => t.status === 'needs_revision').map((t) => t.topicId)),
    [topicStatusById],
  );

  // Phase 18 — Syllabus OS: a thin, pure read of the SAME topicStatusById this page already
  // computes (see lib/syllabusOS.ts's own header) for the overview row below. Not a second
  // source of truth — overview.completedCount/weakCount are always consistent with doneTopics/
  // needsRevisionTopicIds above since both derive from the same computeUnifiedTopicStatus() call.
  const overview = useMemo(() => computeSyllabusOverview([...topicStatusById.values()]), [topicStatusById]);

  // Phase 6 — Competitive Exam Intelligence: how many PYQs exist in the bank for each topic
  // (historical coverage, independent of whether the user has attempted any of them) — reuses
  // lib/pyqFilters.ts's existing getTopicCounts verbatim (the same aggregation PYQTest.tsx's own
  // topic filter chips already use), never a second PYQ-counting pass.
  const pyqCountByTopic = useMemo(() => {
    const counts = getTopicCounts(PYQ_BANK, 'all', 'all');
    return new Map(counts.map((c) => [c.id, c.count]));
  }, []);

  // Deep-link support: "Study this topic" from a PYQ review arrives as /syllabus?topicId=...
  const [searchParams] = useSearchParams();
  const deepLinkTopicId = searchParams.get('topicId');
  const deepLinkSubjectId = useMemo(
    () => (deepLinkTopicId ? syllabus.find((s) => s.topics.some((t) => t.id === deepLinkTopicId))?.id : undefined),
    [syllabus, deepLinkTopicId],
  );

  const [openIds, setOpenIds] = useState<string[]>(() => (deepLinkSubjectId ? [deepLinkSubjectId] : syllabus[0] ? [syllabus[0].id] : []));
  const [query, setQuery] = useState('');
  // Phase 18 — Syllabus OS: a lightweight toggle over the SAME needsRevisionTopicIds set already
  // computed above, never a new weakness rule. Auto-expands every subject with a weak topic so
  // turning the toggle on doesn't leave the user staring at a wall of collapsed accordions.
  const [weakOnly, setWeakOnly] = useState(false);
  const highlightedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!deepLinkSubjectId) return;
    setOpenIds((prev) => (prev.includes(deepLinkSubjectId) ? prev : [...prev, deepLinkSubjectId]));
    // Give the accordion's open animation a moment before scrolling to the topic.
    const t = setTimeout(() => highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkSubjectId, deepLinkTopicId]);

  const totalTopics = syllabus.reduce((sum, s) => sum + s.topics.length, 0);
  const doneTopics = Object.values(completedTopics).filter(Boolean).length;
  const overallPct = totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return syllabus
      .map((subj) => ({
        ...subj,
        topics: subj.topics.filter((t) => {
          if (weakOnly && !needsRevisionTopicIds.has(t.id)) return false;
          if (!q) return true;
          return t.title.toLowerCase().includes(q) || subj.title.toLowerCase().includes(q);
        }),
      }))
      .filter((subj) => subj.topics.length > 0);
  }, [syllabus, query, weakOnly, needsRevisionTopicIds]);

  // Weak-only mode auto-expands every subject that has a surviving weak topic, otherwise the
  // accordion stays collapsed and the toggle appears to do nothing.
  useEffect(() => {
    if (!weakOnly) return;
    setOpenIds((prev) => {
      const weakSubjectIds = filtered.map((s) => s.id);
      const merged = new Set(prev);
      for (const id of weakSubjectIds) merged.add(id);
      return [...merged];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weakOnly]);

  // Multi-Workspace OS, Stage 3B-1 — a workspace's own syllabus (not just "is it apfc") decides
  // whether this page has real content to show. Today only 'apfc' and 'upsc_cse' resolve to a
  // non-empty syllabus (see data/registry.ts); 'phd_research' (and any future workspace without a
  // syllabus yet) correctly falls back to the same coming-soon empty state Stage 3A introduced.
  if (syllabus.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Syllabus" title="Syllabus Tracker" />
        <WorkspaceComingSoon icon={ListChecks} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  const copy = PAGE_COPY[activeWorkspaceId] ?? PAGE_COPY.apfc;

  return (
    <div>
      <PageHeader
        eyebrow={copy.eyebrow}
        title="Syllabus Tracker"
        description={copy.description}
        action={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-display text-xl font-bold text-slate-900 dark:text-white">{overallPct}%</p>
              <p className="text-xs text-slate-400">
                {doneTopics}/{totalTopics} topics
              </p>
            </div>
            <div className="h-10 w-10">
              <ProgressRing
                value={overallPct}
                radius={16}
                strokeWidth={4}
                colorClassName={accent.solidText}
                animateFromZero
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-10 w-10"
              />
            </div>
          </div>
        }
      />

      {/* lg: not sm: — same tablet-width StatCard label-wrapping lesson as CommandCentre.tsx's own
          grids (see that file's own comment): at ~800px viewport this page's real column width
          (minus the sidebar) is still too narrow at the 640px sm: breakpoint for 4 StatCards with
          longer labels like "COMPLETED"/"REMAINING" without wrapping. */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Completed" value={`${overview.completedCount}`} accentClassName="text-success-600 dark:text-success-400" />
        <StatCard icon={CircleDashed} label="Remaining" value={`${overview.remainingCount}`} accentClassName="text-slate-500 dark:text-slate-400" />
        {overview.weakCount > 0 ? (
          // Syllabus <-> Revision OS integration (Phase 18): a weak area here means a topic the
          // Leitner engine already schedules for revision (lib/pyqFilters's "ever answered
          // incorrectly" eligibility) — a real, already-derivable link, not an invented one. Clicking
          // goes straight to Revision OS rather than duplicating its interface here.
          <Link to="/revision" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-2xl" title="Open Revision OS">
            <StatCard icon={AlertTriangle} label="Weak areas" value={`${overview.weakCount}`} accentClassName="text-danger-600 dark:text-danger-400" className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60" />
          </Link>
        ) : (
          <StatCard icon={AlertTriangle} label="Weak areas" value="0" accentClassName="text-danger-600 dark:text-danger-400" />
        )}
        <StatCard icon={Trophy} label="Overall" value={`${overview.completionPct}%`} accentClassName={accent.solidText} />
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics or subjects…"
            className={cx(
              'w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2',
              accent.focusRing,
            )}
          />
        </div>
        <button
          onClick={() => setWeakOnly((prev) => !prev)}
          aria-pressed={weakOnly}
          disabled={overview.weakCount === 0}
          className={cx(
            'flex shrink-0 items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            weakOnly
              ? 'border-danger-300 bg-danger-50 text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60',
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          Weak areas only
          {overview.weakCount > 0 && <Badge tone={weakOnly ? 'danger' : 'neutral'}>{overview.weakCount}</Badge>}
        </button>
      </div>

      <div className="space-y-3">
        {filtered.map((subj) => {
          const isOpen = openIds.includes(subj.id);
          const done = subj.topics.filter((t) => completedTopics[t.id]).length;
          const total = subj.topics.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const colors = SUBJECT_COLORS[subj.colorKey];

          return (
            <Card key={subj.id} className="overflow-hidden">
              <button
                className={cx('flex w-full items-center gap-4 px-4 py-4 sm:px-5 text-left focus:outline-none focus-visible:ring-2', accent.focusRing)}
                onClick={() => setOpenIds((prev) => (prev.includes(subj.id) ? prev.filter((i) => i !== subj.id) : [...prev, subj.id]))}
                aria-expanded={isOpen}
              >
                <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold', colors.bg, colors.text)}>
                  {pct}%
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{subj.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{subj.weightageHint}</p>
                  <div className="mt-2 max-w-xs">
                    <ProgressBar value={pct} colorClassName={colors.dot} height="h-1.5" />
                  </div>
                </div>
                <span className="hidden sm:block text-xs text-slate-400 shrink-0">
                  {done}/{total}
                </span>
                <ChevronDown className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-slate-200/70 dark:border-slate-800 px-4 sm:px-5 py-3">
                      <div className="mb-2 flex justify-end gap-2">
                        <button
                          className={cx('text-xs font-medium hover:underline', accent.text)}
                          onClick={() => markSubjectTopics(subj.topics.map((t) => t.id), true)}
                        >
                          Mark all done
                        </button>
                        <button
                          className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          onClick={() => markSubjectTopics(subj.topics.map((t) => t.id), false)}
                        >
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                      </div>
                      <ul className="space-y-1">
                        {subj.topics.map((topic) => {
                          const checked = !!completedTopics[topic.id];
                          const isDeepLinked = topic.id === deepLinkTopicId;
                          const noteCount = countNotesByTopic(notes, topic.id);
                          const pyqCount = pyqCountByTopic.get(topic.id) ?? 0;
                          const status = topicStatusById.get(topic.id);
                          const hasPerformanceSignal = !!status && status.pyqAttempted >= MIN_PYQ_ATTEMPTS_FOR_SIGNAL && status.pyqAccuracy !== null;
                          return (
                            <li
                              key={topic.id}
                              ref={isDeepLinked ? highlightedRef : undefined}
                              className={cx('flex items-center gap-1 rounded-lg transition-colors', isDeepLinked && cx('ring-2', accent.ring))}
                            >
                              <button
                                onClick={() => toggleTopic(topic.id)}
                                className="flex flex-1 min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                              >
                                <span
                                  className={cx(
                                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                                    checked ? cx(colors.dot, 'border-transparent') : 'border-slate-300 dark:border-slate-600',
                                  )}
                                >
                                  {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                                </span>
                                <span className={cx('text-sm truncate', checked ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300')}>
                                  {topic.title}
                                </span>
                              </button>
                              {needsRevisionTopicIds.has(topic.id) && (
                                <span title="Covered, but recent PYQ accuracy on this topic is weak — worth revising" className="shrink-0">
                                  <Badge tone="danger" className="flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Weak
                                  </Badge>
                                </span>
                              )}
                              {/* Phase 6 — Competitive Exam Intelligence: PYQ coverage + performance for
                                  this topic, surfacing lib/pyqFilters.ts's getTopicCounts and
                                  lib/topicStatus.ts's already-computed pyqAttempted/pyqAccuracy (item
                                  #1/#2 of the Phase 6 spec) rather than inventing a new aggregation —
                                  only shown when the bank genuinely has questions for this topic, and
                                  the accuracy badge only once there is enough real attempt data to mean
                                  anything (same MIN_PYQ_ATTEMPTS_FOR_SIGNAL threshold the needs_revision
                                  warning above already uses). Phase 18 — rendered via the shared Badge
                                  primitive (Phase 15 success/warning tokens) instead of raw emerald/
                                  amber classes, so colour is never the only signal (the % text and the
                                  "Weak" badge above both carry it too). */}
                              {hasPerformanceSignal && status && (
                                <span title={`${status.pyqAttempted} PYQ${status.pyqAttempted === 1 ? '' : 's'} attempted, ${status.pyqAccuracy!.toFixed(0)}% accuracy`} className="shrink-0">
                                  <Badge tone={status.pyqAccuracy! >= WEAK_PYQ_ACCURACY_THRESHOLD ? 'success' : 'warning'} className="tabular-nums">
                                    {status.pyqAccuracy!.toFixed(0)}%
                                  </Badge>
                                </span>
                              )}
                              {pyqCount > 0 && (
                                <Link
                                  to={`/pyq-test?topicId=${encodeURIComponent(topic.id)}`}
                                  title={`${pyqCount} PYQ${pyqCount === 1 ? '' : 's'} for this topic — practice`}
                                  className={cx('shrink-0 flex items-center gap-1 rounded-lg p-2 text-xs font-medium', accent.text)}
                                >
                                  <Target className="h-4 w-4" />
                                  {pyqCount}
                                </Link>
                              )}
                              <Link
                                to={`/notes?topicId=${encodeURIComponent(topic.id)}`}
                                title={noteCount > 0 ? `${noteCount} note${noteCount === 1 ? '' : 's'} for this topic` : 'Notes for this topic'}
                                className={cx(
                                  'shrink-0 flex items-center gap-1 rounded-lg p-2 text-slate-300 dark:text-slate-600',
                                  noteCount > 0 ? cx('text-xs font-medium', accent.text) : accent.hoverText,
                                )}
                              >
                                <NotebookPen className="h-4 w-4" />
                                {noteCount > 0 && noteCount}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
            {weakOnly && !query.trim() ? 'No weak areas right now — nice work.' : `No topics match "${query}".`}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm('Reset all syllabus progress?')) {
              markSubjectTopics(
                syllabus.flatMap((s) => s.topics.map((t) => t.id)),
                false,
              );
            }
          }}
        >
          <RotateCcw className="h-4 w-4" /> Reset entire syllabus progress
        </Button>
      </div>
    </div>
  );
}

