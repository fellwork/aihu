import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AdapterContext } from '@aihu/app'
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
