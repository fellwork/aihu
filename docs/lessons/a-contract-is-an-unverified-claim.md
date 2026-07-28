# A CONTRACT IS AN UNVERIFIED CLAIM WEARING THE COSTUME OF A SPECIFICATION

**Topic:** swarm coordination (contracts, acceptance bars), measurement-integrity
**Session:** named 2026-07-27, after the second unbuildable-premise contract of the day
**Category:** process, measurement-integrity
**Severity:** high — an unbuildable contract shipped as a spec; the only thing that
caught it, both times, was a builder checking the premise *before* building.

## The shape

Every acceptance bar in this system demands the **builder** prove their work. **Nothing
demands anyone prove the CONTRACT** before work starts. So a contract's premise — *this
is buildable, these constraints are compatible, this is the right surface, the cheap
path is actually cheap* — enters the ledger as an assertion nobody has run, and it looks
**identical to a verified specification.**

> A contract premise is as falsifiable as a code claim. It is just never tested, because
> the entire verification apparatus points *downstream* of it — at the output, never at
> the spec.

## Instance 1 — the rule-writer's own contract was unbuildable (C-FEL-READMESYNC-JOB)

The orchestrator specced the fix for *"the PR that writes the rule it violates"*
(`promotion-rungs.md`) with two constraints: (1) a cheap always-on job, **no `bun
install`** — *"`sync-readme --check` needs only bun and the repo"*; (2) **do not touch
`scripts/sync-readme.ts`.** They cannot both hold — verified against source:

```
scripts/sync-readme.ts:29   import { rolldown } from 'rolldown'   # STATIC, top-level
:274                        const bundle = await rolldown(…)       # the ONLY call — MEASURE path
:32 / :1476 / :1506         --check only READS the committed __bundle-sizes.json cache
empirical (builder): mv node_modules/rolldown aside -> `--check` exits 1, "Cannot find package rolldown"
```

`--check` reads a committed JSON cache and **never calls the bundler**, yet the static
top-level import loads it anyway. To run `--check` cheaply you need an install (constraint
1 forbids) or a lazy import (constraint 2 forbids). The orchestrator asserted *"needs only
bun and the repo"* **from reading WHICH SCRIPT IT WAS, not from running it** — the
identical hand-reasoning failure as the glob trap (`promotion-rungs.md`), one layer up,
and committed **by the person who wrote the rule against it.** Ruled (b): make the import
lazy, amend the surface.

## Instance 2 — same shape, different cost (C-FEL-434)

The C-FEL-434 contract's framing implied a naive un-elide of client-target agent
metadata. The builder **blocked rather than building it** — and that refusal is the only
reason a deliberate security posture (client-JS elision) was not reversed. The naive
reading would have shipped policy to browsers.

**Two for two.** The pattern is not "builders are careful." It is that **a contract is an
unverified claim wearing the costume of a specification**, and the only thing between a
wrong premise and shipped harm is a builder who checks it and sends `blocked` instead of
silently picking a constraint to drop.

## Instance 3 — an escalation premise: a lookup escalated as a founder decision

The orchestrator's **second** unverified premise this session, same root as Instance 1.
`C-SWARM-QUEUE-ROUTING` — where the 13 non-aihu contracts route — sat in the founder
DECIDE bucket for **two wakes**, escalated as *"a business fact I do not have; it depends
on how you want the Linear workspace organised."* It was answerable with **one GraphQL
query**: the Linear FEL team already carries a `project` attribute — `aihu | data | web` —
populated on every issue (FEL-433/434/411 → aihu; FEL-300/332/335 → data; FEL-311/262 →
web). The workspace was **already organised the way the question asked about.** Nobody had
to decide anything.

**And the historian escalated the same lookup.** My `C-FEL-433` blocked asked Shane *"are
these a separate product, and to where,"* calling the routing target *"a founder business
fact neither I nor the orchestrator holds."* I could have queried the `project` attribute
and did not. Two escalators, one un-run query — recorded because a lesson that names only
the orchestrator reads as blame, and this one was mine too.

> **"Escalate what depends on a business fact you do not have" has an UNSTATED
> PRECONDITION: first establish that the fact is not AVAILABLE to you.** Escalating a
> lookup is not caution — it is a stall, and it is *worse than a wrong answer because it
> looks like diligence.* It is the hand-reasoning trap (`promotion-rungs.md`) pointed at
> your own position: a conclusion reached by reasoning about what you have rather than
> running the query. **Rung: prose → structural** — an escalation should have to name
> *what was checked* before it may assert the fact is unobtainable, the same way a
> `blocked` must name its question.

**The root under Instances 1 and 3 is one:** both were unverified premises of the person
who **holds builders to a premise check they were not applying to themselves.** The
builder's pre-build premise check is the discipline; the spec-writer and the escalator owe
the identical check to their own claims.

## Instance 4 — one layer below: a DISPATCH that created no contract row (C-FEL-MOONGRAPH-LITERALS)

Instances 1–3 are contracts whose *premise* went unchecked. This one never became a contract at all.
The orchestrator dispatched `C-FEL-MOONGRAPH-LITERALS` **in a bus note** and named a claim command for
it; builder ran `swarm-bus claim --id C-FEL-MOONGRAPH-LITERALS` → **exit 2, "no contract."** The row was
never created — the typed boundary refused it, because creating a contract requires `--issue`
(*"a contract without a bidirectional acceptance bar is a wish, not a contract"* — the tool's own
words). So builder's real, correct work has a `--contract` **the ledger has never heard of** and may
land nowhere.

> **A dispatch in prose is not a contract; a contract is a validated ledger ROW with an acceptance
> bar. A dispatch that creates no row is a WISH.** The intent looked identical to a real assignment —
> the same costume Instances 1–3 wear one layer up, worn by the *assignment* rather than its *premise*.

Two things done right, worth copying: builder **read the exit code** (`claim` → exit 2) and flagged it
rather than proceeding silently on a `--contract` that does not exist — the typed-boundary-rejection
discipline. And the orchestrator **declined to invent an `--issue`** to satisfy the validator — that is
the false-link trap ruled on for `C-SWARM-P0` (a fabricated link is *worse* than a missing row, because
**the missing row is visible** — the same visible-absence-over-manufactured-presence direction this
repo keeps choosing). The row is left in DECIDE for a real issue to be filed; the work is not redone.

## The rung

- **prose / discretionary (today):** the pre-build premise check is a good builder's
  habit. It paid both times. But it is *discipline, not enforcement* — a builder who
  skips it and drops a constraint leaves no trace that the premise was ever wrong.
- **structural:** the **pre-build premise check is the first `must_fail` row of every
  contract.** The contract does not accept until someone has demonstrated the premise
  holds — constraints compatible, surface real, the "cheap" path actually cheap. **A bar
  that only tests the output cannot catch a premise that was wrong before work began.**

To every builder (the orchestrator's words): keep checking the premise, and keep sending
`blocked` instead of dropping a constraint silently. Both times, it paid.

## Two adjacent findings

- **Accidental coupling**, its own line: a read-only path that loads a bundler it never
  calls — a static import at the top of a file that *grew* a second mode. Nobody designed
  it; it is invisible until someone tries to run the cheap half somewhere cheap. Cheap to
  fix (lazy import), and the fix carries its own trap →
- **The lazy-import trap**, banked in the fix's `must_fail`: with `rolldown` absent,
  `--check` must **SUCCEED** and the measure path must **FAIL LOUDLY**. A dynamic import
  inside a `try/catch` turns a measurement into a **silent no-op** — the absent-value
  family (`absent-value-rendered-as-real.md`), a *worse* outcome than the coupling it
  replaced. Removing a coupling must not introduce a silence.

## Related

- `promotion-rungs.md` — the hand-reasoning trap this is one layer up from; the rung ladder
- `absent-value-rendered-as-real.md` — the lazy-import-in-`try/catch` silent no-op
- `stale-ledger-wal-and-disproven-receipts.md` — the ledger tool-gap: it cannot express this correction either (a claimed bar can't be amended)
