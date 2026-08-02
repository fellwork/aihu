/**
 * aihu-ascii-hero recipe stories (performativeUI port, Slice 10).
 * Mandated set for a presentational recipe with a variant matrix and no
 * interactive capabilities: Default, DarkMode, Variants (`mode` is declared
 * in meta.json — it is `useCharacterField`'s closed animation enum, surfaced
 * as a prop). `ReducedMotion` added voluntarily, matching the convention every
 * other continuously-animating recipe in this port carries (floating-sparkles,
 * status-dot, word-roll, ...).
 *
 * This is a full-bleed `position: absolute` decorative layer with no slot —
 * every story wraps it in a sized, `position: relative` container so it has
 * somewhere to fill, per its own documented layout contract.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-ascii-hero.aihu'

export default {
  title: 'UI/Ascii-hero',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const STAGE = (inner: string): string => `
  <div style="position: relative; width: 100%; height: 260px; overflow: hidden; border-radius: 12px; background-color: var(--color-surface-foreground);">
    ${inner}
  </div>`

export const Default = {
  render: (): string => STAGE('<aihu-ascii-hero></aihu-ascii-hero>'),
}

export const DarkMode = {
  render: (): string => STAGE('<aihu-ascii-hero></aihu-ascii-hero>'),
  globals: { mode: 'dark' },
}

/** The `mode` axis. `reveal` is one-shot: it wipes in over ~1.5s and holds. */
export const Variants = {
  render: (): string => `
    <div style="display: grid; gap: 16px;">
      ${STAGE('<aihu-ascii-hero mode="drift"></aihu-ascii-hero>')}
      ${STAGE('<aihu-ascii-hero mode="pulse"></aihu-ascii-hero>')}
      ${STAGE('<aihu-ascii-hero mode="reveal"></aihu-ascii-hero>')}
    </div>`,
}

export const ReducedMotion = {
  render: (): string => STAGE('<aihu-ascii-hero></aihu-ascii-hero>'),
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}

/** A denser field over a different glyph set, with real hero copy stacked on
 * top — the layout contract this component documents. The stage's colors
 * carry explicit `var()` fallbacks: this recipe's `@style` references no
 * color tokens (the palette lives on the canvas, not in CSS), so the token
 * layer is not guaranteed to be emitted into an isolated story iframe, and
 * a half-resolved pair here would read as a contrast failure to axe. */
export const BehindHeroCopy = {
  render: (): string => `
  <div style="position: relative; width: 100%; height: 260px; overflow: hidden; border-radius: 12px; background-color: var(--color-surface-foreground, #1a1d24); display: grid; place-items: center;">
    <aihu-ascii-hero chars=".:*#" density="0.85" color="#5b7fa6"></aihu-ascii-hero>
    <h2 style="position: relative; z-index: 1; margin: 0; color: var(--color-surface, #faf8f4); font-family: var(--font-sans, sans-serif);">Compile the whole thing</h2>
  </div>`,
}
