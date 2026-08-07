# Workers SSR — making the child feature shippable

**Status:** designed and probed end-to-end 2026-08-07. Implementation next.

#778 made SSR child rendering correct. It did not make it *shippable*: the only
verified consumer is the SSG prerender. This plan closes the gap between "the
feature is correct" and "a paid client project can deploy on it."

## The crux, proven not reasoned

Generated server code does not need to be *emitted* — it needs to be **served
as a virtual module that is an SSR-environment build input.**

```ts
environments: { ssr: { build: { rollupOptions: { input: { _worker: 'virtual:aihu-server-entry' } } } } },
builder: { async buildApp(b) { await b.build(b.environments.client); await b.build(b.environments.ssr) } }
```

Observed, in a torn-down probe:

1. A `virtual:` id works as a build entry **only via `rollupOptions.input`**.
   `build.ssr: 'virtual:…'` fails `[UNRESOLVED_ENTRY]`. Load-bearing and
   non-obvious.
2. `import routes from 'virtual:aihu-routes'` inside it resolves to REAL
   chunks: `module: () => import("./assets/pages-CL1oF21E.js")`.
3. `.aihu` auto-compiles to the **server target** there with no config —
   `aihuCompilerPlugin` reads `this.environment.config.consumer === 'server'`
   (`js/index.ts:1672`).
4. One `vite build` produces both environments.
5. `closeBundle` fires per-environment with `this.environment.name`.

End-to-end: a built `dist/_worker.js` (34 kB), driven in-process with a stubbed
`ASSETS`, server-rendered **two levels** of nesting. The control —
`createServerRouter(routes)` with no `children` — rendered
`<probe-card></probe-card>` empty, confirming §2a's forwarding is the operative
difference.

**Therefore the adapter should stop emitting the worker as a string.**
`createHandlerSource` is the wrong shape. The worker entry IS the virtual
module; the adapter contributes wrapper text into it. That removes the root
cause rather than routing around it.

### Correction to the adapter's own docblock

`@aihu/adapter-cloudflare` blames a "non-serializable `module()` thunk" for its
404 placeholders. False: `fileToRouteDefinition` (`app/src/vite-plugin.ts:49`)
builds `module: () => Promise.resolve({ default: null })`. There was never a
loadable module to serialize, so no adapter-side fix was possible. Route
modules must come from `virtual:aihu-routes`, inside the graph.

## Two shippability defects nobody had named

**D-1 — `node:module` lands in the Worker bundle.** `@aihu/server` does
`import('./native.js')`, which statically imports `node:module`; rolldown emits
an 18.4 kB chunk. Unreachable at runtime (`loader.ts:70-83` short-circuits when
`children !== undefined`) but still uploaded, and it fails on workerd without
`nodejs_compat`. Fix: a `resolveId` stub — **requires `enforce: 'pre'`**, or
Vite's resolver wins and the stub never fires.

**D-2 — SSR chunks land in the publicly-served assets dir**, where Cloudflare's
`ASSETS` binding serves them. Server code becomes downloadable. The SSR
environment needs its own `outDir` outside the assets root.

## Build order

- **Step 0 — `OutputMode` gains `'ssr'`** (`app/src/config.ts:18`). Everything
  is gated on it, so SPA/SSG take zero new paths. **Also a validator rule
  requiring `css.shadowMode`** — see the hard dependency below.
- **Step 1 — `genSC` → `virtual:aihu-server-components`** in `@aihu/router`.
  FLAT tag→loader map, not `genC`'s transitive `Promise.all` bundle (which has
  no tag to index by). Reuses `genC`'s codegen-boundary validation.
- **Step 2 — `virtual:aihu-server-entry`** in `@aihu/app`. MEDIUM, the real
  work. Declares the ssr environment + `builder.buildApp` only under
  `output: 'ssr'`. **Highest-risk line in the plan:** `adapterPlugin` and
  `ssgPlugin` `closeBundle` hooks have NO environment guard today and would
  fire twice under two environments. Needs `if (this.environment?.name !==
  'client') return` and its own test — this is the one place shipped SSG can
  regress.
- **Step 3 — adapters contribute `serverEntry?(ctx): string`** instead of
  emitting files. Disposes of the 404 manifest entirely. Deprecate
  `createHandlerSource`/`generateRoutesManifest`, delete in a follow-up.
- **Step 4 — the CI gate.**

## Tag derivation: `__aihu_child_tags__`, reproduced at codegen time

Measured on a fixture separating all three sets (leaf, nested child, orphan,
and an attribute-bearing DECLINED reference):

| derivation | modules bundled |
|---|---|
| all components (what SSG does) | 4 |
| source regex (`readAihuLayoutComponents`) | 3 |
| `__aihu_child_tags__` render edges | **2** |

The source regex pulls in `probe-attr`, which `__aihu_schild` can never look
up — confirmed empty in the rendered HTML while its module was bundled. Upload
weight for zero benefit.

**The "module export, unreadable at codegen time" objection dissolves.**
`__aihu_child_tags__` is NOT produced by Rust — it is derived in JS at
`js/index.ts:1907` by regexing emitted code for `__aihu_schild\('([^']+)'`. So
codegen reproduces it with a synchronous, content-addressed-memoized
`transform()` — no module loading. Export it as ONE shared helper
(`_deriveChildTags`) called by both sites, rather than adding a fourth
derivation.

Roots are the PAGES, not all components — that is what drops the orphan.

**Accepted trade, to be written into `genSC`'s docblock:** a pruned registry
sees only the reachable subgraph, so `buildChildRegistry`'s cycle check loses
its global view. Correct for a Worker (the warning is advisory and
`__aihu_schild` is depth- and budget-bounded), but it must be stated.

## The hard dependency: `shadowMode` is not optional

With no `css.shadowMode` configured, plain components export no
`__aihu_shadow__` (`_injectShadowMode` only fires when `effectiveShadow !=
null`; the DA4 default marker is emitted only for `@route` units).
`buildChildRegistry` then warns and renders **nothing** — identical in
appearance to a registry bug. `apps/docs` sets `shadowMode: 'light'`, which is
why SSG never hit this.

So `output: 'ssr'` must **require `css.shadowMode` or fail the build naming
it.** Silently rendering empty children is the precise failure this whole
effort exists to remove.

## The CI gate

`packages/app/tests/workers-ssr-e2e.test.ts`, NOT a test inside the example:
root vitest includes `packages/*/tests/**` but **not `examples/**`**, and the
`examples` CI job uses two hardcoded directory lists in a lane `changes` can
skip. Placing it here gates it for free.

Follows `compiler/tests/vite-build-utility-css.e2e.test.ts`: spawns `vite build`
as a subprocess, and **throws rather than skips** when the binary is missing —
that file's own comment calls skipping "the false-confidence pattern that let
the prior Bug 2 fix ship a non-working feature."

Asserts: (1) `_worker.js` default-exports `fetch`; (2) driven in-process with a
stubbed `ASSETS`, the HTML contains the **grandchild's** text; (3) **the
control** — no `children` renders the host empty, so the test cannot pass for
the wrong reason; (4) `grep node:module` over SSR output is empty; (5) the
registry excludes the orphan and the declined reference, pinned by exact tag
list; (6) ASSETS fall-through on an unmatched path.

No workerd, no wrangler — `scripts/serve-dist.ts:4-8` documents why wrangler
was deliberately ejected from CI (compat-date drift, ~246 cold packages, blown
timeouts). Same reason `@cloudflare/vite-plugin` is not the route.

## Explicitly out of scope

- **`RenderingMode`** — aspirational. Its only real consumer is
  `client.ts:216`; `server/src`'s single mention is a comment. It is a client
  hydration hint, not a build knob. The new mode belongs on `OutputMode`.
- **`@aihu/adapter-vercel`** — same string-emission shape, will diverge. Scope
  out in the changeset.
- **Layouts under live SSR** — `createServerRouter` has ZERO layout handling
  (`grep -c layout` → 0). SSG composes layouts; live SSR does not. A real,
  separate gap. Named here so it is not discovered inside this PR.
- **fellwork-web adoption** — writes its own worker entry, bundled by wrangler's
  esbuild which cannot compile `.aihu`. This work makes adoption possible; it
  is not adoption.

**Stale-artifact trap:** `packages/router/dist/plugin.js` does not export
`readAihuLayoutComponents` even though `src` does.
