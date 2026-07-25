# INV-C — PR #549 `examples` / `governed-examples` / `bench` / `bench-arbor`

**PR:** #549 `feat(signals): lifecycle ownership contract + runtime host attachment`
**Branch:** `feat/signals-lifecycle-contract` @ `e3759bf0` (base `7462edd4`)
**Run:** https://github.com/fellwork/aihu/actions/runs/30130097654
**Investigator:** read-only. No source modified in the user's checkout.

---

## Verdict (TL;DR)

Two independent problems, both mechanical, neither a design flaw in the lifecycle contract:

| Job | Cause | Class |
| --- | --- | --- |
| `examples` | Vite **alias prefix-shadowing** of the new `@aihu/signals/lifecycle` subpath in `examples/*/vite.config.ts` | Real regression from #549. Mechanical fix, ~17 files. |
| `governed-examples` | Same, via `examples/todo-mvc/vite.config.ts` and `examples/agent-driven-demo/vitest.config.ts` | Same root cause. |
| `bench` | Stale committed baseline (`prev=2026-05-25`) + runner drift | **Not** #549. Known recurring issue; established remedy is `[bench-bump]`. |
| `bench-arbor` | Same stale baseline; arbor source is untouched by #549 | **Not** #549. |

`check`, `ci-ok`, `storybook-ok` all pass on the PR; `bench-lsp`, `chromatic`, `storybook` skipped.

---

## Root cause (examples / governed-examples)

#549 introduces a new **subpath specifier**, `@aihu/signals/lifecycle`, and makes
`@aihu/runtime` import from it:

```ts
// packages/runtime/src/define-component.ts:16 (new in #549)
import { _attachLifecycleHost, getLifecycleHost, type LifecycleHost } from '@aihu/signals/lifecycle'
```

`packages/signals/package.json` correctly declares the subpath export
(`"./lifecycle": { types: ./dist/lifecycle.d.ts, import: ./dist/lifecycle.js }`), and
`packages/runtime/rolldown.config.ts` correctly adds it to `external`. Node/Vite
*package* resolution of that specifier works fine — proven by the governed examples
that do **not** alias signals (`ssg-site`, `css-engine-utility`) building green in the
same failing job.

The break is that **15 example `vite.config.ts` files (and 2 vitest configs) alias the
bare package name to a path**, and Vite alias entries with string keys are **prefix**
replacements, not exact matches:

```ts
// examples/live-counter/vite.config.ts:14 (unchanged by #549)
'@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
```

So `@aihu/signals/lifecycle` is rewritten to
`<example>/node_modules/@aihu/signals/lifecycle` — a filesystem path that does not
exist — and the package `exports` map is **never consulted**, because alias resolution
short-circuits it. The same shadowing hits the src-alias flavour, where
`'@aihu/signals': pkg('signals/src/index.ts')` turns the subpath into
`.../signals/src/index.ts/lifecycle`.

The PR author knew about this hazard in exactly one place — the root
`vitest.config.ts` gained a subpath-before-package alias with a comment citing the
`@aihu/runtime/ssr` precedent — but the other 16 alias sites were not swept.

## Exact error text

`examples` job (job 89603398850), building `examples/live-counter` with vite 8.0.16 /
rolldown 1.0.3, resolving from the **built** runtime:

```
[aihu] extract census — 2 surface(s)
✓ 11 modules transformed.
✗ Build failed in 64ms
error during build:
Build failed with 1 error:

[UNLOADABLE_DEPENDENCY] Could not load node_modules/@aihu/signals/lifecycle
 - No such file or directory (os error 2) in ../../packages/runtime/dist/index.js at 211..236
    at aggregateBindingErrorsIntoJsError (.../rolldown@1.0.3/.../error-BuvQYXuZ.mjs:48:18)
    ...
    at async Object.buildApp (.../vite@8.0.16/.../node.js:33672:153)
error: script "build" exited with code 1
```

`governed-examples` job (job 89603398840) — two failures reported:

```
build:governed-examples — 2 failure(s):
  ✗ todo-mvc: vite build exited 1
  ✗ agent-driven-demo: smoke suite exited 1
```

`agent-driven-demo`, running under **vite 6.4.3** (vitest 3.2.6), resolving from
runtime **source**:

```
FAIL tests/real-ws-bridge.test.ts [ tests/real-ws-bridge.test.ts ]
Error: Failed to resolve import "@aihu/signals/lifecycle" from
      "../../packages/runtime/src/define-component.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/runner/work/aihu/aihu/packages/runtime/src/define-component.ts:16:75
   8  |  import { _attachLifecycleHost, getLifecycleHost } from "@aihu/signals/lifecycle";
      |                                                          ^
```

`todo-mvc` fails identically to `live-counter` (same alias, vite 8).

## Causal chain from the diff

1. `packages/signals/rolldown.config.ts` → multi-entry (`index`, `lifecycle`),
   `entryFileNames: '[name].js'`. CI confirms the artifacts exist:
   `dist/lifecycle.js` (0.24 kB), plus a shared `scope-D-id5w3e.js` chunk;
   `mangle-dist: property mangling applied to 3 dist file(s)`. **The build side is fine.**
2. `packages/signals/package.json` → adds the `"./lifecycle"` export. **Fine.**
3. `packages/runtime/src/define-component.ts` → new `import … from '@aihu/signals/lifecycle'`.
   This is the first time any `@aihu/*` runtime package imports a **signals subpath**.
4. `packages/runtime/rolldown.config.ts` → adds `'@aihu/signals/lifecycle'` to `external`,
   so the specifier survives verbatim into `packages/runtime/dist/index.js`.
5. Every downstream consumer that aliases `'@aihu/signals'` by string prefix now
   mis-resolves that specifier → build/test failure.
6. Consumers that do **not** alias it resolve through the exports map and pass — the
   control case inside the same job.

## vite 8 / rolldown: RULED OUT

- The identical failure occurs under **vite 6.4.3** (`agent-driven-demo`) and **vite
  8.0.16** (`live-counter`, `todo-mvc`). Not a vite-8-only behaviour.
- Under vite 8, `ssg-site` (26 modules, vite 8.0.16) and other non-aliasing examples
  build green **in the same failing run**.
- `examples` and `governed-examples` are green on main @ `7462edd4` with the same vite
  8 / rolldown versions. #549 is the only variable.
- The discriminator is purely the presence of the `'@aihu/signals'` alias entry.

## Repro (local, exact commands)

```bash
git worktree add <scratch>/wt549 origin/feat/signals-lifecycle-contract   # e3759bf0
cd <scratch>/wt549
bun install --frozen-lockfile            # exit 0
bun run build                            # exit 0 — 45 tasks; packages/signals/dist/
                                         # contains index.js, lifecycle.js, scope-D-id5w3e.js
cd examples/live-counter && bun run build
```

Reproduced verbatim (vite 8.0.16 / rolldown 1.0.3):

```
[UNLOADABLE_DEPENDENCY] Could not load node_modules/@aihu/signals/lifecycle
 - No such file or directory (os error 2) in ../../packages/runtime/dist/index.js at 211..236
```

**Fix validated in the throwaway worktree** (discarded, worktree removed) — adding one
alias line above the package alias in `examples/live-counter/vite.config.ts`:

```ts
'@aihu/signals/lifecycle': resolve(__dirname, 'node_modules/@aihu/signals/dist/lifecycle.js'),
'@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
```

```
✓ 12 modules transformed.
dist/assets/index-CI6y0EFW.js   23.69 kB │ gzip: 8.45 kB
✓ built in 801ms
```

### Bonus finding — a third, CI-invisible breakage

`bun run test:integration` (`tests/vitest.config.ts`) is **also broken** on this branch
and is **not run by any workflow** (`grep test:integration .github/workflows` → no
hits), so CI cannot see it:

```
bunx vitest run --config tests/vitest.config.ts tests/integration/define-element-integration.test.ts
→ Failed to resolve import "@aihu/signals/lifecycle" from
  "packages/runtime/src/define-component.ts"
```

Ironically that file already carries the correct precedent two lines below
(`'@aihu/runtime/ssr'` placed before `'@aihu/runtime'`).

## Recommended minimal fix

Mechanical, no design change. Add a subpath alias **before** the package alias
everywhere `'@aihu/signals'` is aliased and `@aihu/runtime` is reachable:

**A. Dist-alias form — 15 files, `examples/*/vite.config.ts`:**
`agent-driven-demo`, `agent-hub`, `cf-adapter`, `color-theme`, `css-engine-demo`,
`currency-converter`, `live-counter`, `primitives-showcase`, `realtime-scores`,
`storefront`, `temperature-converter`, `timer`, `todo-mvc`, `weather-card`
(+ `agent-driven-demo/vite.config.ts` counted above)

```ts
// subpath before package — string aliases are PREFIX replacements
'@aihu/signals/lifecycle': resolve(__dirname, 'node_modules/@aihu/signals/dist/lifecycle.js'),
'@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
```

**B. Src-alias form — 2 files:**
- `examples/agent-driven-demo/vitest.config.ts`: `'@aihu/signals/lifecycle': pkg('signals/src/lifecycle.ts'),`
- `tests/vitest.config.ts`: `'@aihu/signals/lifecycle': new URL('../packages/signals/src/lifecycle.ts', import.meta.url).pathname,`

(`packages/magna/vitest.config.ts` aliases signals but never reaches `@aihu/runtime` —
no change needed today, though adding it is cheap insurance.)

Blocking-only subset, if the goal is just green CI: the 5 `examples`-job apps
(`live-counter`, `temperature-converter`, `timer`, `todo-mvc`, `color-theme`) plus
`agent-driven-demo/vitest.config.ts`. The rest are broken-but-unwatched; fix them in the
same pass or they surface as dev-server bug reports.

**Alternatives considered and rejected**
- *Re-export the lifecycle symbols from `@aihu/signals` index and drop the subpath
  import in runtime.* One-line fix, but it defeats the PR's entire size argument
  ("0 B added to the guarded index row") and would fail the PR's own new guard test in
  `packages/signals/tests/lifecycle.test.ts`, which asserts `src/index.ts` never
  mentions `lifecycle`.
- *Convert the example aliases to exact-match regex (`/^@aihu\/signals$/`) so subpaths
  fall through to node resolution.* Structurally cleaner and future-proof against the
  next subpath, but touches the same 15 files, so no churn saving.

**Publishing is unaffected.** `@aihu/runtime` depends on `@aihu/signals: workspace:^`
and the changeset bumps both as `minor`, so installed consumers get a signals with the
`./lifecycle` export and resolve through the exports map. No `create-aihu` / cli /
`packages/templates` scaffold aliases `@aihu/signals` to a path.

---

## bench / bench-arbor (secondary) — not caused by #549

Both jobs are gated by the same `changes.bench` filter, which includes
`packages/signals/package.json` — #549 edits that file, so both jobs ran. On main
they're skipped, hence "no baseline".

```
Bench gate · @aihu/signals · prev=2026-05-25 cur=2026-07-24
  OK   cellx: 807 → 882 ns (9.2 %)
  FAIL wide-fanout-100: 5363 → 6425 ns (19.8 %)
  FAIL batched-writes-100: 5074 → 6076 ns (19.8 %)
  FAIL deep-propagation-100: 3250 → 3726 ns (14.6 %)
  WIN  dynamic-deps: 1089 → 716 ns (-34.2 %)
  FAIL creation-1to1000: 69020 → 78196 ns (13.3 %)

Bench gate · @aihu/arbor · prev=2026-05-25 cur=2026-07-24
  FAIL mount-10k-leaves: 49043682 → 72314726 ns (47.4 %)
  FAIL update-1-of-10k-leaves: 29 → 825 ns (2780.0 %)
  FAIL attr-thrash-100x100: 65517 → 17963282 ns (27317.7 %)
  ... (6 total)
```

Evidence it is baseline staleness, not this PR:

1. `bench/{signals,arbor}/RESULTS.md` are both stamped **`Generated: 2026-05-25`** and
   have not been refreshed since; ~114 commits (per the note below) plus different
   runner hardware sit between baseline and now.
2. #549 changes **no** signals or arbor algorithm code — the only new signals source is
   `src/lifecycle.ts`, a separate rolldown entry that `src/index.ts` provably never
   imports (asserted by the PR's own test).
3. `@aihu/arbor` source is entirely untouched by #549, yet arbor shows 2,780 % and
   27,318 % "regressions" — three to four orders of magnitude. That is methodology /
   environment drift, not a 240-byte contract module.
4. Precedent on main: `1981a719` and `11a6942c` (2026-07-23),
   `chore(ci): [bench-bump] bench baseline is ~2mo stale (prev=2026-05-25)` — the exact
   same failure pattern was cleared this way one day before #549.

**Recommended handling:** add `[bench-bump]` to the PR HEAD commit message (the gate
reads `git log -1` of `github.event.pull_request.head.sha`, so it must be the head
commit — amend or push an empty commit), with a note that the change is perf-neutral.
Optionally, one caveat worth a sentence in that message: `bench/signals` measures
`packages/signals/dist/index.js`, which #549 changes from self-contained to
`index.js` + a shared `scope-<hash>.js` chunk. A fresh local before/after on identical
hardware (as done for `1981a719`) is the cheap way to confirm the split is neutral
before waving the gate.

Separately, refreshing the two committed `RESULTS.md` baselines is overdue maintenance —
every PR touching signals/arbor will keep paying this tax.

---

## Confidence

- **examples / governed-examples root cause: very high (99 %).** Reproduced locally
  byte-for-byte, and the one-line alias fix was validated to turn the build green.
- **vite-8 ruled out: very high.** Failure reproduces under vite 6 and vite 8; vite-8
  examples without the alias pass in the same run.
- **Fix is mechanical, not a design problem: high.** The contract, exports map,
  `external` list, and dist artifacts are all correct; only downstream alias tables lag.
- **bench / bench-arbor not caused by #549: high (~90 %).** Arbor's untouched-code
  blowups and the 2026-07-23 `[bench-bump]` precedent are decisive for arbor; for
  signals there is a small residual (the dist chunk split) that a local before/after run
  would close.
