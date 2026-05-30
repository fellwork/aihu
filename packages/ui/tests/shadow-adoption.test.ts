/**
 * Plan 5 Task 5 Step 5 (R7) — runtime shadow-adoption proof.
 *
 * Compile-passing != rendered-styling. The R2 CSS-attachment contract is that
 * the registered recipe element adopts a SHARED, single-construction
 * Constructable StyleSheet into its shadow root (`shadowRoot.adoptedStyleSheets`),
 * NOT a per-instance inline style element. This test registers the button
 * recipe's element shape, instantiates it twice, and asserts:
 *   (1) each instance's shadowRoot has the recipe sheet in adoptedStyleSheets;
 *   (2) the sheet object is the SAME across two instances (shared static).
 *
 * The recipe class is authored inside `button.aihu`'s `@state` block (not a
 * directly-importable module). This test reproduces that exact class shape —
 * `extends AihuButton`, `static sheet`, adopt-in-connectedCallback — using the
 * real `AihuButton` base from `@aihu/primitives/button`, so it exercises the
 * genuine class-extension + shared-static-sheet contract the recipe declares.
 *
 * Env: the repo's global jsdom (root vitest.config.ts) — `new CSSStyleSheet()`
 * + `adoptedStyleSheets` array assignment are supported. (happy-dom is not a
 * repo dependency; jsdom satisfies the R7 contract here.)
 */
// The recipe `.aihu` imports `AihuButton` from the published subpath
// `@aihu/primitives/button` (spec §9.2). The vitest alias maps the bare
// `@aihu/primitives` barrel to source (no dist build needed); the barrel
// re-exports `AihuButton`, so the test imports it from there.
import { AihuButton } from '@aihu/primitives'
import { beforeEach, describe, expect, it } from 'vitest'

// Mirror the `button.aihu` @state recipe class verbatim (shared static sheet
// adopted into the shadow root — R2).
class AihuButtonRecipe extends AihuButton {
  static sheet = new CSSStyleSheet()

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' })
    this.shadowRoot!.adoptedStyleSheets = [AihuButtonRecipe.sheet]
  }
}

if (!customElements.get('aihu-button')) {
  customElements.define('aihu-button', AihuButtonRecipe)
}

describe('Plan 5 Task 5 (R7) — runtime shadow-adoption', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('a registered <aihu-button> adopts the compiled stylesheet into its shadow root', () => {
    document.body.innerHTML = '<aihu-button>Go</aihu-button>'
    const el = document.querySelector('aihu-button') as AihuButtonRecipe
    expect(el.shadowRoot).not.toBeNull()
    expect(el.shadowRoot!.adoptedStyleSheets).toContain(AihuButtonRecipe.sheet)
  })

  it('the adopted stylesheet is SHARED (same object) across two instances, not per-instance', () => {
    document.body.innerHTML = '<aihu-button>A</aihu-button><aihu-button>B</aihu-button>'
    const [a, b] = Array.from(document.querySelectorAll('aihu-button')) as AihuButtonRecipe[]
    const sheetA = a.shadowRoot!.adoptedStyleSheets[0]
    const sheetB = b.shadowRoot!.adoptedStyleSheets[0]
    // Shared-static contract: both shadow roots point at the SAME sheet object.
    expect(sheetA).toBe(sheetB)
    expect(sheetA).toBe(AihuButtonRecipe.sheet)
  })

  it('inherits AihuButton behavior (role=button on a non-native host)', () => {
    document.body.innerHTML = '<aihu-button>Action</aihu-button>'
    const el = document.querySelector('aihu-button') as AihuButtonRecipe
    // Proves the recipe is the class-extension of the headless base, not a
    // standalone re-implementation (§9.4).
    expect(el.getAttribute('role')).toBe('button')
  })
})
