/**
 * aihu-card recipe stories (Plan 6, spec §10.2 set for a presentational
 * recipe without a variant matrix: Default, DarkMode).
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-card.aihu'

export default {
  title: 'UI/Card',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const CARD = `
  <aihu-card style="max-width: 24rem;">
    <h3 slot="header" style="margin: 0;">Card title</h3>
    <p style="margin: 0;">Body content lives in the default slot. Header and
    footer project into named slots.</p>
    <span slot="footer">Footer</span>
  </aihu-card>`

export const Default = {
  render: (): string => CARD,
}

export const DarkMode = {
  render: (): string => CARD,
  globals: { mode: 'dark' },
}
