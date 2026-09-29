import { useState } from 'react';
import NativeInk, { isNativeInkAvailable } from '../../lib/nativeInk';

// Phase 2 (native Android low-latency stylus ink) — TEMPORARY development/test control only. Lets
// a developer explicitly turn the native overlay on/off/clear on a real device to prove native
// stylus rendering is smooth, without wiring anything into AnnotationLayer.tsx or the annotation
// store yet (see this session's Phase 2 architecture report — that wiring is a later phase).
// Renders nothing at all on web/iOS (isNativeInkAvailable is false there) and nothing changes
// about the existing JS/canvas drawing path either way. Remove or replace with a real toolbar
// control once the native path is wired to persistence.
export function NativeInkDevPanel() {
  if (!isNativeInkAvailable) return null;
  return <NativeInkDevPanelInner />;
}

function NativeInkDevPanelInner() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleEnable() {
    setBusy(true);
    try {
      await NativeInk.enableNativeInk();
      setEnabled(true);
    } catch (err) {
      console.error('NativeInk.enableNativeInk failed', err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await NativeInk.disableNativeInk();
      setEnabled(false);
    } catch (err) {
      console.error('NativeInk.disableNativeInk failed', err);
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    try {
      await NativeInk.clearNativeInk();
    } catch (err) {
      console.error('NativeInk.clearNativeInk failed', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      <span className="font-semibold">Native ink test (Phase 2, temporary):</span>
      <button
        type="button"
        disabled={busy || enabled}
        onClick={handleEnable}
        className="rounded-md border border-amber-400 bg-white px-2 py-1 font-medium disabled:opacity-50 dark:bg-slate-900"
      >
        Enable
      </button>
      <button
        type="button"
        disabled={busy || !enabled}
        onClick={handleDisable}
        className="rounded-md border border-amber-400 bg-white px-2 py-1 font-medium disabled:opacity-50 dark:bg-slate-900"
      >
        Disable
      </button>
      <button
        type="button"
        disabled={busy || !enabled}
        onClick={handleClear}
        className="rounded-md border border-amber-400 bg-white px-2 py-1 font-medium disabled:opacity-50 dark:bg-slate-900"
      >
        Clear
      </button>
      <span>{enabled ? 'ON — write over this document with the stylus' : 'OFF'}</span>
    </div>
  );
}