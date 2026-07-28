# A TRIAGE QUEUE MIXED FROM TWO PRODUCTS IS PERMANENTLY ~10% NOISE

**Topic:** swarm coordination (Linear intake, triage)
**Session:** named 2026-07-27, escalated on contract C-FEL-433
**Category:** process, queue-integrity
**Severity:** low per pass, unbounded over time — nobody breaks; every triage pass
re-pays to re-discover the same noise.

## The trigger

The architect burned whole triage batches reading and discarding contracts that are
not aihu work at all. Measured by the orchestrator (not estimated):

```
127 contracts 'offered'
 19 carry an acceptance bar
 13 match exegesis / lexicon / commentary / Stripe keywords in their pulled Linear titles
```

Those 13 read as another **fellwork** product's work sharing the same Linear
workspace as aihu, so they surface in aihu's offer queue and get re-triaged every
pass — *"a real fraction of what triage keeps re-reading and discarding."*

## The mechanism

The offer queue is *"everything `offered` with an empty bar,"* filtered by no
product dimension. aihu and (apparently) a second product file into one Linear
workspace with no team/label separating them, so the selector cannot tell one
product's backlog from another's. The swarm's dedup precedents are keyed on
identity within one product — `packages/swarm/src/main.rs:1312-1344` CONFLICTs on a
reused `github_issue`/`linear` id — but nothing filters by *which product a contract
belongs to*.

## Why it will never get fixed on its own — the load-bearing part

> A cost that is **cheap per occurrence** and **paid by whoever happens to be
> triaging** is invisible to everyone with the authority to fix it. Nobody's wake
> fails; the queue just stays ~10% noise forever, and each triage pass silently
> re-discovers and re-discards the same 13 items. **Cheap-enough-to-live-with is
> exactly the property that guarantees it is never fixed** — unless someone with the
> product picture *decides* to separate them.

This is the sibling of the `bench`-red / warning-that-never-fails dynamic
(`checked-thing-is-not-the-changed-thing.md`, `hyphenless-custom-element-tags.md`):
a standing cost the system has quietly agreed to tolerate because no single instance
of it is worth stopping for.

## Promotion rung — and why the historian did NOT bank a skip-rule

- **prose (today):** triage re-reads and discards the 13 by hand each pass. Working,
  and permanently wasteful.
- **structural (the fix):** either a product dimension on the offer selector (a
  Linear team/label the selector filters on), or the two products split into separate
  Linear teams so aihu intake never sees the other. That is a `main.rs` sibling to the
  existing id-dedup, but keyed on **product**, not tracker id.

**The rung is not the historian's to pick, and the historian deliberately did not
bank a "skip these keywords" rule.** The keyword match (exegesis/lexicon/commentary/
Stripe) is a *heuristic*; classifying 13 contracts as "not aihu" on a keyword could
silently drop real aihu work — the exact absent-value failure this directory is about,
pointed at the intake queue. Whether these are a separate product, and how the
fellwork Linear workspace should be organised, is a **founder business fact** neither
the historian nor the orchestrator holds.

**Status: SCOPE-DECLINED, ROUTING STILL PENDING.** Escalated to the human as a
`blocked --question` on `C-FEL-433` (the one decision: are these a separate product,
and to where). This finding was banked *before* the decision so the recurring cost
did not evaporate.

**Update (same day):** the orchestrator executed the **scope** half — 13 non-aihu
contracts declined from the offered queue (`C-FEL-262/264/265/279/280/282/291/298/300/311/315/332/335`
— lexicon, exegesis, pericopes, Sefaria commentary, the Stripe `usr.profiles` bridge),
taking `offered` from 133 → 118, **non-destructively**: a decline classifies as `NoOp`
in the Linear sync, so the underlying issues persist untouched for their real owner.
This is the key separation the finding pointed at — **the SCOPE call ("not aihu work,
remove from this queue") an agent can make and verify; the ROUTING call ("where does it
go / how is Linear organised") is a founder business fact and stays in DECIDE.** The
prose rung was exercised for scope; the **structural** rung (a product dimension on the
selector, or split Linear teams) remains unbuilt and waits on the routing ruling.
Related mechanism, banked by the orchestrator in `docs/state/orchestrator.md` (#665):
`verify-merged` selects only `claimed/building/submitted/no-claims`, so an `offered`
contract with no claim is invisible to reconcile forever — which is *why* these 13 (and
the done/blocked items) recirculated through nine triage batches instead of clearing.

## The escalation was mishandled two ways — those are the transferable lessons

The scope finding above was banked correctly; the *escalation* of it was not, and the
orchestrator disclosed both errors. These generalise past this queue.

**1. It was sent up WHOLE when it could have been SPLIT.** The item had a scope half
("these 13 are not aihu work — remove them from this queue"), which an agent can decide
and verify, and a routing half ("where do they go / how is Linear organised"), which
needs a founder business fact. Sent as one atomic escalation, the founder-only half
**blocked the decidable half**, and the whole thing sat for a wake. Once split, the
scope half executed in minutes (13 declined, non-destructive) and only the routing
target stayed in DECIDE, blocking nobody.

> **An escalation that can be split should be.** A `blocked` that bundles a decidable
> part with a founder-only part inherits the latency of its slowest part. Rung:
> **prose** ("split escalations before sending") → **structural** (a `blocked` payload
> that carries a *decided-part* and a *pending-part* separately, so the decidable half
> never waits on the founder half).

**2. It was attached to a BORROWED contract.** The routing question went up with
`--contract C-FEL-433` — the plan-a.yml paths-filter contract, unrelated — because a
`blocked` requires a contract and that was a convenient handle. Two agents then attached
their routing responses to a contract a builder was **simultaneously shipping a PR
against**, tangling a product decision into a filter-fix thread. *"A ruling nobody can
find is not a ruling"* — this one could only be found in the wrong place. (I did this
too: my own `blocked --question` rode `C-FEL-433`.)

> **A `blocked` with no natural contract gets its OWN contract row, never a borrowed
> one.** Rung: **prose** (the convention) → **structural** (re-filed as
> `C-SWARM-QUEUE-ROUTING`; intake should mint a row for a homeless escalation rather
> than let it squat on an unrelated one).

A finding that is *correct* is worth little if it is filed where no one can act on it,
or bundled with something that blocks it.

## RESOLVED — the routing half was a LOOKUP, not a founder decision (correcting this file)

Everything above called the routing target *"a founder business fact neither I nor the
orchestrator holds,"* and left it DECISION-PENDING on Shane. **That was wrong, and it was
my unverified premise as much as the orchestrator's.** The answer was one GraphQL query:
the Linear FEL team already carries a `project` attribute — `aihu | data | web` — populated
on every issue (FEL-433/434/411 → aihu; the declined FEL-300/332/335 → data, FEL-311/262 →
web). It sat in DECIDE for two wakes because **neither escalator first checked whether the
fact was obtainable.** See `a-contract-is-an-unverified-claim.md` Instance 3: escalating a
lookup is a stall that looks like diligence. So the escalation-split lesson above needs a
second layer — *splitting scope from routing was right, but the routing half was then
mis-classified as founder-only when it was a query I never ran.*

**And the lookup produced a finding the question did not contain — front-door absent
value.** Of 144 open FEL issues (aihu 90 | **no project 24** | data 17 | web 13), the 24
with **no project set** include FEL-459/449/443/442/424/423/421/420/419 — **every one an
active aihu contract in our own queue.** So the *obvious* implementation of the correct
answer, `include-iff project == aihu`, would **silently drop nine active contracts** at
intake.

> **THE CORRECT ANSWER, IMPLEMENTED NAIVELY, IS A WORSE BUG THAN THE NOISE IT REMOVES.**
> A filter keyed on the right attribute still fails closed against the wrong value —
> "no project" is not "project == data"; one is definitely-not-ours, the other is
> **unclassified**, and collapsing them hides the 24 that need a ten-second human fix
> behind the 30 that do not.

**Ruled (architect design + one row), C-SWARM-QUEUE-ROUTING → a Rust builder:** filter on
`project`, include-iff `aihu`, **never read the title**; `sync --pull` emits **KEEP or
EXCLUDE + reason for every issue** (loud, never silent); **"no project set" is a DISTINCT
reason** from data/web; and a **must-fail row** asserts the no-project bucket contains
FEL-459/449/443/442/424/423/421/420/419 — if the implementation silently drops them, the
bar fails. The architect ruled the fail-loud direction *before* this measurement existed,
on principle, and the measurement vindicated it: that is the argument for **loud-not-silent
as the house style** — make the machine say what it excluded and why.

## Related

- `checked-thing-is-not-the-changed-thing.md` — a standing tolerated cost (bench-red) that trains ignoring
- `promotion-rungs.md` — the rung ladder; this one is stuck on prose pending a human routing call
- `main.rs:1312-1344` — the id-dedup precedent a product-filter would sit beside
