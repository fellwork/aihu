/**
 * aihu-prompt-hero recipe stories (performativeUI port, Slice 5). Mandated
 * set for a presentational recipe with no variant matrix and no interactive
 * capabilities: Default, DarkMode.
 *
 * Composes `aihu-gradient-text` + `aihu-prompt` (registryDependencies) —
 * both must be imported here for their custom elements to register, same as
 * the UI/Dialog stories importing every dialog piece.
 *
 * NOT part of the registry payload (gen-registry excludes `*.stories.ts`).
 */
import '@storybook-recipes/aihu-gradient-text.aihu'
import '@storybook-recipes/aihu-prompt.aihu'
import '@storybook-recipes/aihu-prompt-hero.aihu'

export default {
  title: 'UI/Prompt-hero',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string =>
    `<aihu-prompt-hero heading="Ask anything" placeholder="Ask anything about your codebase..."></aihu-prompt-hero>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-prompt-hero heading="Ask anything" placeholder="Ask anything about your codebase..."></aihu-prompt-hero>`,
  globals: { mode: 'dark' },
}
