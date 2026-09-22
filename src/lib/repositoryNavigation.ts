import type { RepositoryEntry } from './repository';

// Where a repository result/entry should send the user — the existing page that already owns that
// content, never a new editor. Shared by pages/Repository.tsx (each result card) and
// components/repository/ImportToRepositoryModal.tsx (the post-save success state's "open" link),
// kept in its own module rather than defined on the page so the modal component doesn't need to
// import a page module (which would import the modal back — a needless circular dependency).
// Content types with no dedicated persistence UI yet (question_bank, descriptive_questions, pyq,
// other — see lib/repository.ts's own registry notes) have no target: there is nowhere real to
// send the user, so none is invented.
export function navigationTargetFor(entry: RepositoryEntry): { to: string; label: string } | undefined {
  switch (entry.contentType) {
    case 'note':
      return { to: '/notes', label: 'Open in Notes' };
    case 'research_document':
      return { to: '/phd-research', label: 'Open in PhD Research' };
    case 'bibliography':
      return { to: '/phd-research/bibliography', label: 'Open in Working Bibliography' };
    default:
      return undefined;
  }
}
