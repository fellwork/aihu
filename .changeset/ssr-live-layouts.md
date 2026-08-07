---
'@aihu/router': minor
'@aihu/server': minor
'@aihu/app': minor
---

Compose layouts on the live SSR path, by the same rule the prerender uses.

`createServerRouter` had zero layout handling. The SSG prerender composed a
route's layout around its page; live SSR served the page bare. So an app that
looked correct prerendered lost its entire shell — nav, footer, grid — the
moment the same route was served from a Worker, silently.

`ServerRouterOptions.layouts` takes a resolved name → module map (built at
module init by `virtual:aihu-server-entry` from `virtual:aihu-layouts`), and
`handle` composes it on BOTH the governed and ungoverned arms, with the same
fallback ladder the prerender has: a missing layout, a layout with no renderable
default, a layout with no `data-aihu-outlet` marker, or a layout that throws
each warn once and serve the bare page.

The outlet splice itself is not reimplemented. It moved out of `@aihu/app`'s
`prerender.ts` into `@aihu/server` as `injectIntoOutlet`, and both paths call
it — including its protection against `$&`/`` $` ``/`$'`/`$n` expanding as
replacement backreferences when page prose contains them.

`genSC` (`virtual:aihu-server-components`) now roots its reachability walk at
the LAYOUTS as well as the pages. Without that, every component a layout
references — which is where a site's nav, header and footer live — was left out
of the server bundle and rendered as an empty element on every route.

Two compiler-facing corrections were required to make that real, both found by
the Workers-SSR e2e gate against an actual `vite build` and neither visible to a
unit test:

- The child-tag derivation `@aihu/app` injects into the router now compiles a
  layout in LAYOUT MODE (`_isLayoutFile` + `_layoutTag`, the same pair the
  compiler plugin's own transform uses). Compiling one as an ordinary component
  derives its tag from the file stem, so the common `src/layouts/app.aihu`
  failed the whole build with C450 — `'app'` cannot register as a custom
  element.
- Layouts derive their edges from the `// @aihu:component-tags` marker rather
  than from `__aihu_schild` call sites. On the server target a compiled page
  exports `__ssr` and `__ssrString`; a compiled LAYOUT exports `__ssr` only, and
  the call sites live exclusively in `__ssrString` — so the call-site derivation
  returns `[]` for every layout. A layout renders through the walker, which
  resolves registry children by tag on its own, so the template-reference set is
  the correct one there. It is the strictly larger set, which can bundle a
  module for a reference the walker declines; that trade is documented at the
  call site and ends when the compiler emits `__ssrString` for layouts.

An empty-string `layout` is treated as no layout, matching the client renderer's
existing convention — `compileRouteMeta` emits `layout: ""` for every page that
declares none, so an `undefined`-only check warned about a layout nobody wrote
on the most common route shape there is.

Omitting `layouts` leaves `handle` byte-identical to before.
