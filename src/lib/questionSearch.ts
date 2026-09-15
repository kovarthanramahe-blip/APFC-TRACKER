// Question Bank keyword search — a pure, case-insensitive filter over the unified catalog
// (lib/questionCatalog.ts). With 589+ questions and only subject/difficulty/starred filters
// (pages/QuestionBank.tsx), there was no way to jump straight to a known keyword (a scheme name, an
// Act, a figure) without manually scrolling a whole subject. Read-only: never touches
// PYQ_BANK/QUESTION_BANK or any provenance data, purely a predicate over an already-built
// CatalogQuestion.
import type { CatalogQuestion } from './questionCatalog';

/** True when `query` is empty/whitespace-only (matches everything), or appears as a
 * case-insensitive substring in the entry's question text, its topic label, or any of its option
 * texts — so a keyword that only appears in an answer choice still surfaces the question. */
export function matchesQuestionSearch(entry: CatalogQuestion, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  if (entry.question.toLowerCase().includes(q)) return true;
  if (entry.topicLabel.toLowerCase().includes(q)) return true;
  return entry.options.some((opt) => opt.text.toLowerCase().includes(q));
}
