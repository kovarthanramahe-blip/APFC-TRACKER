import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, X } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { REWARDS, useRewards } from '../lib/gamification';

interface ToastState {
  title: string;
  count: number;
}

/**
 * Detects rewards that just became true and haven't been celebrated yet
 * (tracked via the persisted rewardUnlocks map, so this never re-fires for
 * something already seen — including after sign-out/sign-in or on another
 * device once synced). Mount once at the app level, not per-page.
 */
export function RewardCelebration() {
  const rewards = useRewards();
  const rewardUnlocks = useAppStore((s) => s.rewardUnlocks);
  const recordRewardUnlocks = useAppStore((s) => s.recordRewardUnlocks);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    const newlyUnlockedIds = rewards.unlocked.map((r) => r.id).filter((id) => !rewardUnlocks[id]);
    if (newlyUnlockedIds.length === 0) return;

    recordRewardUnlocks(newlyUnlockedIds);

    if (newlyUnlockedIds.length === 1) {
      const reward = REWARDS.find((r) => r.id === newlyUnlockedIds[0]);
      setToast({ title: reward?.title ?? 'New reward', count: 1 });
    } else {
      setToast({ title: '', count: newlyUnlockedIds.length });
    }
    // rewards.unlocked is a fresh array each computation, but only actually
    // differs when the underlying store slices change (useRewards memoizes
    // on those), so this doesn't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewards.unlocked, rewardUnlocks]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-gold-300/60 bg-white/95 dark:bg-slate-900/95 dark:border-gold-500/30 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur-xl">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-100 dark:bg-gold-500/15">
              <Trophy className="h-4.5 w-4.5 text-gold-600 dark:text-gold-400" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gold-700 dark:text-gold-400">Reward unlocked</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {toast.count > 1 ? `${toast.count} new rewards unlocked!` : toast.title}
              </p>
            </div>
            <button onClick={() => setToast(null)} className="ml-2 shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
