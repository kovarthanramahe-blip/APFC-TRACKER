import Markdown from 'markdown-to-jsx';
import { cx } from '../../lib/utils';

// Architecture Deduplication Phase 1 — the shared rendered-Markdown preview, extracted from three
// independent, near-verbatim copies (pages/Notes.tsx's NoteEditor preview, pages/RepositoryDetail.tsx's
// ContentView preview, pages/WorkingBibliography.tsx's ViewSourceModal preview). Every one of those
// copies used the exact same markdown-to-jsx options and the same element-styling contract — this
// component is that contract, centralised once so a future consumer can't drift from it (e.g. forget
// disableParsingRawHTML, or add table/hr styling to only one of the three places).
//
// disableParsingRawHTML is never configurable here on purpose — every one of the three original call
// sites renders content that ultimately comes from a user-provided or imported source, so raw HTML/
// script tags must always render as inert literal text, never be parsed. forceBlock is likewise
// always on, matching every original copy (so a single line of content still renders as a block
// element, not inline text).
const MARKDOWN_ELEMENT_CLASSES = [
  '[&_h1]:font-display [&_h1]:font-semibold [&_h1]:text-lg [&_h1]:mt-3 [&_h1]:mb-2',
  '[&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-3 [&_h2]:mb-1.5',
  '[&_h3]:font-display [&_h3]:font-semibold [&_h3]:text-sm [&_h3]:mt-2 [&_h3]:mb-1',
  '[&_p]:mb-2 [&_p]:leading-relaxed',
  '[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_a]:text-brand-600 dark:[&_a]:text-brand-400 [&_a]:underline',
  '[&_code]:rounded [&_code]:bg-slate-100 dark:[&_code]:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono',
  '[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-100 dark:[&_pre]:bg-slate-800 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 dark:[&_blockquote]:border-slate-700 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-500',
  // Table/hr styling: WorkingBibliography's own copy already had these (added when its Markdown
  // preview was fixed to render structure instead of plain text); Notes.tsx/RepositoryDetail.tsx's
  // copies predate that and had neither, so tables/rules rendered unstyled there. Centralising means
  // all three now get the same complete styling — never a regression, since unstyled-but-present
  // table/hr output is strictly worse than styled, and the underlying Markdown/content is untouched.
  '[&_table]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_td]:border [&_td]:border-slate-200 dark:[&_td]:border-slate-700 [&_td]:px-2 [&_td]:py-1',
  '[&_hr]:my-3 [&_hr]:border-slate-200 dark:[&_hr]:border-slate-800',
].join(' ');

export interface MarkdownPreviewProps {
  /** Plain Markdown source — read-only here, never mutated. */
  content: string;
  /** Caller-specific box styling (min-height, border, rounding, background, padding) — layered on
   * top of the shared base classes below, since each of the three original call sites wrapped this
   * content differently (a bordered box, a DocumentAnnotator child with no border of its own, a
   * plain modal section). */
  className?: string;
  /** Shown instead of the Markdown output when `content` is blank/whitespace-only. Each original
   * call site had its own slightly different wording, so this stays a prop rather than one fixed
   * string. */
  emptyText?: string;
}

/** The shared rendered-Markdown preview — see this module's own header for why every option here is
 * fixed (never a prop) rather than configurable. */
export function MarkdownPreview({ content, className, emptyText = 'Nothing to preview yet.' }: MarkdownPreviewProps) {
  return (
    <div className={cx('text-sm text-slate-700 dark:text-slate-200', MARKDOWN_ELEMENT_CLASSES, className)}>
      {content.trim() ? (
        <Markdown options={{ disableParsingRawHTML: true, forceBlock: true }}>{content}</Markdown>
      ) : (
        <p className="text-slate-400">{emptyText}</p>
      )}
    </div>
  );
}
