/**
 * `useClamp` — reactive clamp of a number to `[min, max]`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5, wave0 seed for
 * the `@aihu/use/math` family — packages/use/families.json).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{value()}`, never bare `{value}`.
 *
 * Deliberately dep-free AND free of the client/server SSR guard used
 * elsewhere in this package: this is a pure derivation over numbers — no
 * DOM, window, or timer is ever touched, so there is nothing to
 * special-case under SSR. `computed()` recomputes identically on the server
 * and the client. This is the `math` family's whole point (0 peers, see
 * families.json) and it doubles as the seed that proves the parity gate's
 * 7th touch point discriminates correctly: a composable whose source never
 * references the client-detection flag gets no REQUIRED row in
 * `packages/use/tests/ssr-safety.test.ts` Tier 2 (see that file's
 * math/useClamp comment) — only the auto-discovered Tier-1 check applies.
 */
import { computed } from '@aihu/signals'
import { type MaybeGetter, toValue } from '../../shared/index.ts'

export interface UseClampReturn {
  /** Reactive clamped getter — read as `{value()}` in templates (parens
   * required). Recomputes whenever `value`, `min`, or `max` changes. */
  readonly value: () => number
}

/**
 * Clamp `value` to the inclusive range `[min, max]`. Each argument accepts
 * a plain number or a zero-arg getter (a signal's read half) — see
 * {@link MaybeGetter} — so the clamp stays reactive to whichever inputs are
 * themselves reactive.
 */
export function useClamp(
  value: MaybeGetter<number>,
  min: MaybeGetter<number>,
  max: MaybeGetter<number>,
): UseClampReturn {
  const clamped = computed(() => Math.min(Math.max(toValue(value), toValue(min)), toValue(max)))

  return { value: clamped }
}
