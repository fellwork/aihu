/**
 * aihu-wibbling-spinner recipe stories (performativeUI port, Slice 4).
 * Mandated set for a presentational recipe with a variant matrix and no
 * interactive capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-wibbling-spinner.aihu'

export default {
  title: 'UI/Wibbling-spinner',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string => `<aihu-wibbling-spinner></aihu-wibbling-spinner>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; gap: 1rem; align-items: center;">
      <aihu-wibbling-spinner size="sm"></aihu-wibbling-spinner>
      <aihu-wibbling-spinner size="md"></aihu-wibbling-spinner>
      <aihu-wibbling-spinner size="lg"></aihu-wibbling-spinner>
      <aihu-wibbling-spinner tone="accent"></aihu-wibbling-spinner>
    </div>`,
}

export const DarkMode = {
  render: (): string => `<aihu-wibbling-spinner tone="accent"></aihu-wibbling-spinner>`,
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string => `<aihu-wibbling-spinner tone="accent"></aihu-wibbling-spinner>`,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
