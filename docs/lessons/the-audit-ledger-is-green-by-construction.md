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

So `--confirm` would move ~~**~9 Linear issues to Done and close 3 customer-visible GitHub issues**~~
**← WRONG TWICE OVER; corrected below to 8 Linear, TWO closures (#478, #503), and one COMMENT on #430.
Left visible because the wrong number is what four roles carried. The original sentence read:** on a
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

### THE NUMBER MOVED A THIRD TIME — and the residue is a COMMENT, not a closure

`gh_close_issue` is **guarded**, which nobody had checked before building on it. Read at source, literal
sha, by me as well as by the verifier and the architect:

```rust
/// Close a GitHub issue unless it is already closed (idempotent).
fn gh_close_issue(number: i64) -> Result<(), String> {
    let data = gh_issue_view(number, "state")?;
    if state.eq_ignore_ascii_case("closed") { return Ok(()); }     // ← EARLY RETURN
    gh_run(&["issue", "close", &n, "--repo", GITHUB_REPO])?;
}
```

**So `gh issue close` is never invoked on #430 at all.** But the arm above it is not guarded against the
same thing in the same way: `gh_comment_if_absent(num, &marker, &body)` runs **first**, and #430 carries
no swarm-sync marker. **Final outward set: two state changes (#478, #503) plus ONE COMMENT posted to a
customer-visible issue that has been closed since 2026-07-20.** Small, public, on a resolved ticket, and
it belongs in the human's question rather than being found afterwards.

> **A number that has been corrected twice is not thereby correct.** This one moved three→two→two-plus-a-comment,
> and each correction was made by someone who had read one more line of the function than the last. The
> tell for "we are still guessing" is not disagreement — by this point everyone agreed — it is that
> **nobody had opened the function.**

### ~~THE MIRROR IS NON-ATOMIC AND ORDERED — partial publication is a reachable state~~ → non-atomic WITHIN a run, CONVERGENT across runs

Measured at source by the architect, and it is the risk nobody had named:

```
SyncEvent::Verified:  let mut errs = Vec::new();
  THEN  if let Some(identifier) = &c.linear { linear_ensure_state(identifier, "Done") … errs.push(…) }
  THEN  if let Some(num) = c.github_issue  { gh_comment_if_absent(num, …); gh_close_issue(num) … errs.push(…) }
```

**Linear publishes first, GitHub second, and errors are COLLECTED PER ARM rather than being fatal.** So a
GitHub failure leaves the Linear move **already done, with no rollback.** ~~And `C-FEL-434b` is precisely
the row that exercises it — its GitHub arm is the one most likely to error.~~ **← FALSIFIED: that arm is
the one *guaranteed not to run the close*, per the guard above. A hazard was built on an unread
function.**

**And the consequence implied — durable divergence — is WRONG.** `load_sync_contracts` is
`SELECT … FROM contract WHERE linear IS NOT NULL OR github_issue IS NOT NULL ORDER BY id` — **no
`synced`/`last_synced` column, no filter** (I read it myself at `1bb0dd7c`) — and all three writers are
guarded (`linear_ensure_state`, `gh_comment_if_absent`, `gh_close_issue`). **A partial publication
SELF-HEALS on the next 1800 s tick.** The correct statement is **non-atomic WITHIN a run, CONVERGENT
ACROSS RUNS**: *"no rollback"* is true, *"divergent"* is not.

### THE PROPERTY THAT MAKES IT SAFE IS THE PROPERTY THAT MAKES IT ENFORCE — it is not publication, it is enforcement

Measured, not asserted: `classify` matches on **`status` alone** —

```rust
fn classify(status: &str, recon: &str, note: &str) -> SyncEvent {
    match status { … "verified" => SyncEvent::Verified, … }
}
```

**It is a pure function of the CURRENT STATUS. Not a transition, not an edge.** Combined with a
re-select of every linked row every tick, **`SyncEvent::Verified` fires every 1800 s for every verified
linked row, forever, for as long as the row says `verified`.**

> **The idempotency that makes a partial publication self-heal is the same mechanism that re-asserts the
> outcome against a human.** Reopen #478 by hand and `gh_close_issue` sees `state != closed` on the next
> tick and **closes it again, within thirty minutes, silently.** This is *by design* — the neighbouring
> function is documented as *"Reopen a GitHub issue unless it is already open (idempotent) — the FEATURE
> 3 reopen guard's primitive"*, so bidirectional enforcement is intended. **A convergent reconciler has
> no way to distinguish drift from disagreement.** Its safety property and its override property are one
> property, and you cannot keep the first while declining the second.

**So the human's question is one notch more honest than any of us first put it, and the recovery path is
the part that is invisible from outside:**

> **not** *"may #478 and #503 close, and 8 Linear issues move to Done?"*
> **but** *"may #478 and #503 be **HELD** closed — re-asserted every 30 minutes for as long as their
> contracts read `verified` — plus one comment posted to #430, closed since 2026-07-20?"*
> **The recovery path is not "reopen the issue"; it is "change the contract status" — the ledger, not
> GitHub.** Anyone who reopens the ticket and watches it shut will look for a GitHub cause and find none.

**And it strengthens the flag on the argument that was always sound:** the 11 link-less rows **never
enter the enforcement loop at all** — `load_sync_contracts` does not even SELECT them. 58 % of the work
is not merely outward-effect-free today; it is **permanently outside the mirror.**

**Two precisions on the above, both from the verifier reading the arms individually.** `classify`'s
`recon` and `note` parameters **never influence which arm is taken** — they only build the reason string
inside the `DISPUTED` arm, so **a human cannot stop the mirror by annotating a row**; only the `status`
column is a lever. And the cadence is a **default, not a constant**: `supervisor.py:866`
`sync_interval = float(os.environ.get("SWARM_SYNC_INTERVAL", "1800"))`. State it to a human as **"at
least every 30 minutes, configurable"**, never as a fixed number.

### STATE IS ENFORCED, COMMENTS ARE ONE-SHOT — and the Linear side is FOUR TIMES the surface being argued about

The outward profile is **not uniform**, which nobody had drawn:

| arm | function | semantics |
|---|---|---|
| Linear state | `linear_ensure_state` :1652 | looks up current state, mutates unless already target → **re-asserts Done forever** |
| GitHub state | `gh_close_issue` :1822 | same shape → **re-closes forever** |
| comments | `gh_comment_if_absent` :1808 / `linear_comment_if_absent` :1673 | scan for `<!-- swarm-sync:<id>:verified -->`, return early if present → **one comment per issue, ever** |

So #430 receives **one comment total, not one every 30 minutes** — the difference between a footnote and
a spam incident, and now proven rather than assumed. **And the surface is lopsided: 8 Linear rows HELD in
Done against 2 GitHub issues HELD closed.** The whole thread argued about the two closures; **the
enforcement property applies four times more often on Linear.**

### ⛔ THE IDEMPOTENCY GUARD IS CAPPED AT 50 — my "convergent by idempotency" was CONDITIONAL, and I banked it as unconditional

I banked *"non-atomic within a run, convergent across runs"* as the corrected, settled statement. **It is
conditional.** Verified at source myself, `git show 1bb0dd7c:packages/swarm/src/main.rs`:

```rust
:1677  linear_comment_if_absent
       "query($id:String!){ issue(id:$id){ comments(first:50){ nodes { body } } } }"
       // no cursor, no pageInfo, no ordering clause

:1562  linear_issue_list                                  // ~100 LINES AWAY, IN THE SAME FILE
       "... pageInfo { hasNextPage endCursor } ..."
       let mut after: Option<String> = None;  …  after = cursor;    // a real pagination loop
```

If the marker comment falls **outside the first 50**, the guard reports **absent**, posts again — and
does so **every sync cycle, forever, unattended, on a customer-visible ticket.** That is the worst
outward failure mode in the system, and it lands on the **Linear** side, the larger surface.

> **`if_absent` returned "absent" because it read a TRUNCATED VIEW.** This is *a ranked or collapsed view
> is not an enumeration* — the class this swarm hit three times in its own tooling the same day (the `gh`
> rollup omitting a job that ran, a top-N listing turning 3.6 cores into "~2", my own `/tmp` collision) —
> **now found inside the idempotency guard that the entire convergent-and-self-healing argument rests
> on.** The fourth instance is the one that could write to a customer's ticket.

**And the correct pattern being 100 lines away in the same file is what makes this a DEFECT rather than a
limitation.** Pagination is not a missing capability here; it is implemented, correct, and simply not
used by this guard. *When the right pattern already exists in the file, "the API only gives you a window"
stops being an explanation.*

**Corrected statement, replacing mine:** **state is enforced UNCONDITIONALLY; comments are one-shot
CONDITIONAL ON A NUMBER NOBODY IS WATCHING.**

**⛔ AND THE CONDITION IS MEASURED — I BANKED THIS AS "DELIBERATELY NOT RUN" AND IT HAD ALREADY BEEN RUN.**
I filed it as *"a could-not-check with its discriminator, correctly unrun because it needs a Linear read
against the system under embargo."* **Wrong on the premise: a Linear GraphQL query is a READ.** The
verifier ran exactly the discriminator they had named, read-only, no mutation — and then had to say so
twice, because the architect, the orchestrator **and I** all carried it forward as still-open:

```
FEL-411  1   FEL-428  2   FEL-431  9  <- max   FEL-433  0
FEL-434  1   FEL-462  1   FEL-459  1   FEL-460  0        (re-read 22:08:18Z, identical to 20 min earlier)
MAX = 9 OF THE 50 WINDOW.  ~5x headroom.  Each verified sync adds at most one comment.
```

**The cap is LATENT, not live. It is not a reason to hold anything**, and my framing of it as the
system's worst outward failure mode should not be read as a present danger. It should still be
paginated — *a guard whose correctness depends on a number nobody watches is a guard with a timer on
it* — and the paginated pattern is 100 lines away.

> **THE EMBARGO IS ON WRITES, NOT ON LOOKING.** This is the second could-not-check category
> (*discriminator exists but must not be run*) **misapplied** — nobody checked whether the discriminator
> was itself a write. Before filing that category, **ask what the check actually does**: `gh issue view`,
> a GraphQL `query`, a `git show` are all reads, and this thread used the first of those freely all day
> while calling the second unrunnable. **A category-2 filing needs its own one-line justification —
> "this discriminator MUTATES X" — or it is category 3 wearing category 2's caution.**

### THE ENFORCEMENT IS ANCHORED TO A FACT CHECKED EXACTLY ONCE

The sharpest property in the thread, found by the architect and confirmed at source by the verifier and
by me — `cmd_verify_merged` says it in its own comment:

```rust
:2767  // The status filter IS the "not already verified" + idempotency
:2769  // contract this command already promoted is never reselected.
:2772  WHERE status IN ('claimed','building','submitted','no-claims')     // 'verified' DELIBERATELY ABSENT
```

**Nothing ever re-examines an already-verified row.** It promotes *into* `verified`; nothing promotes
*out*. Combine that with `classify` being pure on current status and every linked row re-selected every
tick, and: **if PR #655 were reverted tomorrow, `C-FEL-GH478` would still read `verified`, #478 would
still be re-closed every cycle, and a human reopening it would still be overridden inside thirty
minutes.** The enforcement **outlives its own justification** and nothing re-derives.

> **THE LEDGER STATUS RECORDS A HISTORICAL EVENT — "this PR merged" — WHICH REMAINS TRUE FOREVER. THE
> OUTWARD MIRROR INTERPRETS IT AS A PRESENT-TENSE CLAIM — "this issue is resolved" — WHICH DOES NOT.**
> A revert separates them, and only the historical reading is ever re-checked. This is not a defect in
> `verify-merged`: `verified` is an honest receipt. **It is a mismatch between what the receipt MEANS
> and what the mirror PUBLISHES**, and it is invisible to anyone who has not read `classify()`.

**So "yes" means HELD CLOSED UNTIL SOMEONE EDITS THE LEDGER — not "held closed while the fix is in
main."** Those sound identical to a reasonable person, and the second is what they would assume they
were agreeing to. *When an authorisation's duration is set by a mechanism the authoriser cannot see,
the duration belongs in the question.*

**And the fix has two halves that must not be scoped as one** (verifier's precision, worth copying as a
practice): adding `verified` to that `IN`-list so the merged-receipt check re-runs on the sync path is
**one string**; **the demotion path — what happens when the re-check fails — does not exist and is the
real work.** *Naming which half is a token and which half is a design problem is how an estimate stays
honest.*

### ⛔ `DISPUTED` MIRRORS OUTWARD AND IS **NOT** GUARDED — the destructive direction has LESS protection than the constructive one

This corrects the R1 ruling this swarm acted on all day, and the architect corrected it against
themselves after the orchestrator found the incident. The published claim was *"`verified` and
`no-claims` are the two statuses with external side effects"*, with the tradeoff *"fail direction = NOT
DONE, which is conservative."* **Two different sets were conflated:**

```
REQUIRES --reconciled : {verified, no-claims}      :1093 — and only `verified` mirrors
MIRRORS OUTWARD       : {verified -> Done + close,  DISPUTED/unverified -> In Progress + REOPEN}
                        :2399 linear_ensure_state(identifier, "In Progress")
                        :2425 let reopened = gh_reopen_issue(num)?
```

**So `DISPUTED` publishes outward and passes through no `--reconciled` guard at all.** The *destructive*
outward action is less protected than the constructive one — the inverse of what any safety design would
choose.

> **A CONSERVATIVE DEFAULT IS ONLY CONSERVATIVE IF THE DEFAULT IS INACTION. WHERE BOTH DIRECTIONS
> PUBLISH, THERE IS NO SAFE DIRECTION TO FAIL IN — THERE IS ONLY A CHOICE OF WHICH LIE TO BROADCAST.**
> *"Fail toward not-done"* is sound for an **inward ledger** and false for an **outward mirror**, where
> "not done" is itself an assertion: it reopens a customer-visible issue and drags a ticket out of Done,
> unattended, on the timer. The ruling argued the safety of the tradeoff from **absence**; the system
> implements it as an **assertion**.

**R6, new and stricter than what it replaces: no trace-derived predicate may write ANY status that
mirrors outward — in either direction.** *"Non-terminal"* was never the right test; **the right test is
"does it mirror."** `DISPUTED` is non-terminal **and** it publishes.

**And the self-diagnosis is the part that generalises:** *"Two of my own measurements, in one file,
contradicting each other, and I held both."* The Flagged arm had been read **the previous wake** while
pricing the demotion path, and was never connected to the two-statuses claim. **Measurements do not
collide on their own — nothing in a notebook cross-checks page 3 against page 9.**

### THE INCIDENT THAT PROVED IT — `DISPUTED` written onto the best-evidenced contract in the repo, from an English phrase

```
C-FEL-GATE-WIRING-RUNS  | DISPUTED  | recon: FLAG wrote that "I wrote that"  <- no backing tool call
                                      160 tool calls in trace; 1 claims; 1 flagged
C-FEL-CREATE-GIT-STATUS | no-claims | 162 tool calls in trace; 0 claims — while the work is IN FLIGHT
```

A prose regex matched the words *"wrote that"* inside a message, failed to find a tool call backing that
phrase, and stamped **DISPUTED** onto the contract carrying four sabotage CI runs, a re-run verifier
PASS, a fourth palette variant caught unprompted, and this repo's first production reproduction of the
#649 defect. **The claim extractor is reading English and scoring it as a ledger verdict.**

**Three-for-three, and every one would have been prevented by R3** (ungroundable degenerate extractions
— *"I wrote that"* is the same shape as `target=to` grounding against a path containing *"condu-cto-r"*):
`C-SWARM-RECON-AUTHORITY` (no-claims from a 39-call fragment of a session that died),
`C-FEL-GATE-WIRING-RUNS` (DISPUTED from a phrase), `C-FEL-CREATE-GIT-STATUS` (no-claims over live work).
**Nothing fired outward only because both rows were minted without `--linear`/`--github-issue`. That is
luck with a timer standing over it — the third time that sentence has been written about this system in
one day.**

**The repair, and the line drawn in it, are worth copying**: `setstatus` to `claimed` / `offered` — both
**non-terminal AND `NoOp`-mapped**, restoring the state the *agent* actually established — and an
explicit refusal to touch `verified`/`no-claims`, which need `--reconciled` and are never the
orchestrator's. **The asymmetry with `C-SWARM-RECON-AUTHORITY` is principled, not convenient:** there the
correct instrument existed and would repair 19 rows properly, so hand-editing was refused; **here the
promotion path has no reverse, and a false `DISPUTED` left in place is a loaded gun pointed at the first
person who adds a `--linear` link.**

### ⛔ A COULD-NOT-CHECK MUST NOT PUBLISH OUTWARD — AND IT SHARES A TOKEN WITH A FINDING, SO IT DOES

Architect's ruling, `docs/decisions/2026-07-28-a-could-not-check-must-not-publish.md`. The previous
section established that `DISPUTED` mirrors outward through no `--reconciled` guard. **It is not alone in
that arm.** Every citation below re-read by me at `origin/main` `1bb0dd7c`:

```rust
main.rs:2120   "DISPUTED" | "unverified" => { … SyncEvent::Flagged(why) }
main.rs:2145   _ => SyncEvent::NoOp,          <- the vocabulary ALREADY EXISTS (offered/no-claims/declined)
```

And **every producer of `unverified`, in both languages, is a could-not-check** — three sites, and the
supervisor's own module docstring says so in words:

```
supervisor.py:665   "unverified  — trace unreadable: could-not-check, NEVER silently 'verified'"
supervisor.py:690   no transcript / no verdict body -> --status unverified --recon "could-not-check: …"
supervisor.py:731   recon exit N                    -> --status unverified --recon "could-not-check (recon exit N)"
main.rs:1178        adjudicate_merged Err(reason)   -> ("unverified", "could-not-check: {reason}")
```

> **THE PRODUCER DOCUMENTED THE SEMANTICS CORRECTLY AND THE CONSUMER'S `match` ARM LOST THEM.** This is
> the part that generalises past this system. Nobody was confused: `:665` names the meaning exactly, and
> names the failure it exists to prevent. But **a docstring is not part of the token** — the consumer
> pattern-matches on the six characters, and `"DISPUTED" | "unverified"` puts a statement about the
> *instrument* into the arm reserved for a finding about the *work*.
>
> **DURABLE RULE: COULD-NOT-CHECK NEEDS ITS OWN VOCABULARY.** If it shares a token with a finding, some
> consumer downstream eventually acts on it **as** a finding — and *the consumer that acts is rarely the
> one you had in mind when you chose the token*. Rung: prose (say it) → **structural (a distinct status,
> and the `_ => NoOp` arm it belongs in already exists — could-not-check was simply never put in it)**.
> Generalised design rule: **when you add a status or a flag, the question is not "what does it mean" but
> "what will every consumer's `match` do with it." A token is a contract with consumers you have not
> met.**

**Third instance of one-mechanism-two-semantics**, now a class: `draft` meaning both *"unfinished"* and
*"do not check"*; a remote referent serving as both *enforcement* and *one-shot guard*; now `unverified`
meaning both *could-not-check* and *finding*.

**FOURTH INSTANCE, AND IT IS ONE `match` ARM AWAY IN THE SAME FILE: `no-claims`.** It means *"the
instrument found nothing to check"* — written `if vacuous`, i.e. when the extractor pulled zero claims —
**and** it means *"this dependency is satisfied"*:

```
supervisor.py:707   st = "no-claims" if vacuous else "verified"        <- the sole writer
main.rs:1316        Some("verified") | Some("no-claims") => {}         <- cmd_ready's needs loop
live: 30 rows carry no-claims
```

> **A VACUOUS PASS PROMOTED TO A DEPENDENCY EDGE.** `cmd_ready` treats *"we extracted nothing"* exactly
> like *"a merged receipt cleared this"* — so the weakest possible evidence and the strongest are the same
> token to the DAG. This is R4 (`no-claims` stops satisfying `needs`), still unbuilt, and its being unbuilt
> **constrains the ORDER of everything else**: any guard that declines to emit a status on a health fault
> stalls the DAG until R4 lands. **A defect that cannot be fixed first is not merely open — it is a
> sequencing constraint on every fix that touches the same token.**

**The trigger condition is LIVE, and the mechanism is a string that does not resolve.** On the `:690`
path **`recon.py` never runs** — the status is written because `os.path.exists()` failed on a path
derived from the registry's `cwd` field. The architect ran `supervisor.py`'s own `_transcript()` for all
six roles: five FOUND, `orchestrator` MISSING, its derived project dir *never having existed* (real
sessions live under `-Users-…-aihu-little-rock/`, 42 entries). **A path string that does not resolve
reopens a published issue.** Not overclaimed: supervisor *wakes* are self-consistent (`:400` reads the
cwd, `:355` spawns there); it is **interactive** sessions — opened wherever a human opened them — that
the registry never learns about. **The registry `cwd` is an unvalidated assertion**, which is the fourth
face of `stale-ledger-…`'s rotating-coordinate clause: not stale, *never validated*.

**SECOND RULING — `_transcript()` is rule 0 sitting in the reconciler's trace loader.** It fails toward
`None` for two indistinguishable reasons: *the agent did no work*, and *we looked in the wrong place*.
**A role whose derived project dir does not exist is a SUPERVISOR-HEALTH fault, not a contract verdict**
— decline to write any status and alarm, the same refuse-to-pass-vacuously discipline
`check-gate-wiring.ts` already ships.

**RULED:** `unverified` → `NoOp`; **`DISPUTED` KEEPS `Flagged`.** The line is exact and worth copying:
`DISPUTED` = recon exit 1 = *a claim with no matching tool call* = **a finding about the work**, so
reopening is defensible. `unverified` = *the check did not run* = **a fact about the instrument**, which
must not publish. **Rejected: splitting by arm** (suppress only `gh_reopen_issue`, keep Linear *In
Progress*) — doubles the mirror vocabulary and still lets a could-not-check write outward.

**Two pieces of intellectual honesty in the ruling, recorded because they are the reusable part.**
(1) **"This is a design change, not a bug fix, and I say so"** — `:2419-2433` documents the reopen as
FEATURE 3 and `:3087`/`:3102` are tests *asserting exactly what is removed*. The argument is made **on
the feature's own premise**: the closure rests on a **merged receipt**, and an unreadable transcript is
not evidence that a PR unmerged. **Beating a feature on its own premise is a stronger move than
outweighing it**, and it is what makes deleting a documented behaviour reviewable rather than
high-handed. (2) **Scope priced past the visible half** — *"~10-15 lines; `:3072`/`:3087`/`:3102`/`:3123`
encode the old behaviour and must be INVERTED; **the tests are the work**"* — offered with *"I have
mis-priced by the visible half twice."* **A one-line diff whose tests assert the opposite is not a
one-line change**; the count that matters is *what asserts the current behaviour*, not what implements
it.

**Exposure is ZERO, twice over** (`submitted` = 0, the only status reconcile selects; and `orchestrator`
owns 0 contracts) — **latent, not live**, so **no DECIDE was filed and nobody should hold one.** In-repo,
reviewable, revertible, and it *reduces* outward writes ⇒ dispatchable, not founder-shaped. The
`supervisor.py` half stays a hot edit to the live SPOF and **do-not-edit-hot still stands.**

### THE DEMOTION PATH IS NOT A STATUS WRITE — IT IS AN OUTWARD UN-PUBLICATION

I banked *"the demotion path is the real work"* and stopped there. The architect went and read what a
demotion would actually **do**, and it is worse than *work*. Confirmed at source by me:

```rust
:2405  let moved = linear_ensure_state(identifier, "In Progress")?;   // never Done  <- pulls Linear OUT of Done
:2425  let reopened = gh_reopen_issue(num)?;                          <- REOPENS the GitHub issue
       // the code's own comment: "Reopen guard (FEATURE 3, symmetric with the Verified arm's close)"
```

So re-deriving `verified` on the sync path means: **a heuristic decides a PR's content is no longer on
`main` → the ledger demotes → the mirror REOPENS A CUSTOMER-VISIBLE ISSUE and drags a Linear ticket back
to In Progress, unattended, on the same 1800 s timer.** That is not a safety net bolted onto an existing
check. **It is a second automated outward channel, firing in reverse, on a guess** — and it deserves
exactly the scrutiny the forward channel just received across five revisions.

**And its most likely failure mode is already documented in this repo, by the same author, from the same
day:** any re-derivation must ask *"is this work still on `main`?"*, and **sha-based instruments return
confident FALSE NEGATIVES after a squash** — `git log main..branch` → 6 commits **forever**,
`--is-ancestor` → exit 1 for landed work (`checked-thing-is-not-the-changed-thing.md`). **A re-derivation
built on that instrument would reopen CORRECTLY-CLOSED customer issues.** The content-comparison form is
the only sound one, and it is materially harder than the check it would replace.

> **THE HABIT, named by the architect against themselves the second time in one day: "I PRICED A CHANGE
> BY THE PART I COULD SEE."** On `--confirm` they argued *for* it on *"no code change"* and missed that
> it was a publication. Here they argued a follow-on was *cheap* because the **check** exists, and missed
> that the **action** does not. **Both times the invisible half was the OUTWARD one** — which is not a
> coincidence: the outward half lives in a different system, so it is absent from the diff, absent from
> the test run, and absent from every instrument a reviewer reaches for first. **When estimating a change
> that touches another system, price the write, not the read.**

### THE DESIGN RULING — the two arms have OPPOSITE semantics and are using the SAME mechanism

| | intended semantics | referent | verdict |
|---|---|---|---|
| **state** — *"hold this Done/closed"* | enforce forever | the **remote** | **correct** — for state the remote *is* the truth, and re-asserting is the feature |
| **comment** — *"say this exactly once"* | at most once | the **remote**, through a truncated window | **wrong mechanism** |

> **"Have I already done this once" is a fact about OUR OWN HISTORY, not about the remote's current
> contents — and we have a database.** A guard for a **one-shot** action must consult a referent that is
> **complete and monotonic**; a remote's first-50 window is neither.

**And the missing `synced` column has a good face and a bad one, so the fix must be surgical:** its
absence is exactly *why* state enforcement works (every linked row re-processed every tick) **and** why
the comment guard is forced to re-derive from the remote. **Do NOT add a blanket `synced` column — that
would break the enforcement, which is deliberate and desirable. Record the COMMENT-POSTED fact
specifically: one column for the one-shot arm, leaving the state arm re-asserting.**

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
