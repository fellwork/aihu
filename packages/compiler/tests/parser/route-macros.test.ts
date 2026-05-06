/**
 * arch-5 M1 — `$route`, `$beforeNavigate`, `$afterNavigate` macro lowering.
 *
 * Drives the compiler binary via `transform()` and asserts the emitted
 * TypeScript references the expected `@aihu/router` runtime symbols.
 *
 * Companion: `packages/compiler/tests/route_macros.rs` (Rust-side
 * structural assertions — same primitives, different test harness).
 */

import { describe, expect, it } from 'vitest'
import { transform } from '../../js/index.ts'

function compile(source: string, id = '/virtual/test.aihu'): string {
  return transform(source, id).code
}

describe('$route macro — RFC-A5-010', () => {
  it('lowers to const x = computed(() => useRoute()) and imports @aihu/router', () => {
    const out = compile(`@state {
  $route currentRoute
}
@template {
  <div>x</div>
}`)
    expect(out).toContain("import * as __aihuRouter from '@aihu/router'")
    expect(out).toMatch(/const currentRoute = computed\(\(\) => __aihuRouter\.useRoute\(\)\)/)
  })

  it('coexists with other state macros', () => {
    const out = compile(`@state {
  $prop: {
    kind: { type: String }
  }
  $route here
  $computed: {
    upper: () => kind.toUpperCase(),
  }
}
@template {
  <div>x</div>
}`)
    expect(out).toMatch(/const here = computed\(\(\) => __aihuRouter\.useRoute\(\)\)/)
    expect(out).toContain('toUpperCase()')
  })
})

describe('$beforeNavigate macro — RFC-A5-015', () => {
  it('lowers to __router_registerBeforeGuard call', () => {
    const out = compile(`@state {
  $beforeNavigate((to, from, next) => next())
}
@template {
  <div></div>
}`)
    expect(out).toContain('__aihuRouter.__router_registerBeforeGuard(')
    expect(out).toContain("import * as __aihuRouter from '@aihu/router'")
  })

  it('preserves multi-line arrow function bodies', () => {
    const out = compile(`@state {
  $beforeNavigate((to, from, next) => {
    if (dirty) return next(false)
    next()
  })
}
@template {
  <div></div>
}`)
    expect(out).toContain('if (dirty)')
    expect(out).toContain('next(false)')
  })
})

describe('$afterNavigate macro — RFC-A5-016', () => {
  it('lowers to __router_registerAfterGuard call', () => {
    const out = compile(`@state {
  $afterNavigate((to) => analytics.pageview(to.pathname))
}
@template {
  <div></div>
}`)
    expect(out).toContain('__aihuRouter.__router_registerAfterGuard(')
    expect(out).toContain('analytics.pageview')
  })
})

describe('macro elements — RFC-A5-011..014', () => {
  it('<$router> emits createRouterBoundary and the router namespace import', () => {
    const out = compile(`@template {
  <$router router={myRouter}>
    <$outlet></$outlet>
  </$router>
}`)
    expect(out).toContain("import * as __aihuRouter from '@aihu/router'")
    expect(out).toContain('createRouterBoundary(myRouter')
    expect(out).toContain('createOutletBoundary()')
  })

  it('<$link> emits createLinkBoundary with href + prefetch attrs', () => {
    const out = compile(`@template {
  <$link href="/about" prefetch="hover">About</$link>
}`)
    expect(out).toContain('createLinkBoundary(')
    expect(out).toContain("'/about'")
    expect(out).toContain("'hover'")
  })

  it('<$navigate> emits createNavigateBoundary', () => {
    const out = compile(`@template {
  <$navigate to="/login" replace></$navigate>
}`)
    expect(out).toContain('createNavigateBoundary(')
    expect(out).toContain("'/login'")
  })
})
