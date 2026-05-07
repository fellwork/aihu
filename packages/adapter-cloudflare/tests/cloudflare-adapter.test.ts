import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AdapterContext } from '@aihu/app'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cloudflare } from '../src/index.ts'

function makeContext(root: string, outDir: string): AdapterContext {
  return {
    outDir,
    root,
    routes: [],
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
    createHandlerSource() {
      return '// handler source'
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

  it('inlines createHandlerSource() output in SSR worker', async () => {
    const adapter = cloudflare({ ssr: true, generateWrangler: false })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const worker = await readFile(join(tmpOut, '_worker.js'), 'utf8')
    expect(worker).toContain('// handler source')
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
