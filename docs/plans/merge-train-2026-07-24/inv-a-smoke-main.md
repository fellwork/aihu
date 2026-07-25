# INV-A — `Smoke tests` red on main (Deploy aihu-docs)

**Investigator report — 2026-07-24**
Subject: `Smoke tests` job of `.github/workflows/deploy-docs.yml`, failing on `main@7462edd4`,
inherited by PRs #546, #550, #552, #553, #556.

---

## Root cause

**A compiler codegen regression introduced by PR #497 (`05a94b7f`, 2026-07-22 02:57 UTC)
puts `docs-shell`'s reactive state declarations into a temporal dead zone, so
`docs-shell` throws during setup and never renders. The docs app is genuinely broken —
this is not a test-harness artifact.**

The `@state` wrapper dialect lowers `let x = state(init)` into
`const [x, __x_set] = signal(init)`. The compiler emitted **every** such declaration into a
single trailing `macro_code` block spliced **after the entire plain body** of `@state`,
regardless of where the author wrote it. `apps/docs/src/components/docs-shell.aihu` declares
`activePage` on line 15 and synchronously invokes `seedFromPrerender()` (which reads
`activePage`) on line 53 — so the emitted JS calls the reader ~38 lines **before** the
`const [activePage, …] = signal(…)` declaration:

```
300     seedFromPrerender()                                     // reads activePage()
338   const [activePage, __activePage_set] = signal(pageFromLocation());
```

At runtime: `ReferenceError: Cannot access 'activePage' before initialization`.
`packages/runtime/src/define-component.ts`'s `connectedCallback` catches and re-throws the
setup error — but the shadow root has **already been attached**, so the element reports as
"upgraded" while its shadow DOM stays empty. That is exactly the CI signature: the one test
that only asserts `shadowRoot != null` passes; everything that asserts real content fails.

`theme-toggle` is hit by the same bug. `playground-embed` lives inside `docs-shell`'s shadow
root, so all 8 playground specs fail as collateral.

**Culprit commit:** `05a94b7f49848dffb9e1370ea4b96073832875db` —
*"refactor(corpus): migrate app corpus to the @state wrapper model + codemod (#487 §7) (#497)"*.
It migrated `docs-shell.aihu`, `theme-toggle.aihu`, `live-demo.aihu` (and 66 other corpus
files) onto the wrapper dialect whose codegen carries this bug. The wrapper *codegen* landed
one commit earlier in `d68f886` (#487 core) — which was green because no `.aihu` file used
the dialect yet. So: `d68f886` planted the bug, `05a94b7` (#497) detonated it.

### Secondary finding — why the compiler fix in PR #552 does not turn CI green

`packages/compiler/js/envelope.ts:_resolveCompileBackend()` prefers the **published**
in-process napi addon `@aihu/compiler-native-<platform>` over any locally built binary,
unless `AIHU_COMPILE_BIN` or `AIHU_COMPILER_NATIVE=0` is set. `bun.lock` resolves
`@aihu/compiler-native-linux-x64-gnu@0.1.0` (published 2026-07-23T15:54Z, i.e. *after* the
regression), and `deploy-docs.yml` sets neither env var.

So the workflow's "Build compiler binary" → "Stage compiler binary" → artifact-upload →
deploy-job-download chain is currently **dead weight**: the docs are compiled by a frozen
published addon, not by the checkout. PR #552 changes only Rust source, and its own CI run
(`30133794282`, on its head SHA `39ae2c08`) still reports the identical **13 failed / 6
passed**. #552's fix is correct but **cannot take effect in CI as the workflow stands.**

### Why nobody noticed for two days

Between 2026-07-22 20:17 and 2026-07-24 20:03 the **Doc-coverage gate** — which runs
*before* `Run smoke tests` — was failing for an unrelated reason, so the smoke step was
**skipped** and the job's failure looked like a docs-coverage problem. PR #551 (`7462edd4`,
2026-07-24 21:58) fixed doc coverage, which un-masked the 13 Playwright failures that had
been latent since 07-22.

---

## Evidence

### 1. First red run on main

```
$ gh run list --branch main --workflow "Deploy aihu-docs" --limit 40 \
    --json databaseId,conclusion,headSha,createdAt,displayTitle
```

| createdAt | run | headSha | result |
|---|---|---|---|
| 2026-07-21T22:34Z | 29874244831 | `9e6ddbfd` | **success** |
| 2026-07-22T00:04Z | 29879149270 | `d68f8862` (#487 wrapper-model core) | **success** — last green, last production deploy |
| 2026-07-22T02:57Z | 29887176027 | `05a94b7f` (#497 corpus migration) | **failure** — `Run smoke tests`, 13 failed / 6 passed |
| … | | | all failure |
| 2026-07-24T21:58Z | 30129503460 | `7462edd4` | failure — `Run smoke tests`, 13 failed / 6 passed |

```
$ git log --oneline d68f886..05a94b7
05a94b7f refactor(corpus): migrate app corpus to the @state wrapper model + codemod (#487 §7) (#497)
```

Exactly one commit in the range. The first failing run and the current one have a
byte-identical failure list.

### 2. Which step failed, per run (the masking window)

```
$ for id in …; do gh run view $id --json jobs \
    -q '[.jobs[0].steps[]|select(.conclusion=="failure")|.name]|join(",")'; done
```

```
2026-07-22T02:57Z  29887176027  Run smoke tests      <-- regression lands
2026-07-22T02:58Z  29887220855  Run smoke tests
2026-07-22T04:25Z  29891005898  Run smoke tests
2026-07-22T04:41Z  29891723077  Run smoke tests
2026-07-22T13:50Z  29925706987  Run smoke tests
2026-07-22T13:50Z  29925738508  Run smoke tests
2026-07-22T13:58Z  29926376084  Run smoke tests
2026-07-22T19:31Z  29951333172  Run smoke tests
2026-07-22T20:17Z  29954498669  Doc-coverage gate    <-- masking starts (smoke SKIPPED)
   … 14 consecutive runs, all "Doc-coverage gate" …
2026-07-24T20:03Z  30122610150  Doc-coverage gate
2026-07-24T21:58Z  30129503460  Run smoke tests      <-- #551 fixes coverage; smoke re-surfaces
```

(`2026-07-23T00:45Z 29969944892` briefly reached `Run smoke tests` inside that window.)

### 3. The emitted TDZ, reproduced from the checkout compiler

```
$ cargo build --release --manifest-path packages/compiler/Cargo.toml
$ ./target/release/aihu-compile apps/docs/src/components/docs-shell.aihu \
    | grep -n "seedFromPrerender\|signal(pageFromLocation"
257:    const pageFromLocation = () => {
295:    const seedFromPrerender = () => {
298:      if (node) cacheSet(activePage(), node.innerHTML)
300:    seedFromPrerender()
338:  const [activePage, __activePage_set] = signal(pageFromLocation());
```

The same defect is present in the **currently published** compiler
(`@aihu/compiler-darwin-arm64@0.1.28`, npm `latest`):

```
$ npm pack @aihu/compiler-darwin-arm64@0.1.28 && tar xzf … && chmod +x package/aihu-compile
$ ./package/aihu-compile apps/docs/src/components/docs-shell.aihu | grep -n …
300:    seedFromPrerender()
338:  const [activePage, __activePage_set] = signal(pageFromLocation());
```

TDZ semantics of that emitted shape, confirmed in isolation:

```
$ node -e "function f(){let r=(a,b)=>d({...u(),[a]:b});(()=>{let e=1;e&&r(c(),'x')})();
           let s=()=>u()[c()],[c,l]=[()=>2,3],[u,d]=[()=>({}),()=>{}];return s}
           try{f();console.log('NO THROW')}catch(e){console.log('THREW:',e.message)}"
THREW: Cannot access 'c' before initialization
```

### 4. Local reproduction of the exact CI failure

Build (the workspace binary must be pinned — see caveat below):

```
$ cd apps/docs && AIHU_COMPILE_BIN=$PWD/../../target/release/aihu-compile bun run build
✓ Client build complete → dist/docs.js
✓ Prerendered 41 doc pages → dist/<id>/index.html
```

Headless probe of the served build (Chromium, console + pageerror captured):

```
$ bun apps/docs/scripts/serve-dist.ts 8799 apps/docs/dist &
$ node scratch/probe.mjs http://localhost:8799/
{"defined":true,"hasShadow":true,"navLinks":0,"articleLen":-1}
[console.error] [aihu] setup failed for <theme-toggle>: ReferenceError: Cannot access 'r' before initialization
[pageerror] Cannot access 'r' before initialization
[console.error] [aihu] setup failed for <docs-shell>: ReferenceError: Cannot access 'c' before initialization
[pageerror] Cannot access 'c' before initialization
```

`defined: true, hasShadow: true, navLinks: 0` is precisely the CI shape — the element upgrades
and attaches a shadow root, then renders nothing.

Full Playwright suite against that build:

```
$ bunx playwright test --config=<scratch cfg on :8799> --reporter=line
  13 failed
    layout.spec.ts:4         article is horizontally centered …
    mobile.spec.ts:4         docs content fills viewport width at 375px …
    navigation.spec.ts:31    clicking Installation nav link …
    navigation.spec.ts:56    navigating to a NESTED guide …
    playground.spec.ts:52/60/74/82/87/154/206/230   (all 8)
    prerender.spec.ts:107    #prerendered-content is removed once docs-shell hydrates
  6 passed (4.4m)
```

**Identical count and identical test list to CI run 30129503460.**

> **Reproduction caveat (cost me an hour, worth recording).** A first local run showed
> "18 passed / 1 failed" and looked like the bug did not reproduce. Two traps:
> (a) `resolveCompilerBinary()` prefers a *published* `@aihu/compiler-<platform>` in
> `node_modules` over the workspace build — a leftover `@aihu/compiler-darwin-arm64@0.1.0`
> made `bun run build` die with `C306` until `AIHU_COMPILE_BIN` was pinned;
> (b) `playwright.config.ts` has `reuseExistingServer: !process.env.CI`, and a **stale
> `serve-dist.ts` from 19:14 was still bound to :8788 serving a different tree**, so the
> suite silently tested someone else's `dist`. Verify with
> `curl -s localhost:8788/docs.js | shasum -a256` against `shasum -a256 apps/docs/dist/docs.js`
> before trusting any local docs e2e result.

### 5. Why #552's Rust fix does not clear CI

```
$ grep -n 'compiler-native' bun.lock
1034: "@aihu/compiler-native-linux-x64-gnu": ["@aihu/compiler-native-linux-x64-gnu@0.1.0", …]

$ npm view @aihu/compiler-native-linux-x64-gnu time --json
{ "0.1.0": "2026-07-23T15:54:25.802Z" }
```

`packages/compiler/js/envelope.ts:73-86`:

```ts
if (env?.AIHU_COMPILER_NATIVE === '0' || env?.AIHU_COMPILE_BIN) {
  _backend = { kind: 'spawn' };  return _backend
}
const native = loadCompilerNative()
_backend = native.kind === 'loaded' ? { kind: 'native', … } : { kind: 'spawn' }
```

`deploy-docs.yml` sets neither variable in either "Build docs" step → the published
2026-07-23 addon wins → the checkout's compiler is never exercised. Confirmed empirically:

```
$ gh run view --job 89613529471 --log-failed | grep -E "failed|passed \("
  13 failed
  6 passed (9.3m)
```

— PR #552's own run, on its head SHA `39ae2c08`, with the codegen fix present.

### 6. Production is stale, not broken

`Build & deploy` has been `skipped` on every run since `d68f886` (2026-07-22 00:04Z), so
aihu.dev is frozen at the last-good build:

```
$ node scratch/probe.mjs https://aihu.dev/
{"defined":true,"hasShadow":true,"navLinks":34,"articleLen":1657}
```

---

## User-visible impact

**Genuinely broken, not a CI artifact.** The `.aihu` → JS output is wrong; the browser throws.

| Surface | State |
|---|---|
| **aihu.dev (production)** | ✅ Working — but only because the red gate has blocked every deploy for 2½ days. Frozen at `d68f886`. The moment the gate goes green, the *next* deploy of current `main` ships a docs site whose sidebar, article, theme toggle and playground are all dead. |
| **Local docs dev** (`bun run dev` in `apps/docs`) | ❌ Broken. `docs-shell` and `theme-toggle` both throw at setup; the page shows only the prerendered light-DOM HTML and never hydrates — no nav, no client routing, no playground, no dark-mode toggle. |
| **Downstream framework users** | ❌ Broken. `@aihu/compiler@0.1.28` (npm `latest`) and the `@aihu/compiler-native-*@0.1.0` addon both carry the bug. Any consumer whose `@state` block declares `let x = state(…)` and then synchronously runs plain-body code that reads `x` gets `ReferenceError` and a component that never renders. This is the widest blast radius and argues for a patch release once fixed. |
| **Repo velocity** | ❌ 5 open PRs show red through no fault of their own. |

The prerender/SEO layer is unaffected — static HTML still paints, which is why "the site looks
fine" at a glance and why `page.goto` and title assertions pass. Everything interactive is dead.

---

## Relationship to #553 and #556

### PR #553 — *fix(docs): supply missing preview-runtime symbols + strip `as any`* → **UNRELATED to the root cause; fixes the 14th, separate failure**

Diff: exports `registerAgentMetadata` / `_registerAgentServerBinding` / `contextKey` / `provide` /
`inject` from `apps/docs/playground/preview-runtime.ts`, destructures them in
`buildPreviewDoc`, adds ` as any` to `stripTs`, and de-TypeScripts three preset sources
(`(e as Error).message` → `e instanceof Error ? …`, `(e.target as HTMLInputElement)` →
`e.target`, etc. — TypeScript that #497 also introduced into the cookbook presets).

This is a real, independent bug: the playground executes compiled output raw inside an iframe
`srcdoc`, so a surviving TS cast is a `SyntaxError`. **I reproduced it in isolation** — on the
stale-server run (which accidentally served a pre-#497 build with a working `docs-shell`), the
*only* failure was:

```
playground.spec.ts:206  every preset compiles AND renders in the preview
  Error: preset "form-validation" must render in the preview (no <aihu-component> (script failed to run))
  18 passed
```

So #553 is exactly the residual `18 passed / 1 failed → 19 passed` fix. **Needed, but it does
not touch this defect** — it is currently unverifiable because #552's bug hides it.

### PR #556 — *ci(docs): stop rebuilding docs on compiler PRs; make the staged binary count* → **half essential, half actively harmful**

Two independent changes bundled together:

1. **`env: AIHU_COMPILE_BIN: ${{ github.workspace }}/packages/compiler/bin/aihu-compile` on
   both "Build docs" steps.** ✅ **This is required.** It is the only thing that makes the
   checkout's compiler actually compile the docs, and therefore the only thing that lets
   #552's fix show up in CI at all. Its diagnosis of the shadowing is right (though it names
   the *CLI* platform package; the actual shadow in CI today is the **napi addon**
   `@aihu/compiler-native-linux-x64-gnu@0.1.0` — the CLI platform packages are pinned at
   `0.1.30` in `bun.lock`, a version that does not exist on npm, so they are never installed).

2. **Dropping `packages/compiler/**` and `packages/arbor/**` from the `paths` filters**
   (keeping only `packages/compiler/js/**`). ⚠️ **This should not land as written.** Its
   stated rationale — "the docs consume the published binary, so Rust edits cannot affect
   this build" — is *made false by change (1) in the very same PR*. Once `AIHU_COMPILE_BIN`
   is set, a Rust codegen change absolutely does change docs output. Landing both halves
   would mean a Rust-only PR like **#552 no longer triggers this workflow at all**, and the
   docs e2e — the only end-to-end guard that caught this outage — would stop watching the
   exact commit class that caused it. It also creates an ordering trap: #552 cannot be
   validated by a workflow that #552 no longer triggers.

   Also note #556's comment claiming the doc-coverage gate "silently masked every downstream
   test" is accurate as history (see Evidence §2) but the fix does not address it: moving the
   gate *before* the build leaves it still ahead of `Run smoke tests`, so it still
   short-circuits them. If masking is the concern, the gate needs `continue-on-error` or to
   move *after* the smoke step.

**#546 and #550** are unrelated feature/fix PRs that merely inherit the red job.

---

## Recommended minimal fix

Two changes, in this order. Both are needed; neither alone turns `main` green.

**1. Land PR #552 (`fix/compiler-statelet-hoist-tdz`) — the actual root cause.**
It splices each `let x = state(init)` back into the plain body **at its original source
position** rather than deferring it to the trailing `macro_code` block. The reasoning in its
changeset is sound and matches what I observed: a blanket hoist above all of plain body is
*not* a valid alternative, because `signal(init)` evaluates `init` eagerly and `docs-shell`'s
init is `state(pageFromLocation())` — hoisting would relocate the TDZ onto `pageFromLocation`
instead of removing it. The companion `visit_variable_declarator` override in
`expr/state_rw.rs` is a necessary consequence of the splice, not scope creep.
Diff is tight: 70+/15− in `codegen/state_emit.rs`, 47+/5− in `expr/state_rw.rs`, 13+ in
`parser/state_wrappers.rs`, plus a changeset and autogen version bumps.

**2. Add the `AIHU_COMPILE_BIN` env to `deploy-docs.yml` — carry it *in #552*.**
Cherry-pick only that hunk out of #556 (two `env:` blocks, ~8 lines) into #552, so #552's own
CI run proves the fix end-to-end. Without it #552 lands, CI stays red, and the next
investigator re-derives all of this.

```yaml
      - name: Build docs
        run: bun run build
        working-directory: apps/docs
        env:
          AIHU_COMPILE_BIN: ${{ github.workspace }}/packages/compiler/bin/aihu-compile
```

(applies to the `test` job and the `deploy` job)

**Then, in order:**

3. **#553** — lands cleanly on top and takes the suite from 18/1 to 19/0. Nothing in it
   conflicts with #552.
4. **#556** — re-scope to the `AIHU_COMPILE_BIN` wiring only (now already merged via #552, so
   it becomes a no-op) plus the `workflow_run`-on-release trigger. **Keep
   `packages/compiler/**` in the `paths` filters.** If run time is the real motivation,
   the answer is a faster job, not a blind spot over the compiler.
5. **Cut a patch release of `@aihu/compiler` + republish `@aihu/compiler-native-*`.** The
   published `0.1.28` / native `0.1.0` carry this bug for every downstream consumer of the
   wrapper dialect, and the stale native addon will keep shadowing local builds until it is
   republished.
6. **Housekeeping (separate, low priority):** `bun.lock` pins
   `@aihu/compiler-<platform>@0.1.30`, which does not exist on npm (`latest` is `0.1.28`).
   Those optionalDependencies are silently skipped on every install. Harmless today, but it
   means the platform-binary distribution path is untested.

---

## Confidence, and what would falsify this

**Root cause: very high (≈95%).**
The failure was reproduced locally from a clean `origin/main` checkout with the exact CI
counts (13 failed / 6 passed) and the exact test list; the underlying `ReferenceError` was
captured from the browser with a stack trace; the emitted JS was inspected directly and the
TDZ shape verified in isolation; and the first-red commit was isolated to a single-commit
`git log` range whose content is precisely the migration of `docs-shell.aihu` onto the buggy
dialect.

**"#552 cannot go green without the env wiring": high (≈85%).**
Inferred from (a) `envelope.ts`'s documented backend precedence, (b) a resolved
`@aihu/compiler-native-linux-x64-gnu@0.1.0` entry in `bun.lock` published *after* the
regression, and (c) #552's own CI producing a byte-identical 13/6 with the fix present.
I did **not** build #552's branch (read-only mandate), so I cannot rule out the alternative
that the Rust fix is simply incomplete.

**Falsifiers, cheapest first:**

- Run `gh workflow run "Deploy aihu-docs" --ref fix/compiler-statelet-hoist-tdz` with
  `AIHU_COMPILE_BIN` temporarily set. **Green ⇒ this report is right in full.** Still 13/6 ⇒
  the env-wiring theory is wrong and #552's codegen fix is incomplete.
- Build #552's branch locally and re-run step 3 of the Evidence section. If
  `signal(pageFromLocation())` still lands after `seedFromPrerender()`, #552 does not fix it.
- Add a one-line `console.log(_resolveCompileBackend().kind)` to the docs build in a scratch
  CI run. If it prints `spawn`, the napi-shadowing theory collapses and the real reason
  #552 stays red is elsewhere.
- If `aihu.dev` is ever observed broken *before* a new deploy runs, the "production is merely
  stale" claim is wrong and the impact assessment needs revisiting.

**Not investigated (out of scope, flagged for follow-up):**
how many non-docs `.aihu` files in `cookbook/`, `examples/` and `packages/ui/registry/` are
hit by the same TDZ — #497 migrated 69 files, and any of them with a synchronous plain-body
read of a `state()` binding is broken in the same way. Worth a sweep before the patch release.
