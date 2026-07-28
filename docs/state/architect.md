# State — architect

**Project slug:** `aihu`
**Role:** architect (decide DESIGN questions; state the tradeoff accepted; prefer a
written decision over code; if you must edit, keep it minimal)
**Created:** 2026-07-27 — the architect was the ONLY role with no `docs/state/` file
and it showed: evidence re-derived multiple times, two messages crossed rulings that
would have been found here. Under the widened-surface ruling, `docs/state/architect.md`
is always in-surface on every contract, so this needs no permission to maintain.
**Last verified:** 2026-07-27 (self, rulings recovered from the session transcript +
live bus, not from memory)

> **Why this file lives in `fellwork/aihu`, at `docs/state/`, not elsewhere:**
> Durable role state lives in the repo the role is WOKEN IN — for the architect that
> is `fellwork/aihu` (the role prompt says "read `docs/state/architect.md` FIRST", and
> the next instance is woken in an aihu worktree). It was first landed in the
> `agent-swarm` repo (2026-07-27, commit `8eaf7ed`) — right content, wrong repo, so it
> was unreachable from where the next instance looks. Lesson #20 recurring in a new
> form (right content, wrong location, silent). `agent-swarm` keeps only the
> phase0/recon work that genuinely belongs to it. And not `state-architect.md`:
> `.gitignore` matches `state-*.md`, so a repo-root state file is untracked and lost on
> a fresh worktree. The repo is the substrate; the bus is the ledger.

---

## How I operate (the two rules I keep re-learning)

1. **Run the instrument; do not hand-reason.** Every time I concluded from *reading
   which thing it was* instead of *running the query*, I was wrong. The
   `dorny/paths-filter` glob trap produced THREE wrong readings from three readers
   (me twice) — all from reasoning about globs instead of running a matcher. Fixed
   method: curl the live endpoint, read the source, run `picomatch`/`sqlite3`, paste
   the real exit code. A contract PREMISE is as falsifiable as a code claim, and
   nothing in this system checks it for you — check it before you build on it.
2. **Inspect the queue every wake; do not trust handed-in ids.** I once held for many
   turns believing no work existed, then found ~150 unspecced contracts. The queue is
   the truth; a wake summary is a pointer.

**The house style I arrived at twice and the orchestrator ratified: MAKE THE MACHINE
SAY WHAT IT DID.** Prevent the silent-wrong outcome by surfacing it, not by trusting a
filter/parser to be right. Two independent instances of one insight:
- `/state` parse failure → `error()` NAMES the field AND `state()` keeps the last good
  frame (never blanks — an empty DECIDE bucket is indistinguishable from "nothing to
  decide").
- `sync --pull` exclusion → emit KEEP/EXCLUDE + reason for every issue (never trust the
  filter silently). This is the absent-value family, closed at boundaries rather than
  documented.

---

## Design rulings that STAND (terminal: reconciled `no-claims` = a decision)

### The `@aihu/use` layering triad — E1/E2/E3, fully resolved & cross-consistent
The frame: `@aihu/use` is a **signals-only CORE** (no `@aihu/runtime` dep, usable in
SSR / plain-signal contexts) **+ an optional runtime-coupled subset** for the few
composables that genuinely need runtime primitives.

- **FEL-413 — `use` layering (foundational).** The CORE-vs-runtime-subset split + the
  two composables that need runtime. `useFetch`/`useCurrentElement` are ruled OUT of the
  signals core (they need `element`/`createResource`, not just `connected`/`onCommit`).
  Impl is speccable as `FEL-413-impl` (surface `packages/use`); must-fail = today those
  two have no compiling path (`import getLifecycleHost` gives `connected`/`onCommit`
  only). E2 generalizes this ruling.
- **FEL-391 / E1 — reactivity model.** Ratify **replace-don't-mutate**: explicit,
  reference-compared signals; **NO deep/structural reactivity, no deep Proxy.** Tradeoff
  accepted: more ceremony (you must write `state(...)`) bought for reactivity being
  VISIBLE at the declaration site. Evidence: `use-categorical-parity.md §654-659` +
  `packages/signals/src` (signal.ts/computed.ts reference-compare). **This is the same
  call as C-GH-487 `@state` let-vs-state → EXPLICIT** (see below); keep them consistent.
- **FEL-392 / E2 — the `@aihu/runtime` exception.** Generalizes FEL-413: signals-only
  CORE + a narrow runtime subset (only `useFetch`/`useCurrentElement`). Evidence: plan
  §665-668 + `packages/use/src/shared/index.ts` ("deliberately does not depend on
  @aihu/runtime"). Tradeoff: two tiers, different dependency footprints; runtime-subset
  consumers pull `@aihu/runtime`.
- **FEL-393 / E3 — `tryOnMounted` is a stub.** Back the `tryOn*` lifecycle family with
  the #549 **`getLifecycleHost`** — which lives on **`@aihu/signals/lifecycle`, NOT
  `@aihu/runtime`** — so it stays in CORE. `useMounted` separately ruled do-not-ship
  (lifecycle-ownership §5.1). Evidence: plan §674-677 + `packages/signals/src/lifecycle.ts`.

### FEL-362 — FiniteStateMachine layer
**FSM lives in `@aihu/use` (the signals-only utility layer), NOT `@aihu/primitives`, and
ships STANDALONE now — not gated on the dropdown/combobox consumer.** Reasoning: an FSM
is pure state logic (zero DOM/runtime), so unlike FEL-413's runtime composables it has no
constraint pushing it up into `@aihu/primitives`. Evidence:
`docs/plans/2026-07-23-use-parity-and-daisyui.md §8 L479-481` (left explicitly open).

### Open-verb-set amendment (bus payloads) — `docs/typed-bus-payloads.md`
`Claim.verb` is an **OPEN set with a validated FORMAT**, NOT a closed enum. Format:
`/^[^\s:]+$/` (non-empty short identifier, no whitespace/colon) + `target: z.string().min(1)`.
**#664 overruled the closed-verb enum with measurements** — the anti-silent-failure lives
in the FORMAT (colon-free non-empty verb, non-empty target), not an enum whitelist.
Committed `b7de913` on branch `design/typed-bus-payloads`, remote-verified.

### `/state`-vs-payload — TWO schema sets, not one (C-SWARM-SCHEMA)
The contract conflated two distinct schema sets:
- **Bus PAYLOADS** (Verdict/Blocked/Claim) — already validated in Rust at the boundary by
  `swarm-bus`; **no TypeScript code sends them.** `Record<string,unknown>` in `useSwarm`
  was CORRECT for these. A Zod mirror would type a caller that doesn't exist → **DEFERRED,
  not dropped** (real work when a TS sender exists).
- **`/state` VIEW-MODELS** — the ONLY shape crossing into TypeScript (`useSwarm` receives
  it). This was the actual untyped surface, so it was the work.

Shipped: **draft PR #672** (`feat/swarm-state-zod` @ `7b8dc599`, ci-ok=SUCCESS,
mergeable). `packages/use/src/useSwarm/schema.ts` (typed view-models + dependency-free
`parseSwarmState`) + `error()` getter. CLOSED fixed-shape rows (renamed field → named
error) / OPEN `agents[]` (#664 granularity at the right level). `reviews[].pr` left honest
as `string|null` (not coerced — that's dashboard.py formatting). **Hand-rolled validator
over zod** (zod absent from monorepo; `@aihu/use` is dependency-minimal; same substance,
zero dep, cheap to flip). Must-fail landed with BOTH clauses (error names field AND state
keeps last good frame). **`~/.swarm/dashboard.py` is out-of-tree/UNGATED** — this types the
consumer only; the cross-language contract is not enforced end-to-end. Say that in any
follow-up.

### C-SWARM-QUEUE-ROUTING — sync --pull scoping (handed to Rust builder)
**Filter on the Linear `project` attribute, include-iff `project == aihu`; NEVER read the
title.** Root cause: `packages/swarm/src/main.rs:184` hardcodes `LINEAR_TEAM_KEY="FEL"` and
ingests every open FEL issue — team FEL mixes products (aihu/data/web). Output is
**THREE-STATE, not KEEP/EXCLUDE**:
- `KEEP` — `project==aihu` → offered contract.
- `EXCLUDE` — `project in {data,web}` → owned elsewhere; TERMINAL.
- `NEEDS-PROJECT` — no project set → UNCLASSIFIED, provisionally held out, an actionable
  WORK ITEM (10-sec Linear fix), printed as its OWN list.

Fail-direction VINDICATED by measurement: 24 of 144 open FEL issues carry no project, and
9 are active aihu contracts (FEL-459/449/443/442/424/423/421/420/419) that a naive
include-iff filter would have SILENTLY DROPPED. Must-fail: dry-run asserts the no-project
bucket contains those 9. Semantics fixed + value known → Rust execution, not architect work.
**Ratified verbatim + CLAIM RELEASED, retargeted to builder-b (2026-07-27).** Sequenced
AFTER C-SWARM-WAL-STALE: both live in `packages/swarm/src/main.rs` (WAL-STALE at open_db
~496-503; routing at 263/1496-1632/1785 — non-overlapping regions, but two branches on one
file is the 5×-repeated collision hazard, so one after the other). Architect half complete;
nothing further owed.

---

## Still open / genuinely the founder's (not mine to decide)
- **C-GH-487 — `@state` let-vs-state authoring fork.** Public authoring surface. Working
  decision: **EXPLICIT** (`let x = state(0)`, not auto-reactive bare `let x = 0`) —
  consistent with FEL-391/E1. A flip is cheap. Ultimately Shane's call; decomposition
  proceeds on the explicit default.
- **The uncut release.** Outward-facing + irreversible → a founder decision, never a wake's.

## Epic decomposition method (ratified, proven on C-GH-483 and C-GH-487)
Cut along **ROLE+FEATURE seams**, not compiler phases. Resolve embedded design forks
inline. **`needs` edges must point at BARRED, claimable contracts** (never at a declined
parent). The parent **leaves the queue** (declined, recon = "DECOMPOSED not dropped —
superseded by children …"). **Bar the full arc UP FRONT** — a barred-but-blocked contract
is cheap (sits behind a `needs` edge); an unbarred one is expensive (recirculates through
triage every pass).

## Operational facts (save the next instance a rediscovery)
- **Bus identity is `(workspace, role)`.** Run `swarm-bus` from
  `/Users/smcguirt/conductor/workspaces/agent-swarm/sydney` — a send from `/tmp/...`
  fails with IDENTITY MISMATCH (exit 5).
- **`~/.swarm/bus.db` is WAL-mode and never checkpoints.** Read it live with `sqlite3`
  (WAL-aware) or copy `.db` + `-wal` + `-shm` TOGETHER. `md5 bus.db` unchanged ≠ untouched.
  Contract rows are queryable: `sqlite3 ~/.swarm/bus.db "SELECT id,status,note FROM contract WHERE …"`.
- **reconcile only selects `claimed`/`building`/`submitted`/`no-claims`.** An
  `offered`+no-claim contract is invisible to reconcile forever — that was the loop root.
- **I may NOT `setstatus verified`/`no-claims`** (reconcile-only) and must not status-move
  contracts I don't own. Bus is the ONLY channel — no Slack (invisible to every gate).
- **A `blocked` MUST carry `--question`** (the one thing a human decides) and lands in the
  console DECIDE bucket attached to its contract. A blocked with no natural contract gets
  its OWN row, never a borrowed one.
- **Claim-mechanics asymmetry (a tool gap, two faces).** The orchestrator CAN hand a
  contract over by re-offering — which DOES release the current claim (`offered | owner=…`).
  But nobody can AMEND a claimed contract's bar without releasing the claim (re-offer resets
  status to `offered`). So a mid-flight correction to a bar lives on the bus while the
  contract row still shows the stale surface. Don't rely on the row's bar being current if a
  correction crossed it.
- **Draft-CI rule changed 2026-07-27 (#670, main `41c37df6`).** A draft PR NO LONGER fails
  `ci-ok` — it emits a `::warning::` ("not evidence of a pass"). The old rule "draft
  `check=SKIPPED` + `ci-ok=FAILURE` = the FEL-437 guard working" is RETIRED. On a run
  produced AFTER 01:12Z, a red `ci-ok` on a draft means something REAL — triage it. Runs
  predating 01:12Z still show the old FAILURE, so check the run timestamp before reading a
  draft red either way.
- **Durability:** commit + push a draft PR as soon as there's a real edit; verify on the
  REMOTE (`git ls-remote`), not the push output. A `git worktree` (`.git` is a FILE) keeps
  objects/refs in the PARENT clone, so a `/tmp` wipe costs the checkout, not the commit; a
  standalone clone (`.git` is a DIRECTORY) in `/tmp` really is the only copy.
