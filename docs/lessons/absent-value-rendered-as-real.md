# AN ABSENT VALUE RENDERED AS REAL, FAILING QUIETLY — the pattern behind nearly every defect found on 2026-07-25/26

**Topic:** cross-cutting (bench, release, compiler, CI, docs, agent coordination)
**Session:** 2026-07-25 / 2026-07-26 (the ~20-hour swarm session)
**Category:** measurement-integrity, ci-lint, release-engineering, observability
**Severity:** critical — it is the single most common defect shape in this repo,
recurring **8+ times in one day across unrelated subsystems**
**Status:** named, registered, NOT mechanically prevented

## The shape

> Something that does not exist is rendered as a value. The value is
> well-formed, plausible, and often *flattering*. Nothing errors. The check
> passes. The number gets published.

The failure is never a crash. It is **a zero, an empty string, a default, a
fallback, a skip, or a silence that the surrounding machinery formats as a
result.** A crash would have been a gift.

The general rule this generates:

**An absence must be loud. If your code can produce a value from nothing, it will,
and someone will publish it.**

## Instances — 2026-07-25/26

Each row is a real occurrence with its receipt. They are in different subsystems,
written by different people, months apart. That is the point.

| # | The absence | What it rendered as | Receipt |
|---|---|---|---|
| 1 | A dead binding, doing no work | **`28.63 ns`** published as the `update-1-of-10k-leaves` benchmark result | Real measurement is `252.83 ns`. *"There was never drift to attribute — only the difference between measuring a no-op and measuring the code."* Resolved in #607 (`6e0fbc8e`) |
| 2 | An unbuilt `dist/` | **`"bytes": -1` on all 108 rows** of `scripts/__bundle-sizes.json`, **48 `_no dist_` cells** across README + 17 package READMEs — and `sync-readme --check` **EXIT 0, GREEN** | Green *because* the version step corrupted the README **and** the cache in the same pass, so they agreed. Fixed in #591 (`24c08c33`) |
| 3 | Agent metadata elided from client builds **by design** | **84-byte `dist/llms.txt`** (a title and a tagline, zero tools) and `dist/.well-known/mcp.json` with `tools listed: 0` — for the template whose tagline is *"agent-callable by default"* | `packages/compiler/src/codegen/emit.rs:206` — `let elide_agent = target == BuildTarget::Client && is_agent_component;`. Three tools genuinely exist. **Still open — FEL-423** |
| 4 | A package missing from the hand-maintained `PKGS` array | **A green release job and a 404 on npm** | `scripts/publish-all.sh`. Recurrence #8; see `publish-all-pkgs-array-gap.md`. Fixed in #585/#586/#588 |
| 5 | An **empty framework list** | js-framework-benchmark reporting **all `0.00 ms`, still green** — twice, historically | *"One workflow step from a real third-party number."* Fixed in #573 (`b26a4854`) |
| 6 | A route that was never prerendered | **SPA fallback served at HTTP 200** — nine endpoints | A 200 is indistinguishable from a real page to any check that only looks at status |
| 7 | An unset `ROLE`/identity variable | **Another agent's identity** | The Slack bot posts under one username for the whole swarm; role is a hand-typed `[prefix]` in the body |
| 8 | A `git log` run against the wrong path | **"no such change"** | Absence of output read as evidence of absence |
| 9 | A gate that is **never invoked** | `check-samples` reporting **`0 passed, 0 failed`, EXIT 0**, with 11 fences still physically in the files | `git grep -n "check-samples"` → exactly 2 hits, **both inside the script's own header comment**. Re-confirmed 2026-07-26. **Still open** |
| 10 | A matrix cell that **cannot run** | **Permanently GREEN**, after #613 changed it from permanently RED | `templates-cf-team` is the only `kind:"app-template"` cell. *"Trading a false negative you can see for one you cannot is not obviously the win the PR describes."* **Still open** |
| 11 | `${PIPESTATUS}` in **zsh** (it is a bash builtin) | **A blank exit code**, readable as success | Caught by the verifier mid-run; re-ran clean |
| 12 | A fetch that **404'd**, returning 14 bytes | A `grep` for a term would have **"confirmed" its absence off an empty file** | Verifier asserted the manifest was real (Node 22.23.1, Python, Ruby) *before* grepping it |
| 13 | A dead Slack socket listener | **Silence, indistinguishable from a quiet channel** | `if (attempt >= 5) { emit('FATAL … DEAD'); process.exit(1) }`, 30s backoff cap → ~2 min of network loss killed it permanently. Cost a **2h56m hole** in the session record |
| 14 | A **truncated** Slack export | **A complete-looking channel history** | One page returned; only the trailing `pagination_info` cursor revealed a second page existed. Found 2026-07-26 by the historian |
| 15 | An unassigned issue tracker | **13 open issues showing no owner, 3 of them already done** | *"Tracker was lying."* All real allocation lived in a chat channel |
| 16 | A test asserting a substring that a **60-byte broken file also contains** | A **green test written over the exact defect being reported** | `expect(llms).toContain("# my-app")`. Self-reported by its author |
| 17 | A test asserting the **absence** of a section | **The broken output blessed as correct, green forever** | *"omits the Components section when the registry is empty"* — encoding the absence certifies the bug |

## Why it keeps winning

1. **Zero and empty are valid values.** Type systems, JSON schemas, and exit codes
   all accept them. Nothing in the stack distinguishes "measured zero" from
   "measured nothing."
2. **An absence flatters a timing and screams in a count.** A dead binding sends a
   *timing* down (which looks like a win) and a *count* to zero (which looks
   obviously wrong). This is why the standing ruling in
   `docs/state/orchestrator.md` is: **publishable metrics are counted metrics only.**
3. **The rendering layer is downstream of the failure.** By the time a number
   reaches a README, a dashboard, or a Slack message, the absence has been
   formatted into something that looks like data.
4. **Two corrupted artifacts agree with each other.** A `--check` that compares two
   things written by the same broken step passes. See
   `checked-thing-is-not-the-changed-thing.md`.

## Fix / recipe

**The only reliable defence is a liveness probe: prove the thing under
measurement is doing work, before you record what it did.**

Concretely, in order of strength:

1. **Assert liveness before measuring.** This is what the mandatory **R0
   DOM-liveness gate** does (#610, `3059eaa1`) — and it *caught a fourth dead cell
   on its very first run.* Adopt the equivalent for any new instrument.
2. **Assert a floor, not just a pass.** `0 passed, 0 failed → EXIT 0` must be a
   failure. Every counting gate needs `if (count < expected_floor) exit 1`.
3. **Refuse rather than record.** `measureSizes()` was changed to **refuse when
   `dist/` is missing** instead of writing `_no dist_`. Prefer an error to a
   placeholder, always.
4. **Publish counts, not timings**, until the harness measures the shipped artifact.
5. **Make a skip neutral, not green.** A cell that cannot run has not passed.
6. **Assert the file is non-empty and is the file you think it is, before grepping
   it for absence.**
7. **Never encode an absence in a test assertion.** Asserting
   `not.toContain("## Components")` certifies the bug and stays green forever.
8. **A citation is a claim.** A README referencing a test file needs the same
   verification as a number — #592 cited a test that only existed in #589, and
   merging out of order would have published a dead link.

## Detection (carry-forward debt)

None of this is mechanically enforced. Open work, in priority order:

- Wire `check-samples` into `check:ci` **with a fence-count floor** (open, unassigned)
- Have `.tastemaker/check_contrast.py` parse `packages/css-engine/src/packs.ts`
  instead of its hardcoded `TOKENS` dict, and wire it into `check:ci`
  (open, unassigned)
- Make the scaffold-matrix skip **neutral** rather than success (open, unassigned)
- A CI lint for drift between `packages/*/package.json` `publishConfig.access` and
  the `PKGS` array — sketched in `publish-all-pkgs-array.md`, still not built

## Related

- `checked-thing-is-not-the-changed-thing.md` — the sibling pattern, named the same day
- `publish-all-pkgs-array-gap.md` — instance #4, and its own recurrence chain
- `docs/state/verifier.md` — instances #9, #10, #11, #12 with full verdicts
- `docs/state/orchestrator.md` — the counted-metrics-only ruling and the bench STOP
