import { defineConfig } from '@aihu/app'

/**
 * docs-next — the redesigned aihu documentation + DX site, authored as a REAL
 * aihu SSG app (unlike the legacy `apps/docs`, which hand-rolled a bespoke
 * `build.ts` because static output was broken).
 *
 * `output: 'static'` (fixed on main @ b5c60eb) prerenders every STATIC route to
 * a content-ful `<pattern>/index.html` with its per-route `<head>`, then
 * hydrates into the SPA on load. Crawlers and non-JS agents read real content;
 * humans get the live, island-hydrated app. Deployed as static assets on
 * Cloudflare Pages (see `wrangler.toml`) — no server runtime needed.
 *
 * `css.shadowMode: 'light'` renders layouts + pages into the light DOM so the
 * global design-token cascade (`src/styles/*`) reaches every component, SPA
 * `<a>` interception works across the shell, and the prerendered content is
 * directly in the document for crawlers.
 */
export default defineConfig({
  output: 'static',
  site: { url: 'https://aihu.dev' },
  dir: { pages: 'src/pages', layouts: 'src/layouts' },
  css: { shadowMode: 'light' },
  app: {
    head: {
      title: 'aihu — the framework that equally governs humans and AI',
      meta: [
        { name: 'generator', content: 'aihu' },
        {
          name: 'description',
          content:
            'aihu is a web meta-framework that equally governs the security and experience of humans and AI. Guides, API reference, examples, and a live playground.',
        },
      ],
    },
  },
})
