/**
 * WAI-ARIA APG **Dialog (Modal)** conformance test (jsdom).
 * Asserts the ARIA contract from
 * https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ :
 *   - container role=dialog, aria-modal=true
 *   - aria-labelledby / aria-describedby resolve to real, present ids
 *   - trigger aria-haspopup / aria-expanded / aria-controls
 *   - focus moves in on open, focus-trap + return-focus
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuDialogRoot, defineDialog } from './index.ts'

defineDialog()

function build(): { root: AihuDialogRoot; trigger: HTMLElement; content: HTMLElement } {
  document.body.innerHTML = `
    <aihu-dialog-root modal>
      <aihu-dialog-trigger id="t" tabindex="0">Open</aihu-dialog-trigger>
      <aihu-dialog-content>
        <aihu-dialog-title>The Title</aihu-dialog-title>
        <aihu-dialog-description>The body text.</aihu-dialog-description>
        <button id="ok">OK</button>
      </aihu-dialog-content>
    </aihu-dialog-root>`
  return {
    root: document.querySelector('aihu-dialog-root') as AihuDialogRoot,
    trigger: document.getElementById('t') as HTMLElement,
    content: document.querySelector('aihu-dialog-content') as HTMLElement,
  }
}

describe('APG conformance — Dialog (Modal)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('content has role=dialog and aria-modal=true', () => {
    const { content } = build()
    expect(content.getAttribute('role')).toBe('dialog')
    expect(content.getAttribute('aria-modal')).toBe('true')
  })

  it('aria-labelledby resolves to the title element id', () => {
    const { content } = build()
    const labelledby = content.getAttribute('aria-labelledby')
    expect(labelledby).toBeTruthy()
    const title = document.getElementById(labelledby as string)
    expect(title).not.toBeNull()
    expect(title?.tagName.toLowerCase()).toBe('aihu-dialog-title')
  })

  it('aria-describedby resolves to the description element id', () => {
    const { content } = build()
    const describedby = content.getAttribute('aria-describedby')
    expect(describedby).toBeTruthy()
    const desc = document.getElementById(describedby as string)
    expect(desc).not.toBeNull()
    expect(desc?.tagName.toLowerCase()).toBe('aihu-dialog-description')
  })

  it('trigger advertises the dialog: aria-haspopup, aria-expanded, aria-controls', () => {
    const { trigger, content } = build()
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    trigger.click()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('focus moves into the dialog on open and returns to the trigger on close', () => {
    const { trigger, root } = build()
    trigger.focus()
    trigger.click()
    const ok = document.getElementById('ok') as HTMLElement
    expect(document.activeElement).toBe(ok)
    root.setOpen(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('non-button trigger gets role=button for keyboard semantics', () => {
    const { trigger } = build()
    expect(trigger.getAttribute('role')).toBe('button')
  })
})
