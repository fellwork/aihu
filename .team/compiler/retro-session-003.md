# Retro — Compiler Track Session 3
Date: 2026-04-30
Phase completed: C-2 (Signal Identity Resolver)
Branch: feat/compiler-c2
Commit: 32ba955

## What went well

**Director adjudication resolved both carry-over OQs before any implementation work began.** OQ-C15 (`parse_template()` wiring timing) was closed immediately on inspection — `compile_full()` already threads the template AST through `CompileUnit<'a>`, so the wiring happened as a natural consequence of the C-2 API design rather than a separate step. OQ-C16 (`SignalMap` concrete type) was correctly delegated to the Architect and resolved as `HashMap<String, String>` newtype before the Builder started.

**`compile_full()` two-function API design produced zero churn on the existing sfc_split snapshot suite.** Keeping the original `compile()` untouched and adding a separate `compile_full()` returning `CompileUnit<'a>` meant all 6 existing sfc_split snapshots re-accepted without content change. This is the correct way to extend a public API without breaking downstream consumers.

**`"const ["` prefix guard is tight and sufficient.** The discriminator for array-destructured signal declarations works without false positives: imports, plain assignments, arrow functions, and non-destructuring signal patterns all fail the guard. No additional filtering layer was required.

**Bidirectional regression guard pattern deployed for the first time.** The `mixed_vars_and_signals` snapshot test simultaneously verifies both under-extraction (non-signal vars absent) and over-extraction (all signals present). This is more efficient than two separate exclusion tests and was promoted as a verifier finding.

**Verifier confirmed 10/10 PASS**, including the bidirectional C2-7 check which was not part of the original 6 architecture criteria — the Verifier strengthened coverage beyond the spec without widening scope.

**Session resumed cleanly after context compaction.** The prior commit (`9483d9c`, docs closing OQ-C15/C16) was already in place on the branch; the Builder picked up exactly where the Director left off. No repeated work.

---

## What to improve

**Architecture criteria count did not match Verifier criteria count at handoff.** The architecture spec named 6 acceptance criteria (C2-1 through C2-6); the Verifier ran 10 checks (C2-1 through C2-10). The additional criteria (C2-7 bidirectional guard, C2-8 through C2-10) were correct additions but were not pre-specified. Future sessions should either expand the architecture acceptance criteria upfront or explicitly note that the Verifier may augment them.

**No build manifest was produced for C-2.** Session 1 produced a build manifest (`build-manifest-c0.md`); sessions 2 and 3 did not. If the verification report is considered sufficient, the manifest format should be retired from the process. If it is still required, Session 4 Builder should produce one.

---

## Earned learnings (promotion candidates)

| Finding | Promote? | Reason |
|---|---|---|
| `"const ["` prefix guard is a sufficient, tight discriminator for array-destructured signal declarations | **YES** | Not obvious from source alone. Future agents writing alternate signal parsers might reach for regex or AST-based approaches. The fact that a simple prefix check is sufficient (and verified against imports, plain assignments, arrow functions, and non-destructuring patterns) is load-bearing architectural knowledge for C-3/C-4 codegen. |
| `mixed_vars_and_signals` bidirectional test pattern | **YES** | Design principle applicable beyond this codebase. A single snapshot that contains both in-scope and out-of-scope items simultaneously guards against both under- and over-extraction. Worth encoding as a testing convention for future phases. |
| `TemplateNode` uses owned `String` fields (not `&'a str`) — delimiter-stripping produces non-contiguous substrings | **PENDING (from session 2)** | Still load-bearing. Not yet promoted. |
| Hand-rolled recursive descent parser — zero dependencies, full control over aihu-specific directives | **PENDING (from session 2)** | Still load-bearing. Not yet promoted. |
| `_setMount` constraint: app-level bootstrap call, not a compiler concern | **PENDING (from session 2)** | Still load-bearing. Not yet promoted. |

---

## Phase C-3 readiness

**Input available:** `CompileUnit<'a>` carries `script: &'a str`, `template_ast: Option<Vec<TemplateNode>>`, and `SignalMap` (via `resolve_signals()`). The codegen phase has all three inputs.

**Canonical emit form locked:** `architecture.md` Section 7 defines the exact TypeScript output — `defineElement()`/`defineComponent()` wrapping, `branch()`/`leaf()` tree construction, `Signal<string>` cast pattern. This is the C-3 acceptance snapshot oracle.

**Known limitation to document at C-3 entry:** Void/self-closing elements (e.g., `<input>`) cannot compile in v0 due to the self-closing restriction in the template parser. The counter fixture does not use void elements, so this will not block C-3 acceptance, but it should appear in the C-3 architecture amendment as a noted constraint.

**Session 4 entry state:** 22 tests passing (6 sfc_split + 10 template_parse + 6 signal_resolve). Clippy clean. Fmt clean. Branch `feat/compiler-c2` at commit `32ba955`. C-3 Architect must specify the TypeScript emit algorithm (import list, `defineElement` wrapper, `_ctx` parameter, `branch`/`leaf` recursion over `TemplateAst`, `Signal<string>` cast for leaf-signal nodes).
