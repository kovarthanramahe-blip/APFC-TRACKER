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

// Exported so it can be unit-tested directly (see cloudSync.test.ts) without mocking Supabase.
export function hasMeaningfulData(data: Record<string, unknown>): boolean {
  const counts = [
    Object.keys((data.completedTopics as object) ?? {}).length,
    ((data.notes as unknown[]) ?? []).length,
    ((data.attempts as unknown[]) ?? []).length,
    ((data.sessions as unknown[]) ?? []).length,
    Object.keys((data.studyLog as object) ?? {}).length,
    ((data.starredQuestionIds as unknown[]) ?? []).length,
    ((data.pyqAttempts as unknown[]) ?? []).length,
    ((data.bookmarkedPyqIds as unknown[]) ?? []).length,
    // Multi-Workspace OS, Stage 2 — a device that only has data archived under a non-active
    // workspace (inactiveWorkspaceOwnedData) still has meaningful data; without this it could be
    // wrongly treated as empty and have valid cloud data overwritten. Always empty today (nothing
    // populates it yet), so this never changes today's behavior — see store.ts's field doc-comment.
    Object.keys((data.inactiveWorkspaceOwnedData as object) ?? {}).length,
    // Import-First Content Repository foundation — imported non-note content (question banks,
    // PYQs, research documents, etc.) is just as real as any other field here.
    ((data.importedContent as unknown[]) ?? []).length,
    // Source <-> Research Document Linking — a relationship between two content items is real user
    // data too, same reasoning as importedContent above.
    ((data.contentRelationships as unknown[]) ?? []).length,
    // UPSC CSE Syllabus UI — coverage state per microsyllabus id is real user data too.
    Object.keys((data.upscCseSyllabusCoverage as object) ?? {}).length,
    // UPSC CSE Practice & Analytics — practice attempts are real user data too.
    ((data.upscCsePrelimsPyqAttempts as unknown[]) ?? []).length,
    // UPSC CSE Study Dashboard — user-authored study tasks are real user data too.
    ((data.upscCseStudyTasks as unknown[]) ?? []).length,
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
 *  - no cloud row, local data belongs to this same user (or device has never
 *    synced before) -> upload local as the initial cloud copy
 *  - no cloud row, but local data belongs to a DIFFERENT account that
 *    previously used this device -> never adopt it as this user's data;
 *    clear it instead, so accounts sharing a device/browser can't leak
 *    each other's progress
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
      const { lastSyncedUserId, resetAllData } = useAppStore.getState();
      if (lastSyncedUserId && lastSyncedUserId !== userId) {
        resetAllData();
      } else {
        const local = currentLocalData();
        if (hasMeaningfulData(local)) {
          await saveCloudData(userId, local);
        }
      }
    }
    useAppStore.getState().setLastSyncedUserId(userId);
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
