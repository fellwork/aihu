---
'@aihu/app': minor
'@aihu/router': minor
'@aihu/compiler': minor
'@aihu/adapter-cloudflare': minor
---

`output: 'ssr'` — a Workers-deployable server bundle that actually renders.

#778 made SSR child rendering correct. It did not make it shippable: the only
verified consumer was the SSG prerender. This closes that gap.

**The crux.** Generated server code does not need to be *emitted* — it needs to
be a virtual module that is an SSR-environment **build input**. `@aihu/app` now
declares a second Vite environment under `output: 'ssr'` whose entry is
`virtual:aihu-server-entry`, so `import routes from 'virtual:aihu-routes'`
inside it resolves to REAL chunks, `.aihu` files compile to the server target
with no config (`aihuCompilerPlugin` reads
`this.environment.config.consumer === 'server'`), and one `vite build` produces
both environments. A built `dist-server/_worker.js` server-renders two levels of
child nesting, verified against a stubbed `ASSETS` binding in CI.

Load-bearing and non-obvious: a `virtual:` id works as a build entry ONLY via
`rollupOptions.input`. `build.ssr: 'virtual:…'` fails `[UNRESOLVED_ENTRY]`.

**`@aihu/app`**

- `OutputMode` gains `'ssr'`. `@aihu/server`'s `RenderingMode` is a different
  axis — a client hydration hint whose only real consumer is `client.ts` — and
  is deliberately not the knob here.
- **`output: 'ssr'` REQUIRES `css.shadowMode`, as a build error naming the key.**
  Without it a leaf component exports no `__aihu_shadow__`, `buildChildRegistry`
  refuses it, and every child renders as an empty element — indistinguishable
  from a broken registry, which is the precise failure this whole effort exists
  to remove. `apps/docs` setting `shadowMode: 'light'` is the only reason SSG
  never hit it.
- `AihuAdapter.serverEntry?(ctx)` contributes the platform wrapper INTO the
  virtual entry. `AdapterContext.createHandlerSource` is deprecated: its output
  is written after the build, outside the module graph, so every route it wires
  404s by construction.
- **D-1** — a `node:module` stub (`enforce: 'pre'`, or Vite's resolver wins)
  keeps the builtin out of the Worker bundle. It arrives via `@aihu/server`'s
  lazy `import('./native.js')`, is unreachable at runtime (the loader
  short-circuits to the TS walker whenever `children` is passed), but is still
  uploaded and fails on workerd without `nodejs_compat`.
- **D-2** — the SSR environment writes to a SIBLING of the client outDir
  (`dist` → `dist-server`). Cloudflare's ASSETS binding serves the client outDir
  verbatim; SSR chunks written there are downloadable server code.
- `closeBundle` fires once per environment, and `aihu-adapter` / `aihu-ssg` had
  no guard — both would have run twice. Now client-only, with an absent
  `environment` treated as the single-environment case so an older Vite is not
  silently left without an adapter. `apps/docs`' `output: 'static'` build is
  byte-identical across all 290 emitted files.

**`@aihu/router`** — `virtual:aihu-server-components` (`genSC`): a FLAT
tag→loader map, because the consumer is `buildChildRegistry`, which indexes
tag→MODULE and cannot use `genC`'s transitive `Promise.all` bundle. It carries
only the subgraph REACHABLE from the pages, walked over `__aihu_child_tags__`
render edges. Measured on a fixture separating the sets: every-component
bundles 4 modules, the source regex 3, render edges **2** — the regex pulls in
an attribute-bearing reference the emitter DECLINES, which `__aihu_schild` can
never look up and which renders empty either way.

Accepted trade, written into `genSC`'s docblock: a pruned registry loses
`buildChildRegistry`'s global cycle view. Correct for a Worker (the report is
advisory, `__aihu_schild` is depth- and budget-bounded, and an unreachable cycle
cannot affect a response); SSG still loads everything and keeps the global check.

**`@aihu/compiler`** — `_deriveChildTags` is exported so the compiler's
transform and the router's `genSC` share ONE derivation instead of adding a
fourth. The `__aihu_referenced_tags__` docblock already argues that deriving the
runtime edge set twice would be "one rule written in two places"; that does not
stop applying because the second site is in another package.

**`@aihu/adapter-cloudflare`** — implements `serverEntry`, and under
`output: 'ssr'` stops emitting `_worker.js` into the client outDir entirely
(the build's own `dist-server/_worker.js` is the worker). Its generated
`wrangler.toml` points `main` at the server bundle and `[assets] directory` at
the client dir only. Its docblock's claim that the 404 placeholders were caused
by "a non-serializable `module()` thunk" is corrected: `fileToRouteDefinition`
builds `module: () => Promise.resolve({ default: null })`, so there was never a
loadable module and no adapter-side fix was possible.

**Not in scope, named so it is not mistaken for done.** `@aihu/adapter-vercel`
still uses the string-emission shape and does not gain `serverEntry`. Layouts
are not composed under live SSR — `createServerRouter` has no layout handling at
all (SSG composes them); this is a real, separate gap. Worker bindings (`env`)
are not threaded into a page render, because `ServerRouter.handle` takes a
`Request` and nothing else.
