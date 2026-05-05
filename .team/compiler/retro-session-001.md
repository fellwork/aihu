# Retrospective — Compiler Track Session 1
**Date:** 2026-04-30
**Session:** 1 (Round 1)
**Phases completed:** C-0 (scaffold + SFC block splitter)
**Result:** PASS

---

## What was attempted

Session 1 dispatched five roles in sequence against Phase C-0:

**Scout** — Read-only audit of `packages/runtime/`, `packages/arbor/`, and `packages/signals/` to extract exact TypeScript signatures for all primitives the compiler must call, and to confirm the state of the Rust toolchain (no prior `Cargo.toml`, no `.prototools` Rust pin, no `packages/compiler/` directory).

**Topic Director** — Assessed Scout findings, resolved three new open questions (OQ-C9 emit pattern, OQ-C10 `leaf()` type cast, OQ-C11 Rust toolchain version), routed actionable findings to the Architect as verbatim interface constraints, and cleared the track to proceed without a user interrupt.

**Architect** — Produced the full `architecture.md` spec covering: Rust toolchain bootstrap, exact file layout and contents for Phase C-0, `AihuSource`/`ScriptMeta`/`CompileError` types with trait requirements, the public `compile()` API contract, the SFC block splitter algorithm, and 5 named snapshot test cases. Also locked the Phase C-3 TypeScript emit target (`counter.aihu` → `counter.ts`) as the acceptance snapshot.

**Builder** — Implemented Phase C-0 on branch `feat/compiler-c0`, commit `3919bdb`. Created 14 new files; modified `.prototools`. All 11 acceptance criteria satisfied (6/6 tests passing, clippy clean, fmt clean).

**Verifier** — Independently audited against the architecture spec. Confirmed 11/11 criteria with zero under-implementation and zero over-implementation findings. Named sample checks on three snapshot files confirmed correct tag stripping and whitespace trimming.

---

## What worked

**Plan clarity enabled zero-ambiguity spec authorship.** The plan's OQ section was structured precisely enough that the Director could close all pre-existing questions from plan recommendations alone, plus the three Scout-discovered questions, without any authorial escalation.

**Scout discovered the critical discrepancy before it could block build work.** The plan's conceptual emit output (`defineComponent({ tag, setup })`) does not match the actual API. The Scout surfaced this in the first read pass. Because Phase C-0 has no codegen, the discrepancy did not block build work — but it was resolved in spec before C-3 could encounter it.

**The Director routing layer kept noise out of the spec.** `leaf.element()`, `_setMount`, and source map crate were explicitly not routed to the Architect because they are irrelevant until C-3/C-4. The Architect spec was scoped exactly to what was needed.

**Architecture spec locked the Phase C-3 emit target early.** The `counter.aihu` → `counter.ts` snapshot in Section 7 is now the acceptance oracle for Phase C-3 before C-1 or C-2 have started — this prevents spec drift between sessions.

**Insta snapshot discipline.** Builder committed all 5 `.snap` files. Verifier confirmed content correctness on three named samples. Phase C-1 inherits a clean snapshot baseline.

---

## What needs attention in Session 2

1. **`_setMount` consumer constraint not yet in spec.** The Option A emit pattern reuses `defineComponent`, which uses `_setMount` injection — meaning consumer apps must call `_setMount(mount)` at app boot. This constraint should be added to the architecture spec's Phase C-3 section. Flag in the C-1 Director pass.

2. **`ScriptMeta.name` not yet threaded into `AihuSource`.** The helper exists in `sfc.rs` but the `name` field is not exposed. It needs to be wired before Phase C-3 codegen needs it. Decide in the C-1 Director pass (C-1 or C-2 wire-up).

3. **Template parser (C-1) needs algorithm detail.** The architecture spec defines types but not the recursive descent algorithm. C-1 Architect brief should include parser algorithm comparable to SFC splitter Section 5.

4. **Branch decision before Session 2.** Merge `feat/compiler-c0` to `main` first, or cut `feat/compiler-c1` directly from it?

---

## API discrepancy resolved

The plan's conceptual output (`defineComponent({ tag, setup })`) was wrong on three counts:
1. `defineComponent` takes a `Setup` function, not `{ tag, setup }`.
2. It returns `typeof HTMLElement` (a class), not a component descriptor.
3. The tag name is registered via `defineElement`, not `defineComponent`.

**Canonical v0 emit form, locked in `architecture.md` Section 7:**
```typescript
defineElement('counter', defineComponent((_ctx) => {
  // ...setup body verbatim from <script setup>...
  return branch('div', { ... }, [...])
}))
```

---

## Earned learnings (promotion assessment)

| Finding | Promote? | Reason |
|---|---|---|
| OQ-C9: Option A emit pattern | **YES** | Non-obvious; conflicts with `define-element.ts` JSDoc which suggests Option B. Director adjudicated on quality-risk grounds. Future sessions need this or will re-debate it. |
| OQ-C10: `as unknown as Signal<string>` cast | **YES** | Not in any source file. Exact cast form is non-obvious (TypeScript requires intermediate `unknown`). Load-bearing for Phase C-3 codegen. |
| `_ctx` parameter naming convention | **YES** | Suppresses `noUnusedParameters` lint in generated code. Exact string matters (`_ctx` not `ctx`, not `_`). Not in source. |
| `defineElement` vs `defineComponent` distinction | **NO** | Already documented verbatim in `define-component.ts` JSDoc ("Learning #12: humans use `defineComponent`, the compiler uses `defineElement`"). Derivable from source. |

---

## Next session priorities (Session 2 = Phase C-1)

**Primary deliverable:** `TemplateNode` and `Attr` enums + recursive descent HTML-ish parser in `src/parser/template.rs` and `src/parser/directives.rs`. 10 snapshot tests.

**Carry-forward:**
1. C-1 Architect brief: include recursive descent algorithm sketch.
2. Resolve `ScriptMeta.name` threading timing in C-1 Director pass.
3. Document `_setMount` consumer constraint in architecture spec C-3 section.
4. Team Lead: merge/branch decision for Session 2.
