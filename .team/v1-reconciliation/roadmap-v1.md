# scribe v0.2 → v1.0 Framework Roadmap

**Date:** 2026-05-02
**Author:** Architect (Round 2.1)
**Status:** PROPOSED (pending user ratification, then Builder R4 migration to `docs/superpowers/plans/`)
**Constraints:** Selective lean (Vite is dev/build-only); v3 dep-free thesis (Learning #49 hard); Tier-3 hooks paid for in v0 (Learning #16); 3.46 kB browser-bundle ceiling
**Companion:** `.team/v1-reconciliation/assets-package-design-stub.md` (carry-forward; sequenced into v0.5/v0.6 below)
**Supersedes:** `.team/v1-reconciliation/roadmap-draft.md` (R2 prior — preserved for history; this file is the authoritative R2.1 redraft after the user locked Interpretation A and the 0.2 → 0.9 → 1.0 milestone shape)

---

## TL;DR

The user has ratified **Interpretation A — full syntax migration** to the spec quartet (`@blockname { }` blocks, `$attr` template attributes, `<$element>` macro elements). Per Scout R2.5, ~62 of ~95 spec-quartet requirements are GAP today; the current Rust compiler implements ~6-8 % of the spec surface and the existing `<script setup>` / `<template>` / `<style>` / `<agent>` HTML-tag grammar is the wrong shape entirely. The roadmap is therefore a **redesign, not an extension** of v0.1.x. Milestone shape is locked: **0.2 = basic feature sets, 0.3-0.8 = progressive features (sequenced below), 0.9 = docs and testing pass, 1.0 = release cutover**. Biggest risks are (a) the v0.2 parser stub must not break v0.1.x users until we are ready to deprecate, (b) ~3-6 days of Rust compiler work for `@route` + build-target + macro lowerings before any of the v0.4-0.6 surface can land, and (c) cross-package naming collisions (`createRouter`, `defineMiddleware`) exposed by the Plugin Contract Spec ratification — resolved here via Naming Scheme A applied to plugin internals only.

---

## Current state baseline (scribe v0.1.x at main `7fa0957` + this session's outputs)

**Tests:** 454/454 passing across 54 files. **Sizes:** 7 of 8 packages within budget; `@scribe/arbor` is 15 B OVER (regression carried forward from R1 Scout).

| Package | Size | Limit | Headroom | Status |
|---|---|---|---|---|
| `@scribe/context` | 249 B | 300 B | +51 B | shipped (v0.1) |
| `@scribe/signals` | 1.81 kB | 1970 B | +120 B | shipped (v0; frozen) |
| `@scribe/arbor` | 2.16 kB | 2200 B | **−15 B OVER** | shipped (v0.1) — regression |
| `@scribe/runtime` | 1.14 kB | 1170 B | +7 B | shipped (v0.1) |
| `@scribe/agent` | 117 B | 200 B | +83 B | shipped (v0; frozen) |
| `@scribe/data` | 711 B | 750 B | +39 B | shipped (v0.1) |
| `@scribe/router` | 1.45 kB | 1536 B | +50 B | shipped (v0.1) |
| `@scribe/agent-service` | 580 B | 600 B | +20 B | shipped (v0.1) |
| `@scribe/server` | (no row) | n/a | n/a | shipped (v0.1) — see v0.2 row policy |
| `@scribe/agent-readiness` | (no row) | n/a | n/a | shipped (v0.1) |
| `@scribe/compiler` | (Rust) | n/a | n/a | Phase 1 + C-3/C-4 shipped; HTML-tag grammar |

**Spec-quartet alignment headline (from Scout R2.5):** SHIPPED ~6, PARTIAL ~18, GAP ~62, UNKNOWN ~5. The v0.1.x packages ship the underlying *primitives* (`when`, `each`, `slot`, `signal`, `effect`, `createResource`, `defineMiddleware`, `composeMiddleware`, `defineLoader`, `mountResource`, `_hmrReplace`, file-based router) — what's missing is the **binding contract**: the `@blockname { }` block grammar, the `$attr` template syntax, the `<$element>` macro elements, the `@route` block, the build target framework, the `$server` split-bundle artifacts, the `@scribe/plugin` contract surface itself.

**Runtime dep envelope:** zero non-`@scribe/*` runtime deps across all packages on `main`. Already substantially v3-thesis-compliant at runtime; the roadmap is to keep it that way through v1.0.

---

## Spec quartet authority

The four documents — `docs/spec-block-structure.md`, `docs/spec-template-attribute-syntax.md`, `docs/spec-macro-vocabulary.md`, `docs/spec-plugin-contract.md` plus `docs/AMENDMENT-{01,02,03}.md` — are **load-bearing parallel design**. Per Decision Q2, they are the authority over current parser behavior; when adaptation is feasible the roadmap targets the spec; when it is genuinely impossible, the conflict is cited here and surfaced.

### What the quartet requires

- **Block grammar** (Block Structure Spec §§1-3, §6, §7, §11): five blocks — `@state`, `@template`, `@style`, `@agent` (closed core, ≤1 each, all four macro-bearing) and `@route` (closed core, valid only in `src/pages/`, *not* macro-bearing per Amendment 01). Plugin blocks discriminated by dot: `@plugin-name.block-name { ... }`. `@blockname {` opener with brace matching at depth 0 (§2.4); closing `}` on its own line. Cross-block resolution via unified symbol table; `@state` declares, others reference.
- **Template attribute syntax** (Template Attribute Syntax Spec §§1-6): two forms only — quoted (`attr="value"` for identifier ref / dotted property path / iteration token) and curly (`attr={expression}` for arbitrary JS). Bare values forbidden. Boolean-only attributes (HTML `disabled`, scribe `$once`, `$raw`). Per-macro type matrix (§3.3) is the source of truth. Slot/fallback hybrid for `<$suspense>`/`<$shield>`/`<$guard>`. Inline JSX in attributes forbidden in v1.
- **Macro vocabulary** (Macro Vocabulary Spec, closed): 39 forms / 36 names, fixed by language version. New macros require RFC + version bump. Plugins MAY contribute namespaced (`@plugin.$macro`). Per-macro lowering targets are concrete (e.g., `$prop → defineProps<{...}>() + computed`, `$resource → createResource(keyFn, fetcher)`, `$if → createIfBoundary` — note current arbor exports `when`, sigil mismatch documented below). Performance budgets in ns/μs (§8.2).
- **Plugin contract** (Plugin Contract Spec): `definePlugin({ name, version, namespace, contributes?, hooks?, parsers?, dependencies?, scribeVersion? })`. `contributes.{blocks, macros, components, transforms}`. Lifecycle hooks `beforeCompile`, `afterParse`, `transformBlock`, `afterCompile`. `MacroContext`, `BuildContext`, `SfcContext`, `BlockContext`, `LoweringResult { code, imports?, hoist?, target? }`. Server-side via Amendment 03 §6.5 (`serverRuntime`, `serverOnly`, `middleware` provisional).

### Locked spec-quartet decisions for this roadmap

- **Q8 collapse**: ratify Plugin Contract Spec; `@scribe/plugin` IS the abstract surface (Plugin Contract internals — `contributes` / `lowering` / `BuildContext` / `LoweringResult` — are the canonical names). Migrate spec to `docs/superpowers/specs/` at v1.0.
- **Amendment 02 path convention: Option B** (`/server/_actions/` Nuxt-style) — locked. The user's explicit "5. B" in this session is authoritative over Scout R2.5, which had been authored against a prior Option-A adjudication. Reconcile the spec ratification toward Option B at v1.0; Builder R4 carries the spec amendment update through migration.
- **Amendment 03 middleware §6.5.3: Option A** (provisional in v1.x; can iterate). Locked.
- **Q10:D** — `<$shield>` is **compiler-lowered** using arbor primitives + reused mount-level `ErrorHandler`. Helper named `createShieldBoundary` (matches macro vocabulary §3.14). ~5-15 B framework cost. Not a runtime arbor primitive; arbor stays at the v0 size budget.
- **Q3:A** — file-based layouts (`layouts/default.scribe`, Nuxt-style). Locked. Pages override via `@route { layout: 'admin' }`; `@layout 'admin'` shorthand exists per spec §7.5 (kept for v1.0; Open Q in spec §12 to drop it is deferred to v1.1).
- **Q6 router middleware: Option 1** — router-level isomorphic `defineRouterMiddleware`, distinct from server `defineMiddleware`, composable across the SSR boundary at `composeMiddleware(allMws)(req, finalHandler)`. +150-220 B in `@scribe/router`; raises router size limit by +256 B in v0.7.

### Spec-quartet contradictions found (none beyond reconciliation)

The Architect did not trip surface condition #1 or #4 during this drafting pass:

- **Sigil mismatches** (`when` ↔ `createIfBoundary`, `each` ↔ `createEachBoundary`, `slot` ↔ `createSlotBoundary`/`<$slot>`): the underlying primitives in `@scribe/arbor` are correct; the spec calls for compiler-emitted helpers with the `createXBoundary` naming. Resolution: compiler emits the boundary helpers, which internally call the arbor primitives. No arbor source rename needed; lowering is a compiler responsibility (Plugin Contract Spec §5: `MacroContext.runtime(name)` returns a local for the runtime helper). **Adaptation feasible — roadmap targets the spec.**
- **`$slot` vs `slot()`**: same shape, sigil-only difference. The arbor primitive `slot()` (PR #20) stays; `<$slot>` template element compiles to `slot(...)` calls. **Adaptation feasible.**
- **`@route` and build-target framework**: both fully GAP (Investigator confirmed neither exists in any form). They require ~3-6 days combined of Rust compiler + router + config + CLI work. Sequencing: `@route` parser/types/codegen-sidecar = v0.6; build target plumbing must land **before** `@route { ssr: true, middleware: [...] }` is honored (per Investigator §"Cross-item interactions"). Therefore build target lands in v0.6 alongside `@route`. No spec adaptation required; the roadmap simply schedules the work.
- **Path convention reconciliation**: Scout R2.5 was written against Option A (`_scribe-server/{actions,form-actions,mcp}/`). User locked Option B (`/server/_actions/`, `/server/_form-actions/`, `/server/_mcp/`) for this session. The spec text needs an inline reconciliation when the spec migrates to `docs/superpowers/specs/`; Builder R4 owns that diff. **Adaptation feasible — single-line path-prefix change in spec text.**

### Cross-package naming facts (acknowledged here; resolution applied in §"Naming Scheme A application")

The user narrowed naming scope to Plugin Contract internals only, but Scout R2.5 surfaced two real cross-package collisions worth recording:

- **`createRouter`** exists as an export of both `@scribe/server` (request-router for HTTP envelope) and `@scribe/router` (file-based route table consumer). Same identifier, different intent.
- **`defineMiddleware`** in `@scribe/server` (hand-authored HTTP middleware) collides with `contributes.middleware` in the Plugin Contract Spec (Amendment 03 §6.5.3, plugin-contributed middleware — different mechanism, same word).

Both are facts the roadmap acknowledges; resolution proposal is in §"Naming Scheme A application" below — applied within the Plugin Contract Spec ratification scope (per the user's narrowing) and absorbing the cross-package collisions as part of that pass.

---

## Milestone sequencing

The user locked the shape: **0.2 = basic feature sets land, 0.3-0.8 = progressive features (Architect sequences), 0.9 = docs and testing pass, 1.0 = release cutover**. Below: each version's scope, package(s) touched, runtime dep envelope, size-budget reservation, and acceptance.

---

### v0.2 — Foundation (basic feature sets land)

**Theme:** Make the framework *aware of itself as a plugin host*. Land the entry point, the parser stub, and the size-policy formalization. No user-visible syntax migration yet — this version is the scaffolding for v0.3-0.8.

**Items:**

- **v0.2.1 — `plugins: [...]` field in `defineScribeConfig`.** The single most load-bearing addition: the config root admits a plugin array. `definePlugin({...})` factory ships behind `@scribe/plugin` package (Q8 collapse). v0.2 ships the **type contract and registration plumbing only** — the contract dispatches to a no-op compiler at first; v0.3+ wire the dispatcher to actual block parsers, macro lowerings, etc.
  - Packages: new `@scribe/plugin` (build/dev-time only; ~0 B runtime); `@scribe/server` config schema extension.
  - Runtime imports: `@scribe/plugin` runtime imports = none; build/dev-time only. `@scribe/server` config field accepts `Plugin[]`; runtime is unchanged.
  - Size-budget reservation: `@scribe/plugin` no runtime size row (build/dev only). `@scribe/server` no row (server-side, per v0.2.4).
  - Acceptance: `defineScribeConfig({ plugins: [forms({...})] })` parses; compiler accepts plugin registration without error; one example plugin (data — see v0.2.5) registers cleanly.

- **v0.2.2 — Parser stub for `@blockname { }` syntax (alongside existing `<script setup>` / `<template>` / `<style>` / `<agent>`).** Rust compiler gains a second `next_block()` discriminator — `@`-prefix vs `<`-tag. Both grammars accepted by the parser; lowering paths still go through the existing emit pipeline. **No deprecation yet** of `<script setup>` etc.
  - Packages: `@scribe/compiler` (Rust).
  - Runtime imports: none (compiler is build-time).
  - Acceptance: `tests/sfc_split.rs` adds dual-fixture coverage — one `.scribe` file with `<script setup>` + `<template>`, one with `@state {}` + `@template {}`. Both compile to the same emitted JS shape (function form when no agent/route blocks present). Compiler error message names which grammar was detected.

- **v0.2.3 — arbor 15 B regression cleanup.** Carry-over from R1 Scout Q1. Recover ≥ 15 B + ≥ 30 B safety margin via Compressor pass on `@scribe/arbor`. **Required before any v0.5 macro-element work** (which lowers to arbor primitives and would otherwise trip the size gate first).
  - Packages: `@scribe/arbor`.
  - Runtime imports: `@scribe/signals` (no change).
  - Size-budget reservation: arbor stays at 2200 B limit; target ≥ +30 B headroom post-recovery.
  - Acceptance: `bun run size` green on arbor row; receipt in commit message.

- **v0.2.4 — v0 size-limit row policy formalization.** Document explicitly that `@scribe/server` and `@scribe/agent-readiness` carry **no `.size-limit.json` row by design** — they are SSR-side, budgeted by SSR-bytes-served (and dep-tree audit), not browser-bundle bytes. Add CI lint that flags any package importing browser-eligible code without a size row.
  - Packages: repo-level (`HARNESS.md` + `.size-limit.json` README + new CI check).
  - Runtime imports: none.
  - Acceptance: HARNESS.md §"Size budgets" names the policy; CI fails if a browser-eligible package adds a `src/index.ts` export without a row.

- **v0.2.5 — Build-path canonical (Learning #47).** Name `bun run size` (package-script + mangle) as the canonical size-gate path. Update `bench/signals/HARNESS.md`, `.size-limit.json` README, and `state-plan-a.md` "Durable references". The moon-orchestrator path may still exist for benches but is non-canonical for size.
  - Packages: repo-level (no package code change).
  - Runtime imports: none.
  - Acceptance: single canonical command documented; CI uses it.

- **v0.2.6 — `@scribe/data` registered as canonical data plugin (no rename yet).** Install `@scribe/data` via `definePlugin({ namespace: 'data', contributes: {...} })` shim — registration only; dispatcher is no-op until v0.4 lowers `$resource`. Documents the data-as-plugin framing without churning the package name (Naming Scheme A rename to `@scribe-plugin/data` deferred to v1.0 cutover).
  - Packages: `@scribe/data` (adds plugin registration shim).
  - Runtime imports: `@scribe/signals`, `@scribe/context` (no change).
  - Acceptance: data plugin registers under `defineScribeConfig({ plugins: [data()] })` without error.

**Out for v0.2:** any user-visible syntax migration; any deprecation of `<script setup>` etc.; any block-grammar lowering changes. All deferred to v0.3.

---

### v0.3 — Block grammar migration

**Theme:** Switch the canonical authoring surface from HTML-tag grammar to `@blockname { }` grammar. `@state`, `@template`, `@style`, `@agent` parsers + lowerings land. Dual-parse stays (transitional) — v0.3 ships the new shape as "preferred" but does not break v0.1.x users.

**Items:**

- **v0.3.1 — `@state { }` block parser + lowering.** Body is TypeScript with brace-depth tracking. Lowers to the same `setup()` function the current `<script setup>` does. Adds `$prop` macro recognition (no semantics yet — that's v0.4).
- **v0.3.2 — `@template { }` block parser + lowering.** Body is HTML-shaped (current `<template>` grammar) inside `{}`. Brace-depth tracking handles `{expr}` curly-form attributes (parsing the form, no semantics until v0.4).
- **v0.3.3 — `@style { }` block parser + lowering.** Body is CSS. Reuses current `emit_style_block` (`packages/compiler/src/codegen/emit.rs:10-23`); attribute migration `<style scoped>` / `<style global>` → `@style { }` / `@style { $global }` (Macro Vocabulary §4.3). Note: `$global` recognized as token; full `$reactive`/`$tokens`/`$media`/`$when` macro handling deferred to v0.4.
- **v0.3.4 — `@agent { }` block parser + lowering.** Body is current `<agent>` grammar inside `{}`. Reuses `agent.rs` parser. `manifest_json` emission unchanged. Deprecation banner emitted (warning only) when a file uses HTML-tag form — informs migration path.
- **v0.3.5 — Cross-block resolution / unified symbol table.** Implements Block Structure Spec §11.1-§11.4. `@state` declares; `@template`/`@style`/`@agent` reference. Forbidden cross-references compile-error.
- **v0.3.6 — Reserved-token rejection (Block Structure Spec §8.1).** Top-level `---`, `import`, `export`, `;` are v1-rejected. Compile errors with span info.
- **v0.3.7 — Block ordering free; recommended order documented.** No enforcement (per Block Structure Spec §3.3).
- **v0.3.8 — Conformance fixtures at `bench/compiler-conformance/blocks/`.** New directory with golden-output tests, one fixture per block.

**Packages:** `@scribe/compiler` (Rust). **Runtime imports:** none (build-time).
**Size-budget reservation:** none new (compiler emits same JS shape).
**Acceptance:** all existing v0.1.x fixtures compile under both grammars and emit byte-identical JS (modulo deprecation warning); 454 tests still green; new conformance suite passes.

---

### v0.4 — Macro attributes

**Theme:** The `$attr` template-attribute syntax lands. `$if`, `$show`, `$each`, `$bind:*`, `$on:*`, `$key`, `$html`, `$raw`, `$once`, `$memo`, `$action` (form attr). Existing Vue-shaped `:attr` and `@event` syntax stays as **deprecated** alias paths; compiler emits a `DEPRECATED` warning when seen. v1.0 cutover removes the aliases.

**Items:**

- **v0.4.1 — Quoted-form attr parsing.** Identifier-only / dotted property path (Template Attribute Syntax §1.1, §2.2). Compile-error on bracket / call / optional-chain in quoted form.
- **v0.4.2 — Curly-form attr parsing.** `attr={expression}` arbitrary JS; signal-aware effect generation.
- **v0.4.3 — Bare-value rejection (§1.3).** `attr=value` compile-error.
- **v0.4.4 — Boolean-only attribute support (§1.4).** HTML `disabled`, scribe `$once`, `$raw`.
- **v0.4.5 — Per-macro lowerings (Macro Vocabulary §3):**
  - `$if` → `createIfBoundary` (compiler-emitted; calls `arbor.when`)
  - `$show` → CSS-variable + dataset effect (no arbor primitive needed)
  - `$each` → `createEachBoundary` (calls `arbor.each`)
  - `$bind:*` → effect + addEventListener pair
  - `$on:*` → event listener (replaces `@event`, same semantics)
  - `$key` → option to `arbor.each`
  - `$html` → DOM property assignment with security warning per spec §3.7
  - `$raw` → subtree-raw pass-through marker
  - `$once` → `createOnceBoundary` (new compiler-emitted helper; uses `untrack`)
  - `$memo` → `createMemoBoundary(deps, build)` (new helper)
  - `$action` (form attr) → split-bundle form-actions endpoint (deferred to v0.5 since it depends on build-target framework)
- **v0.4.6 — `@state` macros (Macro Vocabulary §2):** `$prop` (→ `defineProps<{...}>() + computed`), `$computed` (→ `computed()`), `$resource` (→ `data` plugin's `createResource`), `$effect` / `$effect.on` / `$watch` (→ `effect`), `$action` declaration form (→ `function name(...) { return batch(...) }`), `$lifecycle.{mount,dispose}` (→ `onMount` / `onCleanup` — **new exports from `@scribe/runtime`**).
- **v0.4.7 — `@style` macros:** `$reactive` (→ `--reactive-N` CSS-variable + effect), `$global` (already aligned), `$media` (→ `@media` rule with build-time media query), `$when` (→ conditional `data-when-N` toggle).
- **v0.4.8 — `@agent` macros:** `$expose`, `$expose.write`, `$action` (reference form), `$scope`, `$rate-limit`, `$describe`. All extend the existing `manifest_json` emission shape.
- **v0.4.9 — Helper exports from `@scribe/runtime`:** `onMount`, `onCleanup`. ~30-50 B in runtime — runtime budget headroom 7 B is too tight; **the C-6 typecheck pass deferred to v0.4 may push runtime past limit; if so, raise runtime limit per Learning #42 split, with feature-bytes-vs-debt rationale documented in `.size-limit.json` row comment.** Director Q6 has not authorized a runtime limit raise; if the Compressor recovery on runtime can absorb the 30-50 B, no raise is needed. **Surface trigger if recovery falls short — see §"Risks and surface conditions".**
- **v0.4.10 — Conformance fixtures at `bench/compiler-conformance/template-attrs/` and `bench/compiler-conformance/macros/`.**

**Packages:** `@scribe/compiler`, `@scribe/runtime` (new lifecycle helper exports).
**Runtime imports:** runtime adds nothing new; helpers internal.
**Size-budget reservation:** runtime ≤ 1170 B (current limit; aim to absorb `onMount`/`onCleanup` via Compressor on existing surface). No new browser-package size raises.
**Acceptance:** Vocabulary spec §1 closed-list (39 forms / 36 names) all parse; lowering targets emit per spec §3.* lowerings; deprecation warnings on `:attr` / `@event`; conformance suite passes.

---

### v0.5 — Macro elements + Shield + Suspense + Guard + Warp + Slots

**Theme:** Compiler-lowered `<$element>` boundaries. `<$slot>`, `<$suspense>`, `<$shield>`, `<$guard>`, `<$warp>`. **All five are compiler-emitted helpers using existing arbor primitives** (no new arbor exports); per Q10:D the framework cost is ~5-15 B per boundary, paid at compile-time as helper code injected into the SFC's emitted JS.

**Items:**

- **v0.5.1 — `<$slot>` element + slot context exposure (§5).** Compiler emits `createSlotBoundary(...)` calls; lowers to `arbor.slot()` (PR #20). `expose="user, index"` syntax exposes named context to slot consumers. Replaces `<slot>` HTML form (the `<slot>` form continues to parse — same lowering — until v1.0 cutover removes it).
- **v0.5.2 — `<$suspense>` element + slot/fallback hybrid (§4).** `createSuspenseBoundary(promiseSource, fallback)`. Subscribes to the resource graph; renders fallback until resolution. Slot context: `suspense.loading` (boolean signal).
- **v0.5.3 — `<$shield>` element (Q10:D — compiler-lowered).** `createShieldBoundary(child, fallback)`. Reuses arbor's mount-level `ErrorHandler` (`packages/arbor/src/types.ts`); compiler emits a wrapper that catches errors thrown in `setup()` / template effects / event handlers and renders the fallback subtree. Slot context: `shield.error` (the thrown value), `shield.retry` (function to remount). **~5-15 B framework cost** per Q10:D; no new arbor primitive.
- **v0.5.4 — `<$guard>` element.** `createGuardBoundary(check, fallback)`. Slot context: `guard.user`, `guard.reason`, `guard.path`. Compiler emits a wrapper around the protected subtree; the `check` signal/expression gates render. **No scope/permission/rate-limit infrastructure in v0.5** (those are `@agent` macro semantics in v0.4); the boundary just exposes the slot context shape.
- **v0.5.5 — `<$warp>` element.** Teleport/portal-style primitive (render subtree elsewhere in the DOM). Compiler emits `createWarpBoundary(target, child)`; uses `arbor.mount` against the target node. ~10-20 B framework cost.
- **v0.5.6 — `<$slot>` slot/fallback hybrid mutual-exclusion check.** Compile-error if both `fallback="..."` attribute and `<$slot name="fallback">` child appear (§4 hard rule).
- **v0.5.7 — Inline-JSX-in-attributes rejection (§6).** Compile-error on `fallback={<Skeleton />}`. Migration message: "extract to component, or use `<$slot>` child".
- **v0.5.8 — Conformance fixtures.**

**Packages:** `@scribe/compiler` (lowering); `@scribe/runtime` (new exposed helpers `createShieldBoundary` etc., or kept as compiler-emitted SFC-internal — Architect-leaning: SFC-internal to avoid runtime size raise).
**Runtime imports:** none new (the boundaries reuse `arbor.mount`/`arbor.when`/existing `ErrorHandler`).
**Size-budget reservation:** ~5-15 B per boundary, **paid in user-emitted SFC JS, not in runtime/arbor**. Runtime and arbor stay at v0 budgets.
**Acceptance:** the five boundary elements render correctly in conformance fixtures; `<$shield>` reuses `ErrorHandler` (one test asserts the same code path); arbor and runtime sizes unchanged.

---

### v0.6 — `@route` + build-target framework + file-based layouts

**Theme:** Page-aware compilation. The `@route` block lands; the build-target enum (`Client | Server | Universal`) plumbs through compiler and config; file-based layouts ship per Q3:A. **These three items are coupled** (per Investigator §"Cross-item interactions"): `@route { ssr: true, middleware: [...] }` cannot ship without build-target awareness, because client-only builds must elide server-side handler glue per Amendment 02 §11.5.

**Items:**

- **v0.6.1 — `@route` block parser + types.** New `BlockKind::Route` in `sfc.rs`; new `parser/route.rs` module parses TypeScript object literal body (`path`, `name?`, `middleware?`, `ssr?`, `layout?`). New `RouteBlock` struct, `route: Option<RouteBlock>` on `ScribeSource`. Validation: `@route` outside `src/pages/` → compile error. `@layout 'admin'` shorthand recognized (defer drop to v1.1 per spec §12 Open Q).
- **v0.6.2 — `@route` codegen sidecar.** Compiler emits `<component-id>.route.json` (or extends `defineElement` to embed metadata — Architect-leaning: sidecar, since the router's Vite plugin is the consumer and reads from disk). Carries `pattern`, `name`, `middleware`, `ssr`, `layout`.
- **v0.6.3 — Router consumes `@route` metadata.** `@scribe/router/src/vite-plugin.ts` `scanPages()` reads sibling `.route.json` files; `RouteDefinition` shape extended with `name?`, `middleware?`, `ssr?`, `layout?`. File-based scan stays as the fallback when no `@route` block present.
- **v0.6.4 — Build target enum.** New `BuildTarget` enum (`Client | Server | Universal`) in `packages/compiler/src/types.rs`. Plumbed through `compile()` / `compile_full()` / `emit()` (hung on `CompileUnit` to avoid emit-signature growth). New `--target <client|server|universal>` flag in `bin/main.rs` (default `universal` per Block Structure Spec §11.5).
- **v0.6.5 — `build.target` field in `defineScribeConfig`.** New `build` object in `ScribeConfig` (`packages/server/src/config.ts`); `target: BuildTarget`. Compiler reads via plugin context.
- **v0.6.6 — Server-artifact emission gates.** When `$server` macro / `<form $action>` / `@agent` block emit server-side bundles, gate emission on `target ∈ {Server, Universal}`. Client-only builds emit warning + elide. **Path convention: Option B — `/server/_actions/{component-id}/{name}.ts`, `/server/_form-actions/{component-id}/{name}.ts`, `/server/_mcp/{component-id}.ts`.** (User's locked B over Scout R2.5's A; spec text reconciliation lands in v1.0 spec migration.)
- **v0.6.7 — `$server` macro lowering.** Per Macro Vocabulary §2.12. Server file emits at `/server/_actions/{component-id}/{name}.ts`; client emits `createServerCall<Args, Return>('component-id/name')` stub. New `createServerCall` runtime helper in `@scribe/server` client subpath (or `@scribe/runtime` — Architect-leaning: `@scribe/server`'s client-safe subpath, since the wire format is server-defined).
- **v0.6.8 — File-based layouts (Q3:A).** `layouts/default.scribe`, `layouts/admin.scribe`. Compiler scans `src/layouts/`, emits `virtual:scribe-layouts`. Router resolves layout-then-page during match. `defineScribeConfig.layouts` map (default + per-route override). Per-page override via `@route { layout: 'admin' }`.
- **v0.6.9 — Conformance fixtures** at `bench/compiler-conformance/route/` and `bench/compiler-conformance/build-target/`.

**Packages:** `@scribe/compiler`, `@scribe/server` (config), `@scribe/router` (vite-plugin metadata read).
**Runtime imports:** `@scribe/server`'s new `createServerCall` is a small client-safe helper (~50-100 B); no new package deps. Router still imports `@scribe/server` (existing — `renderToString`).
**Size-budget reservation:** `@scribe/server` no row (server-side); `@scribe/router` stays at 1536 B (no new bytes — the `@route` consumption is build-time only). Layouts add no runtime bytes (compiler emits layout-wrapping code into page JS).
**Acceptance:** an `.scribe` page in `src/pages/admin/users.scribe` with `@route { name: 'admin-users', layout: 'admin', middleware: ['auth'] }` produces correctly-resolved router metadata; `--target client` build elides server artifacts with a warning; layouts render correctly nested.

---

### v0.7 — Router middleware + plugin server-side contributions

**Theme:** The Q6 Option 1 router-level isomorphic middleware lands; Amendment 03 §6.5 server-side plugin contributions wire through Plugin Contract; the `createRouter` and `defineMiddleware` cross-package collisions resolve.

**Items:**

- **v0.7.1 — `defineRouterMiddleware` + `composeRouterMiddleware` in `@scribe/router`.** Per Director Q6 Option 1. `RouteMatchContext { url, params, route, signal, env }`; `RouterResult { kind: 'continue' | 'redirect' | 'cancel', ... }`. ~150-220 B in `@scribe/router`. **Router size limit raise: +256 B (1536 → 1792 B).** Architect-leaning: pair with a Compressor pass (mirroring arbor's 176 B recovery) to net less than +256 B if possible; if Compressor recovers ≥ 100 B, the limit raise is +150-200 B instead.
- **v0.7.2 — Router middleware Vite-plugin auto-wire (file convention).** `pages/admin/_middleware.ts` exports a `RouterMiddleware`; the router Vite plugin auto-wires it to all routes under that segment. Mirrors Nuxt's `middleware/` directory at the route tree.
- **v0.7.3 — Plugin Contract Amendment 03 §6.5 wiring.** `serverRuntime` field, `serverOnly: true` macro flag, `middleware: [{ name, stage, handler }]` (provisional). All recognized by the plugin loader; lowering directs to server bundle per Amendment 02 Option B paths.
- **v0.7.4 — Cross-package collision resolution (Naming Scheme A on Plugin Contract internals).**
  - `@scribe/server.createRouter` → renamed to `createRequestRouter` (or kept at `createRouter` under `@scribe/server` and the plugin-contributed `@scribe-plugin/router` namespace owns the file-route consumer; Architect-leaning: rename `@scribe/server.createRouter` to `createRequestRouter` for symmetry with `defineRequestHandler`).
  - `@scribe/server.defineMiddleware` → kept as the hand-authored HTTP middleware. Plugin-contributed middleware uses `contributes.middleware` (no naming clash because they're in different *kinds*: one is a function call, the other a config-object field). Naming Scheme A here is documentation: spec text says "plugin-contributed middleware vs hand-authored middleware".
  - `viteRouterPlugin` (`@scribe/router`) → renamed to `viteRouterIntegration` (disambiguates from "scribe plugin" — it IS a Vite plugin, NOT a `@scribe/plugin`).
  - `agentReadiness` (Vite plugin export from `@scribe/agent-readiness`) → renamed to `viteAgentReadinessIntegration`.
- **v0.7.5 — Compose composition spec.** Document plugin server-side contributions composing with router middleware: `before-handler` (server, plugin-contributed) → `route-match` (server) → router middleware chain → `defineRoute` handler → `after-handler` → `on-error`. Per Director Q6 Composition spec.

**Packages:** `@scribe/router` (+256 B raise), `@scribe/server` (rename `createRouter` → `createRequestRouter`), `@scribe/agent-readiness` (rename Vite plugin export).
**Runtime imports:** unchanged dep graph.
**Size-budget reservation:** `@scribe/router` raise to 1792 B. No other browser-package raises.
**Acceptance:** one client-side `redirect` test, one server-side composition test, one isomorphic-auth test, one plugin-contributed middleware composition test. `bun run test` green.

---

### v0.8 — CLI scaffolder + Hello World template + first-run UX

**Theme:** The framework is usable by a new consumer with `npx scribe app <name>`. Developer can ship a Hello World page (with `<$shield>`, `@route`, layout) end-to-end without reading the spec quartet.

**Items:**

- **v0.8.1 — `@scribe/cli` package.** Build-time Bun/Node CLI exposing `scribe app <name>`, `scribe page <route>`, `scribe component <name>`, `scribe plugin <name>`. Templated scaffolds for each.
- **v0.8.2 — Hello World template.** `npx scribe app my-app` produces:
  - `package.json` (deps: `@scribe/server`, `@scribe/router`, `@scribe/runtime`, `@scribe/arbor`, `@scribe/signals`, `@scribe/agent`; devDeps: `@scribe/cli`, `vite`)
  - `scribe.config.ts` (`defineScribeConfig({ build: { target: 'universal' }, plugins: [data(), agent()] })`)
  - `src/pages/index.scribe` (Hello World with `@template { Hello {{ name }} }`, `@state { $prop name: string = 'world' }`)
  - `src/layouts/default.scribe`
  - `vite.config.ts` (compiler + router + agent-readiness Vite integrations)
- **v0.8.3 — First-run UX.** `bun run dev` starts the Vite dev server with HMR; navigating to `localhost:5173` renders Hello World; making an edit to `index.scribe` HMR-updates without page reload.
- **v0.8.4 — Light-off procedure docs.** Documentation page describing the first-run experience and the dev → build → preview cycle.
- **v0.8.5 — Plugin scaffold template.** `npx scribe plugin my-plugin` produces a skeleton npm package with `definePlugin({ name, version, namespace, contributes: {} })`, an example macro, an example block, and a publishable `package.json`.

**Packages:** new `@scribe/cli` (build/dev-time only; ~0 B runtime impact).
**Runtime imports:** none.
**Size-budget reservation:** none new (CLI is build-time).
**Acceptance:** `npx scribe app demo && cd demo && bun install && bun run dev` produces a running Hello World; an end-to-end smoke test in CI runs through this on every PR.

---

### v0.9 — Docs and testing pass

**Theme:** Documentation site at `docs/site/` (Markdown), end-to-end test coverage, dep-free re-audit, and the v1.0 release-pipeline rehearsal. **No new framework features in v0.9.**

**Items:**

- **v0.9.1 — `docs/site/` Markdown build pipeline.** Static site generator (handrolled or via the v0.6 SSG path; Architect-leaning: handrolled for v0.9, since SSG is itself part of the v1.0 surface and must not depend on under-test code). Pages:
  - **Introduction** — what scribe is, why it exists, the v3 dep-free thesis.
  - **Installation** — `npx scribe app`, prerequisites, package versions.
  - **Getting Started** — Hello World walkthrough; mirrors v0.8 template.
  - **Authoring Components** — `@state`, `@template`, `@style`, `@agent` blocks; `$attr` template syntax; `<$element>` boundaries.
  - **Authoring Plugins** — `definePlugin`, `contributes.{blocks, macros, components, transforms}`, lifecycle hooks, server-side contributions.
  - **Authoring Agents** — `@agent` block, MCP tool/resource registration, `$expose`, `$action`, `$rate-limit`, `$describe`.
  - **Routing + Layouts** — file-based router, `@route` block, layouts, router middleware.
  - **Data Fetching** — `$resource`, `createResource`, server loaders (`defineLoader`), `$server` macro.
  - **Reactivity** — signals, computeds, effects, batch, untrack.
  - **SSR + Hydration** — `renderToStream`, hydration, islands, defer hydration.
  - **Deployment** — Bun, Node, Workers, Vercel Edge; the 3-state loader; `SCRIBE_NATIVE_SKIP`.
  - **API Reference** — every public export across all packages.
- **v0.9.2 — Test-gap audit + closeout.** Cross-reference `bun run test` coverage against the spec quartet conformance suites (v0.3.8, v0.4.10, v0.5.8, v0.6.9). Add tests where coverage is missing. Goal: every spec-mandated behavior has at least one test.
- **v0.9.3 — Dep-free re-audit (Learning #49 prep for v1.0).** Snapshot every package's `dependencies` + `peerDependencies` + `optionalDependencies`. CI gate: `npm ls --production` per package; fail on any non-`@scribe/*` entry. (Already substantially compliant per Scout R1 §2.1; v0.9 verifies no drift.)
- **v0.9.4 — HMR scribe-native confirmation.** Re-run grep gate: `grep -r '@vitejs/client' packages/*/src/` zero hits. (Already PASS per R2 audit.)
- **v0.9.5 — Cross-runtime adapter completeness tests.** Confirm `@scribe/server` runs across Bun, Deno, Node, Cloudflare Workers, Vercel Edge with the existing 3-state loader. Parity matrix in CI.
- **v0.9.6 — Build-tool independence smoke test.** Verify the compiler emits code that runs WITHOUT Vite (consumed via raw `tsc` + a static file server). Acceptance gate for the abstract `@scribe/plugin` (Q8 collapse).

**Packages:** `docs/site/` (new); repo-level CI additions; no source-package changes.
**Runtime imports:** none.
**Size-budget reservation:** none.
**Acceptance:** docs site builds and renders; all 12+ pages have content; conformance suites pass; `npm ls --production` gate green.

---

### v1.0 — Cutover

**Theme:** Release. CI re-enabled, branch protection on, release pipeline gate operational, spec quartet migrated to `docs/superpowers/specs/`, dual-grammar parser deprecation rolled forward to removal, Naming Scheme A renames published, npm tags shipped.

**Items:**

- **v1.0.1 — Re-enable CI on `main`.** GitHub Actions workflow runs `bun run test`, `bun run typecheck`, `bun run size`, `bun run bench` on every PR. (Per Decision 7 from session-start director note: "names the gate; *when* to flip it is a separate cutover-session decision" — the user's locked 1.0 milestone shape *is* that decision; v1.0 = CI on.)
- **v1.0.2 — Branch protection on `main`.** Require checks; require PR review; require linear history.
- **v1.0.3 — Release pipeline gate.** npm publish gate via `bun run release` orchestrator; version-bump policy (independent SemVer per package); changeset format. Dry-run publish completes without manual override.
- **v1.0.4 — Final dep-free audit.** v3 thesis hard gate: every `npm ls --production` shows `@scribe/*` only. Any drift fails CI.
- **v1.0.5 — Full thesis-compliance check.** Tier-3 hooks paid for in v0 honored (Learning #16); browser-bundle ceiling 3.46 kB respected; `untrack` re-entrancy contract honored (Learning #46); rolldown external discipline honored (Learning #48); selective lean (no `@vitejs/client` at runtime) honored.
- **v1.0.6 — Spec quartet migration to `docs/superpowers/specs/`.** Builder R4 moves the four specs + three amendments. Inline reconcile Amendment 02 Option B path-prefix in spec text. Update `state-plan-a.md` "Durable references" to point at the new home. (Q8 collapse formally lands here.)
- **v1.0.7 — Dual-grammar deprecation removal.** Compiler removes the `<script setup>` / `<template>` / `<style>` / `<agent>` HTML-tag parser path. Only `@blockname { }` grammar accepted from v1.0 onward. Migration tool (`npx scribe migrate`) ships in `@scribe/cli` to auto-convert v0.1.x SFCs.
- **v1.0.8 — Vue-shape `:attr` / `@event` deprecation removal.** Compiler removes the alias paths. Only `$attr` / `$on:*` accepted. Migration tool covers this too.
- **v1.0.9 — Naming Scheme A rename publication.** `@scribe/data` → `@scribe-plugin/data`; `@scribe/agent-service` → `@scribe-plugin/agent-service` (or kept core; decided in §"Naming Scheme A application"). `@scribe/agent-readiness` → `@scribe-plugin/agent-readiness`. Old package names publish a single `1.0.0` "moved" stub that re-exports from the new home.
- **v1.0.10 — Tag and ship.** `git tag v1.0.0`; npm publish; release notes.

**Packages:** all (release).
**Runtime imports:** unchanged from v0.9.
**Size-budget reservation:** unchanged from v0.9.
**Acceptance:** `git tag v1.0.0` published; consumer can `npx scribe app demo` against published packages; the framework is what the spec quartet says it is.

---

## Per-version dep envelope (Learning #49 hard constraint)

| Package | v0.1.x (current) | v0.2-0.5 | v0.6-0.7 | v0.8-0.9 | v1.0 (target) | Sunset notes |
|---|---|---|---|---|---|---|
| `@scribe/signals` | zero | zero | zero | zero | zero | clean throughout |
| `@scribe/arbor` | `@scribe/signals` | unchanged | unchanged | unchanged | unchanged | clean |
| `@scribe/runtime` | peer: `@scribe/arbor`, `@scribe/signals` | unchanged | unchanged | unchanged | unchanged | clean |
| `@scribe/context` | zero | unchanged | unchanged | unchanged | unchanged | clean |
| `@scribe/agent` | zero | unchanged | unchanged | unchanged | unchanged | clean |
| `@scribe/data` | `@scribe/signals`, `@scribe/context` | + plugin shim | unchanged | unchanged | rename → `@scribe-plugin/data` (v1.0.9) | clean |
| `@scribe/router` | `@scribe/server` | unchanged | + size raise +256 B (v0.7.1) | unchanged | unchanged | hand-rolled matcher; isomorphic middleware in router scope only |
| `@scribe/server` | `@scribe/agent`, optional native addons | + `plugins` config field (v0.2.1), + `build` config (v0.6.5) | + Amendment 03 §6.5 wiring (v0.7.3), + `createServerCall` (v0.6.7) | unchanged | unchanged | clean (native addons stay under `@scribe/*`) |
| `@scribe/agent-service` | `@scribe/agent` | unchanged | unchanged | unchanged | unchanged | clean |
| `@scribe/agent-readiness` | `@scribe/server`, `@scribe/agent` | unchanged | + Vite-plugin rename (v0.7.4) | unchanged | rename → `@scribe-plugin/agent-readiness` (v1.0.9) | clean |
| `@scribe/compiler` | peer: `vite ≥5` (optional) | + `@`-block parser (v0.2.2) | + `@route` (v0.6.1), + build target (v0.6.4), + macro lowerings (v0.4) | unchanged | + dual-grammar removal (v1.0.7) | peer becomes optional-only by v1.0 |
| `@scribe/plugin` (NEW v0.2.1) | n/a | runtime: none | unchanged | unchanged | unchanged | build/dev-time only |
| `@scribe/cli` (NEW v0.8.1) | n/a | n/a | n/a | runtime: none | unchanged | build/dev-time only |
| `@scribe/image` (DEFERRED — see assets follow-up) | n/a | n/a | n/a | n/a | possibly v1.0 if assets in baseline; see follow-up | Sharp build-only |
| `@scribe/fonts` (DEFERRED) | n/a | n/a | n/a | n/a | possibly v1.0 | fontkit build-only |
| `@scribe/css-pipeline` (DEFERRED) | n/a | n/a | n/a | n/a | possibly v1.0 if assets in baseline | postcss build-only or compiler-internal |

**No package carries any non-`@scribe/*` runtime dep at any version.** All non-`@scribe/*` deps remain build-time / dev-time / peer-optional. Native addons (`@scribe/server-{platform}`) stay under the `@scribe/*` namespace.

---

## Open follow-ups attached to milestones

| Follow-up | Source | Slot |
|---|---|---|
| arbor 15 B regression cleanup | R1 Scout Q1 | **v0.2.3** |
| router +256 B size limit raise (router middleware) | Director Q6 + R2 draft | **v0.7.1** |
| runtime Compressor pass (only if Q10:D / `onMount`/`onCleanup` overflow) | v0.4.9 surface trigger | conditional during v0.4 |
| build-path consistency canonical name (Learning #47) | R1 Scout Q12 | **v0.2.5** |
| CI re-enable | R1 Scout Q13 + session-start director note Decision 7 | **v1.0.1** |
| v0 size-limit row policy formalization | R1 Scout Q2 | **v0.2.4** |
| Compiler C-6 (TS template type-check) | R1 Scout Q11 | folded into **v0.4** (typed bindings emerge from per-macro lowerings) |
| `@scribe/agent-service` Plan 5.3 wiring (`handleToolCall()`) | R1 Scout Q15 | **v0.4.8** (`@agent` macros) — `handleToolCall` dispatches to spec-mandated agent metadata |
| Spec quartet migration to `docs/superpowers/specs/` | Q8 collapse | **v1.0.6** |
| Naming Scheme A renames published | this doc §below | **v1.0.9** |
| `<$shield>` reuses arbor `ErrorHandler` (Q10:D) | locked | **v0.5.3** |
| Q14 `SCRIBE_NATIVE_SKIP` permanence + loader doc | R1 Scout Q14 | **v0.9.1** docs (deployment) |
| Q5 server adapter pattern docs (3-state loader IS the pattern) | R1 Scout Q5 + R2 audit | **v0.9.1** docs (deployment) |
| `@scribe/data` `Resource<T>` v1 freeze line | R1 Scout Q7 + R2 audit | confirmed by v1.0 cutover (no v2 magna in this roadmap) |

---

## Naming Scheme A application (Plugin Contract internals only)

The user narrowed the rename surface to Plugin Contract internals. Scheme A applies as follows:

### Plugin-contributed packages (npm scope move at v1.0.9)

- **`@scribe/data` → `@scribe-plugin/data`** — data is the canonical data plugin per Plugin Contract Spec §0 / §9.3. Keep public APIs (`createResource`, `createResourceStore`, etc.) unchanged; the namespace move is the rename.
- **`@scribe/agent-readiness` → `@scribe-plugin/agent-readiness`** — already a Vite plugin + content-negotiation handler; fits plugin-side cleanly.
- **`@scribe/agent-service`** — Architect-leaning: keep core (it's the MCP wire transport, not a plugin contribution). Final call: ratify at v1.0.9 cutover; if user prefers full Scheme A coverage, rename to `@scribe-plugin/agent-service`.

Old package names publish `1.0.0` stub that re-exports from new home — one cutover release, no breakage for early adopters.

### Plugin Contract internal types (no change — namespace itself signals)

- `definePlugin`, `contributes`, `lowering`, `BuildContext`, `SfcContext`, `BlockContext`, `MacroContext`, `LoweringResult`, `serverRuntime`, `serverOnly`, `target` (in LoweringResult), `parsers`, `transforms`, `hooks`, `dependencies` (plugin field), `scribeVersion`, `componentAliases`, `validIn` — **all kept as-is**. The `@scribe-plugin/*` scope itself signals "plugin world"; per-type prefixing would be redundant.

### Cross-package collision resolution

- **`createRouter` collision** — rename **`@scribe/server.createRouter` to `createRequestRouter`**. Rationale: `@scribe/server`'s router is the request-router for the HTTP envelope; `@scribe/router`'s `createRouter` is the file-based route table consumer. The `Request` discriminator is the natural disambiguation. Spec ratification (Q8 collapse) absorbs this rename. Lands at **v0.7.4** (alongside the router middleware work, which is the natural moment).
- **`defineMiddleware` overload** — keep `@scribe/server.defineMiddleware` (hand-authored HTTP middleware) and `contributes.middleware` (plugin contract field). They are different *kinds* of thing (function call vs config-object field), so no rename is forced. Document the distinction in the Plugin Contract Spec at v1.0.6 migration.
- **`viteRouterPlugin` / `agentReadiness`** — rename to **`viteRouterIntegration`** / **`viteAgentReadinessIntegration`**. Disambiguates from "scribe plugin" (these are Vite plugins, not scribe plugins). Lands at **v0.7.4**.

### What Scheme A does NOT touch

- `@scribe/signals`, `@scribe/arbor`, `@scribe/runtime`, `@scribe/context`, `@scribe/server`, `@scribe/router`, `@scribe/agent`, `@scribe/compiler`, `@scribe/cli` — all stay core (not plugin-contributed). User-facing surface (`signal`, `computed`, `effect`, `branch`, `leaf`, `mount`, `defineComponent`, `defineElement`, `defineRoute`, `defineApiRoute`, `defineLoader`, `defineScribeConfig`, `getAgentMetadata`, `registerAgentMetadata`) — all kept unchanged.

---

## Open assets-package-design follow-up

The assets-package-design-stub at `.team/v1-reconciliation/assets-package-design-stub.md` (Architect R2 companion) describes `@scribe/image` / `@scribe/fonts` / `@scribe/css-pipeline`. Under the original v1/v1.5/v2/v3 milestone shape, these targeted v1.5. **Under the locked 0.2 → 0.9 → 1.0 shape, the question is whether assets are in the v1.0 baseline or deferred.**

**Architect recommendation:** **DEFER assets to v1.x post-cutover (a follow-up design session).**

Reasons:
- v1.0 milestone shape says "release cutover" — adding three new packages with their own design surfaces (Sharp orchestration, fontkit subsetting, PostCSS pipeline) significantly delays the cutover.
- The user's "Nuxt/Next parity out of the box" bar is satisfied by v1.0 *without* assets if v1.0 ships SSR streaming + hydration + islands + router + scoped styles + slots + layouts + middleware + agents + plugins. That is a complete framework. Assets enhance it.
- The companion stub stays as-is; carry it forward as `.team/v1-reconciliation/assets-package-design-stub.md` (already in tree) for the post-v1.0 design session.

**Alternative:** if the user ratifies "assets in v1.0 baseline", sequence the three packages as v0.5/v0.6 work (CSS pipeline alongside `@style` macros at v0.4-0.5; image/fonts as v0.6 alongside layouts since they're page-shaped). This would push v0.9 docs out by ~2-3 weeks and broaden v0.9 testing scope. Surface to user.

The assets stub itself is preserved; this roadmap simply does not schedule it inside the 0.2 → 1.0 sequence by default.

---

## Risks and surface conditions

### Risks

1. **Parser dual-grammar period (v0.2 → v1.0).** Carrying both `@blockname { }` and `<script setup>` / `<template>` / `<style>` / `<agent>` parsers from v0.2 to v1.0 is ~6 months of compiler complexity. Mitigations: clear deprecation warnings from v0.3 onward; auto-conversion tool in `@scribe/cli` (v0.8); v1.0 hard removal lands on a clean cut.
2. **`@route` + build-target coupling.** Per Investigator §"Cross-item interactions", the `@route { ssr: true, middleware: [...] }` surface cannot ship without build-target awareness. Sequencing both into v0.6 absorbs the risk; if v0.6 slips, both slip together (no partial landing).
3. **Macro vocabulary closure.** 39 forms / 36 names land in v0.4-0.5. If a macro is wrong (semantics mismatch with downstream consumer needs), changing it post-v1.0 requires RFC + version bump (per spec). Mitigation: v0.9 conformance suite + early-adopter feedback before v1.0 tag.
4. **Plugin Contract surface is entirely new at v0.2.** First plugin (`@scribe/data` registration shim) is a smoke test for the contract. If the contract shape is wrong, v0.2 detects it; v0.3+ fixes are still cheap. By v0.7 (server-side contributions wiring), the surface should be stable.
5. **`@scribe/runtime` size headroom (7 B) tight for v0.4 lifecycle helpers.** `onMount`/`onCleanup` exports may push runtime past 1170 B. Mitigation: Compressor pass on runtime; if recovery falls short, Learning #42 split (feature-bytes-vs-debt) per `.size-limit.json` row comment. **Surface trigger if Compressor recovers < 30 B.**
6. **Naming Scheme A rename publication at v1.0.9.** Renaming `@scribe/data` to `@scribe-plugin/data` is a breaking change. Mitigation: stub re-export package at old name; `npx scribe migrate` updates user `package.json`.

### Surface conditions

The Architect surfaces back to the Director (and from Director to user) on:

1. **`@scribe/runtime` Compressor recovery falls short of `onMount`/`onCleanup` cost (v0.4.9).** Decision needed: raise runtime limit (Learning #42 split) or relocate helpers (e.g., to `@scribe/arbor` if it has headroom post-v0.2.3). Surface includes a recommendation.
2. **`@scribe/router` Compressor recovery falls short of router middleware cost (v0.7.1).** Currently +256 B reserved; if Compressor recovers < 100 B, raise stays at +256 B; if < 50 B, surface to consider scope reduction (e.g., drop file-convention auto-wire to v1.x).
3. **Spec quartet contradicts a locked decision during v0.3-0.6 implementation.** If the Builder discovers that the spec text contradicts itself or a locked Q (e.g., Amendment 02 Option B path conflicts with Plugin Contract Spec §6.5.4 cross-plugin server-side imports), surface immediately with the cite.
4. **`@route` block surface insufficient for v1.0.** If the closed `@route` field set (`path`, `name`, `middleware`, `ssr`, `layout`) misses a use case the Hello World template (v0.8) needs, surface for spec amendment.
5. **Locked decision contradicts a spec quartet section beyond reconciliation.** Per session brief surface trigger #1.
6. **Milestone sequencing requires breaking a Tier-3 hook (Learning #16).** Surface trigger #2.
7. **Any consumer breaking change outside the syntax migration.** Surface trigger #3.
8. **Spec quartet has internal contradictions you can't resolve from amendment authority.** Surface trigger #4.
9. **Sequencing requires npm runtime dep (Learning #49 hard).** Surface trigger #5. None foreseen in the roadmap above.

---

## Decisions ratified during session

| ID | Decision | Source-of-decision |
|---|---|---|
| **Interpretation A** | Full syntax migration to `@blockname { }` + `$attr` + `<$element>` | User (this session) |
| **Milestone shape** | 0.2 = basic features; 0.3-0.8 = progressive; 0.9 = docs+tests; 1.0 = cutover | User (this session) |
| **Q3:A** | File-based layouts (`layouts/default.scribe`, Nuxt-style) | User (this session) |
| **Amendment 02 path convention: Option B** | `/server/_actions/`, `/server/_form-actions/`, `/server/_mcp/` (Nuxt-style) | User explicit "5. B" (this session); Scout R2.5 was authored against Option A; reconcile spec text at v1.0.6 |
| **Amendment 03 §6.5.3: Option A** | Provisional `middleware: [{ name, stage, handler }]`; v1.x mutable | User (this session) |
| **Q8 collapse** | Plugin Contract Spec ratified; `@scribe/plugin` IS the abstract surface | User (this session); migrates to `docs/superpowers/specs/` at v1.0.6 |
| **Q10:D** | Compiler-lowered `<$shield>` reusing arbor `ErrorHandler`; `createShieldBoundary` helper | User (this session); ~5-15 B framework cost |
| **Q6 router middleware: Option 1** | Router-level isomorphic `defineRouterMiddleware`; +256 B `@scribe/router` raise | Director Q6 research (recommendation) → user single-click ratification (this session) |
| **Q2 spec quartet authority** | Quartet is load-bearing parallel design; cite incompatibilities only when adaptation impossible | Session brief |
| **Naming surface** | Narrowed to Plugin Contract internals; Scheme A applied (Plugin Contract internals + cross-package collision resolution) | User (this session) |
| **Naming Scheme A** | `@scribe-plugin/*` namespace for plugin-contributed packages; core APIs unchanged | Scout R2.5 (recommendation) → user (this session) narrowed scope |
| **docs/site/ Markdown** | v1.0 docs in plain Markdown, not eat-our-own-dogfood | User (this session) |

---

## What this roadmap does NOT do

Per Director Decision 7 (session-start) and the session brief's anti-patterns:

1. **Implementation of any v1 framework feature.** Architect drafts only; Builder R4 migrates the doc.
2. **Full `@scribe/assets` design.** Companion stub stays; full design is a post-v1.0 design session (per §"Open assets-package-design follow-up").
3. **`@scribe/magna` design.** Out of scope for v1.0. Magna integration is a post-v1.0 milestone — `@scribe/data`'s `Resource<T>` shape is **frozen for v1.0 wire compatibility** so magna can layer on top in v1.x without re-opening v1.0 surface.
4. **Re-opening any v0 size budget.** Signals 1970 B / arbor 2200 B / runtime 1170 B (current limit, not 1024 — the limit is what's in `.size-limit.json` on `main`) / agent 200 B / data 750 B / context 300 B. Router gets +256 B (locked at Q6 ratification). No other raises.
5. **Pre-emptive arbor or signals limit raises.** None proposed beyond router (Director-authorized).
6. **Deprecation of v0 size limits without explicit re-confirmation.** None proposed.
7. **Source code edits.** Read-only — Markdown only.
8. **Alternative milestone shapes.** User locked 0.2 → 0.9 → 1.0; not relitigated.
9. **Skipping the assets-package-design-stub.md follow-up.** Carry-forward acknowledged in §"Open assets-package-design follow-up".
10. **Loss of the v0 thesis.** Agent-first / magna-canonical / 3.46 kB ceiling / Tier-3 hooks paid for in v0 — all preserved.
11. **GHA scheduling discussion** beyond "v1.0 = CI on, branch protection on, release pipeline operational". The locked 1.0 milestone shape *is* that scheduling decision.
12. **v0 test coverage gap audit.** v0.9.2 absorbs whatever Scout finds; not pre-enumerated here.
13. **Native mobile / non-web targets.** Not in any 0.2-1.0 scope.
14. **vue-tsc-style full template type-check.** v0.4 typed bindings emerge from per-macro lowerings; richer flows are post-v1.0.
15. **MEDIUM items from `state-plan-a.md`.** Track-B / Round N+4 territory; not pulled.

---

## Iteration tracking

- R1 (Scout): DONE — `scout-report.md`
- R2 (Architect prior): DONE — `roadmap-draft.md` + `assets-package-design-stub.md`
- R2.5 (Scout supplemental): DONE — `scout-spec-quartet-alignment.md`
- Director Q6 research: DONE — `director-q6-research.md`
- Investigator (`@route` + build-target): DONE — `investigation-route-and-target.md`
- **R2.1 (Architect re-draft, this doc):** **DONE**
- R3 (Director re-engage): pending
- R4 (Builder doc migrate): conditional on user ratification
- R5 (Historian): pending

**Surface triggers fired during R2.1:** none.
**Spec quartet contradictions found:** none beyond reconciliation (sigil mismatches, path-convention reconciliation, sigil for `<$slot>`/`slot()` — all adaptation-feasible).
**Token spend (Architect, this doc):** ~12 K (well under the session budget).
