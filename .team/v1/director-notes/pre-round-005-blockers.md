# Director Note — Pre-Round-5 Blockers
**Date:** 2026-05-01

---

## § Assessment: what actually blocks Round 5

Round 5 has two candidate plans: **Plan 1.3 (Scoped Styles)** and **Plan 1.4 (Slots)**. Each has a distinct blocker profile.

| Plan | True gate | Explanation |
|------|-----------|-------------|
| 1.3 (Scoped Styles) | Blocker 3 (compiler cleanup) | 1.3 is compiler-adjacent; dispatching a Builder against it before the compiler track has its BTreeMap cleanup, Vite investigation, and topic summary closed creates an information gap. The Builder will need to reference the compiler track's canonical knowledge doc. Not a hard dependency, but a real quality risk. |
| 1.4 (Slots) | Blocker 2 (arbor headroom) | 1.4 is explicitly arbor-touching. 49 B headroom is not enough to add slot infrastructure without either a cap decision or a reclaim. This is a hard gate: a Builder dispatched without headroom will fail the size check on first commit. |

**Blocker 1 (size-limit CLI)** is a tooling gate that affects every PR. `bun run build` still validates budgets via raw `gzip -c`, so this is not a correctness blocker, but it is a developer-experience blocker and must be closed before new plan work starts — otherwise every Verifier pass is manual.

**Blocker 4 (Track C bench)** is a hardware-blocked conditional. It does NOT gate 1.3 or 1.4. It can be surfaced to the user for a future Linux/macOS run and noted in the state file; no agent work is required.

**Summary:**
- Blocker 1: true gate (tooling) — fix first, unblocks clean CI
- Blocker 2: true gate for 1.4, investigation-first — cannot dispatch Builder until recommendation is made
- Blocker 3: true gate for 1.3 (quality) — compiler track must produce its summary doc before 1.3 Builder dispatch; BTreeMap + Vite investigation are within-track cleanup, not cross-track
- Blocker 4: not a Round 5 gate — surface to user, no agent action possible on Windows

---

## § Priority order

1. **Blocker 1 — size-limit fix** (Builder, ~30 min)
   Rationale: Mechanical, low-risk, unblocks clean CI for all subsequent work. The fix is a single-entry config change — `"ignore"` key in `.size-limit.json`. Must land before any Verifier runs a full pass.

2. **Blocker 3 — compiler cleanup** (Builder, can run in parallel with Blocker 2 investigation)
   Rationale: BTreeMap + summary doc are self-contained within `packages/compiler/`. The Vite investigation is bounded. None of this touches live TS packages. Can be dispatched immediately after Blocker 1 lands, or in parallel with the Blocker 2 investigation.

3. **Blocker 2 — arbor bundle investigation** (Investigator, produces a recommendation)
   Rationale: Investigation must precede any cap-raise or reclaim decision. No Builder should touch arbor until this report exists. Can run in parallel with Blocker 3 once Blocker 1 is resolved.

4. **Blocker 4 — Track C bench** (no agent action; surface to user)
   Rationale: Hardware-blocked. Noted for next Linux/macOS session.

---

## § Operating mode per track

| Track | Mode | Rationale |
|-------|------|-----------|
| size-limit fix | Mode 2 (Build/refactor) | Single-file config change; no investigation needed |
| arbor (Blocker 2) | Mode 1 (Investigate) | Must produce evidence before a Builder is dispatched |
| compiler (Blocker 3) | Mode 2 (Build/refactor) | Three bounded cleanup tasks; scope is known |
| Track C bench (Blocker 4) | No agent dispatch | Hardware-blocked; user notification only |

---

## § Researcher briefs

### Brief A: size-limit fix (Builder)

**Context:** `npx size-limit` exits with code 1 because size-limit's internal esbuild pass cannot resolve `@aihu/signals` and `@aihu/context` when evaluating `@aihu/data`'s bundle. These are peer dependencies of `@aihu/data`, not dependencies of the workspace root, so size-limit's automatic peer-ignore logic (which reads `peerDependencies` from the root `package.json`) does not pick them up.

**Root cause confirmed:** `node_modules/size-limit/get-config.js` lines 188–190 show that size-limit reads `peerDependencies` from the *root* `package.json` and auto-populates `check.ignore`. The workspace root has no `peerDependencies`, so none are excluded. The `@aihu/data` entry needs an explicit `"ignore"` field.

**The fix (one operation):**

File: `.size-limit.json`

Add `"ignore": ["@aihu/signals", "@aihu/context"]` to the `@aihu/data` entry only. Do not add it to other entries — those packages bundle their deps correctly already.

Result:
```json
{
  "name": "@aihu/data",
  "path": "packages/data/dist/index.js",
  "limit": "750 B",
  "gzip": true,
  "ignore": ["@aihu/signals", "@aihu/context"]
}
```

**Acceptance criteria:**
- `npx size-limit` exits 0 with no `Could not resolve` errors
- All 6 entries report their sizes and PASS (or, if `@aihu/data`'s dist is not yet built, the entry is skipped gracefully — the error being fixed is the resolution failure, not the size measurement)
- No other entries in `.size-limit.json` are changed
- `bun run build` still passes (it uses raw gzip; should be unaffected)

**Risk:** None. `"ignore"` is a documented per-entry option for the `@size-limit/esbuild` plugin (confirmed via source at `node_modules/size-limit/get-config.js` OPTIONS map, line 22). Installed version is size-limit 11.2.0.

---

### Brief B: arbor bundle investigation (Investigator)

**Context:** `@aihu/arbor` is at 2151 B gz against a 2200 B cap — 49 B headroom. Plan 1.4 (Slots) is the next arbor-touching plan. Before a Builder is dispatched for 1.4, we need a clear accounting of what's in the bundle and a recommendation: raise the cap, reclaim bytes, or defer 1.4.

**What to measure:**

1. **Bundle composition breakdown.** Arbor bundles signals — the dist does NOT externalize `@aihu/signals`. Measure what fraction of the 2151 B is signal code vs. arbor-native code. Method: compare `gzip -c packages/signals/dist/index.js | wc -c` (1732 B) vs. the overlap in the arbor bundle. Note that bundled + minified signals may compress differently when combined with arbor code. The Investigator should estimate signal contribution by temporarily externalizing signals in the rolldown config (for measurement only, not for ship) and noting the before/after.

2. **Per-module cost in the arbor bundle.** Identify the top contributors by logical module (structural.ts is the largest source at 160 lines; mount.ts is 235 lines). Use rolldown's bundle analysis output or inspect the minified dist directly to estimate which logical blocks take the most bytes.

3. **Plan 1.4 (Slots) estimated cost.** The Architect spec (`spec-track-a-architect-round-001.md` §2.7) estimated Plan 1.1 would add ~575 B gz — the actual was higher due to signals bundling spillover from 6.2-P1. Provide a preliminary estimate of what minimal slot infrastructure (a `slot()` primitive and slot resolution in `materialize.ts`) would cost in the current bundle. Conservative estimates are acceptable.

4. **Cap history context.** The cap was 1750 B before 6.2-P1 (signals growth); it was raised to 2200 B after Plan 1.1 landed (structural.ts + signals spillover combined). Document this lineage.

**Output document:** `.team/v1/arbor-bundle-investigation.md`

Contents must include:
- Current measurement: 2151 B gz / 2200 B cap / 49 B headroom (confirmed)
- Bundle composition: estimated signal contribution vs. arbor-native bytes
- Top-3 byte consumers in arbor-native code, with rough byte counts
- Slot cost estimate (range is acceptable: e.g., "150–350 B gz depending on approach")
- Recommendation (one of three): (a) raise cap to N B before dispatching Builder; (b) reclaim N bytes from [specific function/module] before dispatching Builder; (c) defer Plan 1.4 to post-v1 and proceed with 1.3 first
- Confidence level for the recommendation

**Acceptance criteria:**
- Document exists at `.team/v1/arbor-bundle-investigation.md`
- All four measurement categories addressed
- A single clear recommendation made with supporting evidence
- No code changes (this is investigation only)

---

### Brief C: compiler cleanup (Builder)

**Context:** The compiler track (Phases C-0 through C-4) is feature-complete and merged. Three cleanup items remain from the Session 6 Next Actions in `.team/compiler/state-compiler.md`:

**Item 1 — BTreeMap (low-risk Rust change):**

File: `packages/compiler/src/codegen/signals.rs`

Change `SignalMap`'s internal `HashMap<String, String>` to `BTreeMap<String, String>`. BTreeMap provides sorted iteration order, eliminating snapshot ordering non-determinism permanently. This is the reason `packages/compiler/tests/snapshots/` has had ordering flaps in previous sessions.

Steps:
1. In `signals.rs`, replace `use std::collections::HashMap` with `use std::collections::BTreeMap`.
2. Replace the `HashMap::new()` call (or equivalent) inside `SignalMap`'s constructor with `BTreeMap::new()`.
3. Run `cargo test -p aihu-compiler` — some snapshot files will now have a different (sorted) key order. Re-accept changed snapshots with `cargo insta review` or `UPDATE_EXPECT=1 cargo test`.
4. Confirm all 32+ tests still pass and no new failures are introduced.
5. Commit with message: `refactor(compiler): use BTreeMap for SignalMap — deterministic snapshot order`.

**Item 2 — Vite/Bun integration investigation:**

`bun vite build` in `packages/compiler/fixtures/vite-counter/` fails because Bun+Rollup4 does not properly invoke `aihuCompilerPlugin()`. The `bun run integrate.ts` path works correctly (it calls `transform()` directly). Acceptance criteria C4-6 (`bun vite build` → valid `dist/`) is listed as PASS in the verification report but may be based on the working `integrate.ts` path.

Steps:
1. Run `bun vite build` in `packages/compiler/fixtures/vite-counter/` and capture the exact error.
2. Determine whether the failure is: (a) a Bun+ESM module interop issue with the `aihuCompilerPlugin()` Vite hook, (b) a Rollup4 plugin API incompatibility, or (c) a path/resolution issue.
3. If fixable with ≤ 10 lines of change: fix it and note the change.
4. If not fixable without significant rework: document the limitation clearly in `packages/compiler/js/index.ts` JSDoc and in `@aihu/compiler`'s README section of the package.json or a `KNOWN_ISSUES` comment block. Do not silently leave C4-6 in a broken state.
5. Update `.team/compiler/state-compiler.md` with the outcome.

**Item 3 — Compiler topic summary:**

Write `.team/compiler/summaries/compiler-summary.md`. The summaries directory already exists (empty). This is the living knowledge document for the compiler track.

The summary should cover (approximately 400–700 words):
- What the compiler does: SFC → TypeScript pipeline (C-0 through C-4)
- Architecture in one paragraph: Rust binary + npm JS bridge, key types (`AihuSource`, `CompileUnit`, `SignalMap`, `TemplateNode`), canonical emit form
- Key decisions made and why (OQ-C9 emit pattern, OQ-C3 signal naming, OQ-C7 scoped styles warn-and-ignore, OQ-C16 HashMap → now BTreeMap)
- Known limitations: source maps deferred (OQ-C8), conditionals/lists compile error, `bun vite build` status (per Item 2 outcome)
- What a future engineer needs to know before touching this code

**Acceptance criteria for Brief C overall:**
- `cargo test -p aihu-compiler` exits 0 with all tests passing (post BTreeMap change)
- All updated snapshots re-accepted and committed
- Vite investigation documented (fixed or known-limitation note in place)
- `.team/compiler/summaries/compiler-summary.md` exists with all five sections above
- `.team/compiler/state-compiler.md` Next Actions updated to reflect completed items

---

### Brief D: Track C bench (no agent dispatch)

**Status:** 6.2-P1 (Option D) is at CONDITIONAL PASS. Correctness is fully verified. Performance is unverified because Windows bench is unreliable for this workload.

**What the team cannot do on Windows:** Run a valid `bun run bench` pass for the `deep-propagation-100` workload. Target is ≤ ~2.45 µs p50 (≥25% improvement over Phase 0's 3.27 µs p50). All no-regression gates must also be re-confirmed on reference hardware.

**What surfaces to the user:**
> Track C signals optimization (6.2-P1) is at CONDITIONAL PASS. To close this track, a Linux or macOS machine must run `bun run bench` at the repo root. The target is ≤ 2.45 µs p50 on `deep-propagation-100`. If the target is met, update `.team/v1/state-track-c.md` plan 6.2-P1 status from CONDITIONAL PASS to PASS. If missed, open a Phase 2 investigation. This does not gate Round 5.

**What should be written to state file now:** No change needed until hardware is available. State file already records the conditional status accurately.

---

## § Parallel-safety assessment

| Brief | Can run in parallel with | Notes |
|-------|--------------------------|-------|
| A (size-limit fix) | Nothing — run first | Must land before CI validity is confirmed for any other brief |
| B (arbor investigation) | C (compiler cleanup) | Neither touches arbor source; fully independent once A is done |
| C (compiler cleanup) | B (arbor investigation) | Compiler track is read-only to all other packages; no conflict |
| D (Track C bench) | N/A | No agent dispatch; user surface only |

**Branch strategy:**
- Brief A: direct commit to main (single-line config change, no code risk)
- Brief B: investigation only, output is a `.md` document — can commit directly to main
- Brief C: compiler work should run on a branch (e.g., `chore/compiler-session-6-cleanup`) due to snapshot re-acceptance; merge to main via PR after `cargo test` passes

---

## § Surface-to-user triggers

1. **Blocker 4 (Track C bench):** User needs a Linux or macOS machine to run `bun run bench`. No agent can resolve this. Recommend surfacing now: *"6.2-P1 bench validation requires Linux/macOS. When you have access to that hardware, run `bun run bench` and update state-track-c.md with the result."*

2. **Blocker 2 outcome — cap-raise decision:** After the arbor investigation report is delivered, the Director (or user) must make the final call on whether to raise the cap, reclaim bytes, or defer Plan 1.4. The Investigator's recommendation is advisory; the decision is human-owned because it sets a budget contract that will affect future plans.

3. **Plan scope decision for Round 5:** Once Blockers 1, 2, and 3 are resolved, the Director must explicitly choose whether Round 5 dispatches Plan 1.3 (Scoped Styles) first, Plan 1.4 (Slots) first, or both in parallel. That decision should be a separate Round 005 director note referencing the arbor investigation report.
