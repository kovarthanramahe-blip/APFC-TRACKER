import { cx } from '../../lib/utils';

// PhD Research — Related Content Summary display. One small, reusable component shared by
// pages/PhdResearch.tsx (research document cards), pages/WorkingBibliography.tsx (bibliography
// rows) and pages/Notes.tsx (a note's "Linked Research" section), so the compact "Related: 2 Notes
// · 1 Source" line and its empty state are written once, not duplicated three times. Counts are
// always passed in already computed (see lib/relatedContentSummary.ts) — this component only
// renders them; it never reads the store or the relationship model itself.
//
// Each segment with an `onOpen` renders as a real <button> whose visible text is the count PLUS a
// label (never a bare number) and whose accessible name is explicit — clicking it opens the
// existing linking modal for that relationship kind (see each page's own onOpen wiring), never a
// new relationship UI. A segment with no `onOpen` (used by pages/Notes.tsx, which has no separate
// modal to open — the full detail already renders directly below the summary) renders as plain
// text instead of a non-functional button.

export interface RelatedContentSummarySegment {
  count: number;
  singularLabel: string;
  pluralLabel: string;
  /** Accessible name for the segment's button. Defaults to "<count> <label>" (the same as the
   * visible text) when omitted — always provide one when the visible text alone wouldn't make the
   * button's purpose clear out of context. */
  accessibleLabel?: string;
  /** Opens the existing modal/section for this relationship kind. Omit to render plain (non-
   * interactive) text — there is nothing separate to open. */
  onOpen?: () => void;
}

export function RelatedContentSummary({
  segments,
  emptyLabel = 'No linked research yet',
  prefix = 'Related: ',
  className,
}: {
  segments: RelatedContentSummarySegment[];
  emptyLabel?: string;
  /** Set to '' to omit the leading label entirely (e.g. when the surrounding heading already says
   * "Linked Research"). */
  prefix?: string;
  className?: string;
}) {
  const visible = segments.filter((s) => s.count > 0);

  if (visible.length === 0) {
    // Subtle, not visually dominant — see the task this was built for.
    return <p className={cx('text-xs text-slate-400 dark:text-slate-500', className)}>{emptyLabel}</p>;
  }

  return (
    <p className={cx('text-xs text-slate-500 dark:text-slate-400', className)}>
      {prefix && <span className="font-medium text-slate-600 dark:text-slate-300">{prefix}</span>}
      {visible.map((segment, i) => {
        const text = `${segment.count} ${segment.count === 1 ? segment.singularLabel : segment.pluralLabel}`;
        return (
          <span key={i}>
            {i > 0 && (
              <span className="mx-1 text-slate-300 dark:text-slate-600" aria-hidden="true">
                ·
              </span>
            )}
            {segment.onOpen ? (
              <button
                type="button"
                onClick={segment.onOpen}
                aria-label={segment.accessibleLabel ?? text}
                className="rounded font-medium text-brand-600 dark:text-brand-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                {text}
              </button>
            ) : (
              <span className="font-medium text-slate-700 dark:text-slate-200">{text}</span>
            )}
          </span>
        );
      })}
    </p>
  );
}
