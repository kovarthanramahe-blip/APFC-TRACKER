import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card, BUTTON_VARIANT_CLASSES } from '../components/ui/Primitives';
import { cx } from '../lib/utils';

/** Catch-all route (App.tsx's own `path="*"`) — without this, an unknown/mistyped address
 * rendered a completely blank page: AppShell + its Suspense boundary still mount, but no <Route>
 * matches, so <Routes> renders nothing. */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-sm text-center">
        <Compass className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" strokeWidth={1.75} />
        <h1 className="font-display mt-4 text-xl font-bold text-slate-900 dark:text-white">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          There's nothing here. The page may have moved, or the address may be mistyped.
        </p>
        <Link
          to="/"
          className={cx('mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.97]', BUTTON_VARIANT_CLASSES.primary)}
        >
          Back to Dashboard
        </Link>
      </Card>
    </div>
  );
}
