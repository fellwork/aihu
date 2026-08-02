/**
 * aihu-before-after recipe stories (performativeUI port, Slice 5, Phase-2 —
 * spec §10.2 set for an interactive keyboard-operable recipe: Default,
 * DarkMode, States, Focus, Disabled, KeyboardActivation).
 *
 * `<aihu-before-after>` COMPOSES `<aihu-slider-root>` as a child (see
 * before-after.aihu's header comment for the extend-vs-compose rationale) —
 * both must be imported here so the primitive's custom element registers.
 * `shadow: 'light'` means no real ShadowRoot boundary, so the composed
 * `<aihu-slider-root>` is reachable directly via a plain descendant query.
 *
 * These stories exercise REAL slider behavior (keyboard-driven divider
 * movement), not stubs — the whole point of building the primitive was a
 * genuinely keyboard-operable divider.
 *
 * NOT part of the registry payload (gen-registry excludes `*.stories.ts`).
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import '@storybook-recipes/aihu-before-after.aihu'

export default {
  title: 'UI/Before-after',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

// 1x1 solid-color data URIs — no network fetch needed in the Storybook canvas.
const BEFORE_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#7d5c1f"/></svg>',
  )
const AFTER_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#1e4d6b"/></svg>',
  )

const CARD = (attrs = ''): string => `
  <aihu-before-after ${attrs} style="width: 320px; height: 180px;">
    <img slot="before" src="${BEFORE_SRC}" alt="Before" />
    <img slot="after" src="${AFTER_SRC}" alt="After" />
  </aihu-before-after>`

export const Default = {
  render: (): string => CARD(),
}

export const DarkMode = {
  render: (): string => CARD(),
  globals: { mode: 'dark' },
}

export const States = {
  render: (): string => CARD('value="30"'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const handle = canvasElement.querySelector('aihu-slider-root') as HTMLElement
    await expect(handle).toHaveAttribute('role', 'slider')
    await expect(handle).toHaveAttribute('aria-valuenow', '30')
  },
}

export const Focus = {
  render: (): string => CARD(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const handle = canvasElement.querySelector('aihu-slider-root') as HTMLElement
    handle.focus()
    await expect(handle).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string => CARD('disabled'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const handle = canvasElement.querySelector('aihu-slider-root') as HTMLElement
    await expect(handle).toHaveAttribute('data-disabled')
    handle.focus()
    const before = handle.getAttribute('aria-valuenow')
    await userEvent.keyboard('{ArrowRight}')
    await expect(handle).toHaveAttribute('aria-valuenow', before ?? '50')
  },
}

export const KeyboardActivation = {
  render: (): string => CARD('value="50"'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const handle = canvasElement.querySelector('aihu-slider-root') as HTMLElement
    const afterLayer = canvasElement.querySelector('.aihu-before-after-after') as HTMLElement | null
    handle.focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(async () => {
      await expect(handle).toHaveAttribute('aria-valuenow', '51')
    })
    // The divider genuinely moves: the after-layer's clip-path reveal widens
    // in step with the slider's value (100 - value)% clipped from the right).
    if (afterLayer) {
      await waitFor(async () => {
        await expect(afterLayer.style.clipPath).toContain('49%')
      })
    }
    await userEvent.keyboard('{Home}')
    await waitFor(async () => {
      await expect(handle).toHaveAttribute('aria-valuenow', '0')
    })
  },
}
