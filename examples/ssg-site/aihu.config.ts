import { defineConfig } from '@aihu/app'

/**
 * SSG configuration — the whole point of this governed example.
 *
 * `output: 'static'` switches the build from the default empty-shell SPA to the
 * prerender path: every STATIC route (no `data:`/loader) is written to a
 * content-ful `<pattern>/index.html` with its per-route `<head>` (title /
 * description / canonical / og / twitter / json-ld), then hydrates into the SPA
 * on load (adoption). Crawlers and non-JS agents get real content; humans get
 * the live app.
 *
 * `site.url` resolves the pages' relative `canonical` / `og:url` into absolute
 * URLs during prerender (routeHeadToSsrHead's siteUrl).
 */
export default defineConfig({
  output: 'static',
  site: { url: 'https://ssg.aihu.dev' },
  dir: { pages: 'src/pages' },
  // Light DOM: prerendered content lives in the document so crawlers read it,
  // and SPA `<a>` interception works across the page shell.
  css: { shadowMode: 'light' },
  app: {
    head: {
      title: 'aihu SSG example',
      meta: [{ name: 'generator', content: 'aihu' }],
    },
  },
})
