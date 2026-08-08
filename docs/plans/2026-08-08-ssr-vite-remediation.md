# `output: 'ssr'` remediation — diagnosis and plan

**Status:** diagnosed 2026-08-08, empirically, in consumer-shaped trees. Not yet
implemented.

A CLI-scaffolded SSR app builds **green** and emits a Worker that **can never be
loaded**. Three independent defects, plus a CI gate that structurally cannot see
any of them.

## 1. The vite 8 compiler break — un-stripped TypeScript

`packages/compiler/js/index.ts:2051-2086` strips TS through a three-tier chain:

1. `isServerEnv && typeof vite.transformWithOxc === 'function'` → OXC
2. `'transformWithEsbuild' in vite` → esbuild
3. else → raw TS + `moduleType: 'ts'`

Vite 8 made esbuild an **optional peer** but still *exports*
`transformWithEsbuild`. Branch 2's guard tests only that the FUNCTION exists, so
it is taken; the call then throws *"It is deprecated and it now requires esbuild
to be installed separately… migrate to `transformWithOxc`"*. The outer `catch`
swallows that and returns **un-stripped TypeScript**, which rolldown rejects:

```
[PARSE_ERROR] Expected a semicolon … │ let __aihu_setup__: ((ctx: any) => any) | undefined
```

Measured branch selection:

| tree | vite | esbuild | client | server |
|---|---|---|---|---|
| scaffold as templated | 6.4.3 | 0.25.12 | esbuild ✓ | esbuild ✓ |
| scaffold + `bun add -d vite@8` | 8.2.1 | survives | esbuild ✓ | OXC ✓ |
| scaffold, **fresh** at `^8` | 8.2.1 | **absent** | **THROWS** | OXC ✓ |
| aihu repo | 8.0.16 | resolvable | esbuild ✓ | OXC ✓ |

Only the CLIENT path breaks — and every mode runs a client build, which is why
all three modes fail.

**The splice asymmetry is bun's store layout, not vite.** `node_modules/esbuild`
is absent from the repo root, but vite resolves it from its own realpath:
`.bun/vite@8.0.16+…/node_modules/esbuild -> ../../esbuild@0.24.2/…`. Verified:
`require.resolve` from vite's realpath returns
`.bun/esbuild@0.24.2/node_modules/esbuild/lib/main.js`. Splicing the repo's
`node_modules/vite` carries that with it; a clean consumer install has none.

Note vite 8 loads esbuild **0.24.2** despite declaring `^0.27||^0.28` — it does
not version-check.

**Fix: ungate OXC.** Verified safe: `vite@6.4.3` exports
`transformWithOxc: undefined`, so vite 6 keeps esbuild untouched. Patching the
guard in the failing tree turns `✗ Build failed` into `✓ built in 297ms`.

**Carry into implementation — output is NOT byte-identical:**
```
class A { private x: number = 1 }
esbuild → constructor(){ this.x = 1 }   // useDefineForClassFields: false
oxc     → x = 1                         // useDefineForClassFields: true
```
Invisible for compiler-generated code, observable for user-authored classes in
`.aihu` script blocks. A deliberate decision with a test, not a side effect.

**The swallowing `catch` is its own defect.** It converts ANY strip failure —
missing esbuild, unresolvable `vite`, a future API removal — into silently
un-stripped output. It must name the failure instead.

## 2. The SSR deadlock — module-scope top-level await

`_worker.js` has two module-scope TLAs (`__loaded`, `__layoutEntries` in
`server-entry.ts`), each awaiting `import()` of a lazy chunk. Under vite
6/rollup the shared runtime is **hoisted into the entry**, so 7 of 8 chunks
import back:

```js
import { F as F$1, L as L$1, z as z$1 } from '../_worker.js'   // back-edge
```

ESM async-module semantics then deadlock: the entry suspends at its TLA; the
chunk cannot finish evaluating until the entry's evaluation promise settles;
that settles only when the dynamic import resolves. Under vite 8/rolldown the
runtime is extracted to standalone chunks and the entry is a leaf — zero
back-edges — which is why it "works on 8".

> **CORRECTION (measured during implementation).** "Vite 8 is acyclic" is NOT a
> property of vite 8 — it is source-dependent:
>
> | entry source | vite 8 result |
> |---|---|
> | TLA version | 9 chunks, **0** back-edges (passes, by luck) |
> | fixed version | 8 chunks, **2** back-edges, cycle transitive through the init path |
>
> Merely changing the entry's source text flipped rolldown into emitting a cycle
> on vite 8 as well. Under the OLD code that chunking would have deadlocked on
> vite 8 too. So vite 8 was never safe; it happened to chunk favourably for one
> particular input. This is direct evidence against the rejected
> `manualChunks` / entry-as-leaf option: a bundler's chunking is not a stable
> thing to hang a correctness guarantee on.

**Fix: remove the module-scope TLA. Memoised lazy init on first request.**
Built and verified on vite 6: `STATUS 200`, grandchild renders.

**The decisive detail: the cycle is STILL THERE in the fixed build** and is
harmless. A static cycle without TLA resolves normally; the dynamic imports now
happen during a request, long after evaluation. That is why this is the right
fix — it removes the *necessary* condition, not the incidental one.

| option | verdict |
|---|---|
| **lazy memoised registry** | **Recommended.** Cannot deadlock by construction. Works on vite 6 AND 8. Bundler-agnostic. Costs one await on first request. |
| `inlineDynamicImports` | Forfeits code-splitting, inflates cold start, fights per-component chunking. |
| `manualChunks` / entry-as-leaf | Fragile — tunes *where the cycle lands* on today's bundler. Failure mode is a green build that hangs on every production request. |
| just upgrade to vite 8 | Not a fix. Acyclic by luck; hazard survives. |

Take this regardless of the vite decision. Chunk cycles are normal bundler
behaviour; the TLA is the bug.

## 3. The fragment response — SSR never hydrates

Body is a bare fragment: no doctype, `<html>`, `<head>`, `<title>`, and **no
client `<script type="module">`**. So an SSR route never hydrates and carries no
SEO tags.

`renderToString`'s document wrapper is gated solely on `SsrOptions.head`
(`ssr.ts:1375`), and neither `handle()` arm passes it. Even if it did,
`buildHead` has no facility for `<script src>` — `ScriptTag` is
`{type, content}`.

SSG works because it never computes any of this: it reads the finished client
`dist/index.html` off disk and splices into `#outlet`. Both splice functions are
pure string→string, no fs — already Worker-portable. The missing input is that
nothing passes the client template or hashed entry name into the server bundle
(no `build.manifest`, no `ssrManifest`).

**Proven closable:** the client environment builds BEFORE the SSR environment,
so `dist/index.html` exists at SSR `load()` time. A virtual module inlining it
plus a handler splice produced a full document with doctype, title and the
hashed module script. `env.ASSETS` already serves `/assets/*`.

Open decisions: per-route head needs `routeHeadToSsrHead` + `applyHeadToHtml` on
the request path; and the splice target must be agreed (SSG uses `#outlet`, the
scaffold's `index.html` uses `#app`).

## 4. Ordered plan

| # | Step | Blast radius | Verification |
|---|---|---|---|
| 1 | Ungate OXC (`index.ts:2065`) | client transform on vite 8 only | fresh `^8` scaffold builds; fixture pins class-field + enum + `import type` output |
| 2 | Make strip failure LOUD — rethrow named error | compiler only | force unresolvable esbuild → clear error, not `PARSE_ERROR` |
| 3 | Remove module-scope TLA from `buildServerEntrySource` | `ssr` only | e2e must `await import(worker)` **under a timeout** so a hang is RED, not a hang |
| 4 | Emit a full document | SSR response shape | assert doctype/html/title/`assets/index-*.js`; ASSETS still serves it |
| 5 | Dev entry: emit `/virtual:aihu-entry` not the bare specifier | dev only, all templates | `curl /virtual:aihu-entry` already 200s — only the bare form is unusable |

1-2 and 3 are independent.

## 5. Template + CI

**`output: 'ssr'` is not reachable from a scaffold today** — no template lists
`@aihu/adapter-cloudflare` or emits `output: 'ssr'`, and published
`@aihu/app@9.0.0` rejects the value outright. The release is a hard prerequisite.

- **Stop emitting `"latest"`** — unpinnable and unauditable; a bad publish breaks
  every existing scaffold's next install. Emit a caret range from the release
  version.
- **Generate versions, don't type them.** No sync mechanism exists;
  `check-pins-published.ts` guards platform binaries only, and `^6.0.0` is
  asserted nowhere but a legacy golden snapshot. Add release-time codegen + a CI
  drift check.
- **Vite range:** do NOT move to `^8` before step 1 — a fresh `^8` install is
  exactly the broken state. After step 1, `^6 || ^8` is safe on both.
- **Add an `ssr` template** (adapter-cloudflare + `output: 'ssr'` +
  `css.shadowMode`, which SSR requires).
- `trustedDependencies` omits **esbuild**, whose postinstall bun blocks. Ungating
  OXC deletes the coupling rather than pinning around it.

**The gate gap is specific.** `scaffold-matrix.yml` already scaffolds and builds
consumer-shaped — but its PR `paths` filter is only `packages/cli|create-aihu|templates`,
so a **compiler** change never triggers it; it is deliberately **not in
`ci-ok`**; and it has **no vite axis**. Meanwhile `workers-ssr-e2e` builds a
fixture INSIDE the repo, inheriting hoisted node_modules and a resolvable
esbuild — a configuration no consumer has.

Fix: add `compiler|app|router|server|adapter-cloudflare` to its paths; promote
one fast cell (bun × minimal) into `ci-ok`; add a **vite axis (`^6`, `^8`)`;
install **fresh** (the bug is invisible on an incremental upgrade); add an `ssr`
cell; and put the worker import under a timeout.
