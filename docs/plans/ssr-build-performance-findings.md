# SSR build performance — measured findings (2026-07-19)

**Status:** investigation only. Not a plan, not dispatched. Filed so the measurements
survive; founder deferred the work until the Slice 0 / CO1 branches settle.

---

## 1. Process spawn dominates compilation

Measured on a real `.aihu`, warm cache, single machine, `target/release`:

| | Per invocation |
|---|---|
| Full compile of `cookbook/aihu-counter.aihu` | **3.1 ms** |
| Bare OS process-spawn floor (`/bin/echo`) | **1.75 ms** |
| Actual compile work (derived) | **~1.35 ms** |

**~56% of per-file compile time is process-spawn overhead, not compilation.** The Rust
compiler is already fast enough that the OS dominates it.

`packages/compiler/js/index.ts` has **three** `execFileSync` call sites (`:545`, `:826`,
`:843`), so some paths pay the toll more than once per file.

**Consequence: porting more logic into Rust optimizes the 1.35 ms and leaves the 1.75 ms
untouched.** More Rust is not the lever here.

⚠️ Single-file, warm-cache, one machine. Confirm with a timed end-to-end build before
acting.

## 2. The port already exists and isn't used in the build path

`packages/compiler/src/wasm.rs` builds the compiler to wasm32 via `wasm_bindgen`, under a
hard-failing **<500 KB gz** CI budget (`packages/compiler/WASM.md:65`). It serves the docs
playground; the Vite plugin still spawns the native binary.

Switching the plugin to the in-process WASM module removes the spawn entirely. Not a port —
using one already paid for. It would also retire the stale-binary trap (which produced 24
phantom failures on 2026-07-19), since no binary-path resolution would remain.

**Unverified, must measure first:** WASM instantiation cost amortized across a build, and
whether the workspace `opt-level = "z"` + LTO profile — tuned for the **size** budget, not
speed — makes per-file WASM meaningfully slower than native.

## 3. SSG prerender compiles every route twice

`packages/app/src/prerender.ts:425-444`, running in `viteAihuPlugin`'s `closeBundle`:

```ts
const { createServer } = await import('vite')
const server = await createServer({ … })
… (await server.ssrLoadModule(filePath)) as PrerenderRouteModule
```

The sequence is:

1. Build the SPA (Vite pass one)
2. **Boot a second full Vite server**
3. Re-compile every `.aihu` through its SSR loader — paying the §1 spawn again, per route
4. `renderToString`, fold head, write HTML

**Every route is compiled twice, and each compile pays the spawn.** `renderToString` is
almost certainly noise beside a second Vite server boot.

**So the lever is eliminating the double-compile**, not optimizing the renderer:
- reuse the client build's module graph instead of a second loader, and/or
- make compilation in-process (§2) so pass two costs ~1.35 ms rather than ~3.1 ms + boot.

⚠️ **Not yet measured.** Time a real SSG build with phases separated before designing.
Do not assume the split.

## 4. Runtime packages must NOT be ported

Size gates (`.size-limit.json`, all gzipped): `@aihu/context` 450 B · `@aihu/signals`
1970 B · `@aihu/arbor` 2800 B · `@aihu/runtime` 4100 B.

WASM instantiation and glue overhead is multiples of those budgets before doing any work.

Architecturally worse: fine-grained signals mean a JS↔WASM boundary crossing **per signal
read and per DOM write**. Arbor's measured advantage is `textNode.nodeValue = …`, a single
property set. Routing that through WASM makes the framework's core advantage its
bottleneck.

## 5. The eight JS post-passes — six belong in codegen, two don't

Every one re-parses text the compiler generated moments earlier, with explicit bail-outs
when the shape doesn't match. **The argument is correctness, not speed** — this is the same
class as the five codegen bugs, the `$each` alias tearing, and the `hydrate.0` mismatch:
string manipulation where structure was available. It is also a **Derived-property
violation** (thesis §2): hand-maintained knowledge of the compiler's output format, living
outside the compiler. Change an emit shape and these silently no-op.

### Move (6)

| Pass | Line | Why |
|---|---|---|
| `_injectShadowMode` | 115 | Decodes `// @aihu:shadow <mode>` — **a marker the compiler emitted** (`types.rs:413`). Pure round-trip through a comment. |
| `_classifyIsland` | 166 | Regexes compiled output for `signal\|computed\|effect\|setSignal\|onMount\|onCleanup` — asking *"did I emit signals?"* The compiler answered that when it emitted them. |
| `_globalizeAuthoredStyle` | 135 | Entirely conditioned on shadow mode, which the compiler owns. |
| `_passivizeOutlet` | 257 | Needs layout/route knowledge the compiler already has. |
| `_buildDeferredHydration` | 354 | Rewrites the `connectedCallback` the compiler generated. |
| `_foldCssEngineStyles` | 613 | Regex `/(__style__\.replaceSync(`)[^]*?(`);)/` carrying a `biome-ignore` for an empty character class, **plus a workaround because `$` in CSS was read as a replacement pattern** — a bug already hit. And css-engine has a Rust core, so this becomes Rust→Rust. |

### Split (1)

**`_buildHmrCode`** (291) — the import manipulation (regexing
`/import\s*\{([^}]*)\}\s*from\s*'@aihu\/runtime'/` to add `_hmrReplace`) belongs in the
compiler, which owns its own import list. The `import.meta.hot` block does **not** — that
is Vite dev-server API, and embedding Vite's HMR protocol in a Rust compiler couples them
wrongly. Compiler emits the import under a flag; the plugin fills the hot block.

### Undecided (1)

**`_injectAutoWiring`** (898) — not read closely enough to judge. Do not assume.

---

## Prerequisites before any of this is designed

1. **A real timed SSG build**, phases separated (SPA build / second-server boot / per-route
   compile / render / write). Everything in §3 is inference from reading, not measurement.
2. **A WASM-vs-spawn benchmark** (§2), including instantiation amortization and the
   size-optimized profile's speed cost.
3. **Both Slice 0 and CO1 merged.** This work touches `packages/compiler/js/index.ts` and
   `packages/compiler/src/`; CO1 is live in the latter.

## Context

Build-perf posture is documented as **~100× headroom against the <200 ms p50 target**, so
none of this is urgent. It is cleanup with a correctness payoff attached — which is the
better reason to do it.
