import { useRef, useState } from 'react';
import { Download, Upload, Trash2, Sun, Moon, Laptop, Smartphone, Info, LogIn, LogOut, UserRound } from 'lucide-react';
import { useAppStore, exportAllData, importAllData } from '../lib/store';
import { useAuth } from '../lib/useAuth';
import { cx } from '../lib/utils';
import { Card, Button, PageHeader, Badge } from '../components/ui/Primitives';

function AccountCard() {
  const { user, loading, isSupabaseConfigured, signInWithGoogle, signOut } = useAuth();

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Account</h3>
      </div>
      {!isSupabaseConfigured ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Cloud sync isn't configured for this deployment yet. Your data stays local until it is.
        </p>
      ) : loading ? (
        <p className="text-sm text-slate-400 mt-2">Checking sign-in status…</p>
      ) : user ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {user.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full" referrerPolicy="no-referrer" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Sign in to sync your progress across devices (coming soon).</p>
          <Button onClick={signInWithGoogle}>
            <LogIn className="h-4 w-4" /> Continue with Google
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function Settings() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const resetAllData = useAppStore((s) => s.resetAllData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function handleExport() {
    const data = exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apfc-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importAllData(String(reader.result));
        setImportMsg('Data restored successfully.');
      } catch {
        setImportMsg('Could not read that file — please check it is a valid backup.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div>
      <PageHeader eyebrow="Preferences" title="Settings" description="Customise your experience and manage your locally stored data." />

      <div className="space-y-6">
        <AccountCard />

        <Card className="p-5 sm:p-6">
          <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Appearance</h3>
          <div className="flex gap-3">
            {(
              [
                { key: 'light', label: 'Light', icon: Sun },
                { key: 'dark', label: 'Dark', icon: Moon },
                { key: 'system', label: 'System', icon: Laptop },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                className={cx(
                  'flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 transition-colors',
                  theme === key ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800',
                )}
              >
                <Icon className={cx('h-5 w-5', theme === key ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400')} />
                <span className={cx('text-xs font-medium', theme === key ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500')}>{label}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Install as an App</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            APFC Tracker is a Progressive Web App — it works offline and installs like a native app on both Android and desktop.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-500 dark:text-slate-400 list-disc list-inside">
            <li>
              <span className="font-medium text-slate-700 dark:text-slate-300">Android (Chrome):</span> tap the menu (⋮) → "Install app" / "Add to Home screen".
            </li>
            <li>
              <span className="font-medium text-slate-700 dark:text-slate-300">iOS (Safari):</span> tap Share → "Add to Home Screen".
            </li>
            <li>
              <span className="font-medium text-slate-700 dark:text-slate-300">Desktop (Chrome/Edge):</span> click the install icon in the address bar.
            </li>
          </ul>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Your Data</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Everything you enter — syllabus progress, notes, test attempts and Pomodoro history — is stored privately on this device only. Back it up regularly.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={handleExport}>
              <Download className="h-4 w-4" /> Export backup (JSON)
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import backup
            </Button>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('This will permanently erase all local progress, notes, and test history. Continue?')) {
                  resetAllData();
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Reset all data
            </Button>
          </div>
          {importMsg && <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">{importMsg}</p>}
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2">
            <Info className="h-4 w-4 text-slate-400" />
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">About the Question Bank</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Questions are practice items written to match the UPSC EPFO APFC exam pattern and syllabus. They are not verbatim reproductions of
            past official papers. Use the Notes section to add real previous-year questions as you come across them.
          </p>
          <Badge tone="neutral" className="mt-3">
            v1.0.0
          </Badge>
        </Card>
      </div>
    </div>
  );
}
