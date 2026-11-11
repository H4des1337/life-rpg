import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Dices, LockKeyhole, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import type { Appearance } from '../types';
import {
  APPEARANCE_LABELS,
  APPEARANCE_OPTIONS,
  CharacterArt,
  HAIR_COLORS,
  OUTFIT_COLORS,
  SKIN_TONES,
} from '../components/CharacterArt';
import { Button, Field, GoldRule } from '../components/ui';
import { errorMessage } from '../lib/hooks';

const DEFAULTS: Appearance = {
  skinTone: 'warm',
  hairStyle: 'short',
  hairColor: 'brown',
  outfit: 'tunic',
  outfitColor: 'midnight',
  accessory: 'none',
  background: 'arch',
};

export function Onboarding() {
  const { refresh, notify } = useApp();
  const [name, setName] = useState('');
  const [appearance, setAppearance] = useState<Appearance>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !saving;
  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
    setAppearance((current) => ({ ...current, [key]: value }));

  const randomize = () => {
    const pick = <T,>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)] as T;
    setAppearance({
      skinTone: pick(APPEARANCE_OPTIONS.skinTone),
      hairStyle: pick(APPEARANCE_OPTIONS.hairStyle),
      hairColor: pick(APPEARANCE_OPTIONS.hairColor),
      outfit: pick(APPEARANCE_OPTIONS.outfit),
      outfitColor: pick(APPEARANCE_OPTIONS.outfitColor),
      accessory: pick(APPEARANCE_OPTIONS.accessory),
      background: pick(APPEARANCE_OPTIONS.background),
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/profile', { name: name.trim(), appearance });
      await refresh();
      notify('success', 'Character created', 'Your first quest begins now. Log an activity to earn your first XP.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const level = useMemo(() => 1, []);

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-1/2 top-[-18rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-gold-500/[0.07] blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-jade/[0.04] blur-3xl" />
      </div>

      <div className="relative mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="hidden lg:block">
          <div className="relative mx-auto max-w-sm">
            <div className="absolute inset-0 -z-10 rounded-full bg-gold-500/10 blur-3xl" />
            <CharacterArt appearance={appearance} level={level} />
            <div className="absolute -bottom-2 left-1/2 w-[85%] -translate-x-1/2 rounded-md border border-white/[0.08] bg-ink-950/85 px-3 py-2 text-center backdrop-blur">
              <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Level 1 · Unwritten</p>
              <p className="font-display text-lg text-ink-100">{name.trim() || 'Your name here'}</p>
            </div>
          </div>
        </div>

        <div className="panel relative overflow-hidden p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="eyebrow">First session</p>
              <h1 className="mt-1 text-3xl text-ink-100 sm:text-4xl">Begin your legend</h1>
            </div>
            <span className="flex h-10 w-10 rotate-45 items-center justify-center rounded-md border border-gold-500/40 bg-gold-500/10">
              <Sparkles size={16} className="-rotate-45 text-gold-400" />
            </span>
          </div>

          <p className="text-sm leading-6 text-ink-400">
            LIFE RPG is a private progression journal. Every real activity you log becomes XP, skills grow from
            practice, and your character sheet becomes a truthful record of the life you are building.
          </p>

          <div className="my-5">
            <GoldRule />
          </div>

          <div className="space-y-4">
            <Field label="Character name" hint="This is your local profile name. You can change it later.">
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit();
                }}
                autoFocus
                maxLength={80}
                placeholder="e.g. Rowan Ashvale"
              />
            </Field>

            <div className="lg:hidden">
              <div className="mx-auto max-w-[190px]">
                <CharacterArt appearance={appearance} level={1} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <OptionRow
                label="Skin tone"
                value={appearance.skinTone}
                options={APPEARANCE_OPTIONS.skinTone.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id, swatch: SKIN_TONES[id] }))}
                onChange={(value) => set('skinTone', value)}
              />
              <OptionRow
                label="Hair"
                value={appearance.hairStyle}
                options={APPEARANCE_OPTIONS.hairStyle.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id }))}
                onChange={(value) => set('hairStyle', value)}
              />
              <OptionRow
                label="Hair colour"
                value={appearance.hairColor}
                options={APPEARANCE_OPTIONS.hairColor.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id, swatch: HAIR_COLORS[id] }))}
                onChange={(value) => set('hairColor', value)}
              />
              <OptionRow
                label="Outfit"
                value={appearance.outfit}
                options={APPEARANCE_OPTIONS.outfit.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id }))}
                onChange={(value) => set('outfit', value)}
              />
              <OptionRow
                label="Outfit colour"
                value={appearance.outfitColor}
                options={APPEARANCE_OPTIONS.outfitColor.map((id) => ({
                  id,
                  label: APPEARANCE_LABELS[id] ?? id,
                  swatch: OUTFIT_COLORS[id]?.base,
                }))}
                onChange={(value) => set('outfitColor', value)}
              />
              <OptionRow
                label="Accessory"
                value={appearance.accessory}
                options={APPEARANCE_OPTIONS.accessory.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id }))}
                onChange={(value) => set('accessory', value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <OptionRow
                label="Backdrop"
                className="flex-1"
                value={appearance.background}
                options={APPEARANCE_OPTIONS.background.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id }))}
                onChange={(value) => set('background', value)}
              />
              <Button variant="ghost" size="sm" className="mt-5" onClick={randomize}>
                <Dices size={14} /> Surprise me
              </Button>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-md border border-blood/30 bg-blood/[0.07] px-3 py-2 text-xs leading-5 text-[#e0a0a0]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button variant="primary" className="w-full py-2.5" disabled={!canSubmit} onClick={() => void submit()}>
              {saving ? 'Creating character…' : 'Create character'}
              {!saving ? <ArrowRight size={16} /> : null}
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-500">
              <LockKeyhole size={11} className="text-jade/70" />
              Stored only on this computer. No account, cloud, or telemetry.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string; swatch?: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
            title={option.label}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition',
              value === option.id
                ? 'border-gold-500/50 bg-gold-500/10 text-ink-100'
                : 'border-white/[0.07] bg-white/[0.02] text-ink-400 hover:border-white/[0.14] hover:text-ink-200',
            )}
          >
            {option.swatch ? (
              <span
                className="h-2.5 w-2.5 rounded-full border border-black/30"
                style={{ backgroundColor: option.swatch }}
              />
            ) : null}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
