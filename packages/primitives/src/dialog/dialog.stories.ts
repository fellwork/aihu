/**
 * Storybook stub for `dialog` (Plan 6 wires the Storybook app). Authored stub
 * only — NOT a Storybook build.
 */
import { defineDialog } from './index.ts'

export default {
  title: 'Primitives/Dialog',
  tags: ['headless', 'phase-1', 'apg-dialog-modal'],
}

export const Modal = {
  render: (): string => {
    defineDialog()
    return `<aihu-dialog-root modal>
  <aihu-dialog-trigger>Open</aihu-dialog-trigger>
  <aihu-dialog-backdrop></aihu-dialog-backdrop>
  <aihu-dialog-content>
    <aihu-dialog-title>Title</aihu-dialog-title>
    <aihu-dialog-description>Body</aihu-dialog-description>
    <aihu-dialog-close>Close</aihu-dialog-close>
  </aihu-dialog-content>
</aihu-dialog-root>`
  },
}
