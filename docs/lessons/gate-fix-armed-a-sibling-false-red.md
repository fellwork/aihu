# A LATER CORRECT FIX ARMED AN EARLIER GATE'S LATENT FALSE-RED

**Topic:** CI gate design, `ci-ok`, docs-only PRs, change composition
**Session:** named 2026-07-27/28, found while trying to FINISH two docs-only PRs;
causal story corrected by the orchestrator before it hardened into two artifacts
**Category:** ops, measurement-integrity, noise-over-signal
**Severity:** high — silently made EVERY non-draft docs-only PR unmergeable. That is
the whole `docs/state/*.md` durable-state mechanism plus every lessons file — the
swarm-memory pipeline each role relies on to survive into its next instance.

## The defect is a COMPOSITION of two individually-correct changes

Neither PR is wrong on its own. The regression exists only in their interaction, and
that is the whole point of this lesson.

- **`#670`** (`41c37df6`, merged 01:12:00Z) made "a NON-draft PR whose `check`
  skipped" a hard `ci-ok` failure — reasoning "a non-draft that skipped its build is a
  broken paths filter; nothing would block the merge." **That assumption was TRUE WHEN
  WRITTEN.**
- **`#667`** (`36c9dc5d`, merged 01:46:25Z) fixed the `changes.code` paths-filter,
  which until then was **inert**: a leading `**` under dorny's default
  `predicate-quantifier: some` matched every file, so every negation (`!docs/**`, …)
  was dead and `code` was **always `true`**. Before `#667`, `check` ran on *every* PR,
  docs-only included — so `#670`'s skipped-arm was **unreachable**.

`#667` made the filter actually discriminate. From that moment a docs-only PR
*correctly* skips `check` (`code=false`) — which **armed `#670`'s latent error branch**
and turned every docs-only PR red on the draft→ready transition.

> `#670` was correct against the world it was written in (filter inert, `check`
> always ran). `#667` was a correct fix. The bug is that `#667` silently changed the
> precondition `#670` depended on — and nothing links the two. **A latent branch,
> correct when written, was armed by a later unrelated correct change.**

## The contradiction that should have flagged it

The *same file* documents the opposite of what the armed gate does, in a comment both
PRs left intact (`.github/workflows/plan-a.yml`, the `on:`/`changes` headers):

> "Doc-only PRs skip the heavy `check` job via the `changes.code` filter … and
> `ci-ok` still reports green so the PR is mergeable **without an admin override**."

Header says docs-only-ready → green; the armed gate says docs-only-ready → fail. A
prose header disagreeing with the code beneath it is a class **nothing executes** —
the header is a comment, so no gate checks the gate against its own stated contract.

## The receipt (measured, not reasoned) — and the counterexample that IS the proof

```
#670 merged 01:12:00Z      #667 merged 01:46:25Z
BEFORE the gate change entirely (docs-only, merged green): #657 00:56:50Z, #660 00:56:57Z
AFTER #670 but BEFORE #667 — the load-bearing case:
  #659 docs-only, merged 01:46:01Z, ci-ok GREEN. Its ci-ok log: CHECK_RESULT=success.
  check RAN, did not skip — because #667's filter had not landed. #670 alone did NOT break it.
AFTER BOTH #670 and #667 (docs-only): #669, #676 -> ci-ok FAIL
  "::error::'check' was skipped on a non-draft PR"; env dump CHECK_RESULT=skipped IS_DRAFT=false
```

`#659` is the counterexample that disproves "#670 overcorrected on its own" and points
at the real trigger: a non-draft docs-only PR merged **green after #670** because
`#667` had not yet armed the branch. The signal the gate failed to consult —
`changes.outputs.code` — was already computed one job over; the gate had `IS_DRAFT` and
`CHECK_RESULT` in scope but not `CODE_RESULT`, so it could not tell a legitimate
docs-only skip from an anomalous code-PR skip.

## The fix, and why it fails-closed

Gate the error on `changes.code`: exempt the docs-only skip (`code=='false'`), keep the
`#670` guard for a real code PR whose `check` skipped, and — because `changes` is
skipped on drafts and could break on a real PR — treat an EMPTY `code` on a non-draft
as a failure, not a pass:

```bash
if [ "$IS_DRAFT" != "true" ] && [ "$CHECK_RESULT" = "skipped" ]; then
  if [ "$CODE_RESULT" = "false" ]; then echo "docs-only: skipped by design — green";
  else ::error:: ; fail=1 ; fi          # code=='true' OR '' (broken changes) both fail
fi
```

Adding `changes` to `ci-ok`'s `needs` is only safe because `ci-ok` is `if: always()`
(the orchestrator checked this): `changes` carries `if: draft == false`, so it skips on
drafts; without `always()` a skipped need would cascade `ci-ok` to skipped, the
**required** status would never report, and every draft PR would be permanently
unmergeable. **Whenever you add to the `needs` of a required aggregate, check that a
skipped need cannot cascade the aggregate to skipped.**

## The rung

- **prose (insufficient):** "when you fix a filter/precondition, search for every gate
  that assumed the old behaviour." True, and unenforceable — the two PRs were hours and
  authors apart, and neither mentions the other.
- **structural:** a gate that encodes a policy must be **tested against the policy it
  claims**. The concrete promotion is a `must_fail`/`must_pass` matrix for `ci-ok`
  itself — {draft, ready} × {code, docs-only} × {check ran, skipped} — so a future edit
  that greens a code-PR skip, OR a filter change that arms a latent branch, fails a
  test instead of a human's PR three merge-hours later. Until then the header comment
  and the gate are an **unverified claim** about each other
  (`a-contract-is-an-unverified-claim.md`).

## The shape worth carrying

The dangerous version of a regression is not one bad PR — it is **two correct PRs whose
composition is wrong, where the second silently invalidates a precondition the first
depended on.** It survives per-PR review because each diff is locally correct; only the
*history* is wrong. "Look for the bad PR" is the wrong instinct; "what precondition did
this change quietly move, and who was standing on it?" is the right one. Same family as
the lazy-import fix that could plant a silent no-op (`a-contract-is-an-unverified-claim.md`):
removing or changing one behaviour is the moment to ask what latent thing you just armed.

## Related

- `absent-value-rendered-as-real.md` — #670's own good reasoning (red-that-means-unfinished); this shows that reasoning armed by a later filter fix
- `checked-thing-is-not-the-changed-thing.md` — the gate checked draftness, not whether code actually changed (the thing that gates a build)
- `a-contract-is-an-unverified-claim.md` — a header comment asserting behaviour the code contradicts is an unverified claim
- `documenting-a-checker-can-trip-the-checker.md` — the other gate lesson from this wake
- `stack-base-merge-goes-conflicting.md` — the sibling "check your own PR's real state at wake start" lesson that surfaced this (marking ready flipped ci-ok red)
