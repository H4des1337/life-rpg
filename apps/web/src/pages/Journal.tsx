import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  Link2,
  NotebookPen,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Search,
  StickyNote as StickyIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync, errorMessage } from '../lib/hooks';
import type { JournalEntry, StickyNote } from '../types';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Markdown,
  Modal,
  PageHeader,
  Panel,
  Spinner,
  Tabs,
} from '../components/ui';
import { formatBytes, formatDateTime, relativeTime, titleCase } from '../lib/format';

type Tab = 'entries' | 'board';
type LinkKey = 'attributeIds' | 'skillIds' | 'questIds' | 'achievementIds' | 'inventoryIds';

interface LinkOption {
  id: string;
  name: string;
}

const NOTE_COLORS = ['#e3c27a', '#9cc7b4', '#a9bfd8', '#d8aab5', '#c9b3d8'];

export function JournalPage() {
  const { data, refresh, notify, confirm } = useApp();
  const entriesAsync = useAsync(
    () => api.get<{ items: JournalEntry[]; total: number }>('/journal?limit=200'),
    [],
  );
  const notesAsync = useAsync(() => api.get<{ notes: StickyNote[] }>('/sticky-notes'), []);
  const [tab, setTab] = useState<Tab>('entries');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (notesAsync.data) setNotes(notesAsync.data.notes);
  }, [notesAsync.data]);

  useEffect(() => {
    if (selectedId || !entriesAsync.data?.items.length) return;
    const first = entriesAsync.data.items[0];
    if (first) void openEntry(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesAsync.data]);

  const entries = entriesAsync.data?.items ?? data?.journal ?? [];
  const categories = useMemo(
    () => [...new Set(entries.map((entry) => entry.category).filter(Boolean))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category && entry.category !== category) return false;
      if (!q) return true;
      return entry.title.toLowerCase().includes(q) || entry.bodyPreview.toLowerCase().includes(q);
    });
  }, [entries, query, category]);

  async function openEntry(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const result = await api.get<{ entry: JournalEntry }>(`/journal/${id}`);
      setSelected(result.entry);
    } catch (cause) {
      notify('error', 'Could not open entry', errorMessage(cause));
    } finally {
      setDetailLoading(false);
    }
  }

  const reload = async () => {
    entriesAsync.reload();
    await refresh();
  };

  const deleteEntry = async (entry: JournalEntry) => {
    const ok = await confirm({
      title: 'Delete journal entry?',
      message: `"${entry.title}" will be soft-deleted. Attached files stay on disk. Sticky notes linked to it remain but lose their journal reference.`,
      confirmLabel: 'Delete entry',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/journal/${entry.id}`);
      setSelected(null);
      setSelectedId(null);
      await reload();
      notify('success', 'Journal entry deleted');
    } catch (cause) {
      notify('error', 'Could not delete entry', errorMessage(cause));
    }
  };

  const addNote = async () => {
    try {
      const result = await api.post<{ note: StickyNote }>('/sticky-notes', {
        title: 'New note',
        body: '',
        x: 40 + (notes.length % 5) * 28,
        y: 40 + (notes.length % 4) * 24,
        color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
      });
      setNotes((current) => [...current, result.note]);
      setTab('board');
      notify('success', 'Sticky note added');
    } catch (cause) {
      notify('error', 'Could not add note', errorMessage(cause));
    }
  };

  const patchNote = async (id: string, patch: Partial<StickyNote>) => {
    const result = await api.patch<{ note: StickyNote }>(`/sticky-notes/${id}`, patch);
    setNotes((current) => current.map((note) => (note.id === id ? result.note : note)));
    return result.note;
  };

  const removeNote = async (note: StickyNote) => {
    const ok = await confirm({
      title: 'Delete sticky note?',
      message: `Remove "${note.title || 'this note'}" from the board? The linked journal entry is preserved.`,
      confirmLabel: 'Delete note',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/sticky-notes/${note.id}`);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      notify('success', 'Sticky note deleted');
    } catch (cause) {
      notify('error', 'Could not delete note', errorMessage(cause));
    }
  };

  const visibleNotes = showHidden ? notes : notes.filter((note) => !note.hidden);

  return (
    <>
      <PageHeader
        eyebrow="The chronicle"
        title="Journal"
        subtitle="Long-form reflection, linked to the rest of your life. Markdown supported, sanitised, and stored as plain text."
        actions={
          <>
            <Button variant="ghost" onClick={() => void addNote()}>
              <StickyIcon size={15} /> Sticky note
            </Button>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={15} /> New entry
            </Button>
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'entries', label: 'Entries', count: entries.length },
          { id: 'board', label: 'Sticky board', count: notes.length },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'entries' ? (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Panel className="flex max-h-[calc(100vh-220px)] min-h-[420px] flex-col overflow-hidden">
            <div className="space-y-2 border-b border-white/[0.06] p-3">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
                <input className="input py-1.5 pl-9 text-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search entries…" />
              </div>
              {categories.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setCategory(null)}
                    className={clsx(
                      'rounded-full border px-2 py-0.5 text-[10px] transition',
                      category === null ? 'border-gold-500/40 bg-gold-500/10 text-gold-400' : 'border-white/[0.07] text-ink-500',
                    )}
                  >
                    All
                  </button>
                  {categories.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      className={clsx(
                        'rounded-full border px-2 py-0.5 text-[10px] transition',
                        category === value ? 'border-gold-500/40 bg-gold-500/10 text-gold-400' : 'border-white/[0.07] text-ink-500',
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex-1 overflow-y-auto">
              {entriesAsync.loading && entries.length === 0 ? (
                <Spinner label="Opening the chronicle" />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<NotebookPen size={18} />}
                  title={entries.length === 0 ? 'No entries yet' : 'Nothing matches'}
                  description={entries.length === 0 ? 'Write the first entry. Future you will thank present you.' : 'Try another search or category.'}
                  action={entries.length === 0 ? <Button size="sm" variant="primary" onClick={() => setEditing('new')}><Plus size={13} /> Write</Button> : undefined}
                />
              ) : (
                filtered.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => void openEntry(entry.id)}
                    className={clsx(
                      'block w-full border-b border-white/[0.04] px-3 py-3 text-left transition',
                      selectedId === entry.id ? 'bg-gold-500/[0.06]' : 'hover:bg-white/[0.02]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm text-ink-100">{entry.title}</p>
                      <span className="shrink-0 text-[10px] text-ink-600">{relativeTime(entry.updatedAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-ink-500">{entry.bodyPreview || 'No preview'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {entry.category ? <Badge tone="muted">{entry.category}</Badge> : null}
                      {entry.links.length > 0 ? <span className="text-[9px] text-ink-600"><Link2 size={9} className="mr-0.5 inline" />{entry.links.length}</span> : null}
                      {entry.noteCount > 0 ? <span className="text-[9px] text-ink-600"><Pin size={9} className="mr-0.5 inline" />{entry.noteCount}</span> : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </Panel>

          <Panel className="min-h-[420px] overflow-hidden">
            {detailLoading ? (
              <Spinner label="Loading entry" />
            ) : selected ? (
              <EntryDetail
                entry={selected}
                onEdit={() => setEditing(selected)}
                onDelete={() => void deleteEntry(selected)}
                onRefresh={async () => {
                  const result = await api.get<{ entry: JournalEntry }>(`/journal/${selected.id}`);
                  setSelected(result.entry);
                  await reload();
                }}
                notify={notify}
              />
            ) : (
              <EmptyState
                icon={<FileText size={20} />}
                title="Select an entry"
                description="Or write something new. Entries can link to attributes, skills, quests, achievements and inventory."
                action={<Button variant="outline" size="sm" onClick={() => setEditing('new')}><Plus size={13} /> New entry</Button>}
              />
            )}
          </Panel>
        </div>
      ) : (
        <Panel className="panel-pad overflow-hidden">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg text-ink-100">Sticky board</h2>
              <p className="text-[11px] text-ink-500">Drag notes to arrange them. Position, colour and collapse state persist locally.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-ink-400">
                <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} className="h-3.5 w-3.5 accent-gold-500" />
                Show hidden
              </label>
              <Button size="sm" variant="outline" onClick={() => void addNote()}>
                <Plus size={13} /> Note
              </Button>
            </div>
          </div>
          <div className="relative h-[620px] overflow-auto rounded-lg border border-white/[0.05] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.045)_1px,transparent_0)] [background-size:22px_22px]">
            {visibleNotes.length === 0 ? (
              <EmptyState
                icon={<StickyIcon size={20} />}
                title="The board is clear"
                description="Sticky notes are for fleeting thoughts, reminders and fragments that are not ready to become journal entries."
                action={<Button size="sm" variant="primary" onClick={() => void addNote()}><Plus size={13} /> Add note</Button>}
              />
            ) : (
              visibleNotes.map((note) => (
                <StickyCard
                  key={note.id}
                  note={note}
                  maxZ={Math.max(0, ...notes.map((item) => item.zIndex))}
                  onPatch={patchNote}
                  onDelete={() => void removeNote(note)}
                  onFocusNote={async () => {
                    const max = Math.max(0, ...notes.map((item) => item.zIndex));
                    await patchNote(note.id, { zIndex: max + 1 });
                  }}
                  notify={notify}
                />
              ))
            )}
          </div>
        </Panel>
      )}

      {editing ? (
        <EntryEditor
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (entry) => {
            setEditing(null);
            setSelectedId(entry.id);
            setSelected(entry);
            await reload();
          }}
          notify={notify}
        />
      ) : null}
    </>
  );
}

function EntryDetail({
  entry,
  onEdit,
  onDelete,
  onRefresh,
  notify,
}: {
  entry: JournalEntry;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => Promise<void>;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      notify('error', 'File too large', 'The upload limit is 25 MB.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.upload(`/files?ownerType=journal&ownerId=${encodeURIComponent(entry.id)}`, form);
      await onRefresh();
      notify('success', 'Attachment added');
    } catch (cause) {
      notify('error', 'Upload failed', errorMessage(cause));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeFile = async (file: { id: string }) => {
    try {
      await api.del(`/files/${file.id}?ownerType=journal&ownerId=${encodeURIComponent(entry.id)}`);
      await onRefresh();
      notify('success', 'Attachment detached');
    } catch (cause) {
      notify('error', 'Could not detach file', errorMessage(cause));
    }
  };

  return (
    <div className="flex h-full max-h-[calc(100vh-220px)] flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.category ? <Badge tone="gold">{entry.category}</Badge> : null}
            <Badge tone="muted">{formatDateTime(entry.updatedAt)}</Badge>
          </div>
          <h2 className="mt-1 font-display text-2xl text-ink-100">{entry.title}</h2>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}><Pencil size={13} /> Edit</Button>
          <Button size="sm" variant="danger" onClick={onDelete}><Trash2 size={13} /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {entry.body.trim() ? (
          <Markdown>{entry.body}</Markdown>
        ) : (
          <p className="text-sm italic text-ink-500">This entry is empty.</p>
        )}

        {entry.links.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
            {entry.links.map((link) => (
              <span key={`${link.targetType}-${link.targetId}`} className="chip">
                <Link2 size={9} /> {link.label}
                <span className="text-[9px] text-ink-600">{titleCase(link.targetType)}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 border-t border-white/[0.06] pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">Attachments</p>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button size="sm" variant="ghost" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <Upload size={12} /> {uploading ? 'Uploading…' : 'Attach'}
            </Button>
          </div>
          {entry.files.length === 0 ? (
            <p className="mt-2 text-[11px] text-ink-600">No files attached.</p>
          ) : (
            <div className="mt-2 space-y-1">
              {entry.files.map((file) => (
                <div key={file.id} className="flex items-center gap-2 rounded border border-white/[0.05] px-2 py-1.5">
                  <Paperclip size={12} className="shrink-0 text-ink-500" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-300">{file.originalName}</span>
                  <span className="text-[9px] text-ink-600">{formatBytes(file.size)}</span>
                  <a href={api.rawUrl(`/files/${file.id}/download`)} className="text-[10px] text-gold-400 hover:underline">Download</a>
                  <IconButton label="Detach file" onClick={() => void removeFile(file)}><X size={12} /></IconButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntryEditor({
  entry,
  onClose,
  onSaved,
  notify,
}: {
  entry: JournalEntry | null;
  onClose: () => void;
  onSaved: (entry: JournalEntry) => Promise<void> | void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const { data } = useApp();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [category, setCategory] = useState(entry?.category ?? '');
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [links, setLinks] = useState<Record<LinkKey, string[]>>({
    attributeIds: entry?.attributes.map((link) => link.targetId) ?? [],
    skillIds: entry?.skills.map((link) => link.targetId) ?? [],
    questIds: entry?.quests.map((link) => link.targetId) ?? [],
    achievementIds: entry?.achievements.map((link) => link.targetId) ?? [],
    inventoryIds: entry?.inventory.map((link) => link.targetId) ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(() => {
    const attributeOptions = (data?.taxonomy ?? []).map((attribute) => ({ id: attribute.id, name: attribute.name }));
    const skillOptions = flattenSkillOptions(data?.taxonomy ?? []);
    const questOptions = (data?.quests ?? []).map((quest) => ({ id: quest.id, name: quest.title }));
    const achievementOptions = (entry?.achievements ?? []).map((link) => ({ id: link.targetId, name: link.label }));
    for (const achievement of data?.achievements ?? []) {
      if (!achievementOptions.some((option) => option.id === achievement.id)) {
        achievementOptions.push({ id: achievement.id, name: achievement.name });
      }
    }
    const inventoryOptions = (data?.inventory ?? []).map((item) => ({ id: item.id, name: item.name }));
    for (const link of entry?.inventory ?? []) {
      if (!inventoryOptions.some((option) => option.id === link.targetId)) {
        inventoryOptions.push({ id: link.targetId, name: link.label });
      }
    }
    return [
      { key: 'attributeIds' as LinkKey, label: 'Attributes', options: attributeOptions },
      { key: 'skillIds' as LinkKey, label: 'Skills', options: skillOptions },
      { key: 'questIds' as LinkKey, label: 'Quests', options: questOptions },
      { key: 'achievementIds' as LinkKey, label: 'Achievements', options: achievementOptions },
      { key: 'inventoryIds' as LinkKey, label: 'Inventory', options: inventoryOptions },
    ];
  }, [data, entry]);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        body,
        category,
        ...links,
      };
      const result = entry
        ? await api.patch<{ entry: JournalEntry }>(`/journal/${entry.id}`, payload)
        : await api.post<{ entry: JournalEntry }>('/journal', payload);
      await onSaved(result.entry);
      notify('success', entry ? 'Entry updated' : 'Entry written');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? 'Edit journal entry' : 'New journal entry'}
      description="Markdown is supported and sanitised. Links connect this reflection to the rest of your character."
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : entry ? 'Save entry' : 'Write entry'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1.7fr_1fr]">
            <Field label="Title">
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} autoFocus />
            </Field>
            <Field label="Category">
              <input className="input" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} placeholder="Reflection" />
            </Field>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label mb-0">Body</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setMode('write')} className={clsx('rounded px-2 py-0.5 text-[10px]', mode === 'write' ? 'bg-white/[0.06] text-ink-100' : 'text-ink-500')}>Write</button>
                <button type="button" onClick={() => setMode('preview')} className={clsx('rounded px-2 py-0.5 text-[10px]', mode === 'preview' ? 'bg-white/[0.06] text-ink-100' : 'text-ink-500')}>Preview</button>
              </div>
            </div>
            {mode === 'write' ? (
              <textarea
                className="input min-h-[320px] resize-y font-mono text-[12px] leading-6"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={'# Today\n\nWhat happened, what did you learn, what will you do next?'}
                maxLength={100000}
              />
            ) : (
              <div className="min-h-[320px] rounded-md border border-white/[0.08] bg-ink-950/60 p-4">
                {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-sm italic text-ink-500">Nothing to preview.</p>}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t border-white/[0.06] pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            <Link2 size={11} /> Links
          </p>
          {sections.map((section) => (
            <div key={section.key}>
              <span className="mb-1 block text-[10px] text-ink-500">{section.label}</span>
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                {section.options.length === 0 ? (
                  <span className="text-[10px] text-ink-600">None available</span>
                ) : (
                  section.options.map((option) => {
                    const active = links[section.key].includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setLinks((current) => ({
                            ...current,
                            [section.key]: active
                              ? current[section.key].filter((id) => id !== option.id)
                              : [...current[section.key], option.id],
                          }))
                        }
                        className={clsx(
                          'rounded-full border px-1.5 py-0.5 text-[10px] transition',
                          active
                            ? 'border-gold-500/50 bg-gold-500/10 text-gold-400'
                            : 'border-white/[0.07] text-ink-500 hover:text-ink-200',
                        )}
                      >
                        {option.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? <div className="mt-3 rounded-md border border-blood/30 bg-blood/[0.07] px-3 py-2 text-xs text-[#e0a0a0]">{error}</div> : null}
    </Modal>
  );
}

function StickyCard({
  note,
  maxZ,
  onPatch,
  onDelete,
  onFocusNote,
  notify,
}: {
  note: StickyNote;
  maxZ: number;
  onPatch: (id: string, patch: Partial<StickyNote>) => Promise<StickyNote>;
  onDelete: () => void;
  onFocusNote: () => Promise<void>;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const [position, setPosition] = useState({ x: note.x, y: note.y });
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setPosition({ x: note.x, y: note.y });
    setTitle(note.title);
    setBody(note.body);
  }, [note.x, note.y, note.title, note.body]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, dragRef.current.x + dx),
        y: Math.max(0, dragRef.current.y + dy),
      });
    };
    const up = async () => {
      setDragging(false);
      dragRef.current = null;
      try {
        await onPatch(note.id, { x: Math.round(position.x), y: Math.round(position.y) });
      } catch (cause) {
        notify('error', 'Could not save note position', errorMessage(cause));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, position.x, position.y]);

  const saveContent = async () => {
    if (title === note.title && body === note.body) return;
    try {
      await onPatch(note.id, { title: title || 'Note', body });
    } catch (cause) {
      notify('error', 'Could not save note', errorMessage(cause));
    }
  };

  return (
    <div
      className={clsx(
        'absolute rounded-md border shadow-xl transition-shadow',
        dragging ? 'cursor-grabbing shadow-2xl' : 'hover:shadow-2xl',
      )}
      style={{
        left: position.x,
        top: position.y,
        width: note.width,
        minHeight: note.collapsed ? undefined : Math.min(note.height, 320),
        zIndex: note.zIndex + 10,
        backgroundColor: note.color,
        borderColor: 'rgba(0,0,0,0.25)',
        color: '#171a21',
      }}
      onMouseDown={() => {
        if (note.zIndex <= maxZ) void onFocusNote();
      }}
    >
      <div
        className="flex cursor-grab items-center gap-1 border-b border-black/10 px-2 py-1.5 active:cursor-grabbing"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button,input,textarea')) return;
          event.preventDefault();
          dragRef.current = { startX: event.clientX, startY: event.clientY, x: position.x, y: position.y };
          setDragging(true);
        }}
      >
        <GripVertical size={12} className="shrink-0 opacity-50" />
        <input
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[#171a21] outline-none placeholder:text-black/40"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void saveContent()}
          maxLength={200}
          aria-label="Sticky note title"
        />
        <button type="button" aria-label={note.collapsed ? 'Expand note' : 'Collapse note'} onClick={() => void onPatch(note.id, { collapsed: !note.collapsed })} className="opacity-50 hover:opacity-90">
          {note.collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <button type="button" aria-label="Delete note" onClick={onDelete} className="opacity-50 hover:opacity-90">
          <Trash2 size={12} />
        </button>
      </div>

      {!note.collapsed ? (
        <>
          <textarea
            className="block h-[calc(100%-64px)] min-h-[110px] w-full resize-none bg-transparent px-2.5 py-2 text-xs leading-5 text-[#23262e] outline-none placeholder:text-black/35"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onBlur={() => void saveContent()}
            placeholder="Write a thought…"
            maxLength={20000}
          />
          <div className="flex items-center justify-between gap-1 px-2 py-1">
            <div className="flex gap-1">
              {NOTE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Set note colour ${color}`}
                  onClick={() => void onPatch(note.id, { color })}
                  className={clsx('h-3 w-3 rounded-full border border-black/20', note.color === color && 'ring-2 ring-black/40')}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1 text-[9px] opacity-60">
              {note.journalTitle ? <span className="max-w-[80px] truncate">↗ {note.journalTitle}</span> : null}
              <button
                type="button"
                aria-label={note.hidden ? 'Show note' : 'Hide note'}
                onClick={() => void onPatch(note.id, { hidden: !note.hidden })}
                className="inline-flex items-center gap-0.5"
              >
                {note.hidden ? 'show' : <X size={10} />}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function flattenSkillOptions(attributes: import('../types').Attribute[]): LinkOption[] {
  const result: LinkOption[] = [];
  const walk = (skills: import('../types').Skill[]) => {
    for (const skill of skills) {
      result.push({ id: skill.id, name: skill.name });
      walk(skill.children);
    }
  };
  for (const attribute of attributes) for (const sub of attribute.subAttributes) walk(sub.skills);
  return result;
}
