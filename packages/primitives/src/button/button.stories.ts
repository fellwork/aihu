/**
 * Headless button stories (Plan 6, spec §10.2 required set for an
 * interactive keyboard-operable primitive: Default, States, Hover, Focus,
 * Disabled, DarkMode, ClickFiresHandler, KeyboardActivation).
 *
 * Headless = zero CSS by contract; these stories assert BEHAVIOR (ARIA,
 * keyboard, state reflection), not appearance. Styled coverage lives in the
 * UI/Button recipe stories.
 */
import { expect, fn, userEvent } from 'storybook/test'

import { defineButton } from './index.ts'

defineButton('demo-button') // module-level; registration is guarded

export default {
  title: 'Primitives/Button',
  tags: ['autodocs', 'headless', 'phase-1', 'apg-button'],
}

export const Default = {
  render: (): string => `<demo-button>Click me</demo-button>`,
}

export const States = {
  render: (): string => `
    <div style="display: flex; gap: 1rem;">
      <demo-button>Idle</demo-button>
      <demo-button pressed="false">Toggle off</demo-button>
      <demo-button pressed="true">Toggle on</demo-button>
      <demo-button disabled>Disabled</demo-button>
    </div>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const [, off, on, disabled] = Array.from(canvasElement.querySelectorAll('demo-button'))
    await expect(off).toHaveAttribute('aria-pressed', 'false')
    await expect(on).toHaveAttribute('aria-pressed', 'true')
    await expect(disabled).toHaveAttribute('aria-disabled', 'true')
  },
}

export const Hover = {
  render: (): string => `<demo-button>Hover me</demo-button>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const el = canvasElement.querySelector('demo-button') as HTMLElement
    await userEvent.hover(el)
  },
}

export const Focus = {
  render: (): string => `<demo-button>Focus me</demo-button>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const el = canvasElement.querySelector('demo-button') as HTMLElement
    await expect(el).toHaveAttribute('tabindex', '0')
    el.focus()
    await expect(el).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string => `<demo-button disabled>Disabled</demo-button>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const el = canvasElement.querySelector('demo-button') as HTMLElement
    await expect(el).toHaveAttribute('aria-disabled', 'true')
    const onClick = fn()
    el.addEventListener('click', onClick)
    await userEvent.click(el)
    await expect(onClick).not.toHaveBeenCalled()
  },
}

export const DarkMode = {
  render: (): string => `<demo-button>Dark mode</demo-button>`,
  globals: { mode: 'dark' },
}

export const ClickFiresHandler = {
  render: (): string => `<demo-button>Fire</demo-button>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const el = canvasElement.querySelector('demo-button') as HTMLElement
    const onClick = fn()
    el.addEventListener('click', onClick)
    await userEvent.click(el)
    await expect(onClick).toHaveBeenCalledOnce()
  },
}

export const KeyboardActivation = {
  render: (): string => `<demo-button>Enter / Space</demo-button>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const el = canvasElement.querySelector('demo-button') as HTMLElement
    const onClick = fn()
    el.addEventListener('click', onClick)
    el.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    // APG Button: both Enter and Space activate a non-native button host.
    await expect(onClick).toHaveBeenCalledTimes(2)
  },
}
