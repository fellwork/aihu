/**
 * `output: 'ssr'` — the second Vite environment, and the `closeBundle` guards
 * that keep it from breaking the first.
 *
 * THE RISK THIS FILE EXISTS FOR: `closeBundle` fires ONCE PER ENVIRONMENT.
 * `aihu-adapter` and `aihu-ssg` had no environment guard, so under two
 * environments both would run twice per build — `adapt()` writing its worker
 * and wrangler.toml twice, and the SSG prerender running a second full pass
 * against an outDir that is not even its own. `output: 'static'` is SHIPPED, so
 * that is the one thing here that can regress a working build, and it gets its
 * own assertions rather than riding on the e2e.
 */

import type { Plugin } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import type { AihuAdapter } from '../src/adapter.ts'
import { viteAihuPlugin } from '../src/vite-plugin.ts'

vi.mock('../src/prerender.ts', () => ({
  prerenderClose: vi.fn(async () => {}),
}))
const { prerenderClose } = await import('../src/prerender.ts')

/** Pull a named plugin out of the composed array. */
function pluginNamed(plugins: unknown[], name: string): Plugin {
  const found = plugins.find(
    (p): p is Plugin => typeof p === 'object' && p !== null && (p as Plugin).name === name,
  )
  if (!found)
    throw new Error(
      `no plugin named ${name} in [${plugins.map((p) => (p as Plugin)?.name).join(', ')}]`,
    )
  return found
}

/** A minimal `this` for a Rollup hook, carrying an environment name. */
function hookCtx(environmentName?: string) {
  return {
    ...(environmentName === undefined ? {} : { environment: { name: environmentName } }),
    warn: vi.fn(),
    error: vi.fn((m: string) => {
      throw new Error(m)
    }),
  }
}

/** A fake ResolvedConfig sufficient for the two closeBundle hooks. */
const FAKE_RESOLVED = { root: '/tmp/aihu-fake-root', build: { outDir: 'dist' } } as never

function withAdapter(output?: 'spa' | 'static' | 'ssr') {
  const adapt = vi.fn(async () => {})
  const adapter: AihuAdapter = { name: 'fake', adapt, serverEntry: () => 'export default {}' }
  const plugins = viteAihuPlugin({
    adapter,
    ...(output ? { output } : {}),
    ...(output === 'ssr' ? { css: { shadowMode: 'light' as const } } : {}),
  })
  const p = pluginNamed(plugins as unknown[], 'aihu-adapter')
  ;(p.configResolved as (c: unknown) => void).call({}, FAKE_RESOLVED)
  return { adapt, plugin: p }
}

// ---------------------------------------------------------------------------
// The guard itself
// ---------------------------------------------------------------------------

describe('adapter closeBundle runs once, for the client environment only', () => {
  it("does NOT run for the 'ssr' environment", async () => {
    const { adapt, plugin } = withAdapter('ssr')
    await (plugin.closeBundle as () => Promise<void>).call(hookCtx('ssr') as never)
    expect(adapt).not.toHaveBeenCalled()
  })

  it("runs for the 'client' environment", async () => {
    const { adapt, plugin } = withAdapter('ssr')
    await (plugin.closeBundle as () => Promise<void>).call(hookCtx('client') as never)
    expect(adapt).toHaveBeenCalledOnce()
  })

  it('runs exactly once across BOTH environments — the actual two-environment build', async () => {
    const { adapt, plugin } = withAdapter('ssr')
    const call = plugin.closeBundle as () => Promise<void>
    await call.call(hookCtx('client') as never)
    await call.call(hookCtx('ssr') as never)
    expect(adapt).toHaveBeenCalledOnce()
  })

  it('still runs on a Vite with no Environment API, rather than silently disabling itself', async () => {
    // `this.environment` absent must mean "the single environment", not "skip".
    // Reading it as "not client" would turn the guard into an adapter kill
    // switch on older Vite.
    const { adapt, plugin } = withAdapter()
    await (plugin.closeBundle as () => Promise<void>).call(hookCtx(undefined) as never)
    expect(adapt).toHaveBeenCalledOnce()
  })
})

describe("output: 'static' does not regress", () => {
  function ssg(output: 'spa' | 'static') {
    const plugins = viteAihuPlugin({ output })
    const p = pluginNamed(plugins as unknown[], 'aihu-ssg')
    ;(p.configResolved as (c: unknown) => void).call({}, FAKE_RESOLVED)
    return p
  }

  it('prerenders exactly once for a single-environment static build', async () => {
    vi.mocked(prerenderClose).mockClear()
    const p = ssg('static')
    await (p.closeBundle as () => Promise<void>).call(hookCtx('client') as never)
    expect(prerenderClose).toHaveBeenCalledOnce()
  })

  it('prerenders on a pre-Environment-API Vite too', async () => {
    vi.mocked(prerenderClose).mockClear()
    const p = ssg('static')
    await (p.closeBundle as () => Promise<void>).call(hookCtx(undefined) as never)
    expect(prerenderClose).toHaveBeenCalledOnce()
  })

  it('never prerenders for a non-client environment', async () => {
    vi.mocked(prerenderClose).mockClear()
    const p = ssg('static')
    await (p.closeBundle as () => Promise<void>).call(hookCtx('ssr') as never)
    expect(prerenderClose).not.toHaveBeenCalled()
  })

  it("output: 'spa' still never prerenders", async () => {
    vi.mocked(prerenderClose).mockClear()
    const p = ssg('spa')
    await (p.closeBundle as () => Promise<void>).call(hookCtx('client') as never)
    expect(prerenderClose).not.toHaveBeenCalled()
  })

  it("declares NO second environment and NO builder for 'static' — zero new build paths", () => {
    // The regression that would matter most is `output: 'static'` acquiring an
    // `ssr` environment by accident, because that is what would make its
    // closeBundle hooks fire twice in the first place.
    const p = pluginNamed(viteAihuPlugin({ output: 'static' }) as unknown[], 'aihu-server-entry')
    expect((p.config as () => unknown).call({} as never)).toBeUndefined()
  })

  it("declares NO second environment for 'spa' either", () => {
    const p = pluginNamed(viteAihuPlugin({ output: 'spa' }) as unknown[], 'aihu-server-entry')
    expect((p.config as () => unknown).call({} as never)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The ssr environment declaration
// ---------------------------------------------------------------------------

describe("output: 'ssr' declares the second environment", () => {
  function ssrConfig() {
    const p = pluginNamed(
      viteAihuPlugin({ output: 'ssr', css: { shadowMode: 'light' } }) as unknown[],
      'aihu-server-entry',
    )
    return (p.config as (u: unknown) => Record<string, never>).call({} as never, {}) as never as {
      environments: { ssr: { build: Record<string, unknown> } }
      builder: { buildApp: (b: unknown) => Promise<void> }
    }
  }

  it('routes the virtual entry through rollupOptions.input, not build.ssr', () => {
    // LOAD-BEARING: a `virtual:` id resolves as a build entry ONLY via
    // rollupOptions.input. `build.ssr: 'virtual:…'` fails [UNRESOLVED_ENTRY]
    // because Vite resolves that against the filesystem before any plugin's
    // resolveId runs. Pinned so a "simplification" cannot quietly break it.
    const build = ssrConfig().environments.ssr.build
    expect((build.rollupOptions as { input: Record<string, string> }).input).toEqual({
      _worker: 'virtual:aihu-server-entry',
    })
    expect(build).not.toHaveProperty('ssr')
  })

  it('writes OUTSIDE the client outDir — SSR chunks must not be publicly served', () => {
    // D-2: Cloudflare's ASSETS binding serves the client outDir verbatim.
    // Sharing a root would publish the server bundle.
    expect(ssrConfig().environments.ssr.build.outDir).toBe('dist-server')
  })

  it('tracks a renamed client outDir as a SIBLING, not a hardcoded dist-server', () => {
    // A project that renames `dist` must not get a `dist-server` unrelated to
    // it — and, more importantly, must not get a server dir that happens to
    // land INSIDE the new assets root.
    const p = pluginNamed(
      viteAihuPlugin({
        output: 'ssr',
        css: { shadowMode: 'light' },
        vite: { build: { outDir: 'build/site' } },
      }) as unknown[],
      'aihu-server-entry',
    )
    const cfg = (p.config as (u: unknown) => never).call({} as never, {}) as unknown as {
      environments: { ssr: { build: { outDir: string } } }
    }
    expect(cfg.environments.ssr.build.outDir).toBe('build/site-server')
  })

  it('bundles dependencies rather than externalizing them', () => {
    // The SSR environment default is to externalize node_modules, which
    // produces a `_worker.js` full of bare specifiers no Worker runtime can
    // resolve — a bundle that looks built and cannot deploy.
    const env = ssrConfig().environments.ssr as unknown as {
      resolve: { noExternal: boolean }
    }
    expect(env.resolve.noExternal).toBe(true)
  })

  it('builds the client environment before the ssr one', async () => {
    const order: string[] = []
    await ssrConfig().builder.buildApp({
      environments: { client: 'C', ssr: 'S' },
      build: async (e: unknown) => {
        order.push(e as string)
      },
    })
    expect(order).toEqual(['C', 'S'])
  })
})

// ---------------------------------------------------------------------------
// virtual:aihu-server-entry
// ---------------------------------------------------------------------------

describe('virtual:aihu-server-entry', () => {
  function entryPlugin(adapter?: AihuAdapter) {
    return pluginNamed(
      viteAihuPlugin({
        output: 'ssr',
        css: { shadowMode: 'light' },
        ...(adapter ? { adapter } : {}),
      }) as unknown[],
      'aihu-server-entry',
    )
  }

  it('resolves the id to a NUL-prefixed internal id', () => {
    const p = entryPlugin()
    expect(
      (p.resolveId as (i: string) => unknown).call({} as never, 'virtual:aihu-server-entry'),
    ).toBe('\0virtual:aihu-server-entry')
    expect(
      (p.resolveId as (i: string) => unknown).call({} as never, 'virtual:aihu-routes'),
    ).toBeNull()
  })

  it('imports routes and the server component registry from INSIDE the graph', () => {
    // This is the entire point: an emitted-string worker cannot do either, which
    // is why the shipped adapters ship 404 placeholders.
    const src = (entryPlugin().load as (i: string) => string).call(
      hookCtx() as never,
      '\0virtual:aihu-server-entry',
    )
    expect(src).toContain("import routes from 'virtual:aihu-routes'")
    expect(src).toContain("import __components from 'virtual:aihu-server-components'")
    expect(src).toContain('createServerRouter(routes, { children: __children })')
  })

  it("splices the adapter's serverEntry wrapper in verbatim", () => {
    const adapter: AihuAdapter = {
      name: 'fake',
      adapt: async () => {},
      serverEntry: ({ handler }) => `export default { fetch: (r) => ${handler}(r) }`,
    }
    const src = (entryPlugin(adapter).load as (i: string) => string).call(
      hookCtx() as never,
      '\0virtual:aihu-server-entry',
    )
    expect(src).toContain('export default { fetch: (r) => handler(r) }')
  })

  it('warns when an adapter is configured but contributes no serverEntry', () => {
    // Otherwise the build succeeds and produces a bundle with no platform
    // export — a deploy-time failure for a build-time mistake.
    const ctx = hookCtx()
    const adapter: AihuAdapter = { name: 'legacy', adapt: async () => {} }
    ;(entryPlugin(adapter).load as (i: string) => string).call(
      ctx as never,
      '\0virtual:aihu-server-entry',
    )
    expect(ctx.warn).toHaveBeenCalledOnce()
    expect(String(ctx.warn.mock.calls[0]?.[0])).toContain('serverEntry')
  })

  it('keys the child registry on __aihu_tag__, agreeing with the SSG path', () => {
    // `buildChildRegistry` and `discoverComponents` both key on the module's
    // own `__aihu_tag__` — what `defineElement` registers and what
    // `__aihu_schild` looks up. The two paths disagreeing would ship one
    // module's markup and upgrade it with another's on hydrate.
    const src = (entryPlugin().load as (i: string) => string).call(
      hookCtx() as never,
      '\0virtual:aihu-server-entry',
    )
    expect(src).toContain('mod.__aihu_tag__')
  })
})

// ---------------------------------------------------------------------------
// D-1 — the node:module stub
// ---------------------------------------------------------------------------

describe('node:module stub (D-1)', () => {
  function stub(output: 'spa' | 'static' | 'ssr') {
    return pluginNamed(
      viteAihuPlugin({
        output,
        ...(output === 'ssr' ? { css: { shadowMode: 'light' as const } } : {}),
      }) as unknown[],
      'aihu-node-module-stub',
    )
  }

  it("declares enforce: 'pre' — without it Vite's resolver wins and the stub never fires", () => {
    expect(stub('ssr').enforce).toBe('pre')
  })

  it("intercepts node:module in the 'ssr' environment", () => {
    const r = (stub('ssr').resolveId as (i: string) => unknown).call(
      { environment: { name: 'ssr' } } as never,
      'node:module',
    )
    expect(r).toBe('\0aihu:node-module-stub')
  })

  it('leaves the client environment untouched', () => {
    const r = (stub('ssr').resolveId as (i: string) => unknown).call(
      { environment: { name: 'client' } } as never,
      'node:module',
    )
    expect(r).toBeNull()
  })

  it("is inert for 'static' and 'spa' — no shipped mode changes resolution", () => {
    for (const mode of ['static', 'spa'] as const) {
      const r = (stub(mode).resolveId as (i: string) => unknown).call(
        { environment: { name: 'ssr' } } as never,
        'node:module',
      )
      expect(r, mode).toBeNull()
    }
  })

  it('throws rather than no-oping, so a future reachable call names itself', () => {
    const src = (stub('ssr').load as (i: string) => string).call(
      {} as never,
      '\0aihu:node-module-stub',
    )
    expect(src).toContain('throw new Error')
    expect(src).toContain('createRequire')
  })
})
