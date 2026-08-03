/**
 * aihu-eyebrow-pill recipe stories (performativeUI port, Slice 1). Mandated
 * set for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-eyebrow-pill.aihu'
import '@storybook-recipes/aihu-status-dot.aihu'

export default {
  title: 'UI/Eyebrow-pill',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const TONES = ['neutral', 'accent', 'success', 'warning'] as const

// Default renders the intended composition — a status-dot in the `lead`
// slot — proving the `registryDependencies: ["status-dot"]` declaration
// (meta.json) actually resolves.
export const Default = {
  render: (): string => `
    <aihu-eyebrow-pill tone="accent">
      <aihu-status-dot slot="lead" status="online" size="sm" label=""></aihu-status-dot>
      New
    </aihu-eyebrow-pill>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      ${TONES.map((t) => `<aihu-eyebrow-pill tone="${t}">${t}</aihu-eyebrow-pill>`).join('\n      ')}
    </div>`,
}

export const DarkMode = {
  render: (): string => `
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      ${TONES.map((t) => `<aihu-eyebrow-pill tone="${t}">${t}</aihu-eyebrow-pill>`).join('\n      ')}
    </div>`,
  globals: { mode: 'dark' },
}
