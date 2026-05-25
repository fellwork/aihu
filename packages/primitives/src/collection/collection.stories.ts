/**
 * Storybook stub for `collection` (Plan 6 wires the Storybook app). Authored
 * stub only — NOT a Storybook build.
 */
import { defineCollection } from './index.ts'

export default {
  title: 'Primitives/Collection',
  tags: ['headless', 'phase-0'],
}

export const Default = {
  render: (): string => {
    defineCollection()
    return `<aihu-collection>
  <div>item 1</div>
  <div>item 2</div>
  <div>item 3</div>
</aihu-collection>`
  },
}
