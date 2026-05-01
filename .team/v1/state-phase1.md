# State — Phase 1 Track (Contract Block + Agent Manifest)

**Track:** `phase1`
**Created:** 2026-05-01
**Base branch:** `main` (`d180ac8` — C-4 through C-0 compiler phases + arbor fixes)
**Mode:** 2 (Build / refactor — L-scope)

---

## Purpose

Phase 1 implements the `<contract>` block — making one `.scribe` file simultaneously
emit a reactive custom element AND an MCP tool schema.

"So the poor of the poor can have access to agentic endpoints."

Design doc (APPROVED): `~/.gstack/projects/fellwork-scribe/srmcg-feat-v1-props-design-20260501-034315.md`
Test plan: `~/.gstack/projects/fellwork-scribe/srmcg-main-eng-review-test-plan-20260501-051258.md`
Eng review verdict: CLEAR — 0 unresolved decisions.

---

## Locked Decisions (from eng review — do not revisit)

| ID | Decision |
|----|----------|
| RC-1 | Options form: `defineComponent({ attrs, setup(ctx) })` + `const [plan] = ctx.attrs.plan` destructuring. No new runtime API. |
| RC-2 | `AgentMetadata.actions`: `Record<string, ActionSchema>` (not `Record<string, string>`). `tag: string` stays required. Add `InputSchema` + `ActionSchema` interfaces. |
| RC-3 (REVERSED) | String without default → `''` fallback. Only enum without default is C008. |
| RC-4 (REVERSED) | Enum inputs get `computed(() => Set.has(v) ? v : default)` validation wrapper — NOT cast-only. |
| D5 | Add `export { _setMount, _setSignal }` to `packages/runtime/src/index.ts`. |
| D6 | `extract_script_body` in emit.rs replaced with import-span state machine. |
| D7 | `CompileError` struct extended with `code/hint/fix` fields + `#[derive(Default)]`. |
| D8 | Rust `#[cfg(test)]` inline in new `contract.rs` (~25 test cases). |
| D11 | Action inputs = component inputs. `agent-manifest.json`: `{ tools: [{ name, inputs, actions }] }`. |
| D12 | `emit()` returns `EmitResult { js, manifest_json }` — single `ContractAst` pass, no drift. |
| TODO-DX | `.github/workflows/release.yml` (mac-arm64/x64, linux-x64, windows-x64) PROMOTED to Phase 1-DX scope. |

---

## Implementation Lanes

| Lane | Owner | Depends on | Files |
|------|-------|-----------|-------|
| A | Builder A (Rust) | nothing | sfc.rs, types.rs, contract.rs (new), emit.rs, main.rs, integration.rs (new) |
| B | Builder B (TypeScript) | nothing | runtime/src/index.ts, agent/src/registry.ts, agent/tests/registry.test.ts |
| C | Builder C (DX artifacts) | Lane A binary | examples/, docs/, editors/vscode/ |
| D | Builder D (CI binaries) | Lane A binary | .github/workflows/release.yml, compiler/js/index.ts |

Lanes A and B are fully independent — dispatch in parallel. Lanes C and D block on Lane A.

---

## Acceptance Criteria Summary

### Lane A — Rust compiler
- `<contract>` block parsed into `Vec<ContractItem>` via new `contract.rs` module
- `ScribeSource.contract: Option<&str>` field populated by sfc.rs
- `CompileError` has `code/hint/fix` fields + `#[derive(Default)]`
- `emit()` returns `EmitResult { js: String, manifest_json: String }`
- Options form emitted when contract present: `defineComponent({ attrs: [...] as const, setup(ctx) })`
- Contract bindings prepended before developer script body
- Type coercions: string→destructure, number→`computed(Number(...))`, boolean→`computed(==='true')`, enum→Set validation wrapper
- `agent-manifest.json` shape: `{ tools: [{ name, inputs, actions }] }`
- `main.rs` writes `manifest_json` to disk; `--json-errors` flag works
- `packages/compiler/tests/integration.rs`: counter.scribe regression + airtime-quote E2E
- 3 CRITICAL regressions must pass: counter.scribe still compiles, no-contract files use function form, defineComponent function-form path works

### Lane B — TypeScript
- `packages/runtime/src/index.ts`: `export { _setMount, _setSignal }` added
- `packages/agent/src/registry.ts`: `InputSchema`/`ActionSchema` interfaces added; `actions` type updated
- 3 new tests in `registry.test.ts` (InputSchema, ActionSchema, state round-trips)
- Smoke test: `import { _setMount, _setSignal } from '@scribe/runtime'` resolves from package path

### Lane C — DX
- `examples/airtime-quote/airtime-quote.scribe` (canonical public example)
- `examples/scripture-reference/scripture-reference.scribe` (Fellwork dogfood)
- `docs/grammar.md` with full BNF + null/missing behavior table
- `docs/tthw-log.md`
- `editors/vscode/` with TextMate grammar + snippets
- MIT `LICENSE` at repo root + `"license": "MIT"` in package.json

### Lane D — CI
- `.github/workflows/release.yml` cross-compiles for mac-arm64/x64, linux-x64, windows-x64
- `packages/compiler/js/index.ts` postinstall downloads binary from releases
- Trigger: `push: tags: ['v*']`

---

## Do-Not-Break List

| Gate | Constraint |
|------|-----------|
| All existing 320 tests | `bun run test` must stay green |
| `counter.scribe` | Must still compile to function form (no contract = no options form) |
| `@scribe/runtime` bundle | ≤ 1024 B gz (currently 630 B gz) |
| `@scribe/arbor` bundle | ≤ 2200 B gz (currently 2117 B gz) |
| `@scribe/signals` bundle | ≤ 1850 B gz |
| `@scribe/agent` bundle | ≤ 100 B gz |
| `packages/signals/src/` | Read-only |
| `packages/arbor/src/` | Read-only |
| defineComponent function form | Must still work unchanged (RC-1 is options form ADDITION, not replacement) |

---

## Round Log

| Round | Date | What happened |
|-------|------|---------------|
| 0 | 2026-05-01 | Track created. Eng review complete. 0 unresolved decisions. Awaiting Topic Director + Scout + Builders. |

---

## Current Phase

**Round 0 — Track bootstrapped. Awaiting Topic Director direction and Scout baseline.**

Next: Dispatch Topic Director → Scout + parallel Builder A + Builder B.
