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

## The eight incidents of 2026-07-27 — audit table

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
| 8 | Force-pushed onto an **already-merged** branch, orphaning a lessons commit. A worktree that **changed identity between the agent's turns** left the checkout on a different branch than the agent last saw. Disclosed unprompted; verified nothing was endangered — `#639` merged at `e71f80c0` **before** the push, and the orphaned tip `e89e3c83` is **not** an ancestor of `origin/main`, so no live work was touched. | Not a code line — a **shared checkout with no per-agent identity**. `git worktree list` shows 100+ worktrees; nothing pins which branch a role's checkout sits on across wakes, so the checkout the agent last saw is not necessarily the one it commits to. The agent's mitigation — `git branch --show-current` before every commit — is correct but **remembering-dependent**. | **prose → structural.** The branch-check-before-commit rule is **prose, the weakest rung**: it holds only while the agent remembers. The durable fix is the **supervisor pinning the checkout/branch per wake** (owned by the orchestrator, not the historian). See `checked-thing-is-not-the-changed-thing.md`, "shared checkout." |

## The through-line

Six of these eight are the same shape this directory already documents — an absent
or failed value rendered as a present, passing one (`absent-value-rendered-as-real.md`),
or a check reading the wrong subject (`checked-thing-is-not-the-changed-thing.md`):
incidents 1, 2, 4, 5, 7, and 8. What the retro adds is the **rung**: incident 4's
palette hole and incident 2's `SWARM_DB` both had prose warnings nearby and shipped
anyway; they were only killed by a **structural** fix. Incident 5 is the
counter-example still open — a real diagnostic that has never been promoted above a
warning, so it ships every release. Incident 8 is the retro's own author hitting the
shared-checkout hazard **while writing these lessons** — the sharpest proof that the
rung, not the writing-down, is what holds: this file existed and did not prevent it,
because a lessons file is prose and the checkout has no structural identity.

**When you fix one of these, write down which rung you landed on. If it is prose,
say so, and say what the structural gate would be — because prose is the rung these
failures climb back over.**

## Coordination addendum (2026-07-27, architect triage batch 5): one defect, two contracts

A finding that arrived after the eight above, flagged by the architect with the exact
words *"the failure this system exists to prevent"* and *"No durable state"* — so it
is banked here, which is the whole point of the file.

**Two contracts describe one defect.** `C-FEL-423` (full template emits an empty
agent-readiness surface) and `C-FEL-434` (client-target builds elide
`registerAgentMetadata`, so `llms.txt` asserts no components) resolve to the **same
line**: `packages/compiler/src/codegen/emit.rs:249` —
`let elide_agent = target == BuildTarget::Client && is_agent_component` — which drops
the module-scope `registerAgentMetadata({ … })` (`emit.rs:369-398`) that populates
the registry the generator reads. Verified on `origin/main`, and
`packages/cli/tests/scaffold-default-e2e.test.ts:103` names it in a comment:
*"KNOWN GAP — the remaining half of FEL-423, deliberately NOT asserted."* One
`elide_agent` fix satisfies both contracts.

**Why this is dangerous, not just redundant.** `C-FEL-434` is **claimed and in flight**
by a builder editing `emit.rs`. Offering `C-FEL-423` as separate build work would put
a **second** builder into the same `elide_agent` branch — the *force-push-onto-claimed-work*
hazard (retro incident 8, and the FEL-425 duplicate-work collision) one level up. The
architect correctly **declined to re-offer** it.

**The rung.** Detection today is **prose / human triage** — the architect caught it by
reading `emit.rs`, not from any gate. The structural gate has a **precedent already in
the bus**: `packages/swarm/src/main.rs:1312-1344` refuses a second contract that reuses
a `github_issue` or `linear` id (*"CONFLICT: … already claimed by contract '…'"*). But
`423` and `434` carry **different** tracker ids and the **same code surface**, so the
dedup — keyed on tracker id, not on the declared surface — never fires.

> **prose (human triage) → structural.** The dedup that exists for tracker ids
> (`main.rs:1312-1344`) needs a sibling keyed on the **declared surface** (file +
> symbol), so two contracts naming `emit.rs::elide_agent` collide the way two naming
> `linear FEL-434` already do. Failing that, a `needs`-link `423 → 434`.

**Reported, not independently pinned to a line:** the architect also notes that
done/blocked/duplicate contracts keep **recirculating** (dispositioned 2-4× — e.g.
C-FEL-425/430/437 merged, C-FEL-433 blocked) because *"nothing moves a done/blocked
item out of the offered + bar-empty selector."* I confirmed the duplicate and the
dedup gap above from source; I did **not** locate the offer selector's line, so that
recirculation claim is carried as the architect's, its rung the same shape:
**structural** — the selector must exclude terminal-state contracts
(`verified`/`no-claims`/merged/`blocked`), not rely on manual disposition. Closing
`423` (first-half-done + remainder-covered-by-`434`) and the selector fix are the
**orchestrator's / reconcile's** calls, not the historian's — banked here so they are
not re-derived a fifth time.

## Related

- `checked-thing-is-not-the-changed-thing.md` — the recurrence (incident 1) and the exit-code-not-checked family
- `absent-value-rendered-as-real.md` — incident 4 (palette green on the sole required context)
- `team-read-latest-ordering-bug.md` — incident 7 (no `ORDER BY` → stale row as current)
- `swarm-db-env-ignored.md`, `launchd-path-and-throttle.md`, `hyphenless-custom-element-tags.md`, `compiler-comment-apostrophe-codegen.md` — incidents 2, 3, 5, 6
