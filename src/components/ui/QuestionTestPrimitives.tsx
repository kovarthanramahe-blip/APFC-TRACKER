import { CheckCircle2, MinusCircle, Star, XCircle } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { cx } from '../../lib/utils';
import { Badge, Card } from './Primitives';

export type QuestionTestStatus = 'correct' | 'wrong' | 'unanswered';

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function BookmarkButton({
  pyqId,
  bookmarkedTitle,
  notBookmarkedTitle,
}: {
  pyqId: string;
  bookmarkedTitle: string;
  notBookmarkedTitle: string;
}) {
  const isBookmarked = useAppStore((s) => s.bookmarkedPyqIds.includes(pyqId));
  const toggleBookmarkedPyq = useAppStore((s) => s.toggleBookmarkedPyq);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleBookmarkedPyq(pyqId);
      }}
      title={isBookmarked ? bookmarkedTitle : notBookmarkedTitle}
      className={cx('shrink-0 rounded-lg p-1.5 transition-colors', isBookmarked ? 'text-gold-500' : 'text-slate-300 hover:text-gold-500 dark:text-slate-600')}
    >
      <Star className={cx('h-4.5 w-4.5', isBookmarked && 'fill-gold-400')} />
    </button>
  );
}

export function StatTile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' | 'brand' }) {
  const tones: Record<string, string> = {
    neutral: 'text-slate-800 dark:text-slate-100',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-rose-600 dark:text-rose-400',
    brand: 'text-brand-600 dark:text-brand-400',
  };
  return (
    <Card className="p-4 text-center">
      <p className={cx('font-display text-xl font-bold', tones[tone])}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </Card>
  );
}

export function StatusBadge({ status }: { status: QuestionTestStatus }) {
  if (status === 'correct') {
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3 w-3" /> Correct
      </Badge>
    );
  }
  if (status === 'wrong') {
    return (
      <Badge tone="danger">
        <XCircle className="h-3 w-3" /> Wrong
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <MinusCircle className="h-3 w-3" /> Unanswered
    </Badge>
  );
}

export function SelectChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
        active
          ? 'bg-brand-600 text-white border-brand-600'
          : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:text-slate-400',
      )}
    >
      {children}
    </button>
  );
}
