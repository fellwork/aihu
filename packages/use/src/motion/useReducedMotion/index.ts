/**
 * `useReducedMotion` — reactive boolean read of the user's
 * `prefers-reduced-motion` preference (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5, wave0 seed for the `@aihu/use/motion` family — packages/use/families.json).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{prefersReduced()}`, never bare `{prefersReduced}`.
 *
 * REFACTORED (Wave 1a): this is now a thin backward-compatible `/motion`
 * wrapper over the CORE canonical `usePreferredReducedMotion` (which exposes
 * the feature's own `'reduce' | 'no-preference'` vocabulary) — collapsed to
 * this family's already-shipped boolean shape so no existing caller breaks.
 * Still the seed that exercises the one-way import rule: a FAMILY entry may
 * import CORE (this file does), but CORE may never import back into a
 * family (enforced by `scripts/dep-check.ts`'s `checkUseSubpathPurity`, with
 * a negative fixture covering the forbidden direction).
 *
 * SSR (`isClient === false`): delegates entirely to
 * `usePreferredReducedMotion`, which returns a static `'no-preference'` and
 * registers no listener — the `isClient` no-op invariant is INHERITED here,
 * not re-implemented (this file's own source no longer references
 * `isClient` directly, so a Tier-2 `ssr-safety.test.ts` row is optional for
 * it now, not required — kept anyway for behavioral coverage of the
 * boolean-collapse shape).
 */
import { usePreferredReducedMotion } from '../../usePreferredReducedMotion/index.ts'

export interface UseReducedMotionReturn {
  /** Reactive getter — read as `{prefersReduced()}` in templates (parens
   * required). `false` under SSR (no viewport to evaluate the query). */
  readonly prefersReduced: () => boolean
}

/**
 * Track the `(prefers-reduced-motion: reduce)` media query as a boolean.
 * Motion composables (`useSpring`, etc., landing in later waves) read this
 * to decide whether to animate at all. Cleans up with the surrounding
 * effect scope (via the underlying `usePreferredReducedMotion` ->
 * `useMediaQuery` listener).
 */
export function useReducedMotion(): UseReducedMotionReturn {
  const { preference } = usePreferredReducedMotion()
  const prefersReduced = (): boolean => preference() === 'reduce'
  return { prefersReduced }
}
