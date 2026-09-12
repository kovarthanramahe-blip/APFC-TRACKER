import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, ListOrdered, ArrowRight, Layers, Award } from 'lucide-react';
import { MOCK_TEST_BLUEPRINTS } from '../data/mockTests';
import { useAppStore } from '../lib/store';
import { Card, Badge, PageHeader, fadeUp, staggerContainer } from '../components/ui/Primitives';
import { SUBJECT_COLORS } from '../lib/utils';

export default function MockTests() {
  const attempts = useAppStore((s) => s.attempts);

  const generalTests = MOCK_TEST_BLUEPRINTS.filter((b) => b.subjects === 'all');
  const subjectTests = MOCK_TEST_BLUEPRINTS.filter((b) => b.subjects !== 'all');

  const bestAttempt = (blueprintId: string) => {
    const list = attempts.filter((a) => a.blueprintId === blueprintId);
    if (!list.length) return null;
    return list.reduce((best, a) => (a.score > best.score ? a : best), list[0]);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Phase I · Recruitment Test"
        title="Mock Tests"
        description="Timed, auto-scored tests with 1/3rd negative marking — matching the official APFC objective test pattern."
        action={
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Award className="h-4 w-4 text-gold-500" /> {attempts.length} attempts completed
          </div>
        }
      />

      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mb-8">
        {generalTests.map((bp) => {
          const best = bestAttempt(bp.id);
          return (
            <motion.div key={bp.id} variants={fadeUp}>
              <Card className="flex h-full flex-col p-5">
                <Badge tone="brand" className="mb-3 w-fit">
                  <Layers className="h-3 w-3" /> All Subjects
                </Badge>
                <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">{bp.title}</h3>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 flex-1">{bp.description}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {bp.durationMinutes} min
                  </span>
                  <span className="flex items-center gap-1">
                    <ListOrdered className="h-3.5 w-3.5" /> {bp.questionCount} Qs
                  </span>
                </div>
                {best && (
                  <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Best: {best.score.toFixed(2)}/{best.maxScore}
                  </p>
                )}
                <Link to={`/mock-tests/run/${bp.id}`} className="mt-4">
                  <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
                    Start Test <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 mb-4">Subject-wise Tests</h3>
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {subjectTests.map((bp) => {
          const colorKey = Array.isArray(bp.subjects) ? bp.subjects[0] : 'english';
          const colors = SUBJECT_COLORS[colorKey];
          const best = bestAttempt(bp.id);
          return (
            <motion.div key={bp.id} variants={fadeUp}>
              <Card className="flex items-center gap-3 p-4">
                <span className={`h-9 w-9 shrink-0 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center text-xs font-bold`}>
                  {bp.questionCount}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{bp.title.replace(' — Subject Test', '')}</p>
                  <p className="text-xs text-slate-400">
                    {bp.durationMinutes} min · {bp.questionCount} Qs{best ? ` · Best ${best.score.toFixed(1)}` : ''}
                  </p>
                </div>
                <Link to={`/mock-tests/run/${bp.id}`}>
                  <button className="rounded-lg p-2 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
