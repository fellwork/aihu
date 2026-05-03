# State — Compiler Track

**Track:** `compiler`
**Last updated:** 2026-05-03

> **Session 7 (post-v0.9 cleanup) — COMPLETE** at commit `daac021` (2026-05-03).
> Committed untracked `route.rs` parser + 7 integration tests; deleted 6 orphaned
> bench-conformance files; restored `docs/site/`. Rust tests: **221 passing** (was 214).
> TS tests: **570 passing** (unchanged). Compiler track remains CLOSED.

**HEAD at session start:** `8b5ba32` (docs(plans): Round N+2 test-quality track + compiler track plans)
**HEAD after session 1:** `3919bdb` on `feat/compiler-c0` — "feat(compiler): Phase C-0 — scaffold + SFC block splitter"
**HEAD after session 2:** `2a4ad9d` on `feat/compiler-c1` — "feat(compiler): Phase C-1 — TemplateNode + recursive descent template parser"
**HEAD after session 3:** `653252f` on `feat/compiler-c2` — "docs(team): Round 003 director note — C-2 adjudication"
**HEAD after session 4:** `d7bd475` on `feat/compiler-c3` — "fix(compiler): re-accept multiple_signals snapshot (HashMap ordering)"
**HEAD after session 5:** `a0af4d4` on `feat/compiler-c4` — "fix(compiler): C4-6 integration — .exe path, enforce:pre, bun integrate.ts"
**HEAD after session 6:** `808f1c0` on `main` — PR #14 merged: "chore(compiler): session-6 cleanup — BTreeMap + Vite limitation + topic summary"
**HEAD after session 7:** `daac021` on `main` — "fix(compiler): commit untracked route parser + tests; delete orphaned bench files"
**Active branch:** `main`
**Mode:** CLOSED

---

## Current phase

**Session 6 — Merge + cleanup** — **COMPLETE** (PR #14, `808f1c0`, 2026-05-01)

Phases: C-0 (**COMPLETE**) → C-1 (**COMPLETE**) → C-2 (**COMPLETE**) → C-3 (**COMPLETE**) → C-4 (**COMPLETE**) → Session-6 cleanup (**COMPLETE**)

**Compiler track FULLY CLOSED.** All sessions complete. No further compiler sessions planned. Next compiler session scope (if any): Phase C-5 (watch mode) or consumer integration test — pending Director decision.

---

## Round summary

| Round | Phase | Builder | Verifier | Director | Status |
|-------|-------|---------|----------|----------|--------|
| 1     | C-0   | PASS    | PASS     | PASS     | COMPLETE |
| 2     | C-1   | PASS    | PASS     | PASS     | COMPLETE |
| 3     | C-2   | PASS    | PASS (10/10) | PASS | COMPLETE |
| 4     | C-3   | PASS    | PASS (11/11+1 SKIP) | PASS | COMPLETE |
| 5     | C-4   | PASS    | PASS (10/10) | PASS | COMPLETE |
| 6     | Cleanup | PASS (PR #14) | PASS (11/11 ACs) | PASS | COMPLETE |

---

## Open questions

All original OQs (C1–C8) resolved in Round 1. All carry-forward items resolved in sessions 2-4.

| OQ | Resolution | Status |
|----|-----------|--------|
| OQ-C1: Template syntax | Option A — HTML-first, scribe directives as thin transform layer | CLOSED |
| OQ-C2: Interpolation | `{{ identifier }}` only in v0; expressions are a compile error | CLOSED |
| OQ-C3: Signal identity | Naming convention: `[foo, setFoo] = signal(...)` | CLOSED |
| OQ-C4: Event binding | `@click` → `{ onclick: fn }` per AttrMap `on`-prefix rule | CLOSED |
| OQ-C5: Conditionals/lists | Compile error with v1 roadmap message | CLOSED |
| OQ-C6: Tag name | Filename stem; optional `name` attribute on `<script setup>` | CLOSED |
| OQ-C7: Scoped styles | Warn to stderr, ignore in output | CLOSED |
| OQ-C8: Source maps | Deferred to Phase C-4 | CLOSED (deferred) |
| OQ-C9: Compiler emit pattern | Option A — `defineElement('tag', defineComponent((_ctx) => { ... }))` | CLOSED |
| OQ-C10: `leaf()` Signal type | `as unknown as Signal<string>` cast in emitted code | CLOSED |
| OQ-C11: Rust toolchain version | `rust = "1.87.0"` in `.prototools` + `rust-toolchain.toml` at root | CLOSED |
| OQ-C12: ScriptMeta wiring timing | Wire `pub meta: ScriptMeta` into `ScribeSource` in C-1 | CLOSED |
| OQ-C13: `_setMount` constraint | App-level bootstrap call; not a compiler concern | CLOSED |
| OQ-C14: `TemplateNode` lifetime | Use owned `String` fields | CLOSED |
| OQ-C15: `parse_template()` wiring timing | Wire in C-2 via `compile_full()` | CLOSED |
| OQ-C16: `SignalMap` concrete type | `HashMap<String, String>` newtype | CLOSED |

All OQs closed. No new open questions.

**C3-2 open gate:** CLOSED. `bun tsc --noEmit` check ran at session 5 start — caught real bug (`"null"` → `"undefined"` in `emit_attrs()`). Fixed in commit `ffcbc3b`. 8 snapshots re-accepted. Gate resolved.

---

## Key artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Plan | `.team/compiler/plan-compiler.md` | COMPLETE |
| Scout report | `.team/compiler/scout-report.md` | COMPLETE |
| Architecture spec | `.team/compiler/architecture.md` | FINAL (Sections 1-17; C-4 CLI + Vite spec in Section 17) |
| Director notes round 1 | `.team/compiler/director-notes/round-001-2026-04-30.md` | COMPLETE |
| Director notes round 2 | `.team/compiler/director-notes/round-002-2026-04-30.md` | COMPLETE |
| Director notes round 3 | `.team/compiler/director-notes/round-003-2026-04-30.md` | COMPLETE |
| Director notes round 4 | `.team/compiler/director-notes/round-004-2026-04-30.md` | COMPLETE |
| Director notes round 5 | `.team/compiler/director-notes/round-005-2026-04-30.md` | COMPLETE |
| Build manifest C-0 | `.team/compiler/build-manifest-c0.md` | COMPLETE — 11/11 PASS |
| Verification report C-0 | `.team/compiler/verification-report-c0.md` | COMPLETE — PASS |
| Verification report C-1 | `.team/compiler/verification-report-c1.md` | COMPLETE — PASS (11/11) |
| Verification report C-2 | `.team/compiler/verification-report-c2.md` | COMPLETE — PASS (10/10) |
| Verification report C-3 | `.team/compiler/verification-report-c3.md` | COMPLETE — PASS (11/11+1 SKIP) |
| Verification report C-4 | `.team/compiler/verification-report-c4.md` | COMPLETE — PASS (10/10) |
| Retro session 1 | `.team/compiler/retro-session-001.md` | COMPLETE |
| Retro session 2 | `.team/compiler/retro-session-002.md` | COMPLETE |
| Retro session 3 | `.team/compiler/retro-session-003.md` | COMPLETE |
| Retro session 4 | `.team/compiler/retro-session-004.md` | COMPLETE |
| Retro session 5 | `.team/compiler/retro-session-005.md` | COMPLETE |
| Build manifest C-4 | (none — Team Lead acted as Builder directly; no separate manifest written) | N/A |
| Topic summary | `.team/compiler/summaries/compiler-summary.md` | COMPLETE (session 6) |
| Build manifest session 6 | `.team/compiler/build-manifest-session-6.md` | COMPLETE |
| Verification report session 6 | `.team/compiler/verification-report-session-6.md` | COMPLETE — PASS (11/11 ACs) |

---

## Phase C-0 deliverables (COMPLETE)

**Branch:** `feat/compiler-c0` | **Commit:** `3919bdb`
**Tests:** 6/6 passing | **Clippy:** clean | **Fmt:** clean | **Criteria:** 11/11 PASS

Files delivered:
- `.prototools` — added `rust = "1.87.0"`
- `rust-toolchain.toml` — new
- `packages/compiler/Cargo.toml` — `name = "scribe-compiler"`, `edition = "2021"`
- `packages/compiler/Cargo.lock` — new
- `packages/compiler/src/lib.rs` — public `compile()` API
- `packages/compiler/src/types.rs` — `ScribeSource`, `ScriptMeta`, `CompileError`
- `packages/compiler/src/parser/mod.rs` — `pub mod sfc`
- `packages/compiler/src/parser/sfc.rs` — SFC block splitter + `extract_script_meta`
- `packages/compiler/tests/sfc_split.rs` — 5 snapshot tests + `compile_empty_source`
- `packages/compiler/tests/snapshots/` — 5 committed `.snap` files

---

## Phase C-1 deliverables (COMPLETE)

**Branch:** `feat/compiler-c1` | **Commit:** `2a4ad9d`
**New tests:** 10/10 passing | **Re-accepted snapshots:** 5 | **New snapshots:** 10
**Clippy:** clean | **Fmt:** clean | **Criteria:** 11/11 PASS

Files delivered:
- `packages/compiler/src/types.rs` — amended: `TemplateNode`, `Attr` enums; `pub meta: ScriptMeta`
- `packages/compiler/src/lib.rs` — amended: re-exports `Attr`, `TemplateNode`
- `packages/compiler/src/parser/mod.rs` — amended: alphabetical modules
- `packages/compiler/src/parser/sfc.rs` — amended: wires `extract_script_meta`
- `packages/compiler/src/parser/template.rs` — new: `parse_template()`
- `packages/compiler/src/parser/directives.rs` — new: directive helpers
- `packages/compiler/tests/template_parse.rs` — new: 10 snapshot tests
- `packages/compiler/tests/snapshots/` — 5 re-accepted + 10 new `.snap` files

---

## Phase C-2 deliverables (COMPLETE)

**Branch:** `feat/compiler-c2` | **Commit:** `32ba955`
**New tests:** 6/6 passing | **Total tests:** 22 | **New snapshots:** 6
**Clippy:** clean | **Fmt:** clean | **Criteria:** 10/10 PASS

Files delivered:
- `packages/compiler/src/types.rs` — `CompileUnit<'a>` added
- `packages/compiler/src/lib.rs` — `pub mod codegen`, `compile_full()`, updated re-exports
- `packages/compiler/src/codegen/mod.rs` — new
- `packages/compiler/src/codegen/signals.rs` — new: `SignalMap` + `resolve_signals()`
- `packages/compiler/tests/signal_resolve.rs` — new: 6 named tests
- `packages/compiler/tests/snapshots/` — 6 new `.snap` files

---

## Phase C-3 deliverables (COMPLETE)

**Branch:** `feat/compiler-c3` | **Commit:** `d7bd475`
**New tests:** 10/10 passing (`tests/codegen.rs`) | **Total tests:** 32
**New snapshots:** 10 | **Clippy:** clean | **Fmt:** clean | **Criteria:** 11/11 PASS + 1 SKIP (C3-2 bun tsc)

Files delivered:
- `packages/compiler/src/codegen/emit.rs` — new: `emit()` + `build_imports()` + `extract_script_body()` + `emit_nodes()` + `emit_node()` + `emit_attrs()`
- `packages/compiler/src/codegen/mod.rs` — amended: `pub mod emit`, re-exports `emit`
- `packages/compiler/src/lib.rs` — amended: `emit` added to crate re-exports
- `packages/compiler/tests/codegen.rs` — new: 10 named snapshot tests
- `packages/compiler/tests/snapshots/` — 10 new `codegen__*.snap` files

**counter_full snapshot** matches Section 7 oracle exactly. TypeScript codegen pipeline: `ScribeSource` → `CompileUnit` → `emit()` → `.ts` output.

---

## Phase C-4 deliverables (COMPLETE)

**Branch:** `feat/compiler-c4` | **Final commit:** `a0af4d4`
**Tests:** 32/32 passing (1 ignored) | **Clippy:** clean | **Fmt:** clean | **Criteria:** 10/10 PASS

Files created or amended:

| File | Commit | Notes |
|------|--------|-------|
| `packages/compiler/Cargo.toml` | `f82eb56` | Added `[[bin]]` entry for `scribe-compile` |
| `packages/compiler/src/bin/main.rs` | `f82eb56` | CLI binary: file + stdin modes, `--out`, `--tag`, `--stdin` flags, exit 1 on error |
| `packages/compiler/src/codegen/emit.rs` | `ffcbc3b` | Fix: `"null"` → `"undefined"` for empty attrs in `emit_attrs()` |
| `packages/compiler/tests/snapshots/` (8 files) | `ffcbc3b` | Re-accepted after null→undefined fix |
| `packages/compiler/js/index.ts` | `f82eb56`, `a0af4d4` | `transform()` + `scribeCompilerPlugin()` exports; `.exe` extension; `enforce: 'pre'` |
| `packages/compiler/package.json` | `f82eb56` | `@scribe/compiler` npm package manifest |
| `packages/compiler/moon.yml` | `f82eb56` | Moon task definitions for build/typecheck |
| `packages/compiler/rolldown.config.ts` | `f82eb56` | Rolldown RC-17 build config |
| `packages/compiler/tsconfig.json` | `f82eb56` | TypeScript project config |
| `packages/compiler/fixtures/vite-counter/counter.scribe` | `f82eb56` | Integration fixture |
| `packages/compiler/fixtures/vite-counter/index.html` | `f82eb56` | Integration fixture |
| `packages/compiler/fixtures/vite-counter/main.ts` | `f82eb56` | Integration fixture |
| `packages/compiler/fixtures/vite-counter/vite.config.ts` | `f82eb56`, `a0af4d4` | Integration fixture; updated to import from `@scribe/compiler` dist |
| `packages/compiler/fixtures/vite-counter/integrate.ts` | `a0af4d4` | Bun script: calls `transform()` directly, asserts `defineElement(` + `map === null` |
| `packages/compiler/tests/c4_integration.rs` | `f82eb56`, `a0af4d4` | `#[ignore]` test: `c4_transform_produces_typescript`; uses `bun run integrate.ts` |
| `.team/compiler/architecture.md` | `012e506` | Section 17 — Phase C-4 CLI + Vite spec |
| `.team/compiler/director-notes/round-005-2026-04-30.md` | `ffcbc3b` | Director notes for C-4 session |

**`counter_full` snapshot** and all 8 codegen snapshots corrected: `branch(null,` → `branch(undefined,`. TypeScript codegen pipeline fully correct.

---

## Phase C-4 scope (COMPLETE — session 5)

**Deliverable:** CLI binary (`scribe-compile`) + npm package (`@scribe/compiler`) with Vite transform hook.

**Acceptance criteria (from architecture.md Section 8 C4-1 through C4-7):**
- C4-1: `scribe-compile counter.scribe` → TypeScript to stdout
- C4-2: `scribe-compile counter.scribe --out dist/` → `dist/counter.ts`
- C4-3: Exit code 1 on error with `file:line: message` on stderr
- C4-4: `@scribe/compiler` npm package exports `transform(source, id): { code, map }`
- C4-5: Vite transform hook registered for `*.scribe`
- C4-6: `bun vite build` with `.scribe` component → valid `dist/`
- C4-7: Source map maps back to `.scribe` source lines

**Tag name derivation:** filename stem from `id` parameter in Vite transform. `compile_full()` + `emit()` pipeline is already complete.

---

## Canonical emit form (locked — do not change without spec amendment)

```typescript
import { branch, leaf } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('counter', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)
  const increment = () => setCount(c => c + 1)

  return branch('div', { class: 'counter' }, [
    branch('span', null, [leaf([count, setCount] as unknown as Signal<string>)]),
    branch('button', { onclick: increment }, [leaf('+')])
  ])
}))
```

---

## Do-not-break list

- All packages except `packages/compiler/` are read-only for the compiler track
- No changes to `packages/arbor/`, `packages/runtime/`, `packages/signals/`, `packages/server/`, `packages/agent-readiness/`
- Round N+2 (`test-quality`) track owns `packages/*/tests/compliance/`, `demo/`, `scripts/lighthouse.ts`
- `.prototools` — only `rust = "1.87.0"` line is compiler-track property
- `rust-toolchain.toml` — must stay in sync at `1.87.0`

---

## Session 6 — COMPLETE (PR #14, `808f1c0`, 2026-05-01)

All session-6 next actions resolved:

1. **Merged to main** — PR #14 at `808f1c0`.
2. **BTreeMap in `signals.rs`** — DONE. `HashMap` → `BTreeMap`. Deterministic snapshot order. All 32 Rust tests pass, affected snapshots re-accepted.
3. **Vite limitation documented** — DONE. `bun vite build` with `scribeCompilerPlugin()` does not work under Bun+Rollup4 ESM interop. Clear note added to `packages/compiler/js/index.ts` JSDoc. `transform()` function works correctly via `bun run integrate.ts`.
4. **Topic summary written** — DONE. `.team/compiler/summaries/compiler-summary.md` exists. Covers pipeline, architecture, key decisions, 5 known limitations.
5. 32 Rust tests green, 320 TS tests green.

## Known limitations (5)

See `.team/compiler/summaries/compiler-summary.md` Section 4 for full list. Summary:
1. Source maps deferred (OQ-C8)
2. Conditionals and list rendering compile error (v1 roadmap message)
3. `bun vite build` with Vite plugin hook broken under Bun+Rollup4 ESM interop
4. Signal naming convention is enforced by convention, not compiler validation
5. No type-checking of `.scribe` template expressions

## Next compiler session (if any)

Pending Director decision. Candidates:
- **Phase C-5 (watch mode)** — incremental rebuild on file change
- **Consumer integration test** — end-to-end `.scribe` → browser rendering test

Neither gates Round 005. The compiler track is closed for current v0 scope.
