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
import { attachSsrString } from '@aihu/server'
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
function childRoute(pattern: string, extract?: RouteDefinition['extract']): RouteDefinition {
  const component = (): unknown => ({ toHtml: () => '' })
  attachSsrString(
    component,
    (_props: unknown, opts?: Parameters<typeof __aihu_schild>[2]) =>
      `<div>${__aihu_schild('x-kid', '', opts)}</div>`,
    {},
  )
  return {
    pattern,
    segments: pattern
      .split('/')
      .filter(Boolean)
      .map((p) => ({ kind: 'static' as const, path: p })),
    module: () => Promise.resolve({ default: component }),
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
    // depend on whether a route happens to declare `extract`, which is a
    // difference no author would predict.
    const html = await bodyFor(new Map([['x-kid', KID]]), { read: 'all', call: 'anonymous' })
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
