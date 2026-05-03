# Retro — v0.5 Macro Elements

**Date:** 2026-05-03
**Session type:** Mode 2 (Build/refactor) — single Builder stream
**PR:** #38 (`feat/v0.5-macro-elements-compiler` → `main` at `b29ce55`)

---

## What shipped

v0.5 added the five `<$element>` compiler-lowered boundary elements to the Rust compiler.

| Sub-item | Description |
|----------|-------------|
| v0.5.1 | `<$slot>` + `<slot>` alias → `createSlotBoundary(opts, () => children)` |
| v0.5.2 | `<$suspense>` → `createSuspenseBoundary(source, fallback, loaded)` |
| v0.5.3 | `<$shield>` → `createShieldBoundary(() => main, (shield) => fallback)` |
| v0.5.4 | `<$guard>` → `createGuardBoundary(check, () => main, (guard) => fallback)` |
| v0.5.5 | `<$warp>` → `createWarpBoundary(target, () => children)` (**stub** — NOTE(v0.5-stub) comment; arbor.mount arbitrary-host API unconfirmed) |
| v0.5.6 | C400: slot/fallback mutual-exclusion compile-error |
| v0.5.7 | C401: inline-JSX-in-attributes compile-error |
| v0.5.8 | Conformance fixtures at `bench/compiler-conformance/macro-elements/` (5 pairs) |

**Rust tests:** 163 → 186 (+23)
**TS tests:** 483 → 483 (unchanged — Rust-only milestone)

---

## Surface condition fired: `<$warp>` arbor stub

`arbor.mount`'s ability to accept an arbitrary host node (e.g. a `querySelector` result) is unconfirmed. The `createWarpBoundary` emitter is a full boundary shell but includes `NOTE(v0.5-stub)` comments. No new arbor exports were added — correct per director note. Resolution: when v0.6 or v0.8 requires the warp primitive to actually work, extend `arbor.mount` to accept an `HTMLElement` target and remove the stub comment.

---

## Final gate walk (verified by Team Lead)

**Rust tests:** 163 → 186 (+23, 1 pre-existing ignored)
**TS tests:** 483 → 483 (Rust-only milestone)
**Size:** unchanged (Rust compiler changes only)
**Main HEAD at close:** `b29ce55`

---

## v0.6 is next

v0.6 = `@route` block + build-target framework + file-based layouts. Most complex milestone in the roadmap (~3-6 days Rust+TS). Will require an Architect pass before Builder dispatch.
