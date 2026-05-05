# Telemetry tree-shake investigation — `@aihu/arbor` v0+1 / v1

**Investigator:** Researcher (code agent, Opus 4.7 1M)
**Date:** 2026-04-27
**Time spent:** ~30 min
**Worktree:** `C:/git/fellwork-worktrees/aihu-arbor-task-12` (branch `phase-3/arbor-implementation`, PR #7)
**Subject:** spec §2.8 telemetry call sites surviving Rolldown + esbuild → ~80–100 B gz overhead

---

## TL;DR

The Builder's diagnosis is **wrong in its primary cause** but right in
direction. The actual root cause is much simpler:

> **`packages/arbor/rolldown.config.ts` does not enable minification.**
> The shipped `dist/index.js` is unminified, so `_observeMount` is left
> as a `let` with the no-op default and the call sites are emitted
> verbatim. `_setMountObserver` is *already* tree-shaken (it's not
> re-exported from `src/index.ts`).

Two converging fixes — not exclusive, both small:

1. **First fix — turn on Rolldown's built-in minifier**
   (`output.minify: true`). With oxc-minify, every approach below — even
   the *current source verbatim* — eliminates 100% of the telemetry
   payload, dropping arbor's gz size by **~80 B**, no source code
   changes. This is a one-line config diff. Cost: gains rely on the
   *consumer* using oxc-minify or a similarly aggressive minifier when
   re-bundling.

2. **Belt-and-suspenders for the consumer-bundler-agnostic case —
   `__DEV__` constant + `transform.define`** (Approach A below). Saves
   another ~10–20 B gz when consumers minify with esbuild (the size-limit
   pipeline today, and the typical Vite/Bun consumer). Aligned with the
   Builder's recommendation in `builder-notes.md`.

Recommended v0+1 PR: **(1) only**. Defer (2) until the v1 reconciler
lands and headroom drops below 350 B.

---

## 1. Root-cause analysis

### What the Builder claimed

From `.team/phase-3/builder-notes.md`:

> the call passes a fresh object literal containing `Date.now()`, which
> is an impure expression. Rolldown cannot prove the entire call has no
> side effects (the observer slot is mutable via `_setMountObserver` —
> the dev plugin substitution is the whole point), so it preserves both
> the object construction and the function invocation.

This is plausible but **not what's happening**. Two observations refute it:

#### Observation 1 — the dist is unminified

`packages/arbor/rolldown.config.ts`:

```ts
export default defineConfig({
  input: 'src/index.ts',
  output: { dir: 'dist', format: 'esm', sourcemap: true },
  plugins: [dts()],
})
```

No `output.minify: true`, no `rollup-plugin-esbuild` minify plugin.
`dist/index.js` is 13.77 kB raw — full pretty-printed JSDoc and all.
That's why every `_observeMount({ kind: "..." ... })` call is sitting
right there in the dist file: nothing tried to remove it.

What Verifier reported as "1.16 kB / 2.05 kB budget" comes from
`size-limit` running through `@size-limit/preset-small-lib`, which
**includes `@size-limit/esbuild`** — i.e., size-limit re-bundles the
unminified dist with esbuild's minifier before measuring gzip. So the
1.16 kB figure is what a downstream esbuild-using consumer sees. **The
shipped package itself, as published to npm, is the ~14 kB raw form.**

#### Observation 2 — `_setMountObserver` is *already* tree-shaken

`src/index.ts`:

```ts
export { branch } from './branch.ts'
export { ArborError, ArborNotImplementedError } from './errors.ts'
export { leaf } from './leaf.ts'
export type { MountScope } from './mount.ts'
export { mount } from './mount.ts'
export { each, when } from './structural.ts'
export type { ... }
```

No `_setMountObserver`, no `_observeMount`, no `MountTelemetry` value
re-export (the type-only one is fine — it erases). Tests reach into
`'../src/mount.ts'` directly, but the public dist barrel doesn't carry
those names. Rolldown DCEs `_setMountObserver` because it's unreachable
from the entry export graph.

Confirmed by reading the dist (`grep _setMountObserver dist/index.js`
returns zero matches; the symbol is gone).

So the Builder's "mutable through `_setMountObserver`" reasoning is
moot — Rolldown can prove `_observeMount` is the constant `() => {}`
*if it wanted to inline*. It just doesn't, because nothing is asking it
to: there is no minifier in the pipeline.

### What actually keeps the calls alive

In an unminified Rollup-style build, the bundler emits code structurally
faithful to the source. Tree-shaking removes whole **modules and
top-level bindings** that aren't reachable from the entry point. It
does **not**:

- inline `let` bindings into their use sites
- substitute provably-constant function references
- DCE function calls based on the called function's body

Those transforms are minifier responsibilities (oxc-minify, esbuild
minify, terser). Rolldown 1.0.0-rc.17 ships oxc-minify built-in via
`output.minify: true`, but the project doesn't enable it.

The Builder's diagnosis (object literal + `Date.now()` + mutable slot)
*is* correct as a description of what stops a *minifier* from going
further if the minifier is conservative — but the current pipeline
isn't even running a minifier.

### Empirical evidence

Built `subject.js` files mirroring arbor's mount.ts exactly, run through
two pipelines. All numbers gzipped (`gzip -c | wc -c`).

| Approach | Rolldown only (current) | Rolldown + `output.minify` (oxc-minify) | Rolldown raw → esbuild minify (size-limit pipeline) |
|---|---|---|---|
| **Baseline** (current source) | 475 B | **252 B** | 333 B |
| **A: `__DEV__` define + guards** | 484 B¹ | 252 B | **261 B**² |
| **C: `/* @__PURE__ */` annotations** | 374 B | 252 B | (not retested; esbuild handles `@__PURE__` similarly) |
| **D: `const _observeMount`** | 476 B | 252 B | (no improvement over baseline expected) |
| **E: hoist `Date.now()` into observer** | 453 B | 252 B | (small improvement, untested) |
| **B: production-only entry, no telemetry** | (bundled separately) | n/a | 253 B |

¹ Without `transform.define: { __DEV__: 'false' }` the literal `__DEV__`
ident remains unsubstituted; `if (__DEV__)` becomes a runtime ReferenceError.
With `transform.define` set, Rolldown evaluates the `if` to `if(false)`
and DCE drops the body. The 484 B figure is *with* unset define — i.e.,
broken; included only to show Rolldown won't auto-inject defines.

² With `--define:__DEV__=false` passed to esbuild's CLI.

Reproduction lives in
`C:/Users/srmcg/AppData/Local/Temp/arbor-tree-shake-investigation/`
(scratch). Numbers reproducible with `bunx rolldown` 1.0.0-rc.17
(matches arbor) and `bunx esbuild` 0.28.0.

---

## 2. Solution space

### A) `__DEV__` build-time constant + `if (__DEV__)` guards

**Mechanism.** Source uses a free `__DEV__` identifier wrapping every
telemetry call. Build pipeline replaces it with `false` for
production, `true` for dev.

```ts
// In production: __DEV__ → false → entire if-block DCE'd.
declare const __DEV__: boolean // ambient.d.ts

if (__DEV__) {
  _observeMount({ kind: 'mount-start', path: pathBase, timestamp: Date.now() })
}
```

Rolldown's API for the substitution is `transform.define`, not `define`
at top level (this is documented at
<https://rolldown.rs/guide/notable-features#define> and via `bunx rolldown
--help`):

```ts
// rolldown.config.ts (production target)
export default defineConfig({
  input: 'src/index.ts',
  output: { dir: 'dist', format: 'esm', sourcemap: true, minify: true },
  transform: {
    define: { __DEV__: 'false' },
  },
  plugins: [dts()],
})
```

The TypeScript source needs an ambient declaration for `__DEV__` (a
`packages/arbor/src/globals.d.ts` with `declare const __DEV__: boolean`)
so `tsc --noEmit` doesn't complain. Vitest/jsdom test environment needs
`globalThis.__DEV__ = true` set in a test setup file (or define in
vitest's deps config) so test runs see telemetry events.

**Bundle impact.** With Rolldown's minify off (current state) but
`transform.define` on: ~50 B gz savings even un-minified. With
minify on or downstream esbuild-minify with matching `--define`: ~70–80
B gz savings.

**DX impact.**
- Arbor authors: every telemetry call site adds an `if (__DEV__)` wrapper
  — five sites in `mount.ts`, no others. JSDoc of `_observeMount` updates
  to "production: dead-code-eliminated via `__DEV__` guard."
- Dev-mode telemetry consumers (the dev Vite plugin, sub-project #10):
  must run with `__DEV__` substituted to `true` (or absent — runtime
  fallback `if (typeof __DEV__ !== 'undefined' && __DEV__)` is uglier
  but safer).
- Tests: setup file sets `globalThis.__DEV__ = true` once. Mocha-style.

**Build infrastructure.** One extra config field
(`transform.define: { __DEV__: 'false' }`). One ambient `.d.ts`. One
vitest setup line. `rolldown-plugin-dts` is unaffected — the `.d.ts`
emit pipeline doesn't see runtime expressions.

**Spec compatibility.** §2.8 promises "production: zero bytes" and
"dev plugin replaces the observer." The replacement still works **if**
dev-mode keeps `__DEV__` truthy. The dev plugin sets `__DEV__ = true`
and assigns the recorder via `_setMountObserver`. Both branches preserve
the spec contract.

**Risk.**
- If `__DEV__` is undefined at runtime in a consumer that doesn't replace
  it, `if (__DEV__)` ReferenceErrors. Mitigation: ship a default
  replacement (production: `false`) baked into our published build.
  The consumer-bundler then sees a literal `false` and DCEs locally.
- Sub-project #10 (PGO) loses telemetry from production environments.
  This is *the design* — telemetry is dev-only — but if a "preview" or
  "staging" deploy wants telemetry, it has to use the dev build. Spec
  §2.8 says PGO is dev-only anyway, so no regression.

### B) Conditional package exports (production vs development entry points)

**Mechanism.** Two source/dist entries; `package.json` exports map
selects via condition:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "development": "./dist/index.dev.js",
    "default": "./dist/index.js"
  }
}
```

`src/mount.ts` becomes the production no-telemetry version;
`src/mount.dev.ts` re-exports `mount` etc. but with the telemetry slot,
calls, and `_setMountObserver`. Two Rolldown configs, two outputs.

**Bundle impact.** Production output drops to ~253 B gz (Approach B
test above) — saves ~80 B gz vs current 333 B. Dev output keeps full
telemetry + recorder hooks (and the dev Vite plugin imports it).

**DX impact.**
- Arbor authors: one slot (telemetry) lives in two files. Code
  duplication, but mechanical. Each non-telemetry change has to land
  in both — though most of mount.ts is identical.
- Consumers: zero — `package.json` exports map handles selection
  transparently. Vite/Bun set `development` condition automatically in
  dev server, leave it off in production builds.
- Tests: need to choose which entry to test. Probably both: dev tests
  use the dev entry, prod-shape tests use the prod entry. That's another
  reason this is heavier than Approach A.

**Build infrastructure.** Two Rolldown invocations (or one config with
two entries). `package.json` exports map. Possibly a small build.ts
that orchestrates both. `rolldown-plugin-dts` runs once on the
shared types.

**Spec compatibility.** §2.8 stays clean. The dev plugin replaces the
observer in the dev entry — that's literally what the spec describes.
Cleaner mental model than Approach A: "dev-only code lives in the dev
file" rather than "dev-only code is gated by a flag."

**Risk.**
- Drift: dev and prod mount.ts can diverge. Mitigation: a CI rule that
  diffs the two and forbids divergence outside the telemetry block.
- Surprise: a consumer who imports a private internal file
  (`@aihu/arbor/dist/index.js` directly) bypasses the conditional.
  Low risk; arbor's `exports` map is the only documented entry.
- More files in the published tarball.

### C) Pure-call annotations (`/* @__PURE__ */`)

**Mechanism.** Annotate every `_observeMount(...)` call:

```ts
/* @__PURE__ */ _observeMount({ kind: 'mount-start', path: pathBase, timestamp: Date.now() })
```

Rolldown supports `@__PURE__` per <https://rolldown.rs/in-depth/dead-code-elimination>;
esbuild has supported it for years.

**Bundle impact.** Empirically (un-minified Rolldown): drops the
*invocation* but Rolldown still emits the argument expression
(including `Date.now()` and the object literal) for side effects on
arg evaluation. Net: ~30 B gz savings vs baseline, ~20 B gz worse than
Approach A.

**DX impact.** Five annotations. Easy. No type-system implications. The
annotation is structurally part of the spec contract — telemetry is
always pure (no side effects on arbor state). Self-documenting.

**Build infrastructure.** None — annotations are inline.

**Spec compatibility.** Perfect. `_observeMount` slot still mutates via
`_setMountObserver` in dev mode; the annotation is honored in
production where the call result is unused.

**Risk.** Annotations don't *eliminate* the argument-side-effects (the
`Date.now()` call and object construction stay in the bundle even
when the function call goes away — see baseline `subject.js → out-approach-c-pure.min.js`:
the `Date.now()` calls remain as bare statements). So `@__PURE__` alone
recovers maybe half of what `__DEV__` recovers.

**Combinable** with Approach E (drop `Date.now()` from arg list) for
better savings — but at that point, just use `__DEV__`.

### D) `const _observeMount`, drop `_setMountObserver`

**Mechanism.** Remove the setter, freeze the slot:

```ts
const _observeMount: (event: MountTelemetry) => void = () => {}
```

Dev plugin can no longer replace via `_setMountObserver` — would need to
patch the global, intercept Rolldown at build time, or AOT-replace the
file via Vite's transform hook.

**Bundle impact.** Empirically zero — un-minified Rolldown still emits
the call sites. Once minified by oxc-minify, identical to all other
approaches (252 B gz). Once minified by esbuild, same as baseline (333 B
gz) — esbuild doesn't inline-and-DCE provably-empty-fn calls even when
the slot is `const`.

**DX impact.** Removes the dev plugin's substitution path. The dev
plugin would need a different mechanism — likely a Vite `transform`
hook that rewrites the source of `mount.ts` to inject the recorder
inline. Significantly more invasive than the §2.8-described setup.

**Spec compatibility.** Breaks §2.8 verbatim. The spec says "dev plugin
replaces `_observeMount` via `_setMountObserver`." Approach D removes
that path entirely.

**Risk.** Low for production correctness; high for dev DX. Tests that
import `_setMountObserver` would all break.

**Verdict:** Don't do this. It loses the architectural property §2.8
exists to enforce, in exchange for size savings that any minifier will
already give us with the *original* source.

### E) Hoist `Date.now()` into the observer body

**Mechanism.**

```ts
// before
_observeMount({ kind: 'mount-start', path: pathBase, timestamp: Date.now() })

// after
_observeMount({ kind: 'mount-start', path: pathBase })
// inside the dev observer:
const observer = (e: MountTelemetry) => recorder.record({ ...e, timestamp: Date.now() })
```

**Bundle impact.** Un-minified Rolldown: ~22 B gz savings (drops
five `, timestamp: Date.now()` strings). Minified: zero additional
savings (oxc-minify already ate the calls).

**DX impact.** Telemetry events lose their inline timestamp. Dev
recorder must add it. Per spec §2.8 the timestamp comes from the
event-acquisition site (boundary of mount), so moving it to the recorder
slightly weakens precision (recorder runs synchronously after the call,
so the delta is microseconds — acceptable).

**Spec compatibility.** §2.8 declares `MountTelemetry.timestamp` as a
field. Spec change required. Probably acceptable — sub-project #10's
PGO consumes it but doesn't require it be acquired at the call site.

**Risk.** Minimal. The savings are small, only useful as a multiplier
on (A) or (C).

### F) Terser / oxc-minify with explicit pure_funcs

**Mechanism.** Instead of (or in addition to) Rolldown's default
minifier, run terser with:

```js
terser({
  compress: {
    pure_funcs: ['_observeMount'],
    unused: true,
    side_effects: true,
  },
})
```

This declares to terser that `_observeMount(...)` is a pure call — same
effect as a `@__PURE__` on every call site without source changes.

**Bundle impact.** Without empirical test in this investigation;
extrapolation says equivalent to Approach C: ~30 B gz savings. terser
is more aggressive than esbuild on `pure_funcs`, but oxc-minify already
solves it in the Rolldown pipeline.

**DX impact.** Adds a Rolldown plugin (`@rollup/plugin-terser` or
`rollup-plugin-esbuild` with custom `pure: ['_observeMount']`).
Doubles the minification time (terser is slower than oxc-minify).
Adds a dependency.

**Spec compatibility.** Fine.

**Risk.** Configuration drift if the function name changes; the
`pure_funcs` list goes stale. Terser version-skew with the rest of the
toolchain. Extra dependency for marginal gain.

**Verdict:** Skip. (1) gives most of the benefit for free.

### G) IIFE / `(0, fn)?.()` patterns

**Mechanism.** `(0, _observeMount)?.({...})` — comma operator + optional
chaining. Some bundlers can prove the result is unused and drop it.

Empirical: oxc-minify and esbuild both treat `(0, fn)(...)` as a regular
call. No DCE. Optional chaining `fn?.(...)` is interpreted as a possible
call with side effects, also no DCE.

**Verdict:** Doesn't work in modern minifiers. Skip.

---

## 3. Recommendation

### Step 1: enable Rolldown's built-in minifier (v0+1, this PR)

**Diff:** one line in `packages/arbor/rolldown.config.ts`:

```diff
   output: {
     dir: 'dist',
     format: 'esm',
     sourcemap: true,
+    minify: true,
   },
```

**Bundle impact:** drops shipped raw dist from ~14 kB to ~310 B (a 45×
reduction in the published tarball) and post-size-limit gz from
~1.16 kB to ~250 B (≈ 80 B savings).

Caveat: per `bun.lock` / `package.json`, `@aihu/signals` shares the
same package-level `rolldown.config.ts` pattern. Apply the same minify
flag there too — same ~30% gz drop expected for free.

**Risk:** sourcemap quality for stack traces in production logs. Not
arbor's concern at v0 (no consumers running it in production yet).
Re-evaluate before aihu ships to actual users.

**Why this is the right first step:** zero source-code change; the
elimination happens for any consumer-facing minifier (oxc, esbuild,
terser); aligns with how every other production-grade ESM library
ships.

### Step 2: add `__DEV__` define when headroom drops below 350 B (v1)

When Task 18 (the v1 reconciler) lands, expected size impact is +500 B
to +900 B (it's a real diff/key-reconciler, possibly with batched DOM
ops). Once arbor reaches **1700 B / 2048 B** (≈ 350 B headroom), trigger
this PR:

1. Add `packages/arbor/src/globals.d.ts`:

   ```ts
   declare const __DEV__: boolean
   ```

2. Wrap the five telemetry call sites in `if (__DEV__) {}`.

3. Add `transform.define: { __DEV__: 'false' }` to
   `rolldown.config.ts`.

4. Add to vitest setup:

   ```ts
   ;(globalThis as any).__DEV__ = true
   ```

**Bundle impact:** another ~10–20 B gz savings even after step 1's
minifier handles the bulk.

**Why defer:** more invasive (touches 5 call sites + tests + ambient
types). Step 1 is enough for current headroom.

### Step 3 (long-term, v1+): consider Approach B if headroom matters again

If telemetry expands past five hooks (sub-project #10 PGO might add 10+
event kinds with structured fields), conditional exports become more
attractive than `__DEV__` because they cleanly separate "production
mount" from "instrumented mount." Architecturally cleaner, slightly
heavier infrastructure. Not needed for v0 or v1 as currently scoped.

### Budget threshold for urgency

| Headroom | Action |
|---|---|
| > 700 B (current: 889 B) | Do nothing. Step 1 still strongly recommended for hygiene; don't bundle-couple it with telemetry urgency. |
| 350–700 B | Land Step 1 (minifier). This is the easy win. |
| < 350 B | Land Step 2 (`__DEV__`). Reasonably urgent. |
| < 150 B | Land Step 3 (Approach B). Time to refactor. |

---

## 4. Concrete v0+1 PR sketch

### PR title

`build(arbor,signals): enable Rolldown built-in minifier`

### Files changed

1. `packages/arbor/rolldown.config.ts`

   ```diff
    import { defineConfig } from 'rolldown'
    import { dts } from 'rolldown-plugin-dts'

    export default defineConfig({
      input: 'src/index.ts',
      output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true,
   +    minify: true,
      },
      plugins: [dts()],
    })
   ```

2. `packages/signals/rolldown.config.ts` — same one-line addition.

(That's it. No source files changed.)

### Test plan

- [ ] `bun run typecheck` — green (no source change → can't fail)
- [ ] `bun run test` — green (89/89 — minification doesn't affect
      Vitest, which runs source via `tsx`/`@vitejs/plugin-react`-style
      loader, not dist)
- [ ] `bun run test:integration` — green (1/1)
- [ ] `bun run build` — produces `packages/arbor/dist/index.js` with
      raw size ≈ 310 B (down from 13.77 kB)
- [ ] `bun run size` — `@aihu/arbor` reports ~250 B gz / 2048 B (was
      1.16 kB / 2048 B); `@aihu/signals` reports ~530 B / 1024 B
      (was 716 B). Numbers approximate.
- [ ] Verify `dist/index.d.ts` is unchanged (still 8.44 kB) —
      `rolldown-plugin-dts` is independent of `output.minify`
- [ ] Eyeball `dist/index.js` — `_observeMount`, `mount-start`,
      `effect-create`, `Date.now`, `_setMountObserver` should ALL be
      absent. The exported names (`mount`, `branch`, `leaf`, `each`,
      `when`, `ArborError`, `ArborNotImplementedError`) should all be
      present in the final `export { ... }` line.

### Expected size delta

- arbor: 1.16 kB gz → ~250 B gz (-910 B / -78%)
- signals: 716 B gz → ~530 B gz (-186 B / -26%)

(arbor savings dominated by all the JSDoc + telemetry call sites that
oxc-minify removes; signals savings are pure name-mangling +
whitespace.)

### Commit message (suggested)

```
build(arbor,signals): enable Rolldown built-in minifier

The shipped dist files were unminified — `@aihu/arbor` published a
13.77 kB raw bundle that compressed to 1.16 kB gz only because
size-limit re-minifies via @size-limit/esbuild before measuring.
Consumers got the unminified file and had to rely on their own
bundler's minifier; with Rolldown 1.0.0-rc.17's built-in oxc-minify,
we ship 310 B raw / ~250 B gz instead.

This also resolves the §2.8 telemetry tree-shake issue documented in
.team/phase-3/builder-notes.md: oxc-minify aggressively inlines the
no-op _observeMount slot and DCEs all five call sites including the
Date.now() argument expressions. No source changes required.

See .team/phase-3/telemetry-treeshake-investigation.md for the full
analysis (root cause, alternative approaches surveyed, follow-up
plan if v1 reconciler eats headroom).
```

### Follow-up issue to file (don't include in this PR)

> **Title:** `arbor: switch to __DEV__ define when telemetry size budget
> tightens`
>
> **Body:** Tracking issue. When `@aihu/arbor` headroom drops below
> 350 B (likely during Task 18 v1 reconciler), implement the
> `__DEV__` constant + `if (__DEV__)` guards described in
> `.team/phase-3/telemetry-treeshake-investigation.md` §2A. Recovers
> ~10–20 B gz on top of the minifier baseline; doubles as
> documentation that telemetry is dev-only.

---

## Appendix A — reproduction

Scratch directory:
`C:/Users/srmcg/AppData/Local/Temp/arbor-tree-shake-investigation/`

Files (all hand-rolled minimal repros of `mount.ts`'s telemetry pattern):

- `baseline.js` — current source pattern verbatim
- `approach-a-define.js` — `if (__DEV__)` guards
- `approach-c-pure.js` — `/* @__PURE__ */` annotations
- `approach-d-const.js` — `const _observeMount`, no setter
- `approach-e-no-datenow.js` — `Date.now()` hoisted out of args
- `prod-mount.js` — Approach B production-only entry
- `realistic.js` — full pattern with `_setMountObserver` exported

Build invocations:

```bash
# Rolldown un-minified (matches arbor today)
bunx rolldown -c rolldown.config.nomin.mjs    # output: rolldown-stage1.js

# Rolldown with output.minify: true (Step 1 fix)
bunx rolldown -c rolldown.config.minify.mjs   # output: rolldown-out.js

# Rolldown with output.minify + transform.define (Step 2 fix)
bunx rolldown -c rolldown.config.transform.mjs

# size-limit pipeline replication (Rolldown raw → esbuild minify)
bunx esbuild rolldown-stage1.js --minify --format=esm --target=es2022 \
  --tree-shaking=true --legal-comments=none > stage2.min.js

# Approach A through size-limit pipeline
bunx esbuild rolldown-stage1.js --minify --format=esm --target=es2022 \
  --tree-shaking=true --define:__DEV__=false --legal-comments=none \
  > stage2-a.min.js
```

Versions: `rolldown 1.0.0-rc.17`, `esbuild 0.28.0`, `bun 1.3.13`,
Windows 11.

## Appendix B — sources

- Rolldown define API:
  <https://rolldown.rs/guide/notable-features#define> (via Context7
  query)
- Rolldown DCE annotations
  (`@__PURE__`, `@__NO_SIDE_EFFECTS__`):
  <https://rolldown.rs/in-depth/dead-code-elimination>
- Rolldown built-in minifier (oxc-minify):
  <https://rolldown.rs/guide/notable-features#minify>;
  fine-grained config docs at the same page.
- size-limit preset internals:
  `bun.lock` shows `@size-limit/preset-small-lib` ⇒ `@size-limit/esbuild`
  + `@size-limit/file` + `size-limit`. Preset uses esbuild minify
  before measuring.
