import { useState } from 'react';
import { X, Link2, Unlink } from 'lucide-react';
import { Badge, Button } from '../ui/Primitives';
import type { Note } from '../../lib/types';
import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  getOutgoingRelationships,
  type ContentRelationship,
  type RelationshipType,
} from '../../lib/contentRelationships';

// Notes <-> Research Repository Linking — shared by pages/WorkingBibliography.tsx (a bibliography
// record's "Linked Notes") and pages/PhdResearch.tsx (a research document's "Linked Notes"): both
// are an ImportedContent item linking to a Note, identical in every way except which ImportedContent
// item is doing the linking, so this one component serves both rather than duplicating it. Creation
// is always initiated from THIS side (the ImportedContent item is the relationship's source, the
// selected Note its target) — the Notes page itself only displays and unlinks (see
// pages/Notes.tsx's NoteEditor), never creates, matching exactly what this stage scoped each side
// to. Never infers a link from a title, tag, or content match — only an explicit pick below.
export function LinkedNotesModal({
  sourceId,
  sourceLabel,
  notes,
  relationships,
  onLink,
  onUnlink,
  onClose,
}: {
  /** The ImportedContent item (bibliography record or research document) doing the linking. */
  sourceId: string;
  sourceLabel: string;
  notes: Note[];
  relationships: ContentRelationship[];
  onLink: (noteId: string, type: RelationshipType) => { status: 'ok' } | { status: 'error'; message: string };
  onUnlink: (relationshipId: string) => void;
  onClose: () => void;
}) {
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [selectedType, setSelectedType] = useState<RelationshipType>('cites');
  const [linkError, setLinkError] = useState<string | null>(null);

  const linked = getOutgoingRelationships(relationships, sourceId, 'imported_content')
    .filter((r) => r.targetType === 'note')
    .map((relationship) => ({ relationship, note: notes.find((n) => n.id === relationship.targetId) }))
    .filter((entry): entry is { relationship: ContentRelationship; note: Note } => !!entry.note);

  const linkedNoteIds = new Set(linked.map((entry) => entry.note.id));
  const availableNotes = notes.filter((n) => !linkedNoteIds.has(n.id));

  function handleLink() {
    if (!selectedNoteId) return;
    const result = onLink(selectedNoteId, selectedType);
    if (result.status === 'error') {
      setLinkError(result.message);
      return;
    }
    setLinkError(null);
    setSelectedNoteId('');
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">Linked Notes — {sourceLabel}</h3>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
          {linked.length === 0 ? (
            <p className="text-sm text-slate-400">No notes linked yet.</p>
          ) : (
            <div className="space-y-2">
              {linked.map(({ relationship, note }) => (
                <div key={relationship.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{note.title || 'Untitled note'}</p>
                    <Badge tone="brand" className="mt-1">
                      {RELATIONSHIP_TYPE_LABELS[relationship.type]}
                    </Badge>
                  </div>
                  <button
                    onClick={() => onUnlink(relationship.id)}
                    aria-label="Unlink"
                    title="Unlink"
                    className="shrink-0 rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {availableNotes.length === 0 ? (
            <p className="text-xs text-slate-400">{notes.length === 0 ? 'No notes in this workspace yet.' : 'Every note is already linked.'}</p>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Link a note</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={selectedNoteId}
                  onChange={(e) => setSelectedNoteId(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <option value="">Select a note…</option>
                  {availableNotes.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.title || 'Untitled note'}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as RelationshipType)}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {RELATIONSHIP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RELATIONSHIP_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <Button onClick={handleLink} disabled={!selectedNoteId}>
                  <Link2 className="h-3.5 w-3.5" /> Link
                </Button>
              </div>
              {linkError && <p className="text-xs text-rose-500">{linkError}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
