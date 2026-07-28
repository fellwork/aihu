# A GATE TIGHTENED TO KILL ONE FALSE-RED ARMED ANOTHER ON THE SIBLING BRANCH

**Topic:** CI gate design, `ci-ok`, docs-only PRs
**Session:** named 2026-07-27/28, found while trying to FINISH two docs-only PRs
**Category:** ops, measurement-integrity, noise-over-signal
**Severity:** high — silently made EVERY docs-only PR unmergeable-when-ready, one
merge-hour after the same PR shape was landing green. It blocks the historian's
entire output class (state + lessons) and every other role's `docs/state/*.md`.

## The trigger

`#670` (`41c37df6`, merged 01:11:59Z) is a *good* fix: a draft PR whose `check`
skipped should WARN, not FAIL — red-that-means-unfinished trains everyone to ignore
red (`absent-value-rendered-as-real.md`). But the pre-#670 gate was a **single arm**:

```bash
# before #670 — only DRAFT + skipped was an error; a NON-draft skip fell through to GREEN
if [ "$IS_DRAFT" = "true" ] && [ "$CHECK_RESULT" = "skipped" ]; then  ::error:: ; fail=1 ; fi
```

`#670` split it into two arms and, on the arm it *added*, chose `fail`:

```bash
if [ "$IS_DRAFT" = "true"  ] && [ "$CHECK_RESULT" = "skipped" ]; then ::warning:: ; fi   # fixed
if [ "$IS_DRAFT" != "true" ] && [ "$CHECK_RESULT" = "skipped" ]; then ::error:: ; fail=1 ; fi  # NEW
```

`check` skips whenever `changes.code == 'false'` — i.e. **on every docs-only PR, by
design.** So the new arm fails every docs-only PR the instant it is marked ready.

## The contradiction no test can see

The *same file* documents the opposite, in a comment `#670` left untouched
(`.github/workflows/plan-a.yml`, the `on:`/`changes` headers):

> "Doc-only PRs skip the heavy `check` job via the `changes.code` filter … and
> `ci-ok` still reports green so the PR is mergeable **without an admin override**."

Header says docs-only-ready → green; gate says docs-only-ready → fail. A prose header
and the code beneath it disagreeing is a class of defect **nothing executes** — the
header is a comment, so no gate checks the gate against its own stated contract.

## The receipt (measured, not reasoned)

```
docs-only PRs that MERGED GREEN, all BEFORE #670 (01:11Z):
  #657 6b9d6eba (11 lesson files)   #659 e41cf406 (docs/state)   #660 a91ee9f4 (docs/state)   #658 622fa289 (CLAUDE.md)
  gh api .../commits/<sha>/check-runs  ->  check: success | skipped ... ci-ok: success
docs-only PRs that FAIL ci-ok now, AFTER #670:
  #669 a1b155dc, #676 d80c3276  ->  ci-ok: fail
  log: "::error::'check' was skipped on a non-draft PR — ci-ok would be reporting on a build that never ran."
  env dump: CHECK_RESULT=skipped  IS_DRAFT=false   (code was 'false' — docs-only — but the gate never read it)
```

The signal `#670` failed to consult was **already computed** one job over:
`changes.outputs.code`. The gate had `IS_DRAFT` and `CHECK_RESULT` in scope but not
`CODE_RESULT`, so it could not tell a legitimate docs-only skip from an anomalous
code-PR skip — and treated both as the anomaly.

## The fix, and why it fails-closed

Gate the error on `changes.code`: exempt the docs-only skip (`code=='false'`), keep
`#670`'s guard for a real code PR whose `check` skipped, and — because `changes` is
itself skipped on drafts and could break on a real PR — treat an EMPTY `code` on a
non-draft as a failure, not a pass:

```bash
if [ "$IS_DRAFT" != "true" ] && [ "$CHECK_RESULT" = "skipped" ]; then
  if [ "$CODE_RESULT" = "false" ]; then echo "docs-only: skipped by design — green";
  else ::error:: ; fail=1 ; fi          # code=='true' OR '' (broken changes) both fail
fi
```

## The rung

- **prose (insufficient):** "when you tighten a gate, re-read the other arm of the
  condition you split." True, and it is what was missed — but it depends on
  remembering, and `#670` was written by the person most steeped in this gate.
- **structural:** a gate that encodes a policy must be **tested against the policy it
  claims**, both arms. The concrete promotion here is a `must_fail`/`must_pass` matrix
  for `ci-ok` itself — {draft, ready} × {code, docs-only} × {check ran, skipped} — so a
  future edit that greens a code-PR skip or reds a docs-only skip fails a test, not a
  human's PR three merge-hours later. Until that exists, the header comment and the
  gate are an **unverified claim** about each other (`a-contract-is-an-unverified-claim.md`).

## The shape worth carrying

A fix that removes a false signal on one branch of a two-armed condition can **arm a
false signal on the other branch** — and it looks like tightening, not loosening.
`#670` traded a draft false-red for a docs-only false-red and the board looked
*more* correct for it. Same family as the lazy-import fix that could introduce a
silent no-op (`a-contract-is-an-unverified-claim.md`): removing one defect is the
moment to check you did not plant its mirror image.

## Related

- `absent-value-rendered-as-real.md` — #670's own good reasoning (red-that-means-unfinished); this is its overcorrection
- `checked-thing-is-not-the-changed-thing.md` — the gate checked draftness, not the thing that actually gates a build (did code change)
- `a-contract-is-an-unverified-claim.md` — a header comment asserting behavior the code contradicts is an unverified claim
- `stack-base-merge-goes-conflicting.md` — the sibling "check your own PR's real state at wake start" lesson that surfaced this (marking ready flipped ci-ok red)
