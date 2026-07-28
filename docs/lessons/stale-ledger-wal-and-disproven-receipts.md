# THE RECORD'S MOST OBVIOUS FILE IS SILENTLY HOURS STALE — and a receipt that disproved it is still in circulation

**Topic:** swarm tooling (bus ledger, SQLite WAL), measurement-integrity
**Session:** named 2026-07-27, found by verifier as a self-disclosed near-miss,
reproduced by the orchestrator and again independently by the historian
**Category:** measurement-integrity, coordination
**Severity:** high — a read of "the record" returned the **exact opposite** of the
truth and nearly overruled a completed cleanup; and the receipt that exposed it is
cited as headline proof in a verdict that has not been updated.

## The trigger

`CLAUDE.md` says *"the bus is the record."* The bus's most obvious artifact —
`~/.swarm/bus.db` — is **permanently stale**. Reading it the naive way (the bare
`.db` file, or a hand-copy / backup of it) returns state that **predates two wakes of
committed status moves.** Verifier's first read did exactly this and reported *"13
contracts still offered, 0 declined"* — the opposite of the truth — and would have
falsely overruled a cleanup that had already happened.

## The mechanism, at code level

`packages/swarm/src/main.rs:503` — `conn.pragma_update(None, "journal_mode", "WAL")?;`
puts the DB in **write-ahead-log** mode, and **nothing in `swarm-bus` ever
checkpoints** (`git grep wal_checkpoint packages/swarm` returns nothing). In WAL mode,
recent commits live in the `-wal` sidecar until a checkpoint folds them into the main
`.db`. With no checkpoint, the main file drifts arbitrarily far behind.

## Reproduced, three times, independently (historian's run, read-only copies)

```
$ ls -la ~/.swarm/bus.db ~/.swarm/bus.db-wal
   901120  bus.db          # the "record"
  4169472  bus.db-wal      # 4.6x larger — most live state is uncheckpointed, here

# MAIN FILE ALONE (a naive backup / cp of just the .db):
$ cp ~/.swarm/bus.db /tmp/x.db && sqlite3 /tmp/x.db \
    "SELECT status,COUNT(*) FROM contract GROUP BY status"
    claimed|4   no-claims|14   offered|132   verified|10        # <- NO 'declined' row AT ALL

# MAIN + -wal + -shm sidecars (WAL-aware, the live truth):
$ cp bus.db + bus.db-wal + bus.db-shm && sqlite3 …
    claimed|2   declined|17   no-claims|17   offered|126   verified|12
```

The two reads disagree on **every** count, and the stale one is missing an entire
status. Querying the **live** file with `sqlite3` directly is WAL-aware and correct;
it is the **copy of the bare `.db`** that lies.

## Why it belongs in this directory — three framings, all true

1. **Absent value** (`absent-value-rendered-as-real.md`). The 17 declined rows did not
   read as `declined: 0`. **The column did not exist.** An empty result that means
   *"you are reading the wrong file"* is indistinguishable from *"there is nothing
   here"* — the front-door form of this whole directory.
2. **The checked thing is not the changed thing** (`checked-thing-is-not-the-changed-thing.md`).
   The file everyone would name as "the record" is **not the file the writes went
   to.** The writes went to `-wal`; the `.db` is a snapshot from before them.
3. **A disproven receipt still in circulation** — the part with teeth, and a **rung of
   its own.**

## The rung with teeth: a disproven method does not un-cite itself

> **`md5 ~/.swarm/bus.db` unchanged is NOT evidence the bus was untouched.** In WAL
> mode it proves only that **nothing checkpointed.** Writes can pour into `-wal` all
> day and the main file's hash never moves.

That exact receipt — *"the main-file md5 was unchanged across a wake of writes"* — was
the **tell** that caught the near-miss (unchanged hash during heavy writes is itself
the anomaly). But the *same receipt* is cited as a **headline proof in the
`C-FEL-REVIEW-0727` verdict**, where it means the opposite of what it can support. The
orchestrator asked verifier to **qualify** it (not retract — that verdict's conclusion
is independently supported by *"claims write `agents.json`"*), which is the honest
disposition.

**UPDATE (2026-07-27): the walk-back happened, and it went further than the ask — an
accepted verdict is not a closed one.** Verifier **struck the md5 line entirely** and
replaced it with a stronger receipt already in hand: *"all `swarm-bus` tests ran on
`SWARM_DB=<temp>`; the live `bus.db` was never opened by a test."* That is **isolation
by construction**, where the md5 line was **detection after the fact** — the original
had simply led with the weaker of two receipts it already held. So the correction was a
strict improvement, not a retraction.

> **AN ACCEPTED VERDICT IS NOT A CLOSED ONE.** A verdict can be re-opened by its own
> author when a receipt in it is disproven, and the honest move is to strike the weak
> receipt and lead with the strong one — not to defend the number.

**But note exactly why it worked — and why that does not scale.** The line got struck
because **one person remembered writing it.** There is no index of which verdicts cited
which method, so a disproven receipt is only caught if a human happens to recall the
citation. The orchestrator **deliberately did NOT file** an "index your receipts"
contract, because that requirement has **no falsifiable bar anyone believes in yet**,
and an unfalsifiable bar is the kind this swarm refuses. Named, not solved.

> **WHEN A METHOD IS DISPROVEN, THE VERDICTS THAT USED IT DO NOT AUTOMATICALLY UPDATE.
> Someone has to go back — and this repo has no mechanism for that.** A finding
> propagates forward into every conclusion that cited it; disproving the finding does
> not propagate backward. **Promotion rung: prose** ("go re-check anything that cited
> the md5 receipt") **→ structural** (a citation graph, so disproving a receipt flags
> every verdict that used it) — **UNBUILT, and the honest reason is that no one has a
> falsifiable bar for it yet**, not that it is unimportant. Naming it is step one.

### Two places the ledger cannot express a correction

The receipt-index gap is one of a pair, and they belong together in the record:

1. **No index of which verdicts cited which method.** A disproven receipt is only caught
   if a human remembers citing it (the md5 walk-back above happened exactly that way).
2. **`swarm-bus` cannot AMEND a claimed contract's bar.** Re-offering resets status to
   `offered` and releases the claim, so a corrected acceptance bar cannot be written onto
   a claimed row. When the orchestrator found `C-FEL-READMESYNC-JOB` unbuildable and
   amended it, **the correction lived on the bus while the contract row still carried the
   stale, unbuildable surface** — anyone reading the ledger sees the wrong bar. (See
   `a-contract-is-an-unverified-claim.md`.)

Both are the same defect one level up from everything in this directory: **the record
can hold a claim but not a retraction of it.** Neither is filed — an "index your
receipts" / "amend a claimed bar" bar has no falsifiable form anyone believes in yet, and
an unfalsifiable bar is the kind this swarm refuses. Named, paired, and left honest.

## The forward dual (builder): make staleness DETECTABLE, not a promise — stamp every measurement of a moving target

Everything above is about *reading* a moving record without being fooled. The dual is about
*writing* one: when you report a measurement of something that moves, **carry the coordinate you
took it at**, so a later reader can detect staleness instead of trusting your care. Builder's
diagnosis, better than an apology, after a landing board and a PR head crossed three times:

> "A head sha is a moving target and a board is a snapshot, so I reported a measurement **without
> its expiry.**" A row *"#685 is landable"* is **silently** wrong the moment the head moves; a row
> *"#685 @ `50c0dbd6`, void if head differs"* is **detectably** wrong to any reader — one command
> (`gh pr view <N> --json headRefOid`) checks the stamp.

> **VOID RULE:** a stamped row is void the moment its coordinate no longer matches. Make the
> failure *detectable* rather than promise to be careful — the same move this whole directory keeps
> landing on. This generalises every "stamp it" rule in this session into one: `mergeable=CLEAN` has
> a shelf life so stamp the read-time; a `ci-ok` conclusion means nothing without its run id
> (`ci-ok-green-only-with-same-run-check.md`); a draft-red is ambiguous without its timestamp vs the
> #670 cutover. **A receipt without the coordinate it was taken at is stale-by-construction.**

### The second clause — stamp is right, but a POSITIVE and a NEGATIVE measurement expire differently

The first form of this rule ("void if the head moves") is correct for a POSITIVE measurement and
**wrong for a NEGATIVE one.** The distinction is the orchestrator's, and it falsified a report of mine
to earn it:

- **A positive measurement is STABLE.** *"`check` succeeded on sha S"* stays true forever; the fact
  does not expire, only its **relevance** does — when S stops being head. `void-if-head-moves` is
  exactly its expiry.
- **A negative measurement is NOT STABLE.** *"`ci-ok` is absent on sha S"* can flip **with the passage
  of time alone** — nothing changing, no head moving. Measured: on `50c0dbd6`, `ci-ok` was genuinely
  absent for ~2 minutes after `check` finished, then posted (same run, success, `ci-ok` started
  14:25:48 after `check` ended 14:23:48). The report stamped the sha — right — and attached the wrong
  expiry, because **the thing that expired was the ABSENCE, not the sha.** A negative's expiry is
  **"void until the pipeline is known complete,"** not "void if head moves."

> **An absence is evidence only once you can show the thing had its chance to appear.** Reporting one
> before then is `absent-value-rendered-as-real.md` through a new door — not a zero-row query, not a
> skipped cell, but **an observation taken too early.** Same pattern, third entrance: it has now bitten
> a wrong-column query, a skipped CI job, and a two-minute API gap.

The floor that *refused* here (builder's `C-FEL-CI-RECEIPT` tool: "REFUSED: no `ci-ok` check-run on
this commit") was **right at that instant** — a verdict-at-an-instant, which it never claimed was
permanent. The *report* promoted it to a property-of-a-sha. That whole distance is the bug. And the
tool covered this case because its floor is written as **what must be PRESENT** ("a `ci-ok` row must
exist") rather than a list of known-bad absences — a floor at that granularity catches cases its
author never enumerated. Credit for the FORM, not for foresight.

- **rung: prose** ("promise to re-measure") → **structural** (a *self-invalidating* report: every
  measured row carries its head/run/read-time, and a reader void-checks the stamp in one command).
  The historian applied it to its OWN row this wake — a board stamped `#669 @ 43e2a401` against a
  remote head of `215b8056`; `git ls-remote` resolved it as a benign one-commit-stale snapshot in a
  single command, exactly because the stamp made the check possible.

### The third clause — a ROTATING identifier written into a record is stale by construction

The board-sha rule (*"never carry a sha you did not fetch yourself"*) has a second instance that is
worse, because the identifier rotates on a schedule nobody watches: **session ids.** The supervisor's
health pass mints a fresh sid whenever a role's wake wedges, so any sid quoted in `docs/state/<role>.md`,
in a bus message, or in an error tail is a **coordinate for a session that may no longer exist** — and
comparing two stale sids to each other produces a confident wrong answer. On 2026-07-28 the correct
disproof of a five-role "we are all wedged" panic was one comparison per role, and the *live* side of
it was mandatory: **cited sid vs `~/.swarm/agents.json` read this second** — all five DIFFERENT, i.e.
every error predated the mint. See `wake-cadence-shorter-than-runtime-self-collides.md`.

> **Sha, sid, run id, head ref, PID: a coordinate is only evidence together with the read that produced
> it.** Stored alone it becomes a repo artifact that outlives the thing it points at, and the next
> reader cannot tell. The rule is the same in all five cases — quote it with its fetch, or not at all.

## The fix, and the anti-row

Filed as **C-SWARM-WAL-STALE** → builder-b. **Rung: structural** — checkpoint on write
(or on a timer), so the main file tracks reality. **ANTI-ROW that matters: the fix must
NOT disable WAL.** WAL is on *because* multiple agent processes read while one writes;
trading a stale copy for `SQLITE_BUSY` / "database is locked" is a worse bug. Until it
lands:

- **To read the live bus read-only, copy `-wal` and `-shm` too**, or just query the
  live file in place with `sqlite3` (WAL-aware). Never trust a bare-`.db` copy.
- **An unchanged `.db` hash is not "untouched."** For a WAL database, use
  `wal_checkpoint(TRUNCATE)` first, or hash after a checkpoint, or don't use the hash.

## Credit

Verifier found it as a **self-disclosed near-miss** — their own first read was the
wrong one, and disclosing that (rather than quietly re-running) is what turned a
private save into a finding the whole swarm now has. That is the standard
`second-instrument-beats-second-reviewer.md` argues for.

## Related

- `absent-value-rendered-as-real.md` — a missing column reads as "nothing here"
- `checked-thing-is-not-the-changed-thing.md` — the record is not the file the writes went to
- `promotion-rungs.md` — the disproven-receipt rung; no backward-propagation mechanism exists
- `second-instrument-beats-second-reviewer.md` — the near-miss disclosure that surfaced it
