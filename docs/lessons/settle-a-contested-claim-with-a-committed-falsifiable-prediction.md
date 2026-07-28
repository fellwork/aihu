# TO SETTLE A CONTESTED EMPIRICAL CLAIM, COMMIT A FALSIFIABLE PREDICTION WITH BOTH BRANCHES — NOT "BE MORE CAREFUL"

**Topic:** measurement-integrity, premature absence, durability of a test
**Session:** named 2026-07-28; the orchestrator named it "the closing of the premature-absence loop."
**Category:** process, measurement-integrity
**Severity:** high-leverage — this is the rung that actually worked after the same trap bit four roles.

## The trap it closes

**Premature absence:** an absence measured *before the mechanism had its chance to act* reads as
evidence the mechanism failed. *"An absence is only evidence once you can show the thing had its chance
to appear"* (`stale-ledger-…` void-rule second clause). In one day it bit **four roles** on one question
— whether a 16h daemon TTL actually fires:

- the orchestrator: "ceiling **hours** away" (extrapolated a rate with no departure process) — withdrawn.
- the historian: "**flat**, no clock" from a 68s window too short to resolve it — corrected.
- the architect: asserted the TTL **"is working"** from data where the oldest daemon was only 15h42m —
  *nothing had yet reached 16h.* Conceded: "real BY CONSTRUCTION" is a different claim from "OBSERVED TO
  FIRE"; I had only the first. **And went to settle it FOUR times believing it was due — every time it
  was not, always toward the confirming answer.**

Four capable people reaching early is not a discipline failure to fix with "be more careful" — **the
instrument was lying to all of them identically.** "Be more careful" has failed the moment more than one
careful person walks through the same door.

## The rung that worked

Not more care — a **committed, falsifiable prediction that carries its own expiry and BOTH outcome
branches**, so anyone can settle it in one command without having been present for the argument:

```
PREDICT: daemon spawned Jul 27 20:23:10 expires 12:23:10 (spawn + 16h).
SETTLE:  ps -eo pid,lstart,args | awk '$7=="node" && $8 ~ /live-daemon\.js$/ {print $3,$4,$5}' | sort | head -1
  MOVED past 20:23:10 after ~12:25  -> reaper fires, bound holds, R3/R4 stand.
  STILL 20:23:10 at 13:30           -> BOUND FALSIFIED, reopen R3/R4 at once.
```

Both branches were pre-committed to the repo (`docs/decisions/…daemon-leak-is-bounded-by-ttl.md`) **before
the answer was known**, so the doc did not depend on its author being awake to admit a falsification.
**Observed 12:23:20: the `20:23:10` daemon was GONE** (new oldest `20:28:23`) — within seconds of the
prediction, the whole pre-cutoff cohort cleared, survivors exactly the not-yet-due ones. Settled by a
role **with no stake in the answer**, which is the better provenance, in one second. Same move as the
`ci-receipt` VOID clause and the stamp-your-measurement void rule: **make the failure DETECTABLE, do not
promise to be careful.**

## Better still: an INVARIANT needs no clock — reach for it before a timed prediction

A timed prediction ("X happens at T") **requires waiting**, and waiting is exactly what invited four
capable people to reach for the confirming answer early. Builder supplied the sharper instrument: not a
second timed expiry but a **population INVARIANT** — *"no member of the population is older than the
TTL."* That is checkable **at any instant, by anyone, with no window to misjudge** — it removes the
reach-early bias *structurally* instead of asking anyone to resist it. Confirmed conclusive: **three
expiry-timed deaths matched prediction to within seconds (20:23:10, 20:28:23, 20:28:28), and zero
daemons survive past the cutoff while the survivors are exactly the not-yet-due ones** — the reaper as a
rule, not a lucky death. So: **when a claim can be phrased as an invariant, prefer it; keep the timed
prediction too, for the *different* virtue that it is settleable by a stranger — invariant first,
prediction second.**

## A BACKGROUND TASK IS NOT A RECORD

**Six watchers were killed with their sessions** before any of them resolved this — a background monitor
dies when its wake ends and leaves nothing behind. The committed one-liner outlived all six. **If a
result must survive session death, commit the TEST (with both branches), not a background job.** (The
historian has lost background monitors to session teardown repeatedly this session; same lesson, learned
the same way.)

## The rung

- **prose (FAILED — four times, four roles):** "be careful not to read an absence before its chance."
  It depends on remembering, and the whole point is that a lying instrument defeats careful people
  uniformly.
- **structural:** a contested empirical claim is resolved by a **falsifiable prediction with an expiry
  and both branches, committed to the repo** — detectable by one command, settleable by a stranger,
  independent of who is awake. Publish the prediction, not the opinion; and **check the clock before
  claiming the window opened** — reaching for the confirming measurement early is the same reach that
  authored the premature absence.

## Related

- `stale-ledger-wal-and-disproven-receipts.md` — the void rule and its second clause (a negative expires with time); this is the resolution method for one
- `per-session-daemon-leak-to-the-uid-ceiling.md` — the daemon question this settled; "a rate needs a series, a bound needs the source AND an observation"
- `ci-ok-green-only-with-same-run-check.md` — the ci-receipt VOID clause, the same make-it-detectable move
