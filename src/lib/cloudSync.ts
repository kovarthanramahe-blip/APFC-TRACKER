import { create } from 'zustand';
import { supabase } from './supabase';
import { exportAllData, importAllData, useAppStore } from './store';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

// Ephemeral (not persisted) — just drives the sync indicator in Settings.
export const useSyncStatus = create<{ status: SyncStatus; setStatus: (s: SyncStatus) => void }>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));

const TABLE = 'user_data';

export async function fetchCloudData(userId: string): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLE).select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.data as Record<string, unknown> | undefined) ?? null;
}

export async function saveCloudData(userId: string, data: Record<string, unknown>): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).upsert({ user_id: userId, data }, { onConflict: 'user_id' });
  if (error) throw error;
}

function hasMeaningfulData(data: Record<string, unknown>): boolean {
  const counts = [
    Object.keys((data.completedTopics as object) ?? {}).length,
    ((data.notes as unknown[]) ?? []).length,
    ((data.attempts as unknown[]) ?? []).length,
    ((data.sessions as unknown[]) ?? []).length,
    Object.keys((data.studyLog as object) ?? {}).length,
    ((data.starredQuestionIds as unknown[]) ?? []).length,
  ];
  return counts.some((c) => c > 0);
}

function currentLocalData(): Record<string, unknown> {
  return JSON.parse(exportAllData());
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Reconciles local Zustand state with the user's Supabase row once, right
 * after sign-in:
 *  - cloud has data  -> load it into the local store (cloud wins)
 *  - no cloud row, local has data -> upload local as the initial cloud copy
 *  - neither has data -> nothing to do; the first future change creates it
 */
export async function reconcileOnSignIn(userId: string): Promise<void> {
  const setStatus = useSyncStatus.getState().setStatus;
  setStatus('syncing');
  try {
    const cloud = await fetchCloudData(userId);
    if (cloud && hasMeaningfulData(cloud)) {
      importAllData(JSON.stringify(cloud));
    } else {
      const local = currentLocalData();
      if (hasMeaningfulData(local)) {
        await saveCloudData(userId, local);
      }
    }
    setStatus('synced');
  } catch {
    setStatus(isOffline() ? 'offline' : 'error');
  }
}

/**
 * Starts pushing local store changes to Supabase, debounced so rapid
 * successive changes (e.g. checking off several syllabus topics) collapse
 * into a single write. Returns an unsubscribe function.
 */
export function startCloudSync(userId: string, debounceMs = 1500): () => void {
  const setStatus = useSyncStatus.getState().setStatus;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const push = () => {
    const local = currentLocalData();
    if (!hasMeaningfulData(local)) {
      // Never let a reset/emptied local store silently wipe valid cloud
      // data — mirrors the same guard reconcileOnSignIn applies at sign-in.
      setStatus('synced');
      return;
    }
    setStatus('syncing');
    saveCloudData(userId, local)
      .then(() => setStatus('synced'))
      .catch(() => setStatus(isOffline() ? 'offline' : 'error'));
  };

  const unsubscribeStore = useAppStore.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(push, debounceMs);
  });

  const handleOnline = () => push();
  const handleOffline = () => setStatus('offline');
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    clearTimeout(timer);
    unsubscribeStore();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
