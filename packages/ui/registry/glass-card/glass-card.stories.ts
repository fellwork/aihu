/**
 * aihu-glass-card recipe stories (performativeUI port, Slice 5). Mandated set
 * for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, DarkMode, Variants.
 *
 * NOT part of the registry payload (gen-registry excludes `*.stories.ts`).
 */
import '@storybook-recipes/aihu-glass-card.aihu'

export default {
  title: 'UI/Glass-card',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const BODY = `
  <h3 style="margin: 0 0 0.5rem;">Frosted panel</h3>
  <p style="margin: 0;">Sits above a busy background wash without disappearing into it.</p>`

export const Default = {
  render: (): string => `<aihu-glass-card>${BODY}</aihu-glass-card>`,
}

export const DarkMode = {
  render: (): string => `<aihu-glass-card>${BODY}</aihu-glass-card>`,
  globals: { mode: 'dark' },
}

export const Variants = {
  render: (): string =>
    ['sm', 'md', 'lg']
      .map((padding) => `<aihu-glass-card padding="${padding}">${BODY}</aihu-glass-card>`)
      .join('<br/>'),
}
