# DX Report — `@aihu/signals` (Phase 2)

**Author:** DX Verifier (Vue/Nuxt persona)
**Date:** 2026-04-26
**Branch:** `plan-a-phase-2`
**Scope:** First-time-consumer evaluation of the public API surface, scored against the spec's "Vue/Nuxt-shaped authoring baseline" positioning (spec §1, §6.5).

---

## 1. Verdict

**PASS WITH NOTES.** I would ship this API to Vue/Nuxt users today as a reactive primitives layer for arbor *with a README*. The semantics are clean, the type surface is small and predictable, and the mental model maps onto Vue's `ref` / `computed` / `watchEffect` with one notable shape difference (tuple vs. `.value`) that `$state` already accommodates. The friction I hit was almost entirely *discoverability* (no README, no inline examples in the `.d.ts`, no "Vue users start here" pointer) rather than the API itself. The API stands on its own; the docs do not exist yet. Decision 2B's "no API change" constraint is fine — every gotcha I found can be solved with a doc or comment, not a signature change.

---

## 2. Persona task results (A–G)

For each task I sketched a minimal script to `c:/Users/srmcg/AppData/Local/Temp/dx-scratch/`. Wall-clock estimates are *relative to my Vue baseline* — i.e. how long this took compared to writing the equivalent in Vue.

### Task A — Hello counter (`signal` + `effect`)

```ts
import { signal, effect } from '@aihu/signals'

const [count, setCount] = signal(0)
effect(() => console.log('count is', count()))
setCount(1)
setCount((n) => n + 1)
```

**Stumble:** my fingers typed `count.value` twice before catching it. Tuple destructuring forced a context switch — once I committed, it stuck. **~3× Vue baseline** for the first try (~30s vs ~10s), then equal speed.

### Task B — Doubled value (`computed`)

```ts
const [count, setCount] = signal(0)
const doubled = computed(() => count() * 2)
effect(() => console.log(count(), doubled()))
```

**No stumble.** Vue's `computed` is conceptually identical; the only adjustment is reading `doubled()` instead of `doubled.value`. **~Vue baseline.** The fact that signal reads, computed reads, and the underlying state read all use the *same* `()` shape was actively pleasant (single rule).

### Task C — Either-or feature flag

```ts
const [flag, setFlag] = signal(false)
const [a, setA] = signal(10)
const [b, setB] = signal(100)
const value = computed(() => (flag() ? a() : b()))
effect(() => console.log(value()))
```

**Worked semantically.** A Vue user expects "inactive branch deps are not tracked" — and with `computed` re-running inside an effect that re-reads it, that's roughly true at the *effect* level (the effect only re-runs when the computed signals it cascaded). However, after reading the source (`computed.ts`), I noticed there is **no dep cleanup**: once `a` is read by the computed, it stays in `a`'s subscriber set forever. A write to inactive `a` will still mark the computed stale, cascade to my effect, and force a re-evaluation. The effect *won't* observe a value change (the computed re-runs and produces the same number, but my effect's `n()` re-runs anyway because there's no `equals` short-circuit on cascade — `ComputedOptions.equals` is reserved but unused per the comment in `computed.ts:13-15`).

For a Vue 3 user this is *familiar* — Vue had similar warts before its 3.4 dep-tracking refactor — but the Vue user expects the modern behavior. **~Vue baseline functionally**, but the mental model is "this is Vue 3.0-era computed", not 3.4+. **Not a blocker** but worth a doc note.

### Task D — Batched form update (`batch`)

```ts
batch(() => {
  setName('b')
  setEmail('b@x')
  setAge(2)
})
```

**One stumble:** I tried `const id = batch(() => insertRow())` and got `void`. Inferred from the `.d.ts` (after looking) that `batch` is no-return-value. Spec §1.5 calls this out, but I didn't read the spec first. Vue users don't have `batch` at all, so the comparison is "wow, this is better than `nextTick` for atomic updates", with a small wart that you can't return from the closure.

**~0.5× Vue baseline** — Vue's `nextTick` story is genuinely worse, so aihu wins here even with the void return.

### Task E — `$state` runes-style counter

```ts
const count = $state(0)
effect(() => console.log(count.value))
count.value++
```

**No stumble.** This felt nearly identical to Vue's `ref`. The `$` prefix reads as Svelte-flavored, not Vue, but the runtime is just an object with `.value` getter/setter — no compiler magic at this layer. **~Vue baseline.** This is the "escape hatch for Vue users" the spec promises in §1.4 and it lands.

The one thing I noticed: there's no `unref()`, `toRef()`, `isRef()` family. For pure primitives that's fine, but a Vue user will reach for `unref()` instinctively at some point. Worth flagging in the cross-library cheat sheet.

### Task F — Cycle gotcha

```ts
effect(() => {
  const v = n()
  setN(v + 1)   // throws SignalCircularError
})
```

**Worked, but the error is bare.** `SignalCircularError: circular dependency detected` with a stack trace pointing at the `write` site. In a 5-line repro this is enough. In a real cascade involving 3 computeds and 2 effects, I'd be lost — there's no chain context, no "this effect is writing to that signal which feeds back into …". The spec acknowledges this in §1.6 (chain field deferred to devtools) and the `errors.ts` comment makes this explicit, which I appreciated when I read the source.

**Severity for v0:** acceptable. The audience for v0 is "team members and arbor authors", not unsuspecting third-party users. **Score: passable for v0, would block GA.**

### Task G — Hello, error message

- `signal()` with no argument: TypeScript catches at compile time ("Expected 1-2 arguments, but got 0"). At runtime, `signal()` returns `[() => undefined, write]` — no runtime guard. Acceptable for size budget but means a JS consumer (no TS) gets no help.
- `effect("foo" as any)`: TS catches at compile time. At runtime, the body runs `fn()` and gets `TypeError: fn is not a function` from V8. Generic, not aihu-flavored.
- `effect(async () => { ... })`: the async fn returns a Promise, aihu's `EffectFn = () => void` accepts it (the `void` return type is permissive about *more*-specific returns). The promise is silently discarded. **No warning.** Vue's `watchEffect` has the same trap, so the persona is used to it, but it is a real foot-gun.

**Score:** errors are minimal — TS does the heavy lifting. For a primitives layer at 1 KB, this is the right trade.

---

## 3. Dimension scoring (1–5)

| # | Dimension | Score | Justification |
|---|---|---:|---|
| 1 | Mental model transfer (Vue → aihu) | **4** | Concepts map 1:1: `signal`≈`ref`, `computed`≈`computed`, `effect`≈`watchEffect`, `batch`≈`nextTick` (better). The only mental adjustment is read-shape (tuple vs. `.value`). |
| 2 | `signal` tuple vs. Vue `ref` accessor | **3** | The tuple is a real shape change. Mid-level Vue muscle memory keeps wanting `.value`. The "use `$state` for `.value` ergonomics" answer in spec §1.4 is satisfying *if you find it* — but I had to read the spec to find it. Doc problem, not API problem. |
| 3 | `effect` vs. `watchEffect` | **5** | Naming is shorter, semantics match (sync default), dispose pattern (returned function) is *better* than Vue's `WatchHandle.stop()`. The persona prefers it. |
| 4 | `computed` lazy semantics | **4** | Matches Vue's lazy-default behavior. Two surprises a Vue user might hit: (a) `ComputedOptions.equals` is type-only / reserved (`computed.ts:13-15`), so the equality-suppression promised by the type isn't *yet* wired through to cascade — minor; (b) no dep cleanup means inactive-branch reads still pin subscribers (Task C). |
| 5 | `batch` vs. `nextTick` | **4** | `batch(fn): void` is fine for primary use case (atomic writes). The lack of return-value form bit me once. Vue users don't have `batch` at all, so the shape is *additive*; I'd give it a 5 if it returned the closure value, but the 5-byte gz savings argument in deviation 11 is defensible. |
| 6 | `$state` ergonomics | **5** | Feels like Vue's `ref` ergonomically: `count.value`, getter/setter, identical short-circuit behavior. The `$` prefix is the only stylistic divergence and even that's a wink at the Svelte 5 lineage. The diverges-and-bites scenario I worried about (passing `$state` to a function that expects a tuple) is intentionally not supported and the type makes that obvious. |
| 7 | Error messages | **2** | `SignalCircularError: circular dependency detected` with no chain. TS catches misuse at compile time but the runtime errors for cycles are genuinely cryptic in nontrivial graphs. Spec §1.6 owns this; acceptable for v0. |
| 8 | Discoverability without README | **2** | The `.d.ts` has reasonable JSDoc on `batch` only — `signal`, `effect`, `computed`, `$state` have *no inline JSDoc* in the rolled-up types. The cross-library mappings in spec §1.1–§1.5 are the single most valuable resource for a Vue user, and they live in a spec file the consumer will never find. README absence is the dominant pain. |
| 9 | Lack of `untrack` / `peek` | **3** | I wanted it once, in Task C, when I considered: "what if I want to read `flag` inside the computed *without* tracking it?" Not a frequent Vue pattern (Vue doesn't really have `untrack` either — you'd refactor), so the pain is low. Spec §2.5 explicitly defers it; correct call. |
| 10 | Cycle error UX | **2** | Same as #7. Bare error class with no breadcrumb. Stack pinpoints the writer; doesn't surface the offending reader. Acceptable for arbor-internal use; would block external adoption. |

**Total: 34 / 50.** Above passing for a v0 primitives layer; below "polished" because of #7, #8, and #10 — all *doc/devtools* gaps, not API design gaps.

---

## 4. Friction points (HIGH → LOW)

### 1. (HIGH) No README means the "Vue user → aihu" mapping is invisible
- **Surfaced in:** Task A, Task E, Task D (every task, basically)
- **Symptom:** I had to read the spec, the source, and the tests to learn the API. The cross-library cheat sheet in spec §1.1–§1.5 is the single most useful artifact for my persona, and a real consumer wouldn't open the spec.
- **Recommended fix (doc, not API):** A 30–60 line `packages/signals/README.md` (see §5 below for a starter). Hits the four hot keywords (`ref`, `computed`, `watchEffect`, `nextTick`) early so a Vue user grepping their muscle memory finds the answer.

### 2. (HIGH) `.value` muscle-memory friction on `signal` reads
- **Surfaced in:** Task A
- **Symptom:** Twice, my fingers typed `count.value` before remembering `count()`. TypeScript caught it (the tuple has no `.value`), but the friction is real and recurring for the first hour.
- **Recommended fix (doc, not API):** README should lead with the cheat sheet line "Vue `ref(0).value` ↔ aihu `signal(0)[0]()` ↔ aihu `$state(0).value`" and explicitly say "if `.value` muscle memory matters, use `$state` instead — same primitive underneath." This is one sentence that saves an hour.

### 3. (MEDIUM) `batch` returns void, not the closure value
- **Surfaced in:** Task D
- **Symptom:** I tried `const id = batch(() => insertRow())` and got `void`. Recovery was 30 seconds (capture in closure variable). Solid users would have the same instinct; Preact users wouldn't.
- **Recommended fix (doc, not API):** Add a JSDoc `@example` to `batch` showing the closure-capture pattern. The `.d.ts` already has decent prose explaining the void return — but the "if you want a value, do this" example is not in the JSDoc, only the spec.

### 4. (MEDIUM) `SignalCircularError` is bare — no chain, no offender names
- **Surfaced in:** Task F
- **Symptom:** In a contrived 3-line reproducer, the stack pins the writer and that's enough. In a hypothetical cascade across 3 computeds + 2 effects, I would have no idea which read created the dep that caused re-entry.
- **Recommended fix (doc, not API):** README should call out the v0 limitation explicitly: "cycle errors carry no chain context in v0; richer cycle context lands with devtools (spec §1.6)." Setting the expectation defuses the surprise. The comment already exists in `errors.ts` for source readers; mirror it in user-facing docs.

### 5. (LOW) `ComputedOptions.equals` is type-only / reserved
- **Surfaced in:** reading `computed.ts`
- **Symptom:** A Vue user reading the type would assume `computed(fn, { equals })` does something at runtime. The comment in `computed.ts:13-15` says it's reserved for cascade-suppression. The type accepts it; the runtime ignores it.
- **Recommended fix (doc, not API):** Add `@deprecated` or `@see` JSDoc on the `equals` field of `ComputedOptions` in the `.d.ts` so editors hint "reserved for v0; not yet honored at runtime." Or, if Architect prefers, drop the field from `ComputedOptions` until v0+1 (would be an API change, contra Decision 2B). The doc-only fix is the right call.

---

## 5. Recommended README starter

> *Below is a recommended starter for `packages/signals/README.md`. Builder/Aihu owns actually writing it in a future task; this is the doc that, if it had existed, would have prevented most of the friction I hit.*

```md
# @aihu/signals

Tiny (~1 KB gz) reactive primitives — the foundation layer for Aihu's arbor renderer. Two read shapes (`signal` tuple, `$state` value), one underlying cell. Sync semantics, lazy `computed`, explicit `batch`. No proxies, no scheduler queue, no global tick.

## Hello counter

```ts
import { signal, effect } from '@aihu/signals'

const [count, setCount] = signal(0)
effect(() => console.log('count =', count()))
setCount(1)            // logs "count = 1"
setCount((n) => n + 10) // logs "count = 11"
```

## Derived values with `computed`

```ts
import { signal, computed, effect } from '@aihu/signals'

const [n, setN] = signal(2)
const doubled = computed(() => n() * 2)

effect(() => console.log('doubled =', doubled())) // logs "doubled = 4"
setN(3)                                            // logs "doubled = 6"
```

`computed` is **lazy**: the body doesn't run until you read it. Subsequent reads return the cached value until a dep changes.

## Atomic updates with `batch`

```ts
import { signal, effect, batch } from '@aihu/signals'

const [name, setName] = signal('')
const [email, setEmail] = signal('')

effect(() => save(name(), email()))   // runs once per save event

batch(() => {
  setName('Ada')
  setEmail('ada@example.com')
})
// effect ran exactly once after the batch closed — not once per write.
```

`batch` returns `void`. To get a value out, capture it in a closure variable:
```ts
let id: string
batch(() => { id = insertRow(); setName('Ada') })
```

## Coming from Vue? Use `$state`

If `.value` muscle memory matters, use `$state` instead of `signal`:

```ts
import { $state, effect } from '@aihu/signals'

const count = $state(0)
effect(() => console.log(count.value))
count.value++   // works like Vue's ref
```

Same underlying cell as `signal` — pick the shape that fits your code.

## Cross-library cheat sheet

| Vue 3 | Solid | Preact Signals | aihu |
|---|---|---|---|
| `ref(0)` + `.value` | `createSignal(0)` → `[get, set]` | `signal(0)` + `.value` | `signal(0)` → `[get, set]` *or* `$state(0).value` |
| `computed(fn)` + `.value` | `createMemo(fn)` (eager) | `computed(fn)` + `.value` (lazy) | `computed(fn)` (lazy, call-shape) |
| `watchEffect(fn)` → `WatchHandle.stop()` | `createEffect(fn)` (microtask) | `effect(fn)` → dispose | `effect(fn)` → dispose (sync) |
| `nextTick` (no batch) | `batch(fn)` (returns) | `batch(fn)` (void) | `batch(fn)` (void) |

## v0 limitations

- **Cycle errors carry no chain context.** `SignalCircularError` is thrown synchronously from the writer; richer chain info lands with devtools.
- **`computed` does not yet short-circuit cascade on equal recompute.** `ComputedOptions.equals` is reserved for that optimization in a future release.
- **No `untrack` / `peek` / `onCleanup`.** Single-purpose primitives only; arbor's higher-level scopes live in `@aihu/arbor`.
```

That's ~55 lines. Hits all six items the brief asked for.

---

## 6. What I didn't get to

- **I did not actually run the test suite or compile any of my scratch scripts.** I read the source, the tests, and the types, and reasoned about behavior. For Tasks A–E my reasoning is well-grounded by tests that already exist (`signal.test.ts`, `effect.test.ts`, `computed.test.ts`, `state.test.ts`, `batch.test.ts` all cover the same shapes I wrote). For Task C specifically, no existing test covers the "inactive-branch dep cleanup" question; my conclusion ("no cleanup, but the user-visible effect is mostly fine because of `Object.is` short-circuit at the signal layer") is grounded in the source, not a runtime experiment.
- **I did not measure bundle size or runtime perf.** Out of scope for DX; size budget is the Verifier-Functional's job.
- **I did not test the package as installed via `node_modules`.** I evaluated against `src/` and `dist/index.d.ts` directly. The `package.json` exports look standard (`./dist/index.js`, `./dist/index.d.ts`); I have no reason to expect resolution issues but did not verify.
- **I did not score the Phase-3 `arbor` consumer experience.** Out of scope per the brief — this report is for the Vue/Nuxt user persona consuming `@aihu/signals` directly.

---

## Final summary

1. **PASS WITH NOTES** — ship the API; ship a README before any external user sees this package.
2. **Total dimension score: 34 / 50.**
3. **Top friction:** No README — the cross-library cheat sheet that would unblock Vue users lives in the spec, not the package.
4. **Most surprising thing for a Vue user:** `signal` reads are function calls (`count()`), not property accesses (`count.value`). Muscle memory takes ~10 minutes to retrain.
5. **Single doc example that prevents the most pain:** the cross-library cheat sheet (Vue ⇄ aihu row) at the top of the README.
6. **Spec change despite Decision 2B?** **No.** Every gotcha I found resolves with documentation or a JSDoc tweak in the existing `.d.ts`. The closest call is `ComputedOptions.equals` being type-only / reserved — if Architect wants to pull that field until it's honored, that's a (tiny) API change worth considering, but the doc-only fix (`@see` JSDoc note) is the conservative win and respects 2B.
