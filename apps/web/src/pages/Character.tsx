import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  BookOpen,
  Crown,
  Flame,
  Flag,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Trees,
  Trophy,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync, errorMessage } from '../lib/hooks';
import type { Achievement, Activity, Appearance, Skill, TimelineEvent } from '../types';
import { AppearanceEditor } from '../components/AppearanceEditor';
import { CharacterArt } from '../components/CharacterArt';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  Progress,
  SectionHeading,
  Stat,
} from '../components/ui';
import { formatDate, formatDateTime, formatNumber, relativeTime, titleCase } from '../lib/format';

const ICONS: Record<string, typeof Trophy> = {
  spark: Sparkles,
  flame: Flame,
  layers: Layers,
  star: Star,
  crown: Crown,
  tree: Trees,
  flag: Flag,
  book: BookOpen,
  archive: Archive,
  sun: Sun,
  trophy: Trophy,
};

export function CharacterPage() {
  const { data, refresh, notify, confirm, openComposer } = useApp();
  const achievements = useAsync(() => api.get<{ achievements: Achievement[] }>('/achievements'), []);
  const timeline = useAsync(() => api.get<{ events: TimelineEvent[] }>('/timeline?limit=40'), []);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [busy, setBusy] = useState(false);

  const profile = data?.profile;
  const attributes = data?.taxonomy ?? [];
  const allAchievements = achievements.data?.achievements ?? data?.achievements ?? [];
  const unlocked = allAchievements.filter((achievement) => achievement.unlocked);
  const events = timeline.data?.events ?? data?.timeline ?? [];
  const activities = data?.recentActivities ?? [];

  const bestAttribute = useMemo(
    () => [...attributes].sort((a, b) => b.proficiency - a.proficiency)[0],
    [attributes],
  );

  if (!profile) return null;

  const saveAppearance = async () => {
    if (!appearance) return;
    setBusy(true);
    try {
      await api.patch('/character/appearance', appearance);
      await refresh();
      setAppearanceOpen(false);
      notify('success', 'Appearance updated');
    } catch (cause) {
      notify('error', 'Could not save appearance', errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const reverseActivity = async (activity: Activity) => {
    const ok = await confirm({
      title: 'Reverse this activity?',
      message: `"${activity.title}" awarded ${formatNumber(activity.playerXp)} player XP. Reversing writes compensating transactions and keeps a full audit trail.`,
      confirmLabel: 'Reverse activity',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/activities/${activity.id}/reverse`, { reason: 'Correction from character sheet' });
      notify('success', 'Activity reversed', 'XP and proficiency were restored with an audit trail.');
      await refresh();
      timeline.reload();
    } catch (cause) {
      notify('error', 'Could not reverse activity', errorMessage(cause));
    }
  };

  const deleteTimeline = async (event: TimelineEvent) => {
    const ok = await confirm({
      title: 'Delete timeline event?',
      message: `"${event.title}" will be removed from your chronicle. Linked records are not deleted.`,
      confirmLabel: 'Delete event',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/timeline/${event.id}`);
      timeline.reload();
      notify('success', 'Timeline event deleted');
    } catch (cause) {
      notify('error', 'Could not delete event', errorMessage(cause));
    }
  };

  const deleteAchievement = async (achievement: Achievement) => {
    const ok = await confirm({
      title: 'Delete custom achievement?',
      message: `Remove "${achievement.name}" from your definitions? Built-in achievements cannot be deleted.`,
      confirmLabel: 'Delete achievement',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/achievements/${achievement.id}`);
      achievements.reload();
      await refresh();
      notify('success', 'Achievement definition deleted');
    } catch (cause) {
      notify('error', 'Could not delete achievement', errorMessage(cause));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Character sheet"
        title={profile.name}
        subtitle={`${profile.progression.title} · Level ${profile.progression.level} · ${formatNumber(profile.progression.totalLifetimeXp)} lifetime XP`}
        actions={
          <>
            <Button variant="ghost" onClick={() => { setAppearance(profile.appearance ?? null); setAppearanceOpen(true); }}>
              <Wand2 size={15} /> Appearance
            </Button>
            <Button variant="primary" onClick={() => openComposer()}>
              <Plus size={15} /> Log activity
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-gold-500/[0.08] to-transparent" />
          <div className="relative p-4">
            <CharacterArt appearance={profile.appearance} level={profile.progression.level} />
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Level {profile.progression.level}</p>
                <p className="font-display text-xl text-ink-100">{profile.progression.title}</p>
              </div>
              <Badge tone="gold">{formatNumber(profile.progression.totalLifetimeXp)} XP</Badge>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-ink-500">
                <span>{formatNumber(profile.progression.xpIntoLevel)} / {formatNumber(profile.progression.xpRequiredForNextLevel)}</span>
                <span>{formatNumber(profile.progression.xpToNextLevel)} to next</span>
              </div>
              <Progress value={profile.progression.progressFraction * 100} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-ink-400">
              <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <p className="text-ink-500">Last activity</p>
                <p className="mt-0.5 text-ink-200">{relativeTime(profile.lastActivityAt)}</p>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <p className="text-ink-500">Journey began</p>
                <p className="mt-0.5 text-ink-200">{formatDate(profile.createdAt)}</p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-500">
              <Sparkles size={11} className="text-gold-500/70" />
              Lifetime XP and player level never decay.
            </p>
          </div>
        </Panel>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Attributes" value={attributes.length} hint="Seven domains" icon={<Layers size={15} />} />
            <Stat label="Skills" value={data.counts.skills} hint={`${data.counts.subAttributes} sub-attributes`} icon={<Trees size={15} />} />
            <Stat label="Activities" value={formatNumber(data.counts.activities)} hint={`${formatNumber(data.counts.learningHours)}h logged`} icon={<Flame size={15} />} />
            <Stat
              label="Trophies"
              value={`${unlocked.length}/${allAchievements.length}`}
              hint={bestAttribute ? `Strongest: ${bestAttribute.name}` : undefined}
              icon={<Trophy size={15} />}
            />
          </div>

          <Panel className="panel-pad">
            <SectionHeading
              title="Attributes"
              subtitle="Effective proficiency blends your own practice with the skills beneath each branch."
              actions={
                <Link to="/skills" className="text-xs text-gold-400 hover:underline">
                  Open skill trees →
                </Link>
              }
            />
            <div className="space-y-3">
              {attributes.map((attribute) => {
                const skillCount = attribute.subAttributes.reduce(
                  (sum, sub) => sum + sub.skills.length + countNested(sub.skills),
                  0,
                );
                return (
                  <Link
                    key={attribute.id}
                    to={`/skills?focus=${attribute.id}`}
                    className="group block rounded-md border border-transparent px-2 py-1.5 transition hover:border-white/[0.06] hover:bg-white/[0.02]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: attribute.color }} />
                        <span className="truncate text-sm text-ink-200 group-hover:text-ink-100">{attribute.name}</span>
                        <span className="text-[10px] text-ink-500">
                          {attribute.subAttributes.length} branches · {skillCount} skills
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-xs text-ink-300">{attribute.proficiency.toFixed(1)}</span>
                        <span className="w-16 text-right text-[10px] text-ink-500">pk {attribute.peakProficiency.toFixed(0)}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <Progress value={attribute.proficiency} color={attribute.color} height={5} className="flex-1" />
                      <span className="w-20 text-right text-[10px] text-ink-500">{formatNumber(attribute.lifetimeXp)} xp</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel className="panel-pad">
          <SectionHeading
            title="Recent activities"
            subtitle="Every entry is auditable and reversible."
            actions={
              <Button size="sm" variant="ghost" onClick={() => openComposer()}>
                <Plus size={13} /> New
              </Button>
            }
          />
          {activities.length === 0 ? (
            <EmptyState
              icon={<Flame size={18} />}
              title="No activities yet"
              description="Log the first real thing you did today. The offline heuristic will propose the progression."
              action={<Button variant="primary" size="sm" onClick={() => openComposer()}><Plus size={14} /> Log first activity</Button>}
            />
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {activities.map((activity) => (
                <div key={activity.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={clsx('text-sm text-ink-100', activity.status === 'reversed' && 'line-through opacity-60')}>
                          {activity.title}
                        </p>
                        {activity.category ? <Badge tone="muted">{activity.category}</Badge> : null}
                        {activity.isMilestone ? <Badge tone="gold">Milestone</Badge> : null}
                        {activity.status === 'reversed' ? <Badge tone="danger">Reversed</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-500">
                        {formatDateTime(activity.occurredAt)} · {activity.source}
                        {activity.durationMinutes ? ` · ${activity.durationMinutes}m` : ''}
                        {activity.multiplier < 1 ? ` · ${Math.round(activity.multiplier * 100)}% diminishing` : ''}
                      </p>
                      {activity.allocations.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {activity.allocations.slice(0, 4).map((allocation) => (
                            <span key={`${allocation.targetType}-${allocation.targetId}`} className="chip">
                              {allocation.targetName} <span className="text-gold-400">+{allocation.xp}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-sm text-gold-400">+{formatNumber(activity.playerXp)}</span>
                      {activity.status === 'approved' ? (
                        <button
                          type="button"
                          onClick={() => void reverseActivity(activity)}
                          className="inline-flex items-center gap-1 text-[10px] text-ink-500 transition hover:text-[#e0a0a0]"
                          title="Reverse activity"
                        >
                          <RotateCcw size={10} /> reverse
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="panel-pad">
          <SectionHeading
            title="Chronicle"
            subtitle="Milestones, quests and turning points."
            actions={
              <Button size="sm" variant="ghost" onClick={() => setTimelineOpen(true)}>
                <Plus size={13} /> Event
              </Button>
            }
          />
          {events.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={18} />}
              title="The chronicle is blank"
              description="Milestones and completed quests appear here automatically. You can also add your own turning points."
            />
          ) : (
            <div className="relative space-y-4 pl-4">
              <span className="absolute bottom-1 left-[5px] top-1 w-px bg-white/[0.08]" />
              {events.map((event) => (
                <div key={event.id} className="group relative">
                  <span className="absolute -left-4 top-1.5 h-2 w-2 rounded-full border border-gold-500/60 bg-ink-900" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm text-ink-200">{event.title}</p>
                        <Badge tone="muted">{titleCase(event.eventType)}</Badge>
                      </div>
                      <p className="mt-0.5 text-[10px] text-ink-500">{formatDateTime(event.occurredAt)}</p>
                      {event.description ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-400">{event.description}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteTimeline(event)}
                      className="shrink-0 text-ink-600 opacity-0 transition hover:text-blood group-hover:opacity-100"
                      aria-label="Delete timeline event"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {timeline.loading ? <p className="mt-2 text-[11px] text-ink-500">Loading chronicle…</p> : null}
        </Panel>
      </div>

      <Panel className="panel-pad mt-5">
        <SectionHeading
          title="Achievements"
          subtitle="Unlocked only from recorded progress, never from manually ticking a box."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setAchievementOpen(true)}>
              <Plus size={13} /> Custom
            </Button>
          }
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {allAchievements.map((achievement) => {
            const Icon = ICONS[achievement.icon] ?? Trophy;
            return (
              <div
                key={achievement.id}
                className={clsx(
                  'group relative rounded-md border px-3 py-3 transition',
                  achievement.unlocked
                    ? 'border-gold-500/25 bg-gold-500/[0.05]'
                    : 'border-white/[0.06] bg-white/[0.015]',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={clsx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                      achievement.unlocked
                        ? 'border-gold-500/30 bg-gold-500/10 text-gold-400'
                        : 'border-white/[0.06] bg-ink-950/50 text-ink-600',
                    )}
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={clsx('truncate text-sm', achievement.unlocked ? 'text-ink-100' : 'text-ink-300')}>
                        {achievement.name}
                      </p>
                      {achievement.hidden && !achievement.unlocked ? <Badge tone="muted">Hidden</Badge> : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-ink-500">{achievement.description}</p>
                    {achievement.unlocked ? (
                      <p className="mt-1 text-[10px] text-gold-400/80">Unlocked {formatDate(achievement.unlockedAt)}</p>
                    ) : achievement.conditionType !== 'custom' ? (
                      <div className="mt-1.5">
                        <Progress value={achievement.progressFraction * 100} height={3} color="#6b7688" />
                        <p className="mt-1 text-[10px] text-ink-600">
                          {formatNumber(achievement.progress)} / {formatNumber(achievement.threshold)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-[10px] text-ink-600">Custom · awaiting manual milestone</p>
                    )}
                  </div>
                  {!achievement.isBuiltin ? (
                    <button
                      type="button"
                      onClick={() => void deleteAchievement(achievement)}
                      className="text-ink-600 opacity-0 transition hover:text-blood group-hover:opacity-100"
                      aria-label="Delete achievement definition"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Modal
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        title="Shape your character"
        description="Purely cosmetic. Your appearance is stored locally with your profile."
        wide
        footer={
          <>
            <Button onClick={() => setAppearanceOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void saveAppearance()} disabled={busy || !appearance}>
              {busy ? 'Saving…' : 'Save appearance'}
            </Button>
          </>
        }
      >
        {appearance ? <AppearanceEditor appearance={appearance} onChange={setAppearance} /> : null}
      </Modal>

      <TimelineModal
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        onCreated={(events) => {
          timeline.setData({ events });
          void refresh();
          setTimelineOpen(false);
        }}
        notify={notify}
      />

      <AchievementModal
        open={achievementOpen}
        onClose={() => setAchievementOpen(false)}
        onCreated={(list) => {
          achievements.setData({ achievements: list });
          setAchievementOpen(false);
        }}
        notify={notify}
      />
    </>
  );
}

function countNested(skills: Skill[]): number {
  return skills.reduce((sum, skill) => sum + skill.children.length + countNested(skill.children), 0);
}

function TimelineModal({
  open,
  onClose,
  onCreated,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (events: TimelineEvent[]) => void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState('personal');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const result = await api.post<{ id: string; events: TimelineEvent[] }>('/timeline', {
        title: title.trim(),
        description,
        eventType,
        occurredAt: new Date(`${occurredAt}T12:00:00`).toISOString(),
      });
      onCreated(result.events);
      setTitle('');
      setDescription('');
      notify('success', 'Timeline event added');
    } catch (cause) {
      notify('error', 'Could not add event', errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add timeline event"
      description="Record a turning point, project launch, or moment worth remembering."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {busy ? 'Adding…' : 'Add event'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="Shipped the first public version" />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-[90px]" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select className="select" value={eventType} onChange={(event) => setEventType(event.target.value)}>
              {['personal', 'milestone', 'learning', 'career', 'health', 'financial', 'quest', 'level', 'creative'].map((type) => (
                <option key={type} value={type}>{titleCase(type)}</option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function AchievementModal({
  open,
  onClose,
  onCreated,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (achievements: Achievement[]) => void;
  notify: (tone: 'success' | 'error' | 'info', title: string, message?: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('trophy');
  const [conditionType, setConditionType] = useState('custom');
  const [threshold, setThreshold] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const result = await api.post<{ achievement: Achievement; achievements: Achievement[] }>('/achievements', {
        name: name.trim(),
        description,
        icon,
        conditionType,
        threshold,
        hidden,
      });
      onCreated(result.achievements);
      setName('');
      setDescription('');
      notify('success', 'Achievement defined');
    } catch (cause) {
      notify('error', 'Could not create achievement', errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Define an achievement"
      description="Custom achievements wait for a manual unlock; the built-in conditions evaluate recorded progress."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create achievement'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="First hundred hours" />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-[80px]" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Icon">
            <select className="select" value={icon} onChange={(event) => setIcon(event.target.value)}>
              {Object.keys(ICONS).map((key) => (
                <option key={key} value={key}>{titleCase(key)}</option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select className="select" value={conditionType} onChange={(event) => setConditionType(event.target.value)}>
              {['custom', 'player_level', 'total_activities', 'attribute_level', 'skill_count', 'quest_completed', 'journal_count', 'inventory_count', 'streak_days'].map((type) => (
                <option key={type} value={type}>{titleCase(type)}</option>
              ))}
            </select>
          </Field>
          <Field label="Threshold">
            <input type="number" className="input" min={0} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} className="h-4 w-4 accent-gold-500" />
          Hide the description until unlocked
        </label>
      </div>
    </Modal>
  );
}
