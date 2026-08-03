/**
 * aihu-gradient-text recipe stories (performativeUI port, Slice 1). Mandated
 * set for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-gradient-text.aihu'

export default {
  title: 'UI/Gradient-text',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const WEIGHTS = ['normal', 'medium', 'semibold', 'bold'] as const
const FONTS = ['sans', 'serif'] as const

export const Default = {
  render: (): string =>
    `<aihu-gradient-text style="font-size: 2rem;">Gradient heading</aihu-gradient-text>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 1.5rem;">
      ${WEIGHTS.map((w) => `<aihu-gradient-text weight="${w}">Weight ${w}</aihu-gradient-text>`).join('\n      ')}
      ${FONTS.map((f) => `<aihu-gradient-text font="${f}">Font ${f}</aihu-gradient-text>`).join('\n      ')}
    </div>`,
  parameters: {
    // Gradient-fill text computes to `color: transparent` — expected, not a
    // real contrast defect (badge/UI/Button DarkMode set the same precedent
    // for their own known baked-token limitation).
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } },
  },
}

export const DarkMode = {
  render: (): string =>
    `<aihu-gradient-text style="font-size: 2rem;">Gradient heading</aihu-gradient-text>`,
  globals: { mode: 'dark' },
  parameters: {
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } },
  },
}
