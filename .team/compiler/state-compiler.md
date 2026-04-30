# State — Compiler Track

**Track:** `compiler`
**Last updated:** 2026-04-30
**HEAD at session start:** `8b5ba32` (docs(plans): Round N+2 test-quality track + compiler track plans)
**HEAD after session 1:** `3919bdb` on `feat/compiler-c0` — "feat(compiler): Phase C-0 — scaffold + SFC block splitter"
**HEAD after session 2:** `2a4ad9d` on `feat/compiler-c1` — "feat(compiler): Phase C-1 — TemplateNode + recursive descent template parser"
**Active branch:** `feat/compiler-c1` (Phase C-1 complete; Phase C-2 next)
**Mode:** 2 (Build/refactor)

---

## Current phase

**Phase C-2 — Signal Identity Resolver** — NOT STARTED (session 3)

Phases: C-0 (**COMPLETE**) → C-1 (**COMPLETE**) → **C-2** → C-3 → C-4

---

## Round summary

| Round | Phase | Builder | Verifier | Director | Status |
|-------|-------|---------|----------|----------|--------|
| 1     | C-0   | PASS    | PASS     | PASS     | COMPLETE |
| 2     | C-1   | PASS    | PASS     | PASS     | COMPLETE |
| 3     | C-2   | pending | pending  | pending  | next |

---

## Open questions

All original OQs (C1–C8) resolved in Round 1. All Round 2 carry-forward items resolved by Director in session 2.

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
| OQ-C12: ScriptMeta wiring timing | Wire `pub meta: ScriptMeta` into `ScribeSource` in C-1 (not C-2/C-3) | CLOSED |
| OQ-C13: `_setMount` constraint | App-level bootstrap call; not a compiler concern; documented in architecture spec C-3 section | CLOSED |
| OQ-C14: `TemplateNode` lifetime | Use owned `String` fields; no `&'a str` lifetime slices on `TemplateNode` or `Attr` | CLOSED |

**Open for Session 3:**
- When does the `sfc.rs` parser get the full `<template>` block content wired into `parse_template()`? `ScribeSource.template` is a `&'a str` slice; `parse_template()` exists but is not called from `sfc.rs::parse()`. Decide in C-2 Director pass: does C-2 signal resolution require the template AST, or does C-2 work from script text only (wiring deferred to C-3)?
- Signal resolver scope: does C-2 Architect need to specify the exact `SignalMap` Rust type (e.g., `HashMap<String, String>`) and visibility per `architecture.md` §8 C2-1 through C2-6? The criteria specify behaviour but not the concrete type. Confirm in C-2 Director pass.

---

## Key artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Plan | `.team/compiler/plan-compiler.md` | COMPLETE |
| Scout report | `.team/compiler/scout-report.md` | COMPLETE |
| Architecture spec | `.team/compiler/architecture.md` | FINAL (C-0 + C-1 spec; C-1 algorithm in Sections 11–14; C-2 criteria in Section 8) |
| Director notes round 1 | `.team/compiler/director-notes/round-001-2026-04-30.md` | COMPLETE |
| Director notes round 2 | `.team/compiler/director-notes/round-002-2026-04-30.md` | COMPLETE |
| Build manifest C-0 | `.team/compiler/build-manifest-c0.md` | COMPLETE — 11/11 PASS |
| Verification report C-0 | `.team/compiler/verification-report-c0.md` | COMPLETE — PASS |
| Verification report C-1 | `.team/compiler/verification-report-c1.md` | COMPLETE — PASS (11/11) |
| Retro session 1 | `.team/compiler/retro-session-001.md` | COMPLETE |
| Retro session 2 | `.team/compiler/retro-session-002.md` | COMPLETE |
| Topic summary | `.team/compiler/summaries/compiler-summary.md` | NOT STARTED |

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
**New tests:** 10/10 passing (`tests/template_parse.rs`) | **Re-accepted snapshots:** 5 (sfc_split) | **New snapshots:** 10
**Clippy:** clean | **Fmt:** clean | **Criteria:** 11/11 PASS

Files delivered:
- `packages/compiler/src/types.rs` — amended: `TemplateNode`, `Attr` enums; `ScribeSource` adds `pub meta: ScriptMeta`
- `packages/compiler/src/lib.rs` — amended: re-exports `Attr`, `TemplateNode`
- `packages/compiler/src/parser/mod.rs` — amended: alphabetical `pub mod directives; pub mod sfc; pub mod template;`
- `packages/compiler/src/parser/sfc.rs` — amended: wires `extract_script_meta` result into `ScribeSource` return
- `packages/compiler/src/parser/template.rs` — new: `parse_template()` recursive descent parser
- `packages/compiler/src/parser/directives.rs` — new: directive discrimination + identifier validation
- `packages/compiler/tests/template_parse.rs` — new: 10 snapshot tests
- `packages/compiler/tests/snapshots/` — 5 re-accepted + 10 new `.snap` files

---

## Phase C-2 scope (NEXT — session 3)

**Deliverable:** `SignalMap` type in `src/codegen/signals.rs` — extracts signal read/write name pairs from `<script setup>` content. 6 snapshot tests in `tests/signal_resolve.rs`.

**Acceptance criteria (from `architecture.md` Section 8 — Phase C-2):**
- C2-1: `SignalMap` in `src/codegen/signals.rs` maps read-name to write-name
- C2-2: `const [foo, setFoo] = signal(...)` → `SignalMap { "foo" => "setFoo" }`
- C2-3: Non-signal var not in `SignalMap`
- C2-4: Multiple signals all captured
- C2-5: 6 snapshot tests passing
- C2-6: Clippy + fmt clean

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

Source: `architecture.md` Section 7. This is the Phase C-3 acceptance snapshot oracle.

---

## Do-not-break list

- All packages except `packages/compiler/` are read-only for the compiler track
- No changes to `packages/arbor/`, `packages/runtime/`, `packages/signals/`, `packages/server/`, `packages/agent-readiness/`
- Round N+2 (`test-quality`) track owns `packages/*/tests/compliance/`, `demo/`, `scripts/lighthouse.ts`
- `.prototools` — only `rust = "1.87.0"` line is compiler-track property; do not modify `bun` or `node` lines
- `rust-toolchain.toml` — must stay in sync with `.prototools` at `1.87.0`

---

## Next actions (Team Lead — Session 3)

1. Merge decision: merge `feat/compiler-c1` to `main`, or cut `feat/compiler-c2` directly from it
2. Session 3 Topic Director → resolve `parse_template()` wiring timing (C-2 or C-3) + confirm `SignalMap` concrete type specification requirement
3. Session 3 Architect → amend `architecture.md` with C-2 `SignalMap` type definition and `src/codegen/` module structure
4. Session 3 Builder → implements Phase C-2 on `feat/compiler-c2`
5. Approve promotion candidates from session 2 to user-layer memory: `TemplateNode` owned-String rationale, hand-rolled parser decision, `_setMount` constraint ruling
