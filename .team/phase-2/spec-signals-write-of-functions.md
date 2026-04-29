# Spec: `Write<T>` for function-valued signals

**Status:** Adopted (Option B). Implemented in `packages/signals/src/signal.ts` and `packages/signals/src/state.ts`.
**Slots into:** `.team/phase-2/spec-signals.md` §1.1.

## Problem

The pre-Option-B `Write<T>` is:

```ts
export type Write<T> = (next: T | ((prev: T) => T)) => void
```

The runtime in `signal.ts` branches on `typeof next === 'function'` to disambiguate the value-write form from the updater form. This collides whenever `T` is itself a function type:

```ts
const [getCallback, setCallback] = signal<() => number>(() => 5)
setCallback(() => 6) // ⚠ runtime: invokes (() => 6)(prev), stores 6 — type violation
```

The user wanted to store `() => 6` as the new callback; the runtime instead treats it as the updater `(prev) => 6`. There is no escape hatch in the public API. `$state<() => number>(...)` inherits the same bug because its setter delegates to `write`.

## Survey

| Library | Approach | Trade-off |
|---|---|---|
| **SolidJS** `createSignal` | `Setter<T>` overloads using `Exclude<U, Function>`; runtime same as Scribe. Forces closure-of-closure idiom for function-typed signals. | Zero runtime cost. The closure-of-closure ergonomic friction is the established Solid pattern; cross-pollinated users already know it. |
| **Preact Signals** `signal()` | `.value` get/set, no updater overload. To compute relative to prev, write `s.value = s.value + 1`. | One extra wrapper allocation per signal; `.value` access goes through a property accessor. Sidesteps the issue entirely but is incompatible with Scribe's tuple shape. |
| **Vue `ref` / `shallowRef`** | Same `.value` pattern. | Same trade-off as Preact. |
| **Angular signals** | Splits into `WritableSignal<T>.set(value)` and `.update(fn)`. | Cleanest disambiguation in the survey. Requires a method-bag shape, not a tuple. |
| **alien-signals** | `signal<T>(...): { (): T; (value: T): void }` — single callable, no updater path. | No ambiguity, no convenience for `prev + 1`. Tiny API surface. |

## Decision: Option B (Solid-style type tightening)

```ts
export type Write<T> = <U extends T>(
  next: (Exclude<U, Function> & T) | ((prev: T) => U),
) => void
```

For non-function `T` this is identical to the legacy shape (`Exclude<U, Function>` is `U`). For function-typed `T`, `Exclude<U, Function>` collapses to `never`, leaving only the updater form — and the updater's return type must structurally match `T`, so `setCallback(() => 6)` fails type-checking (return is `number`, not `() => number`). The user is forced to write the closure-of-closure idiom:

```ts
setCallback(() => () => 6)
```

### Why Option B over A or C

Two alternatives were considered:

- **Option A** — keep tuple, add a third element `setRaw: (value: T) => void`. Adds ~5–8 B gz, doubles the writer surface, makes destructuring `const [, , setRaw]` awkward.
- **Option C** — sentinel wrapper `setX(setX.raw(fn))`. Adds ~30–50 B gz plus a per-write object-shape check on the hot path; conflicts with the §2.9 hidden-class shape-locking discipline.

Option B wins on every axis the spec budget cares about:

| Axis | A | B | C |
|---|---|---|---|
| Bundle bytes (gz) | +5–8 B | **0 B** | +30–50 B |
| Per-write runtime cost | 0 | **0** | +1 shape check |
| Compiler-emit changes | new tuple slot | **none** | sentinel detection |
| Type safety for the bug | adds a path; doesn't prevent the wrong call | **compile-time error** | requires runtime branding |
| Breaking-change scope | none | type-only, narrow | none |

Scribe's signals package sits at ~698 B gz of a 1024 B budget (per `.team/phase-2/spec-signals.md`). Option C consumes ~3–5% of remaining headroom; A consumes ~0.5–0.8%; B consumes 0%. Option B is the unique choice that imposes no cost on consumers who never write function-valued signals.

## Known limitation: `$state<T>` for function-typed `T`

`packages/signals/src/state.ts` is a `.value` getter/setter wrapper around `signal()`. Internally:

```ts
set value(next: T) {
  writeRaw(next)
}
```

Because the setter forwards to the underlying `write` runtime — which still does `typeof next === 'function' ? next(value) : next` — assigning a function to `state.value` for `$state<() => number>` invokes the function rather than storing it. **This bug pre-dates Option B.** Option B's compile-time guard would reject the call inside `state.ts`, so the implementation casts `write` to the legacy shape (`writeRaw`) to preserve `$state`'s "value-only" surface. Users of `$state<Function>` see the legacy runtime behavior.

A v1 fix is to expose a `_writeRaw` from `signal.ts` that bypasses the typeof branch and have `$state` use it. Out of scope for this spec; tracked separately.

## Migration notes

- **No runtime changes.** Existing call sites for non-function-typed signals are bit-identical.
- **Type-only breaking change.** `Signal<() => X>` callers currently passing `setX(fn)` will see a TypeScript error and must rewrite as `setX(() => fn)`.
- **No compiler change.** The Rust SFC compiler emits direct `setX(value)` calls; for non-function `T` (the dominant case) nothing changes.
- **`$state`** retains its current API; the `writeRaw` cast is internal.

## Verification

1. Existing 51 arbor + 59 signals tests pass (`bunx vitest run`).
2. `tsc --noEmit` clean for `@scribe/signals`.
3. Type-only regression: a `signal<() => number>(...)` call passing `setX(() => 6)` produces `error TS2769` (no overload matches). Negative test left out of the suite intentionally — type-error tests would require `expect-type` or `tsd`, neither currently a dependency. Adding such a harness is tracked as a separate item.

## Future work

- v1: introduce `signal._writeRaw` and use it from `$state`, eliminating the function-typed-state runtime quirk.
- Consider Option A as an opt-in if telemetry (§2.8) shows users hit the closure-of-closure idiom often enough to be confusing.
