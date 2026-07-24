/**
 * `useBreakpoints` — named breakpoint media queries, built on
 * {@link useMediaQuery} (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{md()}`, never bare `{md}` — same for every breakpoint name.
 *
 * SSR: delegates entirely to `useMediaQuery`, which returns a static `false`
 * getter and registers no listener under SSR — the `isClient` no-op
 * invariant is inherited here, not re-implemented (this file never
 * references `isClient` itself).
 */

import { useMediaQuery } from '../useMediaQuery/index.ts'

/** A breakpoint-name -> minimum-width-in-px map, the input shape for
 * {@link useBreakpoints}. */
export type Breakpoints<K extends string = string> = Record<K, number>

/** The default breakpoint preset — Tailwind's scale (`sm`/`md`/`lg`/`xl`/
 * `2xl`), a widely-recognized set of five. Pass a custom map to
 * `useBreakpoints` to use different names/values entirely. */
export const breakpointsDefault: Breakpoints<'sm' | 'md' | 'lg' | 'xl' | '2xl'> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
}

export type UseBreakpointsReturn<K extends string> = Record<K, () => boolean> & {
  /** `true` when the viewport is at least as wide as breakpoint `name`
   * (identical to calling `result[name]()` — spelled out for readability
   * at call sites that already have the name as a variable). */
  greaterOrEqual: (name: K) => boolean
  /** `true` when the viewport is narrower than breakpoint `name`. */
  smaller: (name: K) => boolean
  /** `true` when the viewport is in `[breakpoints[from], breakpoints[to])`
   * — at least `from`, but narrower than `to`. */
  between: (from: K, to: K) => boolean
  /** Every breakpoint name currently satisfied (ascending by px value),
   * e.g. `['sm', 'md']` on a viewport >= `md` but < `lg`. Recomputed on
   * each call from the underlying getters — not cached. */
  current: () => K[]
}

/**
 * Track a named set of `(min-width: …)` breakpoints. Each name in
 * `breakpoints` (default {@link breakpointsDefault}) becomes a reactive
 * getter on the returned object, plus `greaterOrEqual`/`smaller`/`between`/
 * `current` helpers built on top of them. Cleans up with the surrounding
 * effect scope (via the underlying `useMediaQuery` listeners).
 */
export function useBreakpoints<K extends string = keyof typeof breakpointsDefault>(
  breakpoints: Breakpoints<K> = breakpointsDefault as unknown as Breakpoints<K>,
): UseBreakpointsReturn<K> {
  const names = Object.keys(breakpoints) as K[]
  // Ascending by px value — `current()` and the min-width queries below both
  // depend on this order.
  const sorted = [...names].sort((a, b) => breakpoints[a] - breakpoints[b])

  const matchers = {} as Record<K, () => boolean>
  for (const name of sorted) {
    const { matches } = useMediaQuery(`(min-width: ${breakpoints[name]}px)`)
    matchers[name] = matches
  }

  const greaterOrEqual = (name: K): boolean => matchers[name]()
  const smaller = (name: K): boolean => !matchers[name]()
  const between = (from: K, to: K): boolean => matchers[from]() && !matchers[to]()
  const current = (): K[] => sorted.filter((name) => matchers[name]())

  return { ...matchers, greaterOrEqual, smaller, between, current }
}
