/**
 * `useToggle` — a reactive boolean with a flip/set toggler
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Deliberate divergence from the "object of named getters" convention: like
 * a signal, this composable returns a `[get, toggle]` PAIR, not `{ state }`
 * — it IS a boolean signal with a toggling setter bolted on, so it reads the
 * same way at call sites (`const [on, toggle] = useToggle()`).
 *
 * Reading the getter in `.aihu` templates still needs parens: `{on()}`,
 * never bare `{on}` (same rule as every other composable getter — see
 * useMouse's module doc for the full explanation).
 *
 * SSR (`isClient === false`): returns a static getter of the initial value
 * and a no-op `toggle` — no signal is created, matching the `isClient`
 * no-op invariant (there is nothing here to leak: no listener/timer/observer
 * either way, so the SSR branch exists only to skip the signal allocation).
 */

import { signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'

/** Flip the current value, or set it explicitly. */
export type UseToggleFn = (value?: boolean) => void

/** `[state, toggle]` — read as `on()` and `toggle()`/`toggle(v)`. */
export type UseToggleReturn = readonly [() => boolean, UseToggleFn]

/**
 * A toggleable boolean. `toggle()` flips the current value; `toggle(v)`
 * sets it explicitly.
 *
 * @param initial starting value. Default `false`.
 */
export function useToggle(initial = false): UseToggleReturn {
  // SSR: static getter of the initial value, no signal, no-op toggle.
  if (!isClient) {
    const state = (): boolean => initial
    const toggle: UseToggleFn = () => {}
    return [state, toggle]
  }

  const [state, setState] = signal(initial)
  const toggle: UseToggleFn = (value) => {
    setState((prev: boolean) => (value === undefined ? !prev : value))
  }

  return [state, toggle]
}
