import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Trees,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync, errorMessage } from '../lib/hooks';
import type { Attribute, DecayConfig, Skill, SubAttribute } from '../types';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Panel,
  Progress,
} from '../components/ui';
import { formatDateTime, formatNumber, relativeTime } from '../lib/format';

type Editor =
  | { kind: 'attribute'; mode: 'create' | 'edit'; attribute?: Attribute }
  | { kind: 'sub'; mode: 'create' | 'edit'; attributeId: string; sub?: SubAttribute }
  | {
      kind: 'skill';
      mode: 'create' | 'edit';
      subAttributeId: string | null;
      parentSkillId: string | null;
      skill?: Skill;
    };

type HistoryTarget = { type: 'attribute' | 'sub_attribute' | 'skill'; id: string; name: string };

const DEFAULT_DECAY: DecayConfig = {
  enabled: false,
  graceDays: 14,
  intervalDays: 7,
  ratePerInterval: 2,
  minimumProficiency: 20,
  recoveryPerXp: 1,
};

export function SkillsPage() {
  const { data, refresh, notify, confirm } = useApp();
  const [params, setParams] = useSearchParams();
  const [tree, setTree] = useState<Attribute[]>(data?.taxonomy ?? []);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [history, setHistory] = useState<HistoryTarget | null>(null);
  const focus = params.get('focus');

  useEffect(() => {
    setTree(data?.taxonomy ?? []);
  }, [data?.taxonomy]);

  useEffect(() => {
    if (!focus) return;
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(focus);
      return next;
    });
    const attribute = data?.taxonomy.find((item) => item.id === focus);
    if (attribute) {
      setCollapsed((current) => {
        const next = new Set(current);
        for (const sub of attribute.subAttributes) next.delete(sub.id);
        return next;
      });
    }
    const timer = window.setTimeout(() => {
      document.getElementById(`attr-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focus, data?.taxonomy]);

  const filtered = useMemo(() => filterTree(tree, query), [tree, query]);

  const apply = (attributes: Attribute[]) => {
    setTree(attributes);
    void refresh();
  };

  const deleteAttribute = async (attribute: Attribute) => {
    const ok = await confirm({
      title: 'Delete attribute?',
      message: `Delete "${attribute.name}"? It can only be removed when it has no sub-attributes. Activities remain in your audit trail.`,
      confirmLabel: 'Delete attribute',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.del<{ attributes: Attribute[] }>(`/attributes/${attribute.id}`);
      apply(result.attributes);
      notify('success', 'Attribute deleted');
    } catch (cause) {
      notify('error', 'Could not delete attribute', errorMessage(cause));
    }
  };

  const deleteSub = async (sub: SubAttribute) => {
    const ok = await confirm({
      title: 'Delete branch?',
      message: `Delete "${sub.name}" and its nested skills? Lifetime XP history is retained in the audit log.`,
      confirmLabel: 'Delete branch',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.del<{ attributes: Attribute[] }>(`/sub-attributes/${sub.id}`);
      apply(result.attributes);
      notify('success', 'Branch deleted');
    } catch (cause) {
      notify('error', 'Could not delete branch', errorMessage(cause));
    }
  };

  const deleteSkill = async (skill: Skill) => {
    const ok = await confirm({
      title: 'Delete skill?',
      message: `Delete "${skill.name}"? Nested skills are deleted with it; recorded activity history remains auditable.`,
      confirmLabel: 'Delete skill',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.del<{ attributes: Attribute[] }>(`/skills/${skill.id}`);
      apply(result.attributes);
      notify('success', 'Skill deleted');
    } catch (cause) {
      notify('error', 'Could not delete skill', errorMessage(cause));
    }
  };

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        eyebrow="Skill forest"
        title="Skill Trees"
        subtitle="Attributes branch into sub-attributes, which grow deeper into nested skills. Practice feeds the whole branch."
        actions={
          <Button variant="primary" onClick={() => setEditor({ kind: 'attribute', mode: 'create' })}>
            <Plus size={15} /> Attribute
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            className="input pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an attribute, branch or skill…"
          />
        </div>
        {focus ? (
          <Button size="sm" onClick={() => { setParams({}); }}>Clear focus</Button>
        ) : null}
        <p className="hidden text-[11px] text-ink-500 sm:block">
          {data?.counts.subAttributes ?? 0} branches · {data?.counts.skills ?? 0} skills
        </p>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Trees size={18} />}
            title={query ? 'Nothing matches that search' : 'Plant the first attribute'}
            description={
              query
                ? 'Try a shorter term, or clear the search to see the full forest.'
                : 'Build domains of your life: Physical, Intellect, Craft, Social, Character, Financial, Lifestyle.'
            }
            action={query ? <Button onClick={() => setQuery('')}>Clear search</Button> : undefined}
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {filtered.map((attribute) => {
            const isCollapsed = collapsed.has(attribute.id);
            const skillCount = countSkills(attribute.subAttributes);
            return (
              <Panel key={attribute.id} id={`attr-${attribute.id}`} className="scroll-mt-20 overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggle(attribute.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? <ChevronRight size={15} className="shrink-0 text-ink-500" /> : <ChevronDown size={15} className="shrink-0 text-ink-500" />}
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: attribute.color }} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-display text-lg text-ink-100">{attribute.name}</h2>
                        {attribute.isCore ? <Badge tone="muted">Core</Badge> : null}
                      </div>
                      <p className="truncate text-[11px] text-ink-500">
                        {attribute.description || `${attribute.subAttributes.length} branches · ${skillCount} skills`}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="hidden text-right sm:block">
                      <p className="font-mono text-sm text-ink-200">{attribute.proficiency.toFixed(1)}</p>
                      <p className="text-[10px] text-ink-500">peak {attribute.peakProficiency.toFixed(0)}</p>
                    </div>
                    <div className="hidden w-24 sm:block">
                      <Progress value={attribute.proficiency} color={attribute.color} height={4} />
                    </div>
                    <div className="flex items-center gap-0.5">
                      <IconButton label="Add branch" onClick={() => setEditor({ kind: 'sub', mode: 'create', attributeId: attribute.id })}>
                        <Plus size={15} />
                      </IconButton>
                      <IconButton label="Attribute history" onClick={() => setHistory({ type: 'attribute', id: attribute.id, name: attribute.name })}>
                        <History size={14} />
                      </IconButton>
                      <IconButton label="Edit attribute" onClick={() => setEditor({ kind: 'attribute', mode: 'edit', attribute })}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton label="Delete attribute" onClick={() => void deleteAttribute(attribute)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </div>
                </div>

                {!isCollapsed ? (
                  <div className="border-t border-white/[0.06] bg-ink-950/25 px-3 py-3 sm:px-4">
                    {attribute.subAttributes.length === 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-3 text-xs text-ink-500">
                        <span>No branches yet. A branch groups related skills beneath this attribute.</span>
                        <Button size="sm" variant="outline" onClick={() => setEditor({ kind: 'sub', mode: 'create', attributeId: attribute.id })}>
                          <Plus size={13} /> Add branch
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {attribute.subAttributes.map((sub) => {
                          const subCollapsed = collapsed.has(sub.id);
                          return (
                            <div key={sub.id} className="rounded-md border border-white/[0.05] bg-white/[0.015]">
                              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => toggle(sub.id)}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                  aria-expanded={!subCollapsed}
                                >
                                  {subCollapsed ? <ChevronRight size={13} className="shrink-0 text-ink-600" /> : <ChevronDown size={13} className="shrink-0 text-ink-600" />}
                                  <span className="truncate text-sm text-ink-200">{sub.name}</span>
                                  {sub.decay.enabled ? (
                                    <Badge tone="muted"><Clock size={9} /> decay</Badge>
                                  ) : null}
                                  {sub.skills.length > 0 ? <span className="text-[10px] text-ink-600">{sub.skills.length} skills</span> : null}
                                </button>
                                <div className="flex items-center gap-2">
                                  <span className="hidden text-[10px] text-ink-500 sm:inline">{formatNumber(sub.lifetimeXp)} xp</span>
                                  <div className="w-16 sm:w-24">
                                    <Progress value={sub.proficiency} color={attribute.color} height={4} />
                                  </div>
                                  <span className="w-9 text-right font-mono text-[11px] text-ink-300">{sub.proficiency.toFixed(0)}</span>
                                  <div className="flex items-center gap-0.5">
                                    <IconButton
                                      label="Add skill"
                                      onClick={() => setEditor({ kind: 'skill', mode: 'create', subAttributeId: sub.id, parentSkillId: null })}
                                    >
                                      <Plus size={14} />
                                    </IconButton>
                                    <IconButton label="Branch history" onClick={() => setHistory({ type: 'sub_attribute', id: sub.id, name: sub.name })}>
                                      <History size={13} />
                                    </IconButton>
                                    <IconButton label="Edit branch" onClick={() => setEditor({ kind: 'sub', mode: 'edit', attributeId: attribute.id, sub })}>
                                      <Pencil size={13} />
                                    </IconButton>
                                    <IconButton label="Delete branch" onClick={() => void deleteSub(sub)}>
                                      <Trash2 size={13} />
                                    </IconButton>
                                  </div>
                                </div>
                              </div>
                              {!subCollapsed ? (
                                <div className="border-t border-white/[0.04] px-3 py-2">
                                  {sub.skills.length === 0 ? (
                                    <p className="py-1 text-[11px] text-ink-600">
                                      No skills yet. Add a skill and log practice to grow it.
                                    </p>
                                  ) : (
                                    <div className="space-y-1">
                                      {sub.skills.map((skill) => (
                                        <SkillNode
                                          key={skill.id}
                                          skill={skill}
                                          color={attribute.color}
                                          depth={0}
                                          collapsed={collapsed}
                                          onToggle={toggle}
                                          onAddChild={(parent) =>
                                            setEditor({
                                              kind: 'skill',
                                              mode: 'create',
                                              subAttributeId: sub.id,
                                              parentSkillId: parent.id,
                                            })
                                          }
                                          onEdit={(target) =>
                                            setEditor({
                                              kind: 'skill',
                                              mode: 'edit',
                                              subAttributeId: sub.id,
                                              parentSkillId: target.parentSkillId,
                                              skill: target,
                                            })
                                          }
                                          onDelete={(target) => void deleteSkill(target)}
                                          onHistory={(target) => setHistory({ type: 'skill', id: target.id, name: target.name })}
                                          onSubHistory={() => setHistory({ type: 'sub_attribute', id: sub.id, name: sub.name })}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}

      {editor ? (
        <EditorModal
          editor={editor}
          attributes={tree}
          onClose={() => setEditor(null)}
          onSaved={(attributes) => {
            apply(attributes);
            setEditor(null);
          }}
          notify={notify}
        />
      ) : null}

      {history ? <HistoryModal target={history} onClose={() => setHistory(null)} /> : null}
    </>
  );
}

function SkillNode({
  skill,
  color,
  depth,
  collapsed,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  onHistory,
  onSubHistory,
}: {
  skill: Skill;
  color: string;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onHistory: (skill: Skill) => void;
  onSubHistory: () => void;
}) {
  const isCollapsed = collapsed.has(skill.id);
  const hasChildren = skill.children.length > 0;
  return (
    <div>
      <div
        className="group flex flex-wrap items-center gap-2 rounded px-1.5 py-1.5 transition hover:bg-white/[0.02]"
        style={{ marginLeft: depth * 14 }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => onToggle(skill.id)} aria-label="Toggle nested skills" className="text-ink-600 hover:text-ink-300">
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : (
          <span className="h-3 w-3 rounded-full border border-white/[0.12]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-ink-200">{skill.name}</span>
            {skill.isCertification ? (
              <Badge tone="gold"><ShieldCheck size={9} /> certification</Badge>
            ) : null}
            {skill.decay.enabled && !skill.isCertification ? <Badge tone="muted"><Clock size={9} /> decay</Badge> : null}
            {hasChildren ? <span className="text-[10px] text-ink-600">{skill.children.length} nested</span> : null}
          </div>
          {skill.lastPracticeAt ? (
            <p className="text-[10px] text-ink-500">
              practiced {relativeTime(skill.lastPracticeAt)} · {formatNumber(skill.lifetimeXp)} xp
            </p>
          ) : skill.description ? (
            <p className="truncate text-[10px] text-ink-500">{skill.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 sm:w-20">
            <Progress value={skill.proficiency} color={color} height={3} />
          </div>
          <span className="w-8 text-right font-mono text-[11px] text-ink-300">{skill.proficiency.toFixed(0)}</span>
          <div className="flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
            <IconButton label="Add nested skill" onClick={() => onAddChild(skill)}><Plus size={13} /></IconButton>
            <IconButton label="Skill history" onClick={() => onHistory(skill)}><History size={12} /></IconButton>
            <IconButton label="Parent branch history" onClick={onSubHistory}><Trees size={12} /></IconButton>
            <IconButton label="Edit skill" onClick={() => onEdit(skill)}><Pencil size={12} /></IconButton>
            <IconButton label="Delete skill" onClick={() => onDelete(skill)}><Trash2 size={12} /></IconButton>
          </div>
        </div>
      </div>
      {!isCollapsed
        ? skill.children.map((child) => (
            <SkillNode
              key={child.id}
              skill={child}
              color={color}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onHistory={onHistory}
              onSubHistory={onSubHistory}
            />
          ))
        : null}
    </div>
  );
}

function EditorModal({
  editor,
  attributes,
  onClose,
  onSaved,
  notify,
}: {
  editor: Editor;
  attributes: Attribute[];
  onClose: () => void;
  onSaved: (attributes: Attribute[]) => void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const isAttribute = editor.kind === 'attribute';
  const initial = editor.kind === 'sub' ? editor.sub : editor.kind === 'skill' ? editor.skill : editor.attribute;
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor] = useState(editor.kind === 'attribute' ? editor.attribute?.color ?? '#cfa960' : '#cfa960');
  const [weight, setWeight] = useState(initial?.weight ?? 1);
  const [attributeId, setAttributeId] = useState(
    editor.kind === 'sub' ? editor.attributeId : editor.kind === 'attribute' ? '' : '',
  );
  const [manualProficiency, setManualProficiency] = useState<string>(
    editor.kind !== 'attribute' && initial ? String(initial.ownProficiency) : '',
  );
  const [isCertification, setIsCertification] = useState(editor.kind === 'skill' ? editor.skill?.isCertification ?? false : false);
  const decayInitial = editor.kind === 'sub' ? editor.sub?.decay : editor.kind === 'skill' ? editor.skill?.decay : undefined;
  const [decay, setDecay] = useState<DecayConfig>(decayInitial ?? DEFAULT_DECAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSkills = useMemo(() => flattenAllSkills(attributes), [attributes]).filter(
    (skill) => editor.kind !== 'skill' || skill.id !== editor.skill?.id,
  );

  const decayPayload = {
    enabled: decay.enabled,
    graceDays: decay.graceDays,
    intervalDays: decay.intervalDays,
    ratePerInterval: decay.ratePerInterval,
    minimumProficiency: decay.minimumProficiency,
    recoveryPerXp: decay.recoveryPerXp,
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let result: { attributes: Attribute[] };
      if (editor.kind === 'attribute') {
        const body = { name: name.trim(), description, color, weight };
        result =
          editor.mode === 'create'
            ? await api.post<{ attributes: Attribute[] }>('/attributes', body)
            : await api.patch<{ attributes: Attribute[] }>(`/attributes/${editor.attribute?.id}`, body);
      } else if (editor.kind === 'sub') {
        const body: Record<string, unknown> = {
          name: name.trim(),
          description,
          weight,
          attributeId,
          decay: decayPayload,
        };
        if (editor.mode === 'edit' && manualProficiency !== '') body.manualProficiency = Number(manualProficiency);
        result =
          editor.mode === 'create'
            ? await api.post<{ attributes: Attribute[] }>('/sub-attributes', body)
            : await api.patch<{ attributes: Attribute[] }>(`/sub-attributes/${editor.sub?.id}`, body);
      } else {
        const body: Record<string, unknown> = {
          name: name.trim(),
          description,
          weight,
          parentSkillId: editor.parentSkillId,
          subAttributeId: editor.subAttributeId,
          isCertification,
          decay: decayPayload,
        };
        if (editor.mode === 'edit' && manualProficiency !== '') body.manualProficiency = Number(manualProficiency);
        result =
          editor.mode === 'create'
            ? await api.post<{ attributes: Attribute[] }>('/skills', body)
            : await api.patch<{ attributes: Attribute[] }>(`/skills/${editor.skill?.id}`, body);
      }
      onSaved(result.attributes);
      notify('success', editor.mode === 'create' ? 'Created' : 'Updated');
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
      title={
        editor.mode === 'create'
          ? editor.kind === 'attribute'
            ? 'New attribute'
            : editor.kind === 'sub'
              ? 'New branch'
              : 'New skill'
          : `Edit ${editor.kind === 'sub' ? 'branch' : editor.kind}`
      }
      description={
        editor.kind === 'attribute'
          ? 'Attributes are the broad domains of your life.'
          : 'Decay affects proficiency only; lifetime XP and level are preserved forever.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : editor.mode === 'create' ? 'Create' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-[70px]" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
        </Field>

        {editor.kind === 'attribute' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Colour">
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-white/[0.08] bg-ink-950" />
                <input className="input" value={color} onChange={(event) => setColor(event.target.value)} maxLength={20} />
              </div>
            </Field>
            <Field label="Weight" hint="Relative contribution to the character sheet.">
              <input type="number" min={0} step="0.1" className="input" value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
            </Field>
          </div>
        ) : (
          <>
            {editor.kind === 'sub' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Parent attribute">
                  <select className="select" value={attributeId} onChange={(event) => setAttributeId(event.target.value)}>
                    {attributes.map((attribute) => (
                      <option key={attribute.id} value={attribute.id}>{attribute.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Weight">
                  <input type="number" min={0} step="0.1" className="input" value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Parent skill">
                  <select
                    className="select"
                    value={editor.parentSkillId ?? ''}
                    disabled
                    onChange={() => undefined}
                  >
                    <option value="">Root skill (directly under branch)</option>
                    {allSkills.map((skill) => (
                      <option key={skill.id} value={skill.id}>{skill.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Weight">
                  <input type="number" min={0} step="0.1" className="input" value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
                </Field>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {editor.mode === 'edit' ? (
                <Field label="Adjust proficiency" hint="Manual correction, 0–100. Lifetime XP is not changed.">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    className="input"
                    value={manualProficiency}
                    onChange={(event) => setManualProficiency(event.target.value)}
                  />
                </Field>
              ) : (
                <div />
              )}
              {editor.kind === 'skill' ? (
                <label className="mt-5 flex items-start gap-2 text-sm text-ink-300">
                  <input
                    type="checkbox"
                    checked={isCertification}
                    onChange={(event) => setIsCertification(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-gold-500"
                  />
                  <span>
                    Certification
                    <span className="mt-0.5 block text-[11px] text-ink-500">Certifications never decay.</span>
                  </span>
                </label>
              ) : null}
            </div>

            <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-3">
              <label className="flex items-center gap-2 text-sm text-ink-200">
                <input
                  type="checkbox"
                  checked={decay.enabled}
                  onChange={(event) => setDecay((current) => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 accent-gold-500"
                  disabled={editor.kind === 'skill' && isCertification}
                />
                Enable proficiency decay
              </label>
              <p className="mt-1 pl-6 text-[11px] leading-5 text-ink-500">
                Grace period after practice, then a fixed rate per interval. Never reduces lifetime XP or player level.
              </p>
              {decay.enabled ? (
                <div className="mt-3 grid gap-3 pl-6 sm:grid-cols-3">
                  <Field label="Grace days">
                    <input type="number" min={0} className="input py-1 text-xs" value={decay.graceDays} onChange={(event) => setDecay((current) => ({ ...current, graceDays: Number(event.target.value) }))} />
                  </Field>
                  <Field label="Interval days">
                    <input type="number" min={1} className="input py-1 text-xs" value={decay.intervalDays} onChange={(event) => setDecay((current) => ({ ...current, intervalDays: Number(event.target.value) }))} />
                  </Field>
                  <Field label="Points / interval">
                    <input type="number" min={0} step="0.1" className="input py-1 text-xs" value={decay.ratePerInterval} onChange={(event) => setDecay((current) => ({ ...current, ratePerInterval: Number(event.target.value) }))} />
                  </Field>
                  <Field label="Floor">
                    <input type="number" min={0} max={100} step="0.1" className="input py-1 text-xs" value={decay.minimumProficiency} onChange={(event) => setDecay((current) => ({ ...current, minimumProficiency: Number(event.target.value) }))} />
                  </Field>
                  <Field label="Recovery / XP">
                    <input type="number" min={0} step="0.01" className="input py-1 text-xs" value={decay.recoveryPerXp} onChange={(event) => setDecay((current) => ({ ...current, recoveryPerXp: Number(event.target.value) }))} />
                  </Field>
                </div>
              ) : null}
            </div>
          </>
        )}

        {error ? (
          <div className="rounded-md border border-blood/30 bg-blood/[0.07] px-3 py-2 text-xs text-[#e0a0a0]">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}

interface HistoryRow {
  id: string;
  proficiency: number;
  peakProficiency: number;
  lifetimeXp: number;
  createdAt: string;
}

function HistoryModal({ target, onClose }: { target: HistoryTarget; onClose: () => void }) {
  const path =
    target.type === 'attribute'
      ? `/attributes/${target.id}/history?limit=60`
      : `/proficiency/${target.type}/${target.id}/history?limit=60`;
  const history = useAsync(() => api.get<{ history: HistoryRow[] }>(path), [path]);
  const rows = (history.data?.history ?? []).slice().reverse();
  const points = rows.map((row) => row.proficiency);
  const max = Math.max(100, ...points);
  const sparkline =
    points.length > 1
      ? points
          .map((value, index) => {
            const x = (index / (points.length - 1)) * 100;
            const y = 34 - (value / max) * 30;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(' ')
      : '';

  return (
    <Modal open onClose={onClose} title={`${target.name} · history`} description="Recorded proficiency snapshots, most recent first." wide>
      {history.loading ? (
        <p className="py-6 text-center text-sm text-ink-500">Loading history…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">No history yet. Snapshots are written when XP is awarded.</p>
      ) : (
        <div className="space-y-4">
          {points.length > 1 ? (
            <div className="rounded-md border border-white/[0.06] bg-ink-950/60 p-3">
              <svg viewBox="0 0 100 36" className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label="Proficiency trend">
                <polyline points={sparkline} fill="none" stroke="#cfa960" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              </svg>
              <p className="text-[10px] text-ink-500">Proficiency trend across {points.length} snapshots</p>
            </div>
          ) : null}
          <div className="max-h-[48vh] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="py-1.5 font-medium">When</th>
                  <th className="py-1.5 text-right font-medium">Proficiency</th>
                  <th className="py-1.5 text-right font-medium">Peak</th>
                  <th className="py-1.5 text-right font-medium">Lifetime XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-1.5 text-ink-400">{formatDateTime(row.createdAt)}</td>
                    <td className="py-1.5 text-right font-mono text-ink-200">{row.proficiency.toFixed(1)}</td>
                    <td className="py-1.5 text-right font-mono text-ink-400">{row.peakProficiency.toFixed(1)}</td>
                    <td className="py-1.5 text-right font-mono text-ink-400">{formatNumber(row.lifetimeXp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function countSkills(subs: SubAttribute[]): number {
  return subs.reduce((sum, sub) => sum + countSkillNodes(sub.skills), 0);
}

function countSkillNodes(skills: Skill[]): number {
  return skills.reduce((sum, skill) => sum + 1 + countSkillNodes(skill.children), 0);
}

function flattenAllSkills(attributes: Attribute[]): Skill[] {
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

function filterTree(attributes: Attribute[], query: string): Attribute[] {
  const q = query.trim().toLowerCase();
  if (!q) return attributes;
  const hit = (value: string) => value.toLowerCase().includes(q);
  return attributes
    .map((attribute) => {
      const attributeHit = hit(attribute.name) || hit(attribute.description);
      const subs = attributeHit
        ? attribute.subAttributes
        : attribute.subAttributes
            .map((sub) => {
              const subHit = hit(sub.name) || hit(sub.description);
              const skills = subHit ? sub.skills : filterSkills(sub.skills, q);
              return subHit || skills.length > 0 ? { ...sub, skills } : null;
            })
            .filter((sub): sub is SubAttribute => sub !== null);
      return attributeHit || subs.length > 0 ? { ...attribute, subAttributes: subs } : null;
    })
    .filter((attribute): attribute is Attribute => attribute !== null);
}

function filterSkills(skills: Skill[], query: string): Skill[] {
  return skills
    .map((skill) => {
      const children = filterSkills(skill.children, query);
      const hit = skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query);
      return hit || children.length > 0 ? { ...skill, children } : null;
    })
    .filter((skill): skill is Skill => skill !== null);
}
