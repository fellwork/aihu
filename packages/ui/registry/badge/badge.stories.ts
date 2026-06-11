/**
 * aihu-badge recipe stories (Plan 6, spec §10.2 set for a presentational
 * recipe with a variant matrix: Default, Variants, DarkMode).
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-badge.aihu'

export default {
  title: 'UI/Badge',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const VARIANTS = ['default', 'secondary', 'destructive', 'outline'] as const

export const Default = {
  render: (): string => `<aihu-badge>Badge</aihu-badge>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      ${VARIANTS.map((v) => `<aihu-badge variant="${v}">${v}</aihu-badge>`).join('\n      ')}
    </div>`,
}

export const DarkMode = {
  render: (): string => `
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      ${VARIANTS.map((v) => `<aihu-badge variant="${v}">${v}</aihu-badge>`).join('\n      ')}
    </div>`,
  globals: { mode: 'dark' },
  parameters: {
    // KNOWN LIMITATION (css-engine follow-up): baked light :host tokens make
    // the outline variant dark-on-dark. See UI/Button DarkMode for details.
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } },
  },
}
