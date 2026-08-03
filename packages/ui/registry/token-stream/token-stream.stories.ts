/**
 * aihu-token-stream recipe stories (performativeUI port, Slice 4). Mandated
 * set for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-token-stream.aihu'

export default {
  title: 'UI/Token-stream',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string =>
    `<aihu-token-stream text="Reading the whole codebase in under a second." interval="60"></aihu-token-stream>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      <aihu-token-stream text="Reading the whole codebase in under a second." loop="off"></aihu-token-stream>
      <aihu-token-stream text="Reading the whole codebase in under a second." loop="on"></aihu-token-stream>
    </div>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-token-stream text="Reading the whole codebase in under a second." interval="60"></aihu-token-stream>`,
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string =>
    `<aihu-token-stream text="Reading the whole codebase in under a second." interval="60"></aihu-token-stream>`,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
