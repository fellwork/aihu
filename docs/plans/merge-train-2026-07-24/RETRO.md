# Retro — merge train, 2026-07-24 / 25

**Mode 3** (merge train + defect fix). `main` advanced `7462edd4` → `3790c913`.
**10 PRs merged, 4 open, 1 docs PR in flight (#559), 1 guard-fix PR opened after the train (#560).**

Every claim below is sourced to a committed report in this directory. Where the
Team Lead's running account and the reports disagree, the reports win and the
divergence is recorded — that divergence is most of the value of this retro.

---

## 1. What shipped

| PR | Commit | What |
|---|---|---|
| **#552** | `c4386693` | compiler: splice `state()` declarations **in place**, not after the plain body — the root cause of a full docs outage |
| **#553** | `3790c913` | docs/compiler/runtime: playground preset chain — **7 masked defects**, incl. `$form`/`$aria` framework bugs. `18/1 → 19 passed` |
| **#549** | `ad6921a0` | signals: lifecycle ownership contract (`LifecycleHost`) + runtime host attachment |
| **#557** | `0fe47a9e` | compiler: rewrite signal writes inside `before`/`afterNavigate` callbacks |
| **#558** | `7190b9c2` | release: bump compiler napi addons to 0.1.1 **so the TDZ fix actually ships** |
| **#525** | `adf07c8e` | docs-next: redesigned dogfood docs site |
| #555, #542, #540 | — | earlier in the train |

Plus, after the train closed: **#559** (this directory: 12 investigation +
verification reports, merged as `b8e3eedb`), and three guard/defect PRs that
each close a finding in this retro — **#560** (compiler-binary-bump matches
`npm-native/`; `.husky/pre-commit` switched to `--check`), **#561**
(`7dc8b1e3`, `ci-ok` widened to `examples` + `governed-examples`), and **#562**
(`3aa0ed40`, `dep-check` + `use` rolldown external made subpath-aware). See
§4(a), §4(c) and §5(1).

**That is the retro working as intended:** three of the four guard blind spots
and one unfiled item were closed within a day of being written down, by PRs
that cite this directory's evidence in their own commit messages.

### The headline defect

`inv-a-smoke-main.md` + `inv-e-497-blast-radius.md`. The `@state` wrapper
emitted **every** `const [x, __x_set] = signal(init)` into a single trailing
`macro_code` block spliced *after the entire plain body*, regardless of author
position. `docs-shell.aihu` declared `activePage` at author line 15 and read it
at line 53; emitted JS put the read at 300 and the declaration at 338 →
`ReferenceError: Cannot access 'activePage' before initialization`.

`d68f886` planted the codegen with no `.aihu` file using it; `05a94b7f` (#497)
migrated 69 corpus files and detonated it. **No compiler regression test asserts
emitted ordering** — that is why it shipped.

Blast radius, measured across 133 `@state` files: **7 broken**. Five were
class A (#497 splice, all fixed by #552); two are class B — a *different*,
pre-existing `@style $reactive()` emitter bug — and remain broken (§5).

---

## 2. What remains open

**Landing order: #546 → #550 → #556 → #539.**

### #546 — `fix/keyed-list-and-dom-move` (FEL-395 + FEL-396)
`linear-verify-inflight.md`. The keyed-list mechanism fix is real: replaces
`if (sc.has(k)) continue` with an `existing.item === items[i]` reference check.

- **`closes FEL-396` trailer: REMOVED and verified** (0 matching auto-close
  patterns on GitHub, 2026-07-25). FEL-396 will correctly stay open — the fix
  is `moveBefore()`-based and narrower than the issue describes.
- Still needs: **rebase** (`mergeable: CONFLICTING` / `DIRTY` onto `ad6921a0`).
- Carry-forward caveat the Verifier flagged: the fix is *reference* identity, so
  derived lists (`computed(() => rows().map(r => ({...r})))`, JSON re-parse per
  poll, immutable stores) will **re-grow every row on every update** — the exact
  state FEL-396 exists to preserve. Worth a doc note on `each()` before anyone
  treats this as closed.
- Not fixed here: `fellwork/aihu#544` (stale `appendedNodes`,
  `template_emit.rs:614`), Safari/jsdom (no `moveBefore`), non-arbor moves.

### #550 — `feat/use-wave1a` (FEL-406)
`linear-verify-inflight.md`: **all three findings still present verbatim at PR
head**; one commit, no FEL-406 reference in it. `useTimeAgo` reads `toValue(date)`
inside a plain `setTimeout` outside any tracked effect; `useIntersectionObserver`
sets `isActive` unconditionally *before* an effect that early-outs;
`useMeasure`'s `box` still takes the full native union while
`'device-pixel-content-box'` silently falls through to content-box.
`Smoke tests` fails; `mergeable: UNKNOWN`. Needs rebase onto #549 and
regenerated size files. *(The rebase/size requirement is Team-Lead-stated; the
report documents only the three findings and the CI state.)*

### #556 — reduced to the contested half
`inv-a-smoke-main.md` judged #556 "half essential, half actively harmful." The
essential half — `AIHU_COMPILE_BIN` on both "Build docs" steps — **already
shipped on #552's head**. What remains is only the `paths`-filter half, and
INV-A says it **should not land as written**: dropping `packages/compiler/**`
and `packages/arbor/**` from the filters means a Rust-only PR like #552 stops
triggering the workflow at all, retiring the only end-to-end guard that caught
this outage. Its stated rationale ("docs consume the published binary") is also
false for the current lockfile, and was *made* false by change (1) of the same PR.

### #539 — last
Appears in **no report in this directory** (`grep -rn "539"` → zero hits).
Sequenced last by the Team Lead; scope unverified by this retro.

---

## 3. What the reports found that the running account had wrong

This is the section worth re-reading before the next session.

1. **#549 did not close the `@aihu/use` blockers.** It touched **zero lines** in
   `packages/use`; `tryOnMounted` is byte-identical to its stub. The Team Lead
   reported the blocker closed. E1/E2/E3 grade PARTIAL / PARTIAL / STILL OPEN.
   → lesson #14.
2. **#552's Rust fix was invisible in CI** because `envelope.ts:73-86` prefers a
   published napi addon over any local build unless `AIHU_COMPILE_BIN` is set;
   and a stale `serve-dist.ts` on :8788 produced a fake local "18 passed / 1
   failed." Two investigations lost an hour each to the same trap.
   → lesson #15.
3. **A brief asserted a `cargo fmt` CI gate that does not exist.** `cargo fmt
   --check` exits 1 on pristine `main` with 633 hunks and no `rustfmt.toml`;
   `.github/workflows/` contains no fmt gate. Also: an investigator's "15 example
   configs" was 14; an investigation opened with "Correction to the brief" after
   two workflows shared the job name `Build & deploy`; PR #545 claimed
   `Closes FEL-397, fellwork/aihu#537` while GitHub recorded no closing
   reference. → lesson #19.
4. **Both governing design docs still read "PROPOSED — awaiting founder
   approval, not ratified"** after their implementations merged. Approval-by-merge,
   with no document reflecting it.
5. **The Team Lead left the user's checkout on a feature branch** after
   committing the reports, having instructed every subagent to leave it on
   `main`. → lesson #21.

---

## 4. The four guard blind spots

**(a) `ci-ok` was near-vacuous — and it is the ONLY required context.**
**PARTIALLY FIXED IN FLIGHT by #561** (`7dc8b1e3`).

As the reports found it: `needs: [check]`, `if: always()`, failing only when
`check.result` is `failure`/`cancelled`. It passed when `check` was **skipped**,
and observed nothing else — not `Smoke tests`, `bench`, `bench-arbor`,
`examples`, `governed-examples`, or either deploy. Every report in this
directory records the same shape: "`ci-ok` green" beside 13 red Playwright
tests. The test-level twin: during the outage, the one docs test that **passed**
was the one asserting only `shadowRoot != null`.

#561 widens it to `needs: [check, examples, governed-examples]`, and its own
comment names this session's evidence: *"examples + governed-examples were added
after PR #549 merged ci-ok-green while both were RED… That regression broke
every downstream consumer app build."*

**Still unobserved by the required context: `Smoke tests`, `bench`,
`bench-arbor`, and both deploy workflows.** `bench`/`bench-arbor` are excluded
deliberately and correctly — per blind spot (d) they fail on noise, and wiring
an unreliable gate into the required check would block every PR. `Smoke tests`
has no such excuse: it is the lane that caught the #497 outage, and it is still
outside the only gate branch protection enforces.

**(b) `check:pre-push` is red on pristine `main`, so `--no-verify` is the norm.**
`check:pre-push` = `check:lint && typecheck`. `packages/tsc/src/index.ts:17`
imports `@volar/typescript` (declared at `packages/tsc/package.json:38`,
**not installed**) → TS2307. A guard that can never pass disarms lint and
typecheck for everyone. A prior on-disk lesson already records a Builder
mis-attributing a real environmental failure and pushing `--no-verify` anyway.

**(c) `.husky/pre-commit` wrote and force-staged machine-dependent drift** —
**FIXED IN FLIGHT by #560**, which switches it to `sync-readme --check`.
Previously it ran `bun scripts/sync-readme.ts` in write mode then `git add`-ed
`README.md`, `scripts/__bundle-sizes.json`, `scripts/__package-inventory.json`
and every regenerated package README. A Builder reverted darwin-vs-committed
size drift (`@aihu/runtime` 4319 → 4402 B) and fought the hook re-adding it —
**without ever naming the hook as the cause**. #560 also makes
`check-compiler-binary-bump.ts` match `npm-native/`, closing the gap that let
the TDZ fix nearly ship without its addon bump (#558 had to catch it).

**(d) The bench gates have no green baseline to regress from.**
`inv-b-546-bench.md`: of the 200 most recent runs, 174 skipped both gates; of
the 26 that executed, **25 failed**. `bench-arbor` passed exactly once, a noise
outlier. Baselines were last refreshed 2026-05-25, **404 commits ago**. The
threshold is 10% p50 on shared-tenancy `ubuntu-latest`, where the same workload
against the same baseline swings 12.5–57.2%; and the gate is bypassable by
putting `[bench-bump]` in the HEAD commit message — used on #549. The baseline
commit itself bypassed its own gate.

Two more, adjacent: the **Doc-coverage gate ran before `Run smoke tests`**, so
smoke was skipped for ~14 consecutive runs and the outage read as a docs
problem; and `bun run test:integration` is **run by no workflow at all**
(it was broken on #549's branch and nobody could have known).

---

## 5. Still unfiled

No Linear issue exists for any of these.

1. ~~**`dep-check` exact-match gate.**~~ **FIXED IN FLIGHT by #562**
   (`3aa0ed40`, "make dep-check and use rolldown external subpath-aware").
   As found: `scripts/dep-check.ts` `allowedExternals` started
   `new Set(['@aihu/signals'])` — exact specifier, no prefix logic — so the
   first `@aihu/use` PR importing `@aihu/signals/lifecycle` would redden CI
   (empirically probed: all four entries reported `has
   @aihu/signals/lifecycle? false`). The same exact-match bug at
   `packages/use/rolldown.config.ts:75` would instead **inline** the lifecycle
   module into every consuming entry's size row. Both were one-line-class
   fixes and both are now subpath-aware.
   *Still open:* `@aihu/use` importing **`@aihu/reactive`** — that is a missing
   declaration (not in `packages/use/package.json` deps, peers, or
   `families.json`), not a prefix-matching bug, so #562 does not reach it.
   *Correction to the dispatch brief:* the phrase "Wave 1b" appears nowhere in
   any report. The reports scope this as **Wave 5's gate** (parity plan §4) for
   E3 adoption, and note Waves 1–2 never depended on these blockers.
2. **`@style $reactive()` TDZ — 2 files**, class B, pre-existing, *not* caused by
   #497 and *not* fixed by #552: `examples/color-theme/color-theme.aihu` and
   `examples/_shared/macro-test.aihu`. `$reactive()` in `@style` emits its
   `effect(...)` at the very top of the setup body, above every `@state`
   declaration it reads. Both **also never import `effect`**, so
   `ReferenceError: effect is not defined` fires *before* the TDZ. `color-theme`
   is a deployed example that has been dead for some time and nobody noticed.
3. **`check:moon-graph` guard** (proposed, does not exist). For each project,
   resolve every `@aihu/*` specifier in its tsconfig program and fail unless it
   is covered by a `paths` alias or a `dependsOn` closure. `plan-a.yml:98` runs
   `typecheck` with **no preceding `build`**; there are no TypeScript project
   references anywhere; **27 of 45 moon projects have zero graph dependencies**,
   so `^:build` expands to nothing. Six sites patched, five bespoke edits, zero
   mechanism changes — instance #6 (`packages/editor` → `@aihu/compiler`) is
   live on `main` right now. `packages/compiler/js/index.ts:1252-1262` hides a
   module specifier in a variable purely to dodge TS2307. **The race is not
   fixed; only its symptoms are.**
4. **`cookbook/guard-ui.aihu` emits `when(getScopeSignal('admin'), …)` with
   `getScopeSignal` never imported or defined** → `ReferenceError`. It ships as
   a docs playground preset, so it is user-facing today. Its two siblings
   (`aria-form`, `form-validation`, `this` inside the setup arrow) were fixed by
   #553; `guard-ui` was not.

Also unfiled, lower priority: `bun.lock` pins `@aihu/compiler-<platform>@0.1.30`,
a version that does not exist on npm (npm `latest` is 0.1.28) — so the platform
distribution path is untested, **and repairing it will silently flip
`deploy-docs-next.yml` onto the published compiler**;
`packages/router/components/{Router,Link,Navigate}.aihu` are still on v1
`$lifecycle.mount { … }`, do not compile (`C440`), and were missed by the v2
grammar migration (#489) while shipping in the package tree; `apps/docs-next`
has no `moon.yml`; `a11y.ts:200` cites a "follow-up filed" that was never filed;
`bench/signals/src/runner.ts` `collectSizes()` `statSync`s one raw file, so any
future code-split silently under-reports published size.

---

## 6. Lessons promoted

Eight new lessons (#14–#21) were written to
`.claude/skills/fw-agent-skill/references/lessons.md`:

| # | Lesson |
|---|---|
| 14 | An enabler shipping is not the blocker closing — verify **adoption**, not availability |
| 15 | Verify which artifact your test actually exercised |
| 16 | A green required check can be near-vacuous |
| 17 | Masked defect chains — a changing error message is progress |
| 18 | A permanently-red guard trains people to bypass it |
| 19 | A brief's premises are claims, not facts |
| 20 | The storage substrate the playbook names may not be the one you are on |
| 21 | Orchestrator-side discipline decays while it is being enforced on agents |

Lesson #20 is the session's own defect: the skill carried **98 references to
`mcp__gbrain__*`**, a tool that has never existed in this repo, and the entire
session ran on the file substrate by accident. The skill has been converted to
capability notation with a Step 0 runtime preflight; see §7.

---

## 7. Skill repair (same PR)

- **Step 0 substrate preflight** added to `SKILL.md`: one `ToolSearch` call
  resolves `SEARCH`/`GET_PAGE`/`PUT_PAGE` to concrete tools before any dispatch.
  The **file substrate is now the documented default**, not a footnote.
- All 98 `mcp__gbrain__*` references replaced with **capability notation**, with
  per-substrate resolution tables and a slug→path mapping. Deliberately *not* a
  find-and-replace to `mcp__gbrain-local__*` — that would re-hardcode a
  per-machine, per-scope accident. Recorded as middleware anti-pattern #10.
- **`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` documented as a hard
  requirement whose absence fails silently**, with the exact guard from
  `.claude/scripts/gbrain-mcp.sh` and the `claude mcp list` output showing
  `gbrain-local ✔ Connected` beside `gbrain ⏸ Pending approval`. No credentials
  were set or invented.
- **State file relocated to `docs/state/<track>.md`** and created for this track.
  Repo-root `state-<track>.md` is unusable — `.gitignore:98` matches
  `state-*.md` — which is why resume step 1 had been a silent no-op. Resume now
  has an explicit fallback chain (newest `RETRO.md` → `git log` + merged PRs →
  open PRs) so a missing state file never stalls a session.
