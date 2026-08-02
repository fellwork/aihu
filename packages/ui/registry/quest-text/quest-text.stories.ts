/**
 * aihu-quest-text recipe stories (performativeUI port, Slice 2). Mandated
 * set for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-quest-text.aihu'

export default {
  title: 'UI/Quest-text',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string =>
    `<p style="font-size: 1.25rem;">What do you want to <aihu-quest-text tone="accent" caret="on">build</aihu-quest-text> today?</p>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 1.25rem;">
      <p>Emphasis in <aihu-quest-text tone="neutral">neutral</aihu-quest-text> tone.</p>
      <p>Emphasis in <aihu-quest-text tone="accent">accent</aihu-quest-text> tone.</p>
      <p>With a <aihu-quest-text caret="on">blinking caret</aihu-quest-text>.</p>
    </div>`,
}

export const DarkMode = {
  render: (): string =>
    `<p style="font-size: 1.25rem;">What do you want to <aihu-quest-text tone="accent" caret="on">build</aihu-quest-text> today?</p>`,
  globals: { mode: 'dark' },
}
