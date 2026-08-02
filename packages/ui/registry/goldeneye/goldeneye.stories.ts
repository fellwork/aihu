/**
 * aihu-goldeneye recipe stories (performativeUI port, Slice 11 — Tier-C
 * tail). Mandated set for a presentational recipe with no variant matrix and
 * no interactive capabilities: Default, DarkMode. `ReducedMotion` added
 * voluntarily, matching the convention every other continuously-animating
 * recipe in this port carries (floating-sparkles, node-graph-background,
 * status-dot, word-roll, ...).
 *
 * This is a full-bleed `position: absolute` decorative layer with no slot —
 * every story wraps it in a sized, `position: relative` container so it has
 * somewhere to fill, per its own documented layout contract.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-goldeneye.aihu'

export default {
  title: 'UI/Goldeneye',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const STAGE = (inner: string): string => `
  <div style="position: relative; width: 100%; height: 260px; overflow: hidden; border-radius: 12px; background-color: var(--color-surface-foreground);">
    ${inner}
  </div>`

export const Default = {
  render: (): string => STAGE('<aihu-goldeneye></aihu-goldeneye>'),
}

export const DarkMode = {
  render: (): string => STAGE('<aihu-goldeneye></aihu-goldeneye>'),
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string => STAGE('<aihu-goldeneye></aihu-goldeneye>'),
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}

/** The three knobs that change the eye's character: iris/glow color, pupil
 * color, and sweep/pulse rate — a cooler, faster-scanning palette. */
export const CoolPalette = {
  render: (): string =>
    STAGE('<aihu-goldeneye color="#66b3d6" pupil-color="#0d1f2b" speed="2.4"></aihu-goldeneye>'),
}
