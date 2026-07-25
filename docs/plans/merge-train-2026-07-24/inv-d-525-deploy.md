# INV-D — PR #525 `Build & deploy` failure (docs-next)

- **PR**: #525 `feat(docs-next): redesigned dogfood docs site — datasheet direction, staging deploy`
- **Branch / head**: `feat/docs-next-site` @ `17abea670581448aa34a814744fa5ccd9b4e89c4`
- **Failing run**: https://github.com/fellwork/aihu/actions/runs/30021238714/job/89254177969
- **Investigated**: 2026-07-24 (read-only; reproduced locally)

---

## 0. Correction to the brief

The failing job is **not** in the "Deploy aihu-docs" workflow. It is in
**`Deploy aihu-docs-next`** — a *new* workflow (`.github/workflows/deploy-docs-next.yml`)
that #525 adds. Both workflows happen to name their job `Build & deploy`.

That matters for merge ordering: #556 rewrites `deploy-docs.yml`, a **different file**.
See §3.

Step-level outcome of the failing run:

| # | Step | Result |
|---|---|---|
| 5 | Build compiler binary (`cargo build --release`) | success |
| 9 | Build workspace packages (`bun run build`) | success |
| **10** | **Build docs-next (`vite build` in `apps/docs-next`)** | **failure** |
| 11 | Ensure Pages project exists | skipped |
| 12 | Deploy to Cloudflare Pages | skipped |

The Cloudflare steps **never executed**. This is not a credentials problem.

---

## 1. Exact error

```
[plugin aihu-ssg] [@aihu/app] static output: no index.html in
  /home/runner/work/aihu/aihu/apps/docs-next/dist — cannot prerender.
✗ Build failed in 781ms

error during build:
Build failed with 1 error:

[ILLEGAL_REASSIGNMENT] Unexpected re-assignment of const variable `path`
     ╭─[ src/layouts/docs.aihu:173:42 ]
 163 │   const [path, __path_set] = signal("");
     │          ──┬─
     │            ╰─── `path` is declared here as const
 173 │     if (typeof location !== "undefined") path = location.pathname;
     │                                          ──┬─
     │                                            ╰─── `path` is re-assigned here
─────╯
    at aggregateBindingErrorsIntoJsError (… rolldown@1.0.3 …)
error: script "build" exited with code 1
```

The "no index.html … cannot prerender" line is a **consequence** (the SSG pass runs
against an empty `dist/` after the client build already died), not a second defect.

Lines 163/173 are **compiler-emitted JS**, not author source.

---

## 2. Root cause

`apps/docs-next/src/layouts/docs.aihu` `@state` block:

```js
let path = state('')

onMount(() => {
  if (typeof location !== 'undefined') path = location.pathname   // ✅ rewritten
  …
})

afterNavigate(() => {
  if (typeof location !== 'undefined') path = location.pathname   // ❌ NOT rewritten
  …
})
```

`let x = state(v)` lowers to `const [x, __x_set] = signal(v)`, and every bare write
`x = …` must be rewritten to `__x_set(…)`. That rewrite (`rewrite_wrapper_code` →
`crate::expr::rewrite_state_body`) is applied at 11 emit sites in
`packages/compiler/src/codegen/state_emit.rs` — `$computed`, `$action`, `$effect`,
`$lifecycle`/`onMount`, `$resource`, `StateLet` init, plain body, … — but **not** at
the `beforeNavigate` / `afterNavigate` arms, which splice the author's callback
verbatim:

`/Users/smcguirt/conductor/repos/aihu/packages/compiler/src/codegen/state_emit.rs:1207-1216`

```rust
StateMacro::BeforeNavigate { expr } => {
    lines.push(format!("{indent}__aihuRouter.__router_registerBeforeGuard({expr});"));
}
StateMacro::AfterNavigate { expr } => {
    lines.push(format!("{indent}__aihuRouter.__router_registerAfterGuard({expr});"));
}
```

`expr` goes in untouched → the bare `path = …` survives → rolldown rejects the
reassignment of a `const` destructuring binding.

### Reproduced locally (workspace `target/release/aihu-compile`)

Minimal case — all three write positions in one file:

```
10:    const sync = () => { __path_set(location.pathname) }   // plain body   ✅
12:  const [path, __path_set] = signal('');
13:  onMount(() => { __path_set(location.pathname) });        // onMount      ✅
15:    path = location.pathname                               // afterNavigate ❌
```

Compiling the real `apps/docs-next/src/layouts/docs.aihu` reproduces the emitted
`__router_registerAfterGuard(() => { … path = location.pathname … })` exactly.

**Pre-existing compiler bug, not introduced by #525.** `state_emit.rs` on the PR head
is byte-identical to `origin/main` in this region. `apps/docs` (the live site) has zero
`afterNavigate` usages, which is why main has never hit it. #525 is simply the first
consumer to write a signal from a navigation guard.

### Which compiler binary CI actually used

`resolveCompilerBinary()` order is: `AIHU_COMPILE_BIN` → published
`@aihu/compiler-<platform>` → `target/release` → `target/debug` →
`packages/compiler/bin`. In this repo the optionalDependency is pinned to
**`@aihu/compiler-linux-x64-gnu@0.1.30`, a version that does not exist on npm**
(`latest` is `0.1.28`; `bun.lock` has no resolved entry for it). So the published
package is not installed in CI, and the job fell through to the checkout's
`target/release/aihu-compile` — i.e. **CI used the same compiler I reproduced with**.

Practical consequence: **a compiler-side fix takes effect in this job immediately** —
no release, and no `AIHU_COMPILE_BIN` plumbing, required.

### Full-tree scan

I compiled all **77** `.aihu` files in `apps/docs-next` with the workspace compiler and
scanned every emitted module for un-rewritten writes to a `const [x, __x_set]` binding.
**Exactly one hit** — the `docs.aihu` line above. `site.aihu` also uses `afterNavigate`
but its callback writes no signals (`window.scrollTo` only), so it is unaffected.

---

## 3. Classification

**(b) — a genuine build error**, surfacing a latent compiler defect.

Explicitly *not*:
- **(a) Cloudflare credentials** — steps 11-13 were skipped; no CF API call was made.
  (Caveat: therefore the CF path is also *unverified*, see §6.)
- **(c) CI doesn't know how to build a new app** — the workflow's build orchestration is
  correct. Steps 1-9 (moon toolchain, cargo, bun install, `bun run build` for the whole
  `packages/*` graph) all passed; only the app's own `vite build` failed, on real
  source, for a real reason.

---

## 4. Interaction with #556

**None. Landing #556 changes nothing about #525's failure, and merge order is free.**

Concretely:

1. **Disjoint files.** #556 (`ci/docs-flow-decoupling`) touches exactly one file:
   `.github/workflows/deploy-docs.yml` (+93/-10). #525's failing job lives in
   `.github/workflows/deploy-docs-next.yml`, which #525 *creates*. Neither PR touches
   the other's file — no textual conflict, no behavioural overlap.
2. **The trigger still fires.** #556 narrows `deploy-docs.yml`'s `paths:`; it cannot
   narrow a workflow it does not edit. `deploy-docs-next.yml` triggers on
   `apps/docs-next/**` + its own path, both of which #525 matches. The job will still
   run, reach step 10, and fail identically.
3. **`AIHU_COMPILE_BIN` is a no-op here anyway.** #556's premise — "the docs consume the
   PUBLISHED compiler binary, so the staged one is ignored" — does not currently hold
   for *this* lockfile: `@aihu/compiler-linux-x64-gnu@0.1.30` is unpublished, so the
   published branch of `resolveCompilerBinary()` never resolves and `target/release`
   already wins. #556's change is correct-by-construction and harmless, but it does not
   change which binary compiles anything today. (Worth passing to whoever owns #556 —
   its stated rationale is currently inaccurate, though its behaviour is still the one
   you want once the pin is fixed.)
4. **Follow-up, not a blocker:** `deploy-docs-next.yml` has the same
   "Build compiler binary" + "Stage compiler binary" pair with no `AIHU_COMPILE_BIN`,
   and stages to `packages/compiler/bin/` (the *last* fallback). Once the platform-pin
   is repaired, that job would silently start building with the published compiler.
   Apply #556's `env: AIHU_COMPILE_BIN` treatment to `deploy-docs-next.yml` too — after
   both land, as a small follow-up.

**Also checked: #552** (`fix/compiler-statelet-hoist-tdz`) touches the same
`state_emit.rs`, so I read it. It moves the `const [x, __x_set] = signal(…)`
declaration inline into `plain_body` and deletes the `StateMacro::StateLet` emit arm.
It does **not** touch the `AfterNavigate` arm — the guard callback is still spliced
verbatim, still after `plain_body`, so the `const` reassignment error survives #552
unchanged. **#552 does not fix #525 either.**

---

## 5. Additive-only + size-limit

**Additive: confirmed.** Against merge-base `b5c60eba33bb3442d8a3fb44aa6408a7ddeb0eb4`:

```
174 A  (added)
  1 M  (modified) — bun.lock
175 files changed, 21656 insertions(+), 0 deletions(-)
```

The single non-added file is `bun.lock`, growing by the new workspace member's entry
(zero deletions). Everything else is new: `apps/docs-next/**` (174 files) plus
`.github/workflows/deploy-docs-next.yml` and `.tastemaker/style-lock.md`.

- **`apps/docs/` is untouched** — not one file under it appears in the diff. docs-next
  is a sibling site, not a replacement.
- **`deploy-docs.yml` is untouched** — the live aihu.dev pipeline is unaffected.
- **New Cloudflare Pages project** `aihu-docs-next`, explicitly separate from
  `aihu-docs`. The deploy command targets `--project-name aihu-docs-next`. Zero
  blast radius on aihu.dev.

**`.size-limit.json`: correctly untouched.** Per `.size-limit.README.md`, rows are for
`packages/*` classified browser-eligible; all 70 existing rows point at
`packages/*/dist/*`. `apps/docs-next` is an application, not a workspace-published
package — `apps/docs` has no row either. **Adding a row would violate the policy;
omitting it is correct.** ✅

**Two minor observations (not blockers):**
- Root `workspaces` includes `apps/*`, so `aihu-docs-next` joins the workspace. It ships
  **no `moon.yml`**, so it is outside `moon run :build` and `moon run :typecheck` — its
  `.ts`/`.aihu` sources are only ever built by its own deploy workflow. That is exactly
  why this defect could only surface there. Consider a `moon.yml` (or at least a
  typecheck task) as a follow-up.
- Every other check on #525 is green: `ci-ok`, `check`, `examples`, `storybook-ok`.
  `Build & deploy` is the sole failure.

---

## 6. Verdict — **NEEDS FIX** (not blocked by, and not helped by, #556)

The failure is real and reproducible; it will not clear on a re-run, on a rebase, or
after #556 or #552 land.

### Minimal change — two options

**Option A (smallest, unblocks #525 alone; verified locally).** One-file author-side
change in `apps/docs-next/src/layouts/docs.aihu`: hoist the guard callback into a
plain-body binding and pass it by reference, since plain-body arrows *do* get the
rewrite:

```js
const syncPath = () => {
  if (typeof location !== 'undefined') path = location.pathname
  if (typeof window !== 'undefined' && !location.hash) {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }
}
afterNavigate(syncPath)
```

I compiled this shape: it emits `__path_set(location.pathname)` inside `syncPath` and
`__router_registerAfterGuard(syncPath)` — no `const` reassignment. Keeps #525
self-contained; leaves the compiler trap armed for the next author.

**Option B (correct fix; also lands in this job immediately).** In
`emit_state_macro_code`, `packages/compiler/src/codegen/state_emit.rs:1207-1216`, run
`expr` through `rewrite_wrapper_code(…)` (and `rewrite_prop_writes_in(…)`, as the
sibling imperative arms do) before splicing, for **both** `BeforeNavigate` and
`AfterNavigate`. ~6 lines per arm, mirrors 11 existing call sites, plus a compiler
regression test and a changeset. Because CI resolves `target/release`, this fix is
picked up by #525's job on the next run with no release needed.

**Recommendation: do both** — Option B as a small standalone compiler PR (it is a
main-branch bug that will bite the next `afterNavigate` author), Option A folded into
#525 so the PR is not gated on the compiler PR's landing. If only one, take **Option B**
and re-run #525.

### Residual risk — re-run before declaring merge-ready

The build died at step 10, so **everything downstream is unverified**:
- whether the SSG prerender pass then produces `index.html` and completes,
- whether `pages project create aihu-docs-next` succeeds (the CF token's `Pages:Edit`
  scope has only ever been exercised against the existing `aihu-docs` project; project
  *creation* is a distinct capability — the step is `continue-on-error: true`, so a
  scope failure would surface at the *deploy* step, not there),
- whether the deploy itself succeeds.

My full-tree scan found no second instance of this error class among the 77 `.aihu`
files, but that only rules out *this* class. **Do not merge on a green diff — merge on a
green re-run of `Deploy aihu-docs-next`.**

---

## Files referenced

- `/Users/smcguirt/conductor/repos/aihu/packages/compiler/src/codegen/state_emit.rs` (:1207-1216 — the defect; :660 `rewrite_wrapper_code`; :989 the `onMount` arm that does it right)
- `/Users/smcguirt/conductor/repos/aihu/packages/compiler/js/resolve-binary.ts` (resolution order)
- `/Users/smcguirt/conductor/repos/aihu/packages/compiler/package.json` (`optionalDependencies` pinned to unpublished `0.1.30`)
- `/Users/smcguirt/conductor/repos/aihu/.size-limit.README.md` (row policy)
- `/Users/smcguirt/conductor/repos/aihu/.github/workflows/deploy-docs.yml` (the *other* workflow — #556's target)
- `apps/docs-next/src/layouts/docs.aihu` @ `17abea67` (the failing source)
- `.github/workflows/deploy-docs-next.yml` @ `17abea67` (the failing workflow)
