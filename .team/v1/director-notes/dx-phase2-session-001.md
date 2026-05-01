# Director Note — DX Phase 2 Session 001
**Date:** 2026-05-01
**Track:** DX Phase 2

---

## Session scope

This session resolves the pending Track C Round 7 surface-to-user call, then dispatches the first concrete DX Phase 2 deliverables — TTHW measurement, TODO-004 re-enablement, and Plan 1.3 (Scoped Styles) as the primary feature advance.

---

## Todos assessment

### TODO-001 — GitHub Actions release workflow

**In scope: PARTIAL (operational verification only).** The workflow file shipped in Phase 1 Lane D. What remains is confirming the `v0.1.0` release run produced binary assets and that `postinstall.ts` succeeds on a clean machine. This is Builder D's TTHW measurement prerequisite.

**Priority:** LOW as code task; MEDIUM as DX validation gate.

### TODO-002 — `batch()` wrapping for initial attribute parsing

**In scope: NO.** Requires a 10-input benchmark harness that does not exist yet. Defer until the first 10+-input `.scribe` example exists.

**Priority:** DEFER to Phase 2 performance review.

### TODO-003 — `string!` required-attribute syntax

**In scope: NO.** Grammar is Phase 1 STABLE. `docs/grammar.md` §8 already reserves the syntax. Defer to v2 scope.

**Priority:** DEFER to v2.

### TODO-004 — Re-enable `c4_transform_produces_typescript` integration test

**In scope: YES.** Most actionable single-file TODO. Preconditions (binary, compiler dist) are now satisfiable post-Phase-1. Highest-priority todo item.

**Priority:** HIGH — smallest unit of work with clearest acceptance criterion.

---

## Track C Round 7 resolution

**Recommendation: PATH X. Ship Phase 3.**

EV math from track-c-round-007.md: scribe ranks #1 on all three load-bearing workloads (cellx, batched-writes, dynamic-deps). Memory over-delivered 2× (1.62 KB vs 3.4 KB forecast). Bundle net-improved. The remaining 0.97 µs gap to alien on deep-prop-100 is structural — forward-subscription vs push-pull with version counters — and is v2-scope per the original Phase 2 scope rules.

Path Y (H4-tactical): 35% hard-pass odds, 50% soft-pass odds. The H4-tactical spec file is missing on disk, which would add a full Investigator + Architect cycle before Builder. ~3 research cycles for a coin-flip result.

Path Z (new hypothesis): 2–3 research cycles on V8 IC polymorphism / markStack hypotheses with lower confidence than Path Y.

**Path X actions (Team Lead to execute if user confirms):**
1. Update `spec-6.2-phase3.md` §10.2 to read "3-run-mean p50" per Verifier §10 #6
2. Update `state-track-c.md` Phase 3 row to COMPLETE
3. Merge stash `Track C Phase 3 WIP` / `feat/v1-signals-6.2-phase3-closures` to main

---

## DX Phase 2 definition

DX Phase 2 is COMPLETE when:

1. **TTHW_UI measured.** `docs/tthw-log.md` has one real measurement row with actual minutes. Gate: Lane D binaries available at `releases/latest/download/scribe-compile-{platform}`.

2. **Plan 1.3 (Scoped Styles) shipped.** `<style>` block in `.scribe` SFCs emits `CSSStyleSheet.replaceSync()` + `shadowRoot.adoptedStyleSheets` wiring. Files: `packages/compiler/src/codegen/emit.rs` (primary), `packages/compiler/src/parser/sfc.rs` (style block extraction), new integration tests, `docs/grammar.md` §9.

3. **TODO-004 re-enabled.** `#[ignore]` removed from `c4_transform_produces_typescript` in `packages/compiler/tests/c4_integration.rs`. Test passes without `--ignored`.

---

## Builder briefs

### Builder A — Track C Path X cleanup (doc-only)

**Scope:** Update spec-language and state file; no source changes.

**Key files:**
- `.team/v1/spec-6.2-phase3.md` — §10.2: add "3-run-mean p50", cite "Verifier §10 #6"
- `.team/v1/state-track-c.md` — Phase 3 row → COMPLETE; add 3-run-mean footnote

**Acceptance criteria:**
- `spec-6.2-phase3.md` §10.2 contains "3-run-mean p50" + "Verifier §10 #6"
- `state-track-c.md` Phase 3 row shows COMPLETE
- `bun run test` count unchanged
- Zero changes outside `.team/v1/`

**Condition:** Only if user confirms Path X.

---

### Builder B — TODO-004 re-enable

**Scope:** Remove `#[ignore]` from `c4_transform_produces_typescript` and verify preconditions.

**Key files:**
- `packages/compiler/tests/c4_integration.rs` — remove `#[ignore]`
- `packages/compiler/fixtures/vite-counter/integrate.ts` — create if absent

**Prerequisite investigation:**
- Confirm `packages/compiler/fixtures/vite-counter/integrate.ts` exists
- Confirm `packages/compiler/dist/index.js` exists (run `bun run build` if absent)
- Confirm release binary exists; if absent, document and surface to Director before committing

**Acceptance criteria:**
- No `#[ignore]` on `c4_transform_produces_typescript`
- `cargo test -- c4_transform_produces_typescript` passes without `--ignored`
- If release binary absent: proposes `#[cfg_attr(..., ignore)]` and surfaces before committing
- `bun run test` 323 TS tests green

---

### Builder C — Plan 1.3 Scoped Styles

**Scope:** `<style>` block parsing + emission in Rust SFC compiler.

**Key files:**
- `packages/compiler/src/parser/sfc.rs` — extract `<style>` block + `scoped`/`global` attr; new `ScribeSource.style: Option<StyleBlock>` field
- `packages/compiler/src/codegen/emit.rs` — emit `CSSStyleSheet.replaceSync()` + `adoptedStyleSheets` in `connectedCallback`
- `packages/compiler/tests/integration.rs` — add ≥2 new tests: `<style scoped>` and `<style global>`
- `docs/grammar.md` — add §9 for `<style>` block BNF

**Acceptance criteria:**
- Existing 68 Rust tests + 1 ignored unchanged; ≥2 new style tests added
- `<style scoped>` → `__style__.replaceSync(` + `adoptedStyleSheets = [__style__]` in JS
- `<style global>` → `document.adoptedStyleSheets` in JS
- No `<style>` → zero `CSSStyleSheet` in JS (regression guard)
- `counter_no_agent_block_regression` still passes
- `bun run test` 323+ TS green
- `bun run build` size-limit passes unchanged

**Sequential gate:** Architect validation pass on current `sfc.rs` + `emit.rs` struct shapes before Builder C starts.

---

### Builder D — TTHW measurement

**Scope:** Measure and record first real TTHW_UI in `docs/tthw-log.md`.

**Prerequisite:** Confirm `v0.1.0` release assets at GitHub Releases download URL from `postinstall.ts`.

**Acceptance criteria:**
- `docs/tthw-log.md` has ≥1 real row with date, setup, numeric TTHW_UI minutes
- If blocked (binaries absent): record blocker row and surface immediately
- Zero source code changes

---

## Lane structure

**Parallel:** Builder A, Builder B, Builder D — zero file overlap.

**Sequential gate:** Architect validation pass on current `packages/compiler/src/parser/sfc.rs` + `packages/compiler/src/codegen/emit.rs` struct shapes required before Builder C starts.

**Dispatch order:**
1. Surface Track C Path X/Y/Z to user (immediate)
2. Dispatch Builder B + Builder D in parallel
3. Dispatch Architect validation for Plan 1.3
4. On Track C confirmation: dispatch Builder A
5. On Architect validation complete: dispatch Builder C

---

## Surface conditions

1. **Track C user response is Path Y or Z** — replace Builder C scope with Track C routing
2. **TODO-001 operational check fails** — binaries absent, TTHW unmeasurable, surface failure verbatim
3. **Builder B cannot re-enable without release binary** — surface options (CI-only flag vs leave `#[ignore]` documented)
4. **Builder C finds breaking struct change to `EmitResult`** — surface before code
5. **Test count drops** — halt all builders, surface immediately
