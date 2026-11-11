import { useMemo, useRef, useState } from 'react';
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FolderCog,
  Image as ImageIcon,
  Paperclip,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync, errorMessage } from '../lib/hooks';
import type { Achievement, Attribute, InventoryCategory, InventoryFile, InventoryItem, Skill } from '../types';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Panel,
} from '../components/ui';
import { formatBytes, formatDate, titleCase } from '../lib/format';

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function InventoryPage() {
  const { data, refresh, notify, confirm } = useApp();
  const inventory = useAsync(
    () => api.get<{ items: InventoryItem[]; categories: InventoryCategory[] }>('/inventory'),
    [],
  );
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryItem | 'new' | null>(null);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const items = inventory.data?.items ?? data?.inventory ?? [];
  const categories = inventory.data?.categories ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryId && item.categoryId !== categoryId) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
    });
  }, [items, categoryId, query]);

  const reload = async () => {
    inventory.reload();
    await refresh();
  };

  const deleteItem = async (item: InventoryItem) => {
    const ok = await confirm({
      title: 'Delete inventory item?',
      message: `"${item.name}" will be removed from your inventory. Attached files are preserved on disk and the record is soft-deleted.`,
      confirmLabel: 'Delete item',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/inventory/${item.id}`);
      setSelected(null);
      await reload();
      notify('success', 'Item deleted', 'Attachment files were retained.');
    } catch (cause) {
      notify('error', 'Could not delete item', errorMessage(cause));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Collected works"
        title="Inventory"
        subtitle="Certificates, projects, equipment and keepsakes — with real local attachments that stay on this machine."
        actions={
          <>
            <Button variant="ghost" onClick={() => setCategoriesOpen(true)}>
              <FolderCog size={15} /> Categories
            </Button>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={15} /> New item
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory…" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={categoryId === null} onClick={() => setCategoryId(null)} count={items.length} />
          {categories.map((category) => (
            <FilterChip
              key={category.id}
              label={category.name}
              active={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
              count={category.itemCount}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Archive size={18} />}
            title={items.length === 0 ? 'Your inventory is empty' : 'Nothing in this view'}
            description={
              items.length === 0
                ? 'Record a certification, a shipped project, a piece of equipment, or a meaningful experience. Attach proof as real files.'
                : 'Try another category or clear the search.'
            }
            action={
              items.length === 0 ? (
                <Button variant="primary" size="sm" onClick={() => setEditing('new')}><Plus size={14} /> Add first item</Button>
              ) : (
                <Button size="sm" onClick={() => { setCategoryId(null); setQuery(''); }}>Clear filters</Button>
              )
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const image = item.files.find((file) => IMAGE_MIMES.has(file.mimeType));
            return (
              <Panel key={item.id} className="group flex flex-col overflow-hidden">
                <button type="button" onClick={() => setSelected(item)} className="block text-left">
                  {image ? (
                    <div className="relative h-28 overflow-hidden border-b border-white/[0.06] bg-ink-950">
                      <img
                        src={api.rawUrl(`/files/${image.id}/preview`)}
                        alt={item.name}
                        className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
                        loading="lazy"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-ink-950/70 to-transparent" />
                    </div>
                  ) : (
                    <div className="flex h-16 items-center justify-center border-b border-white/[0.05] bg-white/[0.015]">
                      <Archive size={22} className="text-ink-600" />
                    </div>
                  )}
                  <div className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="muted">{item.categoryName || 'Unfiled'}</Badge>
                          {item.expired ? <Badge tone="danger">Expired</Badge> : null}
                        </div>
                        <h3 className="mt-1.5 line-clamp-1 font-display text-base text-ink-100">{item.name}</h3>
                      </div>
                      <span className="shrink-0 text-[10px] text-ink-500">{formatDate(item.acquiredAt)}</span>
                    </div>
                    {item.description ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-400">{item.description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.attributes.slice(0, 2).map((link) => (
                        <span key={`${link.targetType}-${link.targetId}`} className="chip">{link.label}</span>
                      ))}
                      {item.skills.slice(0, 2).map((link) => (
                        <span key={`${link.targetType}-${link.targetId}`} className="chip text-gold-400/90">{link.label}</span>
                      ))}
                    </div>
                  </div>
                </button>
                <div className="mt-auto flex items-center justify-between border-t border-white/[0.05] px-3.5 py-2">
                  <span className="inline-flex items-center gap-1 text-[10px] text-ink-500">
                    <Paperclip size={10} /> {item.fileCount} file{item.fileCount === 1 ? '' : 's'}
                  </span>
                  <div className="flex gap-0.5">
                    <IconButton label="Edit item" onClick={() => setEditing(item)}><Pencil size={12} /></IconButton>
                    <IconButton label="Delete item" onClick={() => void deleteItem(item)}><Trash2 size={12} /></IconButton>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {editing ? (
        <ItemModal
          item={editing === 'new' ? null : editing}
          categories={categories}
          attributes={data?.taxonomy ?? []}
          achievements={data?.achievements ?? []}
          onClose={() => setEditing(null)}
          onSaved={async (item) => {
            setEditing(null);
            setSelected(item);
            await reload();
          }}
          notify={notify}
        />
      ) : null}

      {selected ? (
        <ItemDetail
          item={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onDelete={() => void deleteItem(selected)}
          onChanged={async (item) => {
            setSelected(item);
            await reload();
          }}
          notify={notify}
          confirm={confirm}
        />
      ) : null}

      {categoriesOpen ? (
        <CategoryModal
          categories={categories}
          items={items}
          onClose={() => setCategoriesOpen(false)}
          onChanged={async (next) => {
            inventory.setData({
              items,
              categories: next,
            });
            await reload();
          }}
          notify={notify}
          confirm={confirm}
        />
      ) : null}
    </>
  );
}

function FilterChip({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition',
        active
          ? 'border-gold-500/40 bg-gold-500/10 text-gold-400'
          : 'border-white/[0.07] bg-white/[0.02] text-ink-400 hover:text-ink-200',
      )}
    >
      {label}
      <span className="font-mono text-[9px] text-ink-500">{count}</span>
    </button>
  );
}

function ItemModal({
  item,
  categories,
  attributes,
  achievements,
  onClose,
  onSaved,
  notify,
}: {
  item: InventoryItem | null;
  categories: InventoryCategory[];
  attributes: Attribute[];
  achievements: Achievement[];
  onClose: () => void;
  onSaved: (item: InventoryItem) => Promise<void> | void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [acquiredAt, setAcquiredAt] = useState(item?.acquiredAt?.slice(0, 10) ?? '');
  const [expiresAt, setExpiresAt] = useState(item?.expiresAt?.slice(0, 10) ?? '');
  const [externalRef, setExternalRef] = useState(item?.externalRef ?? '');
  const [attributeIds, setAttributeIds] = useState<string[]>(item?.attributes.map((link) => link.targetId) ?? []);
  const [skillIds, setSkillIds] = useState<string[]>(item?.skills.map((link) => link.targetId) ?? []);
  const [achievementIds, setAchievementIds] = useState<string[]>(item?.achievements.map((link) => link.targetId) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSkills = useMemo(() => flattenSkills(attributes), [attributes]);
  const achievementOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const achievement of achievements) map.set(achievement.id, achievement.name);
    for (const link of item?.achievements ?? []) map.set(link.targetId, link.label);
    return [...map.entries()];
  }, [achievements, item?.achievements]);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description,
        categoryId: categoryId || null,
        acquiredAt: acquiredAt || null,
        expiresAt: expiresAt || null,
        externalRef,
        attributeIds,
        skillIds,
        achievementIds,
      };
      const result = item
        ? await api.patch<{ item: InventoryItem }>(`/inventory/${item.id}`, body)
        : await api.post<{ item: InventoryItem }>('/inventory', body);
      await onSaved(result.item);
      notify('success', item ? 'Item updated' : 'Item added', 'You can attach real files from the item view.');
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
      title={item ? 'Edit inventory item' : 'New inventory item'}
      description="Proof, artefacts and equipment. Attach real files after creating the item."
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : item ? 'Save item' : 'Create item'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
          <Field label="Name">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} autoFocus placeholder="AWS Solutions Architect" />
          </Field>
          <Field label="Category">
            <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Unfiled</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea className="input min-h-[80px]" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Acquired">
            <input type="date" className="input" value={acquiredAt} onChange={(event) => setAcquiredAt(event.target.value)} />
          </Field>
          <Field label="Expires" hint="Optional. Expired items are flagged.">
            <input type="date" className="input" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </Field>
          <Field label="External reference" hint="URL, credential ID or note.">
            <input className="input" value={externalRef} onChange={(event) => setExternalRef(event.target.value)} maxLength={2000} />
          </Field>
        </div>

        <div>
          <span className="label">Linked attributes</span>
          <div className="flex flex-wrap gap-1.5">
            {attributes.map((attribute) => (
              <Toggle
                key={attribute.id}
                label={attribute.name}
                active={attributeIds.includes(attribute.id)}
                color={attribute.color}
                onClick={() => setAttributeIds((current) => toggle(current, attribute.id))}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="label">Linked skills</span>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-white/[0.06] p-2">
            {allSkills.length === 0 ? <span className="text-xs text-ink-500">No skills yet.</span> : null}
            {allSkills.map((skill) => (
              <Toggle
                key={skill.id}
                label={skill.name}
                active={skillIds.includes(skill.id)}
                onClick={() => setSkillIds((current) => toggle(current, skill.id))}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="label">Linked achievements</span>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-white/[0.06] p-2">
            {achievementOptions.length === 0 ? <span className="text-xs text-ink-500">No achievements yet.</span> : null}
            {achievementOptions.map(([id, label]) => (
              <Toggle
                key={id}
                label={label}
                active={achievementIds.includes(id)}
                onClick={() => setAchievementIds((current) => toggle(current, id))}
              />
            ))}
          </div>
        </div>

        {error ? <div className="rounded-md border border-blood/30 bg-blood/[0.07] px-3 py-2 text-xs text-[#e0a0a0]">{error}</div> : null}
      </div>
    </Modal>
  );
}

function ItemDetail({
  item,
  onClose,
  onEdit,
  onDelete,
  onChanged,
  notify,
  confirm,
}: {
  item: InventoryItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: (item: InventoryItem) => Promise<void> | void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
  confirm: (options: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const refreshItem = async () => {
    const result = await api.get<{ item: InventoryItem }>(`/inventory/${item.id}`);
    await onChanged(result.item);
  };

  const upload = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      notify('error', 'File too large', 'The upload limit is 25 MB.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.upload(`/files?ownerType=inventory&ownerId=${encodeURIComponent(item.id)}`, form);
      await refreshItem();
      notify('success', 'File attached', `${file.name} was stored locally with a SHA-256 record.`);
    } catch (cause) {
      notify('error', 'Upload failed', errorMessage(cause));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeFile = async (file: InventoryFile) => {
    const ok = await confirm({
      title: 'Detach this file?',
      message: `Remove "${file.originalName}" from this item? The stored file is retained for integrity and audit purposes.`,
      confirmLabel: 'Detach file',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/files/${file.id}?ownerType=inventory&ownerId=${encodeURIComponent(item.id)}`);
      await refreshItem();
      notify('success', 'File detached');
    } catch (cause) {
      notify('error', 'Could not detach file', errorMessage(cause));
    }
  };

  const verify = async (file: InventoryFile) => {
    try {
      const result = await api.get<{ ok: boolean; actualSize: number }>(`/files/${file.id}/verify`);
      if (result.ok) notify('success', 'Integrity verified', `${file.originalName} matches its recorded SHA-256.`);
      else notify('error', 'Integrity mismatch', 'The file on disk no longer matches its recorded hash.');
    } catch (cause) {
      notify('error', 'Verification failed', errorMessage(cause));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      description={`${item.categoryName || 'Unfiled'} · acquired ${formatDate(item.acquiredAt)}`}
      wide
      footer={
        <>
          <Button variant="danger" onClick={onDelete}><Trash2 size={14} /> Delete</Button>
          <Button onClick={onEdit}><Pencil size={14} /> Edit</Button>
          <Button variant="primary" onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="muted">{item.categoryName || 'Unfiled'}</Badge>
          {item.expired ? <Badge tone="danger">Expired</Badge> : null}
          {item.expiresAt ? <Badge tone="muted">Expires {formatDate(item.expiresAt)}</Badge> : null}
          {item.files.length > 0 ? <Badge tone="jade"><CheckCircle2 size={9} /> {item.files.length} attached</Badge> : null}
        </div>

        {item.description ? <p className="whitespace-pre-wrap text-sm leading-6 text-ink-300">{item.description}</p> : null}

        {item.externalRef ? (
          /^https?:\/\//i.test(item.externalRef) ? (
            <a href={item.externalRef} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-gold-400 hover:underline">
              <ExternalLink size={12} /> {item.externalRef}
            </a>
          ) : (
            <p className="break-all font-mono text-[11px] text-ink-500">{item.externalRef}</p>
          )
        ) : null}

        {item.attributes.length > 0 || item.skills.length > 0 || item.achievements.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {item.attributes.map((link) => <span key={`${link.targetType}-${link.targetId}`} className="chip">{link.label}</span>)}
            {item.skills.map((link) => <span key={`${link.targetType}-${link.targetId}`} className="chip text-gold-400/90">{link.label}</span>)}
            {item.achievements.map((link) => <span key={`${link.targetType}-${link.targetId}`} className="chip text-jade/90">{link.label}</span>)}
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-100">Attachments</p>
              <p className="text-[11px] text-ink-500">Stored under your local LIFE RPG data folder. 25 MB max.</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload file'}
            </Button>
          </div>

          {item.files.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-6 text-center">
              <Paperclip size={18} className="mx-auto text-ink-600" />
              <p className="mt-1 text-xs text-ink-500">No attachments yet. Upload a certificate, screenshot or document.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {item.files.map((file) => (
                <div key={file.id} className="flex flex-wrap items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/[0.06] bg-ink-950 text-ink-400">
                    {IMAGE_MIMES.has(file.mimeType) ? <ImageIcon size={14} /> : <FileText size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-ink-200">{file.originalName}</p>
                    <p className="text-[10px] text-ink-500">
                      {formatBytes(file.size)} · {titleCase(file.mimeType.split('/')[1]?.replace('+xml', '') ?? file.mimeType)} · <span className="font-mono">{file.sha256.slice(0, 12)}…</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconButton label="Verify integrity" onClick={() => void verify(file)}><ShieldCheck size={13} /></IconButton>
                    <a
                      href={api.rawUrl(`/files/${file.id}/download`)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition hover:bg-white/[0.04] hover:text-ink-100"
                      aria-label="Download file"
                    >
                      <Download size={13} />
                    </a>
                    {IMAGE_MIMES.has(file.mimeType) || file.mimeType === 'application/pdf' ? (
                      <a
                        href={api.rawUrl(`/files/${file.id}/preview`)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition hover:bg-white/[0.04] hover:text-ink-100"
                        aria-label="Preview file"
                      >
                        <ExternalLink size={13} />
                      </a>
                    ) : null}
                    <IconButton label="Detach file" onClick={() => void removeFile(file)}><Trash2 size={13} /></IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {item.expiresAt && item.expired ? (
          <p className="flex items-center gap-1.5 rounded-md border border-blood/25 bg-blood/[0.05] px-3 py-2 text-[11px] text-[#e0a0a0]">
            <CalendarDays size={12} /> This item expired on {formatDate(item.expiresAt)}. Renew it or keep it as a historical record.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function CategoryModal({
  categories,
  items,
  onClose,
  onChanged,
  notify,
  confirm,
}: {
  categories: InventoryCategory[];
  items: InventoryItem[];
  onClose: () => void;
  onChanged: (categories: InventoryCategory[]) => Promise<void> | void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
  confirm: (options: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const result = await api.post<{ categories: InventoryCategory[] }>('/inventory/categories', { name: name.trim() });
      setName('');
      await onChanged(result.categories);
      notify('success', 'Category added');
    } catch (cause) {
      notify('error', 'Could not add category', errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category: InventoryCategory) => {
    const count = items.filter((item) => item.categoryId === category.id).length;
    const ok = await confirm({
      title: 'Delete category?',
      message:
        count > 0
          ? `"${category.name}" contains ${count} item(s). They become unfiled; nothing is deleted.`
          : `Delete the empty category "${category.name}"?`,
      confirmLabel: 'Delete category',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.del<{ categories: InventoryCategory[] }>(`/inventory/categories/${category.id}`);
      await onChanged(result.categories);
      notify('success', 'Category deleted');
    } catch (cause) {
      notify('error', 'Could not delete category', errorMessage(cause));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Inventory categories"
      description="Rename, add or remove categories. Items are never deleted with a category."
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-2">
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            onSaved={async (next) => {
              await onChanged(next);
              notify('success', 'Category renamed');
            }}
            onDelete={() => void remove(category)}
            notify={notify}
          />
        ))}
      </div>
      <div className="mt-4 flex gap-2 border-t border-white/[0.06] pt-4">
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New category name"
          maxLength={80}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void add();
          }}
        />
        <Button variant="outline" onClick={() => void add()} disabled={busy || !name.trim()}>
          <Plus size={14} /> Add
        </Button>
      </div>
    </Modal>
  );
}

function CategoryRow({
  category,
  onSaved,
  onDelete,
  notify,
}: {
  category: InventoryCategory;
  onSaved: (categories: InventoryCategory[]) => Promise<void> | void;
  onDelete: () => void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const [name, setName] = useState(category.name);
  const dirty = name.trim() !== category.name && name.trim().length > 0;

  const save = async () => {
    if (!dirty) return;
    try {
      const result = await api.patch<{ categories: InventoryCategory[] }>(`/inventory/categories/${category.id}`, {
        name: name.trim(),
      });
      await onSaved(result.categories);
    } catch (cause) {
      notify('error', 'Could not rename category', errorMessage(cause));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input className="input py-1.5 text-sm" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
      <span className="w-10 shrink-0 text-right font-mono text-[10px] text-ink-500">{category.itemCount}</span>
      <Button size="sm" variant={dirty ? 'outline' : 'ghost'} disabled={!dirty} onClick={() => void save()}>
        Save
      </Button>
      <IconButton label={`Delete ${category.name}`} onClick={onDelete}><Trash2 size={13} /></IconButton>
    </div>
  );
}

function Toggle({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition',
        active
          ? 'border-gold-500/50 bg-gold-500/10 text-ink-100'
          : 'border-white/[0.08] text-ink-400 hover:text-ink-200',
      )}
    >
      {color ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> : null}
      {label}
    </button>
  );
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

function flattenSkills(attributes: Attribute[]): Skill[] {
  const result: Skill[] = [];
  const walk = (skills: Skill[]) => {
    for (const skill of skills) {
      result.push(skill);
      walk(skill.children);
    }
  };
  for (const attribute of attributes) for (const sub of attribute.subAttributes) walk(sub.skills);
  return result;
}
