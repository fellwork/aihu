// @vitest-environment node
/**
 * `buildChildRegistry` — the caller-side half of SSR child resolution
 * (`docs/plans/2026-08-05-ssr-child-components.md`, step 5).
 *
 * The renderers take a pre-resolved map and load nothing themselves, so this is
 * the only place a cyclic component graph can be caught. It is caught at BUILD
 * time deliberately: render-time recursion is already bounded by
 * `__aihu_schild`'s depth cap, so a cycle would not hang anything — it would
 * quietly emit 32 nested copies of the same subtree and ship them.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  buildChildRegistry,
  ChildCycleError,
  type DiscoveredComponent,
} from '../src/child-registry.ts'

const comp = (tag: string, children: string[] = []): DiscoveredComponent => ({
  tag,
  module: { __ssrString: () => '', __aihu_shadow__: 'light', __aihu_child_tags__: children },
})

describe('indexing', () => {
  it('keys every discovered component by its tag', () => {
    const reg = buildChildRegistry([comp('site-header'), comp('site-footer')])
    expect([...reg.keys()].sort()).toEqual(['site-footer', 'site-header'])
  })

  it('warns and keeps the first when two modules claim one tag', () => {
    // A real conflict, not a preference: both cannot register, and the client's
    // second customElements.define would throw.
    const warn = vi.fn()
    const first = comp('site-header')
    const reg = buildChildRegistry([first, comp('site-header')], warn)
    expect(reg.get('site-header')).toBe(first.module)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('site-header')
  })

  it('does not warn when the same module is discovered twice', () => {
    const warn = vi.fn()
    const c = comp('site-header')
    buildChildRegistry([c, c], warn)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('cycle rejection', () => {
  it('accepts a plain tree', () => {
    expect(() =>
      buildChildRegistry([comp('a-one', ['b-two']), comp('b-two', ['c-three']), comp('c-three')]),
    ).not.toThrow()
  })

  it('accepts a DIAMOND — two paths to one shared child', () => {
    // The reason cycle detection is a three-colour walk and not a `seen` set:
    // a set alone reports this as a cycle, and diamonds are ordinary (a header
    // and a footer both using the same logo component).
    expect(() =>
      buildChildRegistry([
        comp('a-one', ['b-two', 'c-three']),
        comp('b-two', ['d-four']),
        comp('c-three', ['d-four']),
        comp('d-four'),
      ]),
    ).not.toThrow()
  })

  it('rejects direct self-reference', () => {
    expect(() => buildChildRegistry([comp('a-one', ['a-one'])])).toThrow(ChildCycleError)
  })

  it('rejects a transitive cycle, naming the loop', () => {
    let err: ChildCycleError | undefined
    try {
      buildChildRegistry([
        comp('a-one', ['b-two']),
        comp('b-two', ['c-three']),
        comp('c-three', ['a-one']),
      ])
    } catch (e) {
      err = e as ChildCycleError
    }
    expect(err).toBeInstanceOf(ChildCycleError)
    // The cycle itself, not the whole traversal path — those are the edges the
    // author has to break.
    expect(err?.cycle).toEqual(['a-one', 'b-two', 'c-three', 'a-one'])
    expect(err?.message).toContain('a-one → b-two → c-three → a-one')
  })

  it('reports a cycle that is not reachable from the first tag walked', () => {
    // Every tag is a walk root, so a cycle in a disconnected part of the graph
    // is still found.
    expect(() =>
      buildChildRegistry([comp('a-one'), comp('b-two', ['c-three']), comp('c-three', ['b-two'])]),
    ).toThrow(ChildCycleError)
  })

  it('treats an unknown tag as an edge out of the graph', () => {
    // Third-party custom elements, or components the caller did not discover.
    // `__aihu_schild` already fails closed on them, so they terminate the walk
    // rather than failing the build.
    expect(() => buildChildRegistry([comp('a-one', ['not-discovered'])])).not.toThrow()
  })

  it('handles a component with no child-tag export at all', () => {
    const reg = buildChildRegistry([{ tag: 'a-one', module: { __aihu_shadow__: 'light' } }])
    expect(reg.has('a-one')).toBe(true)
  })
})
