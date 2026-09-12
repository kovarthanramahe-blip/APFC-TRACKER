import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { reconcileOnSignIn, startCloudSync, useSyncStatus } from './cloudSync';

/**
 * Drives cloud sync for the whole app lifetime — mount once (in App), not
 * per-page. Reconciles local/cloud state on sign-in, then keeps pushing
 * local changes (debounced) until sign-out.
 */
export function useCloudSync() {
  const { user, isSupabaseConfigured } = useAuth();
  const stopRef = useRef<(() => void) | null>(null);
  const activeUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) {
      stopRef.current?.();
      stopRef.current = null;
      activeUserId.current = null;
      if (!user) useSyncStatus.getState().setStatus('idle');
      return;
    }

    if (activeUserId.current === user.id) return; // already syncing this user
    activeUserId.current = user.id;

    let cancelled = false;
    (async () => {
      await reconcileOnSignIn(user.id);
      if (cancelled) return;
      stopRef.current = startCloudSync(user.id);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isSupabaseConfigured]);

  useEffect(() => () => stopRef.current?.(), []);
}
