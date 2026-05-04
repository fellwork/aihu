import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { vercel } from '../src/index.ts'
import type { AdapterContext } from '@scribe/app'

function makeContext(root: string, outDir: string): AdapterContext {
  return {
    outDir,
    root,
    routes: [],
    config: {},
    async emitFile(path, content) {
      const abs = join(outDir, path)
      const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      await mk(dirname(abs), { recursive: true })
      await wf(abs, content, 'utf8')
    },
    async copy(src, dest) {
      const { cp, mkdir: mk } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      await mk(dirname(dest), { recursive: true })
      await cp(src, dest, { recursive: true, force: true })
    },
    async writeFile(absolutePath, content) {
      const { mkdir: mk, writeFile: wf } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      await mk(dirname(absolutePath), { recursive: true })
      await wf(absolutePath, content, 'utf8')
    },
    createHandlerSource() {
      return '// handler source'
    },
  }
}

describe('@scribe/adapter-vercel', () => {
  let tmpRoot: string
  let tmpOut: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'scribe-vercel-test-'))
    tmpOut = join(tmpRoot, 'dist')
    await mkdir(tmpOut, { recursive: true })
    // put a sentinel file in outDir to verify it gets copied
    await writeFile(join(tmpOut, 'index.html'), '<html>app</html>', 'utf8')
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('adapter name is "vercel"', () => {
    const adapter = vercel()
    expect(adapter.name).toBe('vercel')
  })

  it('copies static assets to .vercel/output/static/', async () => {
    const adapter = vercel({ outputDir: join(tmpRoot, '.vercel/output') })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const staticIndex = join(tmpRoot, '.vercel/output/static/index.html')
    expect(existsSync(staticIndex)).toBe(true)
    const html = await readFile(staticIndex, 'utf8')
    expect(html).toContain('<html>app</html>')
  })

  it('writes config.json with Build Output API v3 routes', async () => {
    const adapter = vercel({ outputDir: join(tmpRoot, '.vercel/output') })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const configPath = join(tmpRoot, '.vercel/output/config.json')
    expect(existsSync(configPath)).toBe(true)
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    expect(config.version).toBe(3)
    expect(Array.isArray(config.routes)).toBe(true)
  })

  it('config.json routes include assets cache-control, /api/ dest, and SPA fallback', async () => {
    const adapter = vercel({ outputDir: join(tmpRoot, '.vercel/output') })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const config = JSON.parse(
      await readFile(join(tmpRoot, '.vercel/output/config.json'), 'utf8'),
    )
    const routes: Array<Record<string, unknown>> = config.routes

    const assetsRoute = routes.find((r) => String(r.src).includes('assets'))
    expect(assetsRoute).toBeDefined()
    expect((assetsRoute!.headers as Record<string, string>)['cache-control']).toContain(
      'immutable',
    )

    const apiRoute = routes.find((r) => String(r.src).includes('api'))
    expect(apiRoute).toBeDefined()
    expect(apiRoute!.dest).toBe('/index.func')

    const spaRoute = routes[routes.length - 1]
    expect(spaRoute?.dest).toBe('/static/index.html')
  })

  it('writes edge function entry by default', async () => {
    const adapter = vercel({ outputDir: join(tmpRoot, '.vercel/output') })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const funcEntry = join(tmpRoot, '.vercel/output/functions/index.func/index.js')
    expect(existsSync(funcEntry)).toBe(true)
    const src = await readFile(funcEntry, 'utf8')
    expect(src).toContain('export default')
    expect(src).toContain("runtime: 'edge'")
  })

  it('writes .vc-config.json for edge runtime', async () => {
    const adapter = vercel({ outputDir: join(tmpRoot, '.vercel/output') })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const vcConfig = JSON.parse(
      await readFile(
        join(tmpRoot, '.vercel/output/functions/index.func/.vc-config.json'),
        'utf8',
      ),
    )
    expect(vcConfig.runtime).toBe('edge')
    expect(vcConfig.entrypoint).toBe('index.js')
  })

  it('writes serverless function entry when runtime is "serverless"', async () => {
    const adapter = vercel({
      runtime: 'serverless',
      outputDir: join(tmpRoot, '.vercel/output'),
    })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const funcEntry = join(tmpRoot, '.vercel/output/functions/index.func/index.js')
    const src = await readFile(funcEntry, 'utf8')
    expect(src).toContain('response.status')
    expect(src).not.toContain("runtime: 'edge'")
  })

  it('writes .vc-config.json with nodeVersion for serverless runtime', async () => {
    const adapter = vercel({
      runtime: 'serverless',
      nodeVersion: 'nodejs20.x',
      outputDir: join(tmpRoot, '.vercel/output'),
    })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    const vcConfig = JSON.parse(
      await readFile(
        join(tmpRoot, '.vercel/output/functions/index.func/.vc-config.json'),
        'utf8',
      ),
    )
    expect(vcConfig.runtime).toBe('nodejs20.x')
    expect(vcConfig.handler).toBe('index.js')
  })

  it('cleans output directory before writing', async () => {
    const outputDir = join(tmpRoot, '.vercel/output')
    // pre-create a stale file
    await mkdir(join(outputDir, 'stale-dir'), { recursive: true })
    await writeFile(join(outputDir, 'stale-dir/old-file.txt'), 'stale', 'utf8')

    const adapter = vercel({ outputDir })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)

    expect(existsSync(join(outputDir, 'stale-dir/old-file.txt'))).toBe(false)
  })

  it('respects custom outputDir option', async () => {
    const customOut = join(tmpRoot, 'custom-out')
    const adapter = vercel({ outputDir: customOut })
    const ctx = makeContext(tmpRoot, tmpOut)
    await adapter.adapt(ctx)
    expect(existsSync(join(customOut, 'config.json'))).toBe(true)
    expect(existsSync(join(customOut, 'static/index.html'))).toBe(true)
  })
})
