// @vitest-environment node
/**
 * #465 — the structural SSR walk.
 *
 * `when()`/`each()` compile output (`kind: 'structural'`) previously fell
 * through both tree walkers to `''`, so every `{#if}`/`{#each}` boundary
 * rendered EMPTY server-side — the GX honest-ceiling caveat that limited
 * entitled dual-audience HTML to direct interpolations. These tests pin the
 * walk: conditionals render the taken branch, lists render every item (and
 * nothing when empty), fragments (`branch(''|null)` — the compiler's body
 * shape) render without a wrapper, hydration paths mirror the client
 * materializer (`arbor/src/structural.ts`), and the P5/I2s governed guard
 * still refuses a `pending` dataSource INSIDE a structural subtree.
 *
 * Fixtures use the REAL arbor factories (`when`/`each`/`branch`/`leaf`) so
 * the shapes rendered are the shapes arbor actually emits — never hand-written
 * `kind:` blobs that can agree with themselves while disagreeing with arbor.
 */

import { branch, each, leaf, when } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { renderToStream, renderToString } from '../src/ssr.ts'

/** The compiler's condition shape: a single-element thunk array. */
const thunk = (fn: () => unknown) => [fn] as unknown as Signal<boolean>

describe('structural SSR — when() conditionals', () => {
  it('renders the taken branch of a true condition (thunk-array shape)', async () => {
    const component = () =>
      branch('div', undefined, [
        when(
          thunk(() => true),
          () => branch('p', { class: 'gated' }, [leaf('VISIBLE')]),
        ),
      ])
    expect(await renderToString(component)).toBe('<div><p class="gated">VISIBLE</p></div>')
  })

  it('renders NOTHING for a false condition', async () => {
    const component = () =>
      branch('div', undefined, [
        when(
          thunk(() => false),
          () => branch('p', undefined, [leaf('HIDDEN')]),
        ),
      ])
    expect(await renderToString(component)).toBe('<div></div>')
  })

  it('reads a real [read, write] Signal tuple at its current value', async () => {
    const [on] = signal(true)
    const component = () =>
      branch('div', undefined, [
        when([on, () => {}] as unknown as Signal<boolean>, () => leaf('signal-gated')),
      ])
    expect(await renderToString(component)).toBe('<div>signal-gated</div>')
  })

  it('accepts a plain closure condition (hand-built trees)', async () => {
    const component = () =>
      branch('div', undefined, [when((() => true) as unknown as Signal<boolean>, () => leaf('ok'))])
    expect(await renderToString(component)).toBe('<div>ok</div>')
  })

  it('the compiled {#if}/{:else} pair (sibling when() nodes in a fragment) renders exactly one arm', async () => {
    // Mirrors the compiler's lowering: `branch('', undefined, [when(cond, …),
    // when(!cond, …)])` — the `{:else}` arm is a sibling with the negation.
    const make = (entitled: boolean) => () =>
      branch('article', undefined, [
        branch('', undefined, [
          when(
            thunk(() => entitled),
            () =>
              branch('', undefined, [branch('section', { class: 'gx-senses' }, [leaf('SECRET')])]),
          ),
          when(
            thunk(() => !entitled),
            () => branch('', undefined, [branch('p', { class: 'gx-locked' }, [leaf('locked')])]),
          ),
        ]),
      ])
    expect(await renderToString(make(true))).toBe(
      '<article><section class="gx-senses">SECRET</section></article>',
    )
    expect(await renderToString(make(false))).toBe(
      '<article><p class="gx-locked">locked</p></article>',
    )
  })

  it('text-leaf content inside a taken branch is escaped like any other leaf', async () => {
    const component = () =>
      branch('div', undefined, [
        when(
          thunk(() => true),
          () => leaf('<b>&'),
        ),
      ])
    expect(await renderToString(component)).toBe('<div>&lt;b&gt;&amp;</div>')
  })
})

describe('structural SSR — each() lists', () => {
  const items = [
    { id: 'alpha', label: 'Alpha' },
    { id: 'beta', label: 'Beta' },
  ]

  it('renders every item of the current collection in order', async () => {
    const component = () =>
      branch('ul', undefined, [
        each(
          thunk(() => items) as unknown as Signal<typeof items>,
          (it) => it.id,
          (it) => branch('li', undefined, [leaf(it.label)]),
        ),
      ])
    expect(await renderToString(component)).toBe('<ul><li>Alpha</li><li>Beta</li></ul>')
  })

  it('renders NOTHING for an empty collection', async () => {
    const component = () =>
      branch('ul', undefined, [
        each(
          thunk(() => []) as unknown as Signal<never[]>,
          () => 0,
          () => branch('li', undefined, [leaf('never')]),
        ),
      ])
    expect(await renderToString(component)).toBe('<ul></ul>')
  })

  it('the compiled {:empty} lowering (sibling when() on `.length`) renders the empty arm', async () => {
    const empty: string[] = []
    const component = () =>
      branch('', undefined, [
        when(
          thunk(() => empty.length > 0),
          () =>
            each(
              thunk(() => empty) as unknown as Signal<string[]>,
              (s) => s,
              (s) => leaf(s),
            ),
        ),
        when(
          thunk(() => empty.length === 0),
          () => branch('p', { class: 'empty' }, [leaf('No items')]),
        ),
      ])
    expect(await renderToString(component)).toBe('<p class="empty">No items</p>')
  })

  it('reads a real Signal-of-array at its current value', async () => {
    const [list] = signal(['x', 'y'])
    const component = () =>
      branch('ol', undefined, [
        each(
          [list, () => {}] as unknown as Signal<string[]>,
          (s) => s,
          (s) => branch('li', undefined, [leaf(s)]),
        ),
      ])
    expect(await renderToString(component)).toBe('<ol><li>x</li><li>y</li></ol>')
  })
})

describe('structural SSR — fragments (the compiled body shape)', () => {
  it("branch('') renders children without a wrapper element", async () => {
    const component = () =>
      branch('', undefined, [
        branch('p', undefined, [leaf('a')]),
        branch('p', undefined, [leaf('b')]),
      ])
    expect(await renderToString(component)).toBe('<p>a</p><p>b</p>')
  })

  it('branch(null) renders children without a wrapper element (client parity — never a <div>)', async () => {
    const component = () => branch(null, undefined, [leaf('bare')])
    expect(await renderToString(component)).toBe('bare')
  })

  it('fragments carry no data-aihu-path of their own; child elements continue the positional path', async () => {
    const component = () =>
      branch('section', undefined, [branch('', undefined, [branch('p', undefined, [leaf('x')])])])
    const html = await renderToString(component, { hydratable: true })
    // section = root '0'; fragment occupies child slot 0; <p> is the
    // fragment's child 0 → '0.0.0' — exactly `_materialize` case-4 paths.
    expect(html).toBe('<section data-aihu-path="0"><p data-aihu-path="0.0.0">x</p></section>')
  })
})

describe('structural SSR — hydration markers and path continuation', () => {
  it('hydratable output delimits structural content with path-tagged comments', async () => {
    const component = () =>
      branch('div', undefined, [
        when(
          thunk(() => true),
          () => branch('p', undefined, [leaf('gated')]),
        ),
      ])
    const html = await renderToString(component, { hydratable: true })
    expect(html).toBe(
      '<div data-aihu-path="0">' +
        '<!--aihu:s:0.0--><p data-aihu-path="0.0.conditional.true">gated</p><!--aihu:/s:0.0-->' +
        '</div>',
    )
  })

  it('a FALSE conditional still emits its (empty) delimited segment so the client can locate it', async () => {
    const component = () =>
      branch('div', undefined, [
        when(
          thunk(() => false),
          () => leaf('never'),
        ),
      ])
    const html = await renderToString(component, { hydratable: true })
    expect(html).toBe('<div data-aihu-path="0"><!--aihu:s:0.0--><!--aihu:/s:0.0--></div>')
  })

  it('each() items continue under `.list.<key>` with dots sanitized — the client reconciler’s keyed paths', async () => {
    const component = () =>
      branch('ul', undefined, [
        each(
          thunk(() => ['v1.0', 'v2.0']) as unknown as Signal<string[]>,
          (s) => s,
          (s) => branch('li', undefined, [leaf(s)]),
        ),
      ])
    const html = await renderToString(component, { hydratable: true })
    expect(html).toContain('<li data-aihu-path="0.0.list.v1_0">v1.0</li>')
    expect(html).toContain('<li data-aihu-path="0.0.list.v2_0">v2.0</li>')
  })

  it('hyphenated list keys are comment-safe in the delimiters (no `--` can terminate the comment)', async () => {
    const component = () =>
      branch('div', undefined, [
        each(
          thunk(() => ['my--slug']) as unknown as Signal<string[]>,
          (s) => s,
          (_s) =>
            branch('span', undefined, [
              when(
                thunk(() => true),
                () => leaf('nested'),
              ),
            ]),
        ),
      ])
    const html = await renderToString(component, { hydratable: true })
    // The nested structural node's marker path includes the hyphenated key;
    // every `-` is rewritten `_` so no comment body can contain `--`.
    expect(html).toContain('<!--aihu:s:0.0.list.my__slug.0-->')
    for (const m of html.matchAll(/<!--([\s\S]*?)-->/g)) {
      expect(m[1]).not.toContain('--')
    }
    // data-aihu-path keeps the REAL key (attribute escaping handles it).
    expect(html).toContain('data-aihu-path="0.0.list.my--slug"')
  })

  it('non-hydratable output carries no structural delimiters (terminal bytes stay clean)', async () => {
    const component = () =>
      branch('div', undefined, [
        when(
          thunk(() => true),
          () => leaf('gated'),
        ),
      ])
    const html = await renderToString(component)
    expect(html).toBe('<div>gated</div>')
    expect(html).not.toContain('aihu:s:')
  })
})

describe('structural SSR — composition with the governed guard and streaming', () => {
  it('a pending dataSource INSIDE a governed structural subtree is refused fail-closed', async () => {
    const pendingBranch = {
      kind: 'branch',
      tag: 'section',
      attrs: {},
      children: [],
      dataSource: {
        status: 'pending' as const,
        onReady: () => () => {},
      },
    }
    const component = () =>
      branch('div', undefined, [
        when(
          thunk(() => true),
          () => pendingBranch as unknown as ReturnType<typeof branch>,
        ),
      ])
    await expect(renderToString(component, { governed: true })).rejects.toThrow(/GOVERNED_UNGATED/)
  })

  it('an ungoverned READY dataSource inside a structural subtree renders synchronously', async () => {
    const readyBranch = {
      kind: 'branch',
      tag: 'section',
      attrs: {},
      children: [{ kind: 'leaf', leafKind: 'text', value: 'loaded' }],
      dataSource: { status: 'ready' as const, value: 'loaded', onReady: () => () => {} },
    }
    const component = () =>
      branch('div', undefined, [
        when(
          thunk(() => true),
          () => readyBranch as unknown as ReturnType<typeof branch>,
        ),
      ])
    expect(await renderToString(component)).toBe('<div><section>loaded</section></div>')
  })

  it('renderToStream emits the same structural bytes as renderToString', async () => {
    const component = () =>
      branch('ul', undefined, [
        each(
          thunk(() => ['a', 'b']) as unknown as Signal<string[]>,
          (s) => s,
          (s) => branch('li', undefined, [leaf(s)]),
        ),
      ])
    const chunks: string[] = []
    const reader = renderToStream(component, { hydratable: true }).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    expect(chunks.join('')).toBe(await renderToString(component, { hydratable: true }))
  })
})
