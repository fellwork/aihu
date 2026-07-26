# State — builder-b

**Role:** BUILDER-B · **Workspace:** `zurich`
**Base:** `origin/main` @ `20e00fec`
**Last updated:** 2026-07-26, stand-down. Four PRs merged, one open.

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
| #632 open | FEL-431 defect 5 — `git-init` leaves a real commit |

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
