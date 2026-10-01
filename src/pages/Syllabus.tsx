import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, RotateCcw, Search, NotebookPen, AlertTriangle, ListChecks } from 'lucide-react';
import { PYQ_BANK } from '../data/pyq';
import { getSyllabusForWorkspace } from '../data/registry';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import { computePyqPerformance } from '../lib/pyqPerformance';
import { computeUnifiedTopicStatus } from '../lib/topicStatus';
import { countNotesByTopic } from '../lib/noteOrganization';
import { SUBJECT_COLORS, cx } from '../lib/utils';
import { Card, ProgressBar, Button, PageHeader, WorkspaceComingSoon } from '../components/ui/Primitives';

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
  const needsRevisionTopicIds = useMemo(() => {
    const pyqPerf = computePyqPerformance(PYQ_BANK, pyqAttempts);
    const statuses = computeUnifiedTopicStatus(syllabus, completedTopics, pyqPerf);
    return new Set(statuses.filter((t) => t.status === 'needs_revision').map((t) => t.topicId));
  }, [syllabus, completedTopics, pyqAttempts]);

  // Deep-link support: "Study this topic" from a PYQ review arrives as /syllabus?topicId=...
  const [searchParams] = useSearchParams();
  const deepLinkTopicId = searchParams.get('topicId');
  const deepLinkSubjectId = useMemo(
    () => (deepLinkTopicId ? syllabus.find((s) => s.topics.some((t) => t.id === deepLinkTopicId))?.id : undefined),
    [syllabus, deepLinkTopicId],
  );

  const [openIds, setOpenIds] = useState<string[]>(() => (deepLinkSubjectId ? [deepLinkSubjectId] : syllabus[0] ? [syllabus[0].id] : []));
  const [query, setQuery] = useState('');
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
    if (!query.trim()) return syllabus;
    const q = query.toLowerCase();
    return syllabus
      .map((subj) => ({
        ...subj,
        topics: subj.topics.filter((t) => t.title.toLowerCase().includes(q) || subj.title.toLowerCase().includes(q)),
      }))
      .filter((subj) => subj.topics.length > 0);
  }, [syllabus, query]);

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
              <RadialProgress pct={overallPct} strokeClassName={accent.solidText} />
            </div>
          </div>
        }
      />

      <div className="mb-5 relative">
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
                                <span
                                  title="Covered, but recent PYQ accuracy on this topic is weak — worth revising"
                                  className="shrink-0 rounded-lg p-2 text-amber-500 dark:text-amber-400"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </span>
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
          <div className="py-16 text-center text-sm text-slate-400">No topics match "{query}".</div>
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

function RadialProgress({ pct, strokeClassName }: { pct: number; strokeClassName: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-slate-800" />
      <motion.circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className={strokeClassName}
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </svg>
  );
}
