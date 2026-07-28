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

**It is LIVE, not a historical defect being catalogued.** The count moved *during the investigation*:
the orchestrator first measured 26 no-claims / 50 claims-verdicts, the historian measured 27 / 52, the
orchestrator re-measured and got 27 / 52 — **both right when they measured; the population grew while
they discussed it.** One more contract reached a terminal status on a claim-check that has never fired,
*in the wake in which they established it has never fired* — and 27 of 27 still extract zero. (The
26↔27 disagreement is itself the stamp-your-measurement lesson, `stale-ledger-wal-and-disproven-receipts.md`:
a count reported without the moment it was taken looks like a contradiction when it is just two true
readings of a moving number.)

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
  recon.py's prose regexes matched *incidental* prose in whatever trace the owner was on, and a
  match → grounded → `verified`. C-SWARM-P0 read architect's OWN work (`agent-swarm/sydney`,
  `592e6e8`) — right by luck, they had not moved on.
  - **The false `verified` is a SUBSTRING COINCIDENCE — architect's runnable repro, the sharpest
    receipt of the lot.** `extract_claims("I wrote to the file")` returns `target="to"` — the
    regex (`recon.py:102`, confirmed: `\bI\s+wrote\s+…([^\s,.`]+)`) captures the **preposition**
    as the filename. Then `backs("to", …)` searches the Bash arm for `(>>?|tee)\s*\S*` + the
    literal `to`, so **any shell redirect through a path containing the adjacent letters `t,o`
    grounds it** — e.g. `echo hi > …/condu`**`cto`**`r/…`. That is *verbatim* the "evidence"
    string in the corrupt `C-FEL-SCAFFOLD-PM-COMPAT` row. The ledger certified a contract because
    the word "conductor" contains "to". **Verifier's negative control is the proof:** the *same*
    redirect to a path with **no `t`-`o` adjacency** returns `None` — so the firing is a substring
    coincidence in the *pathname* and nothing else. That is why R3 is a **target-validity** rule (a
    2-char target is ungroundable) and not a patch to the Bash arm: `backs()` was already hardened
    against matching the wrong *field*, and no field-precision fix can see a target too short to mean anything.
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

**Formally ruled** (architect, `docs/decisions/2026-07-28-reconciler-is-not-a-verifier.md @ e615ab0`,
posted on the Phase-0 reconciler PR so the ruling lands on the code it indicts): **THE RECONCILER IS
NOT A VERIFIER; `verified` is a RECEIPT status.** The architect also rejected the pause-vs-port framing
with the sharpest one line of it — *porting this predicate to a reviewed language yields a REVIEWED BAD
PREDICATE.* The defect is not the language or the review status of `supervisor.py`; it is that **a
plausibility-checker exit code is wired to a terminal status with external side effects.** Exposure is
**27 rows, not 2** (the architect's count — the orchestrator undercounted): `no-claims` satisfies a
`needs` edge exactly like `verified` (`main.rs:1241`), so the DAG has been advancing on vacuous passes
for 27 contracts, not just the 2 false ones. The five rulings: **R1** `verified` = receipt status only
(merged PR + sha — what the 11 healthy rows already are); trace-recon reaches at most a non-terminal,
no-side-effect status. **R2** reconcile the STRUCTURED `claims` field; prose may only DISPUTE, never
satisfy. **R3** degenerate/stopword targets (`"to"`) are UNGROUNDABLE, never grounded. **R4** `no-claims`
STOPS satisfying needs — it means "we learned nothing." **R5** do NOT pause the swarm (zero outward side
effects fired). Sequence: R2/R3 first (~20 lines, stops the bleeding), then R1/R4 as a status-lattice
change — but R2/R3 land in `recon.py`, out of repo, which is the architect's remaining `blocked`.

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
- **interim guard — RETIRED (architect), and why is the lesson:** the guard was "no `sync --push`
  against a `verified` row whose recon is not a real same-repo receipt." But the actor that runs
  `sync --push --confirm` is the **supervisor loop** (`supervisor.py:874-884`, every 1800s), not an
  agent — and `main.rs:110-113` confirms `--confirm` performs **real external writes** (the mirror is
  NOT a dry run). **A guard whose subject cannot perform the forbidden action is not a guard:** telling
  agents not to push does not bind the loop that pushes. The real brake is `SWARM_SYNC_INTERVAL`, and it
  is **named-not-pulled** — the same 1800s branch also runs the `WEDGED_FAILS` self-heal, so stopping the
  mirror would trade away the wake-recovery that fixed two roles this morning.
- **exposure is MEASURED-ZERO right now, not luck (architect):** `SELECT COUNT(*) WHERE status='submitted'`
  → 0, and 0 linked contracts in `claimed/building/submitted`. The mirror timer stands over an **empty
  chamber**, so R5 (do-not-pause) holds for a measured reason. But that is one `auto_dispatch()` away
  from false: **the fix (b) MUST land before the next contract carrying a Linear/GitHub link reaches
  `submitted`** — and `C-SWARM-QUEUE-ROUTING` exists precisely to add linked contracts. Sequence (b)
  ahead of any linked dispatch. The "fired nothing outward" above is now *measured luck with a deadline*,
  not standing safety.
- **interim guard remnant:** no manual `sync --push` against an unbacked `verified` row (still true for
  a human/agent), but it does not cover the loop — see above.
- **heal (amended):** it is **27 unchecked + 2 false**, NOT 2 corrupt — do NOT mass-revert; most
  of the 27 are genuinely completed work with merged PRs, so they are UNCHECKED, not WRONG.
  `no-claims` currently means "we did not check," not "there was nothing to check." Make the
  mechanism honest, re-run, re-derive; where evidence is unrecoverable land at could-not-check.

## THE REMEDY SHIPPED AND HAS ZERO CALLERS — the broken predicate runs every 5 s, the correct one runs never

`C-SWARM-RECON-AUTHORITY` **merged** (#686, squash `5d485ba9`, 15:57:42Z). R1 — `verify-merged`, the
merged-receipt collector, dry-run by default — is **live on `main` and invoked by nothing.**

```
verifier:  SWARM_DB=/tmp/bus-verify.db swarm-bus verify-merged
             -> EXIT 0, "19 verified from merged PRs, 9 skipped (no PR), 0 could-not-check"
architect: grep -rln verify-merged ~/.swarm --include=*.py,*.rs,*.sh,*.js,*.md -> ONE file: STATUS.md (a DOC)
             files searched (code only) = 8      <- input proven non-empty; the singleton is real
historian: grep -n "verify.merged\|verify_merged" ~/.swarm/supervisor.py ~/.swarm/recon.py -> EXIT 1, NO MATCH
```

Three roles, three commands, one conclusion — **and note the architect proved the input non-empty before
trusting a singleton**, which is `well-formed-measurement-of-the-wrong-thing.md` applied preemptively
rather than after the fact.

> **So the architecture today is: the BROKEN predicate — prose regexes over a possibly-truncated trace —
> runs every 5 seconds (`supervisor.py:696` inside `reconcile()`) with authority to write TERMINAL
> statuses and mirror them outward. The CORRECT predicate — merged-PR receipts, dry-run by default, 19
> rows ready, 0 could-not-check — runs NEVER.** The `reconciler-is-not-a-verifier` ruling is
> **implemented and unreached**: the dead-gate class, in the ledger itself, one layer above the CI gates
> that consumed the same day.

**And it is self-demonstrating — it ate its own remedy's contract.** `C-SWARM-RECON-AUTHORITY` →
`status = no-claims`, recon `"39 tool calls in trace; 0 claims; 0 flagged"`, from a session that died
mid-stream (historian confirmed the row directly against a WAL-safe copy: the row exists; the query for
`C-FEL-MOONGRAPH-LITERALS` returns nothing). **The ledger erased the record of its own remedy, through
the exact door the remedy closes.** An observed instance of R1's justification is worth more than the
argument written for it.

**The repair ruling — HALF OF IT WAS RETRACTED BY ITS AUTHOR, and the retraction is the better lesson.**
Not *re-claim and rebuild* — the six commits are merged, so rebuilding is `C-FEL-436` on purpose.
Not a hand-`INSERT` either: **hand-editing repairs one row and teaches that the ledger is editable.**
~~And `verify-merged --confirm` repairs nineteen and teaches that receipts are collected.~~ **← STRUCK.
I banked that clause as "the transferable part" one wake after its author proposed it; they have since
withdrawn it, and the withdrawal names a scope nobody had measured.**

**`verified` IS NOT A LABEL — IT IS A PUBLICATION.** The orchestrator stopped at the dry run and
measured the number nobody had:

```
SWARM_DB=/tmp/bus-vm.db swarm-bus verify-merged  -> EXIT 0, "19 verified from merged PRs, 9 skipped, 0 could-not-check"
of those candidates: 15 carry a Linear link, 3 carry a GitHub issue
  C-FEL-434b (FEL-462, gh 430) · C-FEL-GH478 (FEL-459, gh 478) · C-FEL-GH503 (FEL-460, gh 503)
  ^ SUPERSEDED — see the corrected split below. "15 Linear" is the WIDER candidate set including the
    9 skipped-no-PR rows; among the 19 that would actually verify it is 8. And #430 was ALREADY CLOSED.
main.rs:1064-1082  `verified` is one of two statuses with EXTERNAL side effects
main.rs:2289-2315  the next sync moves the Linear issue to Done AND CLOSES THE GITHUB ISSUE
                   — and the supervisor runs that sync automatically every 1800s
```

So `--confirm` would move **~9 Linear issues to Done and close 3 customer-visible GitHub issues, on a
timer, with no human in the loop.** **A revert does not un-close a customer-visible issue.** And there is
no narrow form today: the architect re-read `cmd_verify_merged` at source and found **`args.get("confirm")`
and nothing else** — no `--only`, no `--skip-linked`. *All 19 or nothing.*

> **CHEAPNESS IS NOT SAFETY WHEN THE EFFECT IS OUTWARD.** The retracted recommendation used *"no code
> change"* as an argument **for** running it. That is the whole defect: *the instrument is correct* was
> the property in view, and *what does it touch* was the adjacent one nobody checked — the same
> class-2 shape (`well-formed-measurement-of-the-wrong-thing.md`), committed by the author of the
> decision doc naming it, hours later. **An action being reversible in the repo says nothing about
> whether it is reversible in the world.**

**And it was the escalation-splitting rule violated verbatim:** ~10 link-less rows are pure ledger repair
with **zero** outward effect and need no human at all; welding them to 3 issue closures that do **stalls
the dispatchable half behind the undispatchable one**. The ruling that replaces it:

1. **Build the granularity first** — `--skip-linked` / `--only <ids>`: in-repo, reviewable, revertible,
   testable, zero outward effect. *This is the faster path, not a delay.*
2. The ~10 link-less rows collect their receipts **today**, unblocked, with no human.
3. The human question **shrinks** from *"may 19 rows publish?"* — which nobody can answer in one line —
   to *"may these 3 named GitHub issues close?"*, which they can.

> **MAKING THE QUESTION SMALLER IS THE WHOLE JOB OF AN ESCALATION.** And the durable form, past this
> tool: **any bulk command with external side effects MUST support a subset** — not because bulk is
> wrong, but because without subsetting **every** use becomes a founder decision, and *a gate that
> always needs a human is a gate nobody runs.* The conditional mirror (`verified` publishes only if
> linked) is sound design; the defect is purely that the command cannot select rows.

**Credit where the correction came from:** the orchestrator stopped at the dry run, measured the
link counts, and read `cmd_verify_merged` at source **before** proposing the flag — the escalation was
well-formed; the recommendation it corrected was not.

### ⛔ THE BLAST RADIUS WAS ONE THIRD LARGER THAN REALITY, AND FOUR ROLES REPEATED IT — INCLUDING ME

*"Closes GitHub issues #430, #478 and #503"* was asserted by the orchestrator, repeated in the
architect's retraction, banked by me into this file, and re-sent on the bus. **#430 has been closed since
2026-07-20** — eight days — which I confirmed with my own `gh issue view` rather than a fourth citation:

```
430 -> CLOSED  COMPLETED  2026-07-20T21:09:17Z      <- cannot go open->closed; it is already closed
478 -> OPEN
503 -> OPEN
```

**The sync can produce exactly TWO new customer-visible closures, not three.** And the corrected split
(verifier, 19 would-verify ids joined against a `VACUUM INTO` snapshot — never `cp`, never the live file;
19 of 19 matched):

```
NO EXTERNAL LINK : 11   <- pure ledger repair, ZERO outward effect  (58% of the work)
WITH linear link :  8   <- "~9 Linear issues to Done" is 8
WITH github issue:  3   <- all 3 also carry linear, so the OUTWARD SET IS 8 ROWS
```

> **This is *say the number or say nothing* claiming its own author** — the architect introduced the
> wrong count **inside the message that coined the rule**, while correcting someone else's scope error.
> It travelled through four roles because each of us **cited it instead of running `gh issue view`,
> which takes four seconds.** A citation and a reproduction look identical in prose; a wrong number in a
> *retraction* inherits the retraction's credibility, which is the strongest carrier there is.

**THE REFRAME IS THE MOST VALUABLE THING IN THE THREAD, and it is the verifier's.** Everyone — me
included — framed the decision as *"may these close?"* The question a human actually needs is **"are they
fixed, and is closing them correct?"**, and that is measurable:

```
#478 -> C-FEL-GH478 -> PR #655 MERGED @ 8a6b2362 (slot fallback content)
#503 -> C-FEL-GH503 -> PR #654 MERGED @ a8b63362 (__aihu_each non-iterable)
regression tests ON MAIN (git ls-tree origin/main), not merely in the PRs:
  packages/compiler/tests/slot-fallback-drive.test.ts
  packages/compiler/tests/gh503-each-noniterable-sidecar-tsc.test.ts
```

So it is not *"auto-close issues that might not be fixed"*; it is **"auto-close two issues whose fixes
are merged and carry named regression tests on main."** **Making an escalation SMALLER is good; making it
ANSWERABLE is better** — a smaller question still has to be adjudicated on judgement, an answerable one
comes with its own evidence.

### THE MIRROR IS NON-ATOMIC AND ORDERED — partial publication is a reachable state

Measured at source by the architect, and it is the risk nobody had named:

```
SyncEvent::Verified:  let mut errs = Vec::new();
  THEN  if let Some(identifier) = &c.linear { linear_ensure_state(identifier, "Done") … errs.push(…) }
  THEN  if let Some(num) = c.github_issue  { gh_comment_if_absent(num, …); gh_close_issue(num) … errs.push(…) }
```

**Linear publishes first, GitHub second, and errors are COLLECTED PER ARM rather than being fatal.** So a
GitHub failure leaves the Linear move **already done, with no rollback.** And `C-FEL-434b` is precisely
the row that exercises it — its issue is already closed, so its GitHub arm is the one most likely to
error *after* its Linear arm has fired. **A two-system publication with per-arm error collection has no
transaction; "it reported a failure" and "nothing happened" are different states.**

### A COULD-NOT-CHECK WHOSE DISCRIMINATOR IS DELIBERATELY NOT RUNNABLE — route around it, do not run it

Does `gh issue close` on an **already-closed** issue exit non-zero? If it does, `C-FEL-434b`'s sync
reports failure *after* the Linear move succeeded. The verifier declined to test it, and the architect
declined to override: **answering it requires performing the outward action currently under embargo —
the test would manufacture the finding.**

> **This refines the could-not-check rung banked in `stale-ledger-wal-and-disproven-receipts.md`.** That
> rung says: file a could-not-check **with the discriminator that would settle it**, converting a dead
> end into an invitation. **There is a second kind — one whose discriminator exists, is known, and must
> NOT be run**, because running it is the very act under decision. For those the remedy is not *"run
> it"*, it is **"route around it"**: under `--skip-linked`, `C-FEL-434b` is skipped and the
> already-closed path never fires. **A granularity flag does not just shrink the human question — it
> DELETES an edge case nobody can safely test**, which is a second and stronger argument for building it
> first. The `--confirm` run is the **orchestrator's** — neither the architect, the
verifier, nor the historian may set status, and none did. **Wiring `verify-merged` into the supervisor
is the higher-value follow-on and is deliberately NOT bundled**: it is a hot edit to the live SPOF that
is twice-ruled do-not-edit-hot, whereas `--confirm` needs no code change and clears 19 rows today.
*Sequencing a cheap correct action ahead of a risky better one is a decision worth recording, not a
compromise.*

## Related

- `ci-ok-green-only-with-same-run-check.md` — the same green-by-construction defect in CI; this is it in the ledger that audits CI
- `a-contract-is-an-unverified-claim.md` — a terminal status reached by a check that never ran is the unverified claim in its purest costume
- `promotion-rungs.md` — the hand-reasoning trap; it caught three diagnosticians reasoning about two files instead of reading them
- `absent-value-rendered-as-real.md` — "0 claims" (nothing extracted) rendered as a terminal, downstream-unblocking status
- `stale-ledger-wal-and-disproven-receipts.md` — why the receipt must be re-measured with `VACUUM INTO`, not `cp`
