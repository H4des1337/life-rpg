import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Flame,
  Pause,
  Pencil,
  Plus,
  Search,
  Swords,
  Trash2,
  Trophy,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync, errorMessage } from '../lib/hooks';
import type { Quest, Streak } from '../types';
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
  SectionHeading,
  Tabs,
} from '../components/ui';
import { daysUntil, formatDate, relativeTime, todayInput, titleCase } from '../lib/format';

type QuestStatus = 'all' | Quest['status'];

const STATUS_TONE: Record<Quest['status'], 'gold' | 'jade' | 'muted' | 'danger'> = {
  active: 'gold',
  paused: 'muted',
  completed: 'jade',
  abandoned: 'danger',
};

export function QuestsPage() {
  const { data, refresh, notify, confirm, openComposer } = useApp();
  const quests = useAsync(() => api.get<{ quests: Quest[] }>('/quests?status=all'), []);
  const streaks = useAsync(() => api.get<{ streaks: Streak[] }>('/streaks'), []);
  const [status, setStatus] = useState<QuestStatus>('active');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Quest | 'new' | null>(null);
  const [streakOpen, setStreakOpen] = useState(false);

  const allQuests = quests.data?.quests ?? data?.quests ?? [];
  const allStreaks = streaks.data?.streaks ?? data?.streaks ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allQuests.filter((quest) => {
      if (status !== 'all' && quest.status !== status) return false;
      if (!q) return true;
      return (
        quest.title.toLowerCase().includes(q) ||
        quest.description.toLowerCase().includes(q) ||
        quest.category.toLowerCase().includes(q)
      );
    });
  }, [allQuests, status, query]);

  const counts = useMemo(() => {
    const result: Record<QuestStatus, number> = { all: allQuests.length, active: 0, paused: 0, completed: 0, abandoned: 0 };
    for (const quest of allQuests) result[quest.status] += 1;
    return result;
  }, [allQuests]);

  const afterChange = async () => {
    quests.reload();
    await refresh();
  };

  const toggleMilestone = async (quest: Quest, milestoneId: string) => {
    try {
      await api.patch(`/quests/${quest.id}`, {
        milestones: quest.milestones.map((milestone) =>
          milestone.id === milestoneId ? { id: milestone.id, title: milestone.title, done: !milestone.done } : { id: milestone.id, title: milestone.title, done: milestone.done },
        ),
      });
      await afterChange();
      notify('success', 'Milestone updated');
    } catch (cause) {
      notify('error', 'Could not update milestone', errorMessage(cause));
    }
  };

  const setQuestStatus = async (quest: Quest, next: Quest['status']) => {
    try {
      await api.patch(`/quests/${quest.id}`, { status: next });
      await afterChange();
      notify('success', `Quest ${next}`);
    } catch (cause) {
      notify('error', 'Could not update quest', errorMessage(cause));
    }
  };

  const deleteQuest = async (quest: Quest) => {
    const ok = await confirm({
      title: 'Delete quest?',
      message: `"${quest.title}" will be deleted. Linked activities keep their XP and audit history.`,
      confirmLabel: 'Delete quest',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/quests/${quest.id}`);
      await afterChange();
      notify('success', 'Quest deleted');
    } catch (cause) {
      notify('error', 'Could not delete quest', errorMessage(cause));
    }
  };

  const checkIn = async (streak: Streak) => {
    try {
      const result = await api.post<{ streak: Streak; streaks: Streak[] }>(`/streaks/${streak.id}/checkin`, {
        date: todayInput(),
        note: '',
      });
      streaks.setData({ streaks: result.streaks });
      await refresh();
      notify('success', 'Streak checked in', `${result.streak.current} ${result.streak.cadence === 'weekly' ? 'week' : 'day'} streak.`);
    } catch (cause) {
      notify('error', 'Could not check in', errorMessage(cause));
    }
  };

  const toggleStreak = async (streak: Streak) => {
    try {
      const result = await api.patch<{ streak: Streak; streaks: Streak[] }>(`/streaks/${streak.id}`, {
        enabled: !streak.enabled,
      });
      streaks.setData({ streaks: result.streaks });
    } catch (cause) {
      notify('error', 'Could not update streak', errorMessage(cause));
    }
  };

  const deleteStreak = async (streak: Streak) => {
    const ok = await confirm({
      title: 'Delete streak?',
      message: `Delete "${streak.name}" and all of its check-in history?`,
      confirmLabel: 'Delete streak',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.del<{ streaks: Streak[] }>(`/streaks/${streak.id}`);
      streaks.setData({ streaks: result.streaks });
      notify('success', 'Streak deleted');
    } catch (cause) {
      notify('error', 'Could not delete streak', errorMessage(cause));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Commitments"
        title="Quests"
        subtitle="Larger arcs with milestones, target dates and linked skills. Log activities against a quest to keep the story connected."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={15} /> New quest
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={status}
              onChange={setStatus}
              tabs={(['active', 'paused', 'completed', 'abandoned', 'all'] as QuestStatus[]).map((id) => ({
                id,
                label: titleCase(id),
                count: counts[id],
              }))}
              className="flex-1"
            />
            <div className="relative w-full sm:w-56">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input className="input py-1.5 pl-9 text-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quests" />
            </div>
          </div>

          {visible.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Swords size={18} />}
                title={query ? 'No matching quests' : status === 'active' ? 'No active quests' : 'Nothing here'}
                description="Quests give shape to multi-step efforts: a certification, a project, a fitness goal, a financial milestone."
                action={<Button variant="primary" size="sm" onClick={() => setEditing('new')}><Plus size={14} /> Create a quest</Button>}
              />
            </Panel>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visible.map((quest) => {
                const remaining = daysUntil(quest.targetDate);
                return (
                  <Panel key={quest.id} className="flex flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={STATUS_TONE[quest.status]}>{titleCase(quest.status)}</Badge>
                          {quest.category ? <Badge tone="muted">{quest.category}</Badge> : null}
                        </div>
                        <h3 className="mt-1.5 font-display text-lg leading-tight text-ink-100">{quest.title}</h3>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <IconButton label="Edit quest" onClick={() => setEditing(quest)}><Pencil size={13} /></IconButton>
                        <IconButton label="Delete quest" onClick={() => void deleteQuest(quest)}><Trash2 size={13} /></IconButton>
                      </div>
                    </div>

                    {quest.description ? (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-ink-400">{quest.description}</p>
                    ) : null}

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-ink-500">
                        <span>{quest.progress.toFixed(0)}% complete</span>
                        <span>
                          {quest.milestones.filter((milestone) => milestone.done).length}/{quest.milestones.length} milestones
                        </span>
                      </div>
                      <Progress value={quest.progress} color={quest.status === 'completed' ? '#6fbfa0' : '#cfa960'} height={5} />
                    </div>

                    {quest.milestones.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {quest.milestones.map((milestone) => (
                          <button
                            key={milestone.id}
                            type="button"
                            onClick={() => void toggleMilestone(quest, milestone.id)}
                            className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-ink-300 transition hover:bg-white/[0.03] hover:text-ink-100"
                          >
                            {milestone.done ? (
                              <CheckCircle2 size={13} className="shrink-0 text-jade" />
                            ) : (
                              <Circle size={13} className="shrink-0 text-ink-600" />
                            )}
                            <span className={clsx('truncate', milestone.done && 'text-ink-500 line-through')}>{milestone.title}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      {quest.attributes.map((attribute) => (
                        <span key={attribute.id} className="chip">{attribute.name}</span>
                      ))}
                      {quest.skills.map((skill) => (
                        <span key={skill.id} className="chip text-gold-400/90">{skill.name}</span>
                      ))}
                      {quest.activityCount > 0 ? (
                        <span className="chip"><Flame size={9} className="text-gold-500" /> {quest.activityCount} activities</span>
                      ) : null}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
                      <span className="text-[10px] text-ink-500">
                        {quest.targetDate ? (
                          <span className={clsx(remaining !== null && remaining < 0 && quest.status === 'active' && 'text-[#e0a0a0]')}>
                            <CalendarDays size={10} className="mr-1 inline" />
                            {formatDate(quest.targetDate)}
                            {remaining !== null && quest.status === 'active'
                              ? remaining >= 0
                                ? ` · ${remaining}d left`
                                : ` · ${Math.abs(remaining)}d overdue`
                              : ''}
                          </span>
                        ) : (
                          `updated ${relativeTime(quest.updatedAt)}`
                        )}
                      </span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openComposer(quest.id)}>
                          <Plus size={12} /> Log
                        </Button>
                        {quest.status === 'active' ? (
                          <Button size="sm" variant="ghost" onClick={() => void setQuestStatus(quest, 'paused')}>
                            <Pause size={12} /> Pause
                          </Button>
                        ) : quest.status === 'paused' ? (
                          <Button size="sm" variant="outline" onClick={() => void setQuestStatus(quest, 'active')}>
                            Resume
                          </Button>
                        ) : quest.status === 'completed' ? null : (
                          <Button size="sm" variant="outline" onClick={() => void setQuestStatus(quest, 'active')}>
                            Reactivate
                          </Button>
                        )}
                        {quest.status !== 'completed' && quest.status !== 'abandoned' ? (
                          <Button size="sm" variant="primary" onClick={() => void setQuestStatus(quest, 'completed')}>
                            Complete
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Panel className="panel-pad">
            <SectionHeading
              title="Streaks"
              subtitle="Optional consistency rituals."
              actions={
                <Button size="sm" variant="ghost" onClick={() => setStreakOpen(true)}>
                  <Plus size={13} /> Add
                </Button>
              }
            />
            {allStreaks.length === 0 ? (
              <EmptyState
                icon={<Flame size={18} />}
                title="No streaks"
                description="Streaks are fully optional. Create one for a daily or weekly ritual you want to keep visible."
                action={<Button size="sm" variant="outline" onClick={() => setStreakOpen(true)}><Plus size={13} /> Create streak</Button>}
              />
            ) : (
              <div className="space-y-2">
                {allStreaks.map((streak) => (
                  <div key={streak.id} className="rounded-md border border-white/[0.06] bg-white/[0.015] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-200">{streak.name}</p>
                        <p className="text-[10px] text-ink-500">
                          {titleCase(streak.cadence)} · best {streak.longest} · {streak.enabled ? 'active' : 'paused'}
                        </p>
                      </div>
                      <div className="flex gap-0.5">
                        <IconButton label={streak.enabled ? 'Pause streak' : 'Resume streak'} onClick={() => void toggleStreak(streak)}>
                          <Pause size={12} />
                        </IconButton>
                        <IconButton label="Delete streak" onClick={() => void deleteStreak(streak)}>
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <p className="font-display text-2xl text-ink-100">{streak.current}</p>
                        <p className="text-[10px] text-ink-500">current {streak.cadence === 'weekly' ? 'weeks' : 'days'}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={streak.checkedToday ? 'ghost' : 'primary'}
                        disabled={streak.checkedToday || !streak.enabled}
                        onClick={() => void checkIn(streak)}
                      >
                        {streak.checkedToday ? <><CheckCircle2 size={12} /> Checked in</> : 'Check in'}
                      </Button>
                    </div>
                    {streak.entries.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {streak.entries.slice(0, 14).map((entry) => (
                          <span key={entry.id} className="rounded border border-jade/20 bg-jade/[0.06] px-1 py-0.5 font-mono text-[9px] text-jade/80">
                            {entry.date.slice(5)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="panel-pad">
            <p className="flex items-center gap-2 text-sm text-ink-200">
              <Trophy size={15} className="text-gold-500" /> How quests pay off
            </p>
            <p className="mt-1.5 text-xs leading-5 text-ink-400">
              Completing a quest records a timeline event and evaluates achievements. The XP comes from logged
              activities, so quests never award unearned progression by themselves.
            </p>
          </Panel>
        </div>
      </div>

      {editing ? (
        <QuestModal
          quest={editing === 'new' ? null : editing}
          attributes={data?.taxonomy ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await afterChange();
          }}
          notify={notify}
        />
      ) : null}

      {streakOpen ? (
        <StreakModal
          onClose={() => setStreakOpen(false)}
          onSaved={(list) => {
            streaks.setData({ streaks: list });
            setStreakOpen(false);
          }}
          notify={notify}
        />
      ) : null}
    </>
  );
}

function QuestModal({
  quest,
  attributes,
  onClose,
  onSaved,
  notify,
}: {
  quest: Quest | null;
  attributes: import('../types').Attribute[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const [title, setTitle] = useState(quest?.title ?? '');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [category, setCategory] = useState(quest?.category ?? '');
  const [targetDate, setTargetDate] = useState(quest?.targetDate?.slice(0, 10) ?? '');
  const [status, setStatus] = useState<Quest['status']>(quest?.status ?? 'active');
  const [progress, setProgress] = useState(quest?.progress ?? 0);
  const [milestones, setMilestones] = useState<Array<{ id?: string; title: string; done: boolean }>>(
    quest?.milestones.map((milestone) => ({ id: milestone.id, title: milestone.title, done: milestone.done })) ?? [],
  );
  const [attributeIds, setAttributeIds] = useState<string[]>(quest?.attributes.map((attribute) => attribute.id) ?? []);
  const [skillIds, setSkillIds] = useState<string[]>(quest?.skills.map((skill) => skill.id) ?? []);
  const [newMilestone, setNewMilestone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSkills = useMemo(() => flattenSkills(attributes), [attributes]);
  const hasMilestones = milestones.length > 0;

  const addMilestone = () => {
    if (!newMilestone.trim()) return;
    setMilestones((current) => [...current, { title: newMilestone.trim(), done: false }]);
    setNewMilestone('');
  };

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        description,
        category,
        targetDate: targetDate || null,
        status,
        progress: Math.max(0, Math.min(100, progress)),
        attributeIds,
        skillIds,
        milestones: milestones
          .filter((milestone) => milestone.title.trim())
          .map((milestone) => ({ id: milestone.id, title: milestone.title.trim(), done: milestone.done })),
      };
      if (quest) await api.patch(`/quests/${quest.id}`, body);
      else await api.post('/quests', body);
      await onSaved();
      notify('success', quest ? 'Quest updated' : 'Quest created');
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
      title={quest ? 'Edit quest' : 'New quest'}
      description="Quests organise multi-step efforts. XP still comes from logged activities."
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : quest ? 'Save quest' : 'Create quest'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1.7fr_1fr]">
          <Field label="Title">
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} autoFocus />
          </Field>
          <Field label="Category">
            <input className="input" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} placeholder="e.g. Career" />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="input min-h-[80px]" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Target date">
            <input type="date" className="input" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </Field>
          <Field label="Status">
            <select className="select" value={status} onChange={(event) => setStatus(event.target.value as Quest['status'])}>
              {(['active', 'paused', 'completed', 'abandoned'] as const).map((value) => (
                <option key={value} value={value}>{titleCase(value)}</option>
              ))}
            </select>
          </Field>
          <Field label="Progress" hint={hasMilestones ? 'Milestones set progress automatically.' : 'Manual completion percentage.'}>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className="input"
              value={progress}
              disabled={hasMilestones}
              onChange={(event) => setProgress(Number(event.target.value))}
            />
          </Field>
        </div>

        <div>
          <span className="label">Milestones</span>
          <div className="space-y-1.5">
            {milestones.map((milestone, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={milestone.done}
                  onChange={(event) =>
                    setMilestones((current) =>
                      current.map((item, position) => (position === index ? { ...item, done: event.target.checked } : item)),
                    )
                  }
                  className="h-4 w-4 accent-gold-500"
                />
                <input
                  className="input py-1.5 text-sm"
                  value={milestone.title}
                  onChange={(event) =>
                    setMilestones((current) =>
                      current.map((item, position) => (position === index ? { ...item, title: event.target.value } : item)),
                    )
                  }
                  maxLength={200}
                />
                <IconButton label="Remove milestone" onClick={() => setMilestones((current) => current.filter((_, position) => position !== index))}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="input py-1.5 text-sm"
              value={newMilestone}
              onChange={(event) => setNewMilestone(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addMilestone();
                }
              }}
              placeholder="Add a milestone…"
              maxLength={200}
            />
            <Button size="sm" onClick={addMilestone} disabled={!newMilestone.trim()}>
              <Plus size={13} /> Add
            </Button>
          </div>
        </div>

        <div>
          <span className="label">Linked attributes</span>
          <div className="flex flex-wrap gap-1.5">
            {attributes.map((attribute) => {
              const active = attributeIds.includes(attribute.id);
              return (
                <button
                  key={attribute.id}
                  type="button"
                  onClick={() =>
                    setAttributeIds((current) =>
                      active ? current.filter((id) => id !== attribute.id) : [...current, attribute.id],
                    )
                  }
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition',
                    active
                      ? 'border-gold-500/50 bg-gold-500/10 text-ink-100'
                      : 'border-white/[0.08] text-ink-400 hover:text-ink-200',
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: attribute.color }} />
                  {attribute.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="label">Linked skills</span>
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-white/[0.06] p-2">
            {allSkills.map((skill) => {
              const active = skillIds.includes(skill.id);
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() =>
                    setSkillIds((current) => (active ? current.filter((id) => id !== skill.id) : [...current, skill.id]))
                  }
                  className={clsx(
                    'rounded-full border px-2 py-0.5 text-[11px] transition',
                    active
                      ? 'border-gold-500/50 bg-gold-500/10 text-gold-400'
                      : 'border-white/[0.08] text-ink-400 hover:text-ink-200',
                  )}
                >
                  {skill.name}
                </button>
              );
            })}
          </div>
        </div>

        {error ? <div className="rounded-md border border-blood/30 bg-blood/[0.07] px-3 py-2 text-xs text-[#e0a0a0]">{error}</div> : null}
      </div>
    </Modal>
  );
}

function StreakModal({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: (streaks: Streak[]) => void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ streak: Streak; streaks: Streak[] }>('/streaks', {
        name: name.trim(),
        description,
        cadence,
        enabled: true,
      });
      onSaved(result.streaks);
      notify('success', 'Streak created');
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
      title="Create a streak"
      description="A gentle consistency ritual. Completely optional."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create streak'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Morning movement" autoFocus />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-[70px]" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
        </Field>
        <Field label="Cadence">
          <select className="select" value={cadence} onChange={(event) => setCadence(event.target.value as 'daily' | 'weekly')}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
        {error ? <div className="rounded-md border border-blood/30 bg-blood/[0.07] px-3 py-2 text-xs text-[#e0a0a0]">{error}</div> : null}
      </div>
    </Modal>
  );
}

function flattenSkills(attributes: import('../types').Attribute[]): import('../types').Skill[] {
  const result: import('../types').Skill[] = [];
  const walk = (skills: import('../types').Skill[]) => {
    for (const skill of skills) {
      result.push(skill);
      walk(skill.children);
    }
  };
  for (const attribute of attributes) for (const sub of attribute.subAttributes) walk(sub.skills);
  return result;
}
