/**
 * aihu-status-dot recipe stories (performativeUI port, Slice 1). Mandated set
 * for a presentational recipe with a variant matrix and no interactive
 * capabilities: Default, Variants, DarkMode.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-status-dot.aihu'

export default {
  title: 'UI/Status-dot',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const STATUSES = ['neutral', 'online', 'busy', 'away', 'info', 'offline'] as const
const SIZES = ['sm', 'md', 'lg'] as const

export const Default = {
  render: (): string => `<aihu-status-dot status="online" label="Online"></aihu-status-dot>`,
}

export const Variants = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        ${STATUSES.map((s) => `<aihu-status-dot status="${s}" label="${s}"></aihu-status-dot>`).join('\n        ')}
      </div>
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        ${SIZES.map((s) => `<aihu-status-dot status="online" size="${s}" label="Online"></aihu-status-dot>`).join('\n        ')}
      </div>
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        <aihu-status-dot status="online" pulse="off" label="Online, no pulse"></aihu-status-dot>
        <aihu-status-dot status="online" pulse="on" label="Online, pulsing"></aihu-status-dot>
      </div>
    </div>`,
}

export const DarkMode = {
  render: (): string => `
    <div style="display: flex; gap: 0.75rem; align-items: center;">
      ${STATUSES.map((s) => `<aihu-status-dot status="${s}" label="${s}"></aihu-status-dot>`).join('\n      ')}
    </div>`,
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string =>
    `<aihu-status-dot status="online" pulse="on" label="Online, pulsing"></aihu-status-dot>`,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
