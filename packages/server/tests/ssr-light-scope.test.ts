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
