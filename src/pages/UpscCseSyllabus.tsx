import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ListTree, Search, Sparkles, Link2, Target } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { Card, ProgressBar, PageHeader, Badge } from '../components/ui/Primitives';
import { cx } from '../lib/utils';
import { listImportedContentBySyllabusNode } from '../lib/repository';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { getMicrosyllabusCounts } from '../lib/upscCsePrelimsPyqFilters';
import { computeUpscCsePrelimsPerformance, type UpscCsePrelimsMicrosyllabusPerformance } from '../lib/upscCsePrelimsPyqPerformance';
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
import { matchesMicrosyllabusQuery } from '../lib/upscCseSyllabusSearch';
import {
  getTopicsForMicrosyllabus,
  getSubtopicsForTopic,
  getMicroTopicsForSubtopic,
  microsyllabusHasGranularNodes,
  leafGranularIdsForMicrosyllabus,
  expandToLeafCoverageIds,
  microsyllabusOrGranularMatchesQuery,
  resolveGranularBreadcrumb,
  searchGranularNodes,
  type UpscCseGranularNode,
} from '../lib/upscCseGranularSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { getUpscSubjectColor } from '../lib/upscCseSubjectColors';

// UPSC CSE Syllabus UI — the 4-level stage -> paper -> subject -> microsyllabus hierarchy
// (lib/upscCseSyllabus.ts, data/upscCsePrelimsSyllabus.ts, data/upscCseMainsSyllabus.ts),
// UNCHANGED, now with an additional Topic -> Subtopic -> Micro-topic study hierarchy
// (lib/upscCseGranularSyllabus.ts, data/upscCseGranularTopics.ts) expandable beneath any
// microsyllabus item that has one. A microsyllabus item with no granular breakdown renders EXACTLY
// as before — the direct 4-state coverage picker on its own row; one WITH a breakdown instead shows
// a rolled-up percentage (exactly like a subject/paper row already does) and expands to reveal its
// Topics, each expandable in turn down to the Micro-topic leaves where the actual coverage picker
// lives. Deliberately NOT built into pages/Syllabus.tsx (see that decision's original rationale,
// unchanged) — this page reads both trees directly and writes coverage via its own dedicated store
// field (upscCseSyllabusCoverage, now also holding granular node ids as additional keys — see
// lib/upscCseGranularCoverage.ts) — nothing here touches completedTopics, PYQ_BANK, or any APFC data.

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

// Phase 6 — reuses the existing searchGranularNodes (lib/upscCseGranularSyllabus.ts) so a search
// actually filters DOWN to the matching Topic/Subtopic/Micro-topic rows, not just gating whether a
// microsyllabus item's whole subtree is shown (see this page's own use of
// microsyllabusOrGranularMatchesQuery for that coarser gate, unchanged). A node "matches" here if
// it matches the query directly OR is an ancestor of one that does — so finding "Indus Valley
// Civilization" also keeps its parent Topic row visible. Returns null for an empty query (callers
// then skip filtering entirely, identical to today's unfiltered behaviour).
function granularQueryMatchIds(query: string): Set<string> | null {
  if (!query.trim()) return null;
  const matched = searchGranularNodes(UPSC_CSE_GRANULAR_NODES, query);
  const ids = new Set<string>();
  for (const n of matched) {
    ids.add(n.id);
    ids.add(n.topicId);
    if (n.subtopicId) ids.add(n.subtopicId);
  }
  return ids;
}

/** Whether `node` ITSELF (its own title/description, not a descendant's) matches the query — used
 * to decide "show every child unfiltered" (the heading itself is the match, so its whole subtree is
 * relevant context) vs "filter children down to only the ones that matched". True for an empty
 * query, matching lib/upscCseSyllabusSearch.ts's matchesMicrosyllabusQuery convention. */
function granularNodeDirectlyMatches(node: UpscCseGranularNode, query: string): boolean {
  if (!query.trim()) return true;
  return searchGranularNodes(UPSC_CSE_GRANULAR_NODES, query).some((n) => n.id === node.id);
}

function CoverageStatePicker({ value, onChange }: { value: UpscCseCoverageState; onChange: (next: UpscCseCoverageState) => void }) {
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
              'relative flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
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

// ============================================================================================
// Granular rows — Topic -> Subtopic -> Micro-topic, nested beneath a microsyllabus item that has
// them. Every derived label carries the "derived study unit" Sparkles badge so it's never mistaken
// for official UPSC wording (see lib/upscCseGranularSyllabus.ts's UpscCseGranularNode.origin).
// ============================================================================================

function DerivedBadge() {
  return (
    <Badge tone="neutral" className="shrink-0">
      <Sparkles className="h-2.5 w-2.5" /> Derived study unit
    </Badge>
  );
}

function GranularMicroTopicRow({
  node,
  coverage,
  onSetCoverage,
  isDeepLinked,
  deepLinkRef,
}: {
  node: UpscCseGranularNode;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (id: string, state: UpscCseCoverageState) => void;
  isDeepLinked: boolean;
  deepLinkRef: React.Ref<HTMLLIElement> | undefined;
}) {
  const state = getCoverageState(coverage, node.id);
  return (
    <li
      ref={isDeepLinked ? deepLinkRef : undefined}
      className={cx(
        'flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors',
        isDeepLinked && 'ring-2 ring-brand-400 dark:ring-brand-500/60',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700 dark:text-slate-200">{node.title}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{node.description}</p>
      </div>
      <CoverageStatePicker value={state} onChange={(next) => onSetCoverage(node.id, next)} />
    </li>
  );
}

function GranularSubtopicRow({
  node,
  coverage,
  onSetCoverage,
  query,
  forceOpen,
  deepLinkId,
  deepLinkRef,
}: {
  node: UpscCseGranularNode;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (id: string, state: UpscCseCoverageState) => void;
  query: string;
  forceOpen: boolean;
  deepLinkId?: string;
  deepLinkRef: React.Ref<HTMLLIElement> | undefined;
}) {
  const [isOpen, setIsOpen] = useState(forceOpen);
  const allMicroTopics = useMemo(() => getMicroTopicsForSubtopic(UPSC_CSE_GRANULAR_NODES, node.id), [node.id]);
  const microTopics = useMemo(() => {
    if (granularNodeDirectlyMatches(node, query)) return allMicroTopics;
    const matchIds = granularQueryMatchIds(query);
    return matchIds ? allMicroTopics.filter((mt) => matchIds.has(mt.id)) : allMicroTopics;
  }, [node, allMicroTopics, query]);
  const summary = useMemo(() => computeCoverageSummary(allMicroTopics.map((m) => m.id), coverage), [allMicroTopics, coverage]);
  const isSelfDeepLinked = deepLinkId === node.id;
  const expanded = isOpen || forceOpen || !!query.trim();

  return (
    <li className={cx('rounded-lg border border-slate-100 dark:border-slate-800/70', isSelfDeepLinked && 'ring-2 ring-brand-400 dark:ring-brand-500/60')}>
      <button
        className="flex w-full items-center gap-2 px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white', progressToneClass(summary.weightedPct))}>
          {summary.weightedPct}%
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600 dark:text-slate-300">{node.title}</span>
        <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <ul className="border-t border-slate-100 dark:border-slate-800/70 px-2 py-1 space-y-0.5">
          {microTopics.map((mt) => (
            <GranularMicroTopicRow
              key={mt.id}
              node={mt}
              coverage={coverage}
              onSetCoverage={onSetCoverage}
              isDeepLinked={deepLinkId === mt.id}
              deepLinkRef={deepLinkId === mt.id ? deepLinkRef : undefined}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function GranularTopicRow({
  node,
  coverage,
  onSetCoverage,
  query,
  forceOpen,
  deepLinkId,
  deepLinkRef,
}: {
  node: UpscCseGranularNode;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (id: string, state: UpscCseCoverageState) => void;
  query: string;
  forceOpen: boolean;
  deepLinkId?: string;
  deepLinkRef: React.Ref<HTMLLIElement> | undefined;
}) {
  const [isOpen, setIsOpen] = useState(forceOpen);
  const allSubtopics = useMemo(() => getSubtopicsForTopic(UPSC_CSE_GRANULAR_NODES, node.id), [node.id]);
  // Progress always rolls up from the FULL subtree — never the search-filtered subset below, or the
  // percentage badge would misleadingly shift while a search is active.
  const leafIds = useMemo(() => allSubtopics.flatMap((st) => getMicroTopicsForSubtopic(UPSC_CSE_GRANULAR_NODES, st.id).map((mt) => mt.id)), [allSubtopics]);
  const summary = useMemo(() => computeCoverageSummary(leafIds, coverage), [leafIds, coverage]);
  const subtopics = useMemo(() => {
    if (granularNodeDirectlyMatches(node, query)) return allSubtopics;
    const matchIds = granularQueryMatchIds(query);
    return matchIds ? allSubtopics.filter((st) => matchIds.has(st.id)) : allSubtopics;
  }, [node, allSubtopics, query]);
  const isSelfDeepLinked = deepLinkId === node.id;
  const expanded = isOpen || forceOpen || !!query.trim();

  return (
    <li className={cx('rounded-xl border border-slate-200/70 dark:border-slate-800', isSelfDeepLinked && 'ring-2 ring-brand-400 dark:ring-brand-500/60')}>
      <button
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white', progressToneClass(summary.weightedPct))}>
          {summary.weightedPct}%
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{node.title}</span>
        <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <ul className="border-t border-slate-200/70 dark:border-slate-800 px-2 py-1.5 space-y-1">
          {subtopics.map((st) => (
            <GranularSubtopicRow
              key={st.id}
              node={st}
              coverage={coverage}
              onSetCoverage={onSetCoverage}
              query={query}
              forceOpen={forceOpen || st.id === deepLinkId || getMicroTopicsForSubtopic(UPSC_CSE_GRANULAR_NODES, st.id).some((mt) => mt.id === deepLinkId)}
              deepLinkId={deepLinkId}
              deepLinkRef={deepLinkRef}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Competitive Exam Intelligence — the same "enough real attempt data to mean something" / "good
// enough accuracy" thresholds pages/UpscCseDashboard.tsx's Today's Study weak-area detection
// already established (lib/upscCseTodaysStudy.ts's own minWeakAreaAttempts/
// weakAreaAccuracyThreshold defaults of 2/50) — reused here for the performance badge's visibility
// and tone so this page never invents a second, conflicting definition of "enough data"/"weak".
const MIN_PYQ_ATTEMPTS_FOR_BADGE = 2;
const WEAK_ACCURACY_THRESHOLD = 50;

function MicrosyllabusRow({
  item,
  paper,
  subject,
  coverage,
  onSetCoverage,
  isDeepLinked,
  deepLinkRef,
  query,
  deepLinkGranularId,
  pyqCount,
  pyqPerformance,
}: {
  item: UpscCseMicrosyllabusItem;
  paper: UpscCseSyllabusPaper;
  subject: UpscCseSyllabusSubject;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (id: string, state: UpscCseCoverageState) => void;
  isDeepLinked?: boolean;
  deepLinkRef?: React.Ref<HTMLLIElement>;
  query: string;
  deepLinkGranularId?: string;
  pyqCount: number;
  pyqPerformance?: UpscCsePrelimsMicrosyllabusPerformance;
}) {
  const hasGranular = microsyllabusHasGranularNodes(UPSC_CSE_GRANULAR_NODES, item.id);
  // Subject colour identity (Knowledge Library Phase 2) — the microsyllabus row gets the lighter
  // VARIANT of its subject's own hue (never a different colour), a left-border accent only; the
  // existing progress-percentage badge (box colour) is untouched — it conveys a different signal
  // (coverage state), not subject identity.
  const subjectColor = getUpscSubjectColor(subject.title);
  // Knowledge <-> Syllabus connections (Phase 3) — "Syllabus -> Knowledge": how many Repository
  // items (today: Current Affairs) are linked to THIS microsyllabus node, reusing the exact same
  // metadata.syllabusNodeId the Current Affairs capture UI already writes — no new relationship
  // engine. importedContent already only ever holds the active (UPSC CSE) workspace's own data, so
  // this never needs its own workspace scoping. Shown only when > 0 (progressive disclosure — an
  // empty topic gets no badge at all, never a visible "0 linked").
  const importedContent = useAppStore((s) => s.importedContent);
  const linkedCount = useMemo(() => listImportedContentBySyllabusNode(importedContent, item.id).length, [importedContent, item.id]);
  const hasPerformanceSignal = !!pyqPerformance && pyqPerformance.attempted >= MIN_PYQ_ATTEMPTS_FOR_BADGE;
  const [isOpen, setIsOpen] = useState(isDeepLinked || !!deepLinkGranularId);
  // Every hook this component might need is called unconditionally, before the branch below, so
  // hook order never changes between a granularized and non-granularized render (React's Rules of
  // Hooks) — the granular-only values are simply unused on the non-granular branch.
  const topics = useMemo(() => {
    const all = getTopicsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, item.id);
    // The microsyllabus item's OWN title/description matched (not a granular descendant) — every
    // topic beneath it is relevant context, so show them all rather than filtering down further.
    if (matchesMicrosyllabusQuery(item, query)) return all;
    const matchIds = granularQueryMatchIds(query);
    return matchIds ? all.filter((t) => matchIds.has(t.id)) : all;
  }, [item, query]);
  const leafIds = useMemo(() => leafGranularIdsForMicrosyllabus(UPSC_CSE_GRANULAR_NODES, item.id), [item.id]);
  const summary = useMemo(() => computeCoverageSummary(leafIds, coverage), [leafIds, coverage]);

  if (!hasGranular) {
    const state = getCoverageState(coverage, item.id);
    return (
      <li
        ref={isDeepLinked ? deepLinkRef : undefined}
        className={cx(
          'flex items-start gap-3 rounded-lg border-l-2 px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors',
          subjectColor.variant.border,
          isDeepLinked && 'ring-2 ring-brand-400 dark:ring-brand-500/60',
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {paper.shortTitle} › {subject.title}
          </p>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.title}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{item.description}</p>
          {(linkedCount > 0 || pyqCount > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {linkedCount > 0 && (
                <Link
                  to={`/repository?syllabusNodeId=${encodeURIComponent(item.id)}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  <Link2 className="h-3 w-3" /> {linkedCount} linked
                </Link>
              )}
              {pyqCount > 0 && (
                <Link
                  to={`/upsc-pyq-test?microsyllabusId=${encodeURIComponent(item.id)}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  <Target className="h-3 w-3" /> {pyqCount} PYQ{pyqCount === 1 ? '' : 's'}
                </Link>
              )}
              {hasPerformanceSignal && pyqPerformance && (
                <span
                  title={`${pyqPerformance.attempted} attempted, ${pyqPerformance.accuracy.toFixed(0)}% accuracy`}
                  className={cx(
                    'text-[11px] font-semibold tabular-nums',
                    pyqPerformance.accuracy >= WEAK_ACCURACY_THRESHOLD ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {pyqPerformance.accuracy.toFixed(0)}% accuracy
                </span>
              )}
            </div>
          )}
        </div>
        <CoverageStatePicker value={state} onChange={(next) => onSetCoverage(item.id, next)} />
      </li>
    );
  }

  // Granularized: no direct picker here — the picker lives on the micro-topic leaves. This row
  // instead shows the rolled-up percentage (via the EXISTING computeCoverageSummary fed the item's
  // leaf granular ids, computed above) and expands to reveal its Topics.
  const expanded = isOpen || !!query.trim() || !!deepLinkGranularId;

  return (
    <li
      ref={isDeepLinked ? deepLinkRef : undefined}
      className={cx(
        'rounded-xl border border-l-2 border-slate-200/70 dark:border-slate-800 overflow-hidden',
        subjectColor.variant.border,
        isDeepLinked && 'ring-2 ring-brand-400 dark:ring-brand-500/60',
      )}
    >
      <button
        className="flex w-full items-center gap-3 px-2 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white', progressToneClass(summary.weightedPct))}>
          {summary.weightedPct}%
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {paper.shortTitle} › {subject.title}
          </p>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.title}</p>
        </div>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      {/* Outside the toggle <button> (an <a> nested inside a <button> is invalid HTML and would
          swallow keyboard activation) — shown unconditionally whenever something is linked, never
          gated behind expansion, so "what knowledge is connected" is answerable at a glance exactly
          like the non-granular branch above already does. Same for PYQ coverage/performance. */}
      {(linkedCount > 0 || pyqCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-2">
          {linkedCount > 0 && (
            <Link
              to={`/repository?syllabusNodeId=${encodeURIComponent(item.id)}`}
              className="flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              <Link2 className="h-3 w-3" /> {linkedCount} linked
            </Link>
          )}
          {pyqCount > 0 && (
            <Link
              to={`/upsc-pyq-test?microsyllabusId=${encodeURIComponent(item.id)}`}
              className="flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              <Target className="h-3 w-3" /> {pyqCount} PYQ{pyqCount === 1 ? '' : 's'}
            </Link>
          )}
          {hasPerformanceSignal && pyqPerformance && (
            <span
              title={`${pyqPerformance.attempted} attempted, ${pyqPerformance.accuracy.toFixed(0)}% accuracy`}
              className={cx(
                'text-[11px] font-semibold tabular-nums',
                pyqPerformance.accuracy >= WEAK_ACCURACY_THRESHOLD ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
              )}
            >
              {pyqPerformance.accuracy.toFixed(0)}% accuracy
            </span>
          )}
        </div>
      )}
      {expanded && (
        <div className="border-t border-slate-200/70 dark:border-slate-800 px-2 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-slate-400">{item.description}</p>
            <DerivedBadge />
          </div>
          <ul className="space-y-1.5">
            {topics.map((t) => (
              <GranularTopicRow
                key={t.id}
                node={t}
                coverage={coverage}
                onSetCoverage={onSetCoverage}
                query={query}
                forceOpen={
                  t.id === deepLinkGranularId ||
                  getSubtopicsForTopic(UPSC_CSE_GRANULAR_NODES, t.id).some(
                    (st) => st.id === deepLinkGranularId || getMicroTopicsForSubtopic(UPSC_CSE_GRANULAR_NODES, st.id).some((mt) => mt.id === deepLinkGranularId),
                  )
                }
                deepLinkId={deepLinkGranularId}
                deepLinkRef={deepLinkRef}
              />
            ))}
          </ul>
        </div>
      )}
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
  deepLinkGranularId,
  deepLinkRef,
  pyqCountByMicrosyllabus,
  pyqPerformanceByMicrosyllabus,
}: {
  tree: UpscCseSyllabusTree;
  paper: UpscCseSyllabusPaper;
  subject: UpscCseSyllabusSubject;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (id: string, state: UpscCseCoverageState) => void;
  isOpen: boolean;
  onToggle: () => void;
  query: string;
  deepLinkMicrosyllabusId?: string;
  deepLinkGranularId?: string;
  deepLinkRef?: React.Ref<HTMLLIElement>;
  pyqCountByMicrosyllabus: Map<string, number>;
  pyqPerformanceByMicrosyllabus: Map<string, UpscCsePrelimsMicrosyllabusPerformance>;
}) {
  const allItems = useMemo(() => getMicrosyllabusForSubject(tree, subject.id), [tree, subject.id]);
  const items = useMemo(
    () =>
      allItems.filter((item) =>
        microsyllabusOrGranularMatchesQuery(matchesMicrosyllabusQuery(item, query), item.id, UPSC_CSE_GRANULAR_NODES, query),
      ),
    [allItems, query],
  );
  const leafIds = useMemo(() => expandToLeafCoverageIds(allItems.map((m) => m.id), UPSC_CSE_GRANULAR_NODES), [allItems]);
  const summary = useMemo(() => computeCoverageSummary(leafIds, coverage), [leafIds, coverage]);
  const containsDeepLink = (!!deepLinkMicrosyllabusId && allItems.some((m) => m.id === deepLinkMicrosyllabusId)) || !!deepLinkGranularId;
  // Subject colour identity (Knowledge Library Phase 2) — a small strong-identity dot next to the
  // subject title, distinct from the percentage badge (which conveys coverage, not identity).
  const subjectColor = getUpscSubjectColor(subject.title);

  if (query.trim() && items.length === 0) return null;
  const expanded = isOpen || !!query.trim() || containsDeepLink;

  return (
    <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-hidden">
      <button
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white', progressToneClass(summary.weightedPct))}>
          {summary.weightedPct}%
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
            <span className={cx('h-2 w-2 shrink-0 rounded-full', subjectColor.base.dot)} aria-hidden="true" />
            <span className="truncate">{subject.title}</span>
          </p>
          <div className="mt-1 max-w-[10rem]">
            <ProgressBar value={summary.weightedPct} colorClassName={progressToneClass(summary.weightedPct)} height="h-1" />
          </div>
        </div>
        <span className="hidden sm:block text-xs text-slate-400 shrink-0">
          {summary.counts.strong}/{summary.total} strong
        </span>
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
            <ul className="border-t border-slate-200/70 dark:border-slate-800 px-2 py-1.5 space-y-1">
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
                  query={query}
                  deepLinkGranularId={
                    deepLinkGranularId && resolveGranularBreadcrumb(UPSC_CSE_GRANULAR_NODES, deepLinkGranularId)?.microsyllabusId === item.id
                      ? deepLinkGranularId
                      : undefined
                  }
                  pyqCount={pyqCountByMicrosyllabus.get(item.id) ?? 0}
                  pyqPerformance={pyqPerformanceByMicrosyllabus.get(item.id)}
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
  deepLinkGranularId,
  deepLinkRef,
  pyqCountByMicrosyllabus,
  pyqPerformanceByMicrosyllabus,
}: {
  tree: UpscCseSyllabusTree;
  paper: UpscCseSyllabusPaper;
  coverage: UpscCseSyllabusCoverage;
  onSetCoverage: (id: string, state: UpscCseCoverageState) => void;
  query: string;
  deepLinkMicrosyllabusId?: string;
  deepLinkGranularId?: string;
  deepLinkRef?: React.Ref<HTMLLIElement>;
  pyqCountByMicrosyllabus: Map<string, number>;
  pyqPerformanceByMicrosyllabus: Map<string, UpscCsePrelimsMicrosyllabusPerformance>;
}) {
  const subjects = useMemo(() => getSubjectsForPaper(tree, paper.id), [tree, paper.id]);
  const microsyllabusIds = useMemo(() => tree.microsyllabus.filter((m) => m.paperId === paper.id).map((m) => m.id), [tree, paper.id]);
  const leafIds = useMemo(() => expandToLeafCoverageIds(microsyllabusIds, UPSC_CSE_GRANULAR_NODES), [microsyllabusIds]);
  const summary = useMemo(() => computeCoverageSummary(leafIds, coverage), [leafIds, coverage]);
  const containsDeepLink = (!!deepLinkMicrosyllabusId && microsyllabusIds.includes(deepLinkMicrosyllabusId)) || !!deepLinkGranularId;

  const [isPaperOpen, setPaperOpen] = useState(true);
  const [openSubjectIds, setOpenSubjectIds] = useState<string[]>(() => (subjects[0] ? [subjects[0].id] : []));

  const visibleSubjects = useMemo(
    () =>
      subjects.filter((s) => {
        if (!query.trim()) return true;
        return getMicrosyllabusForSubject(tree, s.id).some((item) =>
          microsyllabusOrGranularMatchesQuery(matchesMicrosyllabusQuery(item, query), item.id, UPSC_CSE_GRANULAR_NODES, query),
        );
      }),
    [subjects, tree, query],
  );

  if (query.trim() && visibleSubjects.length === 0) return null;
  const paperExpanded = isPaperOpen || !!query.trim() || containsDeepLink;

  return (
    <Card className="overflow-hidden">
      <button
        className="flex w-full items-center gap-4 px-4 py-4 sm:px-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        onClick={() => setPaperOpen((v) => !v)}
        aria-expanded={paperExpanded}
      >
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white', progressToneClass(summary.weightedPct))}>
          {summary.weightedPct}%
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{paper.title}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {subjects.length} subjects · {microsyllabusIds.length} microsyllabus items
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
                  deepLinkGranularId={deepLinkGranularId}
                  deepLinkRef={deepLinkRef}
                  pyqCountByMicrosyllabus={pyqCountByMicrosyllabus}
                  pyqPerformanceByMicrosyllabus={pyqPerformanceByMicrosyllabus}
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
  const pyqAttempts = useAppStore((s) => s.upscCsePrelimsPyqAttempts);

  // Competitive Exam Intelligence — PYQ coverage (item #1) + performance (item #2) per
  // microsyllabus, computed ONCE here (never per-row) and threaded down through
  // PaperSection/SubjectSection exactly like `coverage` already is. Reuses lib/
  // upscCsePrelimsPyqFilters.ts's existing getMicrosyllabusCounts and lib/
  // upscCsePrelimsPyqPerformance.ts's existing computeUpscCsePrelimsPerformance verbatim — the
  // SAME aggregation pages/UpscCseDashboard.tsx's "Today's Study" weak-area detection and
  // pages/UpscCsePyqTest.tsx's own Performance view already use. UPSC CSE's PYQ bank only has
  // Prelims questions mapped today, so a Mains microsyllabus id simply has no entry in either map
  // — never fabricated, just honestly absent (both lookups below already degrade to "no badge").
  const pyqCountByMicrosyllabus = useMemo(() => {
    const counts = getMicrosyllabusCounts(UPSC_CSE_PRELIMS_PYQ_BANK, 'all', 'all', 'all');
    return new Map(counts.map((c) => [c.id, c.count]));
  }, []);
  const pyqPerformanceByMicrosyllabus = useMemo(() => {
    const perf = computeUpscCsePrelimsPerformance(UPSC_CSE_PRELIMS_PYQ_BANK, pyqAttempts, UPSC_CSE_PRELIMS_SYLLABUS);
    return new Map((perf?.microsyllabus ?? []).map((m) => [m.microsyllabusId, m]));
  }, [pyqAttempts]);

  const [searchParams] = useSearchParams();
  const deepLinkGranularId = searchParams.get('granularId') ?? undefined;
  // /upsc-syllabus?granularId=... (a Topic/Subtopic/Micro-topic id — see
  // lib/upscCseGranularSyllabus.ts's stable deep-link ids) resolves to its owning microsyllabus id
  // too, so the SAME ?microsyllabusId= deep-link machinery (stage resolution, forced-open ancestor
  // chain) already below handles both cases uniformly.
  const deepLinkMicrosyllabusId =
    searchParams.get('microsyllabusId') ?? (deepLinkGranularId ? resolveGranularBreadcrumb(UPSC_CSE_GRANULAR_NODES, deepLinkGranularId)?.microsyllabusId : undefined);
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
  }, [deepLinkMicrosyllabusId, deepLinkGranularId]);

  const activeTree = STAGE_TABS.find((t) => t.stage === activeStage)!.tree;
  const papers = useMemo(() => getPapersForStage(activeTree), [activeTree]);
  const stageLeafIds = useMemo(() => expandToLeafCoverageIds(activeTree.microsyllabus.map((m) => m.id), UPSC_CSE_GRANULAR_NODES), [activeTree]);
  const stageSummary = useMemo(() => computeCoverageSummary(stageLeafIds, coverage), [stageLeafIds, coverage]);

  // Phase 6 — "UPSC CSE → GS Paper I → History → Ancient India → Indus Valley Civilization",
  // composed entirely from the two EXISTING path resolvers (resolveMicrosyllabusPath,
  // resolveGranularBreadcrumb) — no new resolution logic, just surfacing what they already compute
  // for deep-link scroll targeting. Shown only while a deep link is active, since there is no
  // "currently selected row" concept otherwise (rows are independent expand/collapse toggles).
  const deepLinkTrail = useMemo(() => {
    if (!deepLinkMicrosyllabusId) return null;
    const path = resolveMicrosyllabusPath(activeTree, deepLinkMicrosyllabusId);
    if (!path) return null;
    const granular = deepLinkGranularId ? resolveGranularBreadcrumb(UPSC_CSE_GRANULAR_NODES, deepLinkGranularId) : undefined;
    return [
      'UPSC CSE',
      path.paper.shortTitle,
      path.subject.title,
      path.item.title,
      granular?.topic?.title,
      granular?.subtopic?.title,
      granular?.microTopic?.title,
    ].filter((label): label is string => !!label);
  }, [activeTree, deepLinkMicrosyllabusId, deepLinkGranularId]);

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
        description="Official UPSC CSE syllabus broken into stage → paper → subject → microsyllabus, with a Topic → Subtopic → Micro-topic study breakdown where available — track coverage as you study."
        action={
          <div className="text-right">
            <p className="font-display text-xl font-bold text-slate-900 dark:text-white">{stageSummary.weightedPct}%</p>
            <p className="text-xs text-slate-400">
              {stageSummary.counts.strong}/{stageSummary.total} strong
            </p>
          </div>
        }
      />

      {deepLinkTrail && (
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          {deepLinkTrail.map((label, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">›</span>}
              <span className={i === deepLinkTrail.length - 1 ? 'font-medium text-slate-600 dark:text-slate-300' : undefined}>{label}</span>
            </span>
          ))}
        </nav>
      )}

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
            placeholder="Search microsyllabus, topics, subtopics…"
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
            deepLinkGranularId={deepLinkGranularId}
            deepLinkRef={deepLinkRef}
            pyqCountByMicrosyllabus={pyqCountByMicrosyllabus}
            pyqPerformanceByMicrosyllabus={pyqPerformanceByMicrosyllabus}
          />
        ))}
      </div>
    </div>
  );
}
