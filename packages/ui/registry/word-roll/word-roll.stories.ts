/**
 * aihu-word-roll recipe stories (performativeUI port, Slice 4). Mandated set
 * for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-word-roll.aihu'

export default {
  title: 'UI/Word-roll',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string =>
    `We ship <aihu-word-roll items="faster,smarter,together" interval="1400"></aihu-word-roll>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      We ship <aihu-word-roll items="faster,smarter,together" tone="neutral"></aihu-word-roll>
      We ship <aihu-word-roll items="faster,smarter,together" tone="accent"></aihu-word-roll>
    </div>`,
}

export const DarkMode = {
  render: (): string =>
    `We ship <aihu-word-roll items="faster,smarter,together" interval="1400" tone="accent"></aihu-word-roll>`,
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string =>
    `We ship <aihu-word-roll items="faster,smarter,together" interval="1400" tone="accent"></aihu-word-roll>`,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
