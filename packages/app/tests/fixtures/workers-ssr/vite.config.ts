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
    handler: (html: string) => html.replace('id="outlet"', "id='app-root'"),
  },
}

/**
 * THE POISONED-REGISTRY VARIANT (`AIHU_E2E_POISON=1`).
 *
 * Injects ONE unloadable entry into each of the two server registries, leaving
 * every real component and the real `app` layout untouched. A registry build
 * that fails en masse loses all of them; one that degrades per entry loses only
 * the poisoned pair.
 *
 * `Promise.reject` rather than a synchronous `throw` because that is what a
 * dynamic `import()` of a module which throws at ITS OWN scope actually does —
 * the shape `eca2ab46` fixed one instance of (`@aihu/primitives` evaluating
 * `class … extends HTMLElement` at module scope) and which any other module can
 * still reproduce for any other reason.
 *
 * A `transform` over the GENERATED source, rather than a shadowing `load`,
 * because the point is to poison the real registry the real build produced —
 * a hand-written replacement would also be testing the replacement. Gated on
 * the `ssr` environment: `virtual:aihu-layouts` is served to the client build
 * too, and the client's own layout loading is not what is under test here.
 */
const poison = process.env.AIHU_E2E_POISON === '1'
const POISON_COMPONENT =
  "  'probe-poison': () => Promise.reject(new Error('E2E-POISON: component module failed to import')),\n"
const POISON_LAYOUT =
  "  'poison': { tag: 'aihu-layout-poison', load: () => Promise.reject(new Error('E2E-POISON: layout module failed to import')), components: [] },\n"
const poisonRegistries: Plugin = {
  name: 'e2e-poison-registries',
  transform: {
    order: 'post',
    handler(this: { environment?: { name?: string } }, code: string, id: string) {
      if (this.environment?.name !== 'ssr') return null
      if (id === '\0virtual:aihu-server-components') {
        return code.replace('export default {\n', `export default {\n${POISON_COMPONENT}`)
      }
      if (id === '\0virtual:aihu-layouts') {
        return code.replace('export default {\n', `export default {\n${POISON_LAYOUT}`)
      }
      return null
    },
  },
}

/**
 * THE MALFORMED-CONFIG PROBES (`AIHU_E2E_BAD_OUTLET`, `AIHU_E2E_UNQUOTED_OUTLET`).
 *
 * Both are expected to FAIL the build, and the assertion is that they do. An
 * `app.outletId` that is not id-shaped, or a template whose outlet the splice
 * cannot match, used to build green and then diverge silently at request time:
 * the server spliced one place and the client mounted another, reported by at
 * most one `console.error` inside a Worker.
 *
 * Read from the environment rather than committed as two more fixture
 * directories so they share ONE authored project with the passing variants —
 * the point is that the same build that works becomes an error on this one
 * change.
 */
const badOutlet = process.env.AIHU_E2E_BAD_OUTLET
const unquotedOutlet: Plugin = {
  name: 'e2e-unquoted-outlet',
  transformIndexHtml: {
    order: 'pre',
    handler: (html: string) => html.replace('id="outlet"', 'id=outlet'),
  },
}

const outDir = control
  ? 'dist-control'
  : outletVariant
    ? 'dist-outlet'
    : poison
      ? 'dist-poison'
      : badOutlet !== undefined || process.env.AIHU_E2E_UNQUOTED_OUTLET === '1'
        ? 'dist-reject'
        : 'dist'

export default defineConfig({
  plugins: [
    ...(control ? [emptyRegistry] : []),
    ...(outletVariant ? [renameOutlet] : []),
    ...(poison ? [poisonRegistries] : []),
    ...(process.env.AIHU_E2E_UNQUOTED_OUTLET === '1' ? [unquotedOutlet] : []),
    viteAihuPlugin({
      output: 'ssr',
      // REQUIRED by `output: 'ssr'` — without it leaf components export no
      // `__aihu_shadow__` and every child renders empty. The build refuses
      // rather than letting that ship silently.
      css: { shadowMode: 'light' },
      dir: { pages: 'pages', components: 'src/components' },
      adapter: cloudflare({ name: 'workers-ssr-fixture', generateWrangler: false }),
      ...(outletVariant ? { app: { outletId: 'app-root' } } : {}),
      ...(badOutlet !== undefined ? { app: { outletId: badOutlet } } : {}),
      vite: {
        build: { outDir, emptyOutDir: true },
      },
    }),
  ],
})
