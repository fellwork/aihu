/**
 * aihu-floating-sparkles recipe stories (performativeUI port, Slice 9).
 * Mandated set for a presentational recipe with no variant matrix and no
 * interactive capabilities: Default, DarkMode. `ReducedMotion` added
 * voluntarily, matching the convention every other continuously-animating
 * recipe in this port carries (status-dot, word-roll, stat-counter, ...).
 *
 * This is a full-bleed `position: absolute` decorative layer with no slot —
 * every story wraps it in a sized, `position: relative` container so it has
 * somewhere to fill, per its own documented layout contract.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-floating-sparkles.aihu'

export default {
  title: 'UI/Floating-sparkles',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const STAGE = (inner: string): string => `
  <div style="position: relative; width: 100%; height: 260px; overflow: hidden; border-radius: 12px; background-color: var(--color-surface-foreground);">
    ${inner}
  </div>`

export const Default = {
  render: (): string => STAGE('<aihu-floating-sparkles></aihu-floating-sparkles>'),
}

export const DarkMode = {
  render: (): string => STAGE('<aihu-floating-sparkles></aihu-floating-sparkles>'),
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string => STAGE('<aihu-floating-sparkles></aihu-floating-sparkles>'),
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
