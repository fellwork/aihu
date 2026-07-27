# THE PROMOTION RUNGS — where a lesson has to LAND to stop recurring

**Topic:** cross-cutting (swarm tooling, CI, compiler)
**Session:** named 2026-07-27, the first historian retro (contract C-FEL-RETRO-0727)
**Category:** measurement-integrity, process, institutional-memory
**Severity:** high — a lesson that is only *written down* is one un-read script away
from recurring; this file exists because that happened, repeatedly, on one day.

## Why this file exists — the meta-finding of the first retro

This retro is the **first one this swarm has ever run**, and that fact is itself the
finding. The retro *triggers* are specified — `~/.agent-swarm/docs/typed-bus-payloads.md:204`,
section *"Retro triggers — when a lesson MUST be banked (C-SWARM-RETRO)"*, with a
full table of trigger conditions at `:214-220` (DISPUTED contract, overruling,
failure, **recurrence**, surprising outcome, near-miss, bad-outcome-shipped) — but
they exist as **spec only**. There is **zero implementation**: `grep -rn C-SWARM-RETRO ~/.swarm ~/.agent-swarm`
returns matches in exactly one file, that markdown spec, and nothing in any `.py`,
`.rs`, `.sh`, or `.ts`. Nothing auto-offers the historian work.

So for the whole 2026-07-25 → 27 run, durable lessons were **banked by hand into
the orchestrator's own memory** — load-bearing knowledge living in one instance's
head. That is the exact anti-pattern the historian role was created to prevent: an
instance cannot learn; only the institution can, and only if the learning is a
committed artifact rather than a sentence someone remembers.

## The rungs

A lesson is not "banked" by being true. It is banked by landing on a **rung high
enough that the next person cannot skip it.** Three rungs, weakest to strongest:

| rung | what it is | how it fails |
|---|---|---|
| **prose** | a lessons file, a code comment, a Slack message, a dispatch caveat | executes in no one's shell. Protects only readers who both find it and apply it. A new ad-hoc script, or an agent who never opened the file, repeats the bug untouched. |
| **injected-at-dispatch** | the rule is pasted into the agent's brief at dispatch time (e.g. *"build from source, `AIHU_COMPILE_BIN` unset means you tested the published addon"*) | protects only work that goes through that dispatch path, and only until someone edits the template. Better than prose because it reaches the agent without their seeking it. |
| **structural gate** | a machine refuses the bad state: `set -euo pipefail`, an exit-code check, a required CI job that reads the result, a typed boundary that rejects malformed input, a compile error | the only rung that protects work nobody warned. It cannot be skipped by not-reading. |

> **The recurrence rule:** a lesson that merely *restates* an incident is rejected.
> Name the rung the fix landed on — and if the same failure recurred, the reason is
> almost always that the previous fix landed on **prose** or **injected-at-dispatch**
> when only a **structural gate** would have held.

## The seven incidents of 2026-07-27 — audit table

Every row is verifiable in the repo or the swarm tooling on disk. `file:line` cited
where code exists; each was opened before being written here.

| # | trigger observed | mechanism (file:line) | rung the fix landed on |
|---|---|---|---|
| 1 | Force-pushed the **wrong branch** over a builder's PR. `git checkout <branch>` failed (branch held by another worktree → exit 128), the ad-hoc chain continued, rebased, and force-pushed an unrelated branch. Repaired from the `almaty` worktree; no work lost. | No committed script — an ad-hoc `checkout; rebase; push -f` chain whose `checkout` exit was not gated. The **correct** pattern exists one file over: `~/.agent-swarm/transport/wire-workspace.sh:21` (`set -uo pipefail`) with `\|\| die` on every step. The documented **sibling**: `~/.swarm/supervisor.py:82-96`, a `bus(..., check=False)` that "failed SILENTLY: no wake failure has ever reached the bus." | **structural, but not universal** — the guard is per-script (`wire-workspace.sh` has it; the ad-hoc chain did not). See the recurrence in `checked-thing-is-not-the-changed-thing.md`. |
| 2 | A test `setstatus` flipped a **real contract** in the **live** ledger. | `~/.swarm/bus.py:30` — `DB = os.path.expanduser("~/.swarm/bus.db")` is **hardcoded**; `bus.py` never reads `SWARM_DB`, so a "test" run had no isolation and hit production. | **structural** — the Rust core honors it: `packages/swarm/src/main.rs:433` `if let Ok(p) = env::var("SWARM_DB")`. Shipped in **#642** (`932371ab`). See `swarm-db-env-ignored.md`. |
| 3 | launchd PATH omitted `~/.local/bin`, so the `claude` binary was not found: ~20 wake crashes and a redelivery loop. | `~/Library/LaunchAgents/com.fellwork.swarm.supervisor.plist` — the `EnvironmentVariables > PATH` lacked `~/.local/bin`, where `claude` is a symlink (`~/.local/bin/claude` → `…/versions/2.1.220`). | **structural** — PATH now leads with `~/.local/bin` (`…supervisor.plist:10`) and `ThrottleInterval 30` (`:29`) rate-limits the crash loop. What **worked**: unacked messages redelivered — nothing was lost. See `launchd-path-and-throttle.md`. |
| 4 | The `palette` brand-contract job was **red**, yet `ci-ok` — the **sole required context** — reported **green**. | `.github/workflows/plan-a.yml` — `palette` was in `ci-ok`'s `needs:` (so the job *waited* on it) but was **absent from the gate loop** that reads results. *"Being in `needs` is not being gated on."* | **structural gate** — **#649** (`d1e2af0d`) added `PALETTE_RESULT` (`plan-a.yml:396`) and appended `"palette:$PALETTE_RESULT"` to the `for pair in …` loop (`:410`). See `absent-value-rendered-as-real.md`. |
| 5 | Hyphenless custom-element tags (`timer`, `link`, `outlet`) are emitted and **cannot register** in a browser; the compiler **warns ~32×** per CI run and the build stays **green**. Latent, SHIPPED, still open. | `packages/compiler/src/lib.rs:431` (`&& !name.contains('-')`) gates the diagnostic; the message is at `:822`/`:825`. The emit path **keeps the historical WARNING rather than erroring** — `packages/compiler/src/bin/main.rs:160-161`: *"only component references are a hard error."* Component *references* DO hard-error: `packages/compiler/src/tags.rs:130` (C450). | **below prose** — the diagnostic is a non-failing warning in build output that nothing gates. No fix has landed. Needs promotion to a **hard error** or a CI grep-for-warning gate. See `hyphenless-custom-element-tags.md`. |
| 6 | Two apostrophes in **adjacent line comments**, the second parenthesised, emit a stray comma-paren and break codegen. New, found while building the swarm console. | Suspected in the comment/string-aware expression splitter — `packages/compiler/src/parser/directives.rs:633-759` ("splitting inside strings, template literals, comments, and regex does not close"). **Not yet root-caused to a line.** | **prose** — now documented with a repro; fix OPEN. See `compiler-comment-apostrophe-codegen.md`. |
| 7 | The dashboard showed a **stale** contract as an agent's *current task*, and **hid** that one agent held **two** contracts. | `~/.swarm/dashboard.py` — the per-role current-task query had **no `ORDER BY`** and took `fetchone()`, so SQLite returned an arbitrary row (yesterday's), and one row hid the multiplicity. The fix comment is at `:87-93`. | **structural** — fixed at `dashboard.py:97-98`: `… ORDER BY ts DESC` + `fetchall()`, and it now **surfaces** multiple holds instead of hiding them. Same family as `team-read-latest-ordering-bug.md`. |

## The through-line

Five of these seven are the same shape this directory already documents — an absent
or failed value rendered as a present, passing one (`absent-value-rendered-as-real.md`),
or a check reading the wrong subject (`checked-thing-is-not-the-changed-thing.md`).
What the retro adds is the **rung**: incident 4's palette hole and incident 2's
`SWARM_DB` both had prose warnings nearby and shipped anyway; they were only killed
by a **structural** fix. Incident 5 is the counter-example still open — a real
diagnostic that has never been promoted above a warning, so it ships every release.

**When you fix one of these, write down which rung you landed on. If it is prose,
say so, and say what the structural gate would be — because prose is the rung these
failures climb back over.**

## Related

- `checked-thing-is-not-the-changed-thing.md` — the recurrence (incident 1) and the exit-code-not-checked family
- `absent-value-rendered-as-real.md` — incident 4 (palette green on the sole required context)
- `team-read-latest-ordering-bug.md` — incident 7 (no `ORDER BY` → stale row as current)
- `swarm-db-env-ignored.md`, `launchd-path-and-throttle.md`, `hyphenless-custom-element-tags.md`, `compiler-comment-apostrophe-codegen.md` — incidents 2, 3, 5, 6
