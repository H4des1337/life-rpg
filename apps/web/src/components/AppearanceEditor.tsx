import clsx from 'clsx';
import { Dices } from 'lucide-react';
import type { Appearance } from '../types';
import {
  APPEARANCE_LABELS,
  APPEARANCE_OPTIONS,
  HAIR_COLORS,
  OUTFIT_COLORS,
  SKIN_TONES,
  CharacterArt,
} from './CharacterArt';
import { Button } from './ui';

export function AppearanceEditor({
  appearance,
  onChange,
  showPreview = true,
}: {
  appearance: Appearance;
  onChange: (next: Appearance) => void;
  showPreview?: boolean;
}) {
  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
    onChange({ ...appearance, [key]: value });

  const randomize = () => {
    const pick = <T,>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)] as T;
    onChange({
      skinTone: pick(APPEARANCE_OPTIONS.skinTone),
      hairStyle: pick(APPEARANCE_OPTIONS.hairStyle),
      hairColor: pick(APPEARANCE_OPTIONS.hairColor),
      outfit: pick(APPEARANCE_OPTIONS.outfit),
      outfitColor: pick(APPEARANCE_OPTIONS.outfitColor),
      accessory: pick(APPEARANCE_OPTIONS.accessory),
      background: pick(APPEARANCE_OPTIONS.background),
    });
  };

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_210px]">
      <div className="space-y-4">
        <Group
          label="Skin tone"
          value={appearance.skinTone}
          options={APPEARANCE_OPTIONS.skinTone.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id, swatch: SKIN_TONES[id] }))}
          onChange={(value) => set('skinTone', value)}
        />
        <Group
          label="Hair style"
          value={appearance.hairStyle}
          options={APPEARANCE_OPTIONS.hairStyle.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id }))}
          onChange={(value) => set('hairStyle', value)}
        />
        <Group
          label="Hair colour"
          value={appearance.hairColor}
          options={APPEARANCE_OPTIONS.hairColor.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id, swatch: HAIR_COLORS[id] }))}
          onChange={(value) => set('hairColor', value)}
        />
        <Group
          label="Outfit"
          value={appearance.outfit}
          options={APPEARANCE_OPTIONS.outfit.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id }))}
          onChange={(value) => set('outfit', value)}
        />
        <Group
          label="Outfit colour"
          value={appearance.outfitColor}
          options={APPEARANCE_OPTIONS.outfitColor.map((id) => ({
            id,
            label: APPEARANCE_LABELS[id] ?? id,
            swatch: OUTFIT_COLORS[id]?.base,
          }))}
          onChange={(value) => set('outfitColor', value)}
        />
        <Group
          label="Accessory"
          value={appearance.accessory}
          options={APPEARANCE_OPTIONS.accessory.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id }))}
          onChange={(value) => set('accessory', value)}
        />
        <Group
          label="Backdrop"
          value={appearance.background}
          options={APPEARANCE_OPTIONS.background.map((id) => ({ id, label: APPEARANCE_LABELS[id] ?? id }))}
          onChange={(value) => set('background', value)}
        />
      </div>

      <div>
        {showPreview ? (
          <div className="sticky top-2">
            <div className="overflow-hidden rounded-lg border border-white/[0.08]">
              <CharacterArt appearance={appearance} level={1} />
            </div>
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={randomize}>
              <Dices size={13} /> Surprise me
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Group({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string; swatch?: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition',
              value === option.id
                ? 'border-gold-500/50 bg-gold-500/10 text-ink-100'
                : 'border-white/[0.07] bg-white/[0.02] text-ink-400 hover:border-white/[0.14] hover:text-ink-200',
            )}
          >
            {option.swatch ? (
              <span className="h-2.5 w-2.5 rounded-full border border-black/30" style={{ backgroundColor: option.swatch }} />
            ) : null}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
