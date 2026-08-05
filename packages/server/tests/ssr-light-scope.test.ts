// @vitest-environment node
/**
 * `SsrOptions.lightScopeId` — the server-side `data-a` stamp (LDF §10 step 3).
 *
 * A light-DOM component's `@style` compiles to `@scope([data-a="<id>"]) to
 * ([data-a])` blocks in the built stylesheet, and the client runtime stamps
 * `data-a` on the host at `connectedCallback`. Server-rendered HTML must carry
 * the SAME stamp on the component's root or none of that CSS matches the
 * prerendered markup until the component's chunk loads — measured on
 * apps/docs-next under Lighthouse's throttled profile, that unstyled first
 * paint pushed the LCP element below the fold and cost ~1.9s of LCP
 * (3430ms → 1470ms once stamped).
 *
 * These tests pin the walker's stamp: root element only, placed between the
 * static attrs and the `data-aihu-path` marker (the compiled string renderer's
 * `root_scope_attr` order — the differential suite holds the two paths
 * byte-identical), present in BOTH hydration modes, and absent entirely when
 * the option is not passed (byte-identical legacy output).
 */

import { branch, leaf } from '@aihu/arbor'
import { describe, expect, it } from 'vitest'
import { renderToString } from '../src/ssr.ts'

const tree = () =>
  branch('div', { class: 'shell' } as never, [branch('p', undefined, [leaf('hello')])] as never[])

describe('SsrOptions.lightScopeId — root data-a stamp', () => {
  it('stamps data-a on the ROOT element, between static attrs and the path marker', async () => {
    const html = await renderToString(tree, { hydratable: true, lightScopeId: 'a1b2c3d4' })
    expect(html).toContain('<div class="shell" data-a="a1b2c3d4" data-aihu-path="0">')
    // Root only — the child <p> carries its path marker but no data-a.
    expect(html).toContain('<p data-aihu-path="0.0">')
    expect(html.match(/ data-a="/g)).toHaveLength(1)
  })

  it('stamps in the non-hydratable variant too (the CSS must match regardless)', async () => {
    const html = await renderToString(tree, { lightScopeId: 'a1b2c3d4' })
    expect(html).toContain('<div class="shell" data-a="a1b2c3d4">')
    expect(html).not.toContain('data-aihu-path')
  })

  it('omitted option → byte-identical legacy output (no data-a anywhere)', async () => {
    const html = await renderToString(tree, { hydratable: true })
    expect(html).not.toContain('data-a=')
  })

  it('fragment-rooted tree has no root element to stamp — renders unstamped', async () => {
    const frag = () => branch('', undefined, [branch('p', undefined, [leaf('x')])] as never[])
    const html = await renderToString(frag, { hydratable: true, lightScopeId: 'a1b2c3d4' })
    expect(html).not.toContain('data-a=')
    expect(html).toContain('<p data-aihu-path="0.0">x</p>')
  })
})

// ─── wrapTag — rendering the component's own host element ────────────────────
//
// SSR renders a component's TEMPLATE, not the component: output is the
// template root while the client builds `document.createElement(tag)` and
// mounts the template inside it. The shapes never matched, so the client
// replaced the prerendered subtree instead of adopting it (measured on
// apps/docs: 0 of 391 nodes survived). `wrapTag` emits the host.

describe('renderToString — wrapTag', () => {
  const tree = () => ({
    kind: 'branch',
    tag: 'div',
    attrs: { class: 'shell' },
    children: [{ kind: 'leaf', leafKind: 'text', value: 'hi' }],
  })

  it('wraps the render in the component tag', async () => {
    const html = await renderToString(tree)
    expect(html).toBe('<div class="shell">hi</div>')

    const wrapped = await renderToString(tree, { wrapTag: 'aihu-layout-docs' })
    expect(wrapped).toBe('<aihu-layout-docs><div class="shell">hi</div></aihu-layout-docs>')
  })

  // The wrapper is the HOST, and the host is where the client stamps `data-a`
  // (define-element.ts, in the constructor). Stamping BOTH would make the
  // template root a nested scope root and cut the component's own rules off at
  // its first child, since `@scope … to ([data-a])` stops at the next stamp.
  it('moves the scope stamp onto the wrapper, leaving the template root bare', async () => {
    const html = await renderToString(tree, { wrapTag: 'aihu-layout-docs', lightScopeId: 'abc123' })
    expect(html).toBe(
      '<aihu-layout-docs data-a="abc123"><div class="shell">hi</div></aihu-layout-docs>',
    )
    // Exactly one stamp, on the host.
    expect(html.match(/data-a=/g)).toHaveLength(1)
  })

  // The host is not a node in the component's arbor tree, so it takes no path
  // and every hydration path below it is unchanged. What a HYDRATABLE wrap
  // does carry is the `data-aihu-ssr` ADOPTION marker: the host's declaration
  // that its children are its own server-rendered template, read by
  // @aihu/runtime's connectedCallback (adopt-vs-mount choice) and by arbor's
  // hydrate() (nested-render path boundary).
  it('gives the wrapper no data-aihu-path, stamps the adoption marker, and leaves inner paths untouched', async () => {
    const bare = await renderToString(tree, { hydratable: true })
    const wrapped = await renderToString(tree, { hydratable: true, wrapTag: 'x-page' })
    expect(bare).toContain('data-aihu-path="0"')
    expect(wrapped).toBe(`<x-page data-aihu-ssr="">${bare}</x-page>`)
  })

  // …but only on hydratable output: like the path markers, the adoption
  // marker is a property of the DESTINATION. Terminal (non-hydratable)
  // output carries no adoption bytes — pinned by the exact-byte assertions
  // in the non-hydratable tests above.
  it('omits the adoption marker on non-hydratable output', async () => {
    const wrapped = await renderToString(tree, { wrapTag: 'x-page' })
    expect(wrapped).not.toContain('data-aihu-ssr')
  })

  it('wraps the { toHtml } escape hatch too', async () => {
    const html = await renderToString({ toHtml: () => '<p>x</p>' }, { wrapTag: 'x-page' })
    expect(html).toBe('<x-page><p>x</p></x-page>')
  })
})
