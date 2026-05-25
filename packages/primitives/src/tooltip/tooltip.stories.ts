/**
 * Storybook stub for `tooltip` (Plan 6 wires the Storybook app). Authored stub
 * only — NOT a Storybook build.
 */
import { defineTooltip } from './index.ts'

export default {
  title: 'Primitives/Tooltip',
  tags: ['headless', 'phase-1', 'apg-tooltip'],
}

export const Default = {
  render: (): string => {
    defineTooltip()
    return `<aihu-tooltip-root placement="top">
  <aihu-tooltip-trigger tabindex="0">Hover me</aihu-tooltip-trigger>
  <aihu-tooltip-content>Helpful hint</aihu-tooltip-content>
</aihu-tooltip-root>`
  },
}
