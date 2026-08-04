import { copyFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { viteAihuPlugin } from '@aihu/app'
import { viteAgentReadinessIntegration } from '@aihu-plugin/agent-readiness'
import { defineConfig, type Plugin } from 'vite'
import { agentReadinessConfig } from './agent-readiness.config.ts'
import aihuConfig from './aihu.config.ts'

/**
 * Emit a flat `<pattern>.html` beside every prerendered `<pattern>/index.html`,
 * so Cloudflare Pages can answer the extensionless URL directly instead of
 * redirecting to the trailing-slash form.
 *
 * THE PROBLEM. Every link this site publishes is extensionless and WITHOUT a
 * trailing slash — `nav.ts` hrefs, in-prose links, every `@route` `canonical`,
 * every `sitemap.xml` <loc>, every `llms.txt` URL. The SSG, though, only emits
 * `dist/guides/getting-started/index.html`. Under Pages' default
 * `html_handling: "auto-trailing-slash"` a request for `/guides/getting-started`
 * therefore 308-redirects to `/guides/getting-started/`. Verified live on the
 * preview deploy: no-slash → 308, with-slash → 200. Lighthouse scored that as
 * "Redirects — Est savings of 800 ms", on EVERY page, because the redirect sits
 * in front of the document request and blocks everything behind it.
 *
 * WHY THIS FIX RATHER THAN NORMALISING LINKS TO A TRAILING SLASH. The site's
 * declared URL shape is already the no-slash one, in artifacts that are
 * published contracts rather than internal details: the sitemap, llms.txt and
 * the per-route canonicals all name `https://aihu.dev/guides/getting-started`.
 * Adding slashes would mean rewriting all of those plus every href, and would
 * leave the canonical disagreeing with what apps/docs has been advertising.
 * Emitting the file the existing URLs already point at is the smaller, safer
 * change: no link churn at all, so nothing can regress the `?preset=` deep-link
 * contract on /playground, and nothing changes for client-side SPA navigation
 * (the router matches the authored patterns, and never hits the network for an
 * internal link in the first place — the redirect only ever cost hard loads,
 * which is exactly what the sitemap and search results produce).
 *
 * It is also strictly ADDITIVE: `<pattern>/index.html` stays exactly where it
 * was, so `/guides/getting-started/` keeps working for anything already linking
 * that way. If Pages ever resolved these differently than expected, the
 * worst case is the status quo — a redirect — not a 404.
 */
let flatHtmlLogged = false
function flatHtmlSiblings(): Plugin {
  return {
    name: 'docs-next:flat-html-siblings',
    // The prerender runs in viteAihuPlugin's own closeBundle, so this has to be
    // both `post` and last in the plugins array to see the emitted HTML.
    enforce: 'post',
    closeBundle: {
      order: 'post',
      handler() {
        const outDir = resolve(process.cwd(), 'dist')
        let written = 0
        const walk = (dir: string) => {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            const child = join(dir, entry.name)
            walk(child)
            try {
              // `dist/guides/getting-started/index.html` → `dist/guides/getting-started.html`
              copyFileSync(join(child, 'index.html'), `${child}.html`)
              written++
            } catch {
              // directory has no index.html (assets/, fonts/, wasm/, …)
            }
          }
        }
        walk(outDir)
        // The root `dist/index.html` needs no sibling: `/` is served directly.
        //
        // closeBundle fires more than once in this pipeline; the copy is
        // idempotent so it simply re-runs, but only the first result is worth
        // printing.
        if (!flatHtmlLogged) {
          flatHtmlLogged = true
          console.log(`[docs-next] flat-html: ${written} extensionless sibling(s) emitted`)
        }
      },
    },
  }
}

// The SSG build is driven entirely by `aihu.config.ts` (output: 'static').
// viteAihuPlugin wires the Rust compiler, the file-router integration, per-route
// <head> injection, and the prerender closeBundle pass.
//
// viteAgentReadinessIntegration emits the agent-discovery documents (llms.txt,
// llms-full.txt, robots.txt, sitemap.xml, and the MCP/A2A cards) as real static
// assets. Without it Pages' SPA fallback answers those paths with index.html at
// HTTP 200 — see `agent-readiness.config.ts`.
export default defineConfig({
  plugins: [
    viteAihuPlugin(aihuConfig),
    viteAgentReadinessIntegration(agentReadinessConfig),
    flatHtmlSiblings(),
  ],

  build: {
    // Ship ONE stylesheet, statically linked — never per-chunk async CSS.
    //
    // Islands are lazily imported per route (the router's
    // `virtual:aihu-components` registry), and Vite's default
    // `cssCodeSplit: true` splits each island's `@style` out INTO ITS LAZY
    // CHUNK. Deferring an island's JS is the goal; deferring its CSS is not —
    // CSS that arrives after the element upgrades is a flash of unstyled
    // content, and for anything occupying layout, a guaranteed shift. (This
    // site already paid for one CLS regression caused by late-arriving font
    // metrics; late-arriving component CSS is the same failure mode with a
    // different source.)
    //
    // Today that hazard is latent rather than live, because these islands are
    // not in the prerendered HTML at all — nothing reflows because nothing was
    // there. That is an accident of the current shell being client-rendered,
    // not a property worth depending on: the moment any island IS prerendered,
    // split CSS becomes a visible shift.
    //
    // The cost of closing it permanently was measured, not assumed: all CSS
    // combined is 8.74 kB gzipped vs 4.30 kB for the statically-linked subset
    // — roughly +4.4 kB on the critical path, for which Lighthouse showed no
    // change at all (perf 100, LCP 1802ms vs 1803ms, CLS 0.000), while
    // collapsing 27 stylesheet requests into 1.
    cssCodeSplit: false,

    // Keep `builtin:vite-dynamic-import-vars` away from compiled `.aihu` modules.
    //
    // That plugin re-parses, as plain JavaScript, modules in a graph containing
    // a dynamic import — and it engages on the module GRAPH, not merely the file
    // holding the token. The playground legitimately needs dynamic imports
    // (CodeMirror and the ~1 MB `typescript` stripper are lazy chunks, and the
    // compiler WASM is fetched from a runtime URL under public/), so the moment
    // <playground-embed> becomes reachable from the client entry the plugin
    // starts parsing `.aihu` modules too. Those are still TypeScript at that
    // point (`import type { Signal }`,
    // `let __aihu_setup__: ((ctx: any) => any) | undefined`), so rolldown dies
    // with a PARSE_ERROR and the affected routes never prerender — /playground
    // and /examples both went missing from dist exactly this way.
    //
    // Excluding `.aihu` is the narrow fix: those modules never contain a dynamic
    // import needing the plugin's rewrite, while real `.ts` modules that do are
    // still processed normally. The underlying framework bug — the plugin
    // treating compiled-`.aihu` ids as JS rather than TS — is worth fixing
    // upstream in @aihu/app; this unblocks the app either way.
    dynamicImportVarsOptions: {
      exclude: [/\.aihu$/],
    },

    // Keep the `typescript` package in a chunk of its very own.
    //
    // This is not a size-tuning nicety — without it the client ENTRY chunk ends
    // up with a static `import { … } from './strip-ts-<hash>.js'`, i.e. every
    // page hard-depends on 3.4 MB of TypeScript compiler.
    //
    // The mechanism is subtle. `strip-ts.ts` is only ever reached through a
    // dynamic import, so it correctly becomes its own chunk — but `typescript`
    // is CommonJS, so that chunk is the one that needs rolldown's CJS-interop
    // runtime helpers (`__toESM`/`__export`). Rolldown emits those helpers ONCE
    // and re-exports them from whichever chunk it landed in; the entry, which
    // needs the same helpers for its own CJS deps, then statically imports them
    // — and with them the entire 3.4 MB chunk. Verified in dist:
    //   import{t as y}from"./strip-ts-DlRTiivE.js"
    // at the top of `assets/index-*.js`, with exported `t` being the interop
    // helper, not `stripTs`.
    //
    // Splitting `typescript` into its own group means the helper-hosting chunk
    // is the small `strip-ts` wrapper instead of the compiler itself, so the
    // entry's unavoidable helper import costs kilobytes rather than megabytes.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [{ name: 'typescript', test: /node_modules[\\/]typescript[\\/]/ }],
        },
      },
    },

    // Do NOT <link rel="modulepreload"> the playground's lazy chunks.
    //
    // The heavy playground pieces (CodeMirror, the `typescript` TS-stripper,
    // and the ~1 MB compiler WASM) are dynamic imports so they load only once a
    // <playground-embed> actually connects. Vite preloads chunks reachable from
    // an entry by default, which would silently defeat that.
    //
    // Since `playground-embed.ts` is no longer imported from the client entry
    // at all (it is loaded in `playground.aihu`'s onMount — see src/main.ts),
    // this filter is now belt-and-braces rather than the primary defence. It is
    // kept because it costs nothing and it fails safe: if anything ever pulls
    // the element back onto the entry graph, the preload does not silently
    // return.
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter(
          (d) => !/(strip-ts|typescript|code-editor|codemirror|playground-embed)/i.test(d),
        ),
    },
  },
})
