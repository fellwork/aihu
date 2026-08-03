/**
 * aihu-slippy-words recipe stories (performativeUI port, Slice 4). Mandated
 * set for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-slippy-words.aihu'

export default {
  title: 'UI/Slippy-words',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string =>
    `<aihu-slippy-words text="Ship it before you overthink it" interval="500"></aihu-slippy-words>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      <aihu-slippy-words text="Ship it before you overthink it" tone="neutral"></aihu-slippy-words>
      <aihu-slippy-words text="Ship it before you overthink it" tone="accent"></aihu-slippy-words>
    </div>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-slippy-words text="Ship it before you overthink it" interval="500" tone="accent"></aihu-slippy-words>`,
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string =>
    `<aihu-slippy-words text="Ship it before you overthink it" interval="500" tone="accent"></aihu-slippy-words>`,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
