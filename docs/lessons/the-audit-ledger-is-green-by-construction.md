# THE CLAIM-CHECK EVERY ROLE WAS TOLD PROTECTS THEM HAS NEVER ONCE RUN

**Topic:** swarm reconcile/ledger, contract `status`, producer/consumer format contract, `supervisor.py` + `recon.py`
**Session:** named 2026-07-28 (C-FEL-SCAFFOLD-PM-COMPAT / C-SWARM-P0 / C-SWARM-RECON-AUTHORITY).
**The mechanism here was diagnosed wrong three times before anyone read the two files; every
read went one layer deeper.** Source and ledger receipts below re-measured by the historian.
**Category:** measurement-integrity, process, green-by-construction
**Severity:** critical — the control CLAUDE.md cites to every role ("only the supervisor's
reconcile sets `verified`/`no-claims`, after checking your claims against your transcript")
has **never fired.** Its entire lifetime output is 27 vacuous passes and 2 false positives,
and those statuses are terminal and unblock downstream work.

## The headline, stated at full strength

The bus **mandates** a structured claim format — `--claims 'pushed:PR#N,ran:cargo test'` —
and rejects a verdict without it. The reconcile that is supposed to CHECK those claims
**never reads that column, and could not parse it if it did.** So every real claim is
invisible to the checker; every contract with real claims extracts **zero**; and the check
that was the entire justification for a human-unfalsifiable `verified`/`no-claims` status
**has structurally never run.**

## Read from source, both files (after three wrong guesses)

```
supervisor.py:687   row = SELECT body FROM msg WHERE contract=? AND kind='verdict' ...
                    # selects `body` ONLY. The structured `claims` COLUMN is never read.
supervisor.py:696   recon.py --transcript <owner's trace> --message-file <the body>
recon.py:95-104     CLAIM_PATTERNS = six first-person ENGLISH PROSE regexes:
                       \bI\s+(?:filed|opened|created)\s+([A-Z]{2,}-\d+)
                       \bI\s+claimed ...   \bI\s+pushed\b   \bI\s+ran\s+`...`   \bI\s+wrote ...
```

The checker looks for the words **"I pushed"** in free prose. The bus requires
**`pushed:PR#679@868ac101`** in a column. The format the bus *demands of the producer* is a
format the consumer *neither reads nor can match* — `pushed:PR#679...` does not contain the
literal "I pushed". **The producer and consumer of the same claim disagree on format, and no
test ever exercised the pair end to end.**

## The ledger receipts (VACUUM INTO snapshot, not cp — see `stale-ledger-wal-and-disproven-receipts.md`)

```
27 rows at status='no-claims'.  Rows whose recon is NOT the vacuous form: 0.
  Every one, from a 24-tool-call trace to a 236-tool-call trace, reads IDENTICALLY:
  "N tool calls in trace; 0 claims; 0 flagged. (no completed-action claims extracted from the message)"
52 verdict messages carry a NON-EMPTY structured `claims` column — none of them read.
My own C-FEL-RETRO-0727 verdict, in the DB: claims = "verified:single run 30322783137, verified:check ended ...".
  Real, structured, correct — and extracted as ZERO, so the row landed no-claims.
```

Identical output across a 10× range of trace sizes is the signature of a check that **never
examined anything** — the input varied and the verdict did not.

**Corroborated cross-role (builder-b):** *"Every `--claims` string I have sent this session was
write-only."* Correct, and it is the sharpest one-line consequence: the field the bus **mandates**
(and rejects a verdict for omitting) has **never been read by anything.** That a second role reached
this independently makes it a system property, not one reader's misread. The response is NOT to stop
populating the column — the fix (`C-SWARM-RECON-AUTHORITY` row 5 / #686) makes the adjudicator consume
it, and **the rows already written become the evidence it reads.** Keep filling a write-only field
when a consumer is coming for it; a mandated-but-unread field is a latent asset, not dead weight.

## Two defects, composed. The second is the load-bearing one.

- **Selection by role** (`:681-687`): `entry = reg.get(owner); tr = _transcript(entry)` — the
  transcript is the OWNER's current one, keyed by role, never by contract. Right only while
  the role still sits on the contract. This produced the **two false `verified`** rows:
  recon.py's prose regexes matched *incidental* prose ("I filed FEL-435", "I wrote to") in
  whatever trace the owner was on, and a match → grounded → `verified`. C-SWARM-P0 read
  architect's OWN work (`agent-swarm/sydney`, `592e6e8`) — right by luck, they had not moved on.
- **Format blindness** (`:687` + `recon.py:95-104`): the mandated `claims` column is never
  read and the prose extractor cannot match it. This produced **all 27 `no-claims`** — real
  claims rendered as "nothing to check". This is the systemic defect; selection is the two
  anomalies on top of it.

The reconcile's *posture* is otherwise disciplined — `:690` `unverified` on no trace/verdict,
exit-1 → `DISPUTED` + a filed `blocked`, exit-N → `unverified`, and it explicitly refuses to
launder a vacuous pass into `verified` ("the panel overselling, the failure this project keeps
catching"). Calling it (as earlier tellings did, mine included) a "guarantee-free heuristic"
was **wrong and unfair to its author.** A disciplined checker that is fed the wrong trace and
cannot read the claim format is not undisciplined — it is **checking nothing, correctly.**

## The correction IS the lesson: three wrong diagnoses of two files nobody opened

1. "certified from the wrong worktree" (historian, wake 19) — a selection story, wrong one.
2. "selection was never load-bearing; the defect is recon generation" (historian, wake 20) — the opposite error, also wrong.
3. two founder-facing characterisations from the orchestrator (guarantee-free heuristic; unrelated trace) — also wrong.

Every one was reasoning about `supervisor.py`/`recon.py` instead of opening them. Each actual
READ went a layer deeper — worktree → recon-generation → selection-by-role → **the column is
never read** — and only reading ended it. The fractal the orchestrator named: *the shape of the
error is the shape of the defect.* We filed confident conclusions about a mechanism that
**certifies without observing, while ourselves not observing (reading) it.** Instrument over
hand-reasoning (`promotion-rungs.md`) applies recursively — to your own diagnosis of the instrument.

## The quiet signal that found it (worth its own line)

The two loud rows (raw-looking recon) were the two *anomalies*. The **systemic** defect
surfaced from a WEAK signal: reading my own row, `C-FEL-RETRO-0727` = `no-claims` with a
*clean* "0 claims" scan that did not match my filed verdict — reported as a mismatch I could
not yet explain, **explicitly not inflated to "corruption."** A stronger instinct would have
compared it to the loud rows, seen it didn't match, and stayed quiet. **Report the mismatch you
cannot explain without inflating it** — the quiet one was the whole system.

## Why it is not cosmetic — `packages/swarm/src/main.rs` on origin/main

`:1064/1071/1082` `verified`/`no-claims` = the two EXTERNAL-side-effect statuses; `:2438` `verified`
→ Linear Done + close GitHub issue; `:1201-1245` `cmd_ready` treats a `need` as satisfied on
`verified` OR `no-claims`. So **27 rows unblocked downstream work on a check that could not run.**
It closed no customer issue only because these rows carry no `linear`/`github_issue` link — luck.

## DO NOT "fix" a missing link — a bare-integer PR id across repos manufactures a false receipt

`contract.github_pr` is a bare integer; `gh_pr_view` (`main.rs:1683-1694`) hardcodes
`--repo fellwork/aihu`. Measured: `gh pr view 1 --repo srmcguirt/agent-swarm` = OPEN (the real
C-SWARM-P0 work) but `--repo fellwork/aihu` = a MERGED 2026-04-26 scaffolding PR. So
`setstatus --github-pr 1` manufactures a perfect-looking `merged: PR #1` receipt. **A receipt in
the wrong repo is worse than none — it looks legitimate.** The empty link is load-bearing; leaving
it empty is the correct posture (architect declined to mutate their own row). Now a must-fail bar:
`github_pr` carries a repo or a cross-repo contract is refused a link.

## The rung — Option B is DISPATCHED (`C-SWARM-RECON-AUTHORITY`, architect)

- **the producer/consumer fault line (the general lesson):** when a format is MANDATED at one
  boundary, the consumer that must read it has to be tested against that exact format, end to
  end. Here the bus rejects a verdict lacking `--claims`, and the reconcile can't read `--claims`
  — same fault line as the claim-verb enum (`#662`→`#664`, "the SPEC is wrong"), one layer worse:
  the consumer never reads the field at all. A format contract with no cross-side test is two
  independent guesses wearing one name.
- **must-fail row 3 (binding):** `no-claims` MUST NOT be reachable from an extraction that
  returned zero while the latest verdict's `claims` column is non-empty. Prove **both** directions
  — feed the historian's real C-FEL-RETRO-0727 verdict and assert it does NOT land `no-claims`;
  feed a genuinely-empty-claims verdict and assert `no-claims` IS still reachable (the fix is not
  "never emit no-claims"). **The adjudicator MUST consume the structured `claims` column;** prose
  extraction may supplement, never be the only input.
- **structural:** move promotion INTO the tested in-repo Rust binary; `supervisor.py` proposes
  only. The Python posture is fine; what it lacks is review/CI/a durable diff — exactly why three
  people mis-read it. Relocate the *decision* to where those guarantees live.
- **sequencing (corrected):** Rust path lands **FIRST**, demotion **SECOND**. Demote-first is a
  DAG stall, not fail-closed: `cmd_ready` satisfies needs only on `verified`/`no-claims`, and the
  DB carries **27 `no-claims` + 13 `verified` = 40 terminal rows with 12 contracts declaring
  needs** (measured) — kill auto-promotion first and every spec-only/docs-only/vacuous pass can
  never satisfy a downstream need.
- **interim guard, BINDING ON EVERYONE:** no `sync --push` against any `verified` row whose recon
  is not a real same-repo receipt.
- **heal (amended):** it is **27 unchecked + 2 false**, NOT 2 corrupt — do NOT mass-revert; most
  of the 27 are genuinely completed work with merged PRs, so they are UNCHECKED, not WRONG.
  `no-claims` currently means "we did not check," not "there was nothing to check." Make the
  mechanism honest, re-run, re-derive; where evidence is unrecoverable land at could-not-check.

## Related

- `ci-ok-green-only-with-same-run-check.md` — the same green-by-construction defect in CI; this is it in the ledger that audits CI
- `a-contract-is-an-unverified-claim.md` — a terminal status reached by a check that never ran is the unverified claim in its purest costume
- `promotion-rungs.md` — the hand-reasoning trap; it caught three diagnosticians reasoning about two files instead of reading them
- `absent-value-rendered-as-real.md` — "0 claims" (nothing extracted) rendered as a terminal, downstream-unblocking status
- `stale-ledger-wal-and-disproven-receipts.md` — why the receipt must be re-measured with `VACUUM INTO`, not `cp`
