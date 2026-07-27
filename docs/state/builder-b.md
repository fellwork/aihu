# State — builder-b

**Role:** BUILDER-B · **Workspace:** `zurich`
**Base:** `origin/main` @ `2350f49c`
**Last updated:** 2026-07-27. Six PRs merged, one open (#655, FEL-GH478).

> Ownership: `docs/state/` is historian's. This file exists because the
> orchestrator asked each role to write one before standing down.

**Surface (by the 2026-07-26 split):** `packages/cli/**`, the config/template
surface, `docs/plans/**`, and the `ci-ok` job in `.github/workflows/plan-a.yml`
(extended for FEL-437; confirmed in writing). *Not* `examples/**`,
`scripts/build-governed-examples.ts`, `governed-roster.json`, `.tastemaker/**`.

| PR | What it established |
|---|---|
| #609 `bef4c66f` | config lives in `vite.config.ts` (rebase + conflict resolution) |
| #621 `3452c896` | FEL-391 — E1 ratified, approval-by-merge closed |
| #622 `ba752f91` | FEL-423 — the readiness floor assertion |
| #627 `36021ea9` | FEL-437 — `ci-ok` refuses a draft that built nothing |
| #632 `…` | FEL-431 defect 5 — `git-init` leaves a real commit |
| #641 `2e231e4c` | FEL-441 — `$ref` `onMount` hoisted ahead of `@state` callbacks |
| #655 open | FEL-GH478 — `<$slot>` fallback children survive compilation |

---

## 2026-07-27 — FEL-GH478, and how the compiler lane is actually verified

`createSlotBoundary = (o, b) => slot(o?.name ?? undefined)` dropped `b`, the
authored fallback-children fn, so `<$slot>fallback</$slot>` compiled to a
childless `<slot>` in every shadow mode. The fix emits the fallback **as the
slot's children** — `branch('slot', {name}, [b()])` — which is what native
Shadow DOM fallback *is*: a `<slot>` renders its own children when it has no
assigned nodes, and assigned nodes override them. `slot()` builds a terminal
leaf and structurally cannot carry children, so the helper had to change shape,
not gain an argument.

**The only acceptance that counts here is a from-source binary.** Measured, on
the rebased head:

```
fixed binary     (target/release/aihu-compile, cargo build --release exit 0)
  drive test     2 passed
pre-fix binary   (one line reverted, full rebuild)
  drive test     2 FAILED — AssertionError: expected '' to contain 'fallback text'
restored         2 passed
```

Each direction costs a ~2m30s release rebuild. Budget for it; there is no
shortcut, because `AIHU_COMPILE_BIN` unset means vitest exercises the
**published** addon and a Rust fix is invisible to its own test.

**And the drive-test harness skips rather than fails when no binary is found.**
`it.skipIf(!HAVE_COMPILER)` — CI is safe (`plan-a.yml` builds and stages
`packages/compiler/bin/aihu-compile` before vitest), but a local run with
`AIHU_COMPILE_BIN` unset and no `target/` reports **green having compiled
nothing**. Set the env var explicitly and read the test count, not the exit
code.

---

## DO NOT REDO — settled by measurement, not argument

### `ci-ok` cannot render "did not run" as absent. It is a two-valued space.

The single most expensive thing to re-derive. The orchestrator proposed that
`ci-ok` simply not report on drafts (one line: `if: always() && draft != true`)
on the principle that *"failed" asserts an evaluation that never happened*. The
principle is correct. **The platform does not implement it.** Measured on two
throwaway draft PRs, same base, only the rendering differing:

```
#630  variant A (fail)    ci-ok = failure   ->  mergeStateStatus = BLOCKED
#629  variant B (absent)  ci-ok = skipped   ->  mergeStateStatus = CLEAN
```

An `if:`-false job **still emits a check-run**, with conclusion `skipped`, and
**GitHub treats a skipped required check-run as satisfying branch protection**
(`required_status_checks.contexts == ["ci-ok"]`, verified against the API). So:

```
success | skipped | neutral      -> SATISFIES protection
failure | cancelled | timed_out  -> BLOCKS
```

Variant B would ship a draft reporting **CLEAN and MERGEABLE with `check`
skipped** — strictly worse than the defect FEL-437 exists to fix. `failure` is
not chosen because it is accurate (it isn't); it is the only rendering GitHub
will not treat as a pass.

**The doctrine line in `docs/lessons` needs its qualifier or it leads to this
defect:** *"never render did-not-run as a verdict; the honest rendering is
ABSENT"* — **"…and when the platform offers no absent state, map it to the
BLOCKING verdict, never the passing one."**

Residual cost, unfixed and real: drafts carry a red X by construction, which is
the `bench` erosion. Unavoidable in a two-valued space. The red does **not**
persist — `gh pr checks` and branch protection both use the latest run, so a
draft goes green on the ready re-run. Do not warn people that it lingers; that
would discourage drafting, which is the opposite of the intent.

### `minimal` / `docs` cannot adopt served agent-readiness routes

FEL-423 was filed as *"`full`/`minimal`/`docs` adopt `createAgentReadinessRoutes()`"*.
Two thirds of that is not actionable and was rescoped:

- **`full` already does it, entirely** — `templates-full.ts:607`; `cli.test.ts:352`
  already asserts it has no build-time integration. `agent` likewise (#601).
- **`minimal`/`docs` scaffold no server at all.** No `server.ts`, `mcp.ts` or
  `readiness.ts`. Adopting served routes means adding a server process to the two
  templates whose identity is a static client build — a product change.

Ruled **KEEP** the build-time documents. Their cards are honest (#609). The
residual hole is `llms.txt` having no `## Components` despite declared `$action`
entries, caused by `elide_agent` at `packages/compiler/src/codegen/emit.rs:206`
stripping `registerAgentMetadata` on client targets — **a compiler gap, tracked
as FEL-434**, not fixable in `packages/cli`. Reasoning is recorded in
`appViteConfig`'s doc comment so it is answered at the site.

### `collectSetupShape` does not exist

Named as the runtime state detector in three FEL-391 comments, in
`2026-07-24-deep-reactivity.md`, and in `packages/store/src/types.ts:91` — and
`gen-api.ts` lifts that comment verbatim, so the phantom **was published to the
docs site**. `grep -rn --include="*.ts"` matches only comments, never a
declaration. The real function is **`instantiateSetup`** (`store.ts:186`, pass 1
at `:190-197`). Corrected at source in #621; the generated file will pick it up
on the next `gen:api`.

### The `agentReadiness` ESM rationale was false

#612 wired `viteAgentReadinessIntegration` directly, commenting that this was
done *"rather than via viteAihuPlugin's `agentReadiness` option so it loads as an
ESM import."* The option has been typed and lazily loaded via dynamic `import()`
**since #53**, with a comment already explaining why `require`/`createRequire`
fail there. Deleted in #609. Do not reinstate it.

### FEL-391 items 2 and 3 are still owed

E1 is ratified; the work is not finished. `@aihu/use` **cannot** import
`@aihu/reactive` — `packages/use/package.json` declares `@aihu/signals` as its
sole dependency, optional peers are `@aihu/context`/`@aihu/router`/`jwt-decode`,
and `families.json` declares only `math`/`motion`/`router`/`integrations`. So
`useObject`/`useCloned`/`useForm` are blocked on **packaging, not doctrine**.
Refinement the record lacked: the helpers are on the **`@aihu/reactive/helpers`
subpath**, not the root.

---

## Traps I hit — each cost real time

**`${PIPESTATUS[0]}` is EMPTY in zsh, and this is zsh.** The swarm's own
mandated remedy is a bash idiom. `${pipestatus[1]}` (lowercase, 1-indexed) is
the zsh form; `OUT=$(cmd); RC=$?` unpiped is better. It nearly cost me a wrong
conclusion — `REBASE_EXIT=0` from `$?` after `| tail` while `git rebase` had
stopped on a conflict.

**The legacy-snapshot gate is EXCLUDED from the root vitest config.** A green
`bun run test packages/cli` does **not** cover it. Run it explicitly:
`bun run test packages/cli/tests/legacy-snapshot.test.ts --config vitest.gates.config.ts`.
Anything touching scaffold output must.

**`rm -rf` of `legacy-snapshot.golden/` deletes a hand-written README** the
generator does not recreate — the harness deliberately skips it when walking the
golden. Restore it after regenerating; the footgun is now documented in the file
itself.

**A stale local `origin/main` plus a two-dot diff reported 25 files for a
5-file PR**, including two other agents' merged work as my blast radius. Always
`git fetch` then `git diff origin/main...HEAD`.

**A conclusion is scoped to the premises it was drawn under.** I nearly carried
the #609 "matrix is environmental" verdict onto a diff that *deletes*
`packages/cli/src/templates/` — making "scaffold still works" the one claim I
was least entitled to assume. The grid settled it: all four CLI templates
scaffold `ok` on every package manager.

**Index-based test fakes silently retarget.** Three post-install tests asserted
the call sequence *by position*; `git-init` grew from one command to three, so
`calls >= 3` — written to mean "lint-fix" — now points at `git commit`. It would
have kept passing **while asserting something other than what it was written
for**. Assert on shape, not position.

**`git log -- <path>` reads your HEAD, not the remote — fetch FIRST.** I ran
`git log -- CLAUDE.md`, saw the newest change was months old, and concluded
CLAUDE.md was unchanged. It had been rewritten in the working tree (the
bus-only / `docs/state/` protocol) and *staged by another actor* while I was
mid-build. Same family as the stale-`origin/main` trap below, one level up: the
question was scoped to a ref that predated the thing I was asking about.

**This worktree changes under you between turns.** `CLAUDE.md` went from clean
to `M ` (**staged**) at 16:07 while a `cargo build` of mine was running. Any
`git commit -a` — or a bare `git commit` with something already in the index —
sweeps another agent's work into your PR. Run `git status --short` and
`git branch --show-current` **immediately before every commit**, and path-scope
every commit (`git commit <paths>`), never `-a`.

**A release PR can land between your commit and your push.** `chore(release):
version packages` bumped `@aihu/compiler` 1.1.1 → 1.1.2 while my branch carried
a hand-written FEL-414 lockstep bump of the platform packages — the two collide
in `packages/compiler/package.json` and the generated README tables. Resolution
that works: take **main's** `@aihu/compiler` version, keep **your** platform
versions and `optionalDependencies` pins, then re-run
`bun scripts/sync-readme.ts` and let it own every generated table. Confirm with
`bun scripts/sync-readme.ts --check` and `BASE_REF=main bun run
check:compiler-binary-bump` (both exit 0).

**`gh api ".../check-runs?per_page=100"` MUST be quoted.** Unquoted, zsh globs
the `?` and dies with `no matches found` — a *failed question* that looks
nothing like an answer, but is easy to read past in a batch of output.

**`state-model-sidecar-tsc.test.ts` times out at 5 s under parallel load.** It
shells out to `tsc --strict`; a full `bun run test packages/compiler` right
after a cargo build reports it failed. It passes 4/4 in isolation. Re-run the
file alone before reporting a red.

**A red `ci-ok` on a draft is FEL-437 working, not a defect** — my own fix. The
draft-time run reports `ci-ok failure` with `check` skipped; mark the PR ready
and the re-run supersedes it. Do not debug it, and do not report the draft run
as the PR's verdict.

**Gate currency is the needs-list, not the behind-count.** A PR can be 0 behind
and still remove a required job from `ci-ok`'s `needs`. Diff the line directly,
and assert both sides are non-empty first — two failed `git show` calls make
`diff` succeed and report IDENTICAL.

---

## Open / parked

- **#632** (FEL-431 defect 5) — `git-init` ran `git init` alone, leaving an
  unborn HEAD; `git rev-parse HEAD` exited 128 and every command the cf-team CLI
  prints failed. Now init + add + commit, with identity passed **explicitly**
  because `git commit` fails outright with no resolvable identity — the normal
  state of CI runners. Ambient config would have fixed it on a dev machine and
  left the bug in exactly the environment the scaffold matrix runs in.
- **`create.ts` has the same gap — PARKED with a ruling.** It uses ambient
  identity *and ignores the commit's exit status*. Ruled: ambient when
  resolvable, explicit fallback when not, **and check the exit status either
  way** — point 3 is the actual defect; 1 and 2 are the shape. Affects fresh
  containers and CI, not developers with configured git.
- **FEL-434** — the `elide_agent` compiler gap behind FEL-423's residual hole.
- **FEL-391 items 2/3** — `@aihu/reactive` packaging, and the `@aihu/store`
  `isReactive()` gap in `instantiateSetup`.

## What the next instance must not redo

1. Do not propose "`ci-ok` should skip on drafts". Measured: it renders CLEAN.
2. Do not try to give `minimal`/`docs` served readiness routes. They have no
   server, and that is what those templates *are*.
3. Do not re-derive `collectSetupShape`. It has never existed.
4. Do not reinstate #612's ESM rationale for avoiding the `agentReadiness` option.
5. Do not read a green `ci-ok` as coverage. Read `check`'s own conclusion.
6. Do not use behind-count as the gate-currency test.
7. `packages/cli/src/templates/` is **deleted** — it was dead code whose
   `AGENTS.md` taught the *inverse* of its own rule to any agent that read it.
   Do not restore it looking for scaffold templates; they are in
   `src/index.ts`, `templates-full.ts`, `templates-agent.ts`, `templates-tooling.ts`.
8. Do not report a compiler fix verified without naming the binary that
   produced the numbers. Unset `AIHU_COMPILE_BIN` = the published addon.
9. Do not re-derive the slot fallback shape. `slot()` is a terminal leaf;
   fallback requires `branch('slot', …, [b()])`. Both directions are covered by
   `packages/compiler/tests/slot-fallback-drive.test.ts`.
10. **Do not post to Slack.** Founder ruling 2026-07-27: the bus
   (`~/.swarm/bin/swarm-bus`) is the only channel the reconciler, console and
   Linear/GitHub sync read. Slack-only work did not happen, in ledger terms.
11. Do not set your own contract status to `verified` / `no-claims`. That is
   the supervisor's reconcile pass. `no-claims` on a contract you own means
   your claims were not extractable — send the verdict again with `--claims`
   in `key:value` shorthand and `--pr`, do not argue about it in prose.
