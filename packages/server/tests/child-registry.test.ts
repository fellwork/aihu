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
import { buildChildRegistry, type DiscoveredComponent } from '../src/child-registry.ts'

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

describe('cycle reporting', () => {
  // Cycles WARN, they do not fail the build. `__aihu_schild` bounds them with a
  // depth cap and an output budget, so they render finitely — and the detection
  // has unavoidable false positives (below), so a hard failure rejected legal,
  // ordinary component shapes.
  const warnings = (comps: DiscoveredComponent[]): string[] => {
    const out: string[] = []
    buildChildRegistry(comps, (m) => out.push(m))
    return out
  }

  it('never throws, whatever the graph', () => {
    expect(() => buildChildRegistry([comp('a-one', ['a-one'])])).not.toThrow()
  })

  it('says nothing about a plain tree', () => {
    expect(
      warnings([comp('a-one', ['b-two']), comp('b-two', ['c-three']), comp('c-three')]),
    ).toEqual([])
  })

  it('says nothing about a DIAMOND — two paths to one shared child', () => {
    // Why detection is a three-colour walk and not a `seen` set: a set alone
    // reports this as a cycle, and diamonds are ordinary (a header and a footer
    // both using one logo component).
    expect(
      warnings([
        comp('a-one', ['b-two', 'c-three']),
        comp('b-two', ['d-four']),
        comp('c-three', ['d-four']),
        comp('d-four'),
      ]),
    ).toEqual([])
  })

  it('warns about direct self-reference', () => {
    const w = warnings([comp('a-one', ['a-one'])])
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('a-one → a-one')
  })

  it('warns about a transitive cycle, naming the loop', () => {
    const w = warnings([
      comp('a-one', ['b-two']),
      comp('b-two', ['c-three']),
      comp('c-three', ['a-one']),
    ])
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('a-one → b-two → c-three → a-one')
  })

  it('BUILDS a registry for a recursive component instead of failing', () => {
    // The regression this downgrade exists to fix. A tree, a nested menu, a
    // comment thread — `<group if={kids.length}><tree-node>` — is reported as a
    // self-edge because the tag set is derived from reference SITES and cannot
    // see the guard. It terminates fine at runtime, and its build used to fail
    // with a message asserting a component "cannot render itself", which on the
    // client is untrue.
    const reg = buildChildRegistry([comp('tree-node', ['tree-node'])])
    expect(reg.has('tree-node')).toBe(true)
  })

  it('reports each distinct loop once', () => {
    expect(warnings([comp('a-one', ['b-two']), comp('b-two', ['a-one'])])).toHaveLength(1)
  })

  it('reports a cycle unreachable from the first tag walked', () => {
    expect(
      warnings([comp('a-one'), comp('b-two', ['c-three']), comp('c-three', ['b-two'])]),
    ).toHaveLength(1)
  })

  it('treats an unknown tag as an edge out of the graph', () => {
    expect(warnings([comp('a-one', ['not-discovered'])])).toEqual([])
  })

  it('handles a component with no child-tag export at all', () => {
    const reg = buildChildRegistry([{ tag: 'a-one', module: { __aihu_shadow__: 'light' } }])
    expect(reg.has('a-one')).toBe(true)
  })
})

describe('modules that can never render (§4)', () => {
  // `__aihu_schild` fails closed on these AT RENDER TIME and emits the bare
  // element — byte-identical to a tag nobody registered. So "my footer is
  // broken" and "my footer does not exist" produced the same page and the same
  // silence. The information to tell them apart is a property read, available
  // here, at build time.
  const warnings = (comps: DiscoveredComponent[]): string[] => {
    const out: string[] = []
    buildChildRegistry(comps, (m) => out.push(m))
    return out
  }

  it('says nothing about a module that renders', () => {
    expect(warnings([comp('site-header')])).toEqual([])
  })

  it('warns when the string emitter bailed (no __ssrString)', () => {
    const w = warnings([{ tag: 'site-header', module: { __aihu_shadow__: 'light' } }])
    expect(w).toHaveLength(1)
    expect(w[0]!).toContain('site-header')
    expect(w[0]!).toContain('__ssrString')
  })

  it('warns when the module declares no DOM mode', () => {
    const w = warnings([{ tag: 'site-header', module: { __ssrString: () => '' } }])
    expect(w).toHaveLength(1)
    expect(w[0]!).toContain('site-header')
    expect(w[0]!).toContain('__aihu_shadow__')
  })

  it('names the two causes DIFFERENTLY — the fixes are different', () => {
    // A missing renderer is a template shape the emitter declined; a missing
    // DOM mode means the module never went through the server target's plugin
    // path at all. Same symptom, unrelated actions.
    const noRender = warnings([{ tag: 'a-one', module: { __aihu_shadow__: 'light' } }])[0]!
    const noMode = warnings([{ tag: 'a-one', module: { __ssrString: () => '' } }])[0]!
    expect(noRender).not.toBe(noMode)
  })

  it('rejects a bogus DOM mode, not just a missing one', () => {
    const w = warnings([
      {
        tag: 'site-header',
        module: { __ssrString: () => '', __aihu_shadow__: 'open' as unknown as 'light' },
      },
    ])
    expect(w).toHaveLength(1)
    expect(w[0]!).toContain('"open"')
  })

  it('REGISTERS the module anyway — a diagnostic, not a rejection', () => {
    // Same disposition as the cycle report above. The tag claim is still real
    // (it still collides, it still contributes cycle edges), the page still
    // renders, and the element still upgrades on the client.
    const reg = buildChildRegistry([{ tag: 'site-header', module: { __aihu_shadow__: 'light' } }])
    expect(reg.has('site-header')).toBe(true)
  })

  it('the warned-about module DOES render empty — the claim, verified', async () => {
    // Ties the diagnostic to the behaviour it describes, so the message cannot
    // outlive the failure mode it names.
    const { __aihu_schild } = await import('@aihu/runtime/ssr')
    const warn: string[] = []
    const reg = buildChildRegistry(
      [{ tag: 'site-header', module: { __aihu_shadow__: 'light' } }],
      (m) => warn.push(m),
    )
    expect(warn).toHaveLength(1)
    expect(__aihu_schild('site-header', '', { hydratable: true, children: reg })).toBe(
      '<site-header></site-header>',
    )
  })

  it('warns once per tag, not once per reference', () => {
    // Registry-BUILD time, which is once. The alternative — reporting at render
    // time — is once per reference site on every page.
    const mod = { __aihu_shadow__: 'light' as const }
    const w = warnings([
      { tag: 'a-one', module: mod },
      { tag: 'a-one', module: mod },
    ])
    expect(w).toHaveLength(1)
  })
})
