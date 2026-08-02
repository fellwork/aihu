/**
 * aihu-prompt recipe stories (performativeUI port, Slice 5). Mandated set for
 * a presentational recipe with no variant matrix and no interactive
 * capabilities: Default, DarkMode.
 *
 * NOT part of the registry payload (gen-registry excludes `*.stories.ts`).
 */
import '@storybook-recipes/aihu-prompt.aihu'

export default {
  title: 'UI/Prompt',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string =>
    `<aihu-prompt placeholder="Ask anything about your codebase..."></aihu-prompt>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-prompt placeholder="Ask anything about your codebase..."></aihu-prompt>`,
  globals: { mode: 'dark' },
}
