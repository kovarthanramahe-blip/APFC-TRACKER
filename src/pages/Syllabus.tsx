import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, RotateCcw, Search, NotebookPen } from 'lucide-react';
import { SYLLABUS, getAllTopicsCount } from '../data/syllabus';
import { useAppStore } from '../lib/store';
import { SUBJECT_COLORS, cx } from '../lib/utils';
import { Card, ProgressBar, Button, PageHeader } from '../components/ui/Primitives';

export default function Syllabus() {
  const completedTopics = useAppStore((s) => s.completedTopics);
  const toggleTopic = useAppStore((s) => s.toggleTopic);
  const markSubjectTopics = useAppStore((s) => s.markSubjectTopics);

  // Deep-link support: "Study this topic" from a PYQ review arrives as /syllabus?topicId=...
  const [searchParams] = useSearchParams();
  const deepLinkTopicId = searchParams.get('topicId');
  const deepLinkSubjectId = useMemo(
    () => (deepLinkTopicId ? SYLLABUS.find((s) => s.topics.some((t) => t.id === deepLinkTopicId))?.id : undefined),
    [deepLinkTopicId],
  );

  const [openIds, setOpenIds] = useState<string[]>(() => (deepLinkSubjectId ? [deepLinkSubjectId] : [SYLLABUS[0].id]));
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

  const totalTopics = getAllTopicsCount();
  const doneTopics = Object.values(completedTopics).filter(Boolean).length;
  const overallPct = totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0;

  const filtered = useMemo(() => {
    if (!query.trim()) return SYLLABUS;
    const q = query.toLowerCase();
    return SYLLABUS.map((subj) => ({
      ...subj,
      topics: subj.topics.filter((t) => t.title.toLowerCase().includes(q) || subj.title.toLowerCase().includes(q)),
    })).filter((subj) => subj.topics.length > 0);
  }, [query]);

  return (
    <div>
      <PageHeader
        eyebrow="Phase I · Recruitment Test"
        title="Syllabus Tracker"
        description="Official UPSC EPFO APFC syllabus broken into trackable topics — check off what you've covered."
        action={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-display text-xl font-bold text-slate-900 dark:text-white">{overallPct}%</p>
              <p className="text-xs text-slate-400">
                {doneTopics}/{totalTopics} topics
              </p>
            </div>
            <div className="h-10 w-10">
              <RadialProgress pct={overallPct} />
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
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
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
                className="flex w-full items-center gap-4 px-4 py-4 sm:px-5 text-left"
                onClick={() => setOpenIds((prev) => (prev.includes(subj.id) ? prev.filter((i) => i !== subj.id) : [...prev, subj.id]))}
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
                          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
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
                          return (
                            <li
                              key={topic.id}
                              ref={isDeepLinked ? highlightedRef : undefined}
                              className={cx(
                                'flex items-center gap-1 rounded-lg transition-colors',
                                isDeepLinked && 'ring-2 ring-brand-400 dark:ring-brand-500/60',
                              )}
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
                              <Link
                                to={`/notes?topicId=${encodeURIComponent(topic.id)}`}
                                title="Notes for this topic"
                                className="shrink-0 rounded-lg p-2 text-slate-300 hover:text-brand-600 dark:text-slate-600 dark:hover:text-brand-400"
                              >
                                <NotebookPen className="h-4 w-4" />
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
                SYLLABUS.flatMap((s) => s.topics.map((t) => t.id)),
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

function RadialProgress({ pct }: { pct: number }) {
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
        className="text-brand-500"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </svg>
  );
}
