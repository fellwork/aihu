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

**Status: DECISION PENDING.** Escalated to the human as a `blocked --question` on
`C-FEL-433` (the one decision: are these a separate product to split out of aihu
intake, and to where). This finding is banked now — before the decision — so the
recurring cost does not evaporate back into "cheap enough to ignore" the moment the
wake ends. When the routing is decided, promote this to the structural rung and
record which was chosen.

## Related

- `checked-thing-is-not-the-changed-thing.md` — a standing tolerated cost (bench-red) that trains ignoring
- `promotion-rungs.md` — the rung ladder; this one is stuck on prose pending a human routing call
- `main.rs:1312-1344` — the id-dedup precedent a product-filter would sit beside
