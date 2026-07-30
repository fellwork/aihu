/**
 * virtual:aihu-entry tests — eliminates the need for a scaffolded
 * `src/main.ts` (packages/cli/src/index.ts's appMainTs/appIndexHtml no
 * longer write one for the minimal/docs templates).
 *
 * Three layers of proof:
 *   1. Unit — injectEntryScript() string transform (injection + both escape
 *      hatches: a real src/main.ts, or any pre-existing module script tag).
 *   2. Plugin registration — viteAihuPlugin() wires up resolveId/load/
 *      transformIndexHtml for the virtual module.
 *   3. End-to-end — a real `vite build` proves the virtual module is
 *      resolvable as an HTML script-tag entry (the one mechanism this repo
 *      had no prior precedent for) in both the injected and ejected cases.
 */

import { existsSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ENTRY_RESOLVED_ID,
  ENTRY_SOURCE,
  ENTRY_VIRTUAL_ID,
  injectEntryScript,
} from '../src/entry.ts'
import { viteAihuPlugin } from '../src/vite-plugin.ts'

const sourceHtml =
  '<!doctype html><html><head><title>Scaffold</title></head><body><div id="outlet"></div></body></html>'

describe('injectEntryScript — injection & escape hatches', () => {
  it('injects the virtual entry script before </body> when there is no user entry', () => {
    const out = injectEntryScript(sourceHtml, false)
    expect(out).toContain(`<script type="module" src="${ENTRY_VIRTUAL_ID}"></script>`)
    expect(out.indexOf('<script')).toBeLessThan(out.indexOf('</body>'))
  })

  it('leaves html unchanged when a real src/main.ts exists (full eject)', () => {
    expect(injectEntryScript(sourceHtml, true)).toBe(sourceHtml)
  })

  it('leaves html unchanged when a module script tag is already present', () => {
    const authored =
      '<!doctype html><html><body><script type="module" src="./src/main.ts"></script></body></html>'
    expect(injectEntryScript(authored, false)).toBe(authored)
  })

  it('leaves html unchanged when there is no </body> to inject before', () => {
    const fragment = '<div>no body tag here</div>'
    expect(injectEntryScript(fragment, false)).toBe(fragment)
  })
})

describe('aihu-entry plugin — hooks are registered', () => {
  it('viteAihuPlugin() includes an aihu-entry plugin with resolveId/load/transformIndexHtml', () => {
    const plugins = viteAihuPlugin()
    const entry = plugins.find((p) => (p as Plugin).name === 'aihu-entry') as Plugin
    expect(entry).toBeDefined()
    expect(entry.resolveId).toBeDefined()
    expect(entry.load).toBeDefined()
    expect(entry.transformIndexHtml).toBeDefined()
  })
})

describe('end-to-end: vite build resolves virtual:aihu-entry as a real HTML script-tag entry', () => {
  let injectedDir: string
  let ejectedDir: string

  afterAll(async () => {
    if (injectedDir) await rm(injectedDir, { recursive: true, force: true })
    if (ejectedDir) await rm(ejectedDir, { recursive: true, force: true })
  })

  /**
   * Build the entry plugin object directly from the exported pieces — the
   * same construction viteAihuPlugin() registers (see the suite above), but
   * inline so the nested `vite build` does not re-resolve @aihu/router/plugin
   * or @aihu/compiler (build-time subpaths whose dist isn't built in the
   * test environment).
   */
  function makeEntryPlugin(root: string): Plugin {
    return {
      name: 'aihu-entry',
      resolveId(id) {
        return id === ENTRY_VIRTUAL_ID ? ENTRY_RESOLVED_ID : null
      },
      load(id) {
        return id === ENTRY_RESOLVED_ID ? ENTRY_SOURCE : null
      },
      transformIndexHtml: {
        order: 'pre',
        handler(html: string) {
          const hasUserEntry = existsSync(join(root, 'src/main.ts'))
          return injectEntryScript(html, hasUserEntry)
        },
      },
    }
  }

  // @aihu/app/client (what ENTRY_SOURCE imports) itself statically imports
  // virtual:aihu-{routes,layouts,components} — normally provided by
  // viteRouterIntegration, deliberately excluded here (see makeEntryPlugin's
  // doc comment). A build only needs to BUNDLE the module graph, not execute
  // it, so a syntactically-valid default export per specifier is enough.
  function stubRouterVirtualsPlugin(): Plugin {
    const specs: Record<string, string> = {
      'virtual:aihu-routes': '\0virtual:aihu-routes',
      'virtual:aihu-layouts': '\0virtual:aihu-layouts',
      'virtual:aihu-components': '\0virtual:aihu-components',
    }
    return {
      name: 'stub-router-virtuals',
      resolveId(id) {
        return specs[id] ?? null
      },
      load(id) {
        return Object.values(specs).includes(id) ? 'export default []' : null
      },
    }
  }

  it('injects and builds virtual:aihu-entry when no src/main.ts exists', async () => {
    const { build } = await import('vite')

    // realpath resolves the macOS /var → /private/var symlink that rolldown
    // would otherwise reject as an absolute-looking path when emitting HTML.
    injectedDir = await realpath(await mkdtemp(join(tmpdir(), 'aihu-entry-injected-')))
    await writeFile(
      join(injectedDir, 'index.html'),
      '<!doctype html>\n<html>\n<head>\n<title>Injected</title>\n</head>\n<body>\n<div id="outlet"></div>\n</body>\n</html>\n',
    )

    await build({
      root: injectedDir,
      logLevel: 'silent',
      plugins: [makeEntryPlugin(injectedDir), stubRouterVirtualsPlugin()],
      build: { outDir: join(injectedDir, 'dist'), emptyOutDir: true },
    })

    const builtHtml = await readFile(join(injectedDir, 'dist', 'index.html'), 'utf8')
    // The injected virtual-entry script tag was resolved into a real,
    // hashed build asset — proof the virtual module worked as an HTML entry.
    expect(builtHtml).toMatch(/<script[^>]*type="module"[^>]*src="\/assets\/index-[^"]+\.js"/)

    const assetFiles = readdirSync(join(injectedDir, 'dist', 'assets'))
    const jsFile = assetFiles.find((f) => f.endsWith('.js'))
    expect(jsFile).toBeDefined()
    const bundled = await readFile(join(injectedDir, 'dist', 'assets', jsFile as string), 'utf8')
    // Bundled output actually contains @aihu/app/client's real code (a
    // string literal that survives minification, unlike the `createApp`
    // identifier itself, which gets renamed) — proof the virtual module's
    // `import { createApp } from '@aihu/app/client'; createApp()` source
    // was resolved, bundled, and invoked, not just an empty entry.
    expect(bundled).toContain('no element with id=')
  })

  it('does NOT inject virtual:aihu-entry when a real src/main.ts exists (escape hatch, end-to-end)', async () => {
    const { build } = await import('vite')

    ejectedDir = await realpath(await mkdtemp(join(tmpdir(), 'aihu-entry-ejected-')))
    await writeFile(
      join(ejectedDir, 'index.html'),
      '<!doctype html>\n<html>\n<body>\n<div id="outlet"></div>\n<script type="module" src="./src/main.ts"></script>\n</body>\n</html>\n',
    )
    await mkdir(join(ejectedDir, 'src'), { recursive: true })
    await writeFile(
      join(ejectedDir, 'src', 'main.ts'),
      'document.getElementById("outlet").textContent = "ejected"\n',
    )

    await build({
      root: ejectedDir,
      logLevel: 'silent',
      plugins: [makeEntryPlugin(ejectedDir)],
      build: { outDir: join(ejectedDir, 'dist'), emptyOutDir: true },
    })

    const assetFiles = readdirSync(join(ejectedDir, 'dist', 'assets'))
    const jsFile = assetFiles.find((f) => f.endsWith('.js'))
    expect(jsFile).toBeDefined()
    const bundled = await readFile(join(ejectedDir, 'dist', 'assets', jsFile as string), 'utf8')
    // The real src/main.ts shipped, not the virtual createApp() default.
    expect(bundled).toContain('ejected')
    expect(bundled).not.toContain('createApp')
  })
})
