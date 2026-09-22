import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ListTree, Search } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { Card, ProgressBar, PageHeader } from '../components/ui/Primitives';
import { cx } from '../lib/utils';
import {
  getPapersForStage,
  getSubjectsForPaper,
  getMicrosyllabusForSubject,
  resolveMicrosyllabusPath,
  type UpscCseExamStage,
  type UpscCseSyllabusTree,
  type UpscCseSyllabusPaper,
  type UpscCseSyllabusSubject,
  type UpscCseMicrosyllabusItem,
} from '../lib/upscCseSyllabus';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import {
  UPSC_CSE_COVERAGE_STATES,
  UPSC_CSE_COVERAGE_LABELS,
  getCoverageState,
  computeCoverageSummary,
  type UpscCseCoverageState,
  type UpscCseSyllabusCoverage,
} from '../lib/upscCseSyllabusCoverage';
import { filterMicrosyllabusBySubject, subjectHasMicrosyllabusMatch } from '../lib/upscCseSyllabusSearch';

// UPSC CSE Syllabus UI — a dedicated page for the 4-level stage -> paper -> subject -> microsyllabus
// hierarchy (lib/upscCseSyllabus.ts, data/upscCsePrelimsSyllabus.ts, data/upscCseMainsSyllabus.ts).
// Deliberately NOT built into pages/Syllabus.tsx: that page's data model (SyllabusSubject ->
// SyllabusTopic, a flat 2-level shape with boolean completedTopics) can't host a 4-level tree
// without a redesign, and this task's own instructions rule that out. This page reads the new tree
// directly and writes coverage via its own dedicated store field (upscCseSyllabusCoverage) — nothing
// here touches completedTopics, PYQ_BANK, or any APFC data.

const STAGE_TABS: { stage: UpscCseExamStage; label: string; tree: UpscCseSyllabusTree }[] = [
  { stage: 'prelims', label: 'Prelims', tree: UPSC_CSE_PRELIMS_SYLLABUS },
  { stage: 'mains', label: 'Mains', tree: UPSC_CSE_MAINS_SYLLABUS },
];

const COVERAGE_DOT_CLASS: Record<UpscCseCoverageState, string> = {
  not_started: 'bg-slate-300 dark:bg-slate-600',
  learning: 'bg-amber-500',
  revised: 'bg-brand-500',
  strong: 'bg-emerald-500',
};

const COVERAGE_PROGRESS_CLASS: Record<'low' | 'mid' | 'high', string> = {
  low: 'bg-slate-400 dark:bg-slate-600',
  mid: 'bg-amber-500',
  high: 'bg-emerald-500',
};

function progressToneClass(pct: number): string {
  if (pct >= 90) return COVERAGE_PROGRESS_CLASS.high;
  if (pct >= 34) return COVERAGE_PROGRESS_CLASS.mid;
  return COVERAGE_PROGRESS_CLASS.low;
}

function CoverageStatePicker({
  value,
  onChange,
}: {
  value: UpscCseCoverageState;
  onChange: (next: UpscCseCoverageState) => void;
}) {
  return (
    <div className="flex items-center rounded-full bg-slate-100 dark:bg-slate-800 p-1 gap-0.5 shrink-0" role="radiogroup" aria-label="Coverage state">
      {UPSC_CSE_COVERAGE_STATES.map((state) => {
        const isActive = value === state;
        return (
          <button
            key={state}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={UPSC_CSE_COVERAGE_LABELS[state]}
            aria-label={UPSC_CSE_COVERAGE_LABELS[state]}
            onClick={() => onChange(state)}
            className={cx(
              'relative flex h-6 w-6 items-center justify-center rounded-full transition-colors',
              isActive ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : 'opacity-50 hover:opacity-80',
              isActive && (state === 'not_started' ? 'ring-slate-400' : state === 'learning' ? 'ring-amber-400' : state === 'revised' ? 'ring-brand-400' : 'ring-emerald-400'),
            )}
          >
            <span className={cx('h-3 w-3 rounded-full', COVERAGE_DOT_CLASS[state])} />
          </button>
        );
      })}
    </div>
  );
}

function MicrosyllabusRow({
  item,
  paper,
  subject,
  coverage,
  onSetCoverage,
  isDeepLinked,
  deepLinkRef,
}: {
  item: UpscCseMicrosyllabusItem;
  paper: UpscCseSyllabusPaper;
  subject: UpscCseSyllabusSubject;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (microsyllabusId: string, state: UpscCseCoverageState) => void;
  isDeepLinked?: boolean;
  deepLinkRef?: React.Ref<HTMLLIElement>;
}) {
  const state = getCoverageState(coverage, item.id);
  return (
    <li
      ref={isDeepLinked ? deepLinkRef : undefined}
      className={cx(
        'flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors',
        isDeepLinked && 'ring-2 ring-brand-400 dark:ring-brand-500/60',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {paper.shortTitle} › {subject.title}
        </p>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.title}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{item.description}</p>
      </div>
      <CoverageStatePicker value={state} onChange={(next) => onSetCoverage(item.id, next)} />
    </li>
  );
}

function SubjectSection({
  tree,
  paper,
  subject,
  coverage,
  onSetCoverage,
  isOpen,
  onToggle,
  query,
  deepLinkMicrosyllabusId,
  deepLinkRef,
}: {
  tree: UpscCseSyllabusTree;
  paper: UpscCseSyllabusPaper;
  subject: UpscCseSyllabusSubject;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (microsyllabusId: string, state: UpscCseCoverageState) => void;
  isOpen: boolean;
  onToggle: () => void;
  query: string;
  deepLinkMicrosyllabusId?: string;
  deepLinkRef?: React.Ref<HTMLLIElement>;
}) {
  const allItems = useMemo(() => getMicrosyllabusForSubject(tree, subject.id), [tree, subject.id]);
  const items = useMemo(() => filterMicrosyllabusBySubject(tree, subject.id, query), [tree, subject.id, query]);
  const summary = useMemo(() => computeCoverageSummary(allItems.map((m) => m.id), coverage), [allItems, coverage]);
  const containsDeepLink = !!deepLinkMicrosyllabusId && allItems.some((m) => m.id === deepLinkMicrosyllabusId);

  if (query.trim() && items.length === 0) return null;
  const expanded = isOpen || !!query.trim() || containsDeepLink;

  return (
    <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-hidden">
      <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={onToggle}>
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white', progressToneClass(summary.weightedPct))}>
          {summary.weightedPct}%
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{subject.title}</p>
          <div className="mt-1 max-w-[10rem]">
            <ProgressBar value={summary.weightedPct} colorClassName={progressToneClass(summary.weightedPct)} height="h-1" />
          </div>
        </div>
        <span className="hidden sm:block text-xs text-slate-400 shrink-0">{summary.counts.strong}/{summary.total} strong</span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <ul className="border-t border-slate-200/70 dark:border-slate-800 px-2 py-1.5 space-y-0.5">
              {items.map((item) => (
                <MicrosyllabusRow
                  key={item.id}
                  item={item}
                  paper={paper}
                  subject={subject}
                  coverage={coverage}
                  onSetCoverage={onSetCoverage}
                  isDeepLinked={item.id === deepLinkMicrosyllabusId}
                  deepLinkRef={item.id === deepLinkMicrosyllabusId ? deepLinkRef : undefined}
                />
              ))}
              {items.length === 0 && <li className="py-3 text-center text-xs text-slate-400">No microsyllabus items match "{query}".</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaperSection({
  tree,
  paper,
  coverage,
  onSetCoverage,
  query,
  deepLinkMicrosyllabusId,
  deepLinkRef,
}: {
  tree: UpscCseSyllabusTree;
  paper: UpscCseSyllabusPaper;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (microsyllabusId: string, state: UpscCseCoverageState) => void;
  query: string;
  deepLinkMicrosyllabusId?: string;
  deepLinkRef?: React.Ref<HTMLLIElement>;
}) {
  const subjects = useMemo(() => getSubjectsForPaper(tree, paper.id), [tree, paper.id]);
  const microsyllabusIds = useMemo(() => tree.microsyllabus.filter((m) => m.paperId === paper.id).map((m) => m.id), [tree, paper.id]);
  const summary = useMemo(() => computeCoverageSummary(microsyllabusIds, coverage), [microsyllabusIds, coverage]);
  const containsDeepLink = !!deepLinkMicrosyllabusId && microsyllabusIds.includes(deepLinkMicrosyllabusId);

  const [isPaperOpen, setPaperOpen] = useState(true);
  const [openSubjectIds, setOpenSubjectIds] = useState<string[]>(() => (subjects[0] ? [subjects[0].id] : []));

  const visibleSubjects = useMemo(() => subjects.filter((s) => subjectHasMicrosyllabusMatch(tree, s.id, query)), [subjects, tree, query]);

  if (query.trim() && visibleSubjects.length === 0) return null;
  const paperExpanded = isPaperOpen || !!query.trim() || containsDeepLink;

  return (
    <Card className="overflow-hidden">
      <button className="flex w-full items-center gap-4 px-4 py-4 sm:px-5 text-left" onClick={() => setPaperOpen((v) => !v)}>
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white', progressToneClass(summary.weightedPct))}>
          {summary.weightedPct}%
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{paper.title}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {subjects.length} subjects · {summary.total} microsyllabus items
          </p>
          <div className="mt-2 max-w-xs">
            <ProgressBar value={summary.weightedPct} colorClassName={progressToneClass(summary.weightedPct)} height="h-1.5" />
          </div>
        </div>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform', paperExpanded && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {paperExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-200/70 dark:border-slate-800 px-4 sm:px-5 py-3 space-y-2">
              {visibleSubjects.map((subject) => (
                <SubjectSection
                  key={subject.id}
                  tree={tree}
                  paper={paper}
                  subject={subject}
                  coverage={coverage}
                  onSetCoverage={onSetCoverage}
                  isOpen={openSubjectIds.includes(subject.id)}
                  onToggle={() => setOpenSubjectIds((prev) => (prev.includes(subject.id) ? prev.filter((i) => i !== subject.id) : [...prev, subject.id]))}
                  query={query}
                  deepLinkMicrosyllabusId={deepLinkMicrosyllabusId}
                  deepLinkRef={deepLinkRef}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// Deep-link support: "Study this microsyllabus" from PYQ review arrives as
// /upsc-syllabus?microsyllabusId=... — resolves which stage (Prelims/Mains) actually contains it,
// searching Prelims first since that's this app's only populated PYQ source today.
export function resolveDeepLinkStage(microsyllabusId: string): UpscCseExamStage | undefined {
  for (const tab of STAGE_TABS) {
    if (resolveMicrosyllabusPath(tab.tree, microsyllabusId)) return tab.stage;
  }
  return undefined;
}

export default function UpscCseSyllabus() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const coverage = useAppStore((s) => s.upscCseSyllabusCoverage);
  const setUpscCseCoverageState = useAppStore((s) => s.setUpscCseCoverageState);

  const [searchParams] = useSearchParams();
  const deepLinkMicrosyllabusId = searchParams.get('microsyllabusId') ?? undefined;
  const deepLinkRef = useRef<HTMLLIElement>(null);

  const [activeStage, setActiveStage] = useState<UpscCseExamStage>(
    () => (deepLinkMicrosyllabusId && resolveDeepLinkStage(deepLinkMicrosyllabusId)) || 'prelims',
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!deepLinkMicrosyllabusId) return;
    const t = setTimeout(() => deepLinkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkMicrosyllabusId]);

  const activeTree = STAGE_TABS.find((t) => t.stage === activeStage)!.tree;
  const papers = useMemo(() => getPapersForStage(activeTree), [activeTree]);
  const stageSummary = useMemo(() => computeCoverageSummary(activeTree.microsyllabus.map((m) => m.id), coverage), [activeTree, coverage]);

  if (activeWorkspaceId !== 'upsc_cse') {
    return (
      <div>
        <PageHeader eyebrow="UPSC CSE" title="Syllabus" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-20 px-6 text-center">
          <ListTree className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">This is the UPSC CSE Syllabus</h3>
          <p className="mt-1.5 max-w-sm text-sm text-slate-400">
            Switch to UPSC CSE from the workspace switcher to browse the Prelims and Mains syllabus. You're currently in{' '}
            {getWorkspaceMeta(activeWorkspaceId).shortLabel}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="UPSC CSE · Prelims & Mains"
        title="Syllabus"
        description="Official UPSC CSE syllabus broken into stage → paper → subject → microsyllabus — track coverage as you study."
        action={
          <div className="text-right">
            <p className="font-display text-xl font-bold text-slate-900 dark:text-white">{stageSummary.weightedPct}%</p>
            <p className="text-xs text-slate-400">
              {stageSummary.counts.strong}/{stageSummary.total} strong
            </p>
          </div>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center rounded-full bg-slate-100 dark:bg-slate-800 p-1 gap-0.5 self-start">
          {STAGE_TABS.map((tab) => (
            <button
              key={tab.stage}
              onClick={() => setActiveStage(tab.stage)}
              aria-pressed={activeStage === tab.stage}
              className={cx(
                'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                activeStage === tab.stage ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search microsyllabus…"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
      </div>

      <div className="space-y-3">
        {papers.map((paper) => (
          <PaperSection
            key={paper.id}
            tree={activeTree}
            paper={paper}
            coverage={coverage}
            onSetCoverage={setUpscCseCoverageState}
            query={query}
            deepLinkMicrosyllabusId={deepLinkMicrosyllabusId}
            deepLinkRef={deepLinkRef}
          />
        ))}
      </div>
    </div>
  );
}
