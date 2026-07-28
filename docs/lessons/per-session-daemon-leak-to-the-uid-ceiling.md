# A RATE REPORTED FROM TWO POINTS IS NOT A RATE — the "monotonic leak" was a bounded corpse

**Topic:** measurement-integrity, swarm supervisor, promptbook daemons, OS resource limits
**Session:** named 2026-07-28. Filed by the orchestrator as a "monotonic leak, ceiling hours away,"
**confirmed by the historian on a second point** — and both were **wrong**. The architect re-measured
with a time series and a liveness check and found a bounded corpse; the historian then reproduced that.
**Category:** ops, resilience, measurement-integrity
**Severity:** medium — the alarm was the defect. There is a real but slow reaping target underneath it;
there was never a deadline.

## The correction, and it is the whole lesson

The orchestrator reported 1,016 orphan `live-daemon.js` processes "growing monotonically, ceiling hours
away." The historian **confirmed the direction from a single later sample** (1462→1506 total,
1095→1110 daemons) and banked "a monotonic leak with a deadline." Both readings were real numbers and
**both conclusions were false**, for one reason: **a rate was inferred from two points taken at
different times.** Two point-samples of a noisy quantity cannot distinguish *growing* from *flat with
jitter*, and cannot tell a *running leak* from a *static corpse*.

The architect took the measurement that settles it — a **time series plus a liveness check**:

```
architect, 6 samples over 110s:   total 1102→1103→1104→1103→1103→1103   ce160 1017→1017→1017→1016→1016→1016
historian, 5 samples over 68s:    total 1515,1519,1502,1506,1504 (±jitter)   live-daemon.js = 1116 EVERY sample
liveness:  ce160f8f has NO live `claude` process; its daemons are all PPID 1; session file last touched 09:34
```

Flat-to-decaying within the window, and the source is **dead**. Session `ce160f8f` — 93% of the count —
is a **bounded corpse**: its owning `claude` exited, its daemons reparented to PID 1, and a dead session
**spawns no new daemons**, so there is **no clock**. At ~1,116 daemons of a 4,000 `kern.maxprocperuid`
ceiling, with the dominant term static, nothing is "hours away."

> **A trend is not a measurement you can take once.** "Growing / monotonic / N hours to the ceiling"
> is a claim about `d(count)/dt`; it requires samples *over time*, and it requires checking that the
> **producer is still alive** — a dead producer cannot leak. The historian stamped the *value* (the
> `stale-ledger` void rule) but reported a *rate* it had not sampled. Point-value and rate-of-change
> are different measurements; one does not imply the other, and confirming a scary number is not
> confirming the scary story attached to it.

Two people made the point→rate error (the orchestrator, then the historian confirming it); one took
the time series and was right. The diligent measurement beat the alarmed one — the same standard the
weak-mismatch and same-run rules are built on, here pointed at a false positive instead of a false green.

## What is actually true underneath (the non-urgent residue)

- **The `ce160f8f` corpse (93%) is not growing** — it is reaped only when someone kills it or reboots.
- **There is a slow background accumulation** from *live* sessions: total drifted ~1,103→~1,509 across
  the ~4h between the architect's and historian's windows. That is real and worth reaping, but it is
  **days, not hours**, and it is not the corpse.
- **The durable fix is reaping in the promptbook SessionEnd hook** (`~/.promptbook/`, outside this
  repo) — on the failure path, not only the clean one, since a crashed wake is exactly what orphans a
  daemon. A one-shot `kill` of the 1,016 clears the corpse but does not stop the slow drift.

These are still worth stating because two of them generalise:

1. **A cleanup that runs only on the SUCCESS path leaks one resource per failure.** Reap on the crash path or you protect only the case that never needed it.
2. **An orphan outlives every registry-keyed remedy.** A daemon with no owning role in `agents.json` is invisible to any sweep that starts from the roster; reap by **live ground-truth** (processes whose session is dead), not by the roster — the cousin of the audit-ledger's trust-the-roster defect (`the-audit-ledger-is-green-by-construction.md`).

## The blast radius is real, the imminence was not

`kern.maxprocperuid` is **per-uid**: if it were ever exhausted, `fork()` fails for *everything the uid
runs*, and the leaker is not who dies first — whoever next calls `fork()` is. That is a true and worth-
knowing property. It is also **not a reason to read a static 1,116/4,000 as an emergency.** Keep the
blast-radius fact and drop the deadline; the fact is what makes the *slow* drift worth reaping before it
ever matters, on a calendar, not a countdown.

## The rung

- **prose:** never report "growing / N to the ceiling" from fewer than a short **time series**, and
  check the **producer is alive** before projecting; a single alarming point is a point, not a trend.
- **structural:** a monitor that reports resource pressure should emit **rate from ≥3 samples and a
  liveness flag on the top producer**, so "corpse" and "leak" are distinguishable at the source — and
  reap orphaned `live-daemon.js` in the promptbook SessionEnd hook (founder's call; machine-wide, out
  of repo). I killed nothing (all measurement read-only).

## Related

- `stale-ledger-wal-and-disproven-receipts.md` — the void rule stamps a value; this adds that a *rate* needs a *series*, and an absence/trend expires differently than a value
- `ci-ok-green-only-with-same-run-check.md` — a measurement read too early / at one instant misreports; same family, other direction
- `wake-cadence-shorter-than-runtime-self-collides.md` — the ~25s cadence that *was* wrongly blamed as this leak's "rate"
- `the-audit-ledger-is-green-by-construction.md` — reap/verify by live ground-truth, not by the roster
