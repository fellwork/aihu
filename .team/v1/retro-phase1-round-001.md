# Retro — Phase 1, Round 1

**Date:** 2026-05-01
**Branch:** `feat/phase1-contract`
**HEAD:** `73e7ca7`
**Range:** `d109db6..73e7ca7` (10 commits)

---

## Outcome

The `<contract>` block ships. One `.scribe` file now compiles to both a vanilla
custom element (options-form `defineComponent({ attrs, setup })`) and an
`agent-manifest.json` MCP tool schema, in a single emit pass with no AST drift.
Lane A (Rust compiler) and Lane B (TypeScript runtime/agent) merged in parallel:
Rust 32→68 tests (+36), TypeScript 320→323 tests (+3). The `counter.scribe`
function-form path is regression-tested and untouched.

---

## What worked

- **Parallel lanes with zero file overlap.** Lane A (`packages/compiler/src/**`,
  Rust) and Lane B (`packages/runtime/src/index.ts` + `packages/agent/src/registry.ts`,
  TS) had no shared files. Both Builders ran in the same wall-clock window,
  merged independently via `--no-ff` (`469f12d` and `708b7b0`), and never
  touched each other's diffs. The Director Note flagged the one sequencing
  trap up front (`lib.rs` re-export must move with `emit.rs` signature change)
  and Builder A handled it inside the same commit (`751d168`).
- **Locked decisions held.** Eng review delivered 11 numbered decisions before
  this round opened. Every one was implementable as written; no Builder kicked
  back a "this won't work" mid-round. RC-3 and RC-4 reversals (decided at
  review time) saved a round of churn.
- **Inline test scaffolding for the contract parser.** Builder A put 25 unit
  tests in a `#[cfg(test)]` block inside `contract.rs` itself (D8). Tight
  feedback loop — `cargo test contract::tests` ran in <1 s and Verifier A
  could read the parser and its tests as one file.
- **Critical-regression firewall codified, not aspirational.** `tests/integration.rs`
  has `counter_no_contract_regression` and `no_contract_manifest_empty` as
  named tests. The "do not break counter.scribe" rule is now machine-enforced,
  not a checklist item.
- **Manifest-from-AST in one pass.** D12's `EmitResult { js, manifest_json }`
  came out of a single `ContractAst` walk. No risk of the JS attrs and the
  manifest inputs disagreeing — they're the same data structure, twice
  formatted.
- **Scout caught the test-count drift.** Memory said 320 TS tests; Scout's
  SC-1 measured 326. Track C H4 had landed since the prior session. The
  retro count (320 → 323 net) is correct because Lane B added 3 tests on
  top of the 320 Phase 1 baseline; Track C's 6 tests are an unrelated
  +6 in the same tree. Without the scout check we would have miscounted.

---

## What surprised us

- **Contract parse errors surface from `sfc::parse()`, not `compile_full()`.**
  Builder A noticed mid-implementation that propagating contract errors from
  the SFC layer is the architecturally correct seam — `compile_full()` becomes
  a thin pipeline and parse errors stay at the parse layer. Verifier A
  upgraded this from "deviation from brief" to "sound architectural
  refinement." The brief's `(&str)` signature was changed to
  `compile_full(&ScribeSource)` for the same reason: cleaner separation,
  no consumer broken.
- **Side-effect imports broke the import-span state machine.** D6's first
  implementation used `;` absence as the multiline signal. A bare
  `import '@scribe/polyfill'` (no braces, no `from`) would falsely open a
  multiline span and eat following script lines. Caught by Verifier A,
  fixed inline (`5911f60`): switched to `{`-without-`}` as the multiline
  signal. Side-effect imports now pass through as single-line. Lesson:
  the import grammar is more varied than the eng review's example set.
- **`export function action()` inside `<script setup>` was a syntax error in
  emitted JS.** The original `extract_script_body` preserved `export` keywords
  verbatim. Inside `setup(ctx) { ... }` that's invalid JS. Verifier A finding
  F1, fixed inline by stripping top-level `export ` (`5911f60`). Latent
  because no fixture in the existing snapshots exercised `export` in a script
  block.
- **Verifier B findings were both lint-class, not behavior-class.** F1 was a
  strict-null-check on optional `Record` access in the new RC-2 tests; F2 was
  stale JSDoc claiming the pre-D5 import path. Zero behavior change in the
  fix commit (`b7b9b09`). The Builder B work was correct on first pass; the
  review round caught only polish. Suggests the RC-2 type upgrade was
  small enough that more aggressive Builder self-review could have caught
  both before Verifier B.

---

## What we'd do differently

- **Bundle the import state-machine spec with negative examples.** The eng
  review locked D6 ("replace `extract_script_body` with import-span state
  machine") but didn't enumerate the import grammars to support. Next time:
  list `import x`, `import { x }`, `import { x } from 'y'`, `import 'y'`,
  multiline `import { x,\n y } from 'z'`, dynamic `import()`. Force the
  state machine to be exercised against all of them in unit tests before
  Verifier sees it.
- **Add a "Builder lint pass" gate before Verifier dispatch.** Both
  Verifier B findings were `tsc --strict` / JSDoc issues that would have
  been caught by `bun run typecheck` on a fresh checkout. A 30-second
  `bun run typecheck && bun run build` self-check by Builder before
  declaring DONE would have made Verifier B a no-finding round.
- **Lane brief should label which sub-steps may be grouped.** Builder A
  grouped A-1+A-2+A-3 (`9246047`) and A-4a-d (`751d168`) into single commits
  because the structural changes were entangled (`ScribeSource.contract` field
  ripples through every parser step; `EmitResult` ripples through every
  codegen sub-step). The brief implied finer granularity. Either label which
  sub-steps the Director thinks are individually committable, or accept that
  the Builder's judgment on entanglement is final.
- **Reserve a "snapshot review" line item.** Adding `contract: Option<ContractAst>`
  to `ScribeSource` invalidated every `cargo insta` snapshot. The brief noted
  this in passing ("accept all snapshots that now show `contract: None`") but
  a Builder unfamiliar with insta could read this as a regression. Next round
  with snapshot-affecting changes: make snapshot review a named acceptance step.

---

## Inline-fix pattern observation

Both Verifiers found 2 issues each — 4 total. All 4 were fixed inline by Team
Lead in dedicated fix commits (`5911f60` Lane A, `b7b9b09` Lane B) rather than
re-spinning the Builders.

**This was the right call this round.** All four findings were:
- Localized to a single function or a few lines (`extract_script_body`,
  three `?.` insertions, two JSDoc blocks)
- Architecturally consistent with the Builder's design (no rewrite, just
  hardening)
- Faster to fix-with-context than to spec, dispatch, await, review

**It becomes wrong when:**
- The fix touches a design decision the Builder owns. If F1 had required
  re-thinking the import grammar (it didn't — `{`-without-`}` was a local
  patch), Builder A should have re-spun.
- The Verifier finds 3+ issues. Two findings is a polish round; three or
  more is a sign the Builder's mental model diverged from the brief and a
  re-spin is the cheaper path to convergence.
- The fix would change a snapshot, public API, or test count. None of the
  4 findings did. If they had, Builder ownership of the change history
  matters more than wall-clock speed.
- The inline fixer doesn't have the full context. Team Lead had been in the
  Director Note and both Builder briefs. A Lead who hadn't been would have
  been guessing.

Heuristic for next round: **two findings, localized, behavior-preserving →
inline. Otherwise re-spin.**

---

## Locked decisions verified

| ID  | Status | One-line confirmation |
|-----|--------|----------------------|
| RC-1 | PASS | Options form `defineComponent({ attrs: [...] as const, setup(ctx) })` emitted when contract present (`emit.rs::emit_contract`); destructuring per-input `const [name] = ctx.attrs.name`. No new runtime API. |
| RC-2 | PASS | `packages/agent/src/registry.ts` exports `InputSchema` + `ActionSchema`; `AgentMetadata.actions` is `Record<string, ActionSchema>`. `tag: string` still required. 3 round-trip tests in `registry.test.ts` (`309528a`). |
| RC-3 | PASS | `parse_contract` accepts `input plan: string` with no default → `default: None`, no error. Test 3 in `contract.rs::tests`. C008 reserved, not raised. |
| RC-4 | PASS | Enum codegen wraps `computed(() => _name_V.has(...) ? ... : default)` — full Set validation, not cast-only. Snapshot test `contract_airtime_quote` exercises `_plan_V`. |
| D5  | PASS | `packages/runtime/src/index.ts` re-exports `_setMount, _setSignal` from `./define-component.ts` (`e585eeb`). Smoke import resolves from package path. |
| D6  | PASS | `extract_script_body` replaced with import-span state machine in `emit.rs`. Multiline imports, side-effect imports both handled (`5911f60` regression test added). |
| D7  | PASS | `CompileError` has `#[derive(Default)]` + `code/hint/fix: Option<String>` fields. All construction sites use named-field syntax; existing call sites compile via `Default`. |
| D11 | PASS | `agent-manifest.json` shape: `{ tools: [{ name, inputs, actions }] }`. Snake-case tool name (`airtime_quote` from `airtime-quote`). Hand-rolled JSON, no `serde_json` dep. Verified by `contract_airtime_quote_manifest_keys` integration test. |
| D12 | PASS | `emit()` returns `EmitResult { js: String, manifest_json: String }`. Single `ContractAst` walk, no drift. `lib.rs`, `codegen/mod.rs`, `main.rs` all updated atomically in `751d168`. |

---

## Critical regression status

| Regression | Status | Evidence |
|------------|--------|----------|
| `counter.scribe` → function form | PASS | `counter_no_contract_regression` integration test: output contains `defineComponent((_ctx)`, no `attrs:`, no options form. Manual run via `cargo run --bin scribe-compile -- packages/compiler/fixtures/vite-counter/counter.scribe` matches scout SC-2 baseline. |
| Files without `<contract>` use function form | PASS | `emit_contract` branches on `contract: Some` vs `None`; `None` path is the unchanged function-form codegen. `no_contract_manifest_empty` test: `manifest_json` is empty when `contract: None`. |
| `defineComponent` function form unchanged | PASS | No edits to `packages/runtime/src/define-component.ts`. Public `defineComponent(setup)` signature untouched; D5 only adds two re-exports. All 320 prior TS tests still green. |

---

## Carry-forward to Round 2 (Lanes C + D)

**Both lanes blocked on Lane A binary, which is now ready.** Lane A produced a
working `cargo build --release --bin scribe-compile` and the
`packages/compiler/js/index.ts` Node wrapper hook is the integration seam.

**Lane C — DX artifacts** (no dependencies between sub-items, can dispatch as
parallel mini-lanes):
- `examples/airtime-quote/airtime-quote.scribe` — canonical public example,
  must round-trip through the binary and produce a manifest matching the
  one in `contract_airtime_quote_manifest_keys`.
- `examples/scripture-reference/scripture-reference.scribe` — Fellwork dogfood
  fixture.
- `docs/grammar.md` — full BNF + null/missing behavior table. Must reflect
  RC-3 (no default → `''` fallback) and RC-4 (enum Set validation) as locked.
- `docs/tthw-log.md` — through-the-hands-of-Williamson log (working notes).
- `editors/vscode/` — TextMate grammar + snippets for `.scribe` SFCs.
- MIT `LICENSE` at repo root + `"license": "MIT"` in every workspace
  `package.json`.

**Lane D — CI binaries:**
- `.github/workflows/release.yml` cross-compile matrix:
  mac-arm64, mac-x64, linux-x64, windows-x64. Trigger: `push: tags: ['v*']`.
- `packages/compiler/js/index.ts` postinstall: detect platform, download the
  matching binary from GitHub Releases, place at known path. Must fail loud
  (not silent) on missing artifact.

**Sequencing for Round 2:**
- Lane C and Lane D are independent of each other. Dispatch in parallel.
- Lane C examples should be authored against the **shipped** binary
  (`cargo build --release` first, then run on the example fixtures, then
  commit the example files). Don't speculate on emitter output.
- Lane D should not block on Lane C. The release workflow only needs the
  Rust compiler to build cleanly per platform.

**Latent issues to surface in Round 2 director note:**
- The `dist/index.d.ts` for `@scribe/agent` was regenerated as part of B-4
  (commit history shows `bun run build` ran before merge). Confirm in Round 2
  scout that no stale `.d.ts` was committed elsewhere.
- The `c4_transform_produces_typescript` test is still ignored (scout SC-7).
  Out of scope for Phase 1 but worth a TODOs.md note.
- `serde_json` was avoided per T-4. If Round 2 examples want to validate
  manifest output, they should parse with native JS `JSON.parse`, not
  reintroduce a Rust JSON dep.

---

## Learnings

1. **Manifest-from-AST in one pass beats manifest-from-rendered-output.**
   D12's `EmitResult { js, manifest_json }` from a single `ContractAst` walk
   is structurally incapable of drift — JS attrs and manifest inputs are the
   same data, twice formatted. Future emit-multiple-outputs work (e.g.,
   `.d.ts` generation, Storybook stories, OpenAPI spec) should follow this
   pattern: one AST → N format passes, all in the same commit, with
   integration tests that diff fields across outputs.

2. **Lane independence is a structural property, enforce it at brief time.**
   The Director Note explicitly listed every file each Lane could touch and
   noted "zero file overlap." That paid off: parallel dispatch had no merge
   conflicts and no coordination overhead. For future multi-lane rounds,
   require the Director Note to include a Lane-vs-files matrix; if any file
   appears under two lanes, the round must be re-scoped before dispatch.

3. **Inline parser tests beat external test files for grammar work.** 25
   `#[cfg(test)]` cases inside `contract.rs` made the parser self-documenting
   — Verifier A read parser + tests as one artifact. For future `.scribe`
   grammar extensions (template directives, style scoping, slot syntax),
   default to inline `#[cfg(test)]` for parser modules; reserve
   `tests/integration.rs` for E2E pipeline coverage and named regression
   firewalls.

4. **A "Builder lint pass" before Verifier dispatch would have made
   Round 1 a zero-finding round.** Both Verifier B findings were
   `tsc --strict` / JSDoc class issues. A required `bun run typecheck &&
   bun run build` self-check by Builder before declaring DONE costs ~30s
   and would have caught both. Add to the standard Builder brief template:
   "Before declaring DONE, run typecheck + build + test on a clean
   checkout. Paste the green output." This shortens Verifier rounds and
   moves the inline-fix-vs-respin decision earlier.
