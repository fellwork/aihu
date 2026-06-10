/**
 * Headless label stories (Plan 6, spec §10.2). KeyboardActivation is n/a —
 * a label is not an interactive stop; activation flows to the control. The
 * required interaction coverage is ClickForwardsFocus instead.
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR
 * (association wiring + click forwarding), not appearance. Styled coverage
 * lives in the UI/Label recipe stories.
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import { defineLabel } from './index.ts'

defineLabel() // module-level; registration is guarded

export default {
  title: 'Primitives/Label',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-label'],
}

export const Default = {
  render: (): string => `
    <div>
      <aihu-label for="default-input">Name</aihu-label>
      <input id="default-input" type="text" />
    </div>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <aihu-label for="states-text">Text control</aihu-label>
        <input id="states-text" type="text" />
      </div>
      <div>
        <aihu-label for="states-box">Custom checkbox</aihu-label>
        <div id="states-box" role="checkbox" aria-checked="false" tabindex="0"></div>
      </div>
      <div>
        <aihu-label for="states-disabled">Disabled control</aihu-label>
        <input id="states-disabled" type="text" disabled />
      </div>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const labels = Array.from(canvasElement.querySelectorAll('aihu-label'))
    const box = canvasElement.querySelector('#states-box') as HTMLElement
    for (const label of labels) {
      await expect(label.id).toBeTruthy()
      await expect(label).toHaveAttribute('data-fc-label')
    }
    // Standalone association: the custom target carries aria-labelledby.
    await expect(box).toHaveAttribute('aria-labelledby', labels[1].id)
  },
}

export const ClickForwardsFocus = {
  render: (): string => `
    <div>
      <aihu-label for="forward-input">Click me to focus the input</aihu-label>
      <input id="forward-input" type="text" />
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const label = canvasElement.querySelector('aihu-label') as HTMLElement
    const input = canvasElement.querySelector('#forward-input') as HTMLInputElement
    await userEvent.click(label)
    await waitFor(async () => {
      await expect(input).toHaveFocus()
    })
  },
}

export const DarkMode = {
  render: (): string => `
    <div>
      <aihu-label for="dark-input">Name</aihu-label>
      <input id="dark-input" type="text" />
    </div>`,
  globals: { mode: 'dark' },
}
