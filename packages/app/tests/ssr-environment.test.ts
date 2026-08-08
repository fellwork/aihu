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

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
    expect(src).toContain('createServerRouter(routes, {')
    expect(src).toContain('children: __children,')
  })

  it('imports the LAYOUT registry too, and hands it to the router', () => {
    // Without this the live SSR path renders pages bare while the SSG path
    // composes their shell — the same route looking right prerendered and
    // losing its nav/footer/grid the moment a Worker serves it.
    const src = (entryPlugin().load as (i: string) => string).call(
      hookCtx() as never,
      '\0virtual:aihu-server-entry',
    )
    expect(src).toContain("import __layouts from 'virtual:aihu-layouts'")
    expect(src).toContain('layouts: __layoutMap,')
  })

  it('resolves layout AND child modules before handle(), inside one init', () => {
    // `handle` composes inside a request and `__aihu_schild` runs inside the
    // synchronous compiled string renderer, so every module must be in hand
    // before a render begins. That constraint is unchanged — what moved is
    // where the awaiting happens (see the no-TLA test below): it is now inside
    // `__buildRouter`, awaited by `handler` before `handle()` is called.
    const src = (entryPlugin().load as (i: string) => string).call(
      hookCtx() as never,
      '\0virtual:aihu-server-entry',
    )
    expect(src).toContain('async function __buildRouter() {')
    expect(src).toContain('await Promise.all(')
    expect(src).toContain('await entry.load()')
  })

  it('threads a platform argument from the wrapper into handle()', () => {
    // THE binding seam. `handle(request)` alone means a Worker's env — its KV,
    // D1, R2, DO stubs and secrets, which exist only per request — is
    // unreachable from any loader, which is the single biggest practical limit
    // on deploying real work on this path.
    const src = (entryPlugin().load as (i: string) => string).call(
      hookCtx() as never,
      '\0virtual:aihu-server-entry',
    )
    expect(src).toContain('export const handler = async (request, platform) =>')
    expect(src).toContain('(await __getRouter()).handle(request, platform)')
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

  // -------------------------------------------------------------------------
  // THE DEADLOCK GATE. Semantic, not textual.
  // -------------------------------------------------------------------------
  //
  // The entry used to resolve both registries at MODULE SCOPE with top-level
  // `await`, which made it an ESM async module. Vite/rollup hoists the shared
  // runtime into the entry chunk, so the lazy component/layout chunks
  // statically import back into `_worker.js` (7 of 8, measured on vite 6.4.3
  // in a consumer-shaped tree). Async-module semantics then close the loop —
  // the entry suspends at its TLA, the chunk cannot finish evaluating until
  // the entry's evaluation promise settles, and that settles only when the
  // dynamic import resolves. `await import('./_worker.js')` never settles.
  // The build was GREEN; every production request was a hard failure.
  //
  // These two tests evaluate the emitted source with its imports replaced by
  // instrumented stubs, so they pin the SEMANTICS a text match cannot see:
  // nothing is resolved during evaluation, and a cold burst of concurrent
  // requests shares exactly one initialisation.
  let entryProbeSeq = 0
  async function evaluateEntry() {
    const src = (entryPlugin().load as (i: string) => string).call(
      hookCtx() as never,
      '\0virtual:aihu-server-entry',
    )
    // Swap the five bare/virtual specifiers for inline stubs so the emitted
    // body can run standalone. If the import block ever changes shape this
    // count assertion fails loudly rather than silently testing a stub-only
    // module.
    const withoutImports = src.replace(/^import .*$\n/gm, '')
    expect(src.split('\n').length - withoutImports.split('\n').length).toBe(5)

    const probe: { loads: string[]; routers: unknown[] } = { loads: [], routers: [] }
    // A unique global key per evaluation. The `data:` URL is the module cache
    // key, so two evaluations of an identical body would otherwise return ONE
    // module still bound to the first test's probe.
    const key = `__aihuEntryProbe_${entryProbeSeq++}`
    ;(globalThis as Record<string, unknown>)[key] = probe

    const preamble = [
      `const __p = globalThis.${key}`,
      'const routes = []',
      'const createServerRouter = (r, o) => {',
      '  __p.routers.push(o)',
      '  return { handle: (req, platform) => ({ req, platform, children: o.children, layouts: o.layouts }) }',
      '}',
      'const buildChildRegistry = (d) => new Map(d.map((x) => [x.tag, x.module]))',
      'const __components = {',
      "  'probe-a': async () => { __p.loads.push('child:probe-a'); return { __aihu_tag__: 'probe-a' } },",
      '}',
      'const __layouts = {',
      "  app: { load: async () => { __p.loads.push('layout:app'); return {} } },",
      '}',
      '',
    ].join('\n')

    const url = `data:text/javascript;base64,${Buffer.from(preamble + withoutImports, 'utf8').toString('base64')}`
    const mod = (await import(/* @vite-ignore */ url)) as {
      handler: (req: unknown, platform?: unknown) => Promise<{ children: Map<string, unknown> }>
    }
    return { mod, probe }
  }

  it('resolves NOTHING at module scope — no top-level await, so no deadlock', async () => {
    const { probe } = await evaluateEntry()
    // The decisive observation. Under the old entry the dynamic imports had
    // already been awaited by the time `import()` resolved; here evaluation
    // finishes having touched neither registry.
    expect(probe.loads).toEqual([])
    expect(probe.routers).toEqual([])
  })

  it('memoises ONE init that concurrent first requests share', async () => {
    const { mod, probe } = await evaluateEntry()

    // A cold burst: five requests arrive before any of them has finished
    // initialising. The memo is on the PROMISE, and the check-and-assign pair
    // is synchronous, so all five await the same one.
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => mod.handler({}, { env: {} })))

    expect(probe.loads).toEqual(['child:probe-a', 'layout:app'])
    expect(probe.routers).toHaveLength(1)
    // …and the resolved-map contract still holds: `handle()` was reached with
    // the children already in hand, which is what `__aihu_schild` requires.
    for (const r of results) expect(r.children.get('probe-a')).toBeDefined()

    // A later, non-concurrent request reuses the same init rather than redoing it.
    await mod.handler({}, { env: {} })
    expect(probe.loads).toEqual(['child:probe-a', 'layout:app'])
    expect(probe.routers).toHaveLength(1)
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

  /**
   * What `resolveId` should hand back: the shipped stub ARTIFACT's path.
   *
   * Derived the same unnatural way as the plugin's own copy — see the comment
   * there. `new URL('…', import.meta.url)` is Vite's asset-URL sugar and gets
   * rewritten to an http: specifier under vitest.
   */
  const STUB_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../src/node-module-stub.js')

  it("intercepts node:module in the 'ssr' environment", () => {
    const r = (stub('ssr').resolveId as (i: string) => unknown).call(
      { environment: { name: 'ssr' } } as never,
      'node:module',
    )
    expect(r).toBe(STUB_FILE)
  })

  it('intercepts the un-prefixed `module` specifier too', () => {
    // The prefix-strip comparison in the plugin replaced an explicit
    // `id === 'node:module' || id === 'module'`. Both arms are still live.
    const r = (stub('ssr').resolveId as (i: string) => unknown).call(
      { environment: { name: 'ssr' } } as never,
      'module',
    )
    expect(r).toBe(STUB_FILE)
  })

  it('does not swallow unrelated node: builtins or lookalike specifiers', () => {
    // Prefix-strip must not widen the match: `node:fs` must stay external, and
    // `some-module` / `node:module/x` must not be mistaken for the builtin.
    for (const id of ['node:fs', 'node:path', 'some-module', 'node:module/x', 'modules']) {
      const r = (stub('ssr').resolveId as (i: string) => unknown).call(
        { environment: { name: 'ssr' } } as never,
        id,
      )
      expect(r, id).toBeNull()
    }
  })

  it('resolves to a file that actually exists — the artifact is shipped, not virtual', () => {
    // The stub is a real build artifact (dist/node-module-stub.js, its own
    // rolldown entry) rather than source text in a `load` hook, so that
    // `createRequire` — which the stub cannot rename, because native.js
    // imports that binding by name — is not string data inside @aihu/app's own
    // bundle where `check:runtime-purity` cannot tell it from a real symbol.
    // If this path is wrong, a consumer's SSR build fails to resolve it.
    expect(existsSync(STUB_FILE)).toBe(true)
  })

  it('carries no node: specifier of its own — it ships into the Worker bundle', () => {
    // The point of the stub is that the emitted worker contains NO node:
    // builtin (workers-ssr-e2e assertion 4). A stub that named one, even in a
    // comment, would defeat its own purpose. Also enforced in CI by the
    // `builtin-stub` tier in scripts/check-runtime-purity.ts.
    expect(readFileSync(STUB_FILE, 'utf8')).not.toMatch(/["'`]node:[a-z/]+/)
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

  it('throws rather than no-oping, so a future reachable call names itself', async () => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(STUB_FILE).href)
    // Named exactly as the builtin names it — native.js imports this binding.
    expect(typeof mod.createRequire).toBe('function')
    expect(() => mod.createRequire()).toThrow(/unavailable in the SSR \(Worker\) bundle/)
    // …and via the default export, which is how a default-import consumer
    // (`import module from 'node:module'`) reaches it.
    expect(() => mod.default.createRequire()).toThrow()
  })
})
