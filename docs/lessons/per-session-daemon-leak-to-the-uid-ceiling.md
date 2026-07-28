# A PER-SESSION DAEMON NOBODY REAPS + A 25s WAKE = A MONOTONIC LEAK WITH A DEADLINE

**Topic:** swarm supervisor, promptbook SessionStart hook, OS resource limits
**Session:** named 2026-07-28; filed by the orchestrator as a founder DECIDE (machine-wide),
totals + growth re-measured live by the historian
**Category:** ops, resilience
**Severity:** high (deferred) — not blocking any contract today, but on a monotonic path to the
per-uid process ceiling, and what breaks there is `fork()` for **every** process the uid owns, not
one role. "Cheap today, an outage tomorrow" is exactly why it is banked before it fires.

## The measurement (live, read-only — it is GROWING)

```
ps -u <uid> | wc -l          1506   (orchestrator measured 1462 minutes earlier — climbing)
kern.maxprocperuid           4000
live-daemon.js processes     1110   (orchestrator: 1095 — climbing)   = ~75% of all procs the uid owns
oldest daemon                15h+ elapsed, still alive
```

Each is `node ~/.promptbook/hooks/live-daemon.js <session-id> …`, ~37 MB, **one spawned per
SessionStart.** The path is the tell for whose bug it is: `~/.promptbook/`, **outside this repo** — the
fix is in the promptbook hook, not in `swarm-bus` or `supervisor.py`.

## The mechanism

Every wake's SessionStart spawns a daemon; **nothing reaps it when the wake dies.** And wakes fire
every ~25s (`wake-cadence-shorter-than-runtime-self-collides.md`) — many of them dying on the session
collision described there — so the daemon count grows **monotonically**, one leaked process per dead
wake, with no ceiling but the OS's. At the current rate the 4000 limit is hours away.

**93% of the leak is ONE dead session** (`ce160f8f…`, per the orchestrator's by-session breakdown)
that is **not in `agents.json`** — orphaned, with no owning role. That is the part that makes it
un-self-healing: anything that reaps by iterating the registry will **never find it**, because it is
not in the registry.

## Three shapes worth extracting

1. **An unreaped per-invocation resource under a high-frequency scheduler is a leak with a deadline.**
   The fast wake cadence is not a separate bug here — it is the **amplifier**: it sets the *rate* of a
   leak whose *existence* is the missing reaper. Same cadence, second distinct outage.
2. **A cleanup that runs only on the SUCCESS path leaks one resource per failure.** The daemon is
   presumably torn down on a clean SessionStop; the wakes that leak are the ones that **crashed**
   (the collision storm is a crash generator). Reapers must run on the failure path, or they protect
   only the case that never needed them.
3. **An orphan outlives every registry-keyed remedy.** A resource with no owning role in `agents.json`
   is invisible to any sweep that starts from the roster. The reaper must key on **what actually
   exists** (live daemons whose session is dead), not on **what the registry says should exist.** This
   is the audit-ledger defect's cousin (`the-audit-ledger-is-green-by-construction.md`): trusting the
   roster over the ground truth.

## The blast radius, stated plainly

`kern.maxprocperuid` is **per-uid**, not per-process-group. So a leak from one component exhausts
`fork()` for **everything the uid runs** — every role, both interactive sessions, the supervisor
itself. **A shared hard ceiling is a shared fate:** the component that leaks is not the component that
dies first; whoever next calls `fork()` does.

## The rung

- **prose (today):** watch the count — `ps -u <uid> | wc -l` against `sysctl kern.maxprocperuid`, and
  the `live-daemon.js` share of it — and do not read a stalled role as its own bug when the real cause
  is uid-wide `fork()` starvation.
- **structural (the fix, and it is a founder call because it is machine-wide and outside this repo):**
  reap the daemon in the promptbook **SessionStart/Stop hook, on the failure path as well as the
  clean one**; and/or a periodic **orphan sweep** that reaps `live-daemon.js` processes whose session
  is gone from `agents.json`, keyed on live processes not on the roster. A one-shot `kill` of the 1,016
  is the emergency lever, not the fix — it recurs on the next dead wake.

## Not the historian's to action

Filed as a `blocked`/DECIDE: whether to kill now, and where the reaper lives, are the founder's calls
— machine-wide, affecting both interactive sessions, and outside this repo. Banked here so the pattern
is recognised the next time a role "mysteriously" cannot spawn, which is what uid `fork()` starvation
looks like from inside one role.

## Related

- `wake-cadence-shorter-than-runtime-self-collides.md` — the same ~25s cadence; there it causes collision, here it sets the leak rate
- `the-audit-ledger-is-green-by-construction.md` — reaping-by-roster is the same trust-the-registry-over-ground-truth defect
- `launchd-path-and-throttle.md` — sibling supervisor-resilience incident
