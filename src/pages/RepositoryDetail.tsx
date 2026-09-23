import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Markdown from 'markdown-to-jsx';
import { ArrowLeft, ArrowRight, Pencil, Trash2, Eye, FileText, Link2, Library, Plus, X } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import { cx } from '../lib/utils';
import {
  getImportedContentById,
  getRepositoryContentTypeMeta,
  repositoryEntryFromImportedContent,
  repositoryEntryFromNote,
  listRepositoryEntries,
  repositoryContentTypeSupports,
  type RepositoryEntry,
  type RepositoryContentType,
} from '../lib/repository';
import {
  getRelatedContent,
  RELATIONSHIP_TYPE_LABELS,
  RELATIONSHIP_TYPES,
  type ContentRelationship,
  type RelationshipEntityType,
  type RelationshipType,
} from '../lib/contentRelationships';
import { navigationTargetFor, repositoryDetailPathFor } from '../lib/repositoryNavigation';
import { canEditEntry, canDeleteEntry, EditMetadataModal, DeleteConfirmModal } from './Repository';
import type { ImportedContentMetadata } from '../lib/contentImport';

// Repository Detail / Preview View — a focused, read-only page for a single repository entity,
// reached from pages/Repository.tsx's own "View" action on each result card. It reuses that same
// page's Edit/Delete modals and capability checks (canEditEntry/canDeleteEntry,
// EditMetadataModal, DeleteConfirmModal — imported from there rather than duplicated), the
// existing lib/contentRelationships.ts relationship utilities for the Related Content section
// (including adding/removing a link — addContentRelationship/deleteContentRelationship, the same
// store actions every other linking flow in this app already calls), and lib/repository.ts's own
// entry projection — never a second storage/relationship mechanism.
//
// The route is /repository/:entityType/:id — BOTH segments are required. Notes and ImportedContent
// are two independently-generated id spaces that are never guaranteed distinct from one another
// (see lib/contentRelationships.ts's own header), so a route keyed on id alone could not safely
// tell which collection to resolve against; entityType removes that ambiguity outright.
//
// Workspace isolation falls out of the same architecture every other page already relies on: the
// store's importedContent/notes fields only ever hold the ACTIVE workspace's own data (see
// lib/store.ts's setActiveWorkspaceId swap). An id belonging to a different, currently
// archived-away workspace simply isn't a member of either array, so the lookup below returns
// undefined and this page renders its "Content not found" state — no separate cross-workspace
// check is needed or possible to get wrong.

function isRelationshipEntityType(value: string | undefined): value is RelationshipEntityType {
  return value === 'note' || value === 'imported_content';
}

/** Read-only content display: a byte-exact "Raw" view (the default — see this stage's own
 * requirement to preserve stored content exactly) and an opt-in "Preview" view that renders
 * Markdown safely via the same library/options pages/Notes.tsx's own note preview already uses
 * (markdown-to-jsx with disableParsingRawHTML — embedded HTML/script tags are never parsed as
 * markup, only shown as inert text). One generic renderer for every content type, including ones
 * with no dedicated page yet (question_bank, pyq, …) — never a specialised per-type renderer. */
function ContentView({ content }: { content: string }) {
  const [mode, setMode] = useState<'raw' | 'preview'>('raw');
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Content</p>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('raw')}
            aria-pressed={mode === 'raw'}
            className={cx(
              'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
              mode === 'raw' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Raw
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            aria-pressed={mode === 'preview'}
            className={cx(
              'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
              mode === 'preview' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
        </div>
      </div>
      {mode === 'raw' ? (
        <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-sans text-slate-700 dark:text-slate-200">
          {content || 'No content.'}
        </pre>
      ) : (
        <div
          className={cx(
            'max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-700 dark:text-slate-200',
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
          )}
        >
          {content.trim() ? (
            <Markdown options={{ disableParsingRawHTML: true, forceBlock: true }}>{content}</Markdown>
          ) : (
            <p className="text-slate-400">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function RepositoryDetail() {
  const navigate = useNavigate();
  const params = useParams<{ entityType: string; id: string }>();
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const notes = useAppStore((s) => s.notes);
  const contentRelationships = useAppStore((s) => s.contentRelationships);
  const updateImportedContent = useAppStore((s) => s.updateImportedContent);
  const deleteImportedContent = useAppStore((s) => s.deleteImportedContent);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const addContentRelationship = useAppStore((s) => s.addContentRelationship);
  const deleteContentRelationship = useAppStore((s) => s.deleteContentRelationship);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkTarget, setLinkTarget] = useState('');
  const [linkType, setLinkType] = useState<RelationshipType>('related_to');
  const [linkError, setLinkError] = useState<string | null>(null);

  const entityType = isRelationshipEntityType(params.entityType) ? params.entityType : undefined;
  const id = params.id;

  const importedItem = entityType === 'imported_content' && id ? getImportedContentById(importedContent, id) : undefined;
  const noteItem = entityType === 'note' && id ? notes.find((n) => n.id === id) : undefined;
  const entry: RepositoryEntry | undefined = importedItem
    ? repositoryEntryFromImportedContent(importedItem)
    : noteItem
      ? repositoryEntryFromNote(noteItem)
      : undefined;

  const relatedEntries =
    entry && entityType && id
      ? getRelatedContent(contentRelationships, id, entityType)
          .map((related) => {
            const relatedImported = related.relatedType === 'imported_content' ? getImportedContentById(importedContent, related.relatedId) : undefined;
            const relatedNote = related.relatedType === 'note' ? notes.find((n) => n.id === related.relatedId) : undefined;
            const relatedEntry = relatedImported
              ? repositoryEntryFromImportedContent(relatedImported)
              : relatedNote
                ? repositoryEntryFromNote(relatedNote)
                : undefined;
            return relatedEntry ? { relationship: related.relationship, entry: relatedEntry } : undefined;
          })
          .filter((x): x is { relationship: ContentRelationship; entry: RepositoryEntry } => !!x)
      : [];

  // Candidates for a NEW link: every other item in the same (active) workspace, excluding this
  // entity itself (self-links are never offered, let alone allowed) and anything already linked
  // in either direction (keeps the picker simple and avoids offering a choice createRelationship
  // would just reject as a duplicate). listRepositoryEntries is already workspace-scoped exactly
  // like every other Repository page's use of it (importedContent/notes only ever hold the active
  // workspace's own data).
  const relatedIds = new Set(relatedEntries.map(({ entry: r }) => `${r.entityType}:${r.entityId}`));
  const linkCandidates =
    entry && entityType && id
      ? listRepositoryEntries(importedContent, notes).filter((candidate) => !(candidate.entityType === entityType && candidate.entityId === id) && !relatedIds.has(`${candidate.entityType}:${candidate.entityId}`))
      : [];

  function handleAddLink() {
    if (!entry || !entityType || !id || !linkTarget) return;
    const [targetType, targetId] = linkTarget.split(':') as [RelationshipEntityType, string];
    const result = addContentRelationship({ source: { id, type: entityType }, target: { id: targetId, type: targetType }, type: linkType });
    if (result.status === 'error') {
      setLinkError(result.message);
      return;
    }
    setLinkError(null);
    setLinkTarget('');
    setShowAddLink(false);
  }

  function handleEditRequest() {
    if (!entry) return;
    if (entry.entityType === 'note') {
      navigate('/notes');
      return;
    }
    setShowEditModal(true);
  }

  function handleEditSave(title: string, contentType: RepositoryContentType, metadata: ImportedContentMetadata | undefined) {
    if (!entry) return;
    updateImportedContent(entry.entityId, { title, contentType, metadata });
    setShowEditModal(false);
  }

  function handleDeleteConfirm() {
    if (!entry) return;
    if (entry.entityType === 'note') deleteNote(entry.entityId);
    else deleteImportedContent(entry.entityId);
    setShowDeleteModal(false);
    navigate('/repository');
  }

  if (!entry) {
    return (
      <div>
        <Link to="/repository" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Back to Repository
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Library className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm">Content not found.</p>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            This item may have been deleted, or it belongs to a different workspace than the one currently active ({getWorkspaceMeta(activeWorkspaceId).label}).
          </p>
        </div>
      </div>
    );
  }

  const meta = getRepositoryContentTypeMeta(entry.contentType);
  const workspaceLabel = getWorkspaceMeta(entry.workspaceId).label;
  const target = navigationTargetFor(entry);
  const date = new Date(entry.createdAt);
  const dateLabel = Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN');
  const updatedDate = new Date(entry.updatedAt);
  const updatedDateLabel = Number.isNaN(updatedDate.getTime()) ? null : updatedDate.toLocaleDateString('en-IN');
  const rawContent = importedItem ? importedItem.rawContent : (noteItem?.content ?? '');
  const originLabel = { import: 'Imported', manual: 'Manually added', created: 'Created' }[entry.origin];

  return (
    <div>
      <Link to="/repository" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Back to Repository
      </Link>

      <PageHeader
        eyebrow="Repository"
        title={entry.title || 'Untitled'}
        description={`${meta.label} in ${workspaceLabel}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {target && (
              <Link
                to={target.to}
                className="inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20"
              >
                {target.label} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {canEditEntry(entry) && (
              <Button variant="secondary" onClick={handleEditRequest}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            {canDeleteEntry(entry) && (
              <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand">{meta.label}</Badge>
          <Badge tone="neutral">{workspaceLabel}</Badge>
          {entry.category && <Badge tone="gold">{entry.category}</Badge>}
        </div>
        <div className="mt-3 grid gap-x-6 gap-y-1 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
          <p>
            <span className="font-medium text-slate-500 dark:text-slate-400">Origin:</span> {originLabel}
          </p>
          <p>
            <span className="font-medium text-slate-500 dark:text-slate-400">{importedItem ? 'Imported' : 'Created'}:</span> {dateLabel ?? '—'}
          </p>
          <p>
            <span className="font-medium text-slate-500 dark:text-slate-400">Last updated:</span> {updatedDateLabel ?? '—'}
          </p>
          {importedItem?.provenance.sourceFilename && (
            <p>
              <span className="font-medium text-slate-500 dark:text-slate-400">Source file:</span> {importedItem.provenance.sourceFilename}
            </p>
          )}
          {importedItem?.provenance.originalFormat && (
            <p>
              <span className="font-medium text-slate-500 dark:text-slate-400">Original format:</span> {importedItem.provenance.originalFormat}
            </p>
          )}
          {importedItem?.provenance.sourceNote && (
            <p className="sm:col-span-2">
              <span className="font-medium text-slate-500 dark:text-slate-400">Source note:</span> {importedItem.provenance.sourceNote}
            </p>
          )}
        </div>
        {entry.description && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{entry.description}</p>}
        {entry.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {tag}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="mb-5 p-4">
        <ContentView content={rawContent} />
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Link2 className="h-3.5 w-3.5" /> Related Content
          </p>
          {repositoryContentTypeSupports(entry.contentType, 'linkable') && !showAddLink && (
            <Button variant="secondary" size="sm" onClick={() => setShowAddLink(true)}>
              <Plus className="h-3.5 w-3.5" /> Add link
            </Button>
          )}
        </div>

        {showAddLink && (
          <div className="mb-3 space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            {linkCandidates.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing else in this workspace to link to yet.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="link-target" className="sr-only">
                    Item to link to
                  </label>
                  <select
                    id="link-target"
                    value={linkTarget}
                    onChange={(e) => setLinkTarget(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    <option value="">Choose an item…</option>
                    {linkCandidates.map((c) => (
                      <option key={`${c.entityType}:${c.entityId}`} value={`${c.entityType}:${c.entityId}`}>
                        {c.title || 'Untitled'} ({getRepositoryContentTypeMeta(c.contentType).label})
                      </option>
                    ))}
                  </select>
                  <label htmlFor="link-type" className="sr-only">
                    Relationship type
                  </label>
                  <select
                    id="link-type"
                    value={linkType}
                    onChange={(e) => setLinkType(e.target.value as RelationshipType)}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    {RELATIONSHIP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {RELATIONSHIP_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                {linkError && <p className="text-xs text-rose-600 dark:text-rose-400">{linkError}</p>}
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddLink(false);
                      setLinkError(null);
                      setLinkTarget('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddLink} disabled={!linkTarget}>
                    Add link
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {relatedEntries.length === 0 ? (
          <p className="text-sm text-slate-400">No linked content yet.</p>
        ) : (
          <div className="space-y-2">
            {relatedEntries.map(({ relationship, entry: relatedEntry }) => {
              const relatedMeta = getRepositoryContentTypeMeta(relatedEntry.contentType);
              return (
                <div
                  key={relationship.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <Link
                    to={repositoryDetailPathFor(relatedEntry.entityType, relatedEntry.entityId)}
                    aria-label={`Open ${relatedEntry.title || 'Untitled'} (${relatedMeta.label})`}
                    className="min-w-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded"
                  >
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{relatedEntry.title || 'Untitled'}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge tone="neutral">{relatedMeta.label}</Badge>
                      <Badge tone="brand">{RELATIONSHIP_TYPE_LABELS[relationship.type]}</Badge>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link to={repositoryDetailPathFor(relatedEntry.entityType, relatedEntry.entityId)} aria-label={`Open ${relatedEntry.title || 'Untitled'}`}>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => deleteContentRelationship(relationship.id)}
                      aria-label={`Remove link to ${relatedEntry.title || 'Untitled'}`}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {showEditModal && (
        <EditMetadataModal entry={entry} existingCategories={[]} onCancel={() => setShowEditModal(false)} onSave={handleEditSave} />
      )}
      {showDeleteModal && <DeleteConfirmModal entry={entry} onCancel={() => setShowDeleteModal(false)} onConfirm={handleDeleteConfirm} />}
    </div>
  );
}
