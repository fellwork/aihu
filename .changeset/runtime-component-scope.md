---
"@aihu/signals": minor
"@aihu/arbor": patch
"@aihu/runtime": minor
---

feat(runtime): bind the component root to an effect scope (effect-scope plan §2)

Every component instance now opens a DETACHED root `effectScope` around its
`setup()` call; onMount bodies run inside it; the scope stops on disconnect
(before `MountScope.dispose()` — DOM removal last), on HMR replace, on
setup-throw, and (via the new define-element bridge) on hydrated-component
disconnect. Effects/computeds created by composables during setup or onMount
are automatically disposed on unmount — no manual dispose.

- `@aihu/signals`: new `runWithoutScope(fn)` — run `fn` with no current scope
  (the explicit opt-out mirror of `runWithScope`).
- `@aihu/arbor`: `mount()`/`hydrate()` wrap their synchronous effect wiring
  (including error-handler fallbacks) in `runWithoutScope`, so binding effects
  are owned by the MountScope exclusively and are never adopted by a component
  scope — even for a child custom element upgrading synchronously inside a
  parent's scoped `setup()`/`onMount` (P0-2b).

BEHAVIOR CHANGES:

- (a) `onCleanup` inside an `effect()` body now throws SCR-R0011 — the current
  scope is cleared for every effect run (P0-1), and the old behavior was itself
  a bug (it only worked on the effect's first run and risked cross-component
  mis-registration). Use the effect's per-run `onCleanup` argument instead.
  `onCleanup` also throws under a STOPPED current scope (async re-entry after
  the owner stopped) instead of silently dropping the callback — and is newly
  LEGAL inside `onMount` bodies and plain `effectScope.run()` frames.
- (b) Unified-LIFO teardown order (ratified P0-3): everything the component
  owns — composable effect/computed handles, `onCleanup` callbacks, and
  onMount-returned teardowns — lives in ONE component-scope list drained LIFO
  by `scope.stop()`. This REVERSES the previous order (onCleanup FIFO in setup
  order, then onMount teardowns): onMount teardowns now run first (registered
  last), then setup-time cleanups in reverse registration order. All teardown
  still runs before DOM removal.
