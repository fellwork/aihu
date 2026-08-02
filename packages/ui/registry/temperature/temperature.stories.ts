/**
 * aihu-temperature recipe stories (Phase 2, performativeUI port Slice 7 —
 * spec §10.2 set mirroring the headless AihuRadioGroupRoot primitive's own
 * required set: Default, DarkMode, States, Focus, Disabled,
 * KeyboardActivation, FormParticipation, RTLBehavior).
 *
 * `<aihu-temperature>` EXTENDS `AihuRadioGroupRoot` and renders three FIXED
 * `<aihu-radio-group-item>` children (Precise / Balanced / Creative) — see
 * temperature.aihu's header comment for the "3-value preset, not a general
 * radio group" design decision. NOT part of the registry payload.
 */
import { expect, userEvent, waitFor } from 'storybook/test'

import '@storybook-recipes/aihu-temperature.aihu'

export default {
  title: 'UI/Temperature',
  tags: ['autodocs', 'recipe', 'phase-2'],
}

const TEMPERATURE = (attrs = 'default-value="balanced"'): string =>
  `<aihu-temperature aria-label="Response style" ${attrs}></aihu-temperature>`

export const Default = {
  render: (): string => TEMPERATURE(),
}

export const DarkMode = {
  render: (): string => TEMPERATURE(),
  globals: { mode: 'dark' },
}

export const States = {
  render: (): string => TEMPERATURE(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const root = canvasElement.querySelector('aihu-temperature') as HTMLElement
    const items = canvasElement.querySelectorAll('aihu-radio-group-item')
    await expect(root).toHaveAttribute('role', 'radiogroup')
    await expect(items).toHaveLength(3)
    const balanced = canvasElement.querySelector(
      'aihu-radio-group-item[value="balanced"]',
    ) as HTMLElement
    await expect(balanced).toHaveAttribute('aria-checked', 'true')
    await expect(balanced).toHaveAttribute('data-state', 'checked')
    const precise = canvasElement.querySelector(
      'aihu-radio-group-item[value="precise"]',
    ) as HTMLElement
    await expect(precise).toHaveAttribute('aria-checked', 'false')
  },
}

export const Focus = {
  render: (): string => TEMPERATURE(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    // Tab-stop-follows-checked: the selected item (balanced) carries the
    // roving tabindex="0" at rest, without a focus steal on mount.
    const balanced = canvasElement.querySelector(
      'aihu-radio-group-item[value="balanced"]',
    ) as HTMLElement
    await expect(balanced).toHaveAttribute('tabindex', '0')
    balanced.focus()
    await expect(balanced).toHaveFocus()
  },
}

export const Disabled = {
  render: (): string => TEMPERATURE('default-value="balanced" disabled'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const root = canvasElement.querySelector('aihu-temperature') as HTMLElement
    const creative = canvasElement.querySelector(
      'aihu-radio-group-item[value="creative"]',
    ) as HTMLElement
    await expect(root).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(creative)
    await expect(creative).toHaveAttribute('aria-checked', 'false')
  },
}

export const KeyboardActivation = {
  render: (): string => TEMPERATURE(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const balanced = canvasElement.querySelector(
      'aihu-radio-group-item[value="balanced"]',
    ) as HTMLElement
    const creative = canvasElement.querySelector(
      'aihu-radio-group-item[value="creative"]',
    ) as HTMLElement
    balanced.focus()
    // APG radio group: moving focus with arrows also selects.
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(async () => {
      await expect(creative).toHaveAttribute('aria-checked', 'true')
      await expect(creative).toHaveFocus()
    })
  },
}

export const FormParticipation = {
  render: (): string => `
    <form id="temperature-form">
      ${TEMPERATURE('name="temperature" default-value="precise"')}
    </form>`,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const form = canvasElement.querySelector('#temperature-form') as HTMLFormElement
    const data = new FormData(form)
    // The root-owned hidden radio submits the selected value under `name`.
    await expect(data.get('temperature')).toBe('precise')
  },
}

export const RTLBehavior = {
  render: (): string => TEMPERATURE('default-value="balanced" dir="rtl"'),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const balanced = canvasElement.querySelector(
      'aihu-radio-group-item[value="balanced"]',
    ) as HTMLElement
    const precise = canvasElement.querySelector(
      'aihu-radio-group-item[value="precise"]',
    ) as HTMLElement
    balanced.focus()
    // RTL flips the arrow-key direction: ArrowRight moves toward the START
    // (precise is the item BEFORE balanced in DOM order).
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(async () => {
      await expect(precise).toHaveAttribute('aria-checked', 'true')
      await expect(precise).toHaveFocus()
    })
  },
}
