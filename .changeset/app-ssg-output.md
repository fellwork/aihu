---
"@aihu/app": minor
---

Add a build-time **static / SSG output mode** (`output: 'static'`) that
prerenders every route to content-ful HTML (B4 of the SEO arc).

The default `output: 'spa'` ships an empty shell — crawlers and non-JS agents
see no content. `output: 'static'` now prerenders each route at build time:
the route's real module is loaded by file path (via a short-lived Vite SSR
loader, so `.aihu`/TS compile exactly like the dev pipeline), rendered to
content HTML with `@aihu/server`'s `renderToString`, and its per-route
`<head>` (from the compiler's `.route.json` sidecar) is folded in via
`routeHeadToSsrHead` — resolving relative `canonical`/`og:*`/`twitter:*` URLs
to absolute against the new `site.url`, and emitting JSON-LD. The built
`index.html` is used as the template so each emitted `<pattern>/index.html`
keeps the client bundle `<script>` tags and hydrates into the live SPA
(progressive enhancement). Ideal for content sites on static hosts (e.g.
Cloudflare Pages).

- `OutputMode` gains `'static'`; `defineConfig()` accepts it.
- New `AihuConfig.site.url` (the absolute base URL) feeds absolute
  canonical/OG/Twitter resolution.
- Dynamic routes (`:param` / `[param]`) are prerendered when their module
  exports `getStaticPaths()` (one HTML per returned path); without it the
  route is skipped with a clear build warning.
- `output: 'spa'` behavior is unchanged. The SSG code is build-time only — no
  `.size-limit.json` row and no client-bundle impact.
