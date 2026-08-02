/**
 * aihu-chat-bubble recipe stories (performativeUI port, Slice 5). Mandated
 * set for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, DarkMode, Variants.
 *
 * NOT part of the registry payload (gen-registry excludes `*.stories.ts`).
 */
import '@storybook-recipes/aihu-chat-bubble.aihu'

export default {
  title: 'UI/Chat-bubble',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

export const Default = {
  render: (): string =>
    `<aihu-chat-bubble avatar="AI">How can I help you today?</aihu-chat-bubble>`,
}

export const DarkMode = {
  render: (): string =>
    `<aihu-chat-bubble avatar="AI">How can I help you today?</aihu-chat-bubble>`,
  globals: { mode: 'dark' },
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
      <aihu-chat-bubble role="assistant" avatar="AI">How can I help you today?</aihu-chat-bubble>
      <aihu-chat-bubble role="user" avatar="SM">Port the marketing catalog into aihu.</aihu-chat-bubble>
    </div>`,
}
