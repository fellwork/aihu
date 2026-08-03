/**
 * aihu-sparkle recipe stories (performativeUI port, Slice 2). Mandated set
 * for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-sparkle.aihu'

export default {
  title: 'UI/Sparkle',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const SIZES = ['sm', 'md', 'lg'] as const

export const Default = {
  render: (): string => `<aihu-sparkle tone="accent" shimmer="on"></aihu-sparkle>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        ${SIZES.map((s) => `<aihu-sparkle size="${s}"></aihu-sparkle>`).join('\n        ')}
      </div>
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        <aihu-sparkle tone="neutral"></aihu-sparkle>
        <aihu-sparkle tone="accent"></aihu-sparkle>
      </div>
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        <aihu-sparkle shimmer="off"></aihu-sparkle>
        <aihu-sparkle shimmer="on"></aihu-sparkle>
      </div>
    </div>`,
}

export const DarkMode = {
  render: (): string => `<aihu-sparkle tone="accent" shimmer="on"></aihu-sparkle>`,
  globals: { mode: 'dark' },
}
