---
'@aihu/arbor': minor
'@aihu/app': patch
---

Move `hydrate` to its own subpath export, `@aihu/arbor/hydrate`.

The size row measures `dist/index.js`'s whole entry graph, so every consumer
paid for the hydration walker whether or not it could run — including
`@aihu/app`'s `spa` mode, whose own comment says it "skips `_setHydrate` — no
SSR HTML to hydrate". Splitting drops the main entry from 4005 B to 2671 B gz.

**Migration:** `import { hydrate } from '@aihu/arbor'` becomes
`import { hydrate } from '@aihu/arbor/hydrate'`. Everything else on the main
entry is unchanged, which is why this is minor rather than major — but the
named export did move.

Two things the split broke and this fixes:

  - `scripts/mangle-dist.mjs` only rewrote `dist/index.js`. A second entry makes
    rolldown hoist shared code into a `mount-<hash>.js` chunk, so property
    mangling silently stopped applying (`appendedNodes`, `disposers` came back
    unmangled) while index.js — now a 344 B re-export shim — matched nothing.
    It globs `dist/*.js` now, so adding an entry can never quietly disable it.

  - `@aihu/app` did not externalise the new subpath. Rolldown's `external`
    matches exact specifiers, so listing `@aihu/arbor` alone let the entire
    walker inline into client.js (4.8 kB → 13.2 kB). Same failure shape as
    `@aihu/context/ssr` and `@aihu/signals/lifecycle`.

`@aihu/app`'s client also drops below its budget again (30 B over → 29 B
headroom) through four changes that are each a readability win on their own:
`Array.from` removed from a static NodeList walk; three near-identical
meta/link/script upsert blocks folded into one helper; three copies of the
route-param loop folded into `stampParams`; and `tagName.toLowerCase()`
replaced with `localName`. The author-facing "layout has no `<outlet>`"
warning is now `__DEV__`-gated the way arbor gates telemetry — the recovery
path is not gated, so production still renders.

The `@aihu/app` size row was also counting `@aihu/store` (a declared peer, like
every other ignored entry) and `virtual:aihu-components` (a router virtual,
like the two already listed). Both omissions were oversights.
