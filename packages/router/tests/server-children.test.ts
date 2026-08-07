/**
 * §2a — `createServerRouter` forwards `ServerRouterOptions.children` to
 * `renderToString` on BOTH render paths.
 *
 * Before this, `packages/router/src/server.ts` forwarded `lightScopeId` and
 * nothing else, so every request-time SSR consumer rendered a component
 * reference as an empty element with no diagnostic — the exact failure the
 * child work exists to remove, left behind at the live-SSR edge while SSG got
 * the fix.
 *
 * These tests assert the OBSERVABLE consequence — the child's markup appears
 * in the response body — rather than that an option object carried a key. A
 * spy on `renderToString` would pass against a forwarding that hands the map
 * to a renderer which then ignores it.
 *
 * Note what this does NOT prove, because the plan text overstated it: no
 * shipped adapter gains non-empty children from this. `adapter-cloudflare`
 * and `-vercel` wire `createRequestRouter`, not this function, and render
 * nothing at all today. Building the map on the server is §2b.
 */

import { __aihu_schild } from '@aihu/runtime/ssr'
import { attachSsrString, createGovernedRegistry } from '@aihu/server'
import { describe, expect, it } from 'vitest'
import type { RouteDefinition } from '../src/index.ts'
import { createServerRouter } from '../src/server.ts'

/** A compiled-looking child: `__ssrString` + the shadow mode the gate requires. */
const KID = {
  __ssrString: () => '<span class="kid">KID</span>',
  __aihu_shadow__: 'light' as const,
}

/**
 * A route whose component takes the COMPILED FAST PATH (via
 * `__aihu_ssr_string__`) and emits one child reference through the same
 * `__aihu_schild` call site the emitter lowers. `opts` is threaded through
 * verbatim — that is precisely the channel `children` has to survive.
 */
const PAGE_SSR_STRING = (_props: unknown, opts?: Parameters<typeof __aihu_schild>[2]): string =>
  `<div>${__aihu_schild('x-kid', '', opts)}</div>`

function childRoute(pattern: string, extract?: RouteDefinition['extract']): RouteDefinition {
  const component = (): unknown => ({ toHtml: () => '' })
  attachSsrString(component, PAGE_SSR_STRING, {})
  return {
    pattern,
    segments: pattern
      .split('/')
      .filter(Boolean)
      .map((p) => ({ kind: 'static' as const, path: p })),
    // BOTH shapes, because the two arms read different ones and a fixture
    // carrying only the first silently drops off the compiled fast path on the
    // governed arm. `attachSsrString` puts `__aihu_ssr_string__` on the
    // FUNCTION, which is what the ungoverned arm uses. The governed arm wraps
    // the component to bind `route.data` — a wrapper hides that property — so
    // it re-attaches from the MODULE export `__ssrString` (`server.ts:506`).
    // A real compiled artifact exports both; this fixture must too, or the
    // governed test renders empty and looks like a product bug.
    module: () => Promise.resolve({ default: component, __ssrString: PAGE_SSR_STRING }),
    ...(extract !== undefined ? { extract } : {}),
  }
}

async function bodyFor(
  children?: ReadonlyMap<string, typeof KID>,
  extract?: RouteDefinition['extract'],
): Promise<string> {
  const router = createServerRouter(
    [childRoute('/p', extract)],
    children !== undefined ? { children } : undefined,
  )
  const res = await router.handle(new Request('http://localhost/p'))
  expect(res.status).toBe(200)
  return await res.text()
}

describe('createServerRouter — §2a child registry forwarding', () => {
  it('renders the child when a registry is supplied (ungoverned path)', async () => {
    const html = await bodyFor(new Map([['x-kid', KID]]))
    expect(html).toContain('class="kid"')
    // The host element still wraps it — the child is rendered INTO the
    // reference, not substituted for it.
    expect(html).toContain('<x-kid')
  })

  it('renders the child on the GOVERNED path too', async () => {
    // Both arms or neither: if only one forwarded, child rendering would
    // depend on whether a route happens to declare `data:`, which is a
    // difference no author would predict.
    //
    // A REGISTRY AND A `data:` DECLARATION ARE BOTH REQUIRED to reach that arm
    // — `handle` gates it on `governed && decl !== null` (`server.ts:471`).
    // This test originally passed `extract` alone, which falls through to the
    // UNGOVERNED path: it duplicated the test above while claiming to cover
    // the second arm, and stayed green with the governed arm's forwarding
    // deleted. Caught by review, not by the suite.
    const registry = createGovernedRegistry().provider('Page', {
      fetch: async () => ({ title: 'T' }),
    })
    const router = createServerRouter(
      [
        {
          ...childRoute('/p', { read: 'all', call: 'anonymous' }),
          data: { type: 'Page' },
        },
      ],
      { governed: registry, children: new Map([['x-kid', KID]]) },
    )
    const res = await router.handle(new Request('http://localhost/p'))
    expect(res.status).toBe(200)
    const html = await res.text()
    // The loader embed is what proves the governed arm ran at all — without
    // it this is just the ungoverned test again under a different name.
    expect(html).toContain('__aihu_loader__')
    expect(html).toContain('class="kid"')
  })

  it('is byte-identical to omitting the option when no registry is passed', async () => {
    // The contract this interface already documents: passing neither member is
    // indistinguishable from the pre-option call. This is the control — without
    // it, "renders the child" could pass because the child renders ALWAYS.
    const withNone = await bodyFor(undefined)
    const withEmpty = await bodyFor(new Map())
    expect(withNone).toBe(withEmpty)
    expect(withNone).not.toContain('class="kid"')
    // The bare host survives, exactly as it does today.
    expect(withNone).toContain('<x-kid></x-kid>')
  })

  it('leaves an unresolved tag bare rather than throwing', async () => {
    // A registry that does not carry the tag is the ordinary case for a
    // partial manifest; `__aihu_schild` fails closed to the bare element.
    const html = await bodyFor(new Map([['y-other', KID]]))
    expect(html).toContain('<x-kid></x-kid>')
    expect(html).not.toContain('class="kid"')
  })
})
