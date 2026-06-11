/**
 * WAI-ARIA APG **Separator** conformance test (jsdom, static variant).
 * Asserts the contract from
 * https://www.w3.org/WAI/ARIA/apg/patterns/separator/ :
 *   - role=separator on a non-decorative host
 *   - aria-orientation=vertical when vertical; omitted when horizontal
 *     (horizontal is the ARIA default)
 *   - decorative separators are removed from the accessibility tree
 *   - the static variant is not focusable
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { type AihuSeparator, defineSeparator } from './index.ts'

defineSeparator()

describe('APG conformance — Separator (static)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('a non-decorative separator has role=separator', () => {
    document.body.innerHTML = '<aihu-separator></aihu-separator>'
    const sep = document.querySelector('aihu-separator') as AihuSeparator
    expect(sep.getAttribute('role')).toBe('separator')
  })

  it('a consumer-supplied role is respected', () => {
    document.body.innerHTML = '<aihu-separator role="presentation"></aihu-separator>'
    const sep = document.querySelector('aihu-separator') as AihuSeparator
    expect(sep.getAttribute('role')).toBe('presentation')
  })

  it('aria-orientation appears only for the non-default (vertical) orientation', () => {
    document.body.innerHTML = `
      <aihu-separator orientation="horizontal"></aihu-separator>
      <aihu-separator orientation="vertical"></aihu-separator>`
    const [horizontal, vertical] = Array.from(document.querySelectorAll('aihu-separator'))
    expect(horizontal.getAttribute('aria-orientation')).toBeNull()
    expect(vertical.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('a decorative separator exposes role=none', () => {
    document.body.innerHTML = '<aihu-separator decorative></aihu-separator>'
    const sep = document.querySelector('aihu-separator') as AihuSeparator
    expect(sep.getAttribute('role')).toBe('none')
  })

  it('the static separator is not in the tab sequence', () => {
    document.body.innerHTML = '<aihu-separator></aihu-separator>'
    const sep = document.querySelector('aihu-separator') as AihuSeparator
    expect(sep.hasAttribute('tabindex')).toBe(false)
    expect((sep as HTMLElement).tabIndex).toBe(-1)
  })
})
