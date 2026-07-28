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

### R3 — `no-claims` stays REACHABLE, but gated by R5 (MUST-PASS "must write no-claims")
`no-claims` is the genuinely-nothing-to-check case; it does NOT mirror outward
(:1082-1083), only satisfies downstream needs, and has no PR (R1's merged rule
cannot apply). It must remain reachable — 26 rows + 9 need-declaring contracts
depend on it, and demoting its only writer without a replacement STALLS THE DAG
(see Sequencing). But it is NOT "unchanged": R5 gates it on a genuinely-empty
structured `claims` column, so the 26-vacuous-passes defect cannot recur. The
role-selected-transcript residual is addressed by the propose-only boundary
below (contract-anchored transcript ref) — sequenced after, out of surface.

### R4 — needs-satisfaction follows for free (MUST-FAIL: downstream needs)
`:1201-1241` treats a need satisfied when the upstream is `verified`/`no-claims`.
Once R1 makes a false `verified` impossible (it becomes `unverified`), a
downstream can no longer read a fabricated `verified` as satisfied. No separate
change; it is a consequence of R1.

### R5 — the adjudicator MUST consume the STRUCTURED `claims` column (binding MUST-FAIL, added by amendment)
The deepest defect, measured across the whole population: **the trace reconcile
has never once checked a claim.** All 26 `no-claims` rows carry the identical
recon `"N tool calls in trace; 0 claims; 0 flagged"`, across traces of 24–558
tool calls, while 50 verdict messages carry a populated structured `claims`
column. Mechanism:
- `supervisor.py:686` selects verdict **`body` only** — the `claims` column is
  never read.
- `recon.py:95-104` matches six English first-person PROSE regexes (`\bI\s+pushed`,
  `\bI\s+filed [A-Z]+-\d+`, …), but the bus MANDATES the machine format
  `--claims 'pushed:PR#N,ran:cargo test'`. **The format the bus requires is the
  format the reconciler cannot parse** — even passed the column, `pushed:PR#679@…`
  never matches "I pushed". So the claim-checking control CLAUDE.md promises has
  structurally never fired: 26 vacuous passes + 2 false positives.

The fix: the adjudicator's evidence input is the contract's latest verdict
**`claims` column** (`msg.claims`), parsed as the `verb:target` machine format,
not prose. Each `verb:target` is checked against real evidence (a `pushed:PR#N`
claim resolves like R1; `ran:`/`verified:` against the trace). Prose extraction
MAY remain a supplement; it may NOT be the sole input.
- `no-claims` is reachable ONLY when the verdict's `claims` column is genuinely
  EMPTY. A zero-extraction while `claims` is NON-EMPTY must NOT reach `no-claims`
  — that is the exact miss (a machine-format claims column the prose regex could
  not see). MUST-FAIL, both directions:
  (a) feed historian's real C-FEL-RETRO-0727 verdict
  (`claims = "pushed:PR#679@868ac101,ran:check-cargo-build+full-suite,verified:…"`)
  → assert it does NOT land `no-claims`;
  (b) feed a verdict with a genuinely empty `claims` column → assert `no-claims`
  IS still reachable (the fix is not "never emit `no-claims`").

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

## Sequencing — Rust FIRST, demotion AFTER (ruled; corrects my earlier note)
My first recommendation said the demotion should land "first-or-with" the Rust
path on a fail-closed argument. That was WRONG, and the blast radius is only
visible with the no-claims count: `no-claims` is the ONLY writer for every
contract whose legitimate work produces no merged PR (spec-only, docs-only, every
vacuous pass), and `cmd_ready` (:1199-1245) satisfies a need on `verified` OR
`no-claims`. Demote the only `no-claims` writer first and every such upstream can
never satisfy a downstream need — that is not fail-closed, it is a **DAG stall**
(9 contracts currently declare needs). So: the Rust adjudicator lands FIRST; the
supervisor.py demotion to propose-only follows. My "capability-removal is the
safest edit" argument stands — it applies to step TWO, not step one. Once the
Rust side is in, a trace-scan `verified` proposal with no merged PR resolves to
could-not-check, so the outward-firing hazard is closed at step one without
touching the DAG.

## Healing — 26 unchecked + 2 false, NOT a mass-revert
Not by hand-edit (a terminal status is machine-set; hand-editing the ledger to
correct the ledger relocates the corruption). The honest reading: `no-claims`
currently means "we did NOT check", not "there was nothing to check" — R5 shows
the check never ran. So it is 26 UNCHECKED rows plus the 2 FALSE `verified`, not
28 wrong rows: most of the 26 correspond to genuinely completed work with merged
PRs, so they are unchecked, not wrong. DO NOT mass-revert. Make the mechanism
honest (R5), re-run it, and let it re-derive each row from evidence. Where the
evidence is no longer recoverable — a role-scoped transcript that has since
rolled — the honest landing place is **could-not-check / `unverified`, NOT a
reconstructed "true" status**. A heal that invents a status to look complete is
the same defect one level up. (C-SWARM-P0 → agent-swarm #1 OPEN cross-repo, no
same-repo receipt → unverified; C-FEL-SCAFFOLD-PM-COMPAT → #684 draft, two
could-not-checks → unverified.)

## Bars (from the contract + binding amendments)
- MUST-PASS: same posture as verify-merged (no promotion on failed/ambiguous
  query → could-not-check, idempotent, dry-run); `verified` requires the
  `merged: PR #N @ sha` receipt; `no-claims` still reachable; the adjudicator
  consumes the STRUCTURED `msg.claims` column, not prose extraction.
- MUST-FAIL: (1) corrupt input (verified, transcript-fragment recon, github_pr
  NULL) → could-not-check, not verified. (2) `setstatus --github-pr 1` on a
  cross-repo contract → refused / resolved in its own repo, never a false
  fellwork/aihu #1 receipt. (3) downstream needs unsatisfied until upstream
  carries a real receipt. (4, amendment) a verdict whose `claims` column is
  NON-EMPTY (e.g. historian's `pushed:PR#679@868ac101,…`) must NOT land
  `no-claims`; a genuinely-empty `claims` column MUST still be able to.
