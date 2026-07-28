# ONE QUESTION, FIVE MEASURED ANSWERS — a contested rate settled by READING THE SOURCE, not a longer sample

**Topic:** measurement-integrity, promptbook daemons, documented-but-unenforced invariants
**Session:** named 2026-07-28. The daemon-count question was measured five different ways by three
roles and got five different verdicts; it was settled by reading `session-start.js` and
`live-daemon.js`, not by anyone's time series. All source cites confirmed in-file by the historian.
**Category:** ops, resilience, measurement-integrity
**Severity:** medium — honest severity is **~1,100 × ~37 MB ≈ 41 GB of RSS held for nothing** (quote
that, not `fork()`); there is a slow clock but it is bounded by a 16 h TTL far below the ceiling.

## The five answers, and why they disagreed

| who | window / method | verdict | why it was off |
|---|---|---|---|
| orchestrator (first) | 2 points | "monotonic, ceiling **hours** away" | 2 points can't be a rate; withdrew it |
| historian (wake 27) | 1 later point, confirming | "a leak with a **deadline**" | confirmed an alarm from a single sample |
| historian (wake 28) | 68 s series | "**bounded corpse, flat, no clock**" | 68 s too short to resolve ~1/min; over-corrected |
| architect | 110 s + 5 min | "**no clock**, trajectory down" | basis weak (a `claude` process carries no sid in argv, so the liveness check could not show what it claimed) — self-corrected |
| orchestrator (7 min) | 431 s series | "**~35 h clock**" | longest sample; caught the slow arrival the short windows missed |

Every verdict was a real measurement and **the window chose the answer.** Two people over-alarmed, two
over-corrected (I was one), one longer baseline found the slow arrival. **None of the sampling settled
it** — the mechanism was in the code the whole time.

## What the source says — the answer no sample could give

```
session-start.js:150-164   spawn('node',[live-daemon.js, sessionId, sessionFile], {detached,unref})
                           UNCONDITIONAL — no check for an already-running daemon for this sessionId
live-daemon.js (hdr)       documents the invariant "spawned ONCE per session"
live-daemon.js:54          MAX_LIFETIME_MS = 16h
live-daemon.js:70-71,91    exits on session status completed/lost, OR at the 16h TTL
```

The defect is a **documented invariant with no enforcement**: "once per session" is written down and
nothing checks it, so every `SessionStart` spawns another daemon. `ce160f8f` has `prompt_count 1377`
→ ~1,016 daemons, one per start. They did not self-reap because that session's file shows
`status:"active", end_time:null` (last prompt 09:34) — **`SessionEnd` never fired**, so the
status-exit arm is unreachable and only the **16 h TTL** can collect them. The TTL cap is **structurally
robust** — `live-daemon.js:91` runs it as the FIRST statement in `tick()`, on in-memory `startedAt`,
ahead of any I/O that can throw — so the population is bounded by construction well below the 4,000
`kern.maxprocperuid` ceiling. A bound written in the source is **exact** where a rate from a window is
window-dependent; reading the code ended a debate no amount of sampling had.

**But "the TTL is WORKING" is still UNOBSERVED — the premature-absence door, again.** *"No daemon has
ever exceeded 16 h"* is TRUE and is **not** evidence the TTL fires: at measurement time the oldest daemon
was 15h42m — **nothing had yet reached 16 h.** That is an absence measured before the mechanism could
act (`stale-ledger-…` void-rule second clause; the same door builder hit three times). The honest form is
a **falsifiable prediction with an expiry**, which the orchestrator published: first TTL expiry ~12:23
today; if the anchored count has not begun dropping by ~13:30, the TTL is NOT firing and this reverses.
(And the drain is a WINDOW, not a date: the `ce160f8f` bolus spans 00:51→09:34, so it drains 16:51 today
→ ~01:34 tomorrow — 16:50 is when it STARTS, not finishes; an earlier telling inverted that.)

Architect adopted the anchor and amended my one-liner, and the amendment is the sharper form:
**a bound needs the source for its EXISTENCE and an OBSERVATION for its OPERATION** — "I had the source
and called it done." Real-by-construction (`live-daemon.js:54`; `:91` runs the cap FIRST in `tick()` on
in-memory `startedAt`, ahead of any throwing I/O — structurally reachable) is a *different claim* from
*observed to fire*. The prediction was **still open** as of the historian's own check at 12:21:57 EDT
(oldest anchored daemon still `Jul 27 20:23:10`; expiry `12:23:10` — **not yet due**, so no verdict; the
architect misjudged this clock twice by reaching for the confirming measurement early — the same bias that
authored the premature absence). Two roles set watchers to settle it; **all were killed with their
sessions** — so the architect banked the test *in the repo with both outcome branches pre-committed*,
because **a background task is not a record.** One command settles it for whoever is awake past ~12:25:
`ps -eo pid,lstart,args | awk '$7=="node" && $8 ~ /live-daemon\.js$/ {print $3,$4,$5}' | sort | head -1`
— moved → bound holds; still `20:23:10` at 13:30 → falsified, reopen.

## The counts were all CONTAMINATED — anchor the match to the process

Every daemon count published today, mine included, was **inflated by the observers measuring it.** Six
roles were grepping `live-daemon.js` in the same minutes, and **each role's own `ps`/`grep` command line
contains that string** — so the counters counted each other. The `[l]ive-daemon.js` bracket trick hides
*your* grep from *your* grep; it does **not** hide the other five roles' argv. Shown on my own machine:

```
ps -eo command | grep -c 'live-daemon.js'                                   -> 1135   (unanchored — counts observers)
ps -eo command | grep -c '^node /Users/smcguirt/.promptbook/hooks/live-daemon.js'  -> 1129   (anchored — real daemons only)
   … the Δ is the concurrent observers; anchored ce160f8f -> 1016, frozen.
```

> **When N observers measure a population by matching a string, and the observers' own commands contain
> that string, the observers contaminate the count — worst exactly when you are doing the right thing:
> independently verifying each other.** Anchor to what only the real process can match: `^node /abs/path…`,
> which no shell/grep line begins with. My wake-28 **"FLAT at 1116"** was doubly wrong — a trend claim
> from a 68 s window too short to resolve ~1/min, off a contaminated count — and I made it in the *same
> message* that banked "a rate needs a series." The direction held only because the dominant term (1016)
> really is static. The orchestrator and I made **opposite errors from the same bad instrument.**

## The two corrections that invert the obvious fix

1. **"93% is one dead session" is TRUE as composition and MISLEADING as cause** (orchestrator's
   correction to me). `ce160f8f` is ~91% of the *population* but ~**10% of the growth**: over a 7-min
   window it moved +1 while the total moved +10 — **9 of 10 new daemons are NEW live sessions.** So
   killing the ~1,019-daemon corpse buys ~12 h of runway and **does not stop the leak.** A reader who
   acts on the 93% number will believe they fixed it. My own shape below — *reap by live ground-truth,
   not the roster* — I failed to apply to my own headline number.
2. **The fix is a SPAWN GUARD, not a reaper** (architect's ruling). Check for a live daemon for this
   `sessionId` before spawning; return if present — idempotent, ~5 lines, fixes it at the source. And
   **REJECT "reap in the SessionEnd hook":** a `SessionEnd` reaper **cannot fire for a session that
   never ends**, which is *precisely* the leaking population (`ce160f8f`: active, `end_time` null).
   My wake-28 lesson named exactly that wrong fix. **Fixing the common case while missing the only case
   that leaks is worse than no fix, because it retires the alarm.**

## The durable shapes

- **A rate needs a time series — but a BOUND needs the source.** Wake 28 I banked "a rate needs a
  series"; the second clause is that when the mechanism (a TTL, a guard, a cap) is *in the code*,
  reading it beats any sample, because a bound is exact where a sample is window-dependent. Five
  windows gave five answers; one `grep` for `MAX_LIFETIME_MS` gave the ceiling.
- **A documented invariant with no enforcement is no invariant** — "spawned once per session" in a
  comment, spawned-every-start in the code, is the same header-vs-code contradiction as
  `gate-fix-armed-a-sibling-false-red.md` (the plan-a.yml comment that outlived its guard).
- **Cleanup on the path that fires is not cleanup for the path that leaks.** The reaper must key on
  what leaks (orphaned daemons whose session is really gone — PPID 1, `end_time` regardless of the
  `status` field which lies here), not on the clean-exit event that the leaking case never emits. Reap
  by live ground-truth, not the roster and not the session file's self-report
  (`the-audit-ledger-is-green-by-construction.md`).
- **Watch the ARRIVAL RATE, not the population.** ~1,100 static is not an emergency; re-escalate only
  above a sustained arrival rate (the swarm's threshold: ~2/min). The blast radius (`kern.maxprocperuid`
  is per-uid, so `fork()` starvation is uid-wide) is a true fact that argues for fixing the *slow*
  arrival on a calendar, not a countdown.

## The rung

- **prose:** don't report a resource trend from a short window when the cap is readable in the source;
  don't headline a *composition* figure (93%) as a *cause*.
- **structural:** the spawn guard (~5 lines, `session-start.js`), and it is the **same governance
  question** as the reconciler and the wake-backoff — three live SPOFs in `~/.swarm` / `~/.promptbook`
  with no repo, CI, or review. The orchestrator ruled these are **one escalation, not three**; the
  promptbook hook is genuinely out of reach and stays a note-with-a-deadline. Not urgent, not a DECIDE
  at this rate. I killed nothing (all measurement read-only).

## Related

- `stale-ledger-wal-and-disproven-receipts.md` — the void rule + the second clause (a rate needs a series); this adds a THIRD (a bound needs the source)
- `gate-fix-armed-a-sibling-false-red.md` — a documented invariant / comment that the code no longer honours
- `the-audit-ledger-is-green-by-construction.md` — reap/verify by live ground-truth, not the roster or a self-reported status field
- `wake-cadence-shorter-than-runtime-self-collides.md` — the sibling `~/.swarm` SPOF; part of the one-escalation-not-three
