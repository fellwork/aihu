/**
 * aihu-community-badge recipe stories (performativeUI port, Slice 2).
 * Mandated set for a presentational recipe with a variant matrix and no
 * interactive capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-community-badge.aihu'
import '@storybook-recipes/aihu-status-dot.aihu'

export default {
  title: 'UI/Community-badge',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

// Default renders the intended composition — a status-dot in the `lead`
// slot — proving the `registryDependencies: ["status-dot"]` declaration
// (meta.json) actually resolves, same as eyebrow-pill.
export const Default = {
  render: (): string => `
    <aihu-community-badge tone="accent">
      <aihu-status-dot slot="lead" status="online" size="sm" pulse="on" label=""></aihu-status-dot>
      1,204 builders online
    </aihu-community-badge>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      <aihu-community-badge tone="neutral">
        <aihu-status-dot slot="lead" status="neutral" size="sm" label=""></aihu-status-dot>
        Neutral
      </aihu-community-badge>
      <aihu-community-badge tone="accent">
        <aihu-status-dot slot="lead" status="online" size="sm" label=""></aihu-status-dot>
        Accent
      </aihu-community-badge>
    </div>`,
}

export const DarkMode = {
  render: (): string => `
    <aihu-community-badge tone="accent">
      <aihu-status-dot slot="lead" status="online" size="sm" pulse="on" label=""></aihu-status-dot>
      1,204 builders online
    </aihu-community-badge>`,
  globals: { mode: 'dark' },
}
