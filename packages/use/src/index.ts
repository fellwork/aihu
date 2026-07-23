/**
 * `@aihu/use` — utility/sensor/state composables for aihu
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Barrel entry. Prefer the per-composable subpaths
 * (`@aihu/use/useEventListener`, `@aihu/use/useMouse`, `@aihu/use/shared`)
 * in size-sensitive code — each is its own bundle entry with its own
 * `.size-limit.json` row.
 */

export type { MaybeElementGetter, MaybeGetter } from './shared/index.ts'
export {
  defaultDocument,
  defaultNavigator,
  defaultWindow,
  isClient,
  toValue,
  tryOnMounted,
  tryOnScopeDispose,
  unrefElement,
} from './shared/index.ts'
export { useEventListener } from './useEventListener/index.ts'
export type { UseMouseCoordType, UseMouseOptions, UseMouseReturn } from './useMouse/index.ts'
export { useMouse } from './useMouse/index.ts'
