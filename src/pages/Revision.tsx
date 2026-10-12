import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Clock, FileText, Sparkles, Timer, Trophy, type LucideIcon } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getLocalDateString, cx } from '../lib/utils';
import { Card, PageHeader, Button, Badge, fadeUp, WorkspaceComingSoon } from '../components/ui/Primitives';
import { motion } from 'framer-motion';
import { computeRevisionOSSnapshot, REVISION_BUCKET_ORDER, REVISION_BUCKET_LABEL, type RevisionBucketKey, type RevisionOSItem } from '../lib/revisionOS';
import { getWorkspaceMeta } from '../lib/workspace';
import { SYLLABUS } from '../data/syllabus';
import { repositoryDetailPathFor } from '../lib/repositoryNavigation';
import type { RelationshipEntityType } from '../lib/contentRelationships';

// Revision OS (Phase 17) — APFC's own first-class revision workspace, built entirely on top of
// the EXISTING revision engine (lib/revisionQueue.ts + lib/pyqFilters.ts, via lib/revisionOS.ts's
// thin aggregation — see that file's own header). Scope matches pages/Dashboard.tsx's own
// precedent: APFC-only, since PYQ_BANK (the content this revises) is APFC-only data; a non-APFC
// workspace gets the same WorkspaceComingSoon gate Dashboard/Syllabus already use.
//
// Integration branch note — this page previously depended on StatCard/SectionHeader/EmptyState/
// Tabs/TabItem/cardEntrance, none of which exist in this branch's actual components/ui/Primitives.tsx
// (that file only has Card/ProgressBar/StatTile/Badge/Button/PageHeader/WorkspaceComingSoon/
// fadeUp/staggerContainer). Rather than expand that shared file with five new exports for one
// page, every missing piece below is a small, local, non-exported helper — `fadeUp` (already
// exported) stands in for the old `cardEntrance` (same {initial, animate, transition} shape).
// Badge's own tone union here (`'neutral' | 'brand' | 'gold' | 'success' | 'danger' | 'warning'`)
// also has no 'jarvis' tone (no such Tailwind color token exists in this branch at all) — every
// former `tone="jarvis"` / `text-jarvis-*` usage below maps to the app's own `brand` tone/color,
// the closest existing accent.

/** Local stand-in for the old shared StatCard (icon + label + value, tinted). */
function RevisionStatCard({ icon: Icon, label, value, toneClassName }: { icon: LucideIcon; label: string; value: string; toneClassName: string }) {
  return (
    <Card className="p-4">
      <div className={cx('mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800', toneClassName)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="font-display text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
    </Card>
  );
}

/** Local stand-in for the old shared SectionHeader (title + optional trailing action). */
function RevisionSectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      {action}
    </div>
  );
}

/** Local stand-in for the old shared EmptyState (icon + title + description), matching the same
 * visual pattern WorkspaceComingSoon (components/ui/Primitives.tsx) already uses elsewhere. */
function RevisionEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-16 px-6 text-center">
      <Icon className="h-9 w-9 text-slate-300 dark:text-slate-700 mb-3" aria-hidden="true" />
      <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-400">{description}</p>
    </div>
  );
}

const BUCKET_META: Record<RevisionBucketKey, { icon: LucideIcon; badgeTone: 'danger' | 'warning' | 'brand' | 'neutral'; iconClassName: string }> = {
  overdue: { icon: AlertTriangle, badgeTone: 'danger', iconClassName: 'text-danger-600 dark:text-danger-400' },
  today: { icon: Clock, badgeTone: 'warning', iconClassName: 'text-warning-600 dark:text-warning-400' },
  tomorrow: { icon: CalendarClock, badgeTone: 'brand', iconClassName: 'text-brand-600 dark:text-brand-400' },
  thisWeek: { icon: CalendarDays, badgeTone: 'neutral', iconClassName: 'text-slate-500 dark:text-slate-400' },
  later: { icon: CalendarDays, badgeTone: 'neutral', iconClassName: 'text-slate-500 dark:text-slate-400' },
};

type FilterKey = 'all' | 'overdue' | 'today' | 'upcoming';
const FILTER_TABS: { id: FilterKey; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
];

/** Local stand-in for the old shared Tabs component — the same pill-row pattern already used
 * elsewhere in this app (e.g. pages/RepositoryDetail.tsx's own Raw/Preview toggle). */
function FilterTabs({ active, onChange }: { active: FilterKey; onChange: (id: FilterKey) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
      {FILTER_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-pressed={active === tab.id}
          className={cx(
            'rounded-md px-2.5 py-1 font-medium transition-colors',
            active === tab.id ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function bucketMatchesFilter(bucket: RevisionBucketKey, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return bucket === 'overdue';
  if (filter === 'today') return bucket === 'today';
  return bucket === 'tomorrow' || bucket === 'thisWeek' || bucket === 'later';
}

function matchesFilter(item: RevisionOSItem, filter: FilterKey): boolean {
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
  const navigate = useNavigate();
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const recordRevisionCorrect = useAppStore((s) => s.recordRevisionCorrect);
  // Wave 4A (2nd round) — the same `annotations` array DocumentAnnotator/AnnotationIndex already
  // read/write, passed through so bridged annotation entries can be surfaced here too (see
  // lib/revisionOS.ts's own header). Never a second annotation store/cache.
  const annotations = useAppStore((s) => s.annotations);
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

  function handleMarkReviewed(itemId: string) {
    recordRevisionCorrect(itemId, today);
  }

  if (activeWorkspaceId !== 'apfc') {
    return (
      <div>
        <PageHeader eyebrow="Revision OS" title="Revision" />
        <WorkspaceComingSoon icon={Clock} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
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

      <motion.div {...fadeUp}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RevisionStatCard icon={AlertTriangle} label="Overdue" value={`${snapshot.byBucket.overdue.length}`} toneClassName="text-danger-600 dark:text-danger-400" />
          <RevisionStatCard icon={Clock} label="Due today" value={`${snapshot.byBucket.today.length}`} toneClassName="text-warning-600 dark:text-warning-400" />
          <RevisionStatCard icon={CalendarDays} label="This week" value={`${snapshot.byBucket.tomorrow.length + snapshot.byBucket.thisWeek.length}`} toneClassName="text-brand-600 dark:text-brand-400" />
          <RevisionStatCard icon={Trophy} label="Mastered" value={`${snapshot.counts.masteredCount}`} toneClassName="text-gold-600 dark:text-gold-400" />
        </div>
      </motion.div>

      {snapshot.items.length === 0 ? (
        <RevisionEmptyState
          icon={CheckCircle2}
          title="Revision queue clear"
          description="Bookmark a PYQ or miss one during practice and it will be scheduled here automatically, using a Leitner spaced-repetition system."
        />
      ) : (
        <>
          <motion.div {...fadeUp}>
            <Card className="p-4">
              <FilterTabs active={filter} onChange={setFilter} />
            </Card>
          </motion.div>

          {filteredItems.length === 0 ? (
            <RevisionEmptyState icon={Sparkles} title={`Nothing in "${FILTER_TABS.find((t) => t.id === filter)?.label}"`} description="Try a different filter." />
          ) : (
            <div className="space-y-6">
              {REVISION_BUCKET_ORDER.filter((bucket) => bucketMatchesFilter(bucket, filter)).map((bucket) => {
                const items = snapshot.byBucket[bucket];
                if (items.length === 0) return null;
                const meta = BUCKET_META[bucket];
                const BucketIcon = meta.icon;
                return (
                  <motion.div key={bucket} {...fadeUp}>
                    <Card className="p-5 sm:p-6">
                      <RevisionSectionHeader title={REVISION_BUCKET_LABEL[bucket]} action={<Badge tone={meta.badgeTone}>{items.length}</Badge>} />
                      <ul className="space-y-2">
                        {items.map((item) => (
                          <li key={item.id}>
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 p-3.5 dark:border-slate-800">
                              <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800', meta.iconClassName)}>
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
                                        <Badge tone="brand" className="ml-0.5">
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
                                        <Badge tone="brand" className="ml-0.5">
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
