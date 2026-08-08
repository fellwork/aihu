import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AdapterContext } from '@aihu/app'
import { ssrOutDirFor } from '@aihu/app'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cloudflare } from '../src/index.ts'

/**
 * Evaluate the emitted routes-manifest.js in a real child Node process and
 * return its default export, augmented with each handler's resolved status.
 *
 * Vitest intercepts a bare `import()` of an out-of-project temp path and runs
 * it through Vite's transform pipeline, which fails. A child `node --input-type
 * =module` evaluation is the faithful equivalent of what the Cloudflare worker
 * runtime does at load time, and proves the module is valid ESM with a working
 * default export and callable handlers.
 */
async function importManifestDefault(
  manifestPath: string,
): Promise<Array<{ pattern: string; handlerStatus: number }>> {
  const { execFileSync } = await import('node:child_process')
  const url = pathToFileURL(manifestPath).href
  const script = [
    `const mod = await import(${JSON.stringify(url)})`,
    'const routes = mod.default',
    'const out = routes.map((r) => ({ pattern: r.pattern, handlerStatus: r.handler().status }))',
    'process.stdout.write(JSON.stringify(out))',
  ].join('\n')
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  })
  return JSON.parse(stdout)
}

/**
 * Drive an emitted `_worker.js` in a real child Node process, with a stubbed
 * ASSETS binding, and report the response plus every path ASSETS was asked for.
 *
 * A child process for the SAME reason `importManifestDefault` above uses one:
 * vitest routes a bare `import()` of an out-of-project temp path through Vite's
 * transform pipeline, which cannot resolve it. Node's own loader is also the
 * faithful equivalent of what the Workers runtime does at load time.
 *
 * `missing` picks the stub's disposition: `true` makes every path except
 * `/index.html` a 404 (the deep-link case), `false` makes everything a hit.
 */
async function driveWorker(
  workerPath: string,
  url: string,
  missing: boolean,
): Promise<{ status: number; body: string; hits: string[] }> {
  const { execFileSync } = await import('node:child_process')
  const script = [
    `const mod = await import(${JSON.stringify(pathToFileURL(workerPath).href)})`,
    'const hits = []',
    'const env = { ASSETS: { fetch: async (req) => {',
    '  const path = new URL(req.url).pathname',
    '  hits.push(path)',
    `  if (!${JSON.stringify(missing)}) return new Response('ASSET', { status: 200 })`,
    "  return path === '/index.html'",
    "    ? new Response('SHELL', { status: 200 })",
    "    : new Response('nope', { status: 404 })",
    '} } }',
    `const res = await mod.default.fetch(new Request(${JSON.stringify(url)}), env, {})`,
    'const body = await res.text()',
    'process.stdout.write(JSON.stringify({ status: res.status, body, hits }))',
  ].join('\n')
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  })
  return JSON.parse(stdout)
}

type ContextRoute = AdapterContext['routes'][number]

/** Sample routes mirroring the shape produced by buildAdapterContext(). */
const SAMPLE_ROUTES: ContextRoute[] = [
  {
    pattern: '/',
    segments: [],
    module: () => Promise.resolve({ default: null }),
  },
  {
    pattern: '/posts/:slug',
    segments: [
      { kind: 'static', path: 'posts' },
      { kind: 'param', name: 'slug' },
    ],
    module: () => Promise.resolve({ default: null }),
  },
]

function makeContext(root: string, outDir: string, routes: ContextRoute[] = []): AdapterContext {
  return {
    outDir,
    root,
    routes,
    config: {},
    async emitFile(path, content) {
      const abs = join(outDir, path)
      const { mkdir, writeFile: wf } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      await mkdir(dirname(abs), { recursive: true })
      await wf(abs, content, 'utf8')
    },
    async copy(src, dest) {
      const { cp, mkdir } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      await mkdir(dirname(dest), { recursive: true })
      await cp(src, dest, { recursive: true, force: true })
    },
    async writeFile(absolutePath, content) {
      const { mkdir, writeFile: wf } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      await mkdir(dirname(absolutePath), { recursive: true })
      await wf(absolutePath, content, 'utf8')
    },
    // Real handler-source shape (matches @aihu/app's buildAdapterContext).
    // Honors routesSpecifier so the SSR worker import points at the file the
    // adapter actually emits.
    createHandlerSource(opts) {
      const routesSpec = opts?.routesSpecifier ?? './routes-manifest.js'
      const serverSpec = opts?.serverSpecifier ?? '@aihu/server'
      return [
        '// AUTO-GENERATED — do not edit',
        `import { createRequestRouter } from '${serverSpec}'`,
        `import routes from '${routesSpec}'`,
        'const _manifest = { routes }',
        'const _handler = createRequestRouter(_manifest)',
        'export { _handler as handler }',
      ].join('\n')
    },
  }
}

describe('@aihu/adapter-cloudflare', () => {
  let tmpRoot: string
  let tmpOut: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'aihu-cf-test-'))
    tmpOut = join(tmpRoot, 'dist')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(tmpOut, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('writes _worker.js to outDir', async () => {
    const adapter = cloudflare({ name: 'test-worker', generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    expect(worker).toContain('export default')
    expect(worker).toContain('env.ASSETS.fetch')
  })

  it('generates wrangler.toml when absent', async () => {
    const adapter = cloudflare({ name: 'my-worker' })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const wranglerPath = join(tmpRoot, 'wrangler.toml')
    expect(existsSync(wranglerPath)).toBe(true)
    const toml = await readFile(wranglerPath, 'utf8')
    expect(toml).toContain('name = "my-worker"')
    expect(toml).toContain('main = "_worker.js"')
    expect(toml).toContain('[assets]')
  })

  it('does NOT overwrite existing wrangler.toml', async () => {
    const wranglerPath = join(tmpRoot, 'wrangler.toml')
    await writeFile(wranglerPath, '# custom wrangler config\nname = "existing"\n', 'utf8')
    const adapter = cloudflare({ name: 'new-name' })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const toml = await readFile(wranglerPath, 'utf8')
    expect(toml).toContain('name = "existing"')
    expect(toml).not.toContain('name = "new-name"')
  })

  it('skips wrangler.toml when generateWrangler is false', async () => {
    const adapter = cloudflare({ name: 'test-worker', generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    expect(existsSync(join(tmpRoot, 'wrangler.toml'))).toBe(false)
  })

  it('adapter name is "cloudflare"', () => {
    const adapter = cloudflare()
    expect(adapter.name).toBe('cloudflare')
  })

  it('_worker.js contains SPA fallback to index.html', async () => {
    const adapter = cloudflare({ generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    expect(worker).toContain('index.html')
  })

  it('uses package.json name as fallback worker name', async () => {
    await writeFile(join(tmpRoot, 'package.json'), JSON.stringify({ name: 'my-aihu-app' }), 'utf8')
    const adapter = cloudflare()
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const wranglerPath = join(tmpRoot, 'wrangler.toml')
    const toml = await readFile(wranglerPath, 'utf8')
    expect(toml).toContain('name = "my-aihu-app"')
  })
})

describe('@aihu/adapter-cloudflare — SSR hybrid mode (ssr: true)', () => {
  let tmpRoot: string
  let tmpOut: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'aihu-cf-ssr-'))
    tmpOut = join(tmpRoot, 'dist')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(tmpOut, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('emits SSR hybrid _worker.js when ssr: true', async () => {
    const adapter = cloudflare({ ssr: true, generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    expect(worker).toContain('SSR + static hybrid')
    expect(worker).toContain('handler(request')
    expect(worker).toContain('env.ASSETS.fetch')
    expect(worker).toContain('index.html')
  })

  it('inlines the real createHandlerSource() output in SSR worker', async () => {
    const adapter = cloudflare({ ssr: true, generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut, SAMPLE_ROUTES)
    await adapter.adapt(ctx)
    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    // Real handler wiring is inlined (not a stub string).
    expect(worker).toContain('createRequestRouter')
    expect(worker).toContain("import routes from './routes-manifest.js'")
    expect(worker).toContain('const _manifest = { routes }')
  })

  it('emits routes-manifest.js alongside _worker.js (R4.2 regression)', async () => {
    const adapter = cloudflare({ ssr: true, generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut, SAMPLE_ROUTES)
    await adapter.adapt(ctx)
    // Both files must exist in outDir — the import target and the importer.
    expect(existsSync(join(tmpOut, '_worker.js'))).toBe(true)
    expect(existsSync(join(tmpOut, 'routes-manifest.js'))).toBe(true)
  })

  it('routes-manifest.js default-exports the serialized routes', async () => {
    const adapter = cloudflare({ ssr: true, generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut, SAMPLE_ROUTES)
    await adapter.adapt(ctx)

    const manifestPath = join(tmpOut, 'routes-manifest.js')
    // Evaluate the emitted module in a real Node import — proves it is valid
    // JS with a working default export and callable handlers. Vitest routes
    // bare `import()` through Vite (which rejects out-of-root temp paths), so
    // evaluate in a child Node process and round-trip the result as JSON.
    const routes = await importManifestDefault(manifestPath)

    expect(Array.isArray(routes)).toBe(true)
    expect(routes.map((r) => r.pattern)).toEqual(['/', '/posts/:slug'])
    // Each route carries a callable handler — required by createRequestRouter.
    for (const r of routes) {
      expect(r.handlerStatus).toBe(404)
    }
  })

  it("_worker.js's manifest import resolves to an existing file", async () => {
    const adapter = cloudflare({ ssr: true, generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut, SAMPLE_ROUTES)
    await adapter.adapt(ctx)

    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    // Extract the specifier the worker actually imports and resolve it against
    // outDir (where _worker.js lives). The resolved path must exist on disk —
    // this is the exact check `wrangler pages dev` performs at bundle time.
    const match = worker.match(/import\s+routes\s+from\s+'([^']+)'/)
    expect(match).not.toBeNull()
    const specifier = match?.[1] as string
    const resolved = resolvePath(tmpOut, specifier)
    expect(existsSync(resolved)).toBe(true)
  })

  it('emits routes-manifest.js even with zero routes', async () => {
    const adapter = cloudflare({ ssr: true, generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut, [])
    await adapter.adapt(ctx)
    const manifestPath = join(tmpOut, 'routes-manifest.js')
    expect(existsSync(manifestPath)).toBe(true)
    const routes = await importManifestDefault(manifestPath)
    expect(routes).toEqual([])
  })

  it('SPA mode does NOT emit routes-manifest.js', async () => {
    const adapter = cloudflare({ generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut, SAMPLE_ROUTES)
    await adapter.adapt(ctx)
    expect(existsSync(join(tmpOut, 'routes-manifest.js'))).toBe(false)
  })

  it('SSR worker checks handler response status before ASSETS fallback', async () => {
    const adapter = cloudflare({ ssr: true, generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    expect(worker).toContain('response.status !== 404')
  })

  it('SPA mode (default) does not contain handler() call', async () => {
    const adapter = cloudflare({ generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    expect(worker).not.toContain('handler(request')
    expect(worker).toContain('SPA mode')
  })

  it('ssr: true still generates wrangler.toml when absent', async () => {
    const adapter = cloudflare({ ssr: true, name: 'ssr-worker' })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const toml = await readFile(join(tmpRoot, 'wrangler.toml'), 'utf8')
    expect(toml).toContain('name = "ssr-worker"')
    expect(toml).toContain('[assets]')
  })
})

// ---------------------------------------------------------------------------
// `output: 'ssr'` wrangler.toml. This whole branch was UNTESTED: the only
// fixture that exercises `output: 'ssr'` end to end (`@aihu/app`'s
// workers-ssr-e2e) passes `generateWrangler: false`, so nothing had ever read
// the file this adapter tells people to deploy with.
// ---------------------------------------------------------------------------

describe("@aihu/adapter-cloudflare — output: 'ssr' wrangler.toml", () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'aihu-cf-ssr-toml-'))
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  /** An `output: 'ssr'` context whose client outDir is `<root>/<dir>`. */
  async function adaptSsr(dir: string, name = 'ssr-app'): Promise<string> {
    const outDir = join(tmpRoot, dir)
    const { mkdir } = await import('node:fs/promises')
    await mkdir(outDir, { recursive: true })
    const ctx: AdapterContext = { ...makeContext(tmpRoot, outDir), config: { output: 'ssr' } }
    await cloudflare({ name }).adapt(ctx)
    return readFile(join(tmpRoot, 'wrangler.toml'), 'utf8')
  }

  it('derives `main` from the client outDir instead of hardcoding dist-server', async () => {
    // THE finding. `[assets] directory` was already parameterized while `main`
    // was the literal `"dist-server/_worker.js"`, so a project that configured
    // `build.outDir: 'build'` got a worker emitted at `build-server/_worker.js`
    // and a wrangler.toml pointing at a path that does not exist — `wrangler
    // deploy` fails to find its entry point.
    const toml = await adaptSsr('build')
    expect(toml).toContain('main = "build-server/_worker.js"')
    expect(toml).not.toContain('dist-server')
    // …and the assets root is still the CLIENT dir, never the server one (D-2).
    expect(toml).toContain('directory = "build"')
  })

  it('still emits dist-server for the default outDir', async () => {
    // The derivation must not have changed the common case.
    const toml = await adaptSsr('dist')
    expect(toml).toContain('main = "dist-server/_worker.js"')
    expect(toml).toContain('directory = "dist"')
  })

  it('agrees with @aihu/app about where the ssr environment writes', async () => {
    // Pinned against the framework's own derivation rather than against a
    // second copy of the rule spelled out here — a literal would drift the
    // moment `ssrOutDirFor` changed, which is the bug being fixed.
    for (const dir of ['dist', 'build', 'out', 'public-dist']) {
      const root = await mkdtemp(join(tmpdir(), 'aihu-cf-agree-'))
      const outDir = join(root, dir)
      const { mkdir } = await import('node:fs/promises')
      await mkdir(outDir, { recursive: true })
      const ctx: AdapterContext = { ...makeContext(root, outDir), config: { output: 'ssr' } }
      await cloudflare({ name: 'x' }).adapt(ctx)
      const toml = await readFile(join(root, 'wrangler.toml'), 'utf8')
      expect(toml).toContain(`main = "${ssrOutDirFor(dir)}/_worker.js"`)
      await rm(root, { recursive: true, force: true })
    }
  })

  it('sets run_worker_first so the Worker is not bypassed by the static shell', async () => {
    // Cloudflare's Workers Assets routing serves a matching asset BEFORE the
    // Worker (`run_worker_first` defaults to false), and `html_handling`
    // (default `auto-trailing-slash`) maps `/` to the `index.html` that the SSR
    // build writes into the very directory `[assets]` points at. Without this
    // key an `output: 'ssr'` site serves its home page as the empty SPA shell
    // and never invokes the Worker — SSR silently off on the most important
    // route in the app.
    const toml = await adaptSsr('dist')
    expect(toml).toContain('run_worker_first = true')
  })

  it('does NOT set run_worker_first in SPA mode', async () => {
    // There, serving the asset first is the entire point; a Worker that only
    // proxies ASSETS would be pure per-request overhead.
    const outDir = join(tmpRoot, 'dist')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(outDir, { recursive: true })
    await cloudflare({ name: 'spa-app' }).adapt(makeContext(tmpRoot, outDir))
    const toml = await readFile(join(tmpRoot, 'wrangler.toml'), 'utf8')
    expect(toml).not.toContain('run_worker_first')
    expect(toml).toContain('main = "_worker.js"')
    expect(toml).toContain('directory = "."')
  })
})

describe('@aihu/adapter-cloudflare — the ASSETS fallback actually runs', () => {
  let tmpRoot: string
  let tmpOut: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'aihu-cf-fallback-'))
    tmpOut = join(tmpRoot, 'dist')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(tmpOut, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('checks the ASSETS status rather than catching a rejection that never happens', async () => {
    // `env.ASSETS.fetch` is documented as resolving with a Response — an
    // unmatched request comes back as a 404, it does not reject. So the
    // `try { … } catch { …index.html… }` these workers used to carry was dead
    // code, and the SPA deep-link fallback this adapter advertises had never
    // run once.
    await cloudflare({ generateWrangler: false }).adapt(makeContext(tmpRoot, tmpOut))
    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    expect(worker).toContain('assetResponse.status !== 404')
    expect(worker).not.toMatch(/}\s*catch\s*{/)
  })

  it('the emitted SPA worker really serves index.html on a 404 — driven, not grepped', async () => {
    // The claim is behavioural, so the assertion is too: load the emitted
    // module and drive it with an ASSETS stub that 404s exactly like the real
    // binding does. A string assertion would have passed against the dead
    // catch as happily as against the fix — the catch was, after all, still
    // spelled correctly.
    await cloudflare({ generateWrangler: false }).adapt(makeContext(tmpRoot, tmpOut))
    const out = await driveWorker(join(tmpOut, '_worker.js'), 'https://x.test/deep/link', true)
    expect(out.status).toBe(200)
    expect(out.body).toBe('SHELL')
    // Asked for the path, missed, then asked for the shell — the fallback ran.
    expect(out.hits).toEqual(['/deep/link', '/index.html'])
  })

  it('a real asset is returned as-is, without the shell fallback', async () => {
    // The other direction: a 200 from ASSETS must be handed straight back, not
    // re-fetched as the shell.
    await cloudflare({ generateWrangler: false }).adapt(makeContext(tmpRoot, tmpOut))
    const out = await driveWorker(join(tmpOut, '_worker.js'), 'https://x.test/assets/app.js', false)
    expect(out.status).toBe(200)
    expect(out.body).toBe('ASSET')
    expect(out.hits).toEqual(['/assets/app.js'])
  })
})
