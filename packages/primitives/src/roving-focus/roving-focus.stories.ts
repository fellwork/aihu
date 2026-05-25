/**
 * Storybook stub for `roving-focus` (Plan 6 wires the Storybook app). Authored
 * stub only — NOT a Storybook build.
 */
import { defineRovingFocus } from './index.ts'

export default {
  title: 'Primitives/RovingFocus',
  tags: ['headless', 'phase-0'],
}

export const Toolbar = {
  render: (): string => {
    defineRovingFocus()
    return `<aihu-roving-focus orientation="horizontal" loop role="toolbar">
  <button>Bold</button>
  <button>Italic</button>
  <button>Underline</button>
</aihu-roving-focus>`
  },
}
