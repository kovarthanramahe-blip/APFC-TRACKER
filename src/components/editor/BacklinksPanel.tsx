import { Link2, FileText, NotebookPen } from 'lucide-react';
import { Badge } from '../ui/Primitives';
import type { Backlink } from '../../lib/backlinks';

// Premium Knowledge Editor, Phase 5F — displays lib/backlinks.ts's getBacklinks() output. Purely
// presentational; the backlink list itself is always computed fresh by the caller (never stored),
// so this component never goes stale on its own.
export function BacklinksPanel({ backlinks, onOpen }: { backlinks: readonly Backlink[]; onOpen: (sourceId: string, sourceType: Backlink['sourceType']) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Link2 className="h-3.5 w-3.5" /> Backlinks {backlinks.length > 0 && `(${backlinks.length})`}
      </p>
      {backlinks.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing links here yet — use [[ in another note or document to link to this one.</p>
      ) : (
        <div className="space-y-1.5">
          {backlinks.map((backlink) => {
            const Icon = backlink.sourceType === 'note' ? NotebookPen : FileText;
            return (
              <button
                key={backlink.relationshipId}
                onClick={() => onOpen(backlink.sourceId, backlink.sourceType)}
                aria-label={`Open ${backlink.sourceTitle} (${backlink.sourceType === 'note' ? 'Note' : 'Document'})`}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{backlink.sourceTitle}</p>
                    <Badge tone="neutral">{backlink.sourceType === 'note' ? 'Note' : 'Document'}</Badge>
                  </div>
                  {backlink.snippet && <p className="mt-0.5 truncate text-[11px] text-slate-400">{backlink.snippet}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
