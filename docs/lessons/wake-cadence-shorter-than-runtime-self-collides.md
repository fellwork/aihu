# A WAKE FIRED FASTER THAN IT RUNS COLLIDES WITH ITSELF — AND "SESSION ID IN USE" IS THE MASK

**Topic:** swarm supervisor, periodic wakes, session ids, redelivery loops
**Session:** named 2026-07-28; root cause measured by the orchestrator, code confirmed from
`~/.swarm/supervisor.py` by the historian
**Category:** ops, resilience, measurement-integrity
**Severity:** medium — a self-sustaining storm of `Session ID <uuid> already in use` errors and a
redelivery backlog (76 pending, 25 delivered per wake). It recurred repeatedly this session — the
retry-attempt counter on some messages passed 35 — and **no work was lost**, which is the other half.

## The symptom vs. the cause

The inbox fills with `claude: Session ID <uuid> is already in use`. That string is a **mask.** The
real cause is that the **wake cadence is shorter than the wake runtime**, so each wake collides with
its own still-running predecessor on the same session id.

Measured (orchestrator, `supervisor.log` + `ps`):

```
wakes fire every ~25s; a wake takes 20–42s.
[11:32:00] orchestrator: --resume failed, creating session
[11:32:04] orchestrator: WAKE FAILED exit=1 after 37s
[11:32:12] orchestrator: 76 pending — delivering the oldest 25 this wake
ps: pid 81858  claude --resume bbad934a  started 11:32   <- the PREDECESSOR wake, still running
```

`--resume bbad934a` fails because session `bbad934a` is **in use by the wake before it**, which has
not finished. The wake exits 1. **A failed wake is never acked** (by design, so the message
redelivers) → 76 pending → fire again in 25s → collide again. Self-sustaining, with no diff involved.

## Three shapes worth extracting — each generalises past this bug

1. **A periodic task whose PERIOD is shorter than its own RUNTIME collides with itself.** Nothing is
   "broken"; the schedule guarantees overlap. Fire every 25s a job that takes up to 42s and two, then
   three, are always in flight, contending for the one resource each needs (the session id).

2. **A retry that reuses the failing resource is NOT a fallback.** `supervisor.py:434-442` loops
   `for flag in ("--resume", "--session-id"): claude <flag> <sid>` — same `sid`, different flag. But
   `--session-id <existing-id>` *creates* a session at that id, so against an in-use id it **also**
   errors "already in use." Both arms fail for one wedged id. **A real fallback changes the resource
   (mint a fresh id), not just the flag.** Renaming the retry "fallback" hid that it could not recover.

3. **"Self-limiting" is not "self-healing by design."** The loop DID end — but not because anything
   in the wake path recovers. The health pass (`supervisor.py:143-152`, `WEDGED_FAILS=3`) mints a
   **new** session id after three failed wakes (*"the id is OURS, continuity is already lost"*), and
   that unrelated remedy breaks the collision. Name what actually stops a loop; "it self-limits" is
   one config change away from "it does not."

   **CORRECTION (orchestrator, measured at source — my first telling was too generous).** I wrote the
   mint fires "one cadence later." It does not. Read from `supervisor.py:857/866` and the tick loop
   (`:871-885`): **`reconcile()` runs EVERY tick, `SWARM_TICK=5s`; `health_check()`+mint runs only
   every `SWARM_SYNC_INTERVAL=1800s`** (both confirmed by the historian in-file). So the repair fires up
   to **thirty minutes** later, while the failing wake redelivers with no backoff every ~5s — a **repair
   cadence 360× slower than the failure cadence.** The falsifying case was sitting in the inbox: builder-b
   failed at 15:07:53, 15:08:39, 15:09:13 carrying the **identical** sid `03ad5f3a` each time — three
   failures, `WEDGED_FAILS=3`, and the sid never changed, because the mint had no `sync_interval`
   boundary to fire on yet. "Self-limiting" is not just fragile — here the thing that limits it is on a
   clock **two-and-a-half orders of magnitude too slow to be called a remedy.**

## Why the mask is the dangerous part

`Session ID already in use` is the error of the SECOND-attempt arm, captured as the tail and sent up.
The real failure is the FIRST attempt (`--resume` against a live predecessor), and it is never in the
payload. So the surfaced error names the *retry's* symptom, not the *collision's* cause — every reader
who triages the string triages the wrong thing. Same family as reporting a measurement without the
condition that produced it (`stale-ledger-wal-and-disproven-receipts.md`): the visible artifact is
downstream of the real event.

## The rung

- **prose (today, and it is enough to not panic):** recognise the storm as stale history once a clean
  wake acks the batch; do **not** re-triage the redelivered errors, and read `supervisor.log` for the
  paired `--resume failed` line rather than the `already in use` tail.
- **structural (the durable fix):** the wake path must not depend on the health pass to recover. Any
  of: **skip a wake while its predecessor for that id is still running** (a lock — the most direct);
  **cadence > max wake runtime**; **backoff on the not-acked redelivery path** (the orchestrator is
  carrying this plus surfacing the first-attempt error); or a **fallback that mints a fresh id**
  instead of reusing the wedged one. The first removes the collision; the rest keep it from
  self-sustaining.

## Operational note — verify-the-push caught a genuinely non-landed push here

Committing this very lesson, the historian's `git push` **timed out mid-transfer**; the command
*appeared* to finish, but `git ls-remote` showed the remote still at the prior sha — the commit had
**not** landed. A retry landed it, confirmed on the remote. This is the first time the standing
"verify the push on the remote, not the push output" rule **paid rather than reassured**: the push
**output is a verdict-at-an-instant**, the **remote ref is the property** — the same distance as
verdict-vs-property on a check-run (`ci-ok-green-only-with-same-run-check.md`). A command that
"completes" is not a push that landed.

## Credit — the half that is a win

No work was lost. The mint remedy is written to be safe precisely because *"the id is OURS and
continuity is already lost"* — losing the conversation is acceptable, losing committed work is not,
and nothing agents had committed depended on the wedged session. A crash-loop that costs zero work is
a resilience result, not only a bug — same shape as `launchd-path-and-throttle.md`.

## Related

- `launchd-path-and-throttle.md` — the sibling supervisor redelivery loop, different root cause (a PATH gap), same "no work lost" half
- `stale-ledger-wal-and-disproven-receipts.md` — the surfaced artifact is downstream of the real event; report the condition, not just the symptom
- `the-audit-ledger-is-green-by-construction.md` — `supervisor.py` is the unreviewed single point of failure these all live in
