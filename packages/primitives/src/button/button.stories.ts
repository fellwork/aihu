/**
 * Storybook stub for `button` (Plan 6 wires the Storybook app). Authored stub
 * only — NOT a Storybook build. Plan 5 recipes register the concrete
 * `<aihu-button>` that extends this headless base.
 */
import { defineButton } from './index.ts'

export default {
  title: 'Primitives/Button',
  tags: ['headless', 'phase-1', 'apg-button'],
}

export const Headless = {
  render: (): string => {
    defineButton('demo-button')
    return `<demo-button>Click me</demo-button>`
  },
}

export const Toggle = {
  render: (): string => {
    defineButton('demo-toggle')
    return `<demo-toggle pressed="false">Mute</demo-toggle>`
  },
}
