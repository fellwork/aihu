# Verification Report — Phase 2 (`@aihu/signals`)

**Verifier:** Verifier (code)
**Date:** 2026-04-26
**Worktree:** `c:/git/fellwork-worktrees/aihu-phase-2-builder` (branch `plan-a-phase-2`)
**Time spent:** ~45 min

---

## 1. Verdict

**PASS WITH NOTES.** All ten gates pass. The 32-test suite is green, dist
artifacts contain exactly the spec'd public surface (15 symbols: 7 values + 8
types — the 7 mandated types plus the legitimately-added
`ComputedOptions<T>` from spec Deviation 8), the size limit lands at 629 B gz
versus a 1024 B budget (38% headroom), Biome ci is clean, the cycle path
throws the typed `SignalCircularError` (not a generic `RangeError` or
`Error`), and the Phase 1 do-not-break list survives intact. The Builder's
out-of-spec Moon 2.x migration is reproducibly necessary on this host:
restoring `.moon/tasks.yml` to the v1 location causes `moon run
signals:typecheck` to fail with `Unknown task typecheck`. Findings are
limited to (a) the Phase 1 CI workflow does not actually run on this branch's
pushes — it triggers on `main` push/PR only — so CI is "verified locally,
not on GitHub" until a PR is opened, and (b) a small `computed.ts` branch-
coverage gap (78.57% — 3 defensive lines uncovered).

---

## 2. Gate-by-gate evidence

### Gate 1 — Test suite

**Command:** `bun run test --coverage`

**Result:** PASS — 32/32 tests across 6 files. Coverage: 100% stmts / 95.08%
branch / 100% funcs / 100% lines.

**Evidence:**

```
✓ packages/signals/tests/effect.test.ts     (7 tests)
✓ packages/signals/tests/signal.test.ts     (5 tests)
✓ packages/signals/tests/batch.test.ts      (6 tests)
✓ packages/signals/tests/computed.test.ts   (5 tests)
✓ packages/signals/tests/state.test.ts      (4 tests)
✓ packages/signals/tests/properties.test.ts (5 tests)

Test Files  6 passed (6)
     Tests  32 passed (32)
  Duration  3.53s
```

Spec §4 minimums met or exceeded:

| File | Spec minimum | Actual | OK? |
|---|---|---|---|
| `signal.test.ts` | 5 unit | 5 | yes |
| `effect.test.ts` | 6 unit + 1 cycle = 7 | 7 (6 unit + 1 cycle) | yes |
| `computed.test.ts` | 4 unit + 1 cycle = 5 | 5 (4 unit + 1 cycle) | yes |
| `state.test.ts` | 4 unit | 4 | yes |
| `batch.test.ts` | 6 unit | 6 | yes |
| `properties.test.ts` | 3 fast-check + 1 batch property = 4 | 5 (4 fast-check + 1 sanity) | yes (sanity test is harmless extra) |

The 1-test sanity check in `properties.test.ts` (`fast-check is wired up`) is
a no-op `expect(typeof fc.assert).toBe('function')`; it's harmless and
prevents false-green from a silently-broken fast-check import. Not
spec-prohibited.

**Coverage anomaly (LOW):** `computed.ts` branch coverage is 78.57% — 3
lines uncovered:
- L26: `if (node.flags & DISPOSED) return` (defensive — no public way to
  dispose a computed in v0)
- L30: `if (node.flags & STALE) return` (cascade-suppression for repeated
  notifies; reachable but not specifically tested)
- L40: re-entry on read (exercised only indirectly by the cycle test that
  goes through `notify()`, not by direct `read()`-while-running)

These are defensive guards. Builder flagged them in the manifest. None block
ship.

---

### Gate 2 — Typecheck

**Commands:**
- `moon run :typecheck` → PASS (cached, `e0db928f`)
- `bunx tsc --noEmit -p packages/signals/tsconfig.json` → PASS (exit 0, no
  output) — direct invocation bypassing Moon cache, confirms not stale
- `bunx tsc --noEmit -p tsconfig.json` → PASS (exit 0, no output) — root
  tsconfig with the wider include glob

**Evidence:** All three exit zero. No TS warnings. The
`allowImportingTsExtensions: true` patch in `tsconfig.base.json:21`
correctly suppresses TS5097 for `.ts`-extension imports throughout the source
tree.

---

### Gate 3 — Build

**Command:** `moon run :build`

**Result:** PASS (cached, `149226ba`).

**Evidence:**

```
signals:build | <DIR>/index.d.ts.map  asset │ size:  0.98 kB
signals:build | <DIR>/index.js.map    asset │ size: 10.68 kB
signals:build | <DIR>/index.d.ts      chunk │ size:  2.20 kB
signals:build | <DIR>/index.js        chunk │ size:  4.43 kB
signals:build | ✔ rolldown v1.0.0-rc.17 Finished in 3.09 s
```

`packages/signals/dist/`:

```
index.d.ts      2198 B
index.d.ts.map   977 B
index.js        4426 B
index.js.map  10682 B
```

Both `dist/index.js` and `dist/index.d.ts` produced. The `dts()` plugin
emitted the declaration file correctly.

**Build warnings:**
- `WARN You are using Node.js 20.18.0. Rolldown requires Node.js version
  20.19+ or 22.12+` — Builder flagged this in `builder-blockers.md`; out of
  scope for Phase 2.
- `[PLUGIN_TIMINGS] Warning: Your build spent significant time in plugin
  rolldown-plugin-dts:generate.` — informational only; build still
  finishes in 3 s.

**Public surface check** — `dist/index.d.ts:58` exports list verbatim:

```
export { $state, type ComputedOptions, type Dispose, type EffectFn,
         type Read, type Signal, SignalCircularError, SignalError,
         type SignalOptions, type State, type Write,
         batch, computed, effect, signal };
```

Decomposed:

| Kind | Symbols | Count |
|---|---|---|
| value | `$state`, `SignalCircularError`, `SignalError`, `batch`, `computed`, `effect`, `signal` | 7 |
| type | `ComputedOptions`, `Dispose`, `EffectFn`, `Read`, `Signal`, `SignalOptions`, `State`, `Write` | 8 |
| **Total** | | **15** |

Spec §1 mandates 14 (7 + 7); spec Deviation 8 explicitly authorizes the
addition of `ComputedOptions<T>`. All 15 symbols accounted for; nothing
extraneous.

**Encapsulation verification (`dist/index.js`):** the bottom-line export
list at L177:

```
export { $state, SignalCircularError, SignalError, batch, computed, effect, signal };
```

`Subscriber`, `setCurrentObserver`, `peekCurrentObserver`, `getBatchDepth`,
`enterBatch`, `exitBatch`, `drainBatch`, `RUNNING`, `DISPOSED`, `QUEUED`,
`STALE`, `MAX_BATCH_ITERATIONS` — none re-exported from index.ts. They
appear inside the bundled IIFE as module-private functions (Rolldown
hoisted everything into one file because `signals` is a single bundle), but
none are reachable through the public `import` statement. Inspecting
`dist/index.d.ts` confirms no `/** @internal */` symbol is in the type
exports either.

---

### Gate 4 — Size budget

**Command:** `bun run size`

**Result:** PASS — 629 B gz versus 1024 B budget. 395 B headroom (38%).

**Evidence:**

```
Package size is 395 B less than limit
Size limit: 1.02 kB
Size:       629 B   with all dependencies, minified and gzipped
```

Builder's manifest claim verified independently.

---

### Gate 5 — Biome

**Command:** `bunx biome ci .`

**Result:** PASS — `Checked 22 files in 40ms. No fixes applied.`

Phase 1's clean-Biome state is preserved. Zero regressions.

---

### Gate 6 — Spec line-by-line

See §3 (compliance matrix) below. Every binding line in spec §1 and §2 was
walked. All map to a code line that satisfies it. No gaps.

---

### Gate 7 — Property tests

**File:** `packages/signals/tests/properties.test.ts`

**Result:** PASS.

**Findings:**
- 4 `fc.assert` properties present (spec §4 mandates 3 in Task 11 + 1 batch
  property in Task 11.4 = 4 total). Confirmed at file:line:
  - L13–21: last-write-wins
  - L23–46: effect runs equal 1 + distinct consecutive writes
  - L48–72: batch collapse (= 1 init + 1 flush, accounting for first-write
    Object.is short-circuit)
  - L74–86: `computed = f(signal)` for any sequence of writes
- L10: `fc.configureGlobal({ numRuns: 50 })` set globally (Scout R-X2
  satisfied).
- All four properties are non-trivial:
  - L18 reads back `n()` and compares to `writes[writes.length - 1]` —
    actual round-trip assertion
  - L33–43 derives expected `runs` from the `writes` array via Object.is
    accounting — non-trivial expected value
  - L67–69 case-splits on whether any write differs from initial — handles
    the tricky all-zeros edge
  - L80–83 calls `setN(w); doubled() !== w * 2` per write — full reactive
    correctness
- L93–95 sanity test (`expect(typeof fc.assert).toBe('function')`) is the
  one trivial test, but it's clearly labeled "sanity" and is paired with
  the property-failure-throws contract — defensible.

---

### Gate 8 — Phase 1 do-not-break list (Scout §5)

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | `bunx biome ci .` green | PASS | Gate 5 above |
| 2 | `bun run test --coverage` green non-trivially | PASS | Gate 1 — 32 tests, was 0 in Phase 1 |
| 3 | Root `tsconfig.json` `include` unchanged or extended | PASS | `git diff main -- tsconfig.json` empty |
| 4 | Root `vitest.config.ts` aliases for 4 packages still resolve | PASS | `git diff main -- vitest.config.ts` empty; signals/arbor/runtime/agent aliases all retained at L17–20 |
| 5 | `.size-limit.json` only signals row at end of Phase 2 | PASS | File contains exactly one entry; `git diff main -- .size-limit.json` shows the four other rows removed |
| 6 | `.github/workflows/plan-a.yml` lines 23, 25, 26 uncommented | PASS | Diff shows `bun run typecheck`, `bun run build`, `bun run size` all uncommented; the explanatory comment block at L20–22 also dropped (Builder's call, allowed by spec §3.4) |
| 7 | No new root devDeps beyond Phase 1 + spec-authorized | PASS | `git diff main -- package.json` empty |
| 8 | `bun.lock` frozen-installable | PASS | Only addition is the `@aihu/signals` workspace pointer; no new external packages |

---

### Gate 9 — Out-of-spec change audit (Moon 2.x migration)

**Builder's claim:** Moon 2.x mandates `.moon/tasks/` as a directory; v1's
single `.moon/tasks.yml` no longer works. Also, Moon's default Windows
shell can't resolve `tsc` / `rolldown` from `node_modules/.bin` without a
`bunx` prefix.

**Verification:**

1. **Moon version:** `moon --version` → `moon 2.2.3`. Confirmed 2.x.

2. **Diff scope:** `git diff main -- .moon/` shows ONLY:
   - rename `.moon/tasks.yml` → `.moon/tasks/tasks.yml`
   - `command: "rolldown -c"` → `command: "bunx rolldown -c"`
   - `command: "tsc --noEmit"` → `command: "bunx tsc --noEmit"`

   No other config snuck in. Clean change.

3. **Empirical test of the directory claim:**

   I temporarily moved `.moon/tasks/` back to `.moon/tasks.yml` (single
   file, v1 location) and ran `moon run signals:typecheck`. Result:

   ```
   Error: project::unknown_task

     × Unknown task typecheck for project signals.
     help: Has this task been configured?
   ```

   With the directory restored, the same command exits 0. Builder's
   directory-location claim is **reproducible and correct**.

4. **bunx prefix:** I did not separately strip `bunx` to test the second
   half of the claim, but observationally Moon 2.x on Windows runs
   commands through `pwsh -NoProfile -NoLogo -Command ...` which does
   *not* prepend `node_modules/.bin` to PATH. `tsc` happens to be
   resolvable by Bun via package shim, but `rolldown` is local-only.
   Builder's reasoning is consistent with how Moon's default shell handler
   works on Windows. The spec-authorized alternative (e.g.
   `toolchain.node.bin: true` or a `~bin/...` shorthand) would also work
   but the `bunx` approach is one-token-per-line, doesn't require Moon
   toolchain config, and matches how `package.json` scripts already work.

**Verdict:** Builder's reasoning is sound. The change is correct and
necessary on this host, and the diff is minimal. **No flags. Confirm-
keep is appropriate.**

---

### Gate 10 — Cycle detection on Windows

**Method:** Direct `bun -e` script importing from
`packages/signals/src/index.ts` and triggering each cycle path:

```
Test 1 (effect cycle):    SignalCircularError - circular dependency detected
  is SignalCircularError: true
  is SignalError: true
Test 2 (batch overflow):  SignalCircularError - circular dependency detected
  is SignalCircularError: true
Test 3 (computed cycle):  SignalCircularError - circular dependency detected
  is SignalCircularError: true
```

All three paths throw the typed `SignalCircularError`, not a generic
`RangeError: Maximum call stack` or plain `Error`. The error subclass
chain is intact (`instanceof SignalError === true` for each). The default
message `'circular dependency detected'` per spec §1.6 / Decision 2 is
present.

The vitest in-suite tests at `effect.test.ts:75-84`, `computed.test.ts:49-65`,
and `batch.test.ts:111-132` cover the same paths through `expect(...).toThrow(SignalCircularError)`.

**Result:** PASS.

---

## 3. Spec compliance matrix

| # | Spec §  | Requirement | File:line | Status |
|---|---|---|---|---|
| 1 | §1.1 | `Read<T> = () => T` | `src/signal.ts:85` | PASS |
| 2 | §1.1 | `Write<T>` accepts value or updater fn | `src/signal.ts:86`; impl `signal.ts:111` | PASS |
| 3 | §1.1 | `Signal<T> = readonly [Read, Write]` | `src/signal.ts:87` | PASS |
| 4 | §1.1 | `SignalOptions.equals?: ((a,b)=>boolean) \| false` | `src/signal.ts:89-97` | PASS |
| 5 | §1.1 | `signal<T>(initial, options?): Signal<T>` | `src/signal.ts:99` | PASS |
| 6 | §1.1 | Default equality `Object.is` | `src/signal.ts:103` (`eq === undefined ? Object.is : eq`) | PASS |
| 7 | §1.1 | `equals: false` skips check | `src/signal.ts:112` (`equals !== false && ...`) | PASS |
| 8 | §1.1 | Updater form: `setN((p)=>...)` | `src/signal.ts:111` (`typeof next === 'function'`) | PASS — verified by `signal.test.ts:16-22` |
| 9 | §1.1 | `equals(a,b)===true` skips notify | `src/signal.ts:112` (early return) | PASS |
| 10 | §1.2 | `EffectFn = () => void` | `src/effect.ts:4` | PASS |
| 11 | §1.2 | `Dispose = () => void` | `src/effect.ts:5` | PASS |
| 12 | §1.2 | `effect(fn): Dispose` runs once at registration | `src/effect.ts:28` (`run()` at construction) | PASS — `effect.test.ts:7-13` |
| 13 | §1.2 | Sync re-run on dep change | `src/effect.ts:13` (`run()` from `notify()` outside batch) | PASS — `effect.test.ts:15-26` |
| 14 | §1.2 | `dispose()` idempotent | `src/effect.ts:30-32` (sets DISPOSED; subsequent calls noop) | PASS — `effect.test.ts:56-73` |
| 15 | §1.2 | Cycle (write to dep inside fn) throws synchronously | `src/effect.ts:12` (RUNNING check) | PASS — `effect.test.ts:75-84` |
| 16 | §1.3 | `ComputedOptions<T>.equals?` exists | `src/computed.ts:12-17` | PASS — Deviation 8 |
| 17 | §1.3 | `computed<T>(fn, options?): Read<T>` | `src/computed.ts:19` | PASS |
| 18 | §1.3 | Lazy: no run until first read | `src/computed.ts:23-24` (constructed STALE; eval gated by `node.flags & STALE` at L44) | PASS — `computed.test.ts:80-95` |
| 19 | §1.3 | Caches result; cached reads don't re-run | `src/computed.ts:38-56` (only re-runs when STALE; clears STALE at L52) | PASS — `computed.test.ts:14-31` |
| 20 | §1.3 | STALE flag cascades to subscribers | `src/computed.ts:31-34` (sets STALE then calls each sub.notify()) | PASS — `computed.test.ts:33-47` |
| 21 | §1.3 | Re-entry of `fn` throws `SignalCircularError` | `src/computed.ts:27, 40` | PASS — `computed.test.ts:49-65` |
| 22 | §1.4 | `State<T>.value` getter/setter | `src/state.ts:3-5, 9-16` | PASS |
| 23 | §1.4 | Delegates to underlying signal cell | `src/state.ts:8` (`signal(initial)`); getter calls `read()`, setter calls `write()` | PASS — `state.test.ts:21-37` |
| 24 | §1.4 | Same equality semantics | inherited from `signal()` (no override) | PASS — `state.test.ts:39-53` |
| 25 | §1.5 | `batch(fn): void` | `src/batch.ts:16` | PASS |
| 26 | §1.5 | Defers + dedups subscriber notifies inside fn | `src/signal.ts:115-118` (`if batchDepth > 0` enqueue), `src/signal.ts:80-82` (QUEUED dedup) | PASS — `batch.test.ts:23-36` |
| 27 | §1.5 | Nested batches flush only at outermost | `src/batch.ts:21-30` (`if getBatchDepth() === 1`) | PASS — `batch.test.ts:62-81` |
| 28 | §1.5 | Effect-writes-during-flush extend the batch | drain loop at `src/signal.ts:63-76` keeps reading from `batchQueue` until empty; sub.notify() inside drain enqueues via the same path; QUEUED cleared on dequeue | PASS — `batch.test.ts:83-109` |
| 29 | §1.5 | 100-iteration cap throws `SignalCircularError` | `src/signal.ts:66-71` (`if (++iterations > MAX_BATCH_ITERATIONS) throw`) | PASS — `batch.test.ts:111-132` |
| 30 | §1.6 | `SignalError extends Error` | `src/errors.ts:1-3` | PASS |
| 31 | §1.6 | `chain` field REMOVED | `src/errors.ts:1-13` (no `chain` declaration) | PASS |
| 32 | §1.6 | Comment line per spec verbatim | `src/errors.ts:8-9` matches spec §1.6 wording | PASS |
| 33 | §1.6 | `SignalCircularError` extends `SignalError` | `src/errors.ts:5-13` | PASS |
| 34 | §1.6 | Default message `'circular dependency detected'` | `src/errors.ts:10` | PASS |
| 35 | §2.1 | `Subscriber` `/** @internal */`, not re-exported | `src/signal.ts:10-15`; `src/index.ts` does not list `Subscriber` | PASS |
| 36 | §2.1 | `flags: number` packed bitfield with bits 0x1/0x2/0x4/0x8 | `src/signal.ts:14, 17-20` (RUNNING=0x1, DISPOSED=0x2, QUEUED=0x4, STALE=0x8) | PASS |
| 37 | §2.5 | `setCurrentObserver`, `peekCurrentObserver` `/** @internal */`, not re-exported | `src/signal.ts:25-35`; not in `index.ts` | PASS |
| 38 | §3.1 | `moon.yml` uses `layer: library` | `packages/signals/moon.yml:3` | PASS |
| 39 | §3.2 | `tsconfig.base.json` adds `allowImportingTsExtensions: true` after `verbatimModuleSyntax` | `tsconfig.base.json:20-21` | PASS |
| 40 | §3.3 | `.size-limit.json` ends Phase 2 with only signals row, hard limit `1024 B` gz | `.size-limit.json:1-8` | PASS |
| 41 | §3.4 | CI workflow lines 23, 25, 26 uncommented | `.github/workflows/plan-a.yml:20, 22, 23` (renumbered after Builder dropped the comment block) | PASS |
| 42 | §4 Task 11.4 | New `batch.test.ts` with 6 unit tests | `tests/batch.test.ts:7-133` | PASS |
| 43 | §4 Task 11.4 | +1 batch property in `properties.test.ts` | `tests/properties.test.ts:48-72` | PASS |
| 44 | §4 Task 11 | `numRuns: 50` set | `tests/properties.test.ts:10` | PASS |
| 45 | §5 final index.ts | Re-exports per spec | `src/index.ts:1-10` matches spec §5 verbatim | PASS |

**45 / 45 rows checked, all PASS.**

---

## 4. Findings

### Finding 1 — `computed.ts` branch coverage 78.57% (LOW)

**Severity:** LOW.

**Reproduction:** `bun run test --coverage`; output shows `computed.ts | 100
| 78.57 | 100 | 100 | 26,30,40`.

**File:line:** `packages/signals/src/computed.ts:26, 30, 40`.

**Spec citation:** Not applicable — spec §4 sets no coverage threshold. The
do-not-break list (Scout §5) doesn't pin coverage either.

**Detail:** Three defensive guards uncovered:
- L26: `if (node.flags & DISPOSED) return` — there is no public dispose for
  computed in v0
- L30: `if (node.flags & STALE) return` — cascade-suppression for repeated
  notifies; reachable but not specifically tested
- L40: `if (node.flags & RUNNING) throw new SignalCircularError()` on read
  path — exercised indirectly by the cycle test (which goes via `notify()`)
  but not by a direct read-while-running

Builder flagged this in `build-manifest.md` §4 note 2. None block ship.
A coverage-completeness PR would add ~3 tests to hit each branch directly,
but is a polish item, not a defect.

### Finding 2 — Sanity test in `properties.test.ts` is trivial (LOW)

**Severity:** LOW.

**Reproduction:** Read `properties.test.ts:92-96`.

**File:line:** `packages/signals/tests/properties.test.ts:93-95`.

**Detail:** The "sanity" test (`expect(typeof fc.assert).toBe('function')`)
is a tautology. Builder explicitly labels it sanity. It's harmless; spec §4
neither mandates nor forbids it. The test count of 5 in
`properties.test.ts` (4 fast-check + 1 sanity) exceeds the spec minimum of
4 — extra is allowed.

### Finding 3 — `ComputedOptions<T>.equals` accepted but unused at runtime (LOW)

**Severity:** LOW (informational; spec authorizes the type-only addition).

**Reproduction:** Read `packages/signals/src/computed.ts:13-17, 19`.

**File:line:** `packages/signals/src/computed.ts:19` —
`function computed<T>(fn: () => T, _options?: ComputedOptions<T>): Read<T>`.
The leading underscore on `_options` and the comment at L13-15 ("reserved
for a future cascade-suppression optimization … v0 does not use it to
short-circuit downstream notifications") confirm the field is type-only,
not runtime-active.

**Spec citation:** Spec §1.3 says: *"The `equals` option determines whether
*cascade* fires when the recomputed value is equal to the previous cached
value — default `Object.is` suppresses needless downstream re-runs."*

**Detail:** Spec §1.3 explicitly describes runtime behavior for
`ComputedOptions.equals`. The Builder ships it as type-only with a comment
that defers the runtime semantics. **This is a partial divergence from
spec §1.3's prose**, but Deviation 8 (in the spec's own §6 list) authorizes
the type's existence "for API symmetry" — the spec is internally
inconsistent here: §1.3 prose says equals suppresses cascade, while
Deviation 8 says it's accepted "for API symmetry … ~20 B gz". Either
reading supports calling this LOW: a future runtime hookup is mechanical
and non-breaking, none of the v0 tests rely on cascade suppression, and
the comment in computed.ts:13-15 makes the intent explicit. Verifier flags
for Architect awareness; recommend not blocking ship.

### Finding 4 — CI not yet exercised on a real PR (informational, not a defect)

**Severity:** LOW (out of Verifier's control; called out per protocol "if
a gate genuinely cannot be checked, say so").

**Detail:** `.github/workflows/plan-a.yml:2-5` triggers on
`push: [main]` and `pull_request: [main]` only. Pushes to
`plan-a-phase-2` do not trigger CI. CI will only run when this branch
opens a PR to `main`. The Builder's local pre-flight run of every gate
that CI would run (typecheck/test --coverage/build/size/biome) all pass
on Windows; CI on `ubuntu-latest` should also pass barring an
environment-specific surprise (the most plausible: line-ending churn from
the `core.autocrlf` artifact Builder mentions in manifest note 4 — which
Builder normalized via `biome check --write`). Not a defect; just an
observation that the green state is verified locally, not yet on the
GitHub action runner.

### Finding 5 — Effect-writes-during-flush re-entry test is borderline (LOW)

**Severity:** LOW (test passes; this is a quality observation).

**Reproduction:** Read `batch.test.ts:83-109`.

**File:line:** `packages/signals/tests/batch.test.ts:83-109`.

**Detail:** The test asserts `bRuns === 2` after a batch that drives effect
A's `setY(xv * 2)` chain. The mechanism is: batch sets `x=1, x=2, x=3`;
flush dequeues A, A re-runs and reads `x()=3`, A writes `y=6`, the y-write
during drain enqueues B, drain continues, B runs once. Total bRuns = 1
init + 1 flush = 2. This is what the spec §1.5 (3) prescribes — single
flush, A and B each run once, A's writes-during-flush extend the same
queue. **Verified passing.** The borderline aspect: the test does not
*explicitly* assert that A ran exactly once during flush (only B's runs
are counted); A's run-count being correct is implicit in `y() === 6`
(which would be 0, 2, or 6 depending on how many times A ran with
intermediate x values). A future improvement would count A explicitly
with a `let aRuns = 0`, but the assertion as written is sufficient.

---

## 5. Recommendation

**Ship as-is.** The build is internally consistent with spec §1–§6, the size
budget has comfortable headroom (38%), the do-not-break list survives, the
out-of-spec Moon 2.x migration is empirically necessary on Windows hosts and
its diff is minimal/clean, and cycle detection produces the typed error in
all three exercised paths. The five findings are all LOW severity — none
are blocking, and four of them are quality/polish observations rather than
defects. Coverage at 95% branch is excellent for a 6-file package with a
2-week-old API surface; the three uncovered `computed.ts` defensive
branches are a known Builder-flagged note rather than an oversight.

The Builder's claim of "zero substantive deviations" in the manifest is
accurate. The Moon 2.x migration is the only out-of-spec change, the Team
Lead has already decided to keep it, and this audit confirms the change is
correct and necessary.

Recommend opening the PR `plan-a-phase-2 → main` so CI runs the same gates
on Ubuntu and the Phase 2 work lands.

---

## 6. Re-audit (follow-up commits 8d535a8 + cada859)

**Re-verifier:** Verifier (code) **Date:** 2026-04-26 **Time spent:** ~15 min
**HEAD:** `b655ea7` on `plan-a-phase-2`. Builder added three commits since the
original audit: `8d535a8` (equals wiring), `cada859` (README), `b655ea7`
(manifest update).

### Re-verdict — PASS

All six gates re-run on the new HEAD are green. The four LOW findings from §4
remain factually accurate but **Finding 3 is now resolved** (computed.ts
`equals` is no longer type-only — the comment that flagged it is gone, the
runtime path is wired, and four new tests prove §1.3 prose). No new findings
of any severity. Recommend opening the PR.

### Gate results delta from §2

| Gate | §2 result | Re-audit result | Delta |
|---|---|---|---|
| 1 — Test suite | 32/32, 95.08% branch | **36/36, 95.71% branch** | +4 tests, +0.63 pts |
| 1 — `computed.ts` branch | 78.57% (3 uncovered: L26, L30, L40) | **87.5% (3 uncovered: L48, L52, L73)** | +8.93 pts |
| 2 — Typecheck | PASS (cached) | PASS (cached, `151e4ad2`) | unchanged |
| 3 — Build | PASS (cached) | PASS (cached, `77156aca`); `dist/index.js` 4.79 kB (was 4.43 kB), `dist/index.d.ts` 2.65 kB (was 2.20 kB) | +360 B raw js |
| 4 — Size budget | 629 B gz (38% headroom) | **698 B gz** (32% headroom; 326 B under limit) | +69 B, matches builder claim |
| 5 — Biome | PASS (22 files, 40 ms) | PASS (22 files, 58 ms) | unchanged |

The +69 B gz is reasonable for the new code path: equals resolver, `prev`/`next`
diff, recompute lambda hoisted, and the lazy/eager branch in `notify`.
Headroom remains comfortable for Phase 3.

### Spec compliance matrix delta

Rows that flip relative to §3:
- **Row 16** (`ComputedOptions<T>.equals` exists) — still PASS; the existing
  type at `src/computed.ts:23` is unchanged in shape.
- **Row 18** (lazy: no run until first read) — still PASS; `src/computed.ts:46`
  constructed STALE; `read()` at L77 still gates eval on `!hasCached || STALE`,
  preserved by the new `subs.size === 0 → return` branch at L55. The
  "chained computeds stay lazy" test at `computed.test.ts:67-95` re-runs and
  passes. The `subs` set is empty for both inner and outer in that test
  (no observer subscribed), so `notify()` short-circuits at L55 and never
  recomputes eagerly.
- **Row 19** (caches result) — still PASS; recompute consolidated into the
  `recompute()` lambda at L33-43, called from both `notify` (eager when
  subs) and `read` (lazy fallback). Same flag bookkeeping.
- **Row 20** (STALE cascades to subs) — **semantics changed but spec still
  satisfied**. Old impl always cascaded on dep change; new impl cascades only
  when the recomputed value differs under `equals`. Spec §1.3 explicitly
  describes this as the contract ("`equals` … suppresses needless downstream
  re-runs"). `computed.test.ts:33-47` (the original "triggers downstream
  effects through computed" test) still passes because `n() * 2` produces a
  different value on every write.

New rows added to the matrix:

| # | Spec § | Requirement | File:line | Status |
|---|---|---|---|---|
| 46 | §1.3 | `ComputedOptions.equals` runtime-active: equal recompute suppresses cascade | `src/computed.ts:64` (`if (equals !== false && equals(prev, next)) return`) | PASS — `computed.test.ts:97-115` |
| 47 | §1.3 | Default `Object.is` when omitted | `src/computed.ts:31` | PASS — same test |
| 48 | §1.3 | `equals: false` always cascades | `src/computed.ts:64` (left side of `&&`) | PASS — `computed.test.ts:140-155` |
| 49 | §1.3 | Custom comparator is invoked with `(prev, next)` | `src/computed.ts:64` | PASS — `computed.test.ts:157-176` |
| 50 | §6 Deviation 8 | Rationale updated to reflect runtime activity | `.team/phase-2/spec-signals.md:584` | PASS |
| 51 | DX §5 | README at `packages/signals/README.md` with hello/computed/batch/$state samples + cross-library cheat sheet | `packages/signals/README.md:1-80` | PASS |

**51 / 51 rows checked, all PASS** (was 45 / 45).

### The Builder's design pivot (eager recompute when subs exist)

**Was the pivot necessary?** **Yes.** Team Lead's Option X ("set self STALE
on notify; cascade on next read") doesn't work in this forward-subscription
model: `computed.notify()` propagates only by calling `sub.notify()` on each
forward subscriber — there is no separate "I am stale, please ask me again
later" channel. If the cascade is suppressed, the downstream effect never
schedules and never reads again. Builder's pivot to recompute eagerly *only
when subs exist* is the minimal change that wires §1.3 prose to actual
behavior without breaking laziness.

**Is the pivot correct?** **Yes**, traced four scenarios:

1. **Lazy preservation** (`signal → c1 → c2`, neither read): both have
   `subs.size === 0`; `notify()` early-returns at L55. No work. The 5
   pre-existing computed tests still pass.

2. **Linear chain with effect** (`signal → c1 → c2 → effect`): on write,
   c1.notify recomputes c1 and propagates IFF c1's value changed; c2.notify
   recomputes c2 and propagates IFF c2's value changed; effect re-runs IFF c2
   changed. Each computed body runs exactly once per write — same as the lazy
   impl. **No regression.**

3. **Cycle interaction** (`computed.ts:33-43` recompute clears RUNNING in
   `finally` BEFORE the `for (const sub of subs)` loop at L65 fires). When
   c2.notify runs from inside c1's notify cascade, c1's RUNNING flag is
   already cleared, so c2.fn reading c1() does NOT throw a false-positive
   `SignalCircularError`. The existing indirect-cycle test
   (`computed.test.ts:49-65`) still passes.

4. **Diamond glitch potential** (`signal → c1 → c2 → effect`,
   `signal → c3 → c2`): when signal write notifies c1 first, c2 recomputes
   from `(new c1, OLD c3)` — a partial view. The effect runs once with this
   partial view. Then signal continues iterating subs and notifies c3, which
   propagates to c2 again, which recomputes from `(new c1, new c3)`. If the
   final value differs from the partial, cascade fires and effect re-runs;
   if the final equals the partial, no cascade and effect's last observed
   value is already correct. **Eventually consistent — same correctness
   guarantee Preact gives in synchronous mode.** Users who care about glitch-
   free updates should wrap writes in `batch(...)`, which already serializes
   the diamond correctly via the `QUEUED` dedup at `signal.ts:80-83`.

**Concern for Phase 3 (arbor):** **One mild concern**, no blocker. Eager
recompute on `notify()` means the body of every subscribed computed runs
synchronously inside the signal write call frame, even if the recomputed
value is equal and the cascade would have been suppressed. For pathological
fan-out (one signal feeding 1000 cheap computeds, each subscribed by an
effect), the equal-recompute cost is paid even when the result is
suppressed. Lazy behavior would defer that cost to a read that never
happens. This is unlikely to bite arbor in v0 — its computed graphs are
shallow (one or two layers deep, dozens of nodes per route) — but it's worth
noting in `arbor`'s perf log when wide fan-outs do appear.

A second observation: the `notify()` path at L52 still returns when the node
is already STALE, so multiple writes inside the same synchronous tick (no
batch) won't re-recompute c1 N times — the second write fires c1.notify but
hits the STALE check at L52 and returns *without recomputing*. Good. (There
is a subtle interplay here: the first notify already recomputed and cleared
STALE; only if a *subsequent* write arrives will STALE be set again, which
re-enables a fresh recompute. This is correct.)

### README audit (commit cada859)

`packages/signals/README.md`:1-80 reads cleanly. Verified:

- **Code samples accurate.** All imports (`signal`, `effect`, `computed`,
  `batch`, `$state`) resolve to actual `index.ts` exports at L1-10.
  `count.value++` (README L62) works against the `state.ts` getter+setter pair.
- **Cheat sheet correct.** `computed(fn) (lazy, call-shape)` accurately
  describes aihu's `Read<T>` shape (vs. Vue's `.value` and Preact's
  `.value`). Solid's `createMemo` is eager — accurate.
- **v0 limitations list correctly TRIMMED.** Per Team Lead's brief, the bullet
  about "computed does not yet short-circuit cascade" is gone (verified by
  re-reading L76-80). The two remaining bullets (cycle-chain context, no
  `untrack`/`peek`/`onCleanup`) are factually accurate against the dist
  surface — `dist/index.d.ts:68` exports neither.

### Final ship-readiness

**Open the PR.** The follow-up commits resolve Finding 3 cleanly with no
collateral damage. All gates are green, the dist surface is unchanged, the
size budget still has 32% headroom, and the eager-when-subs-exist design is
correct for the forward-subscription model. The DX Verifier's README request
is satisfied. The mild Phase 3 concern about wide fan-out is worth logging
in arbor's perf notes but is not a blocker.
