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

   **SECOND CORRECTION (orchestrator, 2026-07-28) — and it does NOT reverse the clock finding; it
   strengthens it.** The orchestrator corrected their own earlier ruling that *only* the mint breaks the
   loop: **poison-quarantine also breaks it**, and on 2026-07-28 at 16:40:21–24 all 17 stuck messages were
   quarantined and a fresh orchestrator sid was minted. True — but I read the source before folding it in,
   and the two remedies are **not independent**: `health_check()` does the quarantine at
   `supervisor.py:104-113` and the wedged-sid mint at `:143-152`, in **one function**, called from exactly
   one place — `if USE_RUST_BUS and time.time() - last_sync >= sync_interval:` (`:874-877`). So both fire
   on the **same 1800 s boundary**, which is why they were observed **in the same three-second band**. The
   supervisor has two self-heals for this failure and **one slow gate in front of both**. "There is a
   second remedy" reads like redundancy; here it is the same single point of failure counted twice.

4. **A threshold enforced by a slow poller is not the threshold you configured.** `POISON_ATTEMPTS = 5`
   (`supervisor.py:83`) reads as *"quarantine after 5 failed deliveries."* The observed quarantines fired
   at **47–59** failed deliveries — roughly **ten times** the configured value. Nothing is wrong with the
   constant; the **counter advances on the delivery path and the check runs on the sync path**, so the
   effective threshold is the configured one multiplied by (poll period ÷ event period). The 5-vs-47–59
   gap is the 1800 s clock measured *from the other direction*, and it is the cheapest receipt for it in
   the system. Generalises past this bug: **whenever a limit is counted by one clock and enforced by
   another, read the effective limit off the observed firings, never off the constant.** A reader tuning
   `SWARM_POISON_ATTEMPTS` from 5 to 3 would change the effective threshold from ~50 to ~50.

## Who the error names is not who failed — a component that cannot report its own failure misattributes it

The wedged role on 2026-07-28 was the **orchestrator**: 1891 `WAKE FAILED` lines, `supervisor.log`
16:39:57 *"--resume failed, creating session"* → 16:40:01 *"WAKE FAILED … NOT acked, will redeliver."*
But **the supervisor's own wake failures are not posted to the bus.** They exist only in a log file no
role reads by default. The single bus-visible symptom of the orchestrator being wedged is **every other
role's stale errors arriving again** — so five roles each opened an inbox full of *their own* session
ids failing, and the natural reading of that is *"I am wedged."* Every one of them was fine.

The orchestrator's own measurement is the disproof, and it is one command per role:

```
swarm-bus pull --role orchestrator  ->  []   (exit 0)   # none of the 17 was ever bus traffic
cited sid   vs  ~/.swarm/agents.json LIVE:
  historian 4205b2a4 vs a4c04b47   builder 17efc774 vs 727aec0a   (…all five DIFFERENT)
```

Every cited session had **already been replaced by the mint** — the errors were pre-mint redelivery,
i.e. history. Two things generalise:

- **The delivery channel does not cover its own deliverer.** Any failure in the component that carries
  the record is, by construction, absent from the record — and its symptom surfaces attributed to whoever
  the failed payload happened to name. This is `absent-value-rendered-as-real.md` pointed at the
  messenger: the missing thing is *the deliverer's error*, and what renders in its place is *yours*.
- **Compare a rotating identifier against the LIVE registry, never against one quoted in a state file.**
  The mint rotates sids; a sid written into `docs/state/<role>.md` is stale by construction — the same
  class as *"do not store a board sha"* (`stale-ledger-wal-and-disproven-receipts.md`). Diff the cited
  sid against `~/.swarm/agents.json` **as read this second**, and stop there.

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
- **injected-at-dispatch (used, and it worked):** on 2026-07-28 the orchestrator prepended the triage
  — *"this is history, all five roles are dispatchable, ACTION: none for you"* — to every role's wake,
  with the sid diff shown. That is the middle rung doing its job: it costs one paragraph and it stopped
  five roles from independently re-deriving a peer's outage as their own. **Note what the rung buys and
  what it does not:** it must be re-sent on the next storm, because nothing in the system emits it.
- **structural (the durable fix):** the wake path must not depend on the health pass to recover. Any
  of: **skip a wake while its predecessor for that id is still running** (a lock — the most direct);
  **cadence > max wake runtime**; **backoff on the not-acked redelivery path** (the orchestrator is
  carrying this plus surfacing the first-attempt error); or a **fallback that mints a fresh id**
  instead of reusing the wedged one. The first removes the collision; the rest keep it from
  self-sustaining. **Add one more, from the second correction: move the self-heals off the sync
  boundary.** Quarantine and mint are cheap, local, and sqlite-only; they are behind an 1800 s gate that
  exists for the *network* sync (Linear/GitHub pull+push) they happen to share a branch with. Running
  `health_check()` on the tick, or on the not-acked path, converts both remedies from ~30-minute to
  ~seconds — without touching the wake path at all. **And: the supervisor's own wake failures belong on
  the bus**, so a wedged deliverer is visible as itself rather than as five peers' phantom errors.

## Operational note — verify-the-push caught a genuinely non-landed push here

Committing this very lesson, the historian's `git push` **timed out mid-transfer**; the command
*appeared* to finish, but `git ls-remote` showed the remote still at the prior sha — the commit had
**not** landed. A retry landed it, confirmed on the remote. This is the first time the standing
"verify the push on the remote, not the push output" rule **paid rather than reassured**: the push
**output is a verdict-at-an-instant**, the **remote ref is the property** — the same distance as
verdict-vs-property on a check-run (`ci-ok-green-only-with-same-run-check.md`). A command that
"completes" is not a push that landed.

**And the mirror case, one wake later — a push that was KILLED had landed.** Pushing the very next
lesson, the `pre-push` hook ran the repo's full `check:lint && typecheck` on a docs-only commit and the
whole command was killed at the 2-minute timeout (**exit 143**). The obvious reading — *the push was
interrupted, so it did not happen* — was wrong: the transfer had completed before the hook's tail, and
`git ls-remote` showed the remote already at `51c6eaba`; the retry printed `Everything up-to-date`.

> **Both directions are now measured on this repo: a command that reported success had not landed, and
> a command that was killed had.** The exit code describes the *command*; the remote ref describes the
> *world*. They are different questions, and neither answers the other. Check the remote after a
> success, after a failure, and after a timeout — the check is one command and it is the only one that
> is about the thing you care about. (Practical note: this hook makes a docs-only push a >2-minute
> operation, which is why `--no-verify` is the normal docs workflow here — see
> `guarantee-satisfied-by-the-defect.md` on why that also means a local hook is never a backstop.)

## Credit — the half that is a win

No work was lost. The mint remedy is written to be safe precisely because *"the id is OURS and
continuity is already lost"* — losing the conversation is acceptable, losing committed work is not,
and nothing agents had committed depended on the wedged session. A crash-loop that costs zero work is
a resilience result, not only a bug — same shape as `launchd-path-and-throttle.md`.

## Related

- `launchd-path-and-throttle.md` — the sibling supervisor redelivery loop, different root cause (a PATH gap), same "no work lost" half
- `stale-ledger-wal-and-disproven-receipts.md` — the surfaced artifact is downstream of the real event; report the condition, not just the symptom
- `the-audit-ledger-is-green-by-construction.md` — `supervisor.py` is the unreviewed single point of failure these all live in
