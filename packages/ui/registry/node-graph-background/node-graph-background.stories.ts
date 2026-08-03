/**
 * aihu-node-graph-background recipe stories (performativeUI port, Slice 10).
 * Mandated set for a presentational recipe with no variant matrix and no
 * interactive capabilities: Default, DarkMode. `ReducedMotion` added
 * voluntarily, matching the convention every other continuously-animating
 * recipe in this port carries (floating-sparkles, status-dot, word-roll, ...).
 *
 * This is a full-bleed `position: absolute` decorative layer with no slot —
 * every story wraps it in a sized, `position: relative` container so it has
 * somewhere to fill, per its own documented layout contract.
 *
 * NOT part of the registry payload — gen-registry excludes `*.stories.ts`.
 */
import '@storybook-recipes/aihu-node-graph-background.aihu'

export default {
  title: 'UI/Node-graph-background',
  tags: ['autodocs', 'recipe', 'phase-1'],
}

const STAGE = (inner: string): string => `
  <div style="position: relative; width: 100%; height: 260px; overflow: hidden; border-radius: 12px; background-color: var(--color-surface-foreground);">
    ${inner}
  </div>`

export const Default = {
  render: (): string => STAGE('<aihu-node-graph-background></aihu-node-graph-background>'),
}

export const DarkMode = {
  render: (): string => STAGE('<aihu-node-graph-background></aihu-node-graph-background>'),
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: (): string => STAGE('<aihu-node-graph-background></aihu-node-graph-background>'),
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}

/** The two knobs that change the graph's character: node population and the
 * distance under which two of them are joined. */
export const DenseWeb = {
  render: (): string =>
    STAGE(
      '<aihu-node-graph-background count="80" connection-distance="90"></aihu-node-graph-background>',
    ),
}
