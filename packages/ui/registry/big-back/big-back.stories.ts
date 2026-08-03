/**
 * aihu-big-back recipe stories (performativeUI port, Slice 2). Mandated set
 * for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-big-back.aihu'

export default {
  title: 'UI/Big-back',
  tags: ['autodocs', 'recipe', 'phase-1'],
  parameters: {
    // Watermark text at 6% opacity is intentional, not a real contrast
    // defect — same precedent as UI/Gradient-text's DarkMode story.
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } },
  },
}

export const Default = {
  render: (): string => `<div style="overflow: hidden;"><aihu-big-back>AIHU</aihu-big-back></div>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 1rem; overflow: hidden;">
      <aihu-big-back weight="bold">AIHU</aihu-big-back>
      <aihu-big-back weight="black">AIHU</aihu-big-back>
    </div>`,
}

export const DarkMode = {
  render: (): string => `<div style="overflow: hidden;"><aihu-big-back>AIHU</aihu-big-back></div>`,
  globals: { mode: 'dark' },
}
