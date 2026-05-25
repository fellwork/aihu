import { signal } from '@aihu/signals'
import {
  type AihuCodeElement,
  defineCodeElement,
  getAihuCodeElement,
} from '@aihu-plugin/kindly-note'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetHighlighterState } from '../src/highlight.ts'

beforeEach(() => {
  __resetHighlighterState()
})

/** Wait for the element's async highlight() to land (microtask + lazy import). */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

describe('<aihu-code> custom element', () => {
  it('defineCodeElement() registers the tag idempotently', () => {
    expect(defineCodeElement()).toBe('aihu-code')
    expect(defineCodeElement()).toBe('aihu-code') // second call is a no-op
    expect(customElements.get('aihu-code')).toBe(getAihuCodeElement())
  })

  it('renders highlighted markup from declarative attributes/text', async () => {
    defineCodeElement()
    const el = document.createElement('aihu-code')
    el.setAttribute('lang', 'json')
    el.textContent = '{"a": 1}'
    document.body.appendChild(el)

    await settle()

    const code = el.querySelector('code')
    expect(code).not.toBeNull()
    expect(code?.getAttribute('data-lang')).toBe('json')
    // The element sets innerHTML with the engine's escaped output; reading it
    // back via innerHTML normalizes `&quot;` → `"` inside element text (escaping
    // is only mandatory in attribute values), so assert on the normalized form.
    expect(code?.innerHTML).toContain('<span class="kn-attr">"a"</span>')
    expect(code?.innerHTML).toContain('<span class="kn-number">1</span>')

    el.remove()
  })

  it('re-highlights reactively when a signal-backed source changes', async () => {
    defineCodeElement()
    const [getCode, setCode] = signal('const a = 1')
    const el = document.createElement('aihu-code') as AihuCodeElement
    el.language = 'typescript'
    el.code = getCode // pass the signal reader → element subscribes
    document.body.appendChild(el)

    await settle()
    const code = el.querySelector('code')
    expect(code?.innerHTML).toContain('<span class="kn-keyword">const</span>')

    // Mutate the signal — the element's effect re-runs and re-highlights.
    setCode('let b = 2')
    await settle()
    expect(code?.innerHTML).toContain('<span class="kn-keyword">let</span>')
    expect(code?.innerHTML).not.toContain('const')

    el.remove()
  })

  it('shows escaped plain text (no spans) for an unknown language', async () => {
    defineCodeElement()
    const el = document.createElement('aihu-code') as AihuCodeElement
    el.language = 'nope-not-real'
    el.code = 'x < y'
    document.body.appendChild(el)

    await settle()
    const code = el.querySelector('code')
    expect(code?.querySelector('span')).toBeNull()
    expect(code?.textContent).toBe('x < y')

    el.remove()
  })
})
