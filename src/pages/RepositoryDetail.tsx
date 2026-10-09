import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MarkdownPreview } from '../components/markdown/MarkdownPreview';
import { ArrowLeft, ArrowRight, Pencil, Trash2, Eye, FileText, Link2, Library, ListChecks, Plus, X, Repeat, Check, Sparkles } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta, type WorkspaceKind } from '../lib/workspace';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import { cx, formatDate, getLocalDateString } from '../lib/utils';
import { resolveSyllabusNodeLabel } from '../lib/syllabusNodeLabel';
import { resolveApfcTopicPath } from '../lib/apfcSyllabus';
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
  MANUALLY_ASSIGNABLE_RELATIONSHIP_TYPES,
  type ContentRelationship,
  type RelationshipEntityType,
  type RelationshipType,
} from '../lib/contentRelationships';
import { navigationTargetFor, repositoryDetailPathFor } from '../lib/repositoryNavigation';
import { canEditEntry, canDeleteEntry, EditMetadataModal, DeleteConfirmModal, preserveUneditedMetadata } from './Repository';
import type { ImportedContentMetadata } from '../lib/contentImport';
import { DocumentAnnotator, type DocumentAnnotatorHandle } from '../components/annotations/DocumentAnnotator';
import { AnnotationIndex } from '../components/annotations/AnnotationIndex';
import { DocumentIntelligencePanel } from '../components/annotations/DocumentIntelligencePanel';
import type { Annotation } from '../lib/annotations';

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

// resolveSyllabusNodeLabel now lives in lib/syllabusNodeLabel.ts (Phase 3 — pages/Repository.tsx
// needs the same resolver, and a page importing another page risks a circular dependency). Kept
// as a re-export so existing imports of it from this module (e.g. this page's own test file)
// continue to work unchanged.
export { resolveSyllabusNodeLabel };

/** Read-only content display: a byte-exact "Raw" view (the default — see this stage's own
 * requirement to preserve stored content exactly) and an opt-in "Preview" view that renders
 * Markdown safely via the same library/options pages/Notes.tsx's own note preview already uses
 * (markdown-to-jsx with disableParsingRawHTML — embedded HTML/script tags are never parsed as
 * markup, only shown as inert text). One generic renderer for every content type, including ones
 * with no dedicated page yet (question_bank, pyq, …) — never a specialised per-type renderer.
 *
 * Premium Study Reader (Phase 7) — this is the app's existing document reading surface, so the
 * annotation layer (components/annotations/DocumentAnnotator) wraps the actual content block here,
 * keyed by `documentId` (the same `${entityType}:${entityId}` compound key this page already uses
 * elsewhere) plus an explicit `renderMode` ('raw' | 'preview'). Raw and Preview render the SAME
 * underlying text very differently (monospace block vs. flowed Markdown), so freehand ink's pixel
 * geometry is scoped per render mode (never shared) — see lib/annotations.ts's own header for why
 * that's a `renderMode` field on each annotation rather than a suffix on `documentId` itself.
 * Text-anchored annotations (highlight/underline/strikethrough/note — see lib/textAnchor.ts) and
 * the Annotation Index (components/annotations/AnnotationIndex.tsx) are wired in here: this is the
 * ONLY place that owns the Raw/Preview toggle both render modes live behind, so it's also the only
 * place that can switch render mode on the Index's behalf before asking the (now newly-mounted)
 * DocumentAnnotator to scroll to + pulse a clicked annotation (see handleIndexNavigate below). */
// Exported (Wave 4A integration-test gate) solely so a test can render the REAL parent-level
// wiring between DocumentAnnotator's onExplainSelection callback and DocumentIntelligencePanel's
// initialSelectedText prop — the one integration path neither component's own isolated test file
// can prove on its own. No behavioural change; this component is otherwise unchanged and still
// only ever used from this file's own default export below.
export function ContentView({ content, documentId, activeWorkspaceId, route }: { content: string; documentId: string; activeWorkspaceId: WorkspaceKind; route: string }) {
  const [mode, setMode] = useState<'raw' | 'preview'>('raw');
  const [showIndex, setShowIndex] = useState(false);
  const [explainSelectionText, setExplainSelectionText] = useState<string | undefined>(undefined);
  const [showJarvisPanel, setShowJarvisPanel] = useState(false);
  // Integration-test gate fix — opening the panel while it's ALREADY open (e.g. the header "Ask
  // JARVIS" button clicked on top of a visible explain result) used to leave the previous
  // result/mode on screen: `showJarvisPanel` was already true, so `{showJarvisPanel && <...>}`
  // never unmounted/remounted DocumentIntelligencePanel, and that panel's own initialSelectedText
  // effect (deliberately) only reacts to a truthy, changed value — never to it becoming undefined.
  // Bumping this key on every "open" action forces a genuinely fresh panel instance each time,
  // exactly matching what a user opening a NEW JARVIS request expects, without touching
  // DocumentIntelligencePanel.tsx's own (approved) race-fix/state logic at all.
  const [jarvisPanelKey, setJarvisPanelKey] = useState(0);
  const annotatorRef = useRef<DocumentAnnotatorHandle>(null);

  function handleIndexNavigate(annotation: Annotation) {
    const needsModeSwitch = annotation.type !== 'bookmark' && annotation.renderMode !== mode;
    if (needsModeSwitch) {
      setMode(annotation.renderMode);
      // The new render mode's DocumentAnnotator hasn't mounted yet on this same tick — two nested
      // rAFs give React time to commit + lay out the new subtree before navigateToAnnotation reads
      // its (freshly mounted) contentRef/scrollBoxRef.
      requestAnimationFrame(() => requestAnimationFrame(() => annotatorRef.current?.navigateToAnnotation(annotation.id)));
    } else {
      annotatorRef.current?.navigateToAnnotation(annotation.id);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Content</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setExplainSelectionText(undefined);
              setShowJarvisPanel(true);
              setJarvisPanelKey((k) => k + 1);
            }}
            title="Ask JARVIS about this document"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-200 px-2.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-400 dark:hover:bg-brand-500/10"
          >
            <Sparkles className="h-3.5 w-3.5" /> Ask JARVIS
          </button>
          <button
            type="button"
            onClick={() => setShowIndex(true)}
            aria-pressed={showIndex}
            title="Annotation index"
            className={cx(
              'inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            <ListChecks className="h-3.5 w-3.5" /> Index
          </button>
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
      </div>
      {mode === 'raw' ? (
        <DocumentAnnotator
          ref={annotatorRef}
          documentId={documentId}
          renderMode="raw"
          scrollBoxClassName="max-h-[32rem] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
          onExplainSelection={(text) => {
            setExplainSelectionText(text);
            setShowJarvisPanel(true);
            setJarvisPanelKey((k) => k + 1);
          }}
        >
          <pre className="whitespace-pre-wrap break-words p-4 text-sm font-sans text-slate-700 dark:text-slate-200">{content || 'No content.'}</pre>
        </DocumentAnnotator>
      ) : (
        <DocumentAnnotator
          ref={annotatorRef}
          documentId={documentId}
          renderMode="preview"
          scrollBoxClassName="max-h-[32rem] rounded-lg border border-slate-200 dark:border-slate-800"
          onExplainSelection={(text) => {
            setExplainSelectionText(text);
            setShowJarvisPanel(true);
            setJarvisPanelKey((k) => k + 1);
          }}
        >
          <MarkdownPreview content={content} className="p-4" emptyText="Nothing to preview." />
        </DocumentAnnotator>
      )}
      {showIndex && (
        <AnnotationIndex
          documentId={documentId}
          onNavigate={(annotation) => {
            handleIndexNavigate(annotation);
            setShowIndex(false);
          }}
          onClose={() => setShowIndex(false)}
        />
      )}
      {showJarvisPanel && (
        <DocumentIntelligencePanel
          key={jarvisPanelKey}
          documentId={documentId}
          rawText={content}
          activeWorkspaceId={activeWorkspaceId}
          route={route}
          initialSelectedText={explainSelectionText}
          onClose={() => {
            setShowJarvisPanel(false);
            setExplainSelectionText(undefined);
          }}
        />
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
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const addToRevisionQueue = useAppStore((s) => s.addToRevisionQueue);
  const recordRevisionCorrect = useAppStore((s) => s.recordRevisionCorrect);
  const recordRevisionIncorrect = useAppStore((s) => s.recordRevisionIncorrect);

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
    const mergedMetadata = preserveUneditedMetadata(metadata, importedItem, {
      folderId: entry.folderId,
      isPinned: entry.isPinned,
      isArchived: entry.isArchived,
    });
    updateImportedContent(entry.entityId, { title, contentType, metadata: mergedMetadata });
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
  const isCurrentAffairs = importedItem?.contentType === 'current_affairs';
  // Knowledge <-> Syllabus connections (Phase 3) — "Knowledge Detail -> Syllabus": generalised from
  // current_affairs-only (syllabusNodeId/apfcTopicId are now plain, content-type-agnostic metadata
  // fields any knowledge item can carry — see contentImport.ts's own header) to any ImportedContent
  // item that actually has one set. Never invents a value: a Note or an item with neither field
  // simply shows neither line, exactly as before for everything that isn't Current Affairs.
  const syllabusNodeLabel = importedItem?.metadata?.syllabusNodeId ? resolveSyllabusNodeLabel(importedItem.metadata.syllabusNodeId) : undefined;
  const apfcTopicPath = importedItem?.metadata?.apfcTopicId ? resolveApfcTopicPath(importedItem.metadata.apfcTopicId) : undefined;

  // Current Affairs revision — reuses lib/revisionQueue.ts exactly as PYQ practice already does
  // (same RevisionItem shape, same recordRevisionCorrect/recordRevisionIncorrect store actions);
  // the only addition is addToRevisionQueue, since a Current Affairs item has no "attempt" of its
  // own to derive eligibility from the way PYQ practice does.
  const revisionItem = isCurrentAffairs ? revisionQueue[entry.entityId] : undefined;
  const isDueForRevision = !!revisionItem && revisionItem.dueDate <= getLocalDateString();

  function handleAddToRevision() {
    if (!entry) return;
    addToRevisionQueue(entry.entityId, getLocalDateString());
  }
  function handleRevisionCorrect() {
    if (!entry) return;
    recordRevisionCorrect(entry.entityId, getLocalDateString());
  }
  function handleRevisionIncorrect() {
    if (!entry) return;
    recordRevisionIncorrect(entry.entityId, getLocalDateString());
  }

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
          {isCurrentAffairs && importedItem?.metadata?.eventDate && (
            <p>
              <span className="font-medium text-slate-500 dark:text-slate-400">Event date:</span> {formatDate(importedItem.metadata.eventDate)}
            </p>
          )}
          {isCurrentAffairs && importedItem?.metadata?.source && (
            <p>
              <span className="font-medium text-slate-500 dark:text-slate-400">Source:</span> {importedItem.metadata.source}
            </p>
          )}
          {syllabusNodeLabel && (
            <p className="sm:col-span-2">
              <span className="font-medium text-slate-500 dark:text-slate-400">UPSC Syllabus Topic:</span> {syllabusNodeLabel}
            </p>
          )}
          {apfcTopicPath && (
            <p className="sm:col-span-2">
              <span className="font-medium text-slate-500 dark:text-slate-400">APFC Syllabus Topic:</span> {apfcTopicPath.subject.title} › {apfcTopicPath.topic.title}
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

      {isCurrentAffairs && (
        <Card className="mb-5 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Repeat className="h-3.5 w-3.5" /> Revision
          </p>
          {!revisionItem ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-400">Not yet in your revision queue.</p>
              <Button variant="secondary" size="sm" onClick={handleAddToRevision}>
                <Plus className="h-3.5 w-3.5" /> Add to Revision
              </Button>
            </div>
          ) : isDueForRevision ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Due for review now — Box {revisionItem.box}, reviewed {revisionItem.reviewCount} time{revisionItem.reviewCount === 1 ? '' : 's'} so far.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleRevisionIncorrect}>
                  <X className="h-3.5 w-3.5" /> Didn&apos;t recall
                </Button>
                <Button size="sm" onClick={handleRevisionCorrect}>
                  <Check className="h-3.5 w-3.5" /> Recalled it
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Queued for revision — Box {revisionItem.box}, next review {formatDate(revisionItem.dueDate)}.
            </p>
          )}
        </Card>
      )}

      <Card className="mb-5 p-4">
        <ContentView content={rawContent} documentId={`${entry.entityType}:${entry.entityId}`} activeWorkspaceId={entry.workspaceId} route={`/repository/${entry.entityType}/${entry.entityId}`} />
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
                    {MANUALLY_ASSIGNABLE_RELATIONSHIP_TYPES.map((t) => (
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
