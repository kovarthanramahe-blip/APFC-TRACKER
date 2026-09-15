import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronDown, Filter, Search } from 'lucide-react';
import { QUESTION_BANK } from '../data/questionBank';
import { PYQ_BANK } from '../data/pyq';
import { SYLLABUS } from '../data/syllabus';
import { useAppStore } from '../lib/store';
import { SUBJECT_COLORS, cx } from '../lib/utils';
import { Card, Badge, PageHeader } from '../components/ui/Primitives';
import type { SubjectColorKey } from '../lib/types';
import { buildQuestionCatalog, isAuthenticPyq, type CatalogQuestion } from '../lib/questionCatalog';
import { matchesQuestionSearch } from '../lib/questionSearch';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

export default function QuestionBank() {
  const [subject, setSubject] = useState<SubjectColorKey | 'all' | 'starred'>('all');
  const [difficulty, setDifficulty] = useState<'all' | (typeof DIFFICULTIES)[number]>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const starred = useAppStore((s) => s.starredQuestionIds);
  const toggleStar = useAppStore((s) => s.toggleStarredQuestion);
  // Unified Question Architecture Stage 5A — authentic PYQs get their own real bookmark system
  // (lib/revisionQueue's eligibility depends on it), so a starred/bookmarked catalog entry here
  // reads and writes whichever store field its own provenance actually belongs to; nothing is
  // cross-written into the wrong set.
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const toggleBookmarkedPyq = useAppStore((s) => s.toggleBookmarkedPyq);

  // The unified catalog (lib/questionCatalog.ts, Stage 4) over both existing sources — PYQ_BANK
  // and QUESTION_BANK are both static module-level arrays, so this is built exactly once, never
  // mutating or reordering either source.
  const catalog = useMemo(() => buildQuestionCatalog(PYQ_BANK, QUESTION_BANK), []);

  const isEntryStarred = (entry: CatalogQuestion) => (isAuthenticPyq(entry) ? bookmarkedPyqIds.includes(entry.id) : starred.includes(entry.id));

  const filtered = useMemo(() => {
    return catalog.filter((entry) => {
      if (subject === 'starred') return isEntryStarred(entry);
      if (subject !== 'all' && entry.subject !== subject) return false;
      if (difficulty !== 'all' && entry.difficulty !== difficulty) return false;
      if (!matchesQuestionSearch(entry, query)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, subject, difficulty, query, starred, bookmarkedPyqIds]);

  return (
    <div>
      <PageHeader
        eyebrow="Practice Bank"
        title="Question Bank"
        description="Authentic previous-year questions and exam-pattern practice questions, organised by subject — reveal the answer & explanation once you've attempted each."
      />

      <div className="mb-5 relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions, topics or options…"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      <Card className="mb-5 p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <FilterChip active={subject === 'all'} onClick={() => setSubject('all')}>
            All Subjects
          </FilterChip>
          <FilterChip active={subject === 'starred'} onClick={() => setSubject('starred')}>
            <Star className="h-3 w-3" /> Starred ({starred.length + bookmarkedPyqIds.length})
          </FilterChip>
          {SYLLABUS.map((s) => (
            <FilterChip key={s.id} active={subject === s.colorKey} onClick={() => setSubject(s.colorKey)}>
              {s.shortTitle}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={difficulty === 'all'} onClick={() => setDifficulty('all')} tone="neutral">
            Any difficulty
          </FilterChip>
          {DIFFICULTIES.map((d) => (
            <FilterChip key={d} active={difficulty === d} onClick={() => setDifficulty(d)} tone="neutral">
              {d}
            </FilterChip>
          ))}
        </div>
      </Card>

      <p className="mb-3 text-xs text-slate-400">{filtered.length} questions</p>

      <div className="space-y-3">
        {filtered.map((entry, idx) => {
          const isOpen = openId === entry.id;
          const isStarred = isEntryStarred(entry);
          const authenticPyq = isAuthenticPyq(entry);
          const colors = SUBJECT_COLORS[entry.subject];
          return (
            <Card key={entry.id} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xs font-semibold text-slate-300 dark:text-slate-600 w-6 shrink-0">{idx + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={cx(colors.bg, colors.text)}>{entry.topicLabel}</Badge>
                    {entry.difficulty && <Badge tone="neutral">{entry.difficulty}</Badge>}
                    {/* Provenance, kept minimal and explicit per the Unified Question Architecture:
                        an authentic PYQ is never shown as merely "practice" or vice versa. */}
                    <Badge tone={authenticPyq ? 'gold' : 'neutral'}>{authenticPyq ? 'Authentic PYQ' : 'Practice'}</Badge>
                  </div>
                  <p className="text-sm sm:text-[15px] font-medium text-slate-800 dark:text-slate-100">{entry.question}</p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {entry.options.map((opt) => {
                      const isCorrect = opt.id === entry.correctOptionId;
                      return (
                        <div
                          key={opt.id}
                          className={cx(
                            'rounded-lg border px-3 py-2 text-sm transition-colors',
                            isOpen && isCorrect
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/50 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300',
                          )}
                        >
                          {opt.text}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <button
                      className="text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1 hover:underline"
                      onClick={() => setOpenId(isOpen ? null : entry.id)}
                    >
                      {isOpen ? 'Hide answer' : 'Reveal answer'}
                      <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    <button
                      onClick={() => (authenticPyq ? toggleBookmarkedPyq : toggleStar)(entry.id)}
                      className="text-slate-300 dark:text-slate-600 hover:text-gold-500"
                    >
                      <Star className={cx('h-4.5 w-4.5', isStarred && 'fill-gold-400 text-gold-500')} />
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">Explanation: </span>
                          {entry.explanation}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
            {query.trim() ? `No questions match "${query.trim()}".` : 'No questions match these filters.'}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  tone = 'brand',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'brand' | 'neutral';
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
        active
          ? tone === 'brand'
            ? 'bg-brand-600 text-white border-brand-600'
            : 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
          : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:text-slate-400',
      )}
    >
      {children}
    </button>
  );
}
