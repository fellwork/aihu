/**
 * Storybook stub for `form-control` (Plan 6 wires the Storybook app). Authored
 * stub only — NOT a Storybook build.
 */
import { defineFormControl } from './index.ts'

export default {
  title: 'Primitives/FormControl',
  tags: ['headless', 'phase-0'],
}

export const Default = {
  render: (): string => {
    defineFormControl()
    return `<aihu-form-control required>
  <label data-fc-label>Email</label>
  <input data-fc-control type="email" />
  <span data-fc-error>Required</span>
</aihu-form-control>`
  },
}
