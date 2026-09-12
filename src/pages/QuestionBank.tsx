import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronDown, Filter } from 'lucide-react';
import { QUESTION_BANK } from '../data/questionBank';
import { SYLLABUS } from '../data/syllabus';
import { useAppStore } from '../lib/store';
import { SUBJECT_COLORS, cx } from '../lib/utils';
import { Card, Badge, PageHeader } from '../components/ui/Primitives';
import type { SubjectColorKey } from '../lib/types';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

export default function QuestionBank() {
  const [subject, setSubject] = useState<SubjectColorKey | 'all' | 'starred'>('all');
  const [difficulty, setDifficulty] = useState<'all' | (typeof DIFFICULTIES)[number]>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const starred = useAppStore((s) => s.starredQuestionIds);
  const toggleStar = useAppStore((s) => s.toggleStarredQuestion);

  const filtered = useMemo(() => {
    return QUESTION_BANK.filter((q) => {
      if (subject === 'starred') return starred.includes(q.id);
      if (subject !== 'all' && q.subject !== subject) return false;
      if (difficulty !== 'all' && q.difficulty !== difficulty) return false;
      return true;
    });
  }, [subject, difficulty, starred]);

  return (
    <div>
      <PageHeader
        eyebrow="Practice Bank"
        title="PYQ-Style Question Bank"
        description="Exam-pattern practice questions organised by subject and topic — reveal the answer & explanation once you've attempted each."
      />

      <Card className="mb-5 p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <FilterChip active={subject === 'all'} onClick={() => setSubject('all')}>
            All Subjects
          </FilterChip>
          <FilterChip active={subject === 'starred'} onClick={() => setSubject('starred')}>
            <Star className="h-3 w-3" /> Starred ({starred.length})
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
        {filtered.map((question, idx) => {
          const isOpen = openId === question.id;
          const isStarred = starred.includes(question.id);
          const colors = SUBJECT_COLORS[question.subject];
          return (
            <Card key={question.id} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xs font-semibold text-slate-300 dark:text-slate-600 w-6 shrink-0">{idx + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={cx(colors.bg, colors.text)}>{question.topic}</Badge>
                    <Badge tone="neutral">{question.difficulty}</Badge>
                    <Badge tone={question.tag === 'PYQ-Style' ? 'gold' : 'neutral'}>{question.tag}</Badge>
                  </div>
                  <p className="text-sm sm:text-[15px] font-medium text-slate-800 dark:text-slate-100">{question.question}</p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {question.options.map((opt) => {
                      const isCorrect = opt.id === question.correctOptionId;
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
                      onClick={() => setOpenId(isOpen ? null : question.id)}
                    >
                      {isOpen ? 'Hide answer' : 'Reveal answer'}
                      <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    <button onClick={() => toggleStar(question.id)} className="text-slate-300 dark:text-slate-600 hover:text-gold-500">
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
                          {question.explanation}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="py-16 text-center text-sm text-slate-400">No questions match these filters.</div>}
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
