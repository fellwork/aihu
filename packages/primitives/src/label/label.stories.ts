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

defineLabel('demo-label') // module-level; registration is guarded

export default {
  title: 'Primitives/Label',
  tags: ['autodocs', 'headless', 'phase-2', 'apg-label'],
}

export const Default = {
  render: (): string => `
    <div>
      <demo-label for="default-input">Name</demo-label>
      <input id="default-input" type="text" />
    </div>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <demo-label for="states-text">Text control</demo-label>
        <input id="states-text" type="text" />
      </div>
      <div>
        <demo-label for="states-box">Custom checkbox</demo-label>
        <div id="states-box" role="checkbox" aria-checked="false" tabindex="0"></div>
      </div>
      <div>
        <demo-label for="states-disabled">Disabled control</demo-label>
        <input id="states-disabled" type="text" disabled />
      </div>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const labels = Array.from(canvasElement.querySelectorAll('demo-label'))
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
      <demo-label for="forward-input">Click me to focus the input</demo-label>
      <input id="forward-input" type="text" />
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const label = canvasElement.querySelector('demo-label') as HTMLElement
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
      <demo-label for="dark-input">Name</demo-label>
      <input id="dark-input" type="text" />
    </div>`,
  globals: { mode: 'dark' },
}
