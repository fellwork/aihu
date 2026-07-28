# THE LEDGER THAT AUDITS CI IS GREEN-BY-CONSTRUCTION — A TERMINAL STATUS WITH A RECON THAT IS NOT A RECON

**Topic:** swarm reconcile/ledger, contract `status`, outward side effects, `supervisor.py`
**Session:** named 2026-07-28, escalated by the orchestrator as a founder DECIDE
(C-FEL-SCAFFOLD-PM-COMPAT / C-SWARM-P0). Ledger receipt re-measured by the historian;
provenance corrected once (see below — the first telling blamed trace SELECTION and was
wrong in the direction that made the bug look smaller).
**Category:** measurement-integrity, process, green-by-construction
**Severity:** high — a status wired to CLOSE customer-visible issues and UNBLOCK
downstream work was assigned with **no merged-PR evidence and a recon field that is not a
recon.** It harmed nothing this time only by luck.

## The incident

The reconcile pass promotes contracts to `verified`. Two contracts reached `verified`
with **no merged-PR evidence and a recon field that is a raw `Bash` tool-call dump, not a
recon.** Re-measured from a WAL-safe snapshot (`VACUUM INTO`, not `cp` — a `cp` of a WAL
database reads stale, see `stale-ledger-wal-and-disproven-receipts.md`):

```
sqlite3 snap "SELECT id,status,github_pr,substr(recon,1,90) FROM contract WHERE status='verified'"
13 rows. 11 carry a legitimate "merged: PR #NNN @ <sha>" receipt.
TWO do not:
  C-FEL-SCAFFOLD-PM-COMPAT  pr=NULL  recon = 'ok  wrote to  "I wrote to"  <- Bash {"command":"cd .../zurich  export AIHU_COMPILE_BIN=..."'
  C-SWARM-P0                pr=NULL  recon = 'ok  filed FEL-435  "filed FEL-435" <- Bash {"command":"cd .../age..."'
```

C-FEL-SCAFFOLD-PM-COMPAT was promoted to `verified` **in the same hour its owner was
reporting two of its four defects as could-not-check and deliberately holding PR #684 in
draft.** The ledger ran ahead of the work — in the one direction looking at the ledger
cannot catch.

## The correction that makes it sharper: SELECTION was never the load-bearing step

My first telling (and the orchestrator's first escalation) said the recon was "a raw
transcript fragment from a DIFFERENT worktree," implying the reconciler scanned an
UNRELATED trace. Architect supplied the true provenance for **C-SWARM-P0** and that clause
was wrong: the trace was **architect's OWN work** in `agent-swarm/sydney` — real, `commit
592e6e8`, `phase0/recon.py`, 229 lines plus README and fixtures. **The reconciler read the
RIGHT trace and still produced a garbage recon and a premature terminal status.**

That is worse, not smaller. If the failure were trace *selection*, picking the right trace
would fix it — and it would not: even on the correct trace the pass wrote a tool-call dump
into `recon` and set `status=verified`. **The defect is recon GENERATION + premature
terminal, not trace selection.** (For C-FEL-SCAFFOLD-PM-COMPAT the fragment does appear to
be from another worktree — `.../zurich` — so wrong-selection is one *symptom*, but it is
not the common root, and a fix aimed only at selection would leave C-SWARM-P0 broken.)

The claim that survives unchanged is the one that matters: **two contracts reached a
terminal status with no merged-PR evidence and a `recon` that is not a recon.** For
C-SWARM-P0 the only PR is `srmcguirt/agent-swarm#1`, verified OPEN / `mergedAt=null` —
nothing landed.

## DO NOT "fix" the missing link — a bare-integer PR id across repos manufactures a false receipt

The helpful move on "no PR link" is to attach one; here that is the **most dangerous
action available**, and it is measured, not hypothetical. `contract.github_pr` is a bare
integer with **no repo**, and `gh_pr_view` at `packages/swarm/src/main.rs:1683-1694`
resolves it with `--repo GITHUB_REPO` **hardcoded** to `fellwork/aihu`. So:

```
gh pr view 1 --repo srmcguirt/agent-swarm  -> #1 OPEN    mergedAt=null   (the real C-SWARM-P0 work)
gh pr view 1 --repo fellwork/aihu          -> #1 MERGED  2026-04-26      "Plan A Phase 1: workspace scaffolding"
```

Writing `setstatus --id C-SWARM-P0 --github-pr 1` would make `verify-merged` resolve a
**three-month-old, genuinely-merged aihu scaffolding PR**, find it merged, and promote
C-SWARM-P0 to `verified` with a recon that reads `merged: PR #1 @ <sha>` — **a false
receipt in the exact format the 11 legitimate rows use, indistinguishable by inspection.**
The empty `github_pr` is the ONLY thing preventing it, and it prevents it **by accident.**

> A bare-integer cross-boundary id, resolved against a hardcoded namespace, cannot be
> linked *correctly* in a multi-repo world — only linked WRONGLY or not at all. Architect
> chose not-at-all, and **declined to mutate their own row** (correct posture, recorded as
> the behaviour, not just the outcome — an agent may not set its own terminal status). The
> orchestrator added a second requirement to the eventual fix: **`github_pr` must carry a
> repo, or a cross-repo contract must be REFUSED a link rather than given a colliding one.**

## Why it is not a cosmetic label — confirmed in `packages/swarm/src/main.rs` on origin/main

- `:1064` / `:1071` / `:1082` — `verified` and `no-claims` are "the two statuses with
  EXTERNAL side effects"; `verified` "additionally mirrors outward as Done."
- `:2438` — on sync a `verified` contract moves its Linear issue to **Done** and
  **closes its GitHub issue** with a comment.
- `:1201-1241` — a downstream contract's `needs` are treated as **satisfied** when its
  upstream reads `verified`/`no-claims` — so a false `verified` also **unblocks work that
  should still be waiting.**

Nothing fired outward for the two bad rows ONLY because they happen to carry no `linear`
or `github_issue` link. **That is luck, not a guard.**

## The spine: the most powerful decision lives in the least-guarded file

The contrast is the whole lesson. The in-repo Rust `verify-merged` path is written with
real discipline: **dry-run by default, refuses to read a failed query as "not merged,"
reports could-not-check, and excludes `verified` from reselection for idempotency.** The
transcript-scanning path that assigned these two statuses lives in `~/.swarm/supervisor.py`
— which is **in no repo: no PR, no review, no CI, no durable record** — and has none of
that discipline: **"0 flagged" in a trace scan became a terminal status.**

> Every guarantee this swarm runs on — review, CI, a durable diff — is ABSENT for the one
> file that holds the terminal, outward-facing, hard-to-reverse power. The strongest
> capability sits in the weakest-governed place.

## Green-by-construction, one level up

This is the exact defect the swarm spent the session hunting in CI — a check that reports
PASS without really checking (`ci-ok-green-only-with-same-run-check.md`,
`gate-fix-armed-a-sibling-false-red.md`) — reproduced **in the ledger that audits CI.**
A verifier that emits PASS while writing a tool-call dump where the evidence should be —
even when handed the RIGHT trace — is green-by-construction: it passed by never actually
turning the examined work into a checked receipt. The audit layer inherited the bug it
exists to catch.

## The historian read its own row (the prose rung, exercised)

"Read your own row before trusting it" (orchestrator, to all roles). Done, from the same
snapshot: **C-FEL-439fix** is legitimately `verified` (recon `merged: PR #639 @ e71f80c0`).
**C-FEL-RETRO-0727** is `no-claims`, all outward links NULL, recon `"85 tool calls in
trace; 0 claims; 0 flagged"` — a clean scan summary, NOT a wrong-worktree fragment like
the two above, but `0 claims` does not reflect the `done` verdict filed under it for #679.
Weaker than the two flagged (and luck-protected, links NULL), but flagged to reconcile,
**not touched** — an agent may not set its own `verified`/`no-claims`.

## The rung

- **prose (today):** every role reads its own ledger row and reports a mismatch. It
  caught this (builder-b's row, this one), but it is detection after the fact, not
  prevention — and it relies on remembering to look.
- **structural (dispatchable now, under review):** **move the promotion decision INTO the
  Rust binary** — which is in-repo, tested, dry-run-by-default, and already has the correct
  posture — and leave `supervisor.py` able only to **propose**, never to set a terminal
  outward-facing status. A capability with external, hard-to-reverse effects must live
  behind the same review+CI+diff every other change gets; the fix is to relocate the
  decision to where those guarantees exist, not to add discipline to a file that has none.
- **the broader remedy (pause the swarm ~15 min and fix `supervisor.py` against a stopped
  supervisor, reviewed) is a founder DECIDE — pending, and NOT the historian's to make.**
  It is a DECIDE precisely because the cost of the fix (coordination down, and the file is
  the live SPOF waking six roles) trades against the cost of waiting (a ledger that can
  close a customer-visible issue on a wrong-worktree trace scan).

## Related

- `ci-ok-green-only-with-same-run-check.md` — the same green-by-construction defect in CI; this is it in the ledger that audits CI
- `absent-value-rendered-as-real.md` — "0 flagged" (nothing examined) rendered as a terminal PASS
- `checked-thing-is-not-the-changed-thing.md` — the recon "verifies" without turning the examined trace into a checked receipt; a bare-integer PR id resolved against the wrong repo is the same class
- `worktree-vs-clone-tmp-durability.md` — wrong-worktree selection is one symptom (C-FEL-SCAFFOLD), not the root
- `stale-ledger-wal-and-disproven-receipts.md` — why the receipt must be re-measured with `VACUUM INTO`, not `cp`
- `a-contract-is-an-unverified-claim.md` — a terminal status with no real receipt is an unverified claim wearing the costume of a verified one
