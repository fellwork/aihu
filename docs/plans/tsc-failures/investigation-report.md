# Investigation: #427 (`packages/tsc` language-plugin test) + #434 (legacy-snapshot golden drift)

Branch: `investigate/tsc-failures` off `origin/main` (base `52945e3e`).
Both issues reproduced independently. **They do NOT share a root cause.** The
`aihu-tsc` naming in each is a coincidence, not a common mechanism.

---

## #427 — `packages/tsc` language-plugin test fails on main

### Exact failing test
`packages/tsc/tests/language-plugin.test.ts`, describe block
`the .aihu file reaches TypeScript as virtual TS`, **2 of 7 tests fail**:

- `generates a type-check surface, not the raw .aihu text`
  → assertion `expect(text).toContain('__aihu_template')` — line 34.
- `carries the @state body, so a type error in it is catchable`
  → assertion `expect(text).toContain("const bad: number = 'not a number'")` — line 41.

In both, `text === ''` (the virtual-code snapshot is empty).

### Repro command + output
```
$ bunx vitest run packages/tsc/tests/language-plugin.test.ts
 ❯ packages/tsc/tests/language-plugin.test.ts (7 tests | 2 failed)
   × ... generates a type-check surface, not the raw .aihu text
     → expected '' to contain '__aihu_template'
   × ... carries the @state body, so a type error in it is catchable
     → expected '' to contain 'const bad: number = \'not a number\''
 Tests  2 failed | 5 passed (7)
```

### Root cause (one line)
The test drives `createAihuLanguagePlugin` → `compileSidecar`, which shells out to
the **Rust `aihu-compile` binary**; in a clean checkout the binary is not built, so
`resolveCompilerBinary()` throws, the `try/catch` in `createVirtualCode` swallows it
and returns an **empty surface** (`''`), failing the two assertions that require a
non-empty surface.

### Trace / evidence
- `packages/tsc/src/language-plugin.ts` → `createVirtualCode` calls
  `compileSidecar(source, fileName)` inside a `try`; on any throw it sets
  `generated = ''` and returns `snapshot = ''`, `mappings = []`.
- `packages/compiler/js/index.ts::compileSidecar` runs
  `execFileSync(resolveBinPath(), ['--stdin','--tag',stem,'--sidecar-stdout', ...])`.
- `resolveCompilerBinary()` (`packages/compiler/js/resolve-binary.ts`) resolution order:
  `AIHU_COMPILE_BIN` env → `@aihu/compiler-<platform>` npm package →
  `target/release|debug/aihu-compile` → `packages/compiler/bin/aihu-compile`.
  In a fresh worktree **none** exist → it throws
  `"[@aihu/compiler] Native compiler binary not found for this platform."`
- Direct probe confirmed the throw. The Rust CLI **does** support `--sidecar-stdout`
  (`packages/compiler/src/bin/main.rs:436-443`), so this is not a flag mismatch.
- **Proof it is only the missing binary:** `cargo build --release -p aihu-compiler`
  emits `target/release/aihu-compile`; re-running the test then gives **7/7 pass**.
- The 5 tests that pass without the binary do so because they either exercise pure-JS
  `buildMappings` (no subprocess) or assert the *empty* surface — the third test
  (`an SFC that does not compile yields an EMPTY surface`) passes for the **wrong
  reason** here (binary-missing also yields empty).

### CI reality
`language-plugin.test.ts` is **not** excluded in `vitest.config.ts`, so it runs under
`bun run test --coverage` (`.github/workflows/plan-a.yml:122`). CI builds the Rust
binary first (`cargo build --release`, plan-a.yml:61-65, staged to
`packages/compiler/bin/aihu-compile`), so **#427 is GREEN in CI and red only in a
fresh local worktree** that skipped `cargo build`. Its excluded sibling
`packages/compiler/tests/b3b-sidecar-tsc.test.ts` has the identical binary
dependency and *is* excluded "until B3b lands" — `language-plugin.test.ts` is the
inconsistent one.

### Fix classification
- **Making the red test green: mechanical/safe.** Build the binary
  (`cargo build --release -p aihu-compiler`) — verified to turn 2-fail into 7/7 pass.
  No product code is wrong; the test is correct.
- **Hardening so `bun run test` isn't red in a fresh clone: decision-laden.** The
  test has a hard, unguarded dependency on a built binary yet sits in the default
  suite. The founder should choose the policy (see Decisions below) — do NOT pick.

---

## #434 — legacy-snapshot golden: scaffolded `package.json` drifts from frozen golden

### Exact failing test
`packages/cli/tests/legacy-snapshot.test.ts` →
`legacy-snapshot · backward-compat freeze (arch-6 §7.3) > aihu app <name> --pm bun
produces the byte-identical golden tree`, failing at the byte-comparison loop,
`packages/cli/tests/legacy-snapshot.test.ts:146` — `byte-mismatch in package.json`.

### Repro command + output
The test is **excluded** in `vitest.config.ts`, so it must be run with the exclude
bypassed (in-repo temp config with `include: [that file]`, `exclude: [node_modules]`):
```
 ❯ packages/cli/tests/legacy-snapshot.test.ts (1 test | 1 failed)
   × ... produces the byte-identical golden tree
     → byte-mismatch in package.json — legacy scaffolding regressed.
```
Manual scaffold vs golden diff (file **set** is identical; only `package.json` bytes differ):
```
10c10
<     "typecheck": "tsc --noEmit"          # golden (frozen)
---
>     "typecheck": "aihu-tsc"              # produced (current emitter)
22a23
>     "@aihu/tsc": "latest",               # produced adds this devDependency
```

### Root cause (one line)
The frozen §7.3 golden was written **2026-06-16** (commit `6a0d8e42`, #374); the
scaffold emitter was later changed **2026-07-13** (commit `81279254`, PR #395
"type-check .aihu files (aihu-tsc)") to emit `typecheck: "aihu-tsc"` + a
`@aihu/tsc: "latest"` devDependency — and the golden was never regenerated. The
golden is stale by exactly that one intentional emitter change.

### Trace / evidence
- Emitter: `packages/cli/src/index.ts::appPackageJson` emits
  `scripts.typecheck = 'aihu-tsc'` (line 98) and `devDependencies['@aihu/tsc'] =
  'latest'` (line 126) — **unconditionally**.
- `git log -S "typecheck: 'aihu-tsc'"` and `git log -S "'@aihu/tsc': 'latest'"` on
  `index.ts` both point to the **single** introducing commit `81279254` (PR #395,
  2026-07-13). `git log` on the golden `package.json` shows its last write at
  `6a0d8e42` (2026-06-16). The emitter change post-dates the golden by ~4 weeks.

### Verdict on the env-conditional hypothesis: **REFUTED**
The prior hypothesis (scaffold emits a different `package.json` depending on
environment / tooling presence) is **false**. Evidence:
- The `appPackageJson` emitter has **no** `process.env` / `import.meta.env` /
  `getenv` reads (grep returns nothing). Its only inputs are `name`, `pm`,
  `withCssEngine`, and the bun version (for the `packageManager` field). The only
  conditionals are `withCssEngine` (adds `@aihu/css-engine`) and `packageManager`
  (bun-only); neither depends on tooling/binary presence.
- The `aihu-tsc` / `@aihu/tsc` lines are emitted **unconditionally**.
- Determinism confirmed: scaffolding under a **stripped environment**
  (`env -i HOME=… PATH=… bun … app …`) produces a **byte-identical** `package.json`
  to a normal run. The drift is deterministic source divergence, not env-conditional.

### CI reality — the drift went uncaught
`legacy-snapshot.test.ts` **and** `b3b-sidecar-tsc.test.ts` are both in the
`vitest.config.ts` `exclude` list. `plan-a.yml:121` tries to run it explicitly
(`bun run test packages/cli/tests/legacy-snapshot.test.ts`), but the config
`exclude` defeats even a named filter — verified: that command prints
**"No test files found, exiting with code 0"** and passes vacuously. So #434 is
gated **nowhere** today, which is why PR #395's scaffold change drifted the golden
unnoticed. (Contrast: `scaffold-and-compile.test.ts` is *not* excluded, so
plan-a.yml:120 really runs it.)

### Fix classification: **decision-laden**
The golden encodes the *intended* v0.2.0 legacy artifact; the emitter change in #395
was a deliberate feature. The issue explicitly warns "do not blind-regenerate the
compat-freeze." Whether the new output is canonical is a judgment call (see Decisions).

---

## Shared root cause? **NO.**

Independent mechanisms, proven:
- **#427** = missing *built* `aihu-compile` binary (environmental / test-setup).
  Building the binary flips it to 7/7 green and has **zero** effect on #434.
- **#434** = stale frozen golden from a deterministic, binary-independent,
  environment-independent emitter change (PR #395). Reproduces identically with the
  binary present and under a stripped environment.
- Different packages (`packages/tsc` vs `packages/cli`), different files, different
  failure modes (empty subprocess output vs byte-diff of static text).
- The only link is the string "tsc": #427 lives in `packages/tsc`; #434's drift is
  the newly-emitted `@aihu/tsc` dep. Coincidental — #427's failure predates and is
  independent of PR #395.

## Interaction with recently-landed work
- **Compiler binary 0.1.10** — #427 needs *a* built binary regardless of version;
  the bump is orthogonal and does not mask it (`AIHU_COMPILE_BIN`/platform-pkg/
  `target/` all absent in a fresh worktree → hard throw, not a silent wrong answer).
- **#429 (codegen)** and **#436 (runtime slots)** — neither touches
  `packages/cli/src/index.ts` (the scaffold emitter) nor `compileSidecar`'s flag
  contract. `git log -S` attributes the golden drift **solely** to PR #395, not
  #429/#436. Recent work neither caused nor masked either failure (they were
  already red / vacuously-skipped before it landed).

---

## Recommended next actions

**#427 (mechanical, safe):**
- Immediate: `cargo build --release -p aihu-compiler` before running the tsc suite
  locally (CI already does this) — verified 7/7 green.
- Optional hardening is decision-laden (below).

**#434 (decision-laden — surface to founder, do NOT auto-fix):**
- Independently of the golden decision, the test must actually **run** to gate future
  drift: today the `vitest.config.ts` exclude defeats even the explicit
  `plan-a.yml:121` invocation. That CI-gap fix is mechanical/safe on its own.

---

## Decisions needed (do NOT decide — surface to founder)

**D1 — #434: is the `aihu-tsc` scaffold change allowed to alter the frozen §7.3
legacy artifact?** PR #395 deliberately switched the scaffold's `typecheck` to
`aihu-tsc` (plain `tsc` cannot see inside `.aihu` files) and added the `@aihu/tsc`
dep. The R-CT-06 freeze exists to catch exactly this kind of change. Options:
  - **(a) Accept the evolution — regenerate the golden.** Delete
    `packages/cli/tests/legacy-snapshot.golden/` and re-run to write the new tree
    (mechanical once decided). Treats `aihu-tsc` as the correct v0.2.0 legacy output.
  - **(b) Hold the freeze — revert the emitter for the *legacy* path.** Keep the
    legacy scaffold emitting `tsc --noEmit` / no `@aihu/tsc`, and let `aihu-tsc`
    apply only to the newer template paths. Treats #395 as having violated the freeze.
  - **(c) Split the contract** — redefine what §7.3 guarantees (e.g. exclude the
    `typecheck` script + tsc dep from the frozen surface) so both can evolve.

**D2 — #427/#434: test-gating policy for binary-dependent CLI/tsc tests.** Three
tests need a built Rust binary; they are handled inconsistently
(`language-plugin.test.ts` runs in the default suite unguarded and is red in fresh
clones; `b3b-sidecar-tsc.test.ts` and `legacy-snapshot.test.ts` are excluded — and
the exclude silently no-ops the explicit CI runs). Options:
  - **(a)** Add a skip-if-binary-missing guard (mirroring `SCRIBE_NATIVE_SKIP` for
    the server addon) so `bun run test` is green in a fresh clone and the test still
    runs where the binary exists.
  - **(b)** Make `cargo build` a documented, enforced prerequisite of the JS test
    suite (no test changes).
  - **(c)** Fix the CI invocation so excluded tests genuinely run (e.g. a dedicated
    config without the exclude for `plan-a.yml:120-121`), closing the #434 blind spot.
