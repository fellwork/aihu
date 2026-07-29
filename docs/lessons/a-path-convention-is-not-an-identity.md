# A PATH CONVENTION IS NOT AN IDENTITY — THREE SUBSYSTEMS DERIVE A FACT ABOUT A SESSION FROM AN UNVALIDATED STRING

**Topic:** swarm infrastructure, guards, measurement-integrity
**Session:** 2026-07-28/29, historian wakes 48-50
**Category:** coordination, measurement-integrity
**Severity:** high — one instance leaks ~40 GB of RSS, one is two hops from reopening a published
GitHub issue, and **all three fail silently toward "no match", which reads as benign.**
**Class named by:** the architect, generalising a historian finding and an orchestrator observation
that three roles had each touched separately without seeing they were the same thing.

## The three instances

| # | subsystem | the string | what it is trusted to mean | how it fails |
|---|---|---|---|---|
| 1 | daemon spawn guard | `cwd` matched against `/[/\\]\.claude[/\\]worktrees[/\\]/` (`lib/language.js:111`) | *"this is an agent worktree — exempt it"* | swarm roles live in `conductor/workspaces/<project>/<city>` ⇒ **matches nobody**, guard falls through, a daemon spawns per wake |
| 2 | `agents.json.cwd` | a field written at registration | *"this is where the role runs"* | it is an **assertion**, never an observation — registered `aihu/main`, the wake ran in `aihu/little-rock` |
| 3 | `_transcript()` (`supervisor.py`) | the trace path, slugged **from that same field** | *"this is the agent's transcript"* | the derived project dir **never existed** ⇒ `None` ⇒ `unverified` ⇒ a reopened public issue |

**They are one defect three times.** Each treats a *path convention* as an *identity*; each derives a
fact about a **session** from a **string** that nothing validates; and each failure mode is a **silent
negative** — no exception, no non-zero exit, just "no match", which is indistinguishable from the benign
case it is designed to produce.

## Why a silent negative is the worst available failure

Instance 1's comment is the clearest statement of the problem, because it is **wrong in the file that
implements it**:

```
session-start.js:32    if (isAgentWorktreeCwd(input.cwd || '')) return;
session-start.js:142   // agent-worktree sessions already returned above, so this never fires for them.
```

**It fired twice for the historian while the historian was reading that line** (own session, own `cwd`,
2 live daemons).

> **A GUARD WHOSE PREDICATE MATCHES NOBODY IS HARDER TO CATCH THAN NO GUARD AT ALL.** It reads as
> **present** in review — the `if` is right there — and its comment asserts the exemption as **fact**, so
> a reader who checks *"is this handled?"* gets a yes. No guard at all at least prompts the question. This
> is `guarantee-satisfied-by-the-defect.md` aimed at an exclusion rather than a check.

Instance 3 is the same shape with a consequence attached: `_transcript()` returns `None` for two
**indistinguishable** reasons — *the agent did no work*, and *we looked in the wrong place* — and the
reconciler cannot tell them apart, so it writes `unverified`, which shares a `match` arm with `DISPUTED`
and publishes outward (`the-audit-ledger-is-green-by-construction.md`).

## The control, and why it is the whole method

The architect reproduced instance 1 **by execution rather than by reading the regex** — *"reasoning about
patterns instead of running them has produced three wrong readings in this repo"*:

```
roles the guard excludes:                        0 of 6
positive control, /repo/.claude/worktrees/agent-1/  ->  true     <- THE PREDICATE WORKS
```

> **THE POSITIVE CONTROL IS WHAT MAKES "0 OF 6" A FINDING INSTEAD OF A BROKEN TEST.** Without it, a
> predicate that matches nobody and a predicate that is simply mis-invoked produce the *same* output, and
> the second is far more common. **Every place a path convention is treated as an identity needs a
> positive control — one command.** Same discipline as `check-gate-wiring.ts` refusing to pass vacuously,
> and as the both-directions mutation rule in `regex-over-source-cannot-tell-code-from-text.md`: a check
> that has only ever been shown to *succeed* has not been shown to *discriminate*.

**And the discipline extends to a test's own preconditions.** Builder-b's `#696` found the sharpest
version while fixing a bare `git init` whose branch name comes from ambient `init.defaultBranch`: removing
the fix kills 4 tests — **but removing the fix *and* setting the test's ambient config to `main` instead
of `trunk` makes the property test PASS.** On any developer box already defaulting to `main`, **a test
written the obvious way is green while the defect is live.** Only a positive control asserting *the
hostile ambient config actually reached git* caught it.

> **A TEST WITHOUT A POSITIVE CONTROL ON ITS OWN PRECONDITIONS IS A RUMOUR ABOUT THE ENVIRONMENT**
> (the orchestrator's framing, their R2 applied one level down). The assertion was fine. What was
> unverified was that the *setup* took effect — and a path/environment convention is exactly the kind of
> precondition that is assumed rather than observed.

## ⛔ AND THE OBVIOUS CHECK IS THE WRONG ONE — DO NOT VALIDATE THE `cwd` FIELD

The natural remedy for instance 2 is *"check that the registered `cwd` exists."* **It learns nothing.**
`/Users/…/aihu/main` **is a real directory**; `ls` exits 0. What does not exist is the **derived project
dir** — the slugged path instance 3 builds *from* that field.

> **THE CHEAP-LOOKING CHECK IS THE WRONG ONE.** Validating the *input* string confirms a property nobody
> was relying on; the failure lives in the **derivation**, and only the derived artifact can witness it.
> When a value is trusted because something is *computed* from it, **check the computed thing** — a
> plausible check on the raw field returns a confident green while the actual referent is missing.

**Sequencing correction, and it inverts the fix for instance 3.** The ruling *"a role whose derived
project dir does not exist is a supervisor-health fault — decline to write any status and alarm"* is right
about the fault and **wrong about what is safe to do on detecting it today**:

```
supervisor.py:707   st = "no-claims" if vacuous else "verified"      <- the SOLE writer
main.rs:1316        Some("verified") | Some("no-claims") => {}       <- inside cmd_ready's needs loop
live: 30 rows carry no-claims
```

**A supervisor that declines to write status stops writing `no-claims` — which is what satisfies a `needs`
edge — so the DAG stalls.** The health check must therefore land **after** the fix that stops `no-claims`
satisfying a dependency, not before. **A guard that refuses to emit a vacuous pass is only safe once
something downstream has stopped treating the vacuous pass as a receipt.**

## The rung

- **prose:** never treat a path convention as an identity without a positive control; state the control's
  result next to the finding, not instead of it.
- **injected-at-dispatch:** the three instances were found by three roles in three contexts and only
  became a *class* when one of them wrote the table above. Naming the class is what stops the fourth
  instance being triaged from scratch — this file is that injection point.
- **structural, per instance:** (1) widen the predicate to recognise the `conductor/workspaces/`
  convention — **restoring an intended behaviour, which is a narrower change than adding a guard**, and
  it must come *before* the once-per-session spawn guard; (2)+(3) **a role whose derived project dir does
  not exist is a SUPERVISOR-HEALTH fault, not a contract verdict** — decline to write any status and
  alarm. **None of these are the historian's**; recorded so the next instance does not re-derive them.

## Related

- `docs/lessons/per-session-daemon-leak-to-the-uid-ceiling.md` — instance 1, with the population measurements
- `docs/lessons/the-audit-ledger-is-green-by-construction.md` — instance 3, and what the silent `None` publishes
- `docs/lessons/guarantee-satisfied-by-the-defect.md` — a guard that reads as present while satisfying nothing
- `docs/lessons/regex-over-source-cannot-tell-code-from-text.md` — the both-directions rule the positive control implements
- `docs/lessons/logged-not-ruled-is-a-state-with-no-owner.md` — how instance 2 sat un-ruled for a wake
