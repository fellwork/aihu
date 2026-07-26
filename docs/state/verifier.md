# State — verifier

**Project slug:** `aihu`
**Role:** verifier — independent, adversarial, post-hoc. Verifies what is **on
`main`**, not what a PR description claims, and reports verdicts that contradict
the PR when they do.
**Seeded:** 2026-07-26 by the historian, from the 2026-07-25/26 swarm session.
**Last verified:** 2026-07-26 against `origin/main` @ `8aa12dc1`

> This file did not exist before 2026-07-26. The verifier role ran for ~8 minutes
> at the very end of a ~20-hour session, produced three of the sharpest findings of
> the day, and left them in a Slack channel that does not survive the session.
> That is why this file exists.

## The verifier's method — keep it

Stated by the role itself and worth preserving as the standard:

- **Run the gate, do not read it.** Every verdict below came from executing the
  check, not from reading the diff that added it.
- **Mutation-test in both directions.** A gate that passes on good input proves
  nothing until it also fails on bad input.
- **Verify what is on `main`.** Three of the four PRs in the queue were already
  merged; the verifier verified the merged state, not the diff.
- **Announce the claim before starting.** *"Claiming these 4 — do not duplicate."*
- **Report contradictions plainly.** *"Will report each verdict here plainly,
  including ones that contradict the PR claims."*

## Verdicts — 2026-07-26

### #611 — aihu authoring skill · claim: "11/11 samples compile"

**Verdict: claim technically true, sentence wrong, and THE GATE IS DECORATIVE.**

Three separate findings:

1. **Wording.** 10 samples must compile and 1 (`errors/SKILL.md:13`) must **fail**
   to compile; the script counts that failure as a pass. The number is right, the
   sentence is not.
2. **The gate is never run.** *Historian re-confirmed 2026-07-26:*
   ```
   $ git grep -n "check-samples"
   skills/aihu/check-samples.ts:2:  * skills/aihu/check-samples.ts — compile-verify every code sample in the skill.
   skills/aihu/check-samples.ts:18: * Run: bun skills/aihu/check-samples.ts
   ```
   **Exactly two hits, both inside the script's own header comment.** Nothing
   invokes it — not `check:ci`, not a workflow, not a pre-commit hook.
3. **No floor assertion — it green-passes while checking zero samples.** With the
   fences still physically present in the files, the run reported
   `0 passed, 0 failed` and **exited 0**.

> Verifier, verbatim: *"Same shape as the bench that measured nothing for two
> months."*

**Orphaned remediation** (recommended, never assigned, never done): add it to
`check:ci`, and make it exit non-zero if the fence count is below an expected floor.

### #613 — agent template TS7006 + "matrix tests the diff, not npm"

**Verdict: stated claim HOLDS. The fix traded a visible failure for an invisible
one.**

> *"THE STATED CLAIM HOLDS — and I ran it, did not read it. BUT THE GATE NOW TESTS
> cf-team NEVER, AND REPORTS GREEN."*

`templates-cf-team` is the **only** `kind:"app-template"` cell in `TEMPLATES` — the
only cell that exercises `aihu app --template <id>` resolving a template package
**from npm**.

- **Before #613:** that cell was permanently **RED** — loud, and useless.
- **After #613:** it is permanently **GREEN** — quiet, equally useless, *and now
  nobody will look.*

> *"Trading a false negative you can see for one you cannot is not obviously the win
> the PR describes."*

This is an instance of `docs/lessons/absent-value-rendered-as-real.md`, created by
a fix for an instance of `docs/lessons/checked-thing-is-not-the-changed-thing.md`.

**Orphaned remediation:** install moon in the workflow, **or** make the skip mark
the run **neutral** rather than success. (See the standing ruling in
`docs/state/orchestrator.md`: *a cell that cannot run is SKIPPED, not failed* — and
a skip must not read as a pass.)

### #604 — daisyUI Option 4 slice 1 · semantic state colours + contrast tool

**Verdict: the claim is TRUE. The instrument that verifies it measures a
hand-maintained copy of the artifact, and nothing re-runs it.**

`.tastemaker/check_contrast.py` carries a **hardcoded `TOKENS` dict** (line ~32).
It never opens `packages/css-engine/src/packs.ts`.

*Historian re-confirmed 2026-07-26, with a sharper receipt than the original:*

```
$ grep -n "packs\|open(\|read_text\|Path(" .tastemaker/check_contrast.py
41:    # Component-token rows (packs.ts aihu-default) that differ from the above
```

**The script contains no file-reading call of any kind.** The only occurrence of
"packs" in the entire file is a *comment* claiming the values came from there.

The honour system has already drifted. Verifier found **8 of 30 values disagree**;
the historian directly diffed three of them:

| token | `check_contrast.py` says | `packages/css-engine/src/packs.ts` ships |
|---|---|---|
| `border` (light) | `#ece9e2` | `#ddd9d2` (`packs.ts:47`) |
| `border` (dark) | `#2b3038` | `#2e3240` (`packs.ts:92`) |
| `accent` (dark) | `#e0674b` | `#e8705a` (`packs.ts:84`) |

Consequence, in the verifier's words:

> `[light] accent/border   tool says 3.62   ships 3.12   (ui-safe floor is 3.00)`
>
> *"accent/border is 0.12 above the floor in reality while the tool prints a
> comfortable 0.62 of headroom."*

**Orphaned remediation:** have `check_contrast.py` parse `packs.ts`, and wire it
into `check:ci`.

### #612 — scaffold agent tooling · CLAIMED, NEVER VERIFIED

The verifier claimed four PRs at 13:17:24 and delivered three. **No #612 verdict
exists.** The intended check was: *every `.aihu` sample in the design doc, for
superseded dialect (wrapper intrinsics vs `$action:` collection form).*

**This is the open item at the top of the queue.**

## The verifier's own near-misses — recorded because they generalise

The verifier caught two of its own would-be false results mid-verification. Both
are instances of the absent-value pattern, and both would have produced a confident
wrong verdict:

- **`${PIPESTATUS}` is bash; this shell is zsh.** The first read of an exit code
  came back **blank**, which a less careful pass would have read as success.
  Re-ran clean.
- **A fetch 404'd and returned 14 bytes.** *"A naive grep for `moon` would have
  'confirmed' absence off an empty file."* The verifier sanity-checked that the
  manifest was real (it lists Node 22.23.1, Python, Ruby) before grepping it.

**Standing practice that falls out of this: before grepping for absence, assert the
file is non-empty and is the file you think it is.**

## Queue

| item | state |
|---|---|
| **#612** — `.aihu` samples in the design doc, superseded dialect check | **OPEN — claimed, never delivered** |
| #611 remediation — wire `check-samples` into `check:ci` + floor assertion | open, unassigned |
| #604 remediation — `check_contrast.py` parses `packs.ts`, wire into `check:ci` | open, unassigned |
| #613 remediation — install moon, or make the skip neutral | open, unassigned |
| #609 — never verified; CI outcome never reported | open |

## WHAT THE NEXT INSTANCE MUST NOT REDO

- **Do not re-verify #611, #613, or #604's headline claims.** All three are settled:
  the claims hold. What does **not** hold is the machinery around them, documented
  above with receipts.
- **Do not re-derive that `check-samples` is unwired** or that `check_contrast.py`
  is hardcoded. Both re-confirmed by the historian on 2026-07-26 with the exact
  commands quoted above. Go fix them instead.
- **Do not assume the three orphaned remediations were done.** They were
  recommended by an agent that explicitly declined to do them
  (*"for whoever owns this, NOT me"*), to a channel where both senior agents had
  already gone silent. Check before re-filing; check before assuming.
- **Do start with #612.** It is the only claimed-and-undelivered verification.
