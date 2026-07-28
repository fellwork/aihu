# State — builder-b

**Role:** BUILDER-B · **Workspace:** `zurich`
**Base:** `origin/main` @ `3891300a` (rebased 2026-07-28, 0 behind)
**Last updated:** 2026-07-28. Seven PRs merged, two open — #655 (FEL-GH478)
and #684 (C-FEL-SCAFFOLD-PM-COMPAT, draft, at `30d09ee4`, rebased; **red on
`check:moon-graph` for a reason that is not mine — see 17**).

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

**That is a CLASS, not an incident: this substrate's docs are authored in bash
idiom and executed in zsh.** Second instance, found by verifier as FEL-461 and
reproduced here — `SKILL.md:62-64` prescribes `S="bun
.claude/skills/swarm/swarm.ts"` then `$S whoami` under *RUN THIS FIRST*. zsh
does not word-split unquoted parameters, so the whole string is taken as one
command name. Measured in `zurich`, exit codes captured **unpiped**:

```
zsh   S="bun .claude/skills/swarm/swarm.ts"; $S whoami   rc=127
        zsh:1: no such file or directory: bun .claude/skills/swarm/swarm.ts
bash  (same line)                                        rc=0  role: builder-b
zsh   swarm() { bun … "$@"; }; swarm whoami              rc=0  role: builder-b
```

Loud, not silent — rc=127 with the cause in the message — so it is not the
empty-and-green class. But it is the one line every new agent runs, and it reads
as a broken install. Before quoting any fenced block from this repo's agent
docs, check it against `zsh -c`, and when the fix lands, its acceptance must
**extract and run the block**, not a hand-typed equivalent — a hand-typed
equivalent that happens to work is how both of these survived.

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

**`git stash push -- <paths>` ABORTS on an untracked pathspec — and the
`git stash pop` you write next still succeeds, against SOMEBODY ELSE'S STASH.**
Hit 2026-07-28 wanting a clean-tree control run. One of my three paths was a
new untracked test file, so the push died with
`error: pathspec … did not match any file(s) known to git` and stashed nothing.
I then popped, believing I was undoing my own push, and instead applied
builder's stashed `docs/state/builder.md` (+62/-3, their PR #656 update) into
the shared worktree — one `git commit -a` from being swept into my PR. Re-stashed
it intact and disclosed on the bus; recovery sha was `776b263f`.
**I scoped this trap too narrowly and builder corrected it with a measurement —
the stash stack is per-REPOSITORY, not per-checkout:**

```
git rev-parse --git-common-dir  ->  /Users/smcguirt/conductor/repos/aihu/.git
git worktree list | wc -l       ->  132
```

They ran `git stash list` from `almaty` and saw a stash created in `zurich`.
So it is shared across **132 worktrees**, not "this checkout" — any agent in any
of them can pop or drop any other's work, and a bare `git stash pop` takes
`stash@{0}`, whoever pushed last from wherever. The index lock is per-worktree
and merely blocks you; **the stash stack is global and mutates silently.**

**Therefore: do not use `git stash` as scratch space in this repo at all.** Use
a WIP commit on your own branch — per-branch, unpoppable by a stranger,
recoverable by reflog. For a clean-tree control run, touch no git state: copy
the files to `/tmp`, `git checkout HEAD --` them, run, copy back. That is what I
did on the retry and it cost nothing.

Postscript worth keeping: the entry I popped turned out to be on **no branch at
all** (`git branch -a --contains 776b263f` → empty) — a prior builder's durable
state for C-FEL-EXTERNALS, whose PR #656 had already merged while its state
record never landed. Builder preserved it at
`origin/recover/builder-state-fel-externals`. The near-miss was not "someone's
uncommitted edit"; it was the only copy of a merged contract's record.

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

0a. **#684 STAYS DRAFT. A `verified` status on C-FEL-SCAFFOLD-PM-COMPAT is a
   RECONCILER ARTIFACT, not a review.** Architect's ruling 2026-07-28
   (`docs/decisions/2026-07-28-reconciler-is-not-a-verifier.md`): `recon.py`
   regexes prose and grounded the claim "I wrote **to** the file" against any
   shell redirect through a path containing adjacent `t`,`o` — *conduc**to**r*.
   That is verbatim the evidence string on my own row. It never reads the
   structured `claims` column that 53 of 65 verdicts already populate. Coverage
   ~0, precision 0/2. So: do not read a green ledger row as acceptance of this
   PR, and keep sending `--claims` in `key:value` shorthand regardless — the
   structured field is the one that will survive the fix.

0. **Do not re-derive the pnpm build-script mechanism.** It is `allowBuilds`
   (a map) on pnpm 11, measured three ways — see item 15b. And do not conclude
   "there is no pnpm here": there is, it just needs a node ≥22.13 that is
   already on disk.
1. Do not propose "`ci-ok` should skip on drafts". Measured: it renders CLEAN.
   **AMENDED 2026-07-28 — someone else deliberately changed the draft rendering
   and they were right to.** FEL-437 made a draft's `check`-skipped a `failure`;
   `plan-a.yml:481-495` now makes it a **`::warning::` and lets ci-ok go green.**
   The argument in that comment is better than mine: agents are instructed to
   push a draft PR at their first edit, so EVERY agent PR was red from birth,
   the queue filled with red meaning "unfinished", and real failures hid in it —
   the same noise-over-signal defect already fixed for the bench lanes. My
   measurement is NOT contradicted: an `if:`-false job still emits a `skipped`
   check-run and GitHub still treats that as satisfying protection, so
   "ci-ok should not report on drafts" remains wrong. What changed is the
   verdict for a job that DID run. Do not revert it to `failure`.
   **The cost is now yours to carry, and I paid it this wake:** a draft's
   `ci-ok: success` is indistinguishable from a real one in `gh pr checks`, and
   the warning is invisible there. See rule 5 — it is no longer a nicety.
2. Do not try to give `minimal`/`docs` served readiness routes. They have no
   server, and that is what those templates *are*.
3. Do not re-derive `collectSetupShape`. It has never existed.
4. Do not reinstate #612's ESM rationale for avoiding the `agentReadiness` option.
5. Do not read a green `ci-ok` as coverage. Read `check`'s own conclusion.
   **This bit me for real on 2026-07-28 and it is the single cheapest mistake to
   make.** My rebased branch showed `Plan A — TS runtime family: success` in
   `gh run list`, and the run's own job list was:
   ```
   ci-ok   completed  success
   check   completed  SKIPPED     <- nothing was built or tested
   ```
   Since the draft rule is now a warning (rule 1), a draft PR's `ci-ok` is green
   with `check` skipped BY DESIGN. So on a draft, `ci-ok` carries no information
   at all. Read it with:
   `gh run view <id> --json jobs --jq '.jobs[] | "\(.name)\t\(.conclusion)"'`
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
12. **`@aihu/app` declares NO runtime `dependencies` — every import it makes is
   a `peerDependency`.** Verified at source 2026-07-28: `dependencies` is
   literally absent from `packages/app/package.json`; the peers are `arbor`,
   `router`, `runtime`, `server`, `signals`, `store`, `vite`, and there is no
   `peerDependenciesMeta`, so none are optional. Any scaffold that lists
   `@aihu/app` must list all of them. npm 7+, pnpm and bun auto-install peers
   and will hide an omission on 3 of 4 package managers; **yarn 1 does not**, so
   yarn is the only cell that fails and the only one that tells you the truth.
   Corollary: *a green yarn cell is worth more than three green ones elsewhere.*
   **It is a CLOSURE, not one package's list — I got this wrong twice.**
   `@aihu/runtime` and `@aihu/arbor` also declare zero dependencies and express
   everything as peers, so `@aihu/context` is required but is reachable *only*
   through `@aihu/runtime`. Fixing `@aihu/app`'s own list just relocated the
   yarn error from `@aihu/store` (run 30322552896) to `@aihu/context` (run
   30333109465). `packages/cli/tests/scaffold-peer-closure.test.ts` now walks
   the real manifests; do not replace it with a hardcoded list.
   **And there are TWO emitters.** `minimal`/`docs` use `appPackageJson` in
   `src/index.ts`; `full` AND `agent` share `agentPackageJson` in
   `templates-agent.ts`. My first closure guard checked only the first and
   passed green while two of five templates still shipped the identical defect
   (run 30333950275). A guard covering one of two emitters is worse than none —
   it is the same false-negative shape as a cell that SKIPs green. The test is
   table-driven over emitters now; add to `EMITTERS`, do not write a second file.
   Do not fix this class by promoting a peer into `@aihu/app`'s `dependencies` —
   that lets the app install a private copy beside the consumer's, and two
   `@aihu/store` instances mean two module-level registries, so hydration writes
   to one and reads the other.
13. There is **no single spelling of an intra-workspace dependency range that
   all four package managers accept.** Measured, not inferred:
   `workspace:*` → bun ok, pnpm ok, npm `EUNSUPPORTEDPROTOCOL`, yarn 1 asks the
   *registry* for a package at that literal version. Bare `*` → bun/npm/yarn ok,
   but pnpm 10 defaults `link-workspace-packages` to **false**, so `*` resolves
   from the registry rather than linking the sibling. It must be chosen per-PM
   (`workspaceProtocolFor()` in `scaffold-pipeline.ts`; `options.pm` was already
   threaded through). Do not "simplify" it back to one constant.
   Also: pnpm ignores the `workspaces` array in package.json entirely and needs
   `pnpm-workspace.yaml`; and pnpm ≥10 blocks lifecycle scripts *and exits
   non-zero* (`ERR_PNPM_IGNORED_BUILDS`), so every emitted manifest needs
   `pnpm.onlyBuiltDependencies` as the counterpart of bun's
   `trustedDependencies`. Bun blocks the same scripts **silently** — so bun
   passing proves nothing about whether the postinstall actually ran.
14. Two failures in scaffold-matrix run `30322552896` are **not** package-manager
   defects; do not fold them into a PM contract. (a) `full` × bun *and* npm at
   `dev`: the script is `concurrently "bun run server" "vite --port 5108"`, so
   the harness's `--port <random> --strictPort` is appended to `concurrently`
   and never reaches vite — vite binds 5108, the harness polls the random port,
   120 s timeout. (b) `cf-team` × bun at `typecheck`: `moon run :typecheck`
   diffs against `main`, and a freshly `git init`-ed scaffold has no such
   revision (`fatal: ambiguous argument 'main'`, exit 128). Both fail on bun,
   which is what proves they are not PM-compat.
15b. **SOLVED 2026-07-28 — pnpm 11 RENAMED the setting. `onlyBuiltDependencies`
   → `allowBuilds`, a map, not a list.** Two attempts failed before this
   because both were spelling the pnpm-10 key; the second failed *silently*,
   which is what made it look like a wiring bug. It was not. Measured locally
   on pnpm 11.17.0 — the runner's exact version — one package depending on
   `esbuild@0.25.12`, three otherwise-identical dirs:

   ```
   no pnpm-workspace.yaml        rc=1  ERR_PNPM_IGNORED_BUILDS: esbuild@0.25.12
   onlyBuiltDependencies: [...]  rc=1  ERR_PNPM_IGNORED_BUILDS: esbuild@0.25.12
   allowBuilds: {esbuild: true}  rc=0  esbuild postinstall$ node install.js Done
   ```

   The middle row is the whole finding: **the legacy spelling is
   indistinguishable in effect from having no file at all**, and pnpm does not
   warn about it. So "the file is emitted" was never the property worth
   testing — assert the KEY.

   **GET PNPM RUNNING LOCALLY; it is a 2-minute setup, and it converts a
   10-minute matrix run per hypothesis into 11 seconds.** The reason nobody had
   is a trap of its own: `npm i -g pnpm@11` *succeeds*, then every invocation
   dies with `requires at least Node.js v22.13` (this box's default node is
   v22.12.0), which reads as "pnpm is broken here". It is not — point it at a
   newer node that is already installed:

   ```
   ~/.proto/tools/node/22.22.2/bin/node $(npm root -g)/pnpm/bin/pnpm.cjs install
   ```
15c. **Two more defects sat BEHIND the pnpm one, and neither was findable from
   the generator.** Both found 2026-07-28 by running the acceptance instead of
   asserting it — the scaffold emitted a perfectly correct
   `pnpm-workspace.yaml` and still could not be installed.
   - **The `agent` template never emitted `pnpm-workspace.yaml` at all.**
     `minimal`/`docs` (`index.ts:857`) and `full` (`templates-full.ts:1268`)
     did; the `agent` file list (`index.ts:798`) simply lacked the line. Same
     false-negative shape as item 12's two emitters, one level out: the setting
     was right in the generator and absent from one of four **file lists**.
   - **`aihu app --pm <x>` parsed the flag NOWHERE.** bin.ts resolved `--pm`
     for the template-package path and not for the built-in one, so every
     built-in scaffold took the `pm` default and emitted
     `"packageManager": "bun@…"`. pnpm then refuses outright — `ERROR: This
     project is configured to use bun` — before resolving one dependency.
     `create-aihu` threaded `pm` correctly all along; two entry points
     disagreeing about one flag is what kept it alive. Now both call
     `resolvePmFlag()`.
   **The lesson to carry, not the two bugs:** a test that calls
   `scaffoldApp({pm})` passes either way, because the break was in argument
   handling — it never executes the broken code. `packages/cli/tests/scaffold-pnpm-builds.test.ts`
   spawns the real CLI for that case and is table-driven over every template
   for the other. End-to-end acceptance: `--template agent --pm pnpm` then
   `pnpm install` went rc=1 → rc=0, with the installed esbuild binary reporting
   0.25.12 (so the postinstall `allowBuilds` unblocks really ran).

15d. **The legacy-snapshot golden was ALREADY RED on `main`** and had been for
   two commits — `pnpm-workspace.yaml` joined the baseline file set and
   `package.json` gained the three peer-closure entries, and neither refreshed
   the fixture. This is the concrete cost of the gate being excluded from the
   root vitest config (trap already recorded below): `bun run test packages/cli`
   was green the whole time. Refresh it by **copying the changed files** from a
   real `aihu app … --pm bun` run, not by `rm -rf` + regenerate — the directory
   holds a hand-written provenance README the generator does not recreate.

17. **#684 IS GATED ON SOMEONE ELSE'S CONTRACT, and the cause is two COMMENTS.**
   After rebasing onto `3891300a`, `bun run check:moon-graph` exits 1 demanding
   `packages/cli/moon.yml` add `- 'context'`. There is **no import of
   `@aihu/context` anywhere in `packages/cli/src`** — `@aihu/cli` is a
   build-time scaffolder with a zero-dependency thesis. The gate's regex is
   `/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/` and the two things it
   matches are both comments quoting a **Rollup error message** pasted from a CI
   log:
   ```
   packages/cli/src/templates-agent.ts:64          // … failed to resolve import "@aihu/context" from
   packages/cli/tests/scaffold-peer-closure.test.ts:27   *   run 30333109465  yarn build → failed to resolve import "@aihu/context"
   ```
   Causation proved by neutralising ONLY that quoted text in both comments →
   `check:moon-graph` **exit 0**; control on pristine main → **exit 0**. So the
   red is introduced by my branch and its sole cause is comment prose.
   **DO NOT REWORD THE COMMENTS TO GO GREEN.** That is the exact harm
   `dep-check.ts:193` was written to stop ("a false positive that forced a
   correct comment to be reworded to get CI green"). This belongs to
   **C-FEL-MOONGRAPH-LITERALS (builder's)** — do not co-own it.
   **The lever to hand them:** `scripts/dep-check.ts` ALREADY has a documented
   `stripComments()` (`:214`) from #681; `scripts/check-moon-graph.ts` has **no
   stripping of any kind**. The sibling fix was never ported. And note my
   specimen is the COMMENT variant, not the string-literal one — a fix that only
   skips string literals leaves #684 red.

18. **`check:gate-wiring` is RED on pristine `main`.** Measured in a throwaway
   worktree at `3891300a`: `bun scripts/check-gate-wiring.ts` → exit 1,
   `NEW ORPHAN: check:grammar-v2`. My branch touches no script and no baseline,
   so this is not mine — do not spend a wake on it thinking you broke it.
   Related and worth knowing before you trust ANY local gate run:
   `plan-a.yml:275` states outright that **`check:ci` is invoked by no workflow
   in this repo.** So `bun run check:ci` passing (or failing) is not the same
   question as CI passing. Check which job actually runs the gate you care about
   — `check:moon-graph` is `plan-a.yml:85`, inside `check`.

16. **~~The scaffold matrix cannot measure npm, pnpm or any cf-team cell until
   #677 lands.~~ #677 LANDED 2026-07-28 (`a3c05531`).** Kept for the reading of
   those old red rows, but the constraint is GONE: rebase onto main and the
   matrix is dispatchable for real —
   `gh workflow run "Scaffold DX matrix" --ref <branch> -f mode=local -f pm=… -f template=…`
   (`mode=local` tests the checkout, which is what you want for an unpublished
   fix; `mode=npm` tests published packages). The `pull_request` trigger reports
   **skipped** on a draft, so a dispatch is required, not optional.
   Original text: the matrix could not measure npm, pnpm or any cf-team cell until
   #677 landed. Dispatching it against a branch based on plain `main` gives:
   `SKIP pnpm — not installed` (the `npm install --global pnpm yarn` step
   silently fails), and every npm cell dies at `install` with
   `proto::commands::run::fallback_loop` out of esbuild's `sh -c node
   install.js`. cf-team fails the same way on *all* package managers because its
   scaffold shells out to `<pm> install`. That is #677's defect, not the branch
   under test — do not read those rows as a regression, and do not report a
   pnpm fix as verified from such a run. **Only the yarn column is trustworthy
   there**, which is a second reason yarn is the cell that matters.
