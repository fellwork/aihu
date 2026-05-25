---
"@aihu/router": patch
---

Thread per-route `<head>` metadata from the compiler's `.route.json` sidecar
through to `RouteDefinition` and the generated `virtual:aihu-routes` module
(B2 of the SEO `<head>` arc).

Adds and exports a new `RouteHead` type (`title`, `description`, `canonical`,
`og`, `twitter`, `jsonld`) and an optional `head?: RouteHead` field on
`RouteDefinition` and the build-time `RouteSidecar`. `head` is added to the
`SK` sidecar-key allowlist so it survives into `virtual:aihu-routes` — without
it the key would be silently dropped. Routes with no `head:` stay backward
compatible (`head` is `undefined`).

Type-only addition; the runtime/browser bundle size is unchanged. Downstream
consumers (SSG prerender, client-nav head updater) import `RouteHead` from
`@aihu/router`.
