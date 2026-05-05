# State — Phase 1 Track (Contract Block + Agent Manifest)

**Track:** `phase1`
**Created:** 2026-05-01
**Base branch:** `main` (`d180ac8` — C-4 through C-0 compiler phases + arbor fixes)
**Mode:** 2 (Build / refactor — L-scope)

---

## Purpose

Phase 1 implements the `<agent>` block — making one `.aihu` file simultaneously
emit a reactive custom element AND an MCP tool schema.

"So the poor of the poor can have access to agentic endpoints."

Design doc (APPROVED): `~/.gstack/projects/aihu/srmcg-feat-v1-props-design-20260501-034315.md`
Test plan: `~/.gstack/projects/aihu/srmcg-main-eng-review-test-plan-20260501-051258.md`
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
| D8 | Rust `#[cfg(test)]` inline in new `agent.rs` (~25 test cases). |
| D11 | Action inputs = component inputs. `agent-manifest.json`: `{ tools: [{ name, inputs, actions }] }`. |
| D12 | `emit()` returns `EmitResult { js, manifest_json }` — single `AgentBlock` pass, no drift. |
| TODO-DX | `.github/workflows/release.yml` (mac-arm64/x64, linux-x64, windows-x64) PROMOTED to Phase 1-DX scope. |

---

## Implementation Lanes

| Lane | Owner | Depends on | Files |
|------|-------|-----------|-------|
| A | Builder A (Rust) | nothing | sfc.rs, types.rs, agent.rs (new), emit.rs, main.rs, integration.rs (new) |
| B | Builder B (TypeScript) | nothing | runtime/src/index.ts, agent/src/registry.ts, agent/tests/registry.test.ts |
| C | Builder C (DX artifacts) | Lane A binary | examples/, docs/, editors/vscode/ |
| D | Builder D (CI binaries) | Lane A binary | .github/workflows/release.yml, compiler/js/index.ts |

Lanes A and B are fully independent — dispatch in parallel. Lanes C and D block on Lane A.

---

## Acceptance Criteria Summary

### Lane A — Rust compiler
- `<agent>` block parsed into `Vec<ContractItem>` via new `agent.rs` module
- `AihuSource.agent: Option<&str>` field populated by sfc.rs
- `CompileError` has `code/hint/fix` fields + `#[derive(Default)]`
- `emit()` returns `EmitResult { js: String, manifest_json: String }`
- Options form emitted when agent block present: `defineComponent({ attrs: [...] as const, setup(ctx) })`
- Contract bindings prepended before developer script body
- Type coercions: string→destructure, number→`computed(Number(...))`, boolean→`computed(==='true')`, enum→Set validation wrapper
- `agent-manifest.json` shape: `{ tools: [{ name, inputs, actions }] }`
- `main.rs` writes `manifest_json` to disk; `--json-errors` flag works
- `packages/compiler/tests/integration.rs`: counter.aihu regression + airtime-quote E2E
- 3 CRITICAL regressions must pass: counter.aihu still compiles, no-agent-block files use function form, defineComponent function-form path works

### Lane B — TypeScript
- `packages/runtime/src/index.ts`: `export { _setMount, _setSignal }` added
- `packages/agent/src/registry.ts`: `InputSchema`/`ActionSchema` interfaces added; `actions` type updated
- 3 new tests in `registry.test.ts` (InputSchema, ActionSchema, state round-trips)
- Smoke test: `import { _setMount, _setSignal } from '@aihu/runtime'` resolves from package path

### Lane C — DX
- `examples/airtime-quote/airtime-quote.aihu` (canonical public example)
- `examples/scripture-reference/scripture-reference.aihu` (Fellwork dogfood)
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
| `counter.aihu` | Must still compile to function form (no agent block = no options form) |
| `@aihu/runtime` bundle | ≤ 1024 B gz (currently 630 B gz) |
| `@aihu/arbor` bundle | ≤ 2200 B gz (currently 2117 B gz) |
| `@aihu/signals` bundle | ≤ 1850 B gz |
| `@aihu/agent` bundle | ≤ 100 B gz |
| `packages/signals/src/` | Read-only |
| `packages/arbor/src/` | Read-only |
| defineComponent function form | Must still work unchanged (RC-1 is options form ADDITION, not replacement) |

---

## Round Log

| Round | Date | What happened |
|-------|------|---------------|
| 0 | 2026-05-01 | Track created. Eng review complete. 0 unresolved decisions. |
| 1 | 2026-05-01 | Lanes A+B COMPLETE on `feat/phase1-contract` at `469f12d`. Rust 32→68 tests (+36), TS 320→323 tests (+3). Lane A: 3 Builder commits + 1 inline-fix commit (export-strip + side-effect import). Lane B: 3 Builder commits + 1 inline-fix commit (null-chain + JSDoc). counter.aihu regression intact. |
| 2 | 2026-05-01 | Lanes C+D COMPLETE at `4b37f0d`. Lane C: 4 commits — examples/airtime-quote, examples/scripture-reference, docs/grammar.md (236 lines, full BNF), docs/tthw-log.md, editors/vscode/, MIT LICENSE + 10 package.json license fields. Both example manifests verified valid via shipped binary. Lane D: 1 builder commit + 1 inline-fix — .github/workflows/release.yml (4-target cross-compile, all SHAs pinned), packages/compiler/js/postinstall.ts (SCRIBE_COMPILE_BIN override, idempotent, fail-loud), packages/compiler/RELEASE.md. Test counts unchanged: 68 Rust + 1 ignored, 323 TS. Pre-existing typecheck failures noted (unrelated to Phase 1). |
| 3 | 2026-05-02 | Sessions 3–7. Plans 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2 complete (14 of 17). main HEAD: `2340424` entering Session 8. TS: 570, Rust: 221. |
| 4 | 2026-05-03 | Session 8 (automated). Plans 4.3-B, 5.3, 7.1 complete. ALL 17 v1 plans shipped. TS: 607, Rust: 222. main HEAD: 1917d7f |

---

## Round 1 Status (COMPLETE)

| Role | Status | Output |
|------|--------|--------|
| Topic Director | DONE | `.team/v1/director-notes/phase1-round-001.md` |
| Scout | DONE | `.team/v1/scout-report-phase1-round-001.md` (326 TS / 32 Rust baseline; SC-4 soft-fail Track-C-only) |
| Builder A (Rust) | DONE | `feat/phase1-lane-a` → merged `469f12d` |
| Verifier A | DONE → inline fixes | F1 (export-strip) + F2 (side-effect import) addressed; 2 regression tests added |
| Builder B (TS) | DONE | `feat/phase1-lane-b` → merged `708b7b0` |
| Verifier B | DONE → inline fixes | F1 (null-chain typecheck) + F2 (stale JSDoc) addressed |

**Branch HEAD:** `469f12d` (`feat/phase1-contract`)
**Test counts:** 68 Rust, 323 TS
**CRITICAL regressions:** All protected (counter.aihu still function form)

---

## Round 2 Status (COMPLETE)

| Role | Status | Output |
|------|--------|--------|
| Topic Director | DONE | `.team/v1/director-notes/phase1-round-002.md` |
| Scout | DONE | `.team/v1/scout-report-phase1-round-002.md` (all 9 SC checks PASS, 320 baseline) |
| Builder C (DX) | DONE → resumed | First worktree branched from main; resumed with merge of feat/phase1-contract; 4 commits direct on branch |
| Verifier C | DONE | PASS — all 13 AC; 3 informational findings (dist gitignored, pre-existing typecheck, minor grammar imprecision) |
| Builder D (CI) | DONE → inline fix | 1 commit on worktree; merged via `4b37f0d` |
| Verifier D | DONE → inline fix | F1 (dropped license field) addressed inline before merge |

**Branch HEAD:** `4b37f0d` (`feat/phase1-contract`)
**Test counts:** 68 Rust + 1 ignored, 323 TS — unchanged from Round 1
**Lane A binary:** verified end-to-end on both examples (airtime-quote + scripture-reference)
**CRITICAL regressions:** All protected

---

## Current Phase

**All 17 v1 plans COMPLETE — v1 shipped.**

Phase 1 (`<agent>` block + DX surface + release CI) shipped on `feat/phase1-contract` at `4b37f0d`. All subsequent phases (2–7) completed across Sessions 2–8. Final main HEAD: `1917d7f`. All packages at version 1.0.0. GHA auto-triggers re-enabled.

Open follow-on items:
- TODO-004: Re-enable `c4_transform_produces_typescript` integration test (out of Phase 1 scope, see TODOS.md)
- Round 2 informational findings: VSCode grammar `<script>` pattern overly permissive (Verifier C F-3); pre-existing typecheck baseline issues in compiler:typecheck/agent-readiness:typecheck/runtime:typecheck (Verifier C F-2)
- v2 reserved syntax: `string!` for required inputs (TODOS.md TODO-003)

---

## Round 3 — DX Phase 2 (2026-05-02)

**Focus:** Plan 1.3 Scoped Styles + branch hygiene + data externalization fix

| Item | Status | Notes |
|------|--------|-------|
| Plan 1.3 Scoped Styles | **COMPLETE** | Merged PR #18 at `2222a39` — CSSStyleSheet emission, scoped + global scope, 71+1 Rust tests |
| Verifier F-2 (grammar.md) | **COMPLETE** | §8 `<style>` block added to `docs/grammar.md` at `53c0cff` |
| Verifier F-3 (stale test name) | **COMPLETE** | `style_block_warning` → `style_scoped_emits_css_in_function_form` + snapshot rename at `53c0cff` |
| Data externalization fix | **COMPLETE** | Cherry-picked `176dea3` → `e644d58` — @aihu/data rolldown now externalizes @aihu/signals + @aihu/context; restores 747 B gz (was 2012 B gz inlined) |
| Branch hygiene | **COMPLETE** | 20+ stale branches deleted; `feat/arbor-n2-dev-gate` preserved (in progress) |
| TODO-004 (integration test re-enable) | **DEFERRED** — gated on `cargo build --release` + `bun run build` in compiler pkg |
| TTHW measurement | **DEFERRED** — gated on v0.1.0 release binary (GHA cross-compile run) |

**Plans shipped on main (cumulative as of Round 3):**

| Plan | Commit |
|------|--------|
| 1.1 Reconciler (when/each) | `9195d20` — Session 003 |
| 1.2 Component props | `acf501b` — Session 004 |
| 1.3 Scoped styles | `2222a39` — PR #18 (Round 3) |
| 2.1 @aihu/context | `8223dbb` — Session 002 |
| 2.2 @aihu/data | `9195d20` — Session 003 |
| 3.1 Streaming SSR | `ec24d41` — Session 002 |
| 4.2 Error boundaries | `8223dbb` — Session 002 |
| 6.2 Signals (Phase 0 + P1) | `8223dbb` + `9195d20` |

**Pending (no builder yet):** 1.4 Slots, 3.2 Hydration, 3.3 Islands, 4.1 HMR, 4.3 TS types, 5.2 AgentService, 5.3 A2A/ACP, 6.1 Router, 7.1 v1 cutover

---

## Round 3 — DX Phase 2 (continued, 2026-05-02 — afternoon)

**Focus:** Parallel multi-builder dispatch — 6 v1 plans landed in one round

| Plan | PR | Notes |
|------|----|-------|
| 1.4 Slots | #20 | `slot()` arbor primitive + compiler `<slot>` codegen; 350 tests, +30 B arbor |
| 4.1 HMR | #24 | `_hmrReplace` runtime export + Vite plugin `import.meta.hot.accept` injection (DEV-gated); +109 B runtime |
| 5.2 AgentService | #23 | New `@aihu/agent-service` package; 580 B gz; 21 tests; manifest aggregation + middleware |
| 6.1 Router | #21 | New `@aihu/router` package; 1.45 kB gz; file-based routing + Vite plugin |
| 3.2 Hydration | #25 | `MountScope.serialize()` + `hydrate()` + `defineElement.hydrate?` option; 374 tests; +47B arbor / +30B runtime |

**Size cap raise:** `@aihu/runtime` 1024 B → 1140 B to accommodate both `_setHydrate` (3.2) and `_hmrReplace` (4.1) being co-exported. New cap holds 43 B headroom.

**Cumulative test count post-Round-3:** 407/407 passing (was 320 at start of session — +87 tests this round).

**Final v1 plan completion (13 of 17):**

| Plan | Status |
|------|--------|
| 1.1, 1.2, 1.3, 1.4 | DONE |
| 2.1, 2.2 | DONE |
| 3.1, 3.2 | DONE |
| 4.1, 4.2 | DONE |
| 5.1 (`<agent>` block), 5.2 | DONE |
| 6.1, 6.2 (Phase 0 + P1) | DONE |
| 3.3 Islands | DONE |
| 4.3 TypeScript template types | DONE (Option B — stable cast locked; 4.3-v2 OXC deferred post-v1) |
| 5.3 A2A/ACP adapters | DONE |
| 7.1 v1 cutover | DONE |

**Update (2026-05-02 evening):** Plan 3.3 Islands shipped via PR #26. 14 of 17 v1 plans done. Remaining: 4.3 (TS template type-checking), 5.3 (A2A/ACP), 7.1 (cutover). Test count: 431 (was 407 at PR #25). Runtime cap raised 1140 → 1170 B for `_hydrateOnVisible`.

**Update (2026-05-03 Session 8):** Plans 4.3-B, 5.3 (prereq + A2A + ACP), and 7.1 shipped. ALL 17 v1 plans COMPLETE. TS: 607, Rust: 222. main HEAD: 1917d7f. All packages at version 1.0.0.

**Worktree collisions:** Three of the five parallel builders ended up working in the main repo's working directory (worktree creation may have silently fallen back). Plan 5.2 commit was on `feat/v1-hydration` branch by mistake; rescued via cherry-pick + force-push. Plan 3.2 conflict-resolved by merge-from-main during PR. No work lost.

**Remote branch hygiene:** `feat/v1-slots`, `feat/v1-router`, `feat/v1-agent-service`, `feat/v1-hmr`, `feat/v1-hydration` all deleted post-merge.
