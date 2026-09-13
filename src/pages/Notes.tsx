import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Pin, Trash2, X, NotebookPen, ChevronRight, ChevronLeft, FolderOpen } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { SYLLABUS } from '../data/syllabus';
import { SUBJECT_COLORS, cx, uuid } from '../lib/utils';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import type { Note, SubjectColorKey } from '../lib/types';

const TOPIC_TITLES: Record<string, string> = Object.fromEntries(SYLLABUS.flatMap((s) => s.topics.map((t) => [t.id, t.title])));
const TOPIC_SUBJECTS: Record<string, SubjectColorKey> = Object.fromEntries(
  SYLLABUS.flatMap((s) => s.topics.map((t) => [t.id, s.colorKey])),
);

// Navigation is a simple drill-down: pick a subject, then (for real subjects) a topic, then see its notes.
// "General" notes have no topic level, matching the pre-Phase-2E behaviour for uncategorised notes.
type Nav =
  | { level: 'subjects' }
  | { level: 'topics'; subject: SubjectColorKey }
  | { level: 'notes'; subject: SubjectColorKey | 'general'; topicId?: string; uncategorized?: boolean };

// Deep-link support: arriving from a syllabus topic (or a PYQ review's "Study this topic")
// as /notes?topicId=... should open straight at that topic's note list.
function navFromSearchParams(params: URLSearchParams): Nav {
  const topicId = params.get('topicId');
  const subject = topicId ? TOPIC_SUBJECTS[topicId] : undefined;
  if (topicId && subject) return { level: 'notes', subject, topicId };
  return { level: 'subjects' };
}

export default function Notes() {
  const notes = useAppStore((s) => s.notes);
  const upsertNote = useAppStore((s) => s.upsertNote);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const togglePinNote = useAppStore((s) => s.togglePinNote);

  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [nav, setNav] = useState<Nav>(() => navFromSearchParams(searchParams));

  // React to a fresh deep link (e.g. navigating here again from another topic) after the page is already mounted.
  useEffect(() => {
    const next = navFromSearchParams(searchParams);
    if (next.level === 'notes') setNav(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [notes],
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return sortedNotes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [sortedNotes, query]);

  const notesInView = useMemo(() => {
    if (nav.level !== 'notes') return [];
    if (nav.subject === 'general') return sortedNotes.filter((n) => n.subject === 'general');
    if (nav.uncategorized) return sortedNotes.filter((n) => n.subject === nav.subject && !n.topicId);
    return sortedNotes.filter((n) => n.subject === nav.subject && n.topicId === nav.topicId);
  }, [nav, sortedNotes]);

  function startNew(subject: SubjectColorKey | 'general', topicId?: string) {
    setEditing({
      id: uuid(),
      subject,
      topicId,
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
    });
    setCreating(true);
  }

  const quickNewTarget: { subject: SubjectColorKey | 'general'; topicId?: string } =
    nav.level === 'notes' ? { subject: nav.subject, topicId: nav.uncategorized ? undefined : nav.topicId } : { subject: 'general' };

  return (
    <div>
      <PageHeader
        eyebrow="Revision"
        title="Notes"
        description="Capture quick notes, formulas and mnemonics — organised by subject and syllabus topic."
        action={
          <Button onClick={() => startNew(quickNewTarget.subject, quickNewTarget.topicId)}>
            <Plus className="h-4 w-4" /> New Note
          </Button>
        }
      />

      <div className="mb-5 relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all notes…"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {searchResults ? (
        <NoteGrid notes={searchResults} onOpen={setEditing} onTogglePin={togglePinNote} emptyText={`No notes match "${query}".`} showLocation />
      ) : (
        <>
          <Breadcrumb nav={nav} onNavigate={setNav} />

          {nav.level === 'subjects' && <SubjectList notes={notes} onSelectGeneral={() => setNav({ level: 'notes', subject: 'general' })} onSelectSubject={(s) => setNav({ level: 'topics', subject: s })} />}

          {nav.level === 'topics' && (
            <TopicList subject={nav.subject} notes={notes} onSelectTopic={(topicId) => setNav({ level: 'notes', subject: nav.subject, topicId })} onSelectUncategorized={() => setNav({ level: 'notes', subject: nav.subject, uncategorized: true })} />
          )}

          {nav.level === 'notes' && (
            <NoteGrid
              notes={notesInView}
              onOpen={setEditing}
              onTogglePin={togglePinNote}
              emptyText="No notes for this topic yet."
              emptyAction={<Button onClick={() => startNew(nav.subject, nav.uncategorized ? undefined : nav.topicId)}><Plus className="h-4 w-4" /> Add a note</Button>}
            />
          )}
        </>
      )}

      <AnimatePresence>
        {editing && (
          <NoteEditor
            note={editing}
            isNew={creating}
            onClose={() => {
              setEditing(null);
              setCreating(false);
            }}
            onSave={(n) => {
              upsertNote({ ...n, updatedAt: new Date().toISOString() });
              setEditing(null);
              setCreating(false);
            }}
            onDelete={(id) => {
              deleteNote(id);
              setEditing(null);
              setCreating(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Breadcrumb({ nav, onNavigate }: { nav: Nav; onNavigate: (n: Nav) => void }) {
  if (nav.level === 'subjects') return null;

  const crumbs: { label: string; onClick: () => void }[] = [{ label: 'Notes', onClick: () => onNavigate({ level: 'subjects' }) }];

  if (nav.level === 'topics') {
    const s = SYLLABUS.find((s) => s.colorKey === nav.subject);
    crumbs.push({ label: s?.shortTitle ?? nav.subject, onClick: () => onNavigate({ level: 'topics', subject: nav.subject }) });
  } else if (nav.level === 'notes') {
    if (nav.subject === 'general') {
      crumbs.push({ label: 'General', onClick: () => onNavigate({ level: 'notes', subject: 'general' }) });
    } else {
      const subjectKey = nav.subject;
      const s = SYLLABUS.find((s) => s.colorKey === subjectKey);
      crumbs.push({ label: s?.shortTitle ?? subjectKey, onClick: () => onNavigate({ level: 'topics', subject: subjectKey }) });
      const topicLabel = nav.uncategorized ? 'Uncategorized' : (nav.topicId && TOPIC_TITLES[nav.topicId]) || 'Topic';
      crumbs.push({ label: topicLabel, onClick: () => onNavigate(nav) });
    }
  }

  return (
    <div className="mb-4 flex items-center gap-1.5 text-sm">
      <button
        onClick={() => {
          if (nav.level === 'notes' && nav.subject !== 'general') onNavigate({ level: 'topics', subject: nav.subject });
          else onNavigate({ level: 'subjects' });
        }}
        className="mr-1 flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />}
          <button
            onClick={c.onClick}
            className={cx(
              'font-medium hover:underline',
              i === crumbs.length - 1 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {c.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function SubjectList({
  notes,
  onSelectGeneral,
  onSelectSubject,
}: {
  notes: Note[];
  onSelectGeneral: () => void;
  onSelectSubject: (s: SubjectColorKey) => void;
}) {
  const generalCount = notes.filter((n) => n.subject === 'general').length;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NavCard label="General" hint="Not tied to a subject" count={generalCount} onClick={onSelectGeneral} />
      {SYLLABUS.map((s) => {
        const count = notes.filter((n) => n.subject === s.colorKey).length;
        const colors = SUBJECT_COLORS[s.colorKey];
        return (
          <NavCard
            key={s.id}
            label={s.shortTitle}
            hint={`${s.topics.length} topics`}
            count={count}
            colorClass={cx(colors.bg, colors.text)}
            onClick={() => onSelectSubject(s.colorKey)}
          />
        );
      })}
    </div>
  );
}

function TopicList({
  subject,
  notes,
  onSelectTopic,
  onSelectUncategorized,
}: {
  subject: SubjectColorKey;
  notes: Note[];
  onSelectTopic: (topicId: string) => void;
  onSelectUncategorized: () => void;
}) {
  const subj = SYLLABUS.find((s) => s.colorKey === subject);
  const colors = SUBJECT_COLORS[subject];
  const uncategorizedCount = notes.filter((n) => n.subject === subject && !n.topicId).length;

  if (!subj) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subj.topics.map((t) => {
        const count = notes.filter((n) => n.subject === subject && n.topicId === t.id).length;
        return <NavCard key={t.id} label={t.title} count={count} colorClass={cx(colors.bg, colors.text)} onClick={() => onSelectTopic(t.id)} />;
      })}
      {uncategorizedCount > 0 && (
        <NavCard
          label="Uncategorized"
          hint="Notes saved before topics were tracked"
          count={uncategorizedCount}
          colorClass="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          onClick={onSelectUncategorized}
        />
      )}
    </div>
  );
}

function NavCard({
  label,
  hint,
  count,
  colorClass = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  onClick,
}: {
  label: string;
  hint?: string;
  count: number;
  colorClass?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="flex items-center gap-3 p-4 h-full hover:border-brand-300 dark:hover:border-brand-500/40 transition-colors">
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', colorClass)}>
          <FolderOpen className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{label}</p>
          {hint && <p className="text-xs text-slate-400 mt-0.5 truncate">{hint}</p>}
        </div>
        <Badge tone="neutral">{count}</Badge>
      </Card>
    </button>
  );
}

function NoteGrid({
  notes,
  onOpen,
  onTogglePin,
  emptyText,
  emptyAction,
  showLocation = false,
}: {
  notes: Note[];
  onOpen: (n: Note) => void;
  onTogglePin: (id: string) => void;
  emptyText: string;
  emptyAction?: React.ReactNode;
  showLocation?: boolean;
}) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <NotebookPen className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
        <p className="text-slate-400 text-sm mb-4">{emptyText}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => {
        const colors = note.subject !== 'general' ? SUBJECT_COLORS[note.subject] : null;
        const subjTitle = note.subject !== 'general' ? SYLLABUS.find((s) => s.colorKey === note.subject)?.shortTitle : 'General';
        const topicTitle = note.topicId ? TOPIC_TITLES[note.topicId] : null;
        return (
          <motion.div key={note.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="flex h-full flex-col p-4 cursor-pointer" onClick={() => onOpen(note)}>
              <div className="mb-2 flex items-center justify-between">
                <Badge className={colors ? cx(colors.bg, colors.text) : ''} tone={colors ? undefined : 'neutral'}>
                  {subjTitle}
                </Badge>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(note.id);
                  }}
                  className={cx('text-slate-300 dark:text-slate-600', note.pinned && 'text-gold-500')}
                >
                  <Pin className={cx('h-4 w-4', note.pinned && 'fill-gold-400')} />
                </button>
              </div>
              {showLocation && topicTitle && <p className="mb-1 text-[11px] text-slate-400 truncate">{topicTitle}</p>}
              <h4 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{note.title || 'Untitled note'}</h4>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 line-clamp-4 whitespace-pre-wrap flex-1">{note.content || 'No content yet…'}</p>
              <p className="mt-3 text-[11px] text-slate-300 dark:text-slate-600">{new Date(note.updatedAt).toLocaleDateString('en-IN')}</p>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

function NoteEditor({
  note,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  note: Note;
  isNew: boolean;
  onClose: () => void;
  onSave: (n: Note) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [subject, setSubject] = useState<SubjectColorKey | 'general'>(note.subject);
  const [topicId, setTopicId] = useState<string | undefined>(note.topicId);

  const subj = subject !== 'general' ? SYLLABUS.find((s) => s.colorKey === subject) : undefined;

  function handleSubjectChange(next: SubjectColorKey | 'general') {
    setSubject(next);
    // The old topic doesn't necessarily belong to the newly chosen subject — reset it.
    setTopicId(undefined);
  }

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">{isNew ? 'New Note' : 'Edit Note'}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={subject}
              onChange={(e) => handleSubjectChange(e.target.value as SubjectColorKey | 'general')}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="general">General</option>
              {SYLLABUS.map((s) => (
                <option key={s.id} value={s.colorKey}>
                  {s.shortTitle}
                </option>
              ))}
            </select>
            <select
              value={topicId ?? ''}
              onChange={(e) => setTopicId(e.target.value || undefined)}
              disabled={!subj}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
            >
              <option value="">{subj ? 'No specific topic' : 'Topics need a subject'}</option>
              {subj?.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your notes here…"
            rows={10}
            className="w-full resize-none rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          {!isNew ? (
            <button onClick={() => onDelete(note.id)} className="flex items-center gap-1.5 text-sm font-medium text-rose-500 hover:text-rose-600">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          ) : (
            <span />
          )}
          <Button onClick={() => onSave({ ...note, title: title.trim() || 'Untitled note', content, subject, topicId })}>Save Note</Button>
        </div>
      </motion.div>
    </>
  );
}
