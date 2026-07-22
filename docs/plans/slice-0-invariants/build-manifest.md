# Slice 0 — build manifest

**Branch:** `ci/thesis-invariants` · **Built:** 2026-07-19 · **Spec:** `docs/plans/slice-0-invariants/architecture-spec.md`
**Resumed from:** `25f2dc3a` (`wip(tooling): slice-0 invariant checks, partial — salvaged from a stopped agent`)

---

## Acceptance, cited verbatim

> "Each invariant fails against the current tree at the counts in the scorecard, then passes as its
> property's slices land. **An invariant that passes on day one is measuring nothing — treat that as
> a defect in the check, not a win.**"
> — `docs/plans/2026-07-19-thesis-conformance.md` §Slice 0

Required: derived **2**, governed **2**, attributed **2**, dual-audience **3**.
Measured: derived **2**, governed **2**, attributed **2**, dual-audience **3**. No check passes with
zero findings; every one is red against the tree and green only against its committed baseline.

---

## What I verified vs what I inherited

The WIP commit's message stated it was unverified. That was accurate, and the split is not what the
commit message predicted — it claimed derived/governed/attributed were "finished" and only
dual-audience was in progress. In fact **two of the four had never executed at all.**

| Artifact | Status | Evidence |
|---|---|---|
| `scripts/lib/invariant.ts` | **Inherited, verified by exercise** | Not modified. Exercised by all four checks; ratchet verified in both directions (below). |
| `scripts/check-derived.ts` | **Inherited, logic unmodified** | Ran correctly on first execution: 2 findings, self-test green. Only change is `biome check --write` import ordering. |
| `scripts/check-attributed.ts` | **Inherited, logic unmodified** | Ran correctly on first execution: 2 findings, 3/3 transports discovered. Only change is biome import ordering + one line wrap. |
| `scripts/check-governed.ts` | **Inherited logic, FIXED to run at all** | Crashed with `Cannot find module '@aihu/signals'` — never produced a number. Probe logic proved sound once resolution was fixed. |
| `scripts/check-dual-audience.ts` | **Inherited, FIXED — logic defect in DA-c** | Crashed on resolution; then its DA-c self-test FAILED. Real bug, corrected. |
| `scripts/check-emit-parses.ts` | **Extended by me** | `resolveNewest` refactor + per-stage gating. |
| fixtures under `scripts/fixtures/check-derived/` | **Inherited, verified by exercise** | Drive derived's self-test (2 cases, both directions). Unmodified. |
| `tsconfig.json` paths addition | **Inherited, verified necessary** | Required for router/agent-service/agent-server resolution. Kept. |

**Nothing was accepted because it was already committed.** The two checks that ran unmodified did so
after being executed and having their trap cases confirmed by hand, not by inspection.

---

## Measured results — real pasted output

Every run below is `bun run check:<name>` with **no `--expect` override**, reading
`docs/plans/slice-0-invariants/baselines.json`. Compiler rebuilt (`cargo build --release --bin
aihu-compile`, binary dated 22:16) and `bun install` run fresh beforehand.

### check:derived — 2 findings (required 2) — exit 0 against baseline

```
check:derived — self-test ok (2 cases, both directions).
check:derived — scanning 82 agent-surface file(s).

check:derived — 2 finding(s):

  packages/plugin-agent-readiness/src/types.ts:30  [D1]  `AgentReadinessConfig` is declared in 2 agent-surface packages with overlapping members — a hand-maintained sync seam. Sites: packages/plugin-agent-readiness/src/types.ts:30, packages/server/src/agent-readiness-config.ts:3. Single-source it; the agent surface must be derived, not mirrored.
  packages/cli/src/index.ts:207  [D2]  hand-authored `skills` array of 3 literal entries — an agent artifact maintained beside the source it should be derived from. Generate it from the compiler-emitted registry/manifest. (inside a scaffold template emitted by this file)

check:derived — 2 finding(s), matching the committed baseline of 2. The property is still violated; the baseline is the ratchet, not a pass.
```

### check:attributed — 2 findings (required 2) — exit 0 against baseline

```
check:attributed — self-test ok (4 cases, both directions).
check:attributed — 3 transports, 3 `handleToolCall` call site(s). Passing: agent-server.

check:attributed — 2 finding(s):

  packages/agent-a2a/src/a2a-adapter.ts:59  [AT]  transport `agent-a2a` reaches `handleToolCall` without a RequestContext (arity 2): no third argument — the call is anonymous by construction. Tier 0 requires every transport to express who is asking, even when the answer is anonymous — the gate downstream has nothing to decide against otherwise.
  packages/agent-acp/src/acp-adapter.ts:57  [AT]  transport `agent-acp` reaches `handleToolCall` without a RequestContext (arity 2): no third argument — the call is anonymous by construction. Tier 0 requires every transport to express who is asking, even when the answer is anonymous — the gate downstream has nothing to decide against otherwise.

check:attributed — 2 finding(s), matching the committed baseline of 2. The property is still violated; the baseline is the ratchet, not a pass.
```

### check:governed — 2 findings (required 2) — exit 0 against baseline

```
check:governed — self-test ok (4 cases, both directions).
check:governed — discrimination ok: $scope denies (401), $rate-limit does not.
check:governed — ran 4 G1 cells and 3 G2 sub-probes.

check:governed — 2 finding(s):

  packages/agent-service/src/agent-service.ts:215  [G1]  $rate-limit declared, rateLimitPlugin absent — GATE DID NOT DENY — the declared control silently no-opped because its plugin is absent, and the action DISPATCHED instead. A control that evaporates with its plugin is not enforcement.
  packages/agent-server/src/agent-server.ts:158  [G2]  bridge handshake is never verified — 3/3 sub-probes were accepted that should have been rejected (invoke with NO hello sent at all; hello with protocol = BRIDGE_PROTOCOL_VERSION + 1; hello with protocol = 'not-a-number'). `handleBridgeFrame`'s `case 'hello'` returns without inspecting `msg.protocol`.
```

The spec's own discrimination requirement is satisfied and printed: `$scope` denies with 401 while
`$rate-limit` does not, **from the same harness**. Had both agreed, the script exits 1 with
`HARNESS BROKEN` rather than reporting a count.

### check:dual-audience — 3 findings (required 3) — exit 0 against baseline

```
check:dual-audience — self-test ok (6 cases, both directions).
check:dual-audience — scanned 196 public-entry source file(s); ran 3 negotiation cells and 1 SSR render.

check:dual-audience — 3 finding(s):

  packages/plugin-agent-readiness/src/content-negotiation.ts:13  [DA-a]  no `MarkdownResolver` IMPLEMENTATION is exported from any package public entry — only the interface declaration, the config field, `dist/*.d.ts` re-exports, and test mocks. A markdown representation cannot be produced in production, so the agent axis has no content to negotiate for. (Test mocks are deliberately not counted: the compliance suites report green because they supply the thing that does not exist.)
  packages/plugin-agent-readiness/src/content-negotiation.ts:49  [DA-b]  content negotiation ignores the user-agent — 2/3 cells wrong (GPTBot, no Accept header; ClaudeBot, no Accept header). The middleware reads `Accept` and nothing else, and only a minority of agent clients send `Accept: text/markdown`. Format selection is supposed to move to the client; for a crawler it never gets the chance.
  packages/router/src/server.ts:41  [DA-c]  primary content is not fully retrievable without JS — no `data-aihu-path` markers — `router/src/server.ts:41` calls `renderToString(component)` with no options, and every marker in `ssr.ts` is gated on `opts?.hydratable ?? false`, so the production path emits non-hydratable output.
```

### Ratchet — verified red in BOTH directions

A one-sided ratchet is the failure the design exists to prevent, so it was exercised, not assumed:

```
$ bun scripts/check-derived.ts --expect 1     # exit=1
check:derived — expected 1, found 2 — a NEW violation was introduced. Fix the source, not the baseline.

$ bun scripts/check-derived.ts --expect 3     # exit=1
check:derived — expected 3, found 2 — a defect appears to have been FIXED. Decrement the baseline in
docs/plans/slice-0-invariants/baselines.json in the same PR as the fix. Do not decrement it without a source change.
```

### Trap cases — confirmed NOT flagged

| Trap | Result |
|---|---|
| `packages/agent-server/src/opaque-id.ts:4` ("Mirrors the compiler's `opaque_member_id`") | Not flagged. Count is 2, not 3. Grepped the output for `opaque` — no match. |
| `packages/primitives/**` "kept in sync" (DOM reflection) | Not flagged; excluded via `GLOBAL_EXCLUDES`. Grepped output for `primitives` — no match. |
| `agent-service.ts:295` (internal re-entry in `asMiddleware`) | Not counted. `check:attributed` reports exactly 3 call sites across 3 transports; grepped output for `agent-service` — no match. |
| DA-a counting test mocks / `dist/*.d.ts` | Not counted — DA-a reports zero implementations despite 9 textual hits, and its should-not-flag fixture proves it still recognizes a genuine exported resolver class. |
| a2a/acp "ANONYMOUS-ONLY is intentional" comments | Ignored entirely. No check in this slice reads suppression comments; both sites are flagged. |

### Zero-input guard

`refuseVacuous` is called by all four before reporting. `check:emit-parses` retains its original
`files.length === 0` guard. No check can report "0 findings" from an empty scan.

---

## check:emit-parses — measured, and the briefed number was wrong

**The dispatch brief stated a baseline of 4 parse / 12 compile. That is incorrect.** Measured against
a freshly built `target/release/aihu-compile`:

```
check:emit-parses — 16/59 component(s) failed (11 compile, 5 parse):
```

**11 compile / 5 parse.** This is not a stale-binary artifact — the binary was rebuilt immediately
before the run, and it is the only candidate present (`packages/compiler/bin/aihu-compile` does not
exist). It also agrees exactly with the script's own long-standing header comment: *"16 fixtures
still fail (11 stale-syntax examples, 5 emitted-JS bugs)"*, and the 11 compile failures line up
one-for-one with track slice **CO3, "Migrate 11 stale examples."** I recorded the measured numbers,
not the briefed ones.

All three modes verified:

```
$ bun scripts/check-emit-parses.ts --expect-parse 5 --expect-compile 11   # exit=0
check:emit-parses — 59 components scanned; 11 compile / 5 parse failure(s), matching the committed baseline. The failures are the ratchet, not a pass.

$ bun scripts/check-emit-parses.ts --expect-parse 4 --expect-compile 11   # exit=1
check:emit-parses — stage counts do not match the committed baseline:
  parse: expected 4, found 5 — 1 NEW failure(s). Fix the source, not the baseline.

$ bun scripts/check-emit-parses.ts                                        # exit=1 (default preserved)
```

Per the brief, `check:emit-parses` is **not** wired into CI here — CO4 owns that.

---

## Files changed

**Added**
- `docs/plans/slice-0-invariants/baselines.json` — measured counts; each entry carries a `reason`
  quoting its scorecard row and a `blockedBy` slice id, plus the ratchet step that retires it.
- `docs/plans/slice-0-invariants/build-manifest.md` — this file.

**Modified**
- `scripts/check-dual-audience.ts` — DA-c fixture + mutation fix (below); header note on required flags.
- `scripts/check-governed.ts` — corrected a header comment describing a resolver mechanism that does not exist.
- `scripts/check-emit-parses.ts` — `resolveNewest` refactor; `--expect-parse` / `--expect-compile`.
- `package.json` — five npm scripts: the four checks plus `check:thesis`.
- `.github/workflows/plan-a.yml` — the four checks in the `check` job, after `typecheck`, before `test`.

**Formatting only** — `scripts/check-derived.ts`, `scripts/check-attributed.ts` (biome import
ordering; no logic change, diffs are import blocks and one line wrap).

**Inherited untouched** — `scripts/lib/invariant.ts`, `scripts/fixtures/check-derived/**`, the
`tsconfig.json` paths addition.

Repo gates: `bunx biome check` clean; `bun run typecheck` 50 tasks, no failures.

---

## The defect that made two checks unverifiable

Both behavioral checks crashed before producing a number:

```
error: Cannot find module '@aihu/signals' from '.../packages/arbor/src/mount.ts'
```

Root cause, established by bisection rather than guessed:

1. Workspace packages are **not** linked into `node_modules` — the install is isolated and
   `node_modules/@aihu` does not exist. Resolution falls to tsconfig `paths`.
2. Bun applies the tsconfig **nearest each file**. The per-package ones (e.g.
   `packages/arbor/tsconfig.json`) declare `paths` but omit `baseUrl`, and bun ignores `paths`
   without it. Verified directly: adding `baseUrl: "."` to that one file made the import resolve;
   the edit was reverted.
3. So the entry's imports resolved while a **transitive** one died one hop in.

**Fix:** the npm scripts run `bun --tsconfig-override ./tsconfig.json`, forcing the root map onto
every file. One flag, no package mutations.

**A worse variant this also closes.** Run bare, outside a tsconfig scope, bun resolves `@aihu/arbor`
to a **published 2.0.0 tarball in `~/.bun/install/cache`** — a behavioral invariant would then
measure someone else's build and report a plausible number. Same class as the stale-binary trap, and
silent. The override pins resolution to workspace `src`.

`AIHU_NATIVE_SKIP=1` is also set on both, selecting the TypeScript SSR fallback ("slower, always
correct") exactly as `vitest.config.ts` does; the native renderer binary is absent in a plain checkout.

### A real logic bug in DA-c

Once running, dual-audience failed its **own self-test** — which is the harness working as designed:

```
check:dual-audience — SELF-TEST FAILED. The check cannot discriminate; its count on the
real tree is meaningless and was not computed.

  DA-c should-not-flag: hydratable output (mutated): expected 0 finding(s), got 1
```

Two defects:

1. The fixture passed a **signal getter** to `leaf`, which accepts `Signal<string> | string`. The
   accessor's source was stringified into the markup, so the primary text was never present:

   ```
   BODY >>> <main id="page"><article>() =&gt; {
       const obs = currentObserver;
       ...
   ```

   Fixed by passing the string directly. Had the self-test not existed, DA-c would still have
   reported "1 finding" on the live tree — **the right number for the wrong reason**, and the count
   would have looked correct in review.

2. The should-not-flag mutation string-patched `data-aihu-path` into the live body. That proves
   nothing: it fakes the output rather than producing it. Replaced with a real
   `renderToString(component, { hydratable: true })` through the same renderer the router uses,
   differing only in the options object the router fails to pass.

The live DA-c finding is unchanged and independently confirmed at source: `router/src/server.ts:41`
calls `renderToString(component)` with no options, and `ssr.ts:229/299` gate every `data-aihu-path`
on `opts?.hydratable ?? false`.

---

## Spec deviations

1. **`resolveNewest` is not a byte-verbatim extraction.** The spec says "extracted verbatim". The
   rule is identical (same candidates, same order, same newest-mtime `reduce`), but the original
   filtered by `existsSync` *before* building its error message, so the "Looked in:" list was
   **always empty** in the only branch that printed it — it could only fire when nothing existed. The
   refactor prints the full candidate list. Behavior on the success path is unchanged; the error path
   is strictly more useful. Flagging it because "verbatim" was the instruction.

2. **DA-c does not render into a shadow-DOM-bearing element.** The spec asks for a fixture "rendering
   known text inside a shadow-DOM-bearing element" and asserting the text sits outside any
   `<template shadowrootmode>`. `packages/server/src/ssr.ts` emits **no** `shadowrootmode` anywhere,
   so that boundary cannot be produced through this path. The assertion is implemented and would fire
   (the check computes `textInShadow`), but is currently vacuous. The live defect — absent hydration
   markers — is real and asserted. Raised rather than papered over: if shadow-root SSR is expected to
   exist, that is a separate finding this check did not make.

3. **`check:emit-parses` baseline differs from the brief** — 11 compile / 5 parse, not 12/4. Measured,
   with the run pasted above.

4. **`scripts/**` is not covered by `bun run typecheck`.** The root tsconfig `include` is
   `packages/*/src`, `packages/*/tests`, `tests/**` — check scripts are outside it, as all pre-existing
   `scripts/check-*.ts` already are. Not changed here: widening `include` affects every package's
   typecheck task and is out of slice scope. Noted so it is a decision rather than an oversight.

5. **`bun --tsconfig-override` prints benign stderr noise** on every governed/dual-audience run:
   `Internal error: directory mismatch for directory ".../tsconfig.json", fd 3. You don't need to do
   anything, but this indicates a bug.` A bun bug, not ours; exit codes are correct. It will appear in
   CI logs.

---

## Open questions — NOT resolved here

Spec open-questions **#3** (does `opaque-id.ts:4` count?) and **#6** (`examples/` discovery) are above
this slice's authority and were left alone. #3 is implemented as specified — must-not-flag — and the
count is 2; if the answer is "it counts", the scorecard row needs amending, not the check.

Raised by this build:

- **Should `check:dual-audience` cover `packages/app/src/prerender.ts:283,382`?** Spec open-question
  #5. Implemented router-only per the scorecard; prerender calls `renderToString` without
  `hydratable` too. If in scope, the baseline is 4, not 3.
- **Is shadow-root SSR expected to exist?** See deviation 2. `ssr.ts` emits no declarative shadow
  root, so the thesis's "content sealed in a shadow boundary" concern is not observable on this path
  at all — which may mean the concern lives entirely client-side, or may mean a gap nobody has filed.
- **Should the `check` job rebuild the compiler before `check:emit-parses` is eventually wired (CO4)?**
  The stale-artifact trap is mtime-based; CI's rust-cache cleans workspace crates so it rebuilds
  today, but that is incidental rather than asserted.
- **Should `bun install` link workspace packages?** The resolution failure above is a symptom of
  `node_modules/@aihu` not existing. Every consumer works around it differently — vitest has a
  25-entry alias map, these checks use `--tsconfig-override`, per-package tsconfigs have partial
  `paths`. That is three parallel maps of the same fact, which is itself the shape `check:derived`
  exists to flag. Out of scope here; worth a decision.

---

## CI wiring

Spec Phase 1, in `plan-a.yml`'s `check` job (`ubuntu-latest`), after `bun run typecheck` and before
the `bun run test` steps:

```yaml
- run: bun run check:derived
- run: bun run check:attributed
- run: bun run check:governed
- run: bun run check:dual-audience
```

The job already carries the `changes` filter the spec asks for (`needs.changes.outputs.code == 'true'`),
so doc-only PRs stay cheap. `check:agent-conformance` is **not** wired — deferred to its own sub-slice,
and per spec Phase 2 it must not be wired until its baseline is measured on a real run.
