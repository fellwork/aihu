/**
 * aihu-sticky-banner recipe stories (performativeUI port, Slice 2). Mandated
 * set for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-sticky-banner.aihu'

export default {
  title: 'UI/Sticky-banner',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const TONES = ['neutral', 'accent', 'warning'] as const

export const Default = {
  render: (): string =>
    `<aihu-sticky-banner tone="accent">We just shipped something new.</aihu-sticky-banner>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      ${TONES.map((t) => `<aihu-sticky-banner tone="${t}">${t} banner</aihu-sticky-banner>`).join('\n      ')}
    </div>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-sticky-banner tone="accent">We just shipped something new.</aihu-sticky-banner>`,
  globals: { mode: 'dark' },
}
