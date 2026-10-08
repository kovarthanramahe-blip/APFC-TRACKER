import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { REWARDS, useRewards } from '../lib/gamification';
import { Toast } from './ui/Primitives';

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

  // Phase 15 — renders through the shared Toast primitive now (tone="gold" added specifically so
  // this keeps its own established gold/trophy reward styling, pixel-for-pixel the same classes
  // as before). All of this component's own logic (unlock detection, the 5s auto-dismiss timer)
  // is completely unchanged — only the JSX moved.
  return (
    <Toast
      open={toast !== null}
      onClose={() => setToast(null)}
      icon={Trophy}
      title="Reward unlocked"
      message={toast ? (toast.count > 1 ? `${toast.count} new rewards unlocked!` : toast.title) : ''}
      tone="gold"
    />
  );
}
