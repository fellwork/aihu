# Build manifest — `$ref` lowering fixes (#433, #432)

Branch: `fix/ref-lowering` · scope confined to `packages/compiler/`.

Two `$ref` lowering bugs. #433 is HIGH SEVERITY (silent blank subtree in the live
web app); #432 is a tsc-surface annotation bug. Both live on the same `$ref`
codepath.

---

## #433 — `$ref` on a `$if`/`$each`-gated element blanks the subtree (FIXED)

### The bug

`$ref` lowers to an `onMount(...)` wrapped around the element node (an IIFE in
`emit_macro_effects` → `ElemEffect::Ref`). When the SAME element also carries a
`$if`/`$each` directive, the composition in `emit_macro_effects`
(innermost→outermost: element-effects, then `$if`, then `$each`) nests that
`onMount` **inside** the `createIfBoundary(...)` / `each(...)` factory. Those
factories run with **no component-setup owner**, so the ref's `onMount` throws
`'no owner'`, the throw unwinds inside the boundary, and the element plus its
whole subtree render **blank with nothing surfaced** — a live reading column went
blank in the web app.

### Decision: compile-time diagnostic (C562), not owner-level emission

The issue offered two fixes: (a) a compile-time diagnostic, or (b) emit the ref's
`onMount` at setup-owner level so it actually runs. I chose the diagnostic.

**Why not owner-level emission.** It is not clean here, for structural reasons:

- The element node (`_n`) is created **conditionally, inside the boundary
  factory**, and does not exist at setup time. A setup-level `onMount` would have
  no node to read `_n.el` from, and for a `$if` whose condition is initially
  false the element never exists at all — so "bind the ref at setup" has no
  well-defined meaning without a shared mutable ref-cell + re-registration on
  every boundary re-render, i.e. a runtime redesign.
- arbor's boundary factories are **owner-agnostic by construction**. The existing
  ownerless-factory helpers already concede this: `createLinkBoundary` wraps its
  own `onMount` in `try { … } catch {}` precisely because there is no owner
  inside a looped/gated factory (see the inline comment in
  `emit.rs`, `createLinkBoundary`). Making `$ref` work at owner scope would mean
  changing that runtime contract, which is out of scope for a compiler-side fix
  and far riskier than a diagnostic.

A diagnostic converts a silent blank render into an obvious build error that
names the supported pattern (the issue's own suggestion, and its documented
workaround: move `$ref` to an always-present ancestor). It is the safe fix.

### Implementation

- `packages/compiler/src/lib.rs`
  - New validator `validate_ref_gating(nodes)`, wired into
    `compile_full_with_options` right after `validate_component_tags` — the
    pipeline's error boundary, before any codegen. It walks the template AST and
    rejects an element (Element **or** `<$macro>` MacroElement) that carries a
    `$ref` directive together with a `$if` or `$each` directive.
  - New diagnostic code **C562** (next free after C561; existing codes:
    C500/C501/C550–C554/C560/C561). Rich shape mirroring C560/C561:
    `message` (names the `'no owner'` failure + the silent blank),
    `hint` (why the boundary factory is ownerless), `fix` (move `$ref` to an
    always-present ancestor), plus machine-readable `from`/`to`.

Scope note: only the **directive co-occurrence on one element** is rejected —
exactly the issue's repro. A `$ref` element nested inside a `{#if}`/`{#each}`
**block** has the same underlying runtime shape, but is out of scope here to keep
the fix surgical and avoid touching valid fixtures; the same ancestor-`$ref`
workaround applies. Ungated `$ref` is untouched.

### Bidirectional tests (`packages/compiler/tests/b3_variant_b.rs`)

- `c562_ref_with_if_on_same_element_rejects` — `<article $ref={proseEl} $if={hasData}>`
  now rejects with C562 (asserts code + hint + fix + the `'no owner'` message).
- `c562_ref_with_each_on_same_element_rejects` — `<li $ref={el} $each=…>` rejects
  with C562.
- `c562_does_not_overreach_ungated_ref_still_lowers` — an UNGATED `$ref` still
  lowers to its setup-level `onMount` with the `stageEl = _el` setter, unchanged.

---

## #432 — `$ref` strips the `let`'s type annotation (already resolved on main; guarded)

### Finding

The mechanism the issue describes — the `$ref` rewrite dropping the `let`'s type
annotation, so tsc infers constant-`null` and the `stageEl && stageEl.foo` guard
collapses to `never` — **does not reproduce on current `main`.**

The tsc surface is the sidecar (`emit().sidecar_ts` / `compileSidecar`, consumed
by `@aihu/tsc`'s Volar language plugin). Since the line-preserving sidecar work
(#390), the sidecar **inlines the `@state` body verbatim**, so a typed
`let stageEl: HTMLElement | null = null` reaches tsc WITH its annotation intact.
Verified across the plain-`let` form, the bare class-property form
(`transform_bare_declaration` prepends `let` while preserving the annotation),
and the ref-only form — the annotation survives in every case, in both the
runtime JS and the sidecar. There is no code path anywhere in the compiler that
rewrites a declaration on the basis of it being a `$ref` target (confirmed by
exhaustive search). The issue predates the verbatim-inline sidecar; that change
resolved it.

### Action: regression guard, no code change

No product-code change is warranted (inventing one would be cargo-culting).
Instead, two bidirectional regression tests lock the behavior so it cannot
silently regress:

- `ref_bound_let_keeps_type_annotation_in_sidecar` — the `$ref`-bound
  `let stageEl: HTMLElement | null = null` keeps its `: HTMLElement | null` in the
  sidecar (so tsc types it `HTMLElement | null`, not constant-`null`).
- `ref_bound_unannotated_let_gets_no_invented_annotation` — a `$ref` on an
  UNannotated `let el = null` is emitted unchanged; the compiler does not invent
  an annotation.

---

## Files changed

- `packages/compiler/src/lib.rs` — `validate_ref_gating` + C562 wiring (#433).
- `packages/compiler/tests/b3_variant_b.rs` — 5 new tests (3 for #433, 2 for #432).

## Acceptance (measured)

- `cargo build --bin aihu-compile` — clean (the one warning, `stripped_export_line`
  at `emit.rs:1773`, is pre-existing and untouched).
- `cargo test -p aihu-compiler` — **842 passed, 0 failed** (includes the 5 new
  tests).
- `bun scripts/check-emit-parses.ts --expect-parse 0 --expect-compile 11` —
  **0 parse / 11 compile, matching the committed baseline (UNCHANGED).** No
  fixture is affected by the `$ref` change.
- Invariants: `check:hydration-adoption` — **0 findings.** The other four
  (`derived`/`attributed`/`governed`/`dual-audience`) crash on a **missing
  `typescript` module** in this fresh worktree (`ts.ScriptTarget.ES2022` is
  undefined) — an environment gap that reproduces identically on clean `main`,
  not a finding. They scan TS/docs source, which this Rust-only compiler change
  does not touch, so it cannot introduce findings. (Not run to green here because
  fixing it needs `bun install`, which would touch `bun.lock` — barred by the
  task.)

## Not done (per instructions)

No platform-binary bump, no `bun.lock`, no README/size regen, no version changes.
This is a compiler PR and will need a binary bump — that is the Team Lead's job at
landing.
