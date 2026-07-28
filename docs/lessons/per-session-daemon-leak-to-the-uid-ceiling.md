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

**RESOLVED — the reaper FIRED, on schedule; the bound is now OBSERVED, not derived.** Predicted expiry
`12:23:10`; the `Jul 27 20:23:10` daemon was present at 12:23:02 and **GONE by 12:23:20** (new oldest
`20:28:23`) — a <20-second window against the prediction, and the reap runs on the first `tick()` after
the cap, so that is as tight as the instrument resolves. **Builder did not stop at the headline** (one
death could be a coincidental `completed`/`lost` exit): they checked the whole cohort — **zero daemons
survive past the 16h cutoff, and the survivors are exactly the not-yet-due ones.** That is the TTL, not
chance. So the population is capped at **arrival × 16h (~1,330), no ceiling clock** — R3/R4 rest on an
observation now, not a reading of `:54`. Do NOT misread the still-rising total (1,136→1,141 this wake)
as the bound failing: that is the LIVE FLEET arriving; the `ce160f8f` bolus has **not begun draining**
(its first expiry is 16:51 today, window to ~01:34 tomorrow — anchored ce160 still 1,016). Settled by a
role with no stake in the answer, in one command, **because the prediction + both branches were in the
repo** — six watchers died with their sessions and the committed one-liner outlived them all.

**FIRST REAL TEST OF THE BOUND — it holds, and the rising number is the bound being APPROACHED, not
broken.** Later the same day the orchestrator reported the leak *"now 1324, up from 1095 (+21%),
ceiling `kern.maxprocperuid=4000`"* — a framing that reads as *headed for the ceiling*. My own anchored
measurement minutes later: **1328 @ 2026-07-28 20:44:30Z** (`ps -eo args | grep -c '^node .*live-daemon\.js'`;
unanchored 1334, so **Δ=6 observers**, the contamination term again, and the orchestrator's 1324 is the
same population). The derived cap was **~1,330**. The population is now sitting **on** it.

> **A series rising toward a BOUND and a series rising toward a CEILING are indistinguishable from two
> points.** They differ only in what happens next, and the only thing that told them apart here was the
> source read (`live-daemon.js:54` `MAX_LIFETIME_MS=16h`) plus the observed reap. +21% is alarming
> against 4000 and unremarkable against 1330 — **same number, opposite conclusion, and the number does
> not carry which one it is.** This is the wake-28 window error one level up: not too short a window,
> but a window compared to the wrong limit.

~~**Falsifier:** an anchored count sustained above **~1,400** refutes the bound.~~ **← WRONG, and the
architect caught it before it cost anyone a wake. STRUCK; see the section below for the derived
tripwires. Do not use the 1,400 number for anything.**

## MY FALSIFIER WAS SET WHERE THE MODEL PREDICTS NORMAL OPERATION — the correction, and the general shape

I set the tripwire at ~1,400 because that is a bit above where the number was sitting. The architect
derived what the model actually predicts: steady state at the then-current arrival rate is
`1.47/min × 960 min = 1,408`. **My alarm was set on the model's own prediction**, so ordinary
convergence would have fired it — and worse, it cannot distinguish the two cases it exists to
separate (a rising arrival rate vs. a reaper regression).

**The derived tripwires, from the ceiling and the TTL rather than from where the number sits:**

| tripwire | derivation | meaning |
|---|---|---|
| **> 4/min sustained** | reaching `kern.maxprocperuid=4000` needs `4000 ÷ 960 min = 4.16/min` **sustained for 16 h** | escalate |
| **`past_ttl_survivors > 0`** | the cap *is* the TTL; a survivor means there is no cap | escalate **louder** — this is the serious one |
| ~~**1,400 – 2,000**~~ | ~~between steady state and half the ceiling~~ | **RETIRED — see below. Do not quote this band.** |

**⛔ THE `1,400–2,000` ROW IS RETIRED (architect, self-retracted).** It was derived as `1.47 × 960 = 1408`
**from bin 0** — the noisiest bin in the histogram, the one my own correction below invalidated. Smoothed
over bins 0–2 the arrival term is `0.98/min`, so steady state is **~940**, and the current 1,3xx is
**above** steady state and falling as the bolus drains. Both the orchestrator and I had already quoted the
retired band. **Use ~950 ± 150 after full turnover.** Note precisely *which* row died and why the others
did not: **the escalation tripwires were derived from INVARIANTS (the ceiling, the TTL) and arrival-rate
noise cannot move them; the retired band was derived from a MEASUREMENT.** That is the sharpening —
derive from the invariant where you can, and when you must use a measurement, smooth it over ≥3 bins and
**never let a single bin carry a subtraction.**

### THE `past_ttl_survivors > 0` PREDICATE — as I banked it, it FIRES ON NORMAL OPERATION

I banked the architect's tripwire verbatim. Verifier ran it literally and **their first sample fired it**:
oldest `etime` `16:00:10` = **57,610 s > 57,600 s**. The orchestrator's own quoted oldest, `16:00:12`, is
**also** past 57,600 — yet their note concluded *"AT the TTL and not past it, survivors ZERO."* **The
conclusion was right and the test as written was not**: the boundary was read by eye, and a criterion
whose whole purpose is to be settleable by a stranger cannot depend on the reader deciding that 12
seconds does not count.

**The mechanism, which I confirmed at source myself** (`~/.promptbook/hooks/live-daemon.js`):

```
:49   const TICK_MS = 30 * 1000;
:54   const MAX_LIFETIME_MS = 16 * 60 * 60 * 1000;
:91   if (Date.now() - startedAt > MAX_LIFETIME_MS) return stop();   <- INSIDE tick()
:112  timer = setInterval(tick, TICK_MS);
```

**The TTL is enforced by a 30-second poll, not by a timer at the deadline.** So an overshoot of up to one
full tick plus teardown is *normal operation by construction*, and every `etime` in `57600..57630` is a
daemon mid-tick. Confirmed by resample rather than by argument: 3 m 14 s later the `16:00:10` process was
**gone**. **Corrected predicate:**

```
past_ttl_survivor := etime > MAX_LIFETIME_MS + TICK_MS (= 57,630 s)
                     AND the SAME PID still present in a second sample ≥60 s (2 ticks) later
```

The PID-persistence clause is what separates *"a process being reaped right now"* from *"a process the cap
has stopped reaping"* — **a single sample cannot tell those apart**, and only the second is the failure the
tripwire exists for. My own read at 21:27:32Z: `count=1277  oldest=57,580 s  over_57630=0` — **does not
fire.** (Fifth independent read; the decline is now 1328 → 1306 → 1299 → 1293 → 1277 across four roles.)

> **DERIVING A TRIPWIRE FROM THE CEILING IS ONLY HALF — you must also derive its RESOLUTION from the
> mechanism that ENFORCES it.** A poll-enforced limit is not a limit at `T`; it is a limit at
> `T + one poll interval`, and comparing against `T` alone **manufactures violations out of correct
> behaviour**. Sibling of `wake-cadence-shorter-than-runtime-self-collides.md`'s *"a limit counted by one
> clock and enforced by another is not the limit you configured"* (`POISON_ATTEMPTS = 5` firing at 47–59):
> there the counter and the check ran on different **clocks**; here the deadline and the check run at
> different **resolutions**. And the failure mode is the one this whole thread keeps re-deriving — an
> alarm that cries wolf on ordinary operation, where **the fourth false alarm is when someone stops
> reading it.**

All-time observed peak arrival is **2.33/min**, transient — a 1.8× margin to the escalation rate.

**The architect held the same defect and withdrew it in the same message**, which is what makes this a
class and not my mistake: their earlier *"re-escalate above ~2/min sustained"* was also hand-set, and
2/min ⇒ 1,920, under half the ceiling **and below a rate this system had already hit today with no
incident.** Two roles, same day, same error, independently.

> **A threshold picked for plausibility is not a tripwire; it is a restatement of the current value.**
> Derive it from the invariant that would actually be violated — the ceiling, the TTL, the SLA — and
> the derivation makes it checkable. *"About 1,400, that seems high"* has no derivation to check, which
> is exactly why neither of us noticed it sat on the prediction.

## THE AGE DISTRIBUTION *IS* THE ARRIVAL HISTORY — sixteen hours of rate data from ONE `ps`

This retires the "a rate needs a series" advice above **for this class of population**, and it is the
architect's, not mine. Because **nothing survives the 16 h TTL**, every live daemon arrived inside the
window, so bucketing the live population by age reconstructs the arrival rate hour by hour — **no
clock, no waiting, no second sample.** My banked "two reads ≥10 min apart" was not just wrongly
calibrated, it was **unnecessary**: the answer was already in the first read.

**Validity precondition, and it must be checked FIRST:** `past_ttl_survivors == 0`. If daemons ever
outlive the TTL, the histogram **silently stops being an arrival history** — old arrivals accumulate in
the tail bins and every rate reads high. Verified by the historian at 21:10:14Z, own command:

```
ps -eo pid,etime,args | awk '$3 ~ /node$/ && $4 ~ /live-daemon\.js$/ { …parse etime→seconds… }'
  anchored_daemons=1305   past_ttl_survivors=0   oldest_age_s=57585 (16.00h)
```

`57585 s` against a `57600 s` TTL — the reaper is holding the cap to within 15 seconds. **Precondition
holds; the instrument is valid.**

### The instrument reproduces across two roles — and the reproduction sharpens it

Historian's histogram @ 21:10:14Z vs architect's ~20:5xZ, arrivals/min by hour-of-age:

```
age   8h    9h    10h   11h   12h   13h   14h   15h      <- STABLE (agree closely)
arch  1.70  1.73  1.82  2.00  2.17  2.33  2.03  1.92
hist  1.70  1.70  1.78  1.93  2.10  2.30  2.32  1.97

age   0h    1h    2h    3h    4h    5h    6h    7h       <- NOISY (disagree wildly)
arch  1.47  0.55  0.80  1.03  0.50  0.70  0.13  1.27
hist  1.15  0.58  1.20  0.00  1.43  0.18  0.68  0.72
```

**The old bins are history and they are stable; the recent bins are bursty and shift with the read
time.** (My `3h` bin is literally `n=0` — a genuinely quiet hour — while the architect's 3h-ago bin
covers a different wall-clock window.) That matters because **the headline `arrival_now` is bin 0, the
noisiest bin in the histogram**, and the net rate is a *difference of two single bins*:

- bin-0 alone: architect **1.47**, historian **1.15** — a **28 % spread** across 26 minutes.
- bins 0–2 averaged: architect **0.94**, historian **0.98** — the same two reads now agree to **4 %**.

> **The DIRECTION is robust and the MAGNITUDE is not.** Both reads say falling (architect −0.45/min,
> historian −0.82/min = −49/hr); neither number should be quoted as *the* rate. Smooth the arrival term
> over ≥3 bins before doing arithmetic with it. This is the same error the whole daemon thread has
> circled all day — **a window too short to resolve the signal** — surviving into an instrument that
> otherwise eliminated the need for windows at all.

**Sharper prediction, using the smoothed rate (committed here so a stranger can settle it):** at
~0.98/min arrival, steady state is `0.98 × 960 = ~940`. The population is **falling toward ~940–1,000**,
not converging up to 1,408, because the high-arrival cohort (2.3/min, 13–14 h ago) is expiring and the
`ce160f8f` bolus (~1,017 of the population) drains through ~01:34.

- **Settle it:** re-run the anchored count any time after ~13:10Z on 2026-07-29 (16 h from the read
  above, so the whole current population has turned over).
- **Prediction:** anchored count **~950 ± 150**, `past_ttl_survivors` still **0**.
- **Falsified if:** the count is **above ~1,400 while `past_ttl_survivors == 0`** (arrival rose — check
  bins 0–2, not bin 0), **or** `past_ttl_survivors > 0` (the cap itself broke — the serious one).

**And do not read the coming decline as the leak stopping.** ~1,017 daemons exit between now and
~01:34 because their TTL expires. That is the model working. The leak is unfixed: `session-start.js:150-164`
still spawns unconditionally. **Bounded waste is still waste (~41 GB RSS) — "the ceiling is
unreachable" is not "there is nothing to fix"**; the R1 spawn guard remains worth doing.

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
