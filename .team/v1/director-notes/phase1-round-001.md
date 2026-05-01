# Director Note — Phase 1, Round 1

**Date:** 2026-05-01
**HEAD:** `d180ac8`
**Track:** Phase 1 — `<agent>` block, options-form emission, MCP manifest
**Author:** Topic Director (subagent)

---

## 1. On-Thesis Check

The work is on-thesis. Every item in the implementation lanes flows directly from the locked decisions and from the Phase 1 contract. No scope creep risks are present in the Lane A and Lane B work as scoped below.

One scoping boundary to hold firm: Lane B work this round is **only** D5 (the `_setMount`/`_setSignal` re-export) and RC-2 (the `AgentMetadata.actions` type upgrade). The compiler does not yet emit calls to `registerAgentMetadata` — that is Lane A emission work. Builder B must not pre-author registry-population tests that depend on compiler output. That integration lives in a later round when Lane C examples and Lane D CI are wired.

The one latent scope-creep risk is the `dist/index.d.ts` for `@scribe/agent` (currently at `/C:/git/fellwork/scribe/packages/agent/dist/index.d.ts`). It reflects the **old** `actions?: Record<string, string>` shape. After Builder B upgrades the source type in `registry.ts`, the dist declaration file will be stale. Builder B must regenerate it (or make clear in the acceptance criterion that `bun run build` is required before CI passes). Do not let a stale `.d.ts` be committed.

---

## 2. Lane Sequence

**Confirmed:** Lanes A and B are fully independent and run in parallel this round.

- Lane A touches only Rust files under `/C:/git/fellwork/scribe/packages/compiler/src/` and the Rust test files under `/C:/git/fellwork/scribe/packages/compiler/tests/`.
- Lane B touches only `/C:/git/fellwork/scribe/packages/runtime/src/index.ts` and `/C:/git/fellwork/scribe/packages/agent/src/registry.ts` (plus its test file and the rebuilt dist).
- There is zero file overlap between A and B.

**Lane C blocks on Lane A binary** because the example `.scribe` files and grammar docs need the real parser and emitter to validate output. Do not start Lane C until Lane A has a green `cargo test` run.

**Lane D blocks on Lane A binary** for the same reason — the release workflow needs the binary to build and the `@scribe/compiler` Node wrapper's postinstall to function correctly.

**Sequencing risk — one flag:** `packages/compiler/src/lib.rs` currently re-exports `emit` (the old `emit(unit, tag) -> String` signature). When Builder A changes `emit` to return `EmitResult`, the public re-export in `lib.rs` must be updated in the same commit, or `main.rs` will fail to compile. Builder A must treat `lib.rs` as part of the same step as the `emit.rs` change.

---

## 3. Scout Brief

The Scout is read-only. Run the following checks in order and report each result as PASS/FAIL with the raw output.

**SC-1: Test count baseline**
Run `bun run test` from `/C:/git/fellwork/scribe`. Confirm the final line shows 320 tests passing, 0 failing. Record the exact count.

**SC-2: counter.scribe compiles clean**
Run the Rust binary against the fixture:
```bash
cd /C:/git/fellwork/scribe
cargo run --manifest-path packages/compiler/Cargo.toml --bin scribe-compile -- packages/compiler/fixtures/vite-counter/counter.scribe
```
Expected: output to stdout contains both `defineElement(` and `defineComponent((_ctx)`. No `error:` lines on stderr.

**SC-3: Key files exist at expected paths**
Confirm the following files are present:
- `/C:/git/fellwork/scribe/packages/compiler/src/parser/sfc.rs`
- `/C:/git/fellwork/scribe/packages/compiler/src/types.rs`
- `/C:/git/fellwork/scribe/packages/compiler/src/codegen/emit.rs`
- `/C:/git/fellwork/scribe/packages/compiler/src/bin/main.rs`
- `/C:/git/fellwork/scribe/packages/compiler/src/lib.rs`
- `/C:/git/fellwork/scribe/packages/compiler/src/parser/mod.rs`
- `/C:/git/fellwork/scribe/packages/compiler/src/codegen/mod.rs`
- `/C:/git/fellwork/scribe/packages/runtime/src/index.ts`
- `/C:/git/fellwork/scribe/packages/agent/src/registry.ts`
- `/C:/git/fellwork/scribe/packages/agent/tests/registry.test.ts`

Confirm the following files do NOT yet exist (they are new files for this round):
- `/C:/git/fellwork/scribe/packages/compiler/src/parser/agent.rs`
- `/C:/git/fellwork/scribe/packages/compiler/tests/integration.rs`

**SC-4: No conflicting uncommitted changes**
Run `git status`. The only untracked files should be `.mcp.json.local-backup` and `AGENTS.db.local-backup`. There must be no modified tracked files in the `packages/` tree.

**SC-5: `_setMount` and `_setSignal` not yet on the public index**
Confirm that `/C:/git/fellwork/scribe/packages/runtime/src/index.ts` does NOT contain `_setMount` or `_setSignal` in its exports.

**SC-6: Current `AgentMetadata.actions` type**
Confirm that `/C:/git/fellwork/scribe/packages/agent/src/registry.ts` contains `actions?: Record<string, string>` (the pre-RC-2 shape).

---

## 4. Builder A Brief (Rust Compiler)

Work entirely within `/C:/git/fellwork/scribe/packages/compiler/`. All steps must leave `cargo test` green.

### Step A-1: `types.rs` — extend `CompileError` and add contract AST types

File: `/C:/git/fellwork/scribe/packages/compiler/src/types.rs`

Add `#[derive(Default)]` to `CompileError`. Add three optional fields: `code: Option<String>`, `hint: Option<String>`, `fix: Option<String>`. All existing construction sites use named-field syntax and don't set these fields; they compile because fields are `Option` with `Default`. This satisfies D7.

Add contract AST types:
```rust
#[derive(Debug, PartialEq, Clone)]
pub enum InputKind {
    String,
    Number,
    Boolean,
    Enum(Vec<String>),
}

#[derive(Debug, PartialEq, Clone)]
pub struct InputDecl {
    pub name: String,
    pub kind: InputKind,
    pub default: Option<String>,
}

#[derive(Debug, PartialEq, Clone)]
pub struct StateDecl {
    pub name: String,
    pub kind: InputKind,
}

#[derive(Debug, PartialEq, Clone)]
pub struct ActionDecl {
    pub name: String,
    pub returns: Vec<(String, InputKind)>,
}

#[derive(Debug, PartialEq, Clone, Default)]
pub struct AgentBlock {
    pub inputs: Vec<InputDecl>,
    pub states: Vec<StateDecl>,
    pub actions: Vec<ActionDecl>,
}
```

Add `agent: Option<AgentBlock>` to `ScribeSource`:
```rust
pub agent: Option<AgentBlock>,   // NEW
```

Update `lib.rs` to re-export: `InputDecl`, `InputKind`, `StateDecl`, `ActionDecl`, `AgentBlock`.

**Note on sfc_split snapshots:** Adding `agent` field to `ScribeSource` will change the debug output for existing snapshots. Run `cargo insta review` and accept all snapshots that now show `agent: None`. These are expected — not regressions.

### Step A-2: `agent.rs` — contract parser

File: `/C:/git/fellwork/scribe/packages/compiler/src/parser/agent.rs` (NEW)

Public API: `pub fn parse_agent(src: &str) -> Result<AgentBlock, CompileError>`

Helper functions:
- `fn parse_type_token(token: &str, line_no: usize) -> Result<InputKind, CompileError>`
- `fn parse_input_line(rest: &str, line_no: usize) -> Result<InputDecl, CompileError>`
- `fn parse_state_line(rest: &str, line_no: usize) -> Result<StateDecl, CompileError>`
- `fn parse_action_line(rest: &str, line_no: usize) -> Result<ActionDecl, CompileError>`
- `fn parse_returns_block(block: &str, line_no: usize) -> Result<Vec<(String, InputKind)>, CompileError>`

Grammar: each non-blank, non-comment (`#`) line is: `input`, `state`, or `action`.

Error codes in `CompileError.code`:
- `C001` — unknown keyword
- `C002` — unknown type token
- `C003` — malformed `input` line (missing `:`)
- `C004` — malformed `action` signature (missing `()`)
- `C005` — malformed returns block
- `C006` — malformed enum (empty or missing parens)
- `C007` — duplicate input name

RC-3 REVERSED: string without default → `default: None` (no error). Enum without default → `default: None` (also no error; first variant used as runtime fallback in emit). C008 is reserved but not implemented this round.

Inline `#[cfg(test)]` block with 25 test cases covering:
1. Empty contract → empty AgentBlock
2. Comment-only lines → empty AgentBlock
3. `input plan: string` → default None
4. `input plan: string = hello` → default Some("hello")
5. `input amount: number = 100` → Number default
6. `input active: boolean = false` → Boolean default
7. `input plan: enum(daily, weekly, monthly) = daily` → Enum with default
8. `input plan: enum(daily, weekly, monthly)` — no default, no error
9. `state total: number` → StateDecl
10. `state label: string` → StateDecl
11. `action quote()` no returns → ActionDecl { returns: [] }
12. `action quote() -> { plan: string, amount: number, fee: number, total: number }` → full ActionDecl
13. Mixed inputs + state + action → full AgentBlock
14. Blank lines between declarations → parsed correctly
15. Inline comment (`input plan: string # the plan`) → comment stripped
16. Unknown keyword `output foo: string` → Err C001
17. Unknown type `input x: uuid` → Err C002
18. `input` line missing `:` → Err C003
19. `action` line missing `()` → Err C004
20. Malformed returns block (missing `}`) → Err C005
21. Empty enum `enum()` → Err C006
22. Duplicate input name → Err C007
23. `enum` with spaces `enum( daily , weekly )` → trims correctly
24. `action quote() -> { total: number }` single-field returns → correct ActionDecl
25. Full airtime-quote agent block → matches all 3 inputs + 1 state + 1 action

Update `parser/mod.rs`: add `pub mod contract;`.

### Step A-3: `sfc.rs` — add `<agent>` block

File: `/C:/git/fellwork/scribe/packages/compiler/src/parser/sfc.rs`

Add `BlockKind::Contract` variant. In `next_block`, include contract detection in the offset scan. In parse loop, handle `BlockKind::Contract`: extract content, call `parser::agent::parse_agent`, propagate errors, store `Option<AgentBlock>` in `ScribeSource.agent`.

No changes to script/template/style logic. Files without `<agent>` parse with `agent: None`. Accept updated snapshots showing `agent: None`.

### Step A-4: `emit.rs` — D6 + D12 + options-form + RC-4 + manifest

**Sub-steps (each must leave `cargo test` green):**

**A-4a: EmitResult struct**
Add `pub struct EmitResult { pub js: String, pub manifest_json: String }`. Change `emit()` return from `String` to `EmitResult`. Set `manifest_json: String::new()` temporarily. Update `lib.rs`, `codegen/mod.rs`, `main.rs` in the same commit. All existing codegen snapshots must pass.

**A-4b: Import-span state machine**
Replace `extract_script_body` with a stateful filter that tracks `in_import: bool` across lines. Handles multiline imports (`import { computed } from '@scribe/signals'` split across lines). Add test `multiline_import_stripped` to `codegen.rs`.

**A-4c: Options-form emission**
Add `fn emit_agent_bindings(unit: &CompileUnit, tag_name: &str, contract: &AgentBlock) -> EmitResult`. Branch on `agent: Some` vs `None`. When `None`, existing function-form path runs unchanged.

Per-type codegen (inside `setup(ctx)`):
- `string`: `const [<name>] = ctx.attrs.<name>`
- `number`: `const <name> = computed(() => Number(ctx.attrs.<name>[0]()))`
- `boolean`: `const <name> = computed(() => ctx.attrs.<name>[0]() === 'true')`
- `enum` (RC-4): `const _<name>_V = new Set([<variants>])` + `const <name> = computed(() => _<name>_V.has(ctx.attrs.<name>[0]()) ? ctx.attrs.<name>[0]() : '<variants[0]>')`

Attrs array: only `input` declarations (not `state`). `state` items are internal.

Add snapshot test `agent_airtime_quote` to `codegen.rs`. Existing `counter_full` must be unchanged.

**A-4d: Manifest JSON**
Add `fn emit_manifest(tag_name: &str, contract: &AgentBlock) -> String`. Snake-case tag name (replace `-` with `_`). JSON shape per D11. Hand-rolled format strings only — no `serde`/`serde_json` as non-dev dependency. Set `EmitResult.manifest_json`. Update `main.rs` to write `agent-manifest.json` alongside JS when `--out` is set and `manifest_json` is non-empty.

### Step A-5: `tests/integration.rs` — 5 E2E tests

File: `/C:/git/fellwork/scribe/packages/compiler/tests/integration.rs` (NEW)

Five tests:
1. `counter_no_agent_block_regression` — function form emitted, no `attrs:`, no options form. CRITICAL regression firewall.
2. `agent_airtime_quote_js_shape` — options form emitted, contains `attrs:`, `_plan_V`, `computed(() => Number(`.
3. `agent_airtime_quote_manifest_keys` — manifest_json contains `"airtime_quote"`, `"airtime-quote"`, `"quote"`.
4. `contract_parse_error_propagates` — malformed contract → compile_full returns Err with code `Some("C002")`.
5. `no_agent_block_manifest_empty` — counter.scribe → manifest_json is empty.

---

## 5. Builder B Brief (TypeScript)

### Step B-1: D5 — export `_setMount`/`_setSignal` from index.ts

File: `packages/runtime/src/index.ts`

Add:
```ts
/**
 * Internal bootstrap exports — not part of the public API contract.
 * Required by compiler-emitted options-form components at app boot.
 * See decisions D5 (Phase 1 engineering review).
 */
export { _setMount, _setSignal } from './define-component.ts'
```

Acceptance: `bun run typecheck` passes, 320 tests green.

### Step B-2: RC-2 — upgrade `AgentMetadata.actions`

File: `packages/agent/src/registry.ts`

Add before `AgentMetadata`:
```ts
export interface InputSchema {
  type: 'string' | 'number' | 'boolean' | 'enum'
  values?: string[]
  default?: string
}

export interface ActionSchema {
  returns: Record<string, InputSchema>
}
```

Change `actions?: Record<string, string>` to `actions?: Record<string, ActionSchema>`.

Do NOT upgrade `state?: Record<string, string>` — that is out of scope for RC-2.

Acceptance: 7 existing registry tests still green (they don't use `actions`). `bun run typecheck` passes.

### Step B-3: Three new registry tests

File: `packages/agent/tests/registry.test.ts`

New `describe` block with 3 tests (numbered 8, 9, 10):
- Test 8: `actions` field accepts `Record<string, ActionSchema>` — register metadata, retrieve, check `.actions?.quote.returns.plan.type === 'enum'`.
- Test 9: `InputSchema` without `default` is valid — `returns.amount.default` is `undefined`.
- Test 10: Multiple actions coexist — two actions registered, `Object.keys(result?.actions ?? {})` has length 2.

Import `ActionSchema`, `InputSchema` at top of test file.

### Step B-4: Rebuild dist

Run `bun run build`. Verify `packages/agent/dist/index.d.ts` now contains `ActionSchema` and `InputSchema` declarations. `bun run typecheck` must pass. `bun run test` must show 323 tests. Commit all B steps together.

---

## 6. Surface-to-User Triggers

| Trigger | Condition |
|---------|-----------|
| T-1 | Rust test count drops below pre-round baseline, or any previously-passing test fails |
| T-2 | `counter_no_agent_block_regression` test fails — function-form path broken |
| T-3 | `bun run build` size budget fails (hard ceiling 3.46 kB gz) |
| T-4 | `serde`/`serde_json` added as non-dev Rust dependency |
| T-5 | `dist/index.d.ts` committed before `bun run build` with stale `actions` type |
| T-6 | Either Builder attempts Lane C/D work (examples, docs, release workflow) |
| T-7 | Builder B upgrades `state` type without locked decision |
