# Spec — `@aihu/signals` (Phase 2)

**Author:** Architect
**Date:** 2026-04-26
**Branch:** `plan-a-phase-2`
**Status:** Final — Builder may consume.

This spec is binding. Where it deviates from the plan, the plan is overridden under the Team Lead's Decision 2B authority. Where it deviates from the v0 spec, that is called out explicitly in §6 and the Team Lead's adjudication has already approved.

References:
- Spec: `docs/superpowers/specs/2026-04-23-aihu-v0-vertical-slice-design.md` (`spec` below)
- Plan: `docs/superpowers/plans/2026-04-24-aihu-v0-plan-a-ts-runtime.md` (`plan` below)
- Scout: `.team/phase-2/scout-report.md` (`scout` below)

---

## 1. Public API surface

End-of-Phase-2 exports from `@aihu/signals` (re-exported through `packages/signals/src/index.ts`):

| Kind | Symbol |
|---|---|
| value | `signal`, `effect`, `computed`, `$state`, `batch` |
| error class | `SignalError`, `SignalCircularError` |
| type | `Read<T>`, `Write<T>`, `Signal<T>`, `SignalOptions<T>`, `EffectFn`, `Dispose`, `State<T>` |

**7 value exports, 7 type-only exports = 14 total.** No other exports (`Subscriber`, `setCurrentObserver`, `peekCurrentObserver` are `/** @internal */` and stay un-re-exported from `index.ts`; see §2 and R-A3).

Equality default for every primitive: `Object.is`. Plan §537 picks `Object.is`; Scout §2.3-1 flags it as a spec-level decision needing confirmation. **Confirmed: `Object.is`.** Rationale: matches Vue 3 (`@vue/reactivity`) and Preact signals — the two ecosystems we're most likely to interop with. Differs from Solid (`===`) but Solid's `===` mistakenly notifies on `NaN→NaN`, which we don't want. The cost is one spec line.

---

### 1.1 `signal<T>`

```ts
export type Read<T> = () => T
export type Write<T> = (next: T | ((prev: T) => T)) => void
export type Signal<T> = readonly [Read<T>, Write<T>]

export interface SignalOptions<T> {
  /**
   * Equality comparator applied to writes.
   * - Omitted → default `Object.is`.
   * - `false` → never short-circuit; every write notifies.
   * - Function → custom comparator; `true` means "equal, skip".
   */
  equals?: ((a: T, b: T) => boolean) | false
}

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>
```

**Semantics.** `signal(init)` returns a `[read, write]` tuple. `read()` is reactive: when called inside an effect or computed body, the calling computation is registered as a subscriber. `write(next)` accepts a value or an updater `(prev) => next`. If `equals(prev, next)` returns `true`, the write is a no-op (no value mutation, no subscriber notification). When `options.equals === false`, every write notifies. When `options.equals` is a function, that function decides — `true` skips, `false` notifies. Writes outside `batch()` flush subscribers synchronously; writes inside `batch()` defer subscriber flush until the outermost `batch` returns (see §1.5).

**Example.**
```ts
import { signal } from '@aihu/signals'

const [count, setCount] = signal(0)
console.log(count())        // 0
setCount(1)                 // notifies subscribers
setCount((n) => n + 10)     // updater form; reads prev = 1
console.log(count())        // 11
setCount(11)                // Object.is short-circuit — no notification
```

**Cross-library mapping.** Solid: `createSignal(0)` (same shape, different equality default). Preact: `signal(0)` (object with `.value`). Vue: `ref(0)` (object with `.value`). alien-signals: `signal(0)` (single function).

---

### 1.2 `effect`

```ts
export type EffectFn = () => void
export type Dispose = () => void

export function effect(fn: EffectFn): Dispose
```

**Semantics.** `effect(fn)` runs `fn` synchronously once at registration, capturing every signal/computed read during that run as a dependency. On any subsequent dep change (outside `batch()`), `fn` is re-run synchronously. Inside `batch()`, the re-run is deferred to the end of the outermost batch and deduplicated by effect identity (see §2 lifecycle). The returned `Dispose` is idempotent: calling it once detaches the effect from all deps; subsequent calls are no-ops. After dispose, no further re-runs occur, even if the effect was queued in an in-flight batch (queued effects check the `disposed` flag at flush time). If `fn` writes to a signal it depends on, `SignalCircularError` throws synchronously from the writer's call stack (see §2 cycle detection).

**Example.**
```ts
import { signal, effect } from '@aihu/signals'

const [count, setCount] = signal(0)
const dispose = effect(() => {
  console.log('count is', count())   // logs 0 immediately, then 1, 2 on writes
})
setCount(1)
setCount(2)
dispose()
setCount(3)                          // no log — effect detached
```

**Cross-library mapping.** Solid: `createEffect` (but Solid defers to a microtask; we run sync, like Preact). Preact: `effect(fn)` returns dispose. Vue: `watchEffect(fn)` returns `WatchHandle` with `.stop()` (we don't ship the alias — see Decision 3). S.js: `S(() => …)` inside `S.root`.

---

### 1.3 `computed<T>`

```ts
export interface ComputedOptions<T> {
  equals?: ((a: T, b: T) => boolean) | false
}

export function computed<T>(fn: () => T, options?: ComputedOptions<T>): Read<T>
```

**Semantics.** `computed(fn)` returns a `Read<T>`. The body is **lazy**: it does not run until the returned reader is called. The first read evaluates `fn`, caches the result, and registers each signal/computed read by `fn` as a dep. Subsequent reads return the cached value without re-running. When any dep changes, the computed marks itself stale and cascades that staleness to its own subscribers (so a downstream effect that read the computed will re-run on next flush). The next read after staleness re-runs `fn`. Re-entry of `fn` on itself (writing through a chain that comes back to a dep `fn` reads) throws `SignalCircularError` synchronously. The `equals` option determines whether *cascade* fires when the recomputed value is equal to the previous cached value — default `Object.is` suppresses needless downstream re-runs.

**State-machine flag set governing "needs recompute":** a single boolean `stale` per node. `stale=true` after construction (forces first run on first read) and after any dep notifies. `stale=false` after a successful eval. There is no separate `Dirty`/`Pending` distinction in v0 — alien-signals' richer state machine lands when subscriptions are introduced (post-arbor). Adding `Pending` now would cost ~30 B gz with no semantic gain at our v0 dep depth.

**Example.**
```ts
import { signal, computed, effect } from '@aihu/signals'

const [n, setN] = signal(2)
const doubled = computed(() => n() * 2)

effect(() => console.log('doubled =', doubled()))
// → logs "doubled = 4"

setN(3)   // → logs "doubled = 6" (effect re-runs, pulls fresh value)
doubled() // → 6 (cached, no recompute)
```

**Cross-library mapping.** Solid: `createMemo` (eager, not lazy — semantic difference). Preact: `computed(fn)` (also lazy). Vue: `computed(fn)` returns `ComputedRef` with `.value`. S.js: `S(() => …)` (eager).

---

### 1.4 `$state<T>`

```ts
export interface State<T> {
  value: T
}

export function $state<T>(initial: T): State<T>
```

**Semantics.** `$state(init)` returns a small object with a `.value` getter/setter that delegates to a single underlying `signal` cell — same tracking, same equality, same notify path. **The cell is shared, not duplicated** (plan §1294-1304 — confirmed). Two `$state` calls on the same value produce two independent cells; there is no public API in v0 to merge two `$state` accessors onto one cell, and `$state` cannot be converted back to a `[get, set]` tuple. This is intentional: the SFC compiler will mechanically rewrite runes-style writes to `.value` access — the runtime helper just exists so handwritten test fixtures can use the same shape before the compiler ships.

**Example.**
```ts
import { $state, effect } from '@aihu/signals'

const count = $state(0)
effect(() => console.log('count =', count.value))
// → logs "count = 0"

count.value = 5    // → logs "count = 5"
count.value = 5    // Object.is short-circuit — no log
```

**Cross-library mapping.** Vue: `ref(0)` returns the same `.value` shape. Svelte 5: `$state(0)` (compiler-only — Aihu's compiler will follow). Preact: `signal(0)` (object with `.value`). Solid: no direct equivalent.

---

### 1.5 `batch`

> **Newly authorized in Phase 2 by Team Lead Decision 1.** Overrides plan §542 ("no batching API in Phase 2"). Rationale on file: arbor (Phase 3) needs batching on day one; punting forces arbor to recreate it less efficiently than the signals layer can. Preact's batch costs ~80–120 B gz of its 1.5 KB total; our budget tolerates it.

```ts
export function batch(fn: () => void): void
```

**Semantics.** Within `fn`, every `signal` write defers subscriber notification: instead of calling `notify()` synchronously, the affected subscribers are inserted into a module-level queue (deduplicated by identity). When the outermost `batch` call's `fn` returns, the queue is drained: each queued subscriber's `notify()` (and therefore `run()` for effects, cascade for computeds) fires once, in insertion order. Nested `batch(() => batch(...))` calls flush only at the outermost return. If `fn` throws, the queue is drained anyway (analogous to Preact: errors propagate after flush so partial state doesn't leak invalid invariants into deferred effects). `batch` returns `void`; if you need a value out of the closure, capture it in a closed-over variable.

**Effect ordering inside a batch:**
1. Effects fire in the order they were *queued* (i.e. the order their first relevant signal write occurred during `fn`).
2. Each effect runs at most once per batch flush, regardless of how many of its deps were written.
3. **An effect that writes inside a batch extends the same batch.** That is: when an enqueued effect runs during flush and itself writes to signals, those writes append to the *same* queue and continue the drain loop. This collapses cascade chains into a single flush. We bound the loop at 100 iterations; on overflow, throw `SignalCircularError` (the cycle is real but indirect, and 100 is generous — Preact uses 100, Vue uses 100).
4. Effect A writing during flush to a signal that Effect B depends on causes B to re-enter the queue and run again before flush returns. Last-value-wins for B.

**Example.**
```ts
import { signal, effect, batch } from '@aihu/signals'

const [a, setA] = signal(0)
const [b, setB] = signal(0)
let runs = 0
effect(() => { a(); b(); runs++ })  // runs once at registration

batch(() => {
  setA(1)
  setB(2)
  setA(3)
})
// effect ran exactly 1 more time after batch — runs === 2
```

**Cross-library mapping.** Preact: `batch(fn)` — exact same shape. Solid: `batch(fn)` (returns the inner value; we don't, by choice — keeps the signature 5 B smaller and matches Preact). Vue: not directly exposed; Vue uses scheduler flush phases. S.js: implicit per-tick.

---

### 1.6 `SignalError`, `SignalCircularError`

```ts
export class SignalError extends Error {
  override name = 'SignalError'
}

// chain field is REMOVED (Decision 2 — Team Lead). Builder MUST add the
// comment line below verbatim so the rationale doesn't get lost.
export class SignalCircularError extends SignalError {
  override name = 'SignalCircularError'

  // Richer cycle context (e.g. ordered chain of computation labels) lands
  // when devtools land. v0 ships only the bare error. See spec-signals.md §6.
  constructor(message: string = 'circular dependency detected') {
    super(message)
  }
}
```

**Semantics.** `SignalError` is the base class for any signal-system error. `SignalCircularError` is thrown synchronously from a `signal.write` call site (or a `computed` read that re-enters itself) when re-entry is detected. The error carries no chain in v0 (per Decision 2). Custom error subclasses are out of scope until devtools.

**Cross-library mapping.** Preact throws plain `Error('Cycle detected')`. Solid throws `Error('Cyclic dependency detected')`. Vue silently swallows (we don't follow Vue here — spec §10.2 is binding).

---

## 2. Internal architecture

**Module-level state** lives in `packages/signals/src/signal.ts` and is shared across `effect`, `computed`, `state`, `batch`. Five mutable bindings:

```ts
/** @internal */ let currentObserver: Subscriber | null = null
/** @internal */ let batchDepth = 0
/** @internal */ let batchQueue: Subscriber[] = []   // insertion-ordered, dedup via Set on enqueue
/** @internal */ let batchSeen: Set<Subscriber> | null = null
/** @internal */ const MAX_BATCH_ITERATIONS = 100
```

Every reader of these is internal to the package; nothing is re-exported from `index.ts`. Per Scout R-A3, the helpers `setCurrentObserver`, `peekCurrentObserver`, and the new `enqueueOrNotify` and `runBatch` are all marked `/** @internal */`. The Builder MUST NOT add them to the `index.ts` export list.

### 2.1 `Subscriber` interface

```ts
/** @internal */
export interface Subscriber {
  notify(): void
  /** @internal — set by effect/computed; used by batch dedup and disposal. */
  flags: number
}
```

Flag bits (all internal):

| Bit | Meaning |
|---|---|
| `0x1` RUNNING | The subscriber's body is currently executing. Re-entry while set throws `SignalCircularError`. |
| `0x2` DISPOSED | The subscriber has been disposed; `notify()` becomes a no-op. |
| `0x4` QUEUED | The subscriber is currently in `batchQueue`; further writes during a batch don't re-enqueue. |
| `0x8` STALE | (computed only) Body needs to re-run on next read. |

A 4-bit field suffices. We use a single `flags: number` rather than four booleans to save ~30 B gz across `Effect` and `ComputedNode` literals.

### 2.2 Computation-node lifecycle

**Effect node:**
1. Construct → `flags = 0`. Body runs immediately under `setCurrentObserver(node)`. During run: `flags |= RUNNING`. On exit: `flags &= ~RUNNING`.
2. On `notify()`: if `flags & DISPOSED` → return. If `flags & RUNNING` → throw `SignalCircularError`. Else if `batchDepth > 0` and not `flags & QUEUED` → enqueue, set `flags |= QUEUED`. Else → run.
3. On flush: clear `flags & QUEUED`, check `flags & DISPOSED`, if not disposed → run.
4. On `dispose()`: set `flags |= DISPOSED`. The subscriber stays in any signal's `subs` set until that signal next iterates — a future GC pass would reclaim, but in v0 we let the dead subscriber sit (saves bytes; effect lifetime is tied to mount scope which discards everything together).

**Computed node:** same flag mechanics, plus `STALE`. The `notify()` path for a computed sets `flags |= STALE` and cascades by calling each downstream subscriber's `notify()` — that cascade respects batching the same way effects do (downstream effects enqueue rather than fire).

### 2.3 How `batch()` defers effect execution

```
batch(fn):
  batchDepth++
  if batchDepth === 1: batchSeen = new Set()
  try:
    fn()
    if batchDepth === 1: drain()
  finally:
    batchDepth--
    if batchDepth === 0: batchSeen = null

drain():
  let iterations = 0
  while batchQueue.length > 0:
    if ++iterations > MAX_BATCH_ITERATIONS:
      batchQueue.length = 0
      throw new SignalCircularError()
    const sub = batchQueue.shift()
    sub.flags &= ~QUEUED
    if !(sub.flags & DISPOSED): sub.notify()  // notify synchronously now
```

Inside `signal.write`:

```
if value-is-equal: return
value = next
for sub of [...subs]:
  if batchDepth > 0 and !(sub.flags & QUEUED):
    sub.flags |= QUEUED
    batchQueue.push(sub)
  else if batchDepth === 0:
    sub.notify()
  // else: already queued, skip — dedup
```

Concretely answering the architect-question prompts:
- **Single batched write → one effect run.** Yes (queue has one entry, flush runs it once).
- **N writes to same signal → one effect run.** Yes, dedup via `QUEUED` flag.
- **N writes to N signals where one effect subs to all N → one effect run.** Yes, same dedup.
- **Effect A writes during flush to a signal Effect B depends on:** B's `notify()` runs during the still-active drain. B is currently running? Throw cycle. B already ran in this batch but not currently queued? Re-enqueue it, append to drain. Net effect: B can run multiple times *in pathological cases* but the total iterations are bounded by `MAX_BATCH_ITERATIONS`.
- **Nested `batch(() => batch(...))`** drains only at the outermost return.

### 2.4 Cycle detection

**Mechanism.** The `RUNNING` flag bit on each Subscriber. Set on entry to `run()`, cleared on exit. A `notify()` that finds `RUNNING` already set → synchronous `throw new SignalCircularError()` from the call site of the offending `write()` (or computed read).

**What gets thrown.** Per Decision 2: `SignalCircularError` with no chain payload. Message defaults to `'circular dependency detected'`. Stack trace points at the offending `write()` call.

**When devtools land** (post-v0), the chain field is reintroduced as an opt-in (population costs ~80 B gz of allocation per throw, plus the field itself). The comment in `errors.ts` (mandated in §1.6) signals this to future readers.

### 2.5 `setCurrentObserver` / `peekCurrentObserver`

Both `/** @internal */`. `setCurrentObserver(next)` swaps and returns the previous observer; callers always restore the previous in a `finally`. `peekCurrentObserver()` is a non-destructive read used by `computed`'s forward-subscription path (when something reads the computed, register that reader as a sub of the computed). Plan §1094-1104 introduced both; this spec keeps both but explicitly does not re-export them.

If arbor (Phase 3) needs `untrack(fn)`, it should be added to `signals` then as a public helper that wraps `setCurrentObserver(null)` — adding it now without a consumer wastes ~30 B gz.

---

## 3. Tooling fixes (mandatory, Task 6)

### 3.1 Moon 2.x fix (R-T1)

**Decision: replace `type: library` with `layer: library`.**

Rationale: `layer` is the v2 successor field for v1's `type`; `library` is one of seven accepted values and is the direct semantic port. Removing the field entirely loses the project-classification axis that `.moon/tasks.yml` (and any future task-inheritance config) may want to filter on. `stack:` is orthogonal (frontend vs backend) and not a substitute. One-line edit.

Apply to **two** places:
- `packages/signals/moon.yml` line 3: `type: library` → `layer: library`
- Plan §602 (the example snippet for Task 6 step 3): same swap, so future readers don't re-introduce the bug. Builder edits both during Task 6.

### 3.2 TS5097 fix (R-T2)

**Decision: add `"allowImportingTsExtensions": true` to `tsconfig.base.json`.**

Rationale: scout report and plan code samples both use explicit `.ts` extensions throughout (every test, every cross-module import). Stripping extensions means rewriting every import in src/ and tests/ across all four eventual packages, plus all plan code samples — many-file rewrite vs. one-line config change. Bun and Vitest both treat `.ts` extensions in source imports as canonical; matches our `moduleResolution: Bundler` setting. The compiler option is supported in TS 5.0+ and our pinned `typescript@5.6.x` accepts it.

Edit `tsconfig.base.json` to add **after** the `verbatimModuleSyntax: true` line:

```json
    "allowImportingTsExtensions": true
```

Builder applies this in Task 6 step 1.5 (a new sub-step inserted between "Create `package.json`" and "Create `tsconfig.json`").

### 3.3 `.size-limit.json` shape

**Confirmed: Phase 2 ends with the file containing only the `@aihu/signals` row** (per plan §657-672). The four other rows (`@aihu/arbor`, `@aihu/runtime`, `@aihu/agent`, "Combined runtime family") are added back in:
- Task 12 — add `@aihu/arbor` row
- Task 20 — add `@aihu/runtime` row
- Task 23 — add `@aihu/agent` row
- Task 25 — add the "Combined runtime family" aggregate row

Hard-gate value: **`limit: "1024 B"`** with `gzip: true`. Spec §6.6 says "~1.0 KB" (approximate); plan and `.size-limit.json` use the hard 1024 B value. Confirmed: the contract is **exactly 1024 bytes gzipped**, not "approximately 1 KB". This 24-byte cushion vs. 1000 covers (a) gzip-table jitter between bun versions and (b) one-line comment additions Builder may need to make.

### 3.4 CI re-enablement (Task 11.5 — new step)

Append a new step to Task 11 (call it Task 11.5) that uncomments the three lines in `.github/workflows/plan-a.yml`:

| Line | Before | After |
|---|---|---|
| 23 | `# - run: bun run typecheck` | `- run: bun run typecheck` |
| 25 | `# - run: bun run build` | `- run: bun run build` |
| 26 | `# - run: bun run size` | `- run: bun run size` |

Optional: also remove the now-stale 4-line comment block on lines 20-22 (it explained why those lines were commented; once they aren't, delete the comment). Builder's call.

Commit message: `ci(plan-a): re-enable typecheck/build/size after @aihu/signals lands`.

---

## 4. Test plan outline

For every task, the Builder writes tests **before** implementation (TDD). The Verifier confirms each list below is fully present and passing.

### Task 7 — `signal()`

Unit (5, all in `packages/signals/tests/signal.test.ts`):
1. Read returns initial value.
2. Setter mutates value.
3. Updater function form: `setN((prev) => prev + 1)`.
4. `Object.is` short-circuit on identical reference.
5. `equals: false` no-throw / no-crash on identical primitive (notification semantics tested in Task 8).

Plan §697-835 — confirmed unchanged.

### Task 8 — `effect()`

Unit (6 in `effect.test.ts`):
1. Runs once on registration.
2. Re-runs on tracked signal change.
3. Equality short-circuit suppresses re-run.
4. `equals: false` forces re-run on identical value.
5. `dispose()` stops further re-runs.
6. Multiple effects on one signal each fire.

Plan §871-1034 — confirmed unchanged. Plan also names this "fan-out"; same set.

### Task 9 — `computed()`

Unit (4 in `computed.test.ts`):
1. Returns derived value on read.
2. Re-derives only when dep changes (cached otherwise).
3. Triggers downstream effects through computed.
4. Chained computeds stay lazy (outer recomputes only on read after dep change).

Plan §1072-1226 — confirmed unchanged.

### Task 10 — `$state()`

Unit (4 in `state.test.ts`):
1. Reads initial value via `.value`.
2. Updates the cell when `.value` is assigned.
3. Tracks `.value` reads inside effects.
4. Equality short-circuits identical assignments.

Plan §1265-1362 — confirmed unchanged.

### Task 11 — cycle detection + properties + size

Unit (2 cycle tests, plan §1404-1493):
1. Direct self-write inside an effect throws `SignalCircularError`.
2. Indirect cycle through a computed throws `SignalCircularError`.

Property (3 in `properties.test.ts`, plan §1541-1599):
1. Last-write-wins: `n() === writes[writes.length - 1]`.
2. Effect runs equal `1 + distinct consecutive writes`.
3. Computed value equals `f(signal)` for any sequence of writes.

Set fast-check `numRuns: 50` on each (Scout R-X2: default 100 is slow on Windows CI). Add `import { fc } from 'fast-check'; fc.configureGlobal({ numRuns: 50 })` once at the top of the file.

Size: `bun run size` exits 0 with `dist/index.js` ≤ 1024 B gz.

### NEW Task 11.4 — `batch()` tests

Add **before** Task 11.5 (the CI re-enable). Files:
- Modify `packages/signals/src/signal.ts` (add batch internals; expose `batch` via index)
- Create `packages/signals/src/batch.ts` (the public entry point; thin)
- Modify `packages/signals/src/index.ts` (re-export `batch`)
- Create `packages/signals/tests/batch.test.ts`

Unit (6 in `batch.test.ts`):

| # | Test | Expected |
|---|---|---|
| 1 | Single batched write produces single effect run | `runs === 2` (1 init + 1 flush) |
| 2 | N batched writes to same signal → 1 effect run | `runs === 2` regardless of N |
| 3 | N batched writes to N signals (effect subs to all) → 1 effect run | `runs === 2` |
| 4 | Nested `batch(() => batch(...))` flushes once at outermost | `runs === 2` |
| 5 | Effect that writes inside flush extends the same batch | downstream effect runs once total, not per nested write |
| 6 | Pathological cycle (effect writes signal it depends on) inside batch → throws `SignalCircularError` | throws once flush iteration cap of 100 hits |

Property (1 in `properties.test.ts`):

```ts
it('batch(fn) collapses writes: total effect invocations = 1 + (was-batched ? 1 : N)', () => {
  fc.assert(
    fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 20 }), (writes) => {
      const [n, setN] = signal(0)
      let runs = 0
      effect(() => { n(); runs++ })
      batch(() => { for (const w of writes) setN(w) })
      return runs === 2  // 1 init + 1 batched flush
    }),
    { numRuns: 50 },
  )
})
```

Size: `batch.ts` is ~120 B raw / ~50–80 B gz. Total `dist/index.js` projection: ~600 B gz, comfortably under the 1024 B budget.

---

## 5. File-level change list

Builder uses this as a checklist. Group by task. **Bold = file does not yet exist.**

### Task 6 corrections (scaffold fixes)

| File | Action | Purpose |
|---|---|---|
| `tsconfig.base.json` | modify | Add `"allowImportingTsExtensions": true` (R-T2 fix) |
| `packages/signals/moon.yml` | modify | `type: library` → `layer: library` (R-T1 fix) |
| `packages/signals/src/errors.ts` | modify | Remove `chain` field; add comment per §1.6 (Decision 2) |
| `packages/signals/src/index.ts` | unchanged for now | Will be edited by every following task; current re-exports are correct |
| `.size-limit.json` | unchanged | Already trimmed in Phase 1; confirm only signals row present |

### Task 7

| File | Action | Purpose |
|---|---|---|
| `packages/signals/src/signal.ts` | **create** | Cell + `setCurrentObserver`/`peekCurrentObserver` + `Subscriber` (`/** @internal */`); equality default `Object.is`; reserve `flags` field on the Subscriber type for §2 |
| `packages/signals/tests/signal.test.ts` | **create** | 5 unit tests |
| `packages/signals/src/index.ts` | modify | Re-export `signal`, types `Read`/`Signal`/`SignalOptions`/`Write` |

### Task 8

| File | Action | Purpose |
|---|---|---|
| `packages/signals/src/effect.ts` | **create** | `Effect` node with `flags`; sync re-run on dep change; idempotent dispose |
| `packages/signals/tests/effect.test.ts` | **create** | 6 unit tests |
| `packages/signals/src/index.ts` | modify | Re-export `effect`, types `EffectFn`/`Dispose` |

### Task 9

| File | Action | Purpose |
|---|---|---|
| `packages/signals/src/computed.ts` | **create** | Lazy memo with `STALE` flag; cascade via subs Set |
| `packages/signals/tests/computed.test.ts` | **create** | 4 unit tests |
| `packages/signals/src/index.ts` | modify | Re-export `computed` |

### Task 10

| File | Action | Purpose |
|---|---|---|
| `packages/signals/src/state.ts` | **create** | `$state` accessor over `signal` cell |
| `packages/signals/tests/state.test.ts` | **create** | 4 unit tests |
| `packages/signals/src/index.ts` | modify | Re-export `$state`, type `State` |

### Task 11 (cycle + properties + size)

| File | Action | Purpose |
|---|---|---|
| `packages/signals/src/effect.ts` | modify | Add `RUNNING` flag check in `notify()`; throw `SignalCircularError` |
| `packages/signals/src/computed.ts` | modify | Same `RUNNING` guard; add `import { SignalCircularError }` |
| `packages/signals/tests/effect.test.ts` | modify | +1 cycle test |
| `packages/signals/tests/computed.test.ts` | modify | +1 cycle test |
| `packages/signals/tests/properties.test.ts` | **create** | 3 fast-check properties; `numRuns: 50` |

### Task 11.4 (NEW — `batch`)

| File | Action | Purpose |
|---|---|---|
| `packages/signals/src/signal.ts` | modify | Add `batchDepth`, `batchQueue`, `batchSeen` module state; switch `write()` to enqueue when `batchDepth > 0`; export `enqueueOrNotify` and `runBatch` as `/** @internal */` |
| `packages/signals/src/batch.ts` | **create** | Public `batch(fn)` calling internal helpers |
| `packages/signals/src/index.ts` | modify | Re-export `batch` |
| `packages/signals/tests/batch.test.ts` | **create** | 6 unit tests (per §4 Task 11.4) |
| `packages/signals/tests/properties.test.ts` | modify | +1 batch property |

### Task 11.5 (NEW — CI re-enable)

| File | Action | Purpose |
|---|---|---|
| `.github/workflows/plan-a.yml` | modify | Uncomment lines 23, 25, 26; optionally drop the now-stale 20-22 comment block |

### Final `index.ts` (end-of-Phase-2)

```ts
export { signal } from './signal.ts'
export type { Read, Signal, SignalOptions, Write } from './signal.ts'
export { effect } from './effect.ts'
export type { Dispose, EffectFn } from './effect.ts'
export { computed } from './computed.ts'
export type { ComputedOptions } from './computed.ts'
export { $state } from './state.ts'
export type { State } from './state.ts'
export { batch } from './batch.ts'
export { SignalError, SignalCircularError } from './errors.ts'
```

---

## 6. Deviations from the plan

| # | Deviation | Source | Rationale |
|---|---|---|---|
| 1 | `batch(fn)` ships in Phase 2 | Decision 1 (Team Lead) | arbor needs it on day one; Preact's batch is ~80–120 B gz; budget tolerates |
| 2 | `SignalCircularError.chain` removed | Decision 2 (Team Lead) | Plan implementation populated chain with single-element literals — half-built field. Comment in `errors.ts` records that richer cycle context lands with devtools. |
| 3 | No `watchEffect` alias | Decision 3 (Team Lead) | Vue compat is sub-project #11. Phase 2 ships only what arbor + the four runtime packages need. |
| 4 | `moon.yml` uses `layer: library` | Scout R-T1 | Moon 2.x rejects `type:` field |
| 5 | `tsconfig.base.json` adds `allowImportingTsExtensions: true` | Scout R-T2 | One-line fix vs. many-file rewrite |
| 6 | New Task 11.4 (batch tests) and Task 11.5 (CI re-enable) | This spec | Plan didn't cover batch (deferred) or the CI un-comment (implicit) |
| 7 | `Subscriber` carries a packed `flags: number` instead of separate booleans | Architect (Decision 2B) | Saves ~30 B gz across Effect and Computed node literals; tightens the size budget margin |
| 8 | `ComputedOptions<T>` exists with `equals` field | Architect (Decision 2B) | Wired through to runtime cascade-suppression — see §1.3 for behavior |
| 9 | `peekCurrentObserver`, `setCurrentObserver`, `Subscriber`, batch internals all `/** @internal */` and never re-exported from `index.ts` | Scout R-A3 | Encapsulation; no accidental cross-package coupling |
| 10 | fast-check property tests run with `numRuns: 50` (not default 100) | Scout R-X2 | Windows CI startup latency; 50 runs are sufficient signal at our shrink-tree depth |
| 11 | `batch` does not return the inner closure value (signature is `void`, not `<T>(fn: () => T): T`) | Architect (Decision 2B) | Saves ~5 B gz; matches Preact; closure capture is the idiomatic workaround |
| 12 | Effect that writes during a batch flush extends the same batch (rather than firing immediately or starting a new batch) | Architect (Decision 2B) | Matches Preact; collapses cascade chains; bounded by 100-iteration cap |

---

## 7. Open questions for the Team Lead

**None.** Every architectural decision in §1–§5 is locked. The two places where I exercised Decision 2B authority that the Team Lead might reasonably want to revisit are:

1. **Effect-writes-during-flush extend the batch** (Deviation 12). The alternatives are: (a) start a new sub-batch, or (b) defer writes until current flush finishes and run them in a new flush pass after. Preact's behavior is what I picked; if the Team Lead has a strong preference for option (b) — say, for simpler arbor reasoning — flag now. **My recommendation stands; ship as specified unless overridden.**

2. **`batch(fn): void` not `batch<T>(fn: () => T): T`** (Deviation 11). Trade-off: 5 bytes gz vs. ergonomic return value. Solid returns the value; Preact does not. Picked Preact. If `arbor` ends up wanting the return form during Phase 3, a non-breaking widening to the generic form is mechanical.

If the Team Lead doesn't push back on these within the Builder spawn window, the spec stands as written.
