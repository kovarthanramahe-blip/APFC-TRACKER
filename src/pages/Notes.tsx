import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Pin, Trash2, X, NotebookPen } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { SYLLABUS } from '../data/syllabus';
import { SUBJECT_COLORS, cx, uuid } from '../lib/utils';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import type { Note, SubjectColorKey } from '../lib/types';

const SUBJECT_OPTIONS: Array<{ value: SubjectColorKey | 'general'; label: string }> = [
  { value: 'general', label: 'General' },
  ...SYLLABUS.map((s) => ({ value: s.colorKey, label: s.shortTitle })),
];

export default function Notes() {
  const notes = useAppStore((s) => s.notes);
  const upsertNote = useAppStore((s) => s.upsertNote);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const togglePinNote = useAppStore((s) => s.togglePinNote);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const list = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt));
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, query]);

  function startNew() {
    setEditing({
      id: uuid(),
      subject: 'general',
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
    });
    setCreating(true);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Revision"
        title="Notes"
        description="Capture quick notes, formulas and mnemonics — organised by subject, always at hand."
        action={
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" /> New Note
          </Button>
        }
      />

      <div className="mb-5 relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <NotebookPen className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm mb-4">No notes yet. Start capturing what you learn.</p>
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" /> Create your first note
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((note) => {
            const colors = note.subject !== 'general' ? SUBJECT_COLORS[note.subject] : null;
            return (
              <motion.div key={note.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="flex h-full flex-col p-4 cursor-pointer" onClick={() => setEditing(note)}>
                  <div className="mb-2 flex items-center justify-between">
                    <Badge className={colors ? cx(colors.bg, colors.text) : ''} tone={colors ? undefined : 'neutral'}>
                      {SUBJECT_OPTIONS.find((o) => o.value === note.subject)?.label ?? 'General'}
                    </Badge>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePinNote(note.id);
                      }}
                      className={cx('text-slate-300 dark:text-slate-600', note.pinned && 'text-gold-500')}
                    >
                      <Pin className={cx('h-4 w-4', note.pinned && 'fill-gold-400')} />
                    </button>
                  </div>
                  <h4 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{note.title || 'Untitled note'}</h4>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 line-clamp-4 whitespace-pre-wrap flex-1">{note.content || 'No content yet…'}</p>
                  <p className="mt-3 text-[11px] text-slate-300 dark:text-slate-600">{new Date(note.updatedAt).toLocaleDateString('en-IN')}</p>
                </Card>
              </motion.div>
            );
          })}
        </div>
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
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value as SubjectColorKey | 'general')}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            {SUBJECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
          <Button onClick={() => onSave({ ...note, title: title.trim() || 'Untitled note', content, subject })}>Save Note</Button>
        </div>
      </motion.div>
    </>
  );
}
