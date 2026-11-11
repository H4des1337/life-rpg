import { useId } from 'react';
import clsx from 'clsx';
import type { Appearance } from '../types';

export const SKIN_TONES: Record<string, string> = {
  warm: '#e8b48c',
  fair: '#f3d3b8',
  tan: '#c98f63',
  deep: '#8d5a3c',
  olive: '#d2a176',
};

export const HAIR_COLORS: Record<string, string> = {
  brown: '#6b452c',
  black: '#262329',
  blonde: '#d9b56a',
  auburn: '#8a3f2d',
  silver: '#b9bfc9',
  teal: '#3f7d78',
};

export const OUTFIT_COLORS: Record<string, { base: string; dark: string; trim: string }> = {
  midnight: { base: '#2c3a5c', dark: '#1d2740', trim: '#8fa2cc' },
  emerald: { base: '#2f5c4a', dark: '#1e3d31', trim: '#8fc8ae' },
  crimson: { base: '#6b2f3a', dark: '#481f27', trim: '#cf8e97' },
  azure: { base: '#2d5670', dark: '#1d3a4c', trim: '#8fbed8' },
  ivory: { base: '#d9d3c4', dark: '#b3ac9b', trim: '#7d7563' },
  plum: { base: '#4f335f', dark: '#35213f', trim: '#b494c6' },
};

export const APPEARANCE_OPTIONS = {
  skinTone: Object.keys(SKIN_TONES),
  hairStyle: ['short', 'bob', 'long', 'bun', 'ponytail', 'braids'],
  hairColor: Object.keys(HAIR_COLORS),
  outfit: ['tunic', 'robe', 'armor', 'hoodie', 'coat'],
  outfitColor: Object.keys(OUTFIT_COLORS),
  accessory: ['none', 'glasses', 'circlet', 'scarf', 'headset'],
  background: ['arch', 'forest', 'forge', 'night', 'dawn'],
} as const;

export const APPEARANCE_LABELS: Record<string, string> = {
  short: 'Cropped',
  bob: 'Bob',
  long: 'Long',
  bun: 'Top knot',
  ponytail: 'Ponytail',
  braids: 'Braids',
  tunic: 'Tunic',
  robe: 'Robe',
  armor: 'Armor',
  hoodie: 'Hoodie',
  coat: 'Coat',
  none: 'None',
  glasses: 'Spectacles',
  circlet: 'Circlet',
  scarf: 'Scarf',
  headset: 'Headset',
  arch: 'Stone arch',
  forest: 'Forest',
  forge: 'Forge',
  night: 'Night sky',
  dawn: 'Dawn',
};

const BACKGROUNDS: Record<string, { top: string; bottom: string; glow: string; accent: string }> = {
  arch: { top: '#1b2130', bottom: '#0b0d13', glow: '#cfa960', accent: '#3b4560' },
  forest: { top: '#16241f', bottom: '#0a0f0d', glow: '#7fbf9c', accent: '#2c4a3d' },
  forge: { top: '#2a1d18', bottom: '#100b09', glow: '#d97757', accent: '#57352a' },
  night: { top: '#141a2c', bottom: '#080a12', glow: '#8fa2cc', accent: '#2c3552' },
  dawn: { top: '#2c2330', bottom: '#120e16', glow: '#e3c27a', accent: '#5c4258' },
};

function pick<T>(map: Record<string, T>, key: string, fallback: string): T {
  return map[key] ?? map[fallback];
}

export function CharacterArt({
  appearance,
  level = 1,
  className,
  idle = true,
}: {
  appearance?: Appearance | null;
  level?: number;
  className?: string;
  idle?: boolean;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '');
  const look: Appearance = {
    skinTone: appearance?.skinTone ?? 'warm',
    hairStyle: appearance?.hairStyle ?? 'short',
    hairColor: appearance?.hairColor ?? 'brown',
    outfit: appearance?.outfit ?? 'tunic',
    outfitColor: appearance?.outfitColor ?? 'midnight',
    accessory: appearance?.accessory ?? 'none',
    background: appearance?.background ?? 'arch',
  };

  const skin = pick(SKIN_TONES, look.skinTone, 'warm');
  const hair = pick(HAIR_COLORS, look.hairColor, 'brown');
  const cloth = pick(OUTFIT_COLORS, look.outfitColor, 'midnight');
  const bg = pick(BACKGROUNDS, look.background, 'arch');
  const hairDark = shade(hair, -22);
  const skinShade = shade(skin, -14);
  const auraOpacity = level >= 50 ? 0.5 : level >= 25 ? 0.38 : level >= 10 ? 0.28 : 0.18;

  return (
    <svg
      viewBox="0 0 240 280"
      className={clsx('h-auto w-full select-none', className)}
      role="img"
      aria-label={`Chibi character portrait at level ${level}`}
    >
      <defs>
        <radialGradient id={`bg-${uid}`} cx="50%" cy="32%" r="78%">
          <stop offset="0%" stopColor={bg.top} />
          <stop offset="100%" stopColor={bg.bottom} />
        </radialGradient>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={bg.glow} stopOpacity="0.55" />
          <stop offset="100%" stopColor={bg.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`cloth-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cloth.base} />
          <stop offset="100%" stopColor={cloth.dark} />
        </linearGradient>
        <linearGradient id={`skin-${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={skin} />
          <stop offset="100%" stopColor={skinShade} />
        </linearGradient>
        <linearGradient id={`hair-${uid}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={hair} />
          <stop offset="100%" stopColor={hairDark} />
        </linearGradient>
        <linearGradient id={`clippath-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="240" height="280" rx="18" fill={`url(#bg-${uid})`} />
      <ellipse cx="120" cy="112" rx="102" ry="98" fill={`url(#glow-${uid})`} />
      <g opacity="0.35" fill="#fff">
        {SPARKS.map((spark, index) => (
          <circle key={index} cx={spark[0]} cy={spark[1]} r={spark[2]} opacity={spark[3]} />
        ))}
      </g>

      {/* Arch / scenery */}
      <path d="M47 256V145a73 73 0 0 1 146 0v111" fill="none" stroke={bg.accent} strokeWidth="3" opacity="0.75" />
      <path d="M56 256V146a64 64 0 0 1 128 0v110" fill="none" stroke={bg.glow} strokeOpacity="0.18" strokeWidth="1.5" />
      {look.background === 'forest' ? (
        <g opacity="0.5" fill={bg.accent}>
          <path d="M28 256l24-62 24 62z" />
          <path d="M176 256l20-52 20 52z" />
        </g>
      ) : null}
      {look.background === 'forge' ? (
        <g opacity="0.4" stroke={bg.glow} fill="none" strokeWidth="1.5">
          <path d="M198 214c8-6 8-18 0-24" />
          <path d="M30 222c-6-4-6-12 0-16" />
        </g>
      ) : null}
      {look.background === 'night' || look.background === 'dawn' ? (
        <g opacity="0.5">
          <circle cx="196" cy="48" r="9" fill="#f4e6c2" opacity="0.8" />
          <circle cx="190" cy="45" r="8" fill={bg.top} />
        </g>
      ) : null}

      <ellipse cx="120" cy="256" rx="64" ry="10" fill="#000" opacity="0.35" />
      <ellipse cx="120" cy="250" rx="46" ry="9" fill={bg.glow} opacity={auraOpacity}>
        <animate attributeName="opacity" values={`${auraOpacity};${auraOpacity * 0.55};${auraOpacity}`} dur="4s" repeatCount="indefinite" />
      </ellipse>

      <g className={idle ? 'animate-float-idle' : undefined}>
        {/* Back hair */}
        <HairBack style={look.hairStyle} hair={`url(#hair-${uid})`} hairDark={hairDark} />

        {/* Body */}
        <g>
          <rect x="101" y="188" width="12" height="36" rx="5" fill="#242938" />
          <rect x="127" y="188" width="12" height="36" rx="5" fill="#242938" />
          <rect x="97" y="218" width="20" height="16" rx="6" fill="#191d27" />
          <rect x="123" y="218" width="20" height="16" rx="6" fill="#191d27" />

          <Outfit type={look.outfit} cloth={`url(#cloth-${uid})`} trim={cloth.trim} skin={`url(#skin-${uid})`} />

          <path d="M104 176q16 10 32 0v14q-16 8-32 0z" fill={`url(#skin-${uid})`} />
          {look.accessory === 'scarf' ? (
            <g>
              <path d="M96 184q24 12 48 0v10q-24 12-48 0z" fill="#9d3f3f" />
              <path d="M138 192l10 30-12 4-6-30z" fill="#7c2f2f" />
            </g>
          ) : null}

          {/* Head */}
          <ellipse cx="88" cy="134" rx="7" ry="10" fill={skinShade} />
          <ellipse cx="152" cy="134" rx="7" ry="10" fill={skinShade} />
          <circle cx="120" cy="128" r="49" fill={`url(#skin-${uid})`} />
          <circle cx="120" cy="128" r="49" fill={`url(#clippath-${uid})`} />

          {/* Face */}
          <g>
            <ellipse cx="101" cy="130" rx="7.4" ry="9.2" fill="#1d2027" />
            <ellipse cx="139" cy="130" rx="7.4" ry="9.2" fill="#1d2027" />
            <circle cx="103.4" cy="126.6" r="2.9" fill="#fff" />
            <circle cx="141.4" cy="126.6" r="2.9" fill="#fff" />
            <circle cx="99.2" cy="133.6" r="1.5" fill="#fff" opacity="0.7" />
            <circle cx="137.2" cy="133.6" r="1.5" fill="#fff" opacity="0.7" />
            <path d="M96 114q5-4 10-1" stroke={hairDark} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M134 113q5-3 10 1" stroke={hairDark} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <ellipse cx="89" cy="143" rx="7" ry="4.2" fill="#e08080" opacity="0.35" />
            <ellipse cx="151" cy="143" rx="7" ry="4.2" fill="#e08080" opacity="0.35" />
            <path d="M115 146q5 4 10 0" stroke="#8c4b45" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>

          <HairFront style={look.hairStyle} hair={`url(#hair-${uid})`} hairDark={hairDark} />

          <Accessory type={look.accessory} trim={cloth.trim} />
        </g>
      </g>

      {level >= 10 ? (
        <g opacity={level >= 25 ? 0.85 : 0.55}>
          <path d="M28 60l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#e3c27a" />
          <path d="M210 92l2.2 5 5 2.2-5 2.2-2.2 5-2.2-5-5-2.2 5-2.2z" fill="#cfa960" />
        </g>
      ) : null}
    </svg>
  );
}

function HairBack({ style, hair, hairDark }: { style: string; hair: string; hairDark: string }) {
  switch (style) {
    case 'long':
      return <path d="M70 128q-4 70 8 92l84 0q12-22 8-92-10-52-50-52t-50 52z" fill={hairDark} />;
    case 'bob':
      return <path d="M70 130q-3 42 10 50 40 12 80 0 13-8 10-50-10-46-50-46t-50 46z" fill={hairDark} />;
    case 'braids':
      return (
        <g>
          <path d="M74 122q-8 54 2 84l10-4q-8-34-2-78z" fill={hairDark} />
          <path d="M166 122q8 54-2 84l-10-4q8-34 2-78z" fill={hairDark} />
        </g>
      );
    case 'ponytail':
      return <path d="M154 108q34 10 26 56-5 26-22 34l-6-14q16-12 16-32 0-18-18-28z" fill={hairDark} />;
    case 'bun':
      return <circle cx="120" cy="72" r="20" fill={hairDark} />;
    default:
      return null;
  }
}

function HairFront({ style, hair, hairDark }: { style: string; hair: string; hairDark: string }) {
  return (
    <g>
      <path d="M73 125q-2-52 47-54 49 2 47 54-6-20-18-26-10 16-28 18-22-4-34-16-10 10-14 24z" fill={hair} />
      {style === 'short' ? <path d="M75 122q-4-30 12-42 2 22-2 44z" fill={hair} /> : null}
      {style === 'bob' ? <path d="M71 124q-4 30 6 40 8-26 6-48zM169 124q4 30-6 40-8-26-6-48z" fill={hair} /> : null}
      {style === 'long' ? <path d="M68 126q-2 44 6 58 8-32 4-66zM172 126q2 44-6 58-8-32-4-66z" fill={hairDark} /> : null}
      {style === 'ponytail' ? <path d="M154 104q16 2 18 16-10-6-20-4z" fill={hairDark} /> : null}
      {style === 'braids' ? (
        <g fill="none" stroke={hairDark} strokeWidth="4" strokeLinecap="round">
          <path d="M82 148q-6 22 0 44" />
          <path d="M158 148q6 22 0 44" />
          <circle cx="82" cy="194" r="3.5" fill="#cfa960" stroke="none" />
          <circle cx="158" cy="194" r="3.5" fill="#cfa960" stroke="none" />
        </g>
      ) : null}
      {style === 'bun' ? <path d="M80 116q6-26 24-32-12 14-16 34z" fill={hairDark} /> : null}
    </g>
  );
}

function Outfit({ type, cloth, trim, skin }: { type: string; cloth: string; trim: string; skin: string }) {
  const common = (
    <>
      <path d="M88 182q32 16 64 0l14 20-8 46H82l-8-46z" fill={cloth} />
      <path d="M92 182l28 14 28-14" fill="none" stroke={trim} strokeWidth="2" opacity="0.65" />
    </>
  );

  switch (type) {
    case 'robe':
      return (
        <g>
          <path d="M88 182q32 16 64 0l18 26-10 50H80l-10-50z" fill={cloth} />
          <path d="M120 196v62" stroke={trim} strokeWidth="3" opacity="0.7" />
          <path d="M88 182l20 12-8 64-20-4z" fill="#ffffff" opacity="0.04" />
          <path d="M104 176q16 10 32 0v8q-16 8-32 0z" fill={skin} />
        </g>
      );
    case 'armor':
      return (
        <g>
          {common}
          <path d="M96 188q24 12 48 0l6 16q-30 12-60 0z" fill="#8d97a6" />
          <path d="M120 196v50" stroke="#5b6472" strokeWidth="2" />
          <circle cx="120" cy="210" r="4" fill={trim} />
          <path d="M82 184q-10 2-12 12l10 12 8-20zM158 184q10 2 12 12l-10 12-8-20z" fill="#a5aebb" />
        </g>
      );
    case 'hoodie':
      return (
        <g>
          <path d="M92 186q28 12 56 0l12 18-8 44H88l-8-44z" fill={cloth} />
          <path d="M94 184q26 22 52 0-4 20-26 22-22-2-26-22z" fill={trim} opacity="0.35" />
          <path d="M108 200v14M132 200v14" stroke={trim} strokeWidth="2" strokeLinecap="round" />
          <path d="M100 230h40v12h-40z" fill="#000" opacity="0.18" />
        </g>
      );
    case 'coat':
      return (
        <g>
          {common}
          <path d="M84 186l-10 62h16l8-52zM156 186l10 62h-16l-8-52z" fill={trim} opacity="0.28" />
          <path d="M120 196v52" stroke="#0b0d12" strokeWidth="2" opacity="0.5" />
          <path d="M108 174l12 14 12-14-6-6h-12z" fill={trim} opacity="0.6" />
        </g>
      );
    default:
      return (
        <g>
          {common}
          <path d="M88 226q32 10 64 0v8q-32 10-64 0z" fill={trim} opacity="0.8" />
          <rect x="114" y="224" width="12" height="10" rx="2" fill="#cfa960" />
        </g>
      );
  }
}

function Accessory({ type, trim }: { type: string; trim: string }) {
  switch (type) {
    case 'glasses':
      return (
        <g fill="none" stroke="#c8cfda" strokeWidth="2">
          <rect x="91" y="121" width="20" height="17" rx="6" />
          <rect x="129" y="121" width="20" height="17" rx="6" />
          <path d="M111 129h18" />
        </g>
      );
    case 'circlet':
      return (
        <g>
          <path d="M78 109q42-18 84 0" fill="none" stroke="#cfa960" strokeWidth="2.5" />
          <path d="M120 96l5 8-5 8-5-8z" fill="#e3c27a" />
        </g>
      );
    case 'headset':
      return (
        <g>
          <path d="M72 124q-2-44 48-46 50 2 48 46" fill="none" stroke="#2b3342" strokeWidth="5" />
          <rect x="64" y="120" width="14" height="24" rx="6" fill={trim} />
          <rect x="162" y="120" width="14" height="24" rx="6" fill={trim} />
          <path d="M156 146q-4 12-18 14" fill="none" stroke={trim} strokeWidth="2.5" />
          <circle cx="138" cy="160" r="3" fill={trim} />
        </g>
      );
    default:
      return null;
  }
}

function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const SPARKS: Array<[number, number, number, number]> = [
  [36, 74, 1.6, 0.5],
  [58, 42, 1.1, 0.35],
  [190, 58, 1.8, 0.45],
  [204, 136, 1.2, 0.3],
  [30, 172, 1.4, 0.35],
  [214, 204, 1.5, 0.4],
  [24, 120, 1, 0.25],
  [170, 36, 1.3, 0.3],
];
