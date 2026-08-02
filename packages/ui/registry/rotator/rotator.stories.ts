/**
 * aihu-rotator recipe stories (performativeUI port, Slice 4). Mandated set
 * for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-rotator.aihu'

export default {
  title: 'UI/Rotator',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string => `<aihu-rotator items="Design,Build,Ship" interval="1500"></aihu-rotator>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      <aihu-rotator items="Design,Build,Ship" tone="neutral"></aihu-rotator>
      <aihu-rotator items="Design,Build,Ship" tone="accent"></aihu-rotator>
    </div>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-rotator items="Design,Build,Ship" interval="1500" tone="accent"></aihu-rotator>`,
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string =>
    `<aihu-rotator items="Design,Build,Ship" interval="1500" tone="accent"></aihu-rotator>`,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
