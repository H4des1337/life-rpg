// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterArt, APPEARANCE_OPTIONS, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS } from './CharacterArt';

describe('CharacterArt', () => {
  it('renders a deterministic original chibi SVG portrait', () => {
    const { container } = render(<CharacterArt />);
    const svg = screen.getByRole('img', { name: /Chibi character portrait at level 1/i });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 240 280');
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('path').length).toBeGreaterThan(10);
  });

  it('reflects level and appearance choices', () => {
    render(
      <CharacterArt
        level={27}
        appearance={{
          skinTone: 'deep',
          hairStyle: 'braids',
          hairColor: 'silver',
          outfit: 'coat',
          outfitColor: 'emerald',
          accessory: 'glasses',
          background: 'night',
        }}
      />,
    );
    const svg = screen.getByRole('img', { name: /level 27/i });
    expect(svg).toBeInTheDocument();
    expect(svg.innerHTML).toContain(SKIN_TONES.deep);
    expect(svg.innerHTML).toContain(HAIR_COLORS.silver);
    expect(svg.innerHTML).toContain(OUTFIT_COLORS.emerald.base);
  });

  it('falls back to known palette when appearance has unknown values', () => {
    const { container } = render(
      <CharacterArt
        appearance={{
          skinTone: 'unknown',
          hairStyle: 'unknown',
          hairColor: 'unknown',
          outfit: 'unknown',
          outfitColor: 'unknown',
          accessory: 'unknown',
          background: 'unknown',
        }}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.innerHTML).toContain(SKIN_TONES.warm);
    expect(container.innerHTML).toContain(HAIR_COLORS.brown);
    expect(container.innerHTML).toContain(OUTFIT_COLORS.midnight.base);
  });

  it('publishes the full customization option set', () => {
    expect(APPEARANCE_OPTIONS.hairStyle).toContain('braids');
    expect(APPEARANCE_OPTIONS.outfit).toContain('armor');
    expect(APPEARANCE_OPTIONS.accessory).toContain('glasses');
    expect(APPEARANCE_OPTIONS.background.length).toBeGreaterThanOrEqual(5);
  });
});
