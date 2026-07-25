# INV-E — Blast radius of the `@state` wrapper-dialect TDZ regression (#497)

**Investigator report — 2026-07-25**
Scope: every `.aihu` file in the repo, measured empirically against three compilers.
Companion to [`inv-a-smoke-main.md`](./inv-a-smoke-main.md), which established the defect.

---

## TL;DR

| | |
|---|---|
| Files scanned | **133** `.aihu` files containing an `@state` block (whole repo, minus `node_modules`/`dist`/`.claude/worktrees`); **109** compile on the current compiler |
| **DEFINITELY BROKEN on `main`** | **7** |
| — of those, caused by #497 (the `@state` splice) | **5** — *all 5 fixed by PR #552* |
| — of those, a *different*, **pre-existing** bug (`@style $reactive()`) | **2** — *not fixed by #552, not caused by #497* |
| AT RISK | **0** |
| Ships inside a published npm package as broken source | **0** |
| Ships to users via the **published compiler** | **YES** — `@aihu/compiler-darwin-arm64@0.1.28` reproduces all 7 verbatim |
| Patch release required | **YES**, and the release workflow **as written will not deliver it** — see §7 |

The 5 #497 victims are `docs-shell`, `theme-toggle` (both known), plus **3 newly found**:
`examples/_shared/example-shell`, `examples/realtime-scores/src/realtime-scores`,
`examples/storefront/src/product-list`.

---

## 1. Detection method

Eyeballing 69 files was ruled out. The probe is **empirical and two-layered**;
the dynamic layer is authoritative and the static layer is a cross-check.

Harness: `scratchpad/tdz-probe.ts` (throwaway, not committed).

**Dynamic layer — actually execute the emitted setup and catch the throw.**
For each compiled output:

1. Strip every `import` statement and collect the imported binding names
   (both `import { … }` and `import * as X` forms).
2. Generate a stub module exporting exactly those names, with **semantics that
   match the real runtime for everything that decides TDZ**:
   - `signal(init)` → `[getter, setter]` tuple (matches the emitted destructure);
   - `effect(fn)` → **runs `fn` synchronously and rethrows** — verified against
     `packages/signals/src/effect.ts:288` (`try { runEffect(node) } catch (err) { dispose(); throw err }`);
   - `computed(fn)` → **lazy** — verified against `packages/signals/src/computed.ts:162`
     (the value is produced inside `read()`, not at construction);
   - `onMount` / `onCleanup` / `onAdopt` / `onAttributeChange` → **deferred, never invoked**
     — verified against `packages/runtime/src/define-component.ts:839` (`_cur.m.push(fn)`);
   - `batch(fn)` / `untrack(fn)` → synchronous passthrough;
   - `defineComponent` → captures the setup (handles both the function form and the
     `{ props, setup }` object form);
   - everything else → a self-returning callable Proxy that is also destructurable,
     iterable and spreadable, so an unknown import can never mask a real TDZ.
3. Run under `jsdom` with `CSSStyleSheet`, `localStorage`, `matchMedia`,
   `IntersectionObserver`, `attachInternals`, `document.adoptedStyleSheets` etc. shimmed.
4. Invoke each captured setup with a Proxy `ctx` and classify the throw.
   Only `ReferenceError: Cannot access 'X' before initialization` counts as a hit.

**Three noise sources had to be neutralised before the signal was clean** — each is
an *independent* emitted-code defect that would otherwise have hidden a TDZ behind an
earlier, unrelated throw (all three are recorded in §6):

- `this.` inside the emitted setup **arrow** → `this` is `undefined` in an ES module.
  Rewritten to a probe-local `__probeSelf` (`cookbook/aria-form`, `cookbook/form-validation`).
- Identifiers **used but never imported** → `X is not defined`. The driver retries with
  the missing name stubbed on `globalThis`, cache-busting the import, up to 12 times
  (`examples/color-theme` → `effect`; `cookbook/guard-ui` → `getScopeSignal`;
  `bench/…/02-state-resource-effect` → `updateList`).
- `import * as __aihuRouter` namespace imports (`examples/hacker-news/src/pages/item/[id]`).

After neutralisation: **0** `OTHER_ERROR`, **0** `LOAD_ERROR`, **0** harness failures
across all 109 files under both compilers. Every verdict is a real verdict.

**Static layer.** Locate every `const [X, __X_set] = signal(…)` and every
`const X = computed(…)` in the emitted JS, then find the earliest textual read of `X`
above it. Used only to (a) corroborate the dynamic hits and (b) surface reads that live
in *deferred* closures, which are legal but fragile (§5).

---

## 2. Calibration (the mandated check)

The two files INV-A proved broken in a real browser must both light up, or the
detector is worthless.

| Known-broken file | Probe verdict on `main` | Emitted evidence |
|---|---|---|
| `apps/docs/src/components/docs-shell.aihu` | ✅ **TDZ** — `Cannot access 'activePage' before initialization` | read `L298`, decl `L338` |
| `apps/docs/src/components/theme-toggle.aihu` | ✅ **TDZ** — `Cannot access 'dark' before initialization` | read `L56`, decl `L68` |

Both match the browser errors INV-A captured (`Cannot access 'c' …` / `'r' …` —
the same bindings after minification). **Calibration passes; the sweep is trustworthy.**

Two further calibration signals:

- **Negative control:** the *pre-#497* `docs-shell.aihu` (`git show d68f886:…`), compiled
  with the same `main` compiler, probes **SAFE**. The detector responds to the regression,
  not to the file.
- **Published-artifact control:** `@aihu/compiler-darwin-arm64@0.1.28` (npm `latest` platform
  binary, fetched via `npm pack`) reproduces **all 7** hits identically. The bug is in
  shipped bits, not in a local build.

---

## 3. The table — every file with a verdict

Verdicts are from the dynamic probe. `main` = `e207ba97` workspace `cargo build --release`.
`#552` = worktree on `origin/fix/compiler-statelet-hoist-tdz` (`b6d79ac1`),
`cargo build --release`, invoked **directly as a binary** — never through the JS envelope,
which would have silently used the published napi addon and returned the buggy result.

### 3a. DEFINITELY BROKEN (7)

| # | File | Binding | Sync read | main | #552 | Class | Ships to users? |
|---|---|---|---|---|---|---|---|
| 1 | `apps/docs/src/components/docs-shell.aihu` | `activePage` | `seedFromPrerender()` called in plain body | read L298 / decl L338 ❌ | decl L264 / read L300 ✅ | A (#497) | aihu.dev |
| 2 | `apps/docs/src/components/theme-toggle.aihu` | `dark` | `effect(() => … dark() …)` | read L56 / decl L68 ❌ | decl L54 / read L58 ✅ | A (#497) | aihu.dev |
| 3 | `examples/_shared/example-shell.aihu` | `dark` | `effect(() => … dark …)` | read L106 / decl L118 ❌ | decl L104 / read L108 ✅ | A (#497) | 8 example apps |
| 4 | `examples/realtime-scores/src/realtime-scores.aihu` | `resourceKey` | `createResource(resourceKey, …)` arg | read L49 / decl L92 ❌ | decl L49 / read L52 ✅ | A (#497) | example app |
| 5 | `examples/storefront/src/product-list.aihu` | `resourceKey` | `createResource(resourceKey, …)` arg | read L133 / decl L143 ❌ | decl L132 / read L135 ✅ | A (#497) | example app |
| 6 | `examples/color-theme/color-theme.aihu` | `primary` | `$reactive()` global `effect` at top of setup | read L23 / decl L29 ❌ | read L23 / decl L30 ❌ **STILL BROKEN** | **B (pre-existing)** | example app |
| 7 | `examples/_shared/macro-test.aihu` | `primary` | same | read L29 / decl L38 ❌ | unchanged ❌ **STILL BROKEN** | **B (pre-existing)** | corpus fixture only |

### 3b. SAFE — full coverage list

All of the following probe SAFE under **both** compilers.

- **`cookbook/` (21 files, all SAFE):** `agent-weather`, `aihu-accordion`, `aihu-clock`,
  `aihu-controller`, `aihu-tabs`, `aihu-toast`, `aria-form`, `context-provider`,
  `data-table`, `form-validation`, `guard-ui`, `infinite-scroll`, `search-debounce`,
  `tailwind-style`, `theme-toggle`, + the rest of the corpus.
  *These are the docs-playground presets — the highest-exposure non-compiler surface — and
  none of them carry the TDZ.*
- **`packages/templates/cf-team/template/apps/web/src/**` (3 files, all SAFE):**
  `app.aihu`, `agent/expose.aihu`, `components/live-counter.aihu`. These are on the
  `$prop:` / `$action:` collection macros, **not** the `let x = state()` wrapper — the
  splice never applies.
- **`packages/ui/registry/**` (22 files, all SAFE):** badge, button, card, checkbox,
  dialog ×7, input, label, separator, switch, textarea, tooltip ×3.
- **`packages/editor/components/**` (2 files, SAFE).**
- **`packages/cli/src/templates/*`, `packages/cli/src/index.ts`, `packages/cli/src/commands/{page,component}.ts`,
  `packages/cli/src/templates-agent.ts`** — the `create-aihu` / `aihu new` scaffolds. Read
  directly: every one uses the **legacy explicit-signal dialect**
  (`const [count, setCount] = signal(0)`) with declarations preceding all use. Not affected.
- **Remaining `apps/docs` + `examples/` + `bench/` files** — 60 further files, all SAFE.

### 3c. Not covered — 24 files that do not compile at all

Identical failures on both compilers, so **no regression**, but they are a blind spot:

| Group | Count | Reason |
|---|---|---|
| `packages/compiler/tests/codemods/fixtures/**` | 20 | Deliberate v1-grammar codemod inputs (`C440`: `$expose` / `$lifecycle.mount {` removed in v2) |
| `bench/compiler-conformance/route/04-governed-data.aihu` | 1 | `C500`: `@route` only valid under `src/pages/` |
| **`packages/router/components/{Router,Link,Navigate}.aihu`** | 3 | `C440`: still on the v1 `$lifecycle.mount { … }` form — **missed by the v2 grammar migration (#489)**. Not referenced from `packages/router/src` or its build config, so they appear to be dead reference files, but they are shipped in the package tree and do not compile. Worth a separate cleanup ticket. |

---

## 4. Before / after under PR #552

Built from `origin/fix/compiler-statelet-hoist-tdz@b6d79ac1`:

```
cargo build --release --manifest-path <wt>/packages/compiler/Cargo.toml
<wt>/target/release/aihu-compile <file>      # binary invoked directly
```

> **Trap, restated because it has already cost hours.**
> `packages/compiler/js/envelope.ts:_resolveCompileBackend()` prefers the **published
> in-process napi addon** over any local build unless `AIHU_COMPILE_BIN` or
> `AIHU_COMPILER_NATIVE=0` is set. Compiling through `bun`/the CLI without pinning gives
> you `@aihu/compiler-native-*@0.1.0` — the buggy 2026-07-23 artifact — and a
> false "still broken" result. Every #552 number above comes from invoking the freshly
> built binary directly.

| Class | Files | main | #552 |
|---|---|---|---|
| **A** — `@state` wrapper splice (#497) | 5 | 5 broken | **0 broken** ✅ |
| **B** — `@style $reactive()` global effects (pre-existing) | 2 | 2 broken | **2 broken** ❌ |

**#552 fully resolves the regression it targets.** No class-A file regressed, and no
previously-SAFE file became broken (all 109 re-probed under #552).

`b6d79ac1` also already carries the `AIHU_COMPILE_BIN` env wiring in
`.github/workflows/deploy-docs.yml` that INV-A said was required — so #552 as it stands
can prove itself in CI.

### The 2 files #552 does not fix — a *different* bug

`color-theme` and `macro-test` use `$reactive(…)` inside `@style`, which emits
`effect(() => document.documentElement.style.setProperty('--reactive-global-N', String(primary)))`
at the **very top of the setup body**, above *all* `@state` declarations — including the
`derived`/`computed` bindings it reads. This is the **`@style` reactive-global emitter**,
not the `@state` macro_code splice, and #552 does not touch it.

**Proof it predates #497:** the `d68f886` (pre-#497) versions of both files, compiled with
the *current* compiler, probe **TDZ** as well. `macro-test.aihu` was not even in #497's
78-file list — its last touch is `80531dcc` (#489). So:

- `color-theme` was already broken before the migration; #497 changed its dialect but not
  its brokenness.
- These two need their **own fix** (emit the `$reactive` globals *after* the state block,
  or hoist the derived declarations above them) and their own changeset. **Do not block
  #552 on it, and do not let it be mistaken for a #552 gap.**

---

## 5. AT RISK — none, and why

The static layer found 17 files where a binding is read textually above its declaration
but the dynamic probe says SAFE. Every one was inspected and falls into two harmless buckets:

- **CSS false positives** — the identifier appears inside the `__style__.replaceSync(\`…\`)`
  template literal (`.seconds { … }`, `progress { … }`, `display: grid`, `.no-results`, …).
  Not code.
- **Deferred closures** — an arrow that *references* a later binding but is not invoked
  during setup: `const increment = () => { __count_set(count() + 1) }` (`live-demo` L142 vs
  decl L148), `const toggle = () => { __open_set(!open()) }`, `const bump = () => { __tick_set(tick() + 1) }`,
  `const doubled = computed(() => count() * 2)` (lazy). All legal — the binding is
  initialised long before the closure runs.

The dynamic probe models the three things that decide the difference — `effect` eager,
`computed` lazy, `onMount` deferred — so a genuine "callback that runs synchronously"
case would have surfaced as a TDZ throw. **No file needs a hand-waving "at risk" label.**

---

## 6. Independent defects found in passing

Not TDZ, not #497, but each throws at setup and blanks a component. Flagged, not fixed.

| File | Defect | Ships? |
|---|---|---|
| `examples/color-theme/color-theme.aihu`, `examples/_shared/macro-test.aihu` | Emit `effect(…)` for `$reactive` globals but **never import `effect`** → `ReferenceError: effect is not defined`. Fires *before* the class-B TDZ. Present pre- and post-#552. | example app |
| `cookbook/guard-ui.aihu` | Emits `when(getScopeSignal('admin'), …)`; **`getScopeSignal` is never imported or defined** → `ReferenceError`. | docs playground preset |
| `bench/compiler-conformance/macros/02-state-resource-effect.aihu` | Emits `effect(() => { data; updateList(data()) })`; `updateList` undefined. | bench fixture |
| `cookbook/aria-form.aihu`, `cookbook/form-validation.aihu` | Emit `this._internals` / `this.attachInternals()` inside the setup **arrow**, where `this` is `undefined` in an ES module → `TypeError`. | docs playground presets |
| `packages/router/components/{Router,Link,Navigate}.aihu` | Still on v1 `$lifecycle.mount { … }`; do not compile (`C440`). | published package tree |

`cookbook/guard-ui`, `aria-form` and `form-validation` are the sharpest of these: cookbook
files are the docs playground presets, so they are user-facing today.

---

## 7. Severity ranking

1. **P0 — the published compiler.** `@aihu/compiler-darwin-arm64@0.1.28` reproduces all 7
   hits; the napi addon `@aihu/compiler-native-*@0.1.0` (published 2026-07-23, *after* the
   regression) carries the same codegen and is what `envelope.ts` prefers by default.
   **Any downstream user** who writes `let x = state(init)` and then synchronously reads
   `x` from the plain body — `effect(…)`, an immediately-invoked helper, a `createResource`
   argument — gets a `ReferenceError` and a component that upgrades with an empty shadow
   root and fails silently. This is the whole blast radius, not the 7 files in this repo.
2. **P0 — aihu.dev.** `docs-shell` + `theme-toggle` = the entire interactive docs site
   (sidebar, routing, playground, dark mode). Production is only intact because the red gate
   has blocked every deploy since 2026-07-22.
3. **P1 — `examples/_shared/example-shell.aihu`.** Newly found, and the widest in-repo
   fan-out: it is the page chrome for `live-counter`, `color-theme`, `weather-card`, `timer`,
   `temperature-converter`, `currency-converter`, `primitives-showcase`, `css-engine-demo`
   and `todo-mvc`. Every one of those example pages loses its header/theme toggle.
4. **P1 — `realtime-scores`, `product-list`.** Two flagship examples dead at setup. Their
   `createResource(resourceKey, …)` shape is worth calling out: it is the *most likely*
   pattern for a downstream user to hit, because passing a state binding straight into a
   data helper is the documented idiom.
5. **P2 — `color-theme`, `macro-test`** (class B). Pre-existing, so no urgency created by
   this merge train, but `color-theme` is a deployed example that has been dead for some
   time and nobody noticed — which is its own signal about example coverage.
6. **P2 — the §6 independent defects**, with `cookbook/guard-ui` first (playground preset).
7. **P3 — `packages/router/components/*.aihu`** not compiling.

**Nothing to add on the scaffold front:** `create-aihu`, the `aihu new`/`page`/`component`
generators and the `cf-team` template all emit legacy-dialect or macro-collection code and
are **clean**. A user who scaffolds today gets a working app; they only hit the bug when
they *write* the wrapper dialect the docs now teach.

---

## 8. Is a patch release required, and what must be in it

**Yes — and the release workflow as written will not deliver the fix to the surface that
matters.**

### 8.1 The napi addon will be skipped

`packages/compiler/npm-native/*/package.json` is hardcoded at **`version: 0.1.0`** for all
five platforms, and `.github/workflows/release.yml:864` explicitly skips any package whose
version already exists on npm:

```bash
existing=$(npm view "${pkg_name}@${pkg_version}" version 2>/dev/null || true)
if [ -n "$existing" ]; then
  echo "${pkg_name}@${pkg_version} already published — skipping"
  continue
fi
```

`@aihu/compiler-native-*@0.1.0` **is already on npm** (2026-07-23, buggy). So a tag push
after #552 lands will publish `@aihu/compiler` and the CLI platform binaries, print
*"already published — skipping"* for all five addons, and leave every consumer — and every
CI job in this repo that does not set `AIHU_COMPILE_BIN` — on the broken codegen.
Changesets does not version these packages (they are outside the workspace versioning path;
only the `--snapshot canary` branch restamps them).

### 8.2 Release checklist

1. **Land #552.** It is correct and complete for class A: 5/5 fixed, 0 regressions across
   109 files. It already carries the `deploy-docs.yml` `AIHU_COMPILE_BIN` wiring, so its own
   CI run can prove it end-to-end.
2. **Bump `packages/compiler/npm-native/*/package.json` to `0.1.1`** (all five platforms)
   **in the same PR**, and add the bump to the changeset. Without this the release is a
   no-op for downstream users. *This is the single highest-value line item in this report.*
3. **Update `bun.lock`** to the new addon version. Also correct the CLI platform pins:
   `bun.lock` currently pins `@aihu/compiler-<platform>@0.1.30`, **a version that does not
   exist on npm** (`latest` is `0.1.28`, and the tree declares `0.1.32`), so those
   optionalDependencies are silently skipped on every install and that distribution path is
   effectively untested.
4. **Publish `@aihu/compiler` (1.1.0 → 1.1.1)** plus the `0.1.32` CLI platform binaries.
5. **Add a regression test to the compiler suite**: a fixture whose `@state` block declares
   `let x = state(…)` and then synchronously reads `x` from the plain body (both the
   `effect(…)` shape and the immediately-invoked-helper shape), asserting emitted-order.
   The reason this shipped is that `d68f886` added the codegen with no `.aihu` file using it
   and `05a94b7` added 69 users with no ordering assertion.
6. **Separately** (do not block the release): fix the class-B `@style $reactive()` ordering
   + missing `effect` import, and the §6 cookbook defects.

### 8.3 Recommended release note wording

> Fixes a codegen bug where `let x = state(init)` was emitted after the plain body of
> `@state`, so any component that synchronously read `x` during setup threw
> `ReferenceError: Cannot access 'x' before initialization` and rendered an empty shadow
> root. Affects every release from the `@state` wrapper-dialect introduction through
> `@aihu/compiler-native-*@0.1.0` / `@aihu/compiler-<platform>@0.1.28`. **Upgrade required
> for anyone using the `let x = state(…)` dialect.**

---

## 9. Confidence and falsifiers

**Verdicts: very high (≈95%).** Each is an executed throw with a message, not a heuristic;
the detector is calibrated against two independently browser-confirmed positives and one
pre-#497 negative control; the published npm binary reproduces all 7; and every masking
error class was removed before the final run (0 inconclusive results across 218
file×compiler probes).

**Known limits:**

- The dynamic probe stubs everything outside `@aihu/signals` and `@aihu/runtime`. If a real
  third-party helper invoked a callback synchronously where my Proxy does not, a hit could
  be missed. Mitigated by the static layer, which found no additional pre-declaration read
  outside the CSS/deferred-closure buckets — so a miss would need to be invisible to *both*
  layers.
- The 24 non-compiling files (§3c) are unprobed. All are v1-grammar fixtures or path-bound
  fixtures except the three router components; none uses the wrapper dialect.
- I probed setup only. A read that happens later (mount, event handler) is by construction
  after the declarations executed, so this is not a gap.

**Cheapest falsifiers:**

- Run `apps/docs` e2e on #552 with `AIHU_COMPILE_BIN` pinned. 19/19 (with #553) ⇒ this
  report and INV-A are both right. Still 13/6 ⇒ #552's codegen fix is incomplete in a way
  neither of us caught.
- Load `examples/storefront` and `examples/realtime-scores` in a browser on `main`; both
  should log `[aihu] setup failed … Cannot access 'resourceKey' before initialization`.
  If they render, my `createResource` argument-evaluation reading is wrong.
- Tag a release with the addon version left at `0.1.0` and then run
  `npm view @aihu/compiler-native-darwin-arm64 time --json`. If a new timestamp appears,
  §8.1 is wrong and the skip does not apply.

---

## Appendix — reproducing this sweep

```bash
# 1. candidates
grep -rl '@state' --include='*.aihu' . | grep -vE 'node_modules|/dist/|\.claude/worktrees'

# 2. compile with each compiler (binary invoked DIRECTLY — never via the envelope)
./target/release/aihu-compile <file>                    # main
<wt-552>/target/release/aihu-compile <file>             # PR #552
<npm-pack>/package/aihu-compile <file>                  # published 0.1.28

# 3. probe
bun scratchpad/tdz-probe.ts <outdir> <results.json>
```

Artifacts under
`/private/tmp/claude-501/-Users-smcguirt-conductor-repos-aihu/fd652b30-81a8-4bca-ac6c-1182f3057393/scratchpad/`:
`tdz-probe.ts`, `all-main/`, `all-552/`, `pub-out/`, `pre497-out/`,
`all-res-main.json`, `all-res-552.json`.
