# Director Note — v0.4 Session Start

**Date:** 2026-05-03
**Version target:** v0.4 — Macro Attributes
**State going in:** main at `2760d88` (v0.3 Historian close); Rust 100 tests, TS 476 tests, all 8 size rows green

---

## Substance direction

v0.4 lands the `$attr` template-attribute syntax and all per-block macro lowerings. This is the emit-phase milestone — the parse phase was completed in v0.3. Two work streams proceed in parallel:

**Stream A (TypeScript) — `feat/v0.4a-runtime-lifecycle`**
Add `onMount` + `onCleanup` lifecycle helper exports to `@aihu/runtime`. Pre-authorized Compressor pass (Polish Note 5) to recover bytes before adding new exports. Runtime is at +7 B headroom (1.14 kB / 1170 B); adding ~30-50 B requires ~23-43 B Compressor recovery minimum.

**Stream B (Rust) — `feat/v0.4b-macro-attributes-compiler`**
Full macro-attribute lowering in the Rust compiler: extend `types.rs` Attr enum, `directives.rs` parsing, `emit.rs` code generation. Covers v0.4.1-v0.4.8 + v0.4.10 (conformance fixtures).

---

## Scope constraints

- **v0.4 does NOT land `$action` (form attr)** — deferred to v0.5 (depends on build-target framework).
- **`$global` (@style) is already done** (v0.3.3) — v0.4.7 adds `$reactive`, `$media`, `$when` only.
- **No new TS browser packages** — runtime size limit stays at 1170 B after the Compressor pass.
- **Dep envelope unchanged** — zero non-`@aihu/*` runtime deps.
- **Vue-style `@event` / `:attr` become deprecated aliases** — emit DEPRECATED warning but still function; hard-removal at v1.0.8.

---

## Pre-authorizations

1. **Compressor pass on `@aihu/runtime`** (Polish Note 5): auto-proceeds without re-surfacing. Only fires a surface signal if recovery falls short of new feature cost AND a limit raise is needed (Learning #42 split formal raise).
2. **`$action` (form attr) deferral**: explicit in framework plan §v0.4 — not a miss.

---

## Surface conditions (fire if any hit)

1. Runtime Compressor pass recovery < new feature cost AND size-limit raise needed → surface to user
2. Any Rust compile error on `cargo test` → surface, do not merge
3. Any new TS dep outside `@aihu/*` → surface, reject
4. Size gate failure on any package → surface

---

## Key files

**Stream A:**
- `packages/runtime/src/define-component.ts` — 272 lines; lifecycle hooks live here
- `packages/runtime/src/index.ts` — 44 lines; add onMount/onCleanup exports
- `packages/runtime/tests/` — add lifecycle tests

**Stream B:**
- `packages/compiler/src/types.rs` — 101 lines; add macro Attr variants
- `packages/compiler/src/parser/directives.rs` — 99 lines; extend for `$attr` parsing + DEPRECATED on `@event`/`:attr`
- `packages/compiler/src/codegen/emit.rs` — 502 lines; add macro lowerings
- `bench/compiler-conformance/template-attrs/` — new fixture dir for v0.4.10
- `bench/compiler-conformance/macros/` — new fixture dir for v0.4.10

---

## Merge order

Both streams are file-disjoint. Either can merge first. Run `bun run size` after Stream A merges. Run `cargo test` + `bun run test` after both merge.
