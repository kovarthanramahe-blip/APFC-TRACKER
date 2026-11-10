import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CalendarDays, Check, CheckCircle2, Clock, Eye, FileText, Newspaper, Sparkles, Timer, Trophy, X } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getLocalDateString, cx } from '../lib/utils';
import { Card, PageHeader, Button, Badge, StatCard, SectionHeader, EmptyState, Tabs, type TabItem, cardEntrance, WorkspaceComingSoon } from '../components/ui/Primitives';
import { motion } from 'framer-motion';
import {
  computeRevisionOSSnapshot,
  computeCseCurrentAffairsRevisionSnapshot,
  REVISION_BUCKET_ORDER,
  REVISION_BUCKET_LABEL,
  type RevisionBucketKey,
  type CurrentAffairsRevisionItem,
} from '../lib/revisionOS';
import { repositoryDetailPathFor } from '../lib/repositoryNavigation';
import { getWorkspaceMeta } from '../lib/workspace';
import { SYLLABUS } from '../data/syllabus';
import type { RelationshipEntityType } from '../lib/contentRelationships';

// Revision OS (Phase 17) — APFC's own first-class revision workspace, built entirely on top of
// the EXISTING revision engine (lib/revisionQueue.ts + lib/pyqFilters.ts, via lib/revisionOS.ts's
// thin aggregation — see that file's own header). APFC's own section below (CseRevisionView's
// sibling, the default export's 'apfc' branch) is UNCHANGED from before P1.5 — same snapshot call,
// same UI, same "Start Revision Session" -> /pyq-test flow.
//
// P1.5 — UPSC CSE gets its OWN parallel section (CseRevisionView below), built on
// lib/revisionOS.ts's computeCseCurrentAffairsRevisionSnapshot (Current Affairs articles, not PYQs
// — see that function's own header). PhD research keeps the WorkspaceComingSoon gate: it has no
// syllabus/taxonomy to revise against and this change does not invent one (see
// lib/knowledgeClassification.ts's taxonomyForWorkspace, which still returns undefined for it).

const BUCKET_META: Record<RevisionBucketKey, { icon: typeof AlertTriangle; badgeTone: 'danger' | 'warning' | 'jarvis' | 'neutral' }> = {
  overdue: { icon: AlertTriangle, badgeTone: 'danger' },
  today: { icon: Clock, badgeTone: 'warning' },
  tomorrow: { icon: CalendarClock, badgeTone: 'jarvis' },
  thisWeek: { icon: CalendarDays, badgeTone: 'neutral' },
  later: { icon: CalendarDays, badgeTone: 'neutral' },
};

type FilterKey = 'all' | 'overdue' | 'today' | 'upcoming';
const FILTER_TABS: TabItem[] = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
];

function bucketMatchesFilter(bucket: RevisionBucketKey, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return bucket === 'overdue';
  if (filter === 'today') return bucket === 'today';
  return bucket === 'tomorrow' || bucket === 'thisWeek' || bucket === 'later';
}

function matchesFilter(item: { bucket: RevisionBucketKey }, filter: FilterKey): boolean {
  return bucketMatchesFilter(item.bucket, filter);
}

/** `documentId` is always `${entityType}:${entityId}` (see lib/annotations.ts's own
 * AnnotationBase.documentId doc comment) — splitting on the first ':' recovers both halves for
 * navigation back to the real Repository entry. Neither half (a fixed entityType literal, or a
 * uuid()-generated entityId) ever itself contains a ':', so this is a safe, exact split, not a
 * guess. */
function repositoryPathForDocumentId(documentId: string): string | null {
  const separatorIndex = documentId.indexOf(':');
  if (separatorIndex === -1) return null;
  const entityType = documentId.slice(0, separatorIndex) as RelationshipEntityType;
  const entityId = documentId.slice(separatorIndex + 1);
  if (entityType !== 'note' && entityType !== 'imported_content') return null;
  return repositoryDetailPathFor(entityType, entityId);
}

export default function Revision() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  if (activeWorkspaceId === 'upsc_cse') return <CseRevisionView />;
  if (activeWorkspaceId !== 'apfc') {
    return (
      <div>
        <PageHeader eyebrow="Revision OS" title="Revision" />
        <WorkspaceComingSoon icon={Clock} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }
  return <ApfcRevisionView />;
}

function ApfcRevisionView() {
  const navigate = useNavigate();
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const recordRevisionCorrect = useAppStore((s) => s.recordRevisionCorrect);
  // Wave 4A (2nd round) — the same `annotations` array DocumentAnnotator/AnnotationIndex already
  // read/write, passed through so bridged annotation entries can be surfaced here too (see
  // lib/revisionOS.ts's own header). Never a second annotation store/cache.
  const annotations = useAppStore((s) => s.annotations);
  // P2.3 — the same recordRevisionIncorrect action CseRevisionView's own "Didn't recall" button
  // (below) and the real /pyq-test?mode=due_revision quiz flow (PYQTest.tsx's checkRevisionAnswer)
  // already use; no new engine, no new store action.
  const recordRevisionIncorrect = useAppStore((s) => s.recordRevisionIncorrect);
  const [filter, setFilter] = useState<FilterKey>('all');

  // Revision <-> Focus OS (Phase 20) — the same subjectId -> colorKey lookup pages/StudyPlan.tsx's
  // own Start Focus action already performs, just for the Focus deep link's optional ?subject=.
  const subjectColorById = useMemo(() => new Map(SYLLABUS.map((s) => [s.id, s.colorKey])), []);

  const today = useMemo(() => getLocalDateString(), []);
  const snapshot = useMemo(
    () => computeRevisionOSSnapshot(pyqAttempts, bookmarkedPyqIds, revisionQueue, today, annotations),
    [pyqAttempts, bookmarkedPyqIds, revisionQueue, today, annotations],
  );

  const dueNowCount = snapshot.byBucket.overdue.length + snapshot.byBucket.today.length;
  const filteredItems = snapshot.items.filter((item) => matchesFilter(item, filter));

  // P2.8 — a manual list action with no checked answer behind it, never 'quiz': 'self_report'.
  function handleMarkReviewed(itemId: string) {
    recordRevisionCorrect(itemId, today, 'self_report');
  }

  // P2.3 — the self-report counterpart to handleMarkReviewed above: lets a user reset an item back
  // to box 1 directly from the due list, mirroring CseRevisionView's own handleDidNotRecall exactly
  // (same recordRevisionIncorrect action, same itemId/today convention). Before this, the list had
  // no way to demote an item without a detour through a real /pyq-test?mode=due_revision session.
  function handleDidNotKnow(itemId: string) {
    recordRevisionIncorrect(itemId, today, 'self_report');
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow="Revision OS"
        title="Revision"
        description="Every PYQ worth revisiting — bookmarked or ever answered incorrectly — scheduled automatically and organised by when it's actually due."
        action={
          <Button size="lg" disabled={dueNowCount === 0} onClick={() => navigate('/pyq-test?mode=due_revision')}>
            Start Revision Session
          </Button>
        }
      />

      <motion.div {...cardEntrance}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatCard icon={AlertTriangle} label="Overdue" value={`${snapshot.byBucket.overdue.length}`} accentClassName="text-danger-600 dark:text-danger-400" />
          <StatCard icon={Clock} label="Due today" value={`${snapshot.byBucket.today.length}`} accentClassName="text-warning-600 dark:text-warning-400" />
          <StatCard icon={CalendarDays} label="This week" value={`${snapshot.byBucket.tomorrow.length + snapshot.byBucket.thisWeek.length}`} accentClassName="text-jarvis-600 dark:text-jarvis-400" />
          <StatCard icon={Trophy} label="Mastered" value={`${snapshot.counts.masteredCount}`} accentClassName="text-gold-600 dark:text-gold-400" />
          {/* P2.6 — Daily Revision Progress Statistics: both derived purely from lib/revisionOS.ts's
              countReviewedToday/countNeedsAnotherLook over already-persisted fields; see that
              file's own header for exactly why each is honest (never fabricated) and distinct from
              "Mastered"/"Total Reviews" (pages/Analytics.tsx, all-time) shown elsewhere. */}
          <StatCard icon={Check} label="Reviewed today" value={`${snapshot.reviewedTodayCount}`} accentClassName="text-success-600 dark:text-success-400" />
          <StatCard icon={Eye} label="Needs another look" value={`${snapshot.needsAnotherLookCount}`} accentClassName="text-warning-600 dark:text-warning-400" />
        </div>
      </motion.div>

      {snapshot.items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Revision queue clear"
          description="Bookmark a PYQ or miss one during practice and it will be scheduled here automatically, using a Leitner spaced-repetition system."
        />
      ) : (
        <>
          <motion.div {...cardEntrance}>
            <Card className="p-4">
              <Tabs tabs={FILTER_TABS} activeId={filter} onChange={(id) => setFilter(id as FilterKey)} />
            </Card>
          </motion.div>

          {filteredItems.length === 0 ? (
            <EmptyState icon={Sparkles} title={`Nothing in "${FILTER_TABS.find((t) => t.id === filter)?.label}"`} description="Try a different filter." />
          ) : (
            <div className="space-y-6">
              {REVISION_BUCKET_ORDER.filter((bucket) => bucketMatchesFilter(bucket, filter)).map((bucket) => {
                const items = snapshot.byBucket[bucket];
                if (items.length === 0) return null;
                const meta = BUCKET_META[bucket];
                const BucketIcon = meta.icon;
                return (
                  <motion.div key={bucket} {...cardEntrance}>
                    <Card className="p-5 sm:p-6">
                      <SectionHeader
                        title={REVISION_BUCKET_LABEL[bucket]}
                        action={<Badge tone={meta.badgeTone}>{items.length}</Badge>}
                      />
                      <ul className="space-y-2">
                        {items.map((item) => (
                          <li key={item.id}>
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 p-3.5 dark:border-slate-800">
                              <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800', meta.badgeTone === 'danger' ? 'text-danger-600 dark:text-danger-400' : meta.badgeTone === 'warning' ? 'text-warning-600 dark:text-warning-400' : meta.badgeTone === 'jarvis' ? 'text-jarvis-600 dark:text-jarvis-400' : 'text-slate-500 dark:text-slate-400')}>
                                <BucketIcon className="h-4.5 w-4.5" aria-hidden="true" />
                              </span>
                              {item.source === 'pyq' ? (
                                <>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.topicTitle}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                                      <span>{item.subjectTitle}</span>
                                      <span aria-hidden="true">·</span>
                                      <span>Box {item.box}</span>
                                      {item.isNew && (
                                        <Badge tone="jarvis" className="ml-0.5">
                                          New
                                        </Badge>
                                      )}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const colorKey = subjectColorById.get(item.subjectId);
                                      const params = new URLSearchParams({ context: item.topicTitle });
                                      if (colorKey) params.set('subject', colorKey);
                                      navigate(`/pomodoro?${params.toString()}`);
                                    }}
                                    className="shrink-0"
                                  >
                                    <Timer className="h-3.5 w-3.5" /> Focus
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => navigate(`/syllabus?topicId=${encodeURIComponent(item.topicId)}`)} className="shrink-0">
                                    View Topic
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.preview}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                                      <Badge tone="neutral" className="gap-1">
                                        <FileText className="h-3 w-3" /> From your annotations
                                      </Badge>
                                      <span aria-hidden="true">·</span>
                                      <span>Box {item.box}</span>
                                      {item.isNew && (
                                        <Badge tone="jarvis" className="ml-0.5">
                                          New
                                        </Badge>
                                      )}
                                    </p>
                                  </div>
                                  {repositoryPathForDocumentId(item.documentId) && (
                                    <Button variant="ghost" size="sm" onClick={() => navigate(repositoryPathForDocumentId(item.documentId)!)} className="shrink-0">
                                      View Source
                                    </Button>
                                  )}
                                </>
                              )}
                              {/* P2.3 — mirrors CseRevisionView's "Didn't recall" (same variant, same X icon,
                                  same position immediately before the positive action) so a user can demote
                                  an item back to box 1 directly from this list, not only via a real quiz.
                                  Applies identically to a PYQ or an annotation-derived item — both share the
                                  same real RevisionQueue key (item.id) that recordRevisionIncorrect acts on. */}
                              <Button variant="secondary" size="sm" onClick={() => handleDidNotKnow(item.id)} className="shrink-0">
                                <X className="h-3.5 w-3.5" /> Didn&apos;t know it
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => handleMarkReviewed(item.id)} className="shrink-0">
                                Mark Reviewed
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// P1.5 — UPSC CSE's own revision view, built on computeCseCurrentAffairsRevisionSnapshot (Current
// Affairs articles added via RepositoryDetail.tsx's "Add to Revision" button — see that function's
// own header for exactly why eligibility/content-resolution differs from APFC's PYQ-based view
// above). Same bucket ordering/labels/stat-card layout as ApfcRevisionView for visual consistency,
// but its own item row: a title + source/date (never a fabricated subject/topic), a "View Article"
// link to the article's own RepositoryDetail page (where the full content actually lives — this
// page never duplicates or truncates it), and the SAME two-outcome review action RepositoryDetail's
// own per-item revision card already offers ("Recalled it" / "Didn't recall" -> recordRevisionCorrect
// / recordRevisionIncorrect), so a review can be completed right from this due-list without a
// detour through Repository for every item.
function CseRevisionView() {
  const navigate = useNavigate();
  const importedContent = useAppStore((s) => s.importedContent);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const recordRevisionCorrect = useAppStore((s) => s.recordRevisionCorrect);
  const recordRevisionIncorrect = useAppStore((s) => s.recordRevisionIncorrect);
  const [filter, setFilter] = useState<FilterKey>('all');

  const today = useMemo(() => getLocalDateString(), []);
  const snapshot = useMemo(() => computeCseCurrentAffairsRevisionSnapshot(importedContent, revisionQueue, today), [importedContent, revisionQueue, today]);

  const filteredItems = snapshot.items.filter((item) => matchesFilter(item, filter));

  // P2.8 — a manual list action with no checked answer behind it, never 'quiz': 'self_report'.
  function handleRecalled(itemId: string) {
    recordRevisionCorrect(itemId, today, 'self_report');
  }
  function handleDidNotRecall(itemId: string) {
    recordRevisionIncorrect(itemId, today, 'self_report');
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow="Revision OS"
        title="Revision"
        description="Current Affairs articles you've added to revision, scheduled automatically and organised by when they're actually due."
      />

      <motion.div {...cardEntrance}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatCard icon={AlertTriangle} label="Overdue" value={`${snapshot.byBucket.overdue.length}`} accentClassName="text-danger-600 dark:text-danger-400" />
          <StatCard icon={Clock} label="Due today" value={`${snapshot.byBucket.today.length}`} accentClassName="text-warning-600 dark:text-warning-400" />
          <StatCard icon={CalendarDays} label="This week" value={`${snapshot.byBucket.tomorrow.length + snapshot.byBucket.thisWeek.length}`} accentClassName="text-jarvis-600 dark:text-jarvis-400" />
          <StatCard icon={Trophy} label="Mastered" value={`${snapshot.counts.masteredCount}`} accentClassName="text-gold-600 dark:text-gold-400" />
          {/* P2.6 — same two stats as ApfcRevisionView above, over the CSE Current Affairs
              snapshot's own eligible ids (lib/revisionOS.ts's computeCseCurrentAffairsRevisionSnapshot). */}
          <StatCard icon={Check} label="Reviewed today" value={`${snapshot.reviewedTodayCount}`} accentClassName="text-success-600 dark:text-success-400" />
          <StatCard icon={Eye} label="Needs another look" value={`${snapshot.needsAnotherLookCount}`} accentClassName="text-warning-600 dark:text-warning-400" />
        </div>
      </motion.div>

      {snapshot.items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Revision queue clear"
          description={'Open a Current Affairs article in Repository and use "Add to Revision" — it will be scheduled here automatically, using the same Leitner spaced-repetition system as PYQ revision.'}
        />
      ) : (
        <>
          <motion.div {...cardEntrance}>
            <Card className="p-4">
              <Tabs tabs={FILTER_TABS} activeId={filter} onChange={(id) => setFilter(id as FilterKey)} />
            </Card>
          </motion.div>

          {filteredItems.length === 0 ? (
            <EmptyState icon={Sparkles} title={`Nothing in "${FILTER_TABS.find((t) => t.id === filter)?.label}"`} description="Try a different filter." />
          ) : (
            <div className="space-y-6">
              {REVISION_BUCKET_ORDER.filter((bucket) => bucketMatchesFilter(bucket, filter)).map((bucket) => {
                const items = snapshot.byBucket[bucket];
                if (items.length === 0) return null;
                const meta = BUCKET_META[bucket];
                const BucketIcon = meta.icon;
                return (
                  <motion.div key={bucket} {...cardEntrance}>
                    <Card className="p-5 sm:p-6">
                      <SectionHeader
                        title={REVISION_BUCKET_LABEL[bucket]}
                        action={<Badge tone={meta.badgeTone}>{items.length}</Badge>}
                      />
                      <ul className="space-y-2">
                        {items.map((item: CurrentAffairsRevisionItem) => (
                          <li key={item.id}>
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 p-3.5 dark:border-slate-800">
                              <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800', meta.badgeTone === 'danger' ? 'text-danger-600 dark:text-danger-400' : meta.badgeTone === 'warning' ? 'text-warning-600 dark:text-warning-400' : meta.badgeTone === 'jarvis' ? 'text-jarvis-600 dark:text-jarvis-400' : 'text-slate-500 dark:text-slate-400')}>
                                <BucketIcon className="h-4.5 w-4.5" aria-hidden="true" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.title || 'Untitled'}</p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                                  <Newspaper className="h-3 w-3" aria-hidden="true" />
                                  <span>{[item.source, item.eventDate, `Box ${item.box}`].filter(Boolean).join(' · ')}</span>
                                  {item.isNew && (
                                    <Badge tone="jarvis" className="ml-0.5">
                                      New
                                    </Badge>
                                  )}
                                </p>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => navigate(repositoryDetailPathFor('imported_content', item.id))} className="shrink-0">
                                View Article
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => handleDidNotRecall(item.id)} className="shrink-0">
                                <X className="h-3.5 w-3.5" /> Didn&apos;t recall
                              </Button>
                              <Button size="sm" onClick={() => handleRecalled(item.id)} className="shrink-0">
                                <Check className="h-3.5 w-3.5" /> Recalled it
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
