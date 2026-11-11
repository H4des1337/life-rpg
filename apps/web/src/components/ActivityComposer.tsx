import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  CirclePlus,
  Cpu,
  Minus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import type { Activity, ActivityAllocation, ActivityAnalysis, Attribute, Skill } from '../types';
import { Badge, Button, Field, Modal, Rating } from './ui';
import { errorMessage } from '../lib/hooks';
import { formatNumber, titleCase } from '../lib/format';

interface TargetOption {
  type: ActivityAllocation['targetType'];
  id: string;
  name: string;
  group: string;
}

interface CreateResult {
  activity: Activity;
  multiplier: number;
  priorSimilar: number;
  levelUps: number[];
  levelAfter: number;
  newlyUnlocked: Array<{ name: string; description: string }>;
}

interface Draft {
  title: string;
  description: string;
  category: string;
  occurredAt: string;
  durationMinutes: string;
  difficulty: number;
  effort: number;
  significance: number;
  relevance: number;
  isMilestone: boolean;
  useAi: boolean;
  providerId: string;
  questId: string;
}

const CATEGORY_SUGGESTIONS = [
  'Learning',
  'Coding',
  'Fitness',
  'Reading',
  'Social',
  'Career',
  'Finance',
  'Health',
  'Creative',
  'Discipline',
  'Rest',
];

function localDateTime(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function flattenSkills(skills: Skill[], group: string): TargetOption[] {
  return skills.flatMap((skill) => [
    { type: 'skill' as const, id: skill.id, name: skill.name, group },
    ...flattenSkills(skill.children ?? [], group),
  ]);
}

function buildTargets(taxonomy: Attribute[]): TargetOption[] {
  return taxonomy.flatMap((attribute) => [
    { type: 'attribute' as const, id: attribute.id, name: attribute.name, group: 'Attributes' },
    ...attribute.subAttributes.flatMap((sub) => [
      { type: 'sub_attribute' as const, id: sub.id, name: sub.name, group: attribute.name },
      ...flattenSkills(sub.skills ?? [], attribute.name),
    ]),
  ]);
}

const emptyDraft = (): Draft => ({
  title: '',
  description: '',
  category: '',
  occurredAt: localDateTime(),
  durationMinutes: '',
  difficulty: 3,
  effort: 3,
  significance: 3,
  relevance: 3,
  isMilestone: false,
  useAi: false,
  providerId: '',
  questId: '',
});

export function ActivityComposer() {
  const { composer, closeComposer, data, refresh, notify } = useApp();
  const [step, setStep] = useState<'describe' | 'review'>('describe');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [analysis, setAnalysis] = useState<ActivityAnalysis | null>(null);
  const [allocations, setAllocations] = useState<ActivityAllocation[]>([]);
  const [playerXp, setPlayerXp] = useState(0);
  const [createTimeline, setCreateTimeline] = useState(true);
  const [createInventory, setCreateInventory] = useState(false);
  const [timelineTitle, setTimelineTitle] = useState('');
  const [inventoryName, setInventoryName] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('');
  const [addTarget, setAddTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<'idle' | 'analyzing' | 'saving'>('idle');

  const targets = useMemo(() => buildTargets(data?.taxonomy ?? []), [data?.taxonomy]);
  const aiProviders = useMemo(
    () => (data?.providers ?? []).filter((provider) => provider.enabled),
    [data?.providers],
  );
  const selectedProvider =
    aiProviders.find((provider) => provider.id === draft.providerId) ??
    aiProviders.find((provider) => provider.isDefault) ??
    aiProviders[0];
  const aiReady = Boolean(selectedProvider?.consentGiven);
  const questOptions = data?.quests ?? [];

  useEffect(() => {
    if (!composer.open) return;
    setStep('describe');
    setDraft({ ...emptyDraft(), questId: composer.questId ?? '' });
    setAnalysis(null);
    setAllocations([]);
    setPlayerXp(0);
    setCreateTimeline(true);
    setCreateInventory(false);
    setTimelineTitle('');
    setInventoryName('');
    setInventoryCategory('');
    setAddTarget('');
    setError(null);
    setBusy(false);
    setElapsed('idle');
  }, [composer.open, composer.questId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const analyze = async () => {
    if (!draft.title.trim()) {
      setError('Give the activity a short title first.');
      return;
    }
    setBusy(true);
    setElapsed('analyzing');
    setError(null);
    try {
      const result = await api.post<{
        analysis: ActivityAnalysis;
        usedFallback: boolean;
        fallbackReason: string | null;
      }>('/activities/analyze', {
        title: draft.title.trim(),
        description: draft.description,
        input: `${draft.title}. ${draft.description}`.trim(),
        category: draft.category,
        durationMinutes: draft.durationMinutes ? Number(draft.durationMinutes) : null,
        difficulty: draft.difficulty,
        effort: draft.effort,
        significance: draft.significance,
        relevance: draft.relevance,
        isMilestone: draft.isMilestone,
        useAi: draft.useAi && aiReady,
        providerId: draft.useAi && aiReady && selectedProvider ? selectedProvider.id : null,
      });
      setAnalysis(result.analysis);
      setAllocations(result.analysis.allocations);
      setPlayerXp(result.analysis.suggestedPlayerXp);
      setTimelineTitle(result.analysis.suggestedTimelineTitle || draft.title.trim());
      setInventoryName(result.analysis.suggestedInventoryName || draft.title.trim());
      setInventoryCategory(result.analysis.suggestedInventoryCategory || 'Experiences');
      setCreateTimeline(result.analysis.isMilestone);
      setStep('review');
      if (result.usedFallback && result.fallbackReason) {
        notify('info', 'Offline proposal used', result.fallbackReason);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setElapsed('idle');
    }
  };

  const save = async () => {
    if (!analysis) return;
    setBusy(true);
    setElapsed('saving');
    setError(null);
    try {
      const payload = {
        title: draft.title.trim(),
        description: draft.description,
        category: draft.category,
        occurredAt: new Date(draft.occurredAt).toISOString(),
        durationMinutes: draft.durationMinutes ? Number(draft.durationMinutes) : null,
        difficulty: draft.difficulty,
        effort: draft.effort,
        significance: draft.significance,
        relevance: draft.relevance,
        isMilestone: analysis.isMilestone,
        questId: draft.questId || null,
        analysis: {
          ...analysis,
          suggestedPlayerXp: Math.max(0, Math.round(playerXp)),
          suggestedAttributeXp: allocations.reduce((sum, allocation) => sum + allocation.xp, 0),
          isMilestone: analysis.isMilestone,
          allocations: allocations
            .filter((allocation) => allocation.xp > 0)
            .map((allocation) => ({
              targetType: allocation.targetType,
              targetId: allocation.targetId,
              targetName: allocation.targetName ?? '',
              xp: Math.max(0, Math.round(allocation.xp)),
              weight: allocation.weight ?? 0,
              rationale: allocation.rationale ?? '',
              confidence: allocation.confidence ?? 1,
            })),
          suggestedTimelineTitle: timelineTitle || draft.title.trim(),
          suggestedTimelineDescription: analysis.suggestedTimelineDescription || draft.description,
          suggestedInventoryName: inventoryName || draft.title.trim(),
          suggestedInventoryCategory: inventoryCategory || 'Experiences',
        },
        createTimeline,
        createInventory,
      };
      const result = await api.post<CreateResult>('/activities', payload);
      const bits: string[] = [`+${formatNumber(result.activity.playerXp)} player XP`];
      if (result.multiplier < 1) bits.push(`${Math.round(result.multiplier * 100)}% diminishing return`);
      if (result.levelUps.length > 0) bits.push(`Level ${result.levelAfter}!`);
      notify('success', 'Activity recorded', bits.join(' · '));
      for (const achievement of result.newlyUnlocked ?? []) {
        notify('success', `Achievement unlocked: ${achievement.name}`, achievement.description);
      }
      await refresh();
      closeComposer();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setElapsed('idle');
    }
  };

  const totalAllocated = allocations.reduce((sum, allocation) => sum + Math.max(0, allocation.xp), 0);

  const addAllocation = () => {
    if (!addTarget) return;
    const [type, ...rest] = addTarget.split(':');
    const id = rest.join(':');
    const target = targets.find((option) => option.type === type && option.id === id);
    if (!target) return;
    setAllocations((current) => [
      ...current,
      {
        targetType: target.type,
        targetId: target.id,
        targetName: target.name,
        xp: 10,
        weight: 0,
        rationale: 'User allocation',
        confidence: 1,
      },
    ]);
    setAddTarget('');
  };

  const updateAllocationXp = (index: number, xp: number) => {
    setAllocations((current) =>
      current.map((allocation, position) => (position === index ? { ...allocation, xp } : allocation)),
    );
  };

  const removeAllocation = (index: number) => {
    setAllocations((current) => current.filter((_, position) => position !== index));
  };

  return (
    <Modal
      open={composer.open}
      onClose={closeComposer}
      title={step === 'describe' ? 'Log an activity' : 'Review proposal'}
      description={
        step === 'describe'
          ? 'Describe what you actually did. The offline heuristic proposes XP; you approve every point.'
          : 'Every point here is editable. Nothing is written until you approve.'
      }
      wide
    >
      {step === 'describe' ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
            <Field label="What did you do?">
              <input
                className="input"
                value={draft.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="e.g. Built the activity approval flow"
                autoFocus
                maxLength={200}
              />
            </Field>
            <Field label="Category">
              <input
                className="input"
                list="activity-categories"
                value={draft.category}
                onChange={(event) => set('category', event.target.value)}
                placeholder="e.g. Coding"
                maxLength={80}
              />
              <datalist id="activity-categories">
                {CATEGORY_SUGGESTIONS.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field label="Details" hint="What exactly happened? Context improves the heuristic proposal and your journal.">
            <textarea
              className="input min-h-[86px] resize-y"
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="A sentence or two about the work, practice or experience..."
              maxLength={5000}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="When">
              <input
                type="datetime-local"
                className="input"
                value={draft.occurredAt}
                onChange={(event) => set('occurredAt', event.target.value)}
              />
            </Field>
            <Field label="Minutes" hint="Optional focus time.">
              <input
                type="number"
                min={0}
                max={1440}
                className="input"
                value={draft.durationMinutes}
                onChange={(event) => set('durationMinutes', event.target.value)}
                placeholder="60"
              />
            </Field>
            <Field label="Quest" hint="Link this effort to a quest.">
              <select className="select" value={draft.questId} onChange={(event) => set('questId', event.target.value)}>
                <option value="">No quest</option>
                {questOptions.map((quest) => (
                  <option key={quest.id} value={quest.id}>
                    {quest.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-5 rounded-md border border-white/[0.06] bg-white/[0.015] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Rating label="Difficulty" value={draft.difficulty} onChange={(value) => set('difficulty', value)} />
            <Rating label="Effort" value={draft.effort} onChange={(value) => set('effort', value)} />
            <Rating label="Significance" value={draft.significance} onChange={(value) => set('significance', value)} />
            <Rating label="Relevance" value={draft.relevance} onChange={(value) => set('relevance', value)} />
          </div>

          <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={draft.isMilestone}
                onChange={(event) => set('isMilestone', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-ink-950 accent-gold-500"
              />
              <span>
                <span className="text-sm text-ink-200">Mark as milestone</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Milestones always create a timeline event and are highlighted on your character sheet.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Bot size={17} className={clsx('mt-0.5', draft.useAi ? 'text-gold-400' : 'text-ink-500')} />
                <div>
                  <p className="text-sm text-ink-200">Use an AI provider for the proposal</p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-500">
                    {aiProviders.length === 0
                      ? 'No provider configured. The built-in offline heuristic is always available.'
                      : aiReady
                        ? 'Sends the activity text to your configured provider only. Progression stays under your approval.'
                        : 'Consent is required in Settings before text can leave this machine.'}
                  </p>
                </div>
              </div>
              {aiProviders.length > 0 ? (
                <input
                  type="checkbox"
                  aria-label="Use AI provider"
                  disabled={!aiReady}
                  checked={draft.useAi}
                  onChange={(event) => set('useAi', event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-ink-950 accent-gold-500 disabled:opacity-40"
                />
              ) : null}
            </div>
            {aiProviders.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
                <select
                  className="select max-w-xs text-xs"
                  value={selectedProvider?.id ?? ''}
                  disabled={!draft.useAi}
                  onChange={(event) => set('providerId', event.target.value)}
                >
                  {aiProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {provider.model}
                    </option>
                  ))}
                </select>
                {!aiReady ? (
                  <Link to="/settings" className="text-[11px] text-gold-400 underline underline-offset-4" onClick={closeComposer}>
                    Configure consent
                  </Link>
                ) : (
                  <Badge tone="gold">
                    <Cpu size={10} /> {selectedProvider?.kind}
                  </Badge>
                )}
              </div>
            ) : null}
          </div>

          {error ? <ErrorBox message={error} /> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <p className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
              <Sparkles size={12} className="text-gold-500" />
              Proposals are validated by the domain engine before anything is saved.
            </p>
            <div className="flex gap-2">
              <Button onClick={closeComposer}>Cancel</Button>
              <Button variant="primary" onClick={() => void analyze()} disabled={busy || !draft.title.trim()}>
                {elapsed === 'analyzing' ? 'Analyzing…' : 'Analyze activity'}
                {elapsed === 'analyzing' ? null : <ChevronRight size={15} />}
              </Button>
            </div>
          </div>
        </div>
      ) : analysis ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={analysis.source === 'ai' ? 'gold' : 'jade'}>
              {analysis.source === 'ai' ? <Bot size={10} /> : <Sparkles size={10} />}
              {analysis.source === 'ai' ? analysis.providerName || 'AI' : 'Offline heuristic'}
            </Badge>
            <Badge tone="muted">{analysis.classification || 'Activity'}</Badge>
            <Badge tone="muted">{Math.round(analysis.confidence * 100)}% confidence</Badge>
            {analysis.isMilestone ? <Badge tone="gold">Milestone</Badge> : null}
            {analysis.modelName ? <span className="text-[10px] text-ink-500">{analysis.modelName}</span> : null}
          </div>

          <div className="rounded-md border border-white/[0.06] bg-white/[0.015] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">Reasoning</p>
            <p className="mt-1 text-sm leading-6 text-ink-300">{analysis.reasoning || 'No reasoning recorded.'}</p>
            {analysis.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {analysis.warnings.map((warning, index) => (
                  <li key={index} className="flex items-start gap-1.5 text-[11px] leading-5 text-gold-400/90">
                    <AlertTriangle size={11} className="mt-1 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <div className="rounded-md border border-gold-500/20 bg-gold-500/[0.04] p-4">
              <p className="label mb-1">Player XP</p>
              <div className="flex items-end gap-3">
                <input
                  type="number"
                  min={0}
                  max={50000}
                  className="input max-w-[140px] font-display text-2xl"
                  value={playerXp}
                  onChange={(event) => setPlayerXp(Number(event.target.value))}
                />
                <span className="pb-2 text-xs text-ink-500">lifetime progression</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={() => setPlayerXp((value) => Math.max(0, value - 5))}>
                  <Minus size={12} /> 5
                </Button>
                <Button size="sm" onClick={() => setPlayerXp((value) => value + 5)}>
                  <CirclePlus size={12} /> 5
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-4">
              <p className="label mb-1">Attribute XP</p>
              <p className="font-display text-2xl text-ink-100">{formatNumber(totalAllocated)}</p>
              <p className="mt-1 text-[11px] leading-5 text-ink-500">
                Distributed across {allocations.length} target{allocations.length === 1 ? '' : 's'}. Skills spill 35% into
                their parent sub-attribute.
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="text-sm font-medium text-ink-100">XP allocation</p>
                <p className="text-[11px] text-ink-500">Adjust or remove any target. Progression is only applied on save.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {allocations.length === 0 ? (
                <p className="rounded-md border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-ink-500">
                  No attribute XP proposed. Add a target below if this activity developed something specific.
                </p>
              ) : null}
              {allocations.map((allocation, index) => (
                <div
                  key={`${allocation.targetType}-${allocation.targetId}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.015] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm text-ink-200">{allocation.targetName || allocation.targetId}</span>
                      <Badge tone="muted">{titleCase(allocation.targetType)}</Badge>
                    </div>
                    {allocation.rationale ? <p className="mt-0.5 text-[10px] text-ink-500">{allocation.rationale}</p> : null}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    aria-label={`XP for ${allocation.targetName ?? allocation.targetId}`}
                    className="input w-24 py-1 text-right text-sm"
                    value={allocation.xp}
                    onChange={(event) => updateAllocationXp(index, Number(event.target.value))}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${allocation.targetName ?? allocation.targetId}`}
                    onClick={() => removeAllocation(index)}
                    className="text-ink-500 transition hover:text-blood"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <select className="select max-w-sm text-xs" value={addTarget} onChange={(event) => setAddTarget(event.target.value)}>
                <option value="">Add a target…</option>
                {targets.map((target) => (
                  <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>
                    {target.group} · {target.name} ({titleCase(target.type)})
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={addAllocation} disabled={!addTarget}>
                <CirclePlus size={13} /> Add
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-md border border-white/[0.06] bg-white/[0.015] p-3">
              <input
                type="checkbox"
                checked={createTimeline}
                onChange={(event) => setCreateTimeline(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-ink-950 accent-gold-500"
              />
              <span className="min-w-0">
                <span className="text-sm text-ink-200">Add timeline event</span>
                <span className="mt-0.5 block text-[11px] text-ink-500">Record this moment in your chronicle.</span>
                {createTimeline ? (
                  <input
                    className="input mt-2 py-1 text-xs"
                    value={timelineTitle}
                    onChange={(event) => setTimelineTitle(event.target.value)}
                    placeholder={draft.title}
                    maxLength={200}
                  />
                ) : null}
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-md border border-white/[0.06] bg-white/[0.015] p-3">
              <input
                type="checkbox"
                checked={createInventory}
                onChange={(event) => setCreateInventory(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-ink-950 accent-gold-500"
              />
              <span className="min-w-0">
                <span className="text-sm text-ink-200">Add inventory artifact</span>
                <span className="mt-0.5 block text-[11px] text-ink-500">For a project, certificate or keepsake.</span>
                {createInventory ? (
                  <span className="mt-2 flex gap-2">
                    <input
                      className="input py-1 text-xs"
                      value={inventoryName}
                      onChange={(event) => setInventoryName(event.target.value)}
                      placeholder={draft.title}
                      maxLength={200}
                    />
                    <input
                      className="input py-1 text-xs"
                      value={inventoryCategory}
                      onChange={(event) => setInventoryCategory(event.target.value)}
                      placeholder="Category"
                      maxLength={80}
                    />
                  </span>
                ) : null}
              </span>
            </label>
          </div>

          {error ? <ErrorBox message={error} /> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <Button variant="ghost" onClick={() => setStep('describe')} disabled={busy}>
              <ArrowLeft size={14} /> Edit details
            </Button>
            <div className="flex gap-2">
              <Button onClick={closeComposer} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void save()} disabled={busy}>
                {elapsed === 'saving' ? 'Saving…' : 'Approve & record'}
                {elapsed === 'saving' ? null : <Check size={15} />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-ink-400">No proposal loaded.</div>
      )}
    </Modal>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-blood/30 bg-blood/[0.07] px-3 py-2 text-xs leading-5 text-[#e0a0a0]">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
