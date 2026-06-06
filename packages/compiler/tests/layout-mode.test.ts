/**
 * Unit tests for layout-mode compilation (v0.7.5 — runtime layout rendering).
 *
 * A layout SFC under the layouts dir is compiled with:
 *   1. a namespaced `aihu-layout-<stem>` tag (a bare stem like `app` is not a
 *      valid custom-element name), and
 *   2. a PASSIVE `<$outlet>` marker — the reactive route-driven boundary the
 *      codegen emits would clear the marker on mount under @aihu/app's
 *      imperative client renderer, wiping the page.
 *
 * These exercise the JS-side helpers in isolation, so they need no Rust binary.
 */

import { describe, expect, it } from 'vitest'
import { _isLayoutFile, _layoutTag, _passivizeOutlet } from '../js/index.ts'

// The exact reactive boundary the Rust codegen emits for `<$outlet>`
// (packages/compiler/src/codegen/emit.rs). Mirrored verbatim so the regex in
// _passivizeOutlet is tested against the real shape.
const COMPILED_LAYOUT = `import { branch, leaf, slot } from '@aihu/arbor'
import { effect } from '@aihu/signals'
import { defineComponent, defineElement, onMount, onCleanup } from '@aihu/runtime'
import * as __aihuRouter from '@aihu/router'

const createOutletBoundary = () => {
  const host = branch('div', { 'data-aihu-outlet': '' }, []);
  onMount(() => {
    const el = host && host.el;
    if (!el) return () => {};
    let cleanup = null;
    const stop = effect(() => {
      const m = __aihuRouter.useRoute();
      if (cleanup) { cleanup(); cleanup = null; }
      while (el.firstChild) el.removeChild(el.firstChild);
      if (!m) return;
    });
    return () => { if (cleanup) cleanup(); stop && stop(); };
  });
  return host;
};

defineElement('aihu-layout-app', defineComponent((_ctx) => {
  return branch('div', { class: 'app-shell' }, [
    branch('main', undefined, [createOutletBoundary()])
  ])
}))
`

describe('_isLayoutFile', () => {
  it('matches files under the default layouts dir', () => {
    expect(_isLayoutFile('/proj/src/layouts/app.aihu', 'src/layouts')).toBe(true)
  })

  it('matches a custom layouts dir', () => {
    expect(_isLayoutFile('/proj/layouts/admin.aihu', 'layouts')).toBe(true)
  })

  it('does not match pages or components', () => {
    expect(_isLayoutFile('/proj/src/pages/index.aihu', 'src/layouts')).toBe(false)
    expect(_isLayoutFile('/proj/src/components/card.aihu', 'src/layouts')).toBe(false)
  })

  it('normalizes a leading ./ and trailing slash in the dir option', () => {
    expect(_isLayoutFile('/proj/src/layouts/app.aihu', './src/layouts/')).toBe(true)
  })
})

describe('_layoutTag', () => {
  it('namespaces and lowercases the stem', () => {
    expect(_layoutTag('app')).toBe('aihu-layout-app')
    expect(_layoutTag('Admin')).toBe('aihu-layout-admin')
  })
})

describe('_passivizeOutlet', () => {
  it('collapses the reactive boundary into a passive marker', () => {
    const out = _passivizeOutlet(COMPILED_LAYOUT)
    expect(out).toContain(
      "const createOutletBoundary = () => branch('div', { 'data-aihu-outlet': '' }, []);",
    )
    // The route-driven machinery is gone — no useRoute()/effect() at runtime.
    expect(out).not.toMatch(/useRoute\(/)
    expect(out).not.toMatch(/\beffect\s*\(/)
    expect(out).not.toMatch(/onMount\(/)
    // The call site stays valid and the element still registers.
    expect(out).toContain('createOutletBoundary()')
    expect(out).toContain("defineElement('aihu-layout-app'")
  })

  it('is a no-op when the layout declares no <$outlet>', () => {
    const noOutlet = `import { branch, leaf } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('aihu-layout-bare', defineComponent((_ctx) => {
  return branch('div', { class: 'shell' }, [leaf('no outlet')])
}))
`
    expect(_passivizeOutlet(noOutlet)).toBe(noOutlet)
  })
})
