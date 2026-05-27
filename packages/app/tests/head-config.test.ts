/**
 * app.head injection tests.
 *
 * Regression coverage for the bug where AihuConfig.app.head (HeadConfig:
 * title/charset/viewport/meta[]) was accepted by defineConfig() but never read
 * by any plugin — silently dropped from the built dist/index.html.
 *
 * Two layers of proof:
 *   1. Unit — applyHeadConfig() string transform (merge/precedence rules).
 *   2. End-to-end — a real `vite build` of a tiny fixture whose configured
 *      app.head (a title + a description meta) appears in the built index.html.
 */

import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { applyHeadConfig } from '../src/head.ts'
import { viteAihuPlugin } from '../src/vite-plugin.ts'

describe('applyHeadConfig — merge & precedence', () => {
  const sourceHtml =
    '<!doctype html><html><head><meta charset="utf-8"><title>Scaffold</title></head><body><div id="app"></div></body></html>'

  it('returns html unchanged when head is undefined', () => {
    expect(applyHeadConfig(sourceHtml, undefined)).toBe(sourceHtml)
  })

  it('replaces an existing <title> rather than duplicating it', () => {
    const out = applyHeadConfig(sourceHtml, { title: 'My App' })
    expect(out).toContain('<title>My App</title>')
    expect(out).not.toContain('<title>Scaffold</title>')
    expect(out.match(/<title>/g)).toHaveLength(1)
  })

  it('injects <title> when the source has none', () => {
    const out = applyHeadConfig('<html><head></head><body></body></html>', { title: 'Fresh' })
    expect(out).toContain('<title>Fresh</title>')
  })

  it('replaces an existing charset rather than duplicating it (config wins)', () => {
    const out = applyHeadConfig(sourceHtml, { charset: 'UTF-8' })
    expect(out).toContain('<meta charset="UTF-8">')
    expect(out).not.toContain('charset="utf-8"')
    expect(out.match(/charset=/g)).toHaveLength(1)
  })

  it('injects a viewport meta and a description meta from meta[]', () => {
    const out = applyHeadConfig(sourceHtml, {
      viewport: 'width=device-width, initial-scale=1',
      meta: [{ name: 'description', content: 'A great app' }],
    })
    expect(out).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(out).toContain('<meta name="description" content="A great app">')
  })

  it('replaces an existing meta with a matching name (no duplicate)', () => {
    const src = '<html><head><meta name="description" content="old"></head><body></body></html>'
    const out = applyHeadConfig(src, { meta: [{ name: 'description', content: 'new' }] })
    expect(out).toContain('content="new"')
    expect(out).not.toContain('content="old"')
    expect(out.match(/name="description"/g)).toHaveLength(1)
  })

  it('supports property-keyed meta (e.g. Open Graph)', () => {
    const out = applyHeadConfig('<html><head></head><body></body></html>', {
      meta: [{ property: 'og:title', content: 'Share Title' }],
    })
    expect(out).toContain('<meta property="og:title" content="Share Title">')
  })

  it('escapes attribute and text content to prevent broken markup', () => {
    const out = applyHeadConfig('<html><head></head><body></body></html>', {
      title: 'A & B <x>',
      meta: [{ name: 'description', content: 'quote " and <tag>' }],
    })
    expect(out).toContain('<title>A &amp; B &lt;x&gt;</title>')
    expect(out).toContain('content="quote &quot; and &lt;tag&gt;"')
  })

  it('appends tags when the source has no </head>', () => {
    const out = applyHeadConfig('<div>no head here</div>', { title: 'X' })
    expect(out).toContain('<title>X</title>')
  })
})

describe('aihu-head plugin — transformIndexHtml hook is registered', () => {
  it('viteAihuPlugin() includes an aihu-head plugin with a transformIndexHtml hook', () => {
    const plugins = viteAihuPlugin({ app: { head: { title: 'Hooked' } } })
    const head = plugins.find((p) => p.name === 'aihu-head')
    expect(head).toBeDefined()
    expect(head?.transformIndexHtml).toBeDefined()
  })

  it('the hook applies the configured head to the html', () => {
    const plugins = viteAihuPlugin({
      app: { head: { title: 'Hooked', meta: [{ name: 'description', content: 'Desc' }] } },
    })
    const head = plugins.find((p) => p.name === 'aihu-head') as Plugin
    const hook = head.transformIndexHtml as {
      handler: (html: string) => string
    }
    const out = hook.handler('<html><head><title>old</title></head><body></body></html>')
    expect(out).toContain('<title>Hooked</title>')
    expect(out).toContain('<meta name="description" content="Desc">')
  })
})

describe('end-to-end: vite build emits app.head into dist/index.html', () => {
  let dir: string

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('built index.html contains the configured title + description meta', async () => {
    const { build } = await import('vite')

    // realpath resolves the macOS /var → /private/var symlink that rolldown
    // would otherwise reject as an absolute-looking path when emitting HTML.
    dir = await realpath(await mkdtemp(join(tmpdir(), 'aihu-head-')))
    await writeFile(
      join(dir, 'index.html'),
      '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>Scaffold Default</title>\n</head>\n<body>\n<div id="app"></div>\n<script type="module" src="/main.js"></script>\n</body>\n</html>\n',
    )
    await writeFile(join(dir, 'main.js'), 'document.getElementById("app").textContent = "hi"\n')

    // Build the head plugin object directly from the exported transform. This
    // is exactly what viteAihuPlugin() registers (see the "hook is registered"
    // suite above), but constructed inline so the nested `vite build` does not
    // re-resolve @aihu/router/plugin (a build-time subpath whose dist isn't
    // built in the test environment).
    const headCfg = {
      title: 'Built Title',
      meta: [{ name: 'description', content: 'A great app for agents and SEO' }],
    }
    const head: Plugin = {
      name: 'aihu-head',
      transformIndexHtml: {
        order: 'post',
        handler: (html: string) => applyHeadConfig(html, headCfg),
      },
    }

    await build({
      root: dir,
      logLevel: 'silent',
      // Only the head plugin — keeps the build free of the Rust compiler and
      // router virtual modules while still exercising the real Vite HTML pipeline.
      plugins: [head],
      build: { outDir: join(dir, 'dist'), emptyOutDir: true },
    })

    const builtHtml = await readFile(join(dir, 'dist', 'index.html'), 'utf8')
    expect(builtHtml).toContain('<title>Built Title</title>')
    expect(builtHtml).not.toContain('<title>Scaffold Default</title>')
    expect(builtHtml).toContain(
      '<meta name="description" content="A great app for agents and SEO">',
    )
    // Charset from source is preserved (config did not override it).
    expect(builtHtml.toLowerCase()).toContain('charset="utf-8"')
  })
})
