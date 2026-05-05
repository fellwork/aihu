# Retro — v0.4 Macro Attributes

**Date:** 2026-05-03
**Session type:** Mode 2 (Build/refactor) — two parallel Builder streams
**PRs:** #36 (v0.4a runtime lifecycle) + #37 (v0.4b macro attrs compiler)

---

## What shipped

v0.4 landed all `$attr` template-attribute syntax and per-block macro lowerings across two parallel streams.

### Stream A — `@aihu/runtime` lifecycle helpers (PR #36)

| Sub-item | Description |
|----------|-------------|
| v0.4.9 | `onMount(fn)` + `onCleanup(fn)` exported from `@aihu/runtime` |
| Compressor | Pre-authorized Compressor pass (Polish Note 5); 213 B raw recovered; runtime within 1170 B gz |

**Tests:** +7 lifecycle tests (476 → 483 TS)
**Size:** runtime +7 B headroom (1163 B gz / 1170 B limit) — absorbs lifecycle helpers within budget

### Stream B — Rust compiler macro lowerings (PR #37)

| Sub-item | Description |
|----------|-------------|
| v0.4.1–v0.4.4 | `MacroValue` enum + `Attr::Macro` variant; quoted/curly/boolean attr parsing; C300 bare-value error; DEPRECATED on `@event`/`:attr` |
| v0.4.5 | Template macro lowerings: `$if`, `$show`, `$each+$key`, `$bind:*`, `$on:*`, `$html`, `$raw`, `$once`, `$memo` |
| v0.4.6 | `src/parser/state_macros.rs`: `$prop`, `$computed`, `$resource`, `$effect`, `$effect.on`, `$watch`, `$action`, `$lifecycle.mount/dispose` |
| v0.4.7 | `src/parser/style_macros.rs`: `$reactive`, `$media`, `$when` (`$global` already in v0.3) |
| v0.4.8 | `src/parser/agent_macros.rs`: `$expose`, `$expose.write`, `$scope`, `$rate-limit`, `$describe` + manifest JSON extension |
| v0.4.10 | Conformance fixtures: 5 template-attr pairs + 3 macro pairs |

**Rust tests:** 100 → 163 (+63)
**New source files:** `state_macros.rs` (467 lines), `style_macros.rs` (212 lines), `agent_macros.rs` (192 lines), `tests/macro_attrs.rs` (240 lines)

**Deferred (explicit per framework plan):** `$action` form-attr build-target split → v0.5

---

## Final gate walk (verified by Team Lead)

**Rust tests:** 100 → 163 (+63, 1 pre-existing ignored)
**TS tests:** 476 → 483 (+7, 59 test files)
**Main HEAD at close:** `d1bd820`

**Package sizes (`bun run size`):** all 8 pass; unchanged from v0.2 baseline on browser packages

---

## Key findings

1. **Layer pattern confirmed again** (Learning #38): Stream B was emit-phase work layered on the solid parse-phase from v0.3. Builder completed all 10 sub-items in 3 commits. The parse→analysis→emit layer separation keeps each milestone well-scoped.

2. **Parallel stream dispatch works cleanly** when the streams are file-disjoint (Rust compiler vs TypeScript runtime). No conflict on merge; both PRs merged clean.

3. **Compressor pass scale**: 213 B raw saved from the runtime (down from pre-pass 1390 B gz post-lifecycle to 1163 B gz = exactly within budget). Key sources: verbose JSDoc blocks, shortened error messages, dead code paths.

---

## v0.5 is next

v0.5 = macro elements — compiler-lowered `<$slot>`, `<$suspense>`, `<$shield>`, `<$guard>`, `<$warp>` using existing arbor primitives. All five are emit-phase helpers; no new arbor exports. Framework cost ~5-15 B per boundary (Learning #36).
