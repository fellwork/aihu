/**
 * Fixture for `packages/app/tests/workers-ssr-e2e.test.ts`.
 *
 * A real consumer-shaped project: `viteAihuPlugin({ output: 'ssr' })` plus the
 * Cloudflare adapter, built by a real `vite build` subprocess. Nothing here is
 * test-aware except the CONTROL switch below.
 */

import { cloudflare } from '@aihu/adapter-cloudflare'
import { viteAihuPlugin } from '@aihu/app'
import { defineConfig, type Plugin } from 'vite'

/**
 * THE CONTROL (`AIHU_E2E_CONTROL=1`).
 *
 * Shadows `virtual:aihu-server-components` with an EMPTY registry, changing
 * nothing else — same pages, same components, same entry, same renderer. If the
 * grandchild's text still appears in this build's HTML, it is coming from
 * somewhere other than the child registry (inlined in the page's own compiled
 * template, say), and the main assertion would have been passing for the wrong
 * reason.
 *
 * `enforce: 'pre'` so it wins over `@aihu/router`'s own resolveId.
 */
const emptyRegistry: Plugin = {
  name: 'e2e-control-empty-server-components',
  enforce: 'pre',
  resolveId: (id) =>
    id === 'virtual:aihu-server-components' ? '\0e2e-control-empty-registry' : null,
  load: (id) => (id === '\0e2e-control-empty-registry' ? 'export default {}\n' : null),
}

const control = process.env.AIHU_E2E_CONTROL === '1'

/**
 * THE NON-DEFAULT OUTLET VARIANT (`AIHU_E2E_OUTLET=1`).
 *
 * `outlet` is the standard and every default path uses it, which is exactly why
 * a fix that "reads the configured id" is unverifiable against the default:
 * hardcoding `'outlet'` and resolving `'outlet'` are indistinguishable. This
 * variant sets `app.outletId` to something else AND renames the element in
 * `index.html` to match, so a build that still hardcodes the default produces a
 * document with an EMPTY outlet and no rendered page in it.
 *
 * The rename is a `transformIndexHtml`, not a second fixture file, so both
 * variants share ONE authored document and cannot drift apart.
 */
const outletVariant = process.env.AIHU_E2E_OUTLET === '1'
const renameOutlet: Plugin = {
  name: 'e2e-rename-outlet',
  transformIndexHtml: {
    order: 'pre',
    handler: (html: string) => html.replace('id="outlet"', 'id="app-root"'),
  },
}

const outDir = control ? 'dist-control' : outletVariant ? 'dist-outlet' : 'dist'

export default defineConfig({
  plugins: [
    ...(control ? [emptyRegistry] : []),
    ...(outletVariant ? [renameOutlet] : []),
    viteAihuPlugin({
      output: 'ssr',
      // REQUIRED by `output: 'ssr'` — without it leaf components export no
      // `__aihu_shadow__` and every child renders empty. The build refuses
      // rather than letting that ship silently.
      css: { shadowMode: 'light' },
      dir: { pages: 'pages', components: 'src/components' },
      adapter: cloudflare({ name: 'workers-ssr-fixture', generateWrangler: false }),
      ...(outletVariant ? { app: { outletId: 'app-root' } } : {}),
      vite: {
        build: { outDir, emptyOutDir: true },
      },
    }),
  ],
})
