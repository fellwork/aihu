# C-SWARM-RECON-AUTHORITY — move terminal-status authority into the Rust binary

**Owner:** architect · **Contract:** C-SWARM-RECON-AUTHORITY · **Surface:**
`packages/swarm/src/main.rs` (reconcile/promotion path + external-link
representation) + this doc. **Out:** any hand-edit of a contract row; the
`~/.swarm/supervisor.py` demotion (sequenced after this lands).

## The defect, measured (not inferred)

`verified` and `no-claims` are terminal statuses with external effects:
`verified` mirrors outward as Linear Done + closes the GitHub issue
(`main.rs` :1064-1082, :2289-2315); both satisfy a downstream contract's
`needs` (:1201-1241). Two paths can write them:

- **`verify-merged`** (`cmd_verify_merged` :2606) — DISCIPLINED. `resolve_pr` →
  `gh_pr_view` → `is_merged_evidence`; a failed query is *never* "not merged"
  (could-not-check); `verified` excluded from reselection (idempotent); recon is
  the receipt `merged: PR #N @ <sha> <ts>`. Writes `verified` only.
- **`setstatus --status verified|no-claims --reconciled`** (:1071) — the
  `--reconciled` flag is a *mistake-preventer, not an evidence check* (FEL-436:
  any process can pass it). supervisor.py's `_reconcile_with` calls exactly
  this, from a **trace scan with no PR**.

The corrected diagnosis (orchestrator read supervisor.py, not reasoned):
1. supervisor.py *already* has could-not-check posture (:690/:716/:731) — do not
   rebuild it.
2. The real defect is **transcript selection BY ROLE** (:681-687:
   `entry = reg.get(owner); tr = _transcript(entry)`) — the owner's *current*
   session, right only while the role still sits on the contract. Selection is
   load-bearing.
3. recon is a raw `stdout[:300]` dump by construction (:695) — the "garbage" in
   the two bad rows is recon.py being chatty, not a corruption event.
4. Both `verified` AND `no-claims` come only from this path (:707); 26 no-claims
   + 13 verified rows depend on it. verify-merged writes only `verified`.

Result: two rows (`C-SWARM-P0`, `C-FEL-SCAFFOLD-PM-COMPAT`) reached `verified`
with no merged-PR evidence. They fired nothing outward only because they carry
no linear/github link — luck, not a guard.

## The build — Rust becomes the sole adjudicator of the terminal write

The `--reconciled` write is DEMOTED to a **proposal**: a candidate id + its
evidence. Rust adjudicates with the verify-merged discipline; a proposal it
cannot evidence becomes could-not-check, never terminal.

### R1 — `verified` requires a real merged receipt (MUST-FAIL 1, MUST-PASS core)
`setstatus --status verified --reconciled` no longer blind-persists. It runs the
SAME check as `cmd_verify_merged` for that one contract: `resolve_pr` →
`gh_pr_view` (repo-qualified, see R2) → `is_merged_evidence`.
- merged → persist `verified` with the `merged: PR #N @ sha` receipt (the caller
  recon is ignored for the receipt; the receipt is machine-generated, so a
  transcript fragment can never masquerade as one).
- no PR / not merged / query failed → persist **`unverified`** with
  `could-not-check: <reason>`. NEVER `verified`.
- Idempotent + dry-run inherited from the shared path.

A trace-scan proposal (no `--github-pr`) therefore lands `unverified`, not
`verified` — fail-closed. This is the whole demotion, enforced in Rust, and it
works *before* supervisor.py is touched.

### R2 — external link is repo-qualified; no defaulting to a colliding repo (MUST-FAIL 2)
`gh_pr_view(number)` hardcodes `--repo GITHUB_REPO` (:1683-1694). `github_pr` is
a bare integer. `agent-swarm#1` is OPEN while `fellwork/aihu#1` is MERGED
2026-04-26, so `setstatus --github-pr 1` on a cross-repo contract would mint a
FALSE receipt in the exact costume of a true one.
- Add a nullable `github_repo` column. `setstatus --github-pr N` accepts
  `--github-repo owner/repo`. `gh_pr_view(repo, number)` resolves in that repo.
- SAFE DEFAULT (the load-bearing decision): a `github_pr` whose repo is **not
  known** is REFUSED for auto-verification — `resolve_pr` returns
  could-not-check "link has no repo; cross-repo links must carry --github-repo",
  it does **not** fall back to `GITHUB_REPO`. Existing fellwork/aihu links are
  backfilled `github_repo = 'fellwork/aihu'` in the same migration so the 11
  good rows keep resolving; only *new* bare links must name their repo.
  Defaulting-to-fellwork is exactly the collision, so the default is "unknown →
  refuse", not "unknown → fellwork".

### R3 — `no-claims` stays writable, unchanged here (MUST-PASS "must write no-claims")
`no-claims` is the vacuous-pass (grounded exit-0, no claims); it does NOT mirror
outward (:1082-1083), only satisfies downstream needs. It has no PR, so R1's
merged-receipt rule cannot apply. R1 tightens the `verified` branch ONLY; the
`no-claims --reconciled` branch is untouched, so the 26 rows keep working. Its
residual (role-selected transcript can mis-judge a vacuous pass) is addressed by
the propose-only boundary below, which needs supervisor.py + recon.py to carry a
**contract-anchored** transcript reference — sequenced after this, out of surface.

### R4 — needs-satisfaction follows for free (MUST-FAIL 3)
`:1201-1241` treats a need satisfied when the upstream is `verified`/`no-claims`.
Once R1 makes a false `verified` impossible (it becomes `unverified`), a
downstream can no longer read a fabricated `verified` as satisfied. No separate
change; MUST-FAIL 3 is a consequence of R1.

## The propose-only boundary (DESIGN; supervisor.py side is out of surface)
supervisor.py, once demoted, emits a PROPOSAL rather than calling
`setstatus --reconciled`:
- for a landing claim: `{id, kind: "verified", github_pr, github_repo}` — Rust
  adjudicates via R1/R2. The trace scan is necessary (it decided the work looks
  done) but not sufficient (Rust demands the merged receipt).
- for a vacuous pass: `{id, kind: "no-claims", transcript_ref, verdict_ref}`
  where `transcript_ref` is pinned to the session that CLAIMED this contract
  (contract-anchored), not the role's current session — this is the fix for the
  role-selection defect, and Rust refuses a no-claims proposal whose
  transcript_ref is not anchored to a claim/ack for this contract id.
Rust exposes a `propose` verb consuming this; `setstatus --reconciled` for
verified is retained only as the R1-guarded path until supervisor.py cuts over.

## Sequencing (fail-closed)
This Rust side lands FIRST. Immediately, a trace-scan `verified` proposal (no
merged PR) becomes could-not-check — nothing auto-promotes to `verified` without
a receipt. That is fail-closed and strictly better than the current fail-open.
The supervisor.py demotion (emit proposals, contract-anchored transcript) is a
separate, sequenced-after change to the live out-of-repo SPOF — not in this
surface.

## Healing the two corrupt rows
Not by hand-edit (verified is machine-set; hand-editing the ledger to correct the
ledger relocates the corruption). Re-running the corrected reconcile walks
`C-SWARM-P0` (agent-swarm #1 OPEN, cross-repo) and `C-FEL-SCAFFOLD-PM-COMPAT`
(#684 draft, two could-not-checks) back to their true status: with R1+R2, neither
has a merged same-repo receipt, so both resolve to `unverified` / could-not-check.

## Bars (from the contract)
- MUST-PASS: same posture as verify-merged (no promotion on failed/ambiguous
  query, idempotent, dry-run); `verified` requires the `merged: PR #N @ sha`
  receipt; `no-claims` still writable.
- MUST-FAIL: (1) corrupt input (verified, transcript-fragment recon, github_pr
  NULL) → could-not-check, not verified. (2) `setstatus --github-pr 1` on a
  cross-repo contract → refused / resolved in its own repo, never a false
  fellwork/aihu #1 receipt. (3) downstream needs unsatisfied until upstream
  carries a real receipt.
