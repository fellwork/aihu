---
"@aihu/server": minor
---

Add `routeHeadToSsrHead()` — a pure mapper that lowers a route's head metadata
into the server's renderable `HeadConfig` (B3 of the per-route-`<head>` SEO
arc). It maps `title` → `<title>`, `description` → `<meta name=description>`,
`canonical` → `<link rel=canonical>` (resolved absolute against an optional
`siteUrl`), `og.*` → `og:*` property meta (image/url resolved absolute),
`twitter.*` → `twitter:*` name meta, and `jsonld` → a
`<script type="application/ld+json">` block. Route fields override an optional
`globalHead` per field, with `meta`/`links`/`scripts` arrays key-merged (route
wins on conflicts); an `undefined` route head returns `globalHead` unchanged.
The function is self-contained and side-effect free so the SSG-prerender and
client-nav head Builders can both import it.

To support the lowering, `HeadConfig` gains an optional `scripts` array (new
`ScriptTag` type) and `buildHead()` now emits inline `<script>` elements
(neutralizing any literal `</` in the body so injected JSON-LD cannot break out
of the element). Both additions are backward compatible: omitting `scripts`
reproduces the prior `buildHead`/`renderToString` output exactly. New exports:
`routeHeadToSsrHead`, `RouteHead`, `RouteHeadLowerOptions`, `ScriptTag`.
