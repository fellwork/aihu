/**
 * Storybook stub for `presence-gate` (Plan 6 wires the Storybook app + the
 * required-story CI gate; this is the authored stub only — NOT a Storybook
 * build). Kept framework-agnostic so Plan 6 can adopt CSF without churn.
 */
import { definePresenceGate } from './index.ts'

export default {
  title: 'Primitives/PresenceGate',
  tags: ['headless', 'phase-0'],
}

export const Default = {
  render: (): string => {
    definePresenceGate()
    return `<aihu-presence-gate present><p>content held until exit animation ends</p></aihu-presence-gate>`
  },
}
