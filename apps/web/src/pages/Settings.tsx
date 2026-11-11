import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Cpu,
  Database,
  Download,
  Gauge,
  HardDrive,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import type { AiProvider, Backup, Profile, Settings } from '../types';
import {
  Badge,
  Button,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Panel,
  SectionHeading,
  Tabs,
} from '../components/ui';
import { errorMessage, useAsync } from '../lib/hooks';
import { formatBytes, formatDate, formatDateTime, formatNumber, relativeTime } from '../lib/format';

type SettingsTab = 'profile' | 'progression' | 'ai' | 'backups';

interface HealthPayload {
  status: string;
  version: string;
  network: { binding: string; localOnly: boolean };
}

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'progression', label: 'Progression' },
  { id: 'ai', label: 'AI Providers' },
  { id: 'backups', label: 'Backups & Data' },
];

export function SettingsPage() {
  const { data } = useApp();
  const [tab, setTab] = useState<SettingsTab>('profile');

  if (!data || !data.settings || !data.profile) {
    return (
      <div className="panel p-8 text-center text-sm text-ink-400">
        Settings are unavailable until a character exists.
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Control room"
        title="Settings"
        subtitle="Shape the rules of your chronicle. Everything here is stored locally, and every change is reversible."
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-6" />

      {tab === 'profile' ? <ProfileSettings profile={data.profile} /> : null}
      {tab === 'progression' ? <ProgressionSettings settings={data.settings} profile={data.profile} /> : null}
      {tab === 'ai' ? <AiSettings providers={data.providers} /> : null}
      {tab === 'backups' ? <BackupSettings settings={data.settings} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ profile */

function ProfileSettings({ profile }: { profile: Profile }) {
  const { refresh, notify } = useApp();
  const [name, setName] = useState(profile.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(profile.name);
  }, [profile.name]);

  const dirty = name.trim().length > 0 && name.trim() !== profile.name;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch('/profile', { name: name.trim() });
      await refresh();
      notify('success', 'Profile updated', 'Your chronicle now carries the new name.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel className="p-5">
        <SectionHeading title="Identity" subtitle="The name written across your character sheet." />
        <div className="space-y-4">
          <Field label="Character name" hint="Between 1 and 80 characters. Stored only in your local database.">
            <input
              className="input"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
              }}
            />
          </Field>

          {error ? <InlineError message={error} /> : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to="/" className="link-muted inline-flex items-center gap-1.5 text-xs">
              <Sparkles size={13} className="text-gold-500" />
              Customize your character
            </Link>
            <Button variant="primary" size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save name'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading title="Chronicle record" subtitle="A summary of the life currently on file." />
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.06] text-sm">
          <RecordCell label="Level" value={`${profile.progression.level} · ${profile.progression.title}`} />
          <RecordCell label="Lifetime XP" value={formatNumber(profile.progression.totalLifetimeXp)} />
          <RecordCell label="To next level" value={formatNumber(profile.progression.xpToNextLevel)} />
          <RecordCell label="Member since" value={formatDate(profile.createdAt)} />
          <RecordCell label="Last activity" value={relativeTime(profile.lastActivityAt)} />
          <RecordCell label="Profile ID" value={profile.id.slice(-8)} mono />
        </dl>
        <div className="mt-4 flex items-start gap-2.5 rounded-md border border-jade/20 bg-jade/[0.04] px-3 py-2.5 text-[11px] leading-5 text-ink-400">
          <LockKeyhole size={14} className="mt-0.5 shrink-0 text-jade/80" />
          <p>
            This profile exists only on this computer. There is no account, no cloud sync, and no telemetry.
            Profile text is never sent to an AI provider.
          </p>
        </div>
      </Panel>

      <Panel className="p-5 lg:col-span-2">
        <SectionHeading title="What changes here" subtitle="Profile edits do not touch XP or proficiency." />
        <div className="grid gap-3 text-xs leading-6 text-ink-400 sm:grid-cols-3">
          <InfoNote icon={<UserRound size={15} />} title="Rename freely">
            Renaming rewrites the display name only. Activity history, XP transactions and achievements keep their
            original timestamps and audit trail.
          </InfoNote>
          <InfoNote icon={<Gauge size={15} />} title="Progression is auditable">
            Every XP grant is recorded in a ledger. Levels are derived from lifetime XP, so rules can be adjusted
            later without erasing history.
          </InfoNote>
          <InfoNote icon={<ShieldCheck size={15} />} title="Nothing is permanent">
            Before any restore, LIFE RPG creates a safety snapshot. Your local backups are ordinary ZIP archives.
          </InfoNote>
        </div>
      </Panel>
    </div>
  );
}

function RecordCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-ink-900 px-3 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">{label}</dt>
      <dd className={clsx('mt-1 text-sm text-ink-100', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------- progression */

interface ProgressionDraft {
  baseXp: number;
  quadratic: number;
  linear: number;
  windowHours: number;
  step: number;
  floor: number;
}

const DEFAULT_DRAFT: ProgressionDraft = {
  baseXp: 500,
  quadratic: 0.98,
  linear: 0,
  windowHours: 24,
  step: 0.35,
  floor: 0.25,
};

function draftFromSettings(settings: Settings): ProgressionDraft {
  return {
    baseXp: settings.progressionBaseXp,
    quadratic: settings.progressionQuadratic,
    linear: settings.progressionLinear,
    windowHours: settings.diminishingWindowHours,
    step: settings.diminishingStep,
    floor: settings.diminishingFloor,
  };
}

function sanitizeDraft(draft: ProgressionDraft): ProgressionDraft {
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    baseXp: Math.round(clamp(draft.baseXp, 1, 1_000_000, 500)),
    quadratic: clamp(draft.quadratic, 0, 100, 0.98),
    linear: clamp(draft.linear, 0, 100, 0),
    windowHours: Math.round(clamp(draft.windowHours, 1, 8760, 24)),
    step: clamp(draft.step, 0, 1, 0.35),
    floor: clamp(draft.floor, 0, 1, 0.25),
  };
}

function xpRequiredFor(level: number, draft: ProgressionDraft): number {
  const n = Math.max(0, Math.floor(level) - 1);
  const raw = draft.baseXp + draft.quadratic * n * n + draft.linear * n;
  return Math.max(1, Math.round(Number.isFinite(raw) ? raw : 1));
}

function cumulativeXpFor(level: number, draft: ProgressionDraft): number {
  let total = 0;
  const target = Math.min(1000, Math.max(1, Math.floor(level)));
  for (let current = 1; current < target; current += 1) {
    total += xpRequiredFor(current, draft);
    if (total >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return total;
}

function levelForXp(totalXp: number, draft: ProgressionDraft): number {
  let remaining = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
  let level = 1;
  while (level < 1000) {
    const required = xpRequiredFor(level, draft);
    if (remaining < required) break;
    remaining -= required;
    level += 1;
  }
  return level;
}

const PREVIEW_LEVELS = [1, 2, 5, 10, 25, 50, 100, 500, 1000];

function ProgressionSettings({ settings, profile }: { settings: Settings; profile: Profile }) {
  const { refresh, notify } = useApp();
  const [draft, setDraft] = useState<ProgressionDraft>(() => draftFromSettings(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromSettings(settings));
  }, [
    settings.progressionBaseXp,
    settings.progressionQuadratic,
    settings.progressionLinear,
    settings.diminishingWindowHours,
    settings.diminishingStep,
    settings.diminishingFloor,
  ]);

  const preview = useMemo(() => sanitizeDraft(draft), [draft]);
  const dirty =
    preview.baseXp !== settings.progressionBaseXp ||
    preview.quadratic !== settings.progressionQuadratic ||
    preview.linear !== settings.progressionLinear ||
    preview.windowHours !== settings.diminishingWindowHours ||
    preview.step !== settings.diminishingStep ||
    preview.floor !== settings.diminishingFloor;

  const projectedLevel = levelForXp(profile.progression.totalLifetimeXp, preview);

  const set = <K extends keyof ProgressionDraft>(key: K, value: ProgressionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch('/settings', {
        progressionBaseXp: preview.baseXp,
        progressionQuadratic: preview.quadratic,
        progressionLinear: preview.linear,
        diminishingWindowHours: preview.windowHours,
        diminishingStep: preview.step,
        diminishingFloor: preview.floor,
      });
      await refresh();
      notify('success', 'Progression rules saved', 'Future XP awards use the new curve immediately.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft({ ...DEFAULT_DRAFT });
    setError(null);
  };

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <SectionHeading
          title="Level curve"
          subtitle="XP required to leave level L = base + quadratic × (L − 1)² + linear × (L − 1)."
          actions={<Badge tone="gold">Deterministic</Badge>}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Base XP"
            hint="XP needed to leave level 1."
            value={draft.baseXp}
            min={1}
            max={1_000_000}
            step={50}
            onChange={(value) => set('baseXp', value)}
          />
          <NumberField
            label="Quadratic coefficient"
            hint="Default 0.98. The curve's long-run steepness."
            value={draft.quadratic}
            min={0}
            max={100}
            step={0.01}
            onChange={(value) => set('quadratic', value)}
          />
          <NumberField
            label="Linear coefficient"
            hint="Default 0. Adds a gentle constant slope."
            value={draft.linear}
            min={0}
            max={100}
            step={0.01}
            onChange={(value) => set('linear', value)}
          />
        </div>

        <div className="mt-5 overflow-hidden rounded-md border border-white/[0.06]">
          <div className="grid grid-cols-3 gap-3 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            <span>Level</span>
            <span className="text-right">XP for next</span>
            <span className="text-right">Total XP to reach</span>
          </div>
          {PREVIEW_LEVELS.map((level) => (
            <div
              key={level}
              className={clsx(
                'grid grid-cols-3 gap-3 px-3 py-2 text-xs',
                level === profile.progression.level && 'bg-gold-500/[0.05]',
              )}
            >
              <span className="flex items-center gap-2 text-ink-200">
                Lv {level}
                {level === projectedLevel ? <Badge tone="gold">You</Badge> : null}
              </span>
              <span className="text-right font-mono text-ink-300">{formatNumber(xpRequiredFor(level, preview))}</span>
              <span className="text-right font-mono text-ink-400">{formatNumber(cumulativeXpFor(level, preview))}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp size={12} className="text-gold-500" />
            Your {formatNumber(profile.progression.totalLifetimeXp)} lifetime XP would be level{' '}
            <span className="text-ink-200">{projectedLevel}</span> under these rules.
          </span>
          <span>Level {formatNumber(1000)} requires {formatNumber(cumulativeXpFor(1000, preview))} lifetime XP.</span>
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading
          title="Diminishing returns"
          subtitle="Repeating the same activity inside the window yields less bonus XP, down to a floor. Identical effort is never erased."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Window (hours)"
            hint="How far back repeats are counted."
            value={draft.windowHours}
            min={1}
            max={8760}
            step={1}
            onChange={(value) => set('windowHours', value)}
          />
          <NumberField
            label="Step per repeat"
            hint="Default 0.35 (35% reduction per repeat)."
            value={draft.step}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => set('step', value)}
          />
          <NumberField
            label="Floor"
            hint="Lowest multiplier a repeat can reach."
            value={draft.floor}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => set('floor', value)}
          />
        </div>

        <div className="mt-5">
          <p className="label">Multiplier preview</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 8 }, (_, index) => index + 1).map((repeat) => {
              const multiplier = Math.min(1, Math.max(preview.floor, 1 - preview.step * repeat));
              return (
                <span
                  key={repeat}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]',
                    multiplier > 0.7
                      ? 'border-jade/25 bg-jade/[0.06] text-ink-200'
                      : multiplier > 0.4
                        ? 'border-gold-500/25 bg-gold-500/[0.06] text-gold-400'
                        : 'border-blood/25 bg-blood/[0.06] text-[#e0a0a0]',
                  )}
                  title={`${repeat} previous similar activities in the window`}
                >
                  #{repeat}
                  <span className="text-ink-500">×</span>
                  {Math.round(multiplier * 100)}%
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-ink-500">
            Example: at these settings, the fifth repetition inside {preview.windowHours} hours earns{' '}
            {Math.round(Math.min(1, Math.max(preview.floor, 1 - preview.step * 5)) * 100)}% of its base XP.
          </p>
        </div>

        {error ? <div className="mt-4"><InlineError message={error} /></div> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
          <div className="flex items-start gap-2 text-[11px] leading-5 text-ink-500">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-gold-500/80" />
            <p className="max-w-xl">
              Changing the curve recalculates levels from lifetime XP, but never deletes XP. Skills and proficiency
              keep their own decay rules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={reset} disabled={saving}>
              <RotateCcw size={13} /> Defaults
            </Button>
            <Button variant="primary" size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save rules'}
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 sm:grid-cols-2">
        <Panel className="p-5">
          <SectionHeading title="Lifetime progress" subtitle="What inactivity does — and does not — affect." />
          <ul className="space-y-2.5 text-xs leading-5 text-ink-400">
            <Guarantee>Player level and lifetime XP are preserved indefinitely.</Guarantee>
            <Guarantee>Skill proficiency can decay, but certifications never do.</Guarantee>
            <Guarantee>Decay is idempotent: reopening the app cannot double-apply it.</Guarantee>
            <Guarantee>Every decay pass is anchored and auditable in the proficiency history.</Guarantee>
          </ul>
        </Panel>
        <Panel className="p-5">
          <SectionHeading title="Current standing" subtitle="Projected under the unsaved preview." />
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-400">Lifetime XP</span>
              <span className="font-mono text-ink-100">{formatNumber(profile.progression.totalLifetimeXp)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-400">Current level</span>
              <span className="text-ink-100">Lv {profile.progression.level} · {profile.progression.title}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-400">Projected level</span>
              <span className={clsx('font-medium', projectedLevel === profile.progression.level ? 'text-jade' : 'text-gold-400')}>
                Lv {projectedLevel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-400">XP for next level</span>
              <span className="font-mono text-ink-100">{formatNumber(xpRequiredFor(projectedLevel, preview))}</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        className="input font-mono"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

/* ----------------------------------------------------------------------- ai */

interface ProviderDraft {
  id: string | null;
  name: string;
  kind: 'ollama' | 'openai';
  endpoint: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

const PROVIDER_PRESETS: Record<ProviderDraft['kind'], { endpoint: string; model: string; name: string }> = {
  ollama: { endpoint: 'http://127.0.0.1:11434', model: 'llama3.1', name: 'Local Ollama' },
  openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', name: 'OpenAI-compatible' },
};

function emptyProviderDraft(): ProviderDraft {
  return {
    id: null,
    name: PROVIDER_PRESETS.ollama.name,
    kind: 'ollama',
    endpoint: PROVIDER_PRESETS.ollama.endpoint,
    model: PROVIDER_PRESETS.ollama.model,
    apiKey: '',
    enabled: true,
  };
}

function AiSettings({ providers }: { providers: AiProvider[] }) {
  const { refresh, notify, confirm } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<ProviderDraft>(emptyProviderDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openCreate = () => {
    setDraft(emptyProviderDraft());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (provider: AiProvider) => {
    setDraft({
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      endpoint: provider.endpoint,
      model: provider.model,
      apiKey: '',
      enabled: provider.enabled,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const set = <K extends keyof ProviderDraft>(key: K, value: ProviderDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const changeKind = (kind: ProviderDraft['kind']) => {
    const preset = PROVIDER_PRESETS[kind];
    setDraft((current) => ({
      ...current,
      kind,
      endpoint: preset.endpoint,
      model: preset.model,
      name: current.id ? current.name : preset.name,
    }));
  };

  const submit = async () => {
    if (saving) return;
    const name = draft.name.trim();
    const endpoint = draft.endpoint.trim();
    const model = draft.model.trim();
    if (!name || !endpoint || !model) {
      setFormError('Name, endpoint and model are all required.');
      return;
    }
    try {
      new URL(endpoint);
    } catch {
      setFormError('The endpoint must be a complete URL, for example http://127.0.0.1:11434.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (draft.id) {
        const patch: Record<string, unknown> = { name, endpoint, model, enabled: draft.enabled };
        if (draft.apiKey.trim()) patch.apiKey = draft.apiKey.trim();
        await api.patch(`/ai/providers/${draft.id}`, patch);
      } else {
        await api.post('/ai/providers', {
          name,
          kind: draft.kind,
          endpoint,
          model,
          enabled: draft.enabled,
          apiKey: draft.apiKey.trim(),
        });
      }
      await refresh();
      setModalOpen(false);
      notify('success', draft.id ? 'Provider updated' : 'Provider added', 'Consent is still required before external use.');
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const grantConsent = async (provider: AiProvider) => {
    const local = provider.kind === 'ollama';
    const ok = await confirm({
      title: `Allow ${provider.name}?`,
      message: local
        ? 'Activity titles and descriptions will be sent to the local endpoint you configured. No journal entries, inventory files or API keys are included. You can revoke consent by deleting the provider.'
        : 'When you explicitly request AI analysis, the activity title and description plus taxonomy names will be sent to the configured external endpoint. No journal entries, inventory files or API keys are included. This is the only outbound network feature in LIFE RPG.',
      confirmLabel: 'Grant consent',
    });
    if (!ok) return;
    setBusyId(provider.id);
    try {
      await api.post(`/ai/providers/${provider.id}/consent`, { consent: true });
      await refresh();
      notify('success', 'Consent recorded', `${provider.name} can now be selected for activity analysis.`);
    } catch (cause) {
      notify('error', 'Could not record consent', errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const makeDefault = async (provider: AiProvider) => {
    setBusyId(provider.id);
    try {
      await api.post(`/ai/providers/${provider.id}/default`);
      await refresh();
      notify('success', 'Default provider set', `${provider.name} will be used when AI analysis is requested.`);
    } catch (cause) {
      notify('error', 'Could not set default', errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (provider: AiProvider) => {
    setBusyId(provider.id);
    try {
      await api.patch(`/ai/providers/${provider.id}`, { enabled: !provider.enabled });
      await refresh();
    } catch (cause) {
      notify('error', 'Could not update provider', errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (provider: AiProvider) => {
    const ok = await confirm({
      title: `Delete ${provider.name}?`,
      message: 'The provider configuration and its encrypted API key will be removed from this computer. Activity history is untouched.',
      confirmLabel: 'Delete provider',
      danger: true,
    });
    if (!ok) return;
    setBusyId(provider.id);
    try {
      await api.del(`/ai/providers/${provider.id}`);
      await refresh();
      notify('success', 'Provider deleted', 'The stored key was removed from disk.');
    } catch (cause) {
      notify('error', 'Could not delete provider', errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <SectionHeading
          title="Optional intelligence"
          subtitle="AI only proposes XP allocations. It can never write progression directly."
          actions={
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus size={14} /> Add provider
            </Button>
          }
        />
        <div className="grid gap-3 text-xs leading-5 text-ink-400 sm:grid-cols-3">
          <InfoNote icon={<ShieldCheck size={15} />} title="Approval gate">
            Every proposal is validated against your real taxonomy and shown for editing. Nothing is saved until you
            approve it.
          </InfoNote>
          <InfoNote icon={<CloudOff size={15} />} title="Offline by default">
            With no provider, the built-in heuristic analyzer works entirely on this machine.
          </InfoNote>
          <InfoNote icon={<LockKeyhole size={15} />} title="Keys encrypted">
            API keys are encrypted at rest and never returned by the API. Only a confidential flag is shown.
          </InfoNote>
        </div>
      </Panel>

      {providers.length === 0 ? (
        <Panel className="p-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.02] text-ink-400">
            <Cpu size={20} />
          </span>
          <h3 className="mt-3 font-display text-lg text-ink-200">No AI provider configured</h3>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-400">
            The offline heuristic analyzer is already active. Add Ollama for a fully local model, or an
            OpenAI-compatible endpoint if you prefer.
          </p>
          <Button variant="primary" className="mt-4" onClick={openCreate}>
            <Plus size={15} /> Add your first provider
          </Button>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {providers.map((provider) => {
            const busy = busyId === provider.id;
            const KindIcon = provider.kind === 'ollama' ? Cpu : Cloud;
            return (
              <Panel key={provider.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gold-500/25 bg-gold-500/[0.07] text-gold-400">
                      <KindIcon size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-ink-100">{provider.name}</p>
                        <Badge tone={provider.kind === 'ollama' ? 'jade' : 'gold'}>
                          {provider.kind === 'ollama' ? 'Local' : 'External'}
                        </Badge>
                        {provider.isDefault ? <Badge tone="gold">Default</Badge> : null}
                        {!provider.enabled ? <Badge tone="muted">Disabled</Badge> : null}
                        <Badge tone={provider.consentGiven ? 'jade' : 'danger'}>
                          {provider.consentGiven ? 'Consent given' : 'Consent needed'}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-ink-500">
                        {provider.endpoint} · {provider.model}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
                        <KeyRound size={10} />
                        {provider.hasApiKey ? 'Encrypted key stored' : 'No API key'}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {busy ? <Loader2 className="mr-1 animate-spin text-ink-400" size={14} /> : null}
                    {!provider.consentGiven ? (
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => void grantConsent(provider)}>
                        <ShieldCheck size={13} /> Grant consent
                      </Button>
                    ) : null}
                    {!provider.isDefault ? (
                      <Button size="sm" disabled={busy} onClick={() => void makeDefault(provider)}>
                        <Star size={13} /> Make default
                      </Button>
                    ) : null}
                    <IconButton label={provider.enabled ? 'Disable provider' : 'Enable provider'} disabled={busy} onClick={() => void toggleEnabled(provider)}>
                      <Power size={14} />
                    </IconButton>
                    <IconButton label="Edit provider" disabled={busy} onClick={() => openEdit(provider)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton label="Delete provider" disabled={busy} onClick={() => void remove(provider)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>

                {!provider.consentGiven ? (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-gold-500/20 bg-gold-500/[0.04] px-3 py-2 text-[11px] leading-5 text-ink-400">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-gold-500" />
                    Until consent is granted, activity analysis will use the offline heuristic instead of this
                    provider.
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}

      <Panel className="p-5">
        <SectionHeading title="How analysis works" subtitle="The same guard rails apply to every provider." />
        <ol className="grid gap-3 text-xs leading-5 text-ink-400 sm:grid-cols-4">
          <Step index={1} title="Describe">
            You write what happened. Only this text and taxonomy names are sent.
          </Step>
          <Step index={2} title="Propose">
            The app asks for structured allocations and confidence, never for database writes.
          </Step>
          <Step index={3} title="Validate">
            IDs, totals and plausibility are checked by the domain layer. Invalid output is discarded.
          </Step>
          <Step index={4} title="Approve">
            You edit and approve. XP, skills, achievements and streaks update in one transaction.
          </Step>
        </ol>
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={draft.id ? 'Edit AI provider' : 'Add AI provider'}
        description="Configuration stays on this computer. Keys are encrypted with a locally generated secret."
        footer={
          <>
            <Button onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add provider'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <span className="label">Provider kind</span>
            <div className="grid grid-cols-2 gap-2">
              {(['ollama', 'openai'] as const).map((kind) => {
                const KindIcon = kind === 'ollama' ? Cpu : Cloud;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => changeKind(kind)}
                    className={clsx(
                      'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition',
                      draft.kind === kind
                        ? 'border-gold-500/50 bg-gold-500/[0.07]'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]',
                    )}
                  >
                    <KindIcon size={16} className={draft.kind === kind ? 'mt-0.5 text-gold-400' : 'mt-0.5 text-ink-500'} />
                    <span>
                      <span className="block text-xs font-medium text-ink-100">
                        {kind === 'ollama' ? 'Ollama / local' : 'OpenAI-compatible'}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">
                        {kind === 'ollama' ? 'Runs on this machine' : 'Remote HTTP endpoint'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Display name">
            <input
              className="input"
              value={draft.name}
              maxLength={80}
              onChange={(event) => set('name', event.target.value)}
              placeholder="e.g. Local Ollama"
            />
          </Field>

          <Field
            label="Endpoint"
            hint={
              draft.kind === 'ollama'
                ? 'Ollama serves http://127.0.0.1:11434 by default.'
                : 'Include the API root, e.g. https://api.openai.com/v1 or a compatible gateway.'
            }
          >
            <input
              className="input font-mono"
              value={draft.endpoint}
              maxLength={2000}
              onChange={(event) => set('endpoint', event.target.value)}
              placeholder="http://127.0.0.1:11434"
            />
          </Field>

          <Field label="Model" hint="The exact model identifier served by the endpoint.">
            <input
              className="input font-mono"
              value={draft.model}
              maxLength={200}
              onChange={(event) => set('model', event.target.value)}
              placeholder="llama3.1"
            />
          </Field>

          <Field
            label={draft.id ? 'API key (optional)' : 'API key (optional)'}
            hint={
              draft.id
                ? 'Leave blank to keep the stored key. Entering a new value replaces it.'
                : 'Leave blank for local Ollama. Stored encrypted; never shown again.'
            }
          >
            <input
              className="input font-mono"
              type="password"
              value={draft.apiKey}
              maxLength={500}
              autoComplete="off"
              onChange={(event) => set('apiKey', event.target.value)}
              placeholder={draft.id ? '•••••••• (unchanged)' : 'sk-…'}
            />
          </Field>

          <label className="flex items-center gap-2.5 text-sm text-ink-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#cfa960]"
              checked={draft.enabled}
              onChange={(event) => set('enabled', event.target.checked)}
            />
            Enable this provider for activity analysis
          </label>

          {formError ? <InlineError message={formError} /> : null}
        </div>
      </Modal>
    </div>
  );
}

function Step({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <li className="rounded-md border border-white/[0.05] bg-white/[0.015] p-3">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/[0.08] font-mono text-[10px] text-gold-400">
        {index}
      </span>
      <p className="mt-2 text-xs font-medium text-ink-200">{title}</p>
      <p className="mt-0.5 text-[11px] leading-5 text-ink-500">{children}</p>
    </li>
  );
}

/* ------------------------------------------------------------------ backups */

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function BackupSettings({ settings }: { settings: Settings }) {
  const { refresh, notify, confirm } = useApp();
  const backupsState = useAsync<{ backups: Backup[] }>(
    () => api.get<{ backups: Backup[] }>('/backups'),
    [],
  );
  const health = useAsync<HealthPayload>(() => api.get<HealthPayload>('/health'), []);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [validations, setValidations] = useState<Record<string, ValidationResult>>({});
  const [autoEnabled, setAutoEnabled] = useState(settings.autoBackupEnabled);
  const [retention, setRetention] = useState(settings.autoBackupRetention);
  const [savingAuto, setSavingAuto] = useState(false);

  useEffect(() => {
    setAutoEnabled(settings.autoBackupEnabled);
    setRetention(settings.autoBackupRetention);
  }, [settings.autoBackupEnabled, settings.autoBackupRetention]);

  const backups = backupsState.data?.backups ?? [];
  const autoDirty = autoEnabled !== settings.autoBackupEnabled || retention !== settings.autoBackupRetention;

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await api.post('/backups', { note: note.trim() });
      setNote('');
      backupsState.reload();
      await refresh();
      notify('success', 'Backup created', 'The archive contains your database, settings and attachments.');
    } catch (cause) {
      notify('error', 'Backup failed', errorMessage(cause));
    } finally {
      setCreating(false);
    }
  };

  const saveAuto = async () => {
    if (!autoDirty || savingAuto) return;
    setSavingAuto(true);
    try {
      await api.patch('/settings', {
        autoBackupEnabled: autoEnabled,
        autoBackupRetention: Math.min(365, Math.max(1, Math.round(retention) || 30)),
      });
      await refresh();
      notify('success', 'Backup policy saved', autoEnabled ? 'A daily automatic backup will be kept.' : 'Automatic backups are off.');
    } catch (cause) {
      notify('error', 'Could not save backup policy', errorMessage(cause));
    } finally {
      setSavingAuto(false);
    }
  };

  const validate = async (backup: Backup) => {
    setBusyId(backup.id);
    try {
      const result = await api.post<ValidationResult>(`/backups/${backup.id}/validate`);
      setValidations((current) => ({ ...current, [backup.id]: result }));
      if (result.ok) notify('success', 'Backup verified', 'Checksums and the embedded database passed validation.');
      else notify('error', 'Backup has problems', result.errors[0] ?? 'Validation failed.');
    } catch (cause) {
      notify('error', 'Validation failed', errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (backup: Backup) => {
    const ok = await confirm({
      title: 'Restore this backup?',
      message: `Your current database and attachments will be replaced by ${backup.filename}. A pre-restore safety snapshot is created first, so this can be undone from the backup list.`,
      confirmLabel: 'Restore backup',
      danger: true,
      note: 'A safety snapshot of your current data is taken automatically before the restore, so this is reversible from the archive list.',
    });
    if (!ok) return;
    setBusyId(backup.id);
    try {
      const result = await api.post<{ restored: boolean; preRestoreBackup: string; warnings: string[] }>(
        `/backups/${backup.id}/restore`,
      );
      await refresh();
      backupsState.reload();
      notify(
        'success',
        'Backup restored',
        `Safety snapshot saved as ${result.preRestoreBackup}.${result.warnings.length ? ` ${result.warnings.length} warning(s).` : ''}`,
      );
    } catch (cause) {
      notify('error', 'Restore failed', errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (backup: Backup) => {
    const ok = await confirm({
      title: 'Delete this backup?',
      message: `${backup.filename} will be removed from disk. This does not affect your live data.`,
      confirmLabel: 'Delete archive',
      danger: true,
    });
    if (!ok) return;
    setBusyId(backup.id);
    try {
      await api.del(`/backups/${backup.id}`);
      backupsState.reload();
      await refresh();
      notify('success', 'Backup deleted', 'The archive was removed from your backup folder.');
    } catch (cause) {
      notify('error', 'Could not delete backup', errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <SectionHeading
          title="Manual backup"
          subtitle="One ZIP containing the database, settings and every attachment."
          actions={<Badge tone="jade">Portable</Badge>}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Note (optional)" className="flex-1" hint="A short label to remember why this snapshot matters.">
            <input
              className="input"
              value={note}
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void create();
              }}
              placeholder="e.g. Before restructuring skill trees"
            />
          </Field>
          <Button variant="primary" className="sm:mb-0" disabled={creating} onClick={() => void create()}>
            {creating ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
            {creating ? 'Creating…' : 'Create backup'}
          </Button>
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading
          title="Automatic backups"
          subtitle="A daily snapshot while the app is open, pruned by rotation."
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 items-center gap-2.5 text-sm text-ink-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#cfa960]"
              checked={autoEnabled}
              onChange={(event) => setAutoEnabled(event.target.checked)}
            />
            Create an automatic backup once per day
          </label>
          <div className="w-full sm:w-40">
            <NumberField
              label="Keep newest"
              hint="1–365 automatic archives."
              value={retention}
              min={1}
              max={365}
              step={1}
              onChange={setRetention}
            />
          </div>
          <Button size="sm" variant="primary" disabled={!autoDirty || savingAuto} onClick={() => void saveAuto()}>
            {savingAuto ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            Save policy
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-ink-500">
          Last automatic backup: {relativeTime(settings.lastAutoBackupAt)}. Manual backups are never pruned.
        </p>
      </Panel>

      <Panel className="p-5">
        <SectionHeading
          title="Archive history"
          subtitle="Validate before restoring. Every restore keeps a way back."
          actions={
            <Button size="sm" disabled={backupsState.loading} onClick={backupsState.reload}>
              <RefreshCw size={13} className={backupsState.loading ? 'animate-spin' : undefined} /> Refresh
            </Button>
          }
        />

        {backupsState.loading && !backupsState.data ? (
          <p className="py-6 text-center text-sm text-ink-400">Loading backups…</p>
        ) : backupsState.error ? (
          <InlineError message={backupsState.error} />
        ) : backups.length === 0 ? (
          <div className="py-8 text-center">
            <Database size={22} className="mx-auto text-ink-500" />
            <p className="mt-2 text-sm text-ink-300">No backups yet</p>
            <p className="mt-1 text-xs text-ink-500">Create your first archive above. It takes a few seconds.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {backups.map((backup) => {
              const busy = busyId === backup.id;
              const validation = validations[backup.id];
              return (
                <div key={backup.id} className="rounded-md border border-white/[0.06] bg-white/[0.015] p-3.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate font-mono text-xs text-ink-200">{backup.filename}</p>
                        <Badge tone={backup.kind === 'auto' ? 'muted' : 'gold'}>{backup.kind}</Badge>
                        {validation ? (
                          <Badge tone={validation.ok ? 'jade' : 'danger'}>
                            {validation.ok ? 'Verified' : 'Invalid'}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-500">
                        {formatDateTime(backup.created_at)} · {formatBytes(backup.size)} · sha256{' '}
                        <span className="font-mono">{backup.sha256.slice(0, 12)}…</span>
                      </p>
                      {backup.note ? <p className="mt-1 text-xs text-ink-400">{backup.note}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {busy ? <Loader2 className="mr-1 animate-spin text-ink-400" size={14} /> : null}
                      <a
                        href={api.rawUrl(`/backups/${backup.id}/download`)}
                        className="btn-ghost px-2.5 py-1 text-xs"
                        title="Download archive"
                      >
                        <Download size={13} /> Download
                      </a>
                      <Button size="sm" disabled={busy} onClick={() => void validate(backup)}>
                        <ShieldCheck size={13} /> Validate
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void restore(backup)}>
                        <RotateCcw size={13} /> Restore
                      </Button>
                      <IconButton label="Delete backup" disabled={busy} onClick={() => void remove(backup)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </div>
                  {validation ? (
                    <div
                      className={clsx(
                        'mt-3 rounded-md border px-3 py-2 text-[11px] leading-5',
                        validation.ok
                          ? 'border-jade/25 bg-jade/[0.04] text-ink-300'
                          : 'border-blood/30 bg-blood/[0.05] text-[#e0a0a0]',
                      )}
                    >
                      {validation.ok ? (
                        <p className="flex items-center gap-1.5">
                          <CheckCircle2 size={12} className="text-jade" />
                          Manifest, database checksum, SQLite integrity and attachment checks passed.
                        </p>
                      ) : (
                        <ul className="list-disc space-y-0.5 pl-4">
                          {validation.errors.map((message) => (
                            <li key={message}>{message}</li>
                          ))}
                        </ul>
                      )}
                      {validation.warnings.length ? (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-gold-400">
                          {validation.warnings.map((message) => (
                            <li key={message}>{message}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeading title="Where your data lives" subtitle="Plain files you control and can copy yourself." />
          <div className="flex items-start gap-3 rounded-md border border-white/[0.06] bg-ink-950/50 px-3 py-3">
            <HardDrive size={18} className="mt-0.5 shrink-0 text-gold-500/80" />
            <div className="min-w-0 text-xs leading-5 text-ink-400">
              <p className="font-mono text-[11px] text-ink-200">%LOCALAPPDATA%\LIFE_RPG_WEB</p>
              <p className="mt-1">
                Windows default. Linux and macOS use <span className="font-mono">~/.local/share/LIFE_RPG_WEB</span>.
              </p>
              <p className="mt-1">
                Override with <span className="font-mono text-ink-300">LIFERPG_DATA_DIR</span> before starting the app.
                Backups live in the <span className="font-mono">backups</span> folder.
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-2 text-[11px] leading-5 text-ink-400">
            <Guarantee>Database, attachments, encrypted keys and backups stay under this folder.</Guarantee>
            <Guarantee>The repository never contains personal data; it is ignored by design.</Guarantee>
            <Guarantee>Docker mounts the same folder from the host, published only on 127.0.0.1.</Guarantee>
          </ul>
        </Panel>

        <Panel className="p-5">
          <SectionHeading title="Privacy & network" subtitle="The local boundary, as reported by the running server." />
          <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm text-ink-200">
              <LockKeyhole size={15} className="text-jade" />
              Server status
            </span>
            {health.data ? (
              <Badge tone={health.data.status === 'ok' ? 'jade' : 'danger'}>{health.data.status}</Badge>
            ) : (
              <Badge tone="muted">{health.error ? 'unknown' : 'checking'}</Badge>
            )}
          </div>
          <dl className="mt-3 space-y-2 text-[11px] leading-5 text-ink-400">
            <div className="flex items-center justify-between gap-3">
              <dt>Bind address</dt>
              <dd className="font-mono text-ink-200">{health.data?.network.binding ?? '127.0.0.1'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Local-only boundary</dt>
              <dd className={health.data?.network.localOnly === false ? 'text-gold-400' : 'text-jade'}>
                {health.data?.network.localOnly === false ? 'Remote binding enabled' : 'Enforced'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Version</dt>
              <dd className="font-mono text-ink-200">v{health.data?.version ?? '1.0.0'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Telemetry</dt>
              <dd className="text-jade">None</dd>
            </div>
          </dl>
          <p className="mt-3 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[11px] leading-5 text-ink-500">
            <CloudOff size={13} className="mt-0.5 shrink-0 text-jade/80" />
            The only possible outbound traffic is an AI request you explicitly trigger from a provider you configured.
            There is no background sync.
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-blood/30 bg-blood/[0.07] px-3 py-2 text-xs leading-5 text-[#e0a0a0]">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function InfoNote({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white/[0.05] bg-white/[0.015] p-3">
      <span className="text-gold-500/80">{icon}</span>
      <p className="mt-1.5 text-xs font-medium text-ink-200">{title}</p>
      <p className="mt-0.5 text-[11px] leading-5 text-ink-500">{children}</p>
    </div>
  );
}

function Guarantee({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 size={12} className="mt-1 shrink-0 text-jade/80" />
      <span>{children}</span>
    </li>
  );
}
