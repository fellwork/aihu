/**
 * Unit tests for `useRouteParams` (`@aihu/use/router` family, wave0 seed).
 *
 * The composable now does a STATIC import + capture-at-call-time (see its
 * module doc for why the earlier lazy-dynamic-import shape was broken:
 * `inject()` only resolves the real hierarchical/client context during a
 * component's synchronous `setup()` window, and a microtask-resolved dynamic
 * import can never land inside that window). So the tests below exercise:
 *
 *  1. the CLIENT hierarchical path (`_enterContext`/`_exitContext`, the same
 *     primitives `packages/runtime/src/define-component.ts` uses around
 *     `_build()`) — calling `useRouteParams()` synchronously "inside setup",
 *     then reading `params()` AFTER the scope has exited, proving the
 *     captured context keeps working post-setup (the whole point of
 *     capturing once instead of re-injecting on every read);
 *  2. reactivity — `params()` changes when the underlying route signal does,
 *     with no re-`inject()` involved;
 *  3. the SSR flat-map path (`runWithContext`) — `useRouteParams()` called
 *     synchronously inside the request's `runWithContext`, matching how a
 *     real SSR render is synchronous inside it;
 *  4. no active context at all — never throws, always `{}`;
 *  5. the optional peer genuinely absent — since the import is now static,
 *     this throws at MODULE-import time (a normal, expected outcome for an
 *     unresolved optional peer that a consumer actually imports — per-entry
 *     isolation means this only affects consumers of this specific subpath).
 */
import { _enterContext, _exitContext, runWithContext } from '@aihu/context'
import type { MatchResult, RouteContextValue } from '@aihu/router'
import { RouteContext } from '@aihu/router'
import { signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import { useRouteParams } from '../../src/router/useRouteParams/index.ts'

function contextValue(match: MatchResult | null | (() => MatchResult | null)): RouteContextValue {
  const current = typeof match === 'function' ? match : () => match
  return {
    // Test double, only `.current` is ever read here.
    router: {} as RouteContextValue['router'],
    current,
  }
}

const SAMPLE_MATCH: MatchResult = {
  route: { pattern: '/posts/:id', segments: [], module: async () => ({ default: null }) },
  params: { id: '42' },
  pathname: '/posts/42',
}

describe('@aihu/use/router/useRouteParams — client hierarchical context', () => {
  it('captures context synchronously "inside setup" and keeps reading it after the scope exits', () => {
    const provides: Record<symbol, unknown> = { [RouteContext._id]: contextValue(SAMPLE_MATCH) }

    // Mirrors define-component's `_enterOwnerContext` / `_exitContext` around
    // `_build()`: `useRouteParams()` MUST be called inside this window — that
    // is the one moment `inject()` can see the real ancestor context.
    const prev = _enterContext(provides, () => {})
    let params: (() => Record<string, string>) | undefined
    try {
      ;({ params } = useRouteParams())
    } finally {
      _exitContext(prev)
    }

    // Read happens OUTSIDE the setup window — no context is active here at
    // all — yet it still resolves correctly because the context was
    // captured, not re-injected.
    expect(params?.()).toEqual({ id: '42' })
  })

  it('recomputes when the underlying route signal changes, with no re-inject involved', () => {
    // A real `@aihu/signals` signal — `computed`'s memoization only
    // invalidates on a tracked signal READ, not a plain closure over a
    // captured variable (that's exactly what a real router's
    // `createRouteSignal` gives `ctx.current`).
    const [active, setActive] = signal<MatchResult | null>(SAMPLE_MATCH)
    const provides: Record<symbol, unknown> = {
      [RouteContext._id]: contextValue(active),
    }

    const prev = _enterContext(provides, () => {})
    let params: (() => Record<string, string>) | undefined
    try {
      ;({ params } = useRouteParams())
    } finally {
      _exitContext(prev)
    }

    expect(params?.()).toEqual({ id: '42' })

    setActive({
      route: { pattern: '/posts/:id', segments: [], module: async () => ({ default: null }) },
      params: { id: '99' },
      pathname: '/posts/99',
    })
    expect(params?.()).toEqual({ id: '99' })
  })

  it('defaults to {} when the active route context has no current match', () => {
    const provides: Record<symbol, unknown> = { [RouteContext._id]: contextValue(null) }
    const prev = _enterContext(provides, () => {})
    let params: (() => Record<string, string>) | undefined
    try {
      ;({ params } = useRouteParams())
    } finally {
      _exitContext(prev)
    }
    expect(params?.()).toEqual({})
  })
})

describe('@aihu/use/router/useRouteParams — SSR flat context map', () => {
  it('reads the active route params when called inside runWithContext, matching a synchronous SSR render', () => {
    const map = new Map<symbol, unknown>()
    map.set(RouteContext._id, contextValue(SAMPLE_MATCH))

    // The real SSR render path is itself synchronous inside runWithContext,
    // so useRouteParams() must be invoked from there — same rule as setup.
    const params = runWithContext(map, () => useRouteParams().params)
    expect(params()).toEqual({ id: '42' })
  })
})

describe('@aihu/use/router/useRouteParams — no active context', () => {
  it('never throws and defaults to {} when called with no context active at all', () => {
    let params: (() => Record<string, string>) | undefined
    expect(() => {
      ;({ params } = useRouteParams())
    }).not.toThrow()
    expect(params?.()).toEqual({})
  })
})

describe('@aihu/use/router/useRouteParams — optional peer absent', () => {
  it('throws at module-import time when the optional @aihu/router peer cannot be resolved', async () => {
    vi.resetModules()
    vi.doMock('@aihu/router', () => {
      throw new Error("Cannot find module '@aihu/router' (simulated: peer not installed)")
    })

    try {
      // A static import of a genuinely-absent optional peer failing at
      // import time is the expected, standard outcome — the per-composable
      // ENTRY (not a runtime try/catch) is what keeps this from affecting
      // any consumer who never imports this subpath (see core-isolation.test.ts).
      // vitest wraps the mock factory's throw in its own mocking-error
      // message; the original cause carries the simulated resolution failure.
      let caught: Error | undefined
      try {
        await import('../../src/router/useRouteParams/index.ts')
      } catch (e) {
        caught = e as Error
      }
      expect(caught).toBeDefined()
      expect(String((caught?.cause as Error | undefined)?.message ?? caught?.message)).toMatch(
        /@aihu\/router/,
      )
    } finally {
      vi.doUnmock('@aihu/router')
      vi.resetModules()
    }
  })
})
