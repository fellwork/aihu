# Retrospective — Compiler Track Session 2
**Date:** 2026-04-30
**Session:** 2 (Round 2)
**Phases completed:** C-1 (Template parser → TemplateAst)
**Result:** PASS

---

## What was attempted

Session 2 dispatched five roles in sequence against Phase C-1:

**Topic Director** — Read `sfc.rs` to confirm the `&'a str` lifetime design of `ScribeSource`, verified that `_meta` was already computed and discarded at `sfc.rs:128`, and resolved all three carry-forward items from Session 1 (ScriptMeta wiring timing, `_setMount` documentation, template parser algorithm depth). Routed four named findings to the Architect as verbatim constraints. Produced `director-notes/round-002-2026-04-30.md`.

**Architect** — Amended `architecture.md` with: the `ScribeSource` `pub meta: ScriptMeta` field addition and `sfc.rs` wiring instruction; the recursive descent template parser algorithm subsection (Section 12 — strategy, tokenization, text/interpolation splitting, identifier validation, attribute prefix discrimination, self-closing restriction, top-level text handling, exact error message strings); all 10 named snapshot test cases for `tests/template_parse.rs` (Section 14); the `_setMount` consumer constraint note appended after Phase C-3 acceptance criteria (Section 8); and the updated file structure (Section 13). Confirmed `TemplateNode` fields must use owned `String`, not `&'a str`. Sections 11–14 constitute the complete C-1 amendment.

**Builder** — Implemented Phase C-1 on branch `feat/compiler-c1`, commit `2a4ad9d`. Added `TemplateNode` and `Attr` enums to `types.rs`; added `pub meta: ScriptMeta` to `ScribeSource<'a>`; wired `extract_script_meta` result into `sfc.rs::parse()` return; created `parser/directives.rs` (directive discrimination, identifier validation, error message helpers); created `parser/template.rs` (recursive descent parser, hand-rolled `pos: usize` cursor); updated `parser/mod.rs` to alphabetical three-module declaration; updated `lib.rs` re-exports to include `Attr` and `TemplateNode`; re-accepted all 5 existing `sfc_split` snapshots with `meta` field; created `tests/template_parse.rs` with all 10 named snapshot tests; committed all 10 new `.snap` files. All 11 acceptance criteria satisfied (10/10 new tests + 5/5 re-accepted snapshots passing, clippy clean, fmt clean).

**Verifier** — Independently audited against `architecture.md` Sections 8, 11–14. Confirmed 11/11 criteria with zero under-implementation and zero over-implementation findings. Performed 6 named sample checks covering `meta` field presence in re-accepted snapshots, text/interpolation mixed output, event binding, v-if error verbatim match, and unknown directive substring match. Produced `verification-report-c1.md` with STATUS: PASS.

**Historian** — Read all session artifacts (state file, session 1 retro, verification report, Director note, architecture spec). Produced `retro-session-002.md` and updated `state-compiler.md`. Assessed 5 session findings for promotion to user-layer memory.

---

## What worked

**Director's lifetime analysis prevented a design defect before it reached the Builder.** The `&'a str` vs. owned `String` question is non-obvious: `ScribeSource<'a>` hands a lifetime-bearing slice to `parse_template`, but text nodes and interpolation identifiers are produced by stripping delimiters — they cannot point into contiguous source substrings. The Director surfaced this and mandated owned `String` in the Architect brief. The Builder implemented correctly on the first pass.

**`_meta` discard wired at zero marginal cost.** The computation was already in `sfc.rs::parse()` but thrown away. Surfacing it required changing only the return path of an existing function — no new algorithm. The Director flagged this explicitly, enabling the Builder to close the gap without any design work. Session 1 delayed this correctly; Session 2 resolved it at the right time.

**Spec amendment was scoped exactly to C-1 additions.** The Architect added four new sections (11–14) and a note in Section 8 without disturbing any C-0 content. The C-3 acceptance snapshot oracle, the do-not-break list, and the canonical emit form are all unchanged. No spec drift between sessions.

**Snapshot discipline extended cleanly to C-1.** Re-accepting 5 existing snapshots (adding the `meta` field) was handled as a Builder step, verified by the Verifier on named samples. 10 new snapshots committed. Phase C-2 inherits a 15-snapshot baseline with no uncommitted `.snap` files.

**Over-implementation boundary held.** The Verifier confirmed no `SignalMap`, no `codegen/` directory, and no TypeScript codegen appeared in the C-1 deliverable. The scope was bounded to exactly the two new modules and type additions specified.

---

## What needs attention in Session 3

1. **`parse_template()` not yet connected to `sfc.rs`.** The template parser exists and is tested in isolation via `tests/template_parse.rs`. The `sfc.rs::parse()` function returns `ScribeSource { template: Option<&str>, ... }` but does not call `parse_template()` on that slice. The Director note for Session 2 flagged this and deferred the wiring decision (C-2 or C-3). Session 3 must resolve it — if C-2 needs the AST for signal resolution it must be wired in C-2; if signal resolution works from the raw script text only, wiring can wait until C-3.

2. **Signal resolver data structure requires Architect specification.** Phase C-2 acceptance criteria (C2-1 through C2-6) specify `SignalMap` in `src/codegen/signals.rs` but do not specify the Rust type, key/value semantics, or visibility. The C-2 Architect must define the exact `SignalMap` type (likely `HashMap<String, String>` mapping read-name to write-name) and the parsing strategy for extracting signal pairs from the `<script setup>` content.

3. **Directory structure change in C-2.** Phase C-2 introduces `src/codegen/` — a new subdirectory. This is the first module outside `src/parser/`. The Builder must update `lib.rs` to declare `pub mod codegen` and the Architect must specify `codegen/mod.rs` contents.

4. **Void element gap will surface at C-3.** The Director note flagged that self-closing restriction means templates like `<input :value="count">` cannot compile in v0. This is not a C-2 concern but should be documented as a known limitation for the C-3 codegen phase when the full counter fixture runs.

---

## Phase C-1 deliverables summary

**Branch:** `feat/compiler-c1` | **Implementation commit:** `2a4ad9d` | **HEAD at session end:** `057029b` (docs)
**New tests:** 10 in `tests/template_parse.rs` | **Re-accepted snapshots:** 5 in `tests/snapshots/` (sfc_split)
**New snapshots:** 10 in `tests/snapshots/` (template_parse)
**Criteria:** 11/11 PASS | **Clippy:** clean | **Fmt:** clean | **Over-implementation:** none

Files added or amended:
- `packages/compiler/src/types.rs` — `TemplateNode`, `Attr` enums; `ScribeSource` adds `pub meta: ScriptMeta`
- `packages/compiler/src/lib.rs` — re-exports `Attr`, `TemplateNode`
- `packages/compiler/src/parser/mod.rs` — alphabetical three-module declaration
- `packages/compiler/src/parser/sfc.rs` — wires `extract_script_meta` result into `ScribeSource` return
- `packages/compiler/src/parser/template.rs` — new; `parse_template()` recursive descent
- `packages/compiler/src/parser/directives.rs` — new; directive discrimination + identifier validation
- `packages/compiler/tests/template_parse.rs` — new; 10 snapshot tests
- `packages/compiler/tests/snapshots/` — 5 re-accepted + 10 new `.snap` files

---

## Earned learnings (promotion assessment)

| Finding | Promote? | Reason |
|---|---|---|
| `TemplateNode` uses owned `String` — no `&'a str` lifetime slices | **YES** | Non-obvious design constraint. The reason (delimiter-stripping produces non-contiguous substrings) is not stated in source. A future agent might propose `&'a str` as an "optimization." Load-bearing for C-2/C-3 pipeline design. |
| `extract_script_meta` was discarded (`_meta`) at `sfc.rs:128` — wired in C-1 | **NO** | Now derivable from source. After C-1, `sfc.rs` stores the result in `ScribeSource`. Historical "it was discarded" fact has no future relevance. |
| Template parser: recursive descent, hand-rolled `pos: usize` cursor, no third-party HTML crate | **YES** | Architectural decision not encoded in any source comment or `Cargo.toml`. Future agents scouting for a parser crate to add would see no prohibition. Director adjudicated this explicitly on complexity grounds. Load-bearing for C-2 Architect if parsing extensions are needed. |
| `{{`/`}}` interpolation: delimiter stripping + `str::trim()` + `[a-zA-Z_][a-zA-Z0-9_]*` validation | **NO** | Fully derivable from reading `parser/directives.rs`. Algorithm is in source. No non-obvious decision to preserve. |
| `_setMount` consumer constraint: app-level bootstrap call, not compiler concern | **YES** | Not in any `packages/compiler/` source file. Documented in `architecture.md` §8, but agents reading only compiler source will never encounter it. Future C-3/C-4 agents deciding whether to emit a bootstrap call need this or will re-debate it. Ruling: do not emit; consider a comment in C-4. |
