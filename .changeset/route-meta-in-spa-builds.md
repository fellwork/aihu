---
"@aihu/compiler": minor
"@aihu/router": patch
"@aihu/app": patch
---

Full per-route metadata (`head`/`middleware`/`params`/`ssr`) now reaches
`virtual:aihu-routes` in a normal SPA build. Previously only `name`+`layout`
survived (via an `@route` source regex): the compiler compiles `.aihu` via
stdin and writes no `.route.json` sidecar, and `genR` runs before pages are
lazily transformed — so nested metadata like per-route `<head>` SEO tags were
silently dropped unless the app was prerendered/SSG'd.

- **@aihu/compiler** — new `--route-json` binary flag (prints the computed
  route sidecar to stdout) and a `compileRouteMeta(source, id)` export that
  wraps it (mirrors `compileToAst`).
- **@aihu/router** — `genR` accepts a `compileRouteMeta` option and uses it to
  recover full `@route` metadata for `.aihu` pages (precedence: disk sidecar →
  `compileRouteMeta` → `name`+`layout` regex fallback when no compiler is
  wired, so standalone `viteRouterIntegration` still works).
- **@aihu/app** — wires the compiler's `compileRouteMeta` into the router
  integration, so SPA apps get per-route `<head>` without prerendering.
