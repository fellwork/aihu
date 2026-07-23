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
export type { UseClipboardOptions, UseClipboardReturn } from './useClipboard/index.ts'
export { useClipboard } from './useClipboard/index.ts'
export type {
  ColorScheme,
  UseColorSchemeOptions,
  UseColorSchemeReturn,
} from './useColorScheme/index.ts'
export { useColorScheme } from './useColorScheme/index.ts'
export type { UseCounterOptions, UseCounterReturn } from './useCounter/index.ts'
export { useCounter } from './useCounter/index.ts'
export type { UseDebouncedReturn } from './useDebounced/index.ts'
export { useDebounced } from './useDebounced/index.ts'
export type { UseDocumentVisibilityReturn } from './useDocumentVisibility/index.ts'
export { useDocumentVisibility } from './useDocumentVisibility/index.ts'
export type { UseElementSizeOptions, UseElementSizeReturn } from './useElementSize/index.ts'
export { useElementSize } from './useElementSize/index.ts'
export type {
  UseElementVisibilityOptions,
  UseElementVisibilityReturn,
} from './useElementVisibility/index.ts'
export { useElementVisibility } from './useElementVisibility/index.ts'
export { useEventListener } from './useEventListener/index.ts'
export type { UseIntervalFnOptions, UseIntervalFnReturn } from './useIntervalFn/index.ts'
export { useIntervalFn } from './useIntervalFn/index.ts'
export type { UseLocalStorageOptions, UseLocalStorageReturn } from './useLocalStorage/index.ts'
export { useLocalStorage } from './useLocalStorage/index.ts'
export type { UseMediaQueryOptions, UseMediaQueryReturn } from './useMediaQuery/index.ts'
export { useMediaQuery } from './useMediaQuery/index.ts'
export type { UseMouseCoordType, UseMouseOptions, UseMouseReturn } from './useMouse/index.ts'
export { useMouse } from './useMouse/index.ts'
export type { UseNowOptions, UseNowReturn } from './useNow/index.ts'
export { useNow } from './useNow/index.ts'
export type { UsePreferredDarkReturn } from './usePreferredDark/index.ts'
export { usePreferredDark } from './usePreferredDark/index.ts'
export type { UsePreviousReturn } from './usePrevious/index.ts'
export { usePrevious } from './usePrevious/index.ts'
export type {
  UseRafFnCallbackArgs,
  UseRafFnOptions,
  UseRafFnReturn,
} from './useRafFn/index.ts'
export { useRafFn } from './useRafFn/index.ts'
export type { UseScrollOptions, UseScrollReturn } from './useScroll/index.ts'
export { useScroll } from './useScroll/index.ts'
export type { UseSupportedReturn } from './useSupported/index.ts'
export { useSupported } from './useSupported/index.ts'
export type { UseThrottleReturn } from './useThrottle/index.ts'
export { useThrottle } from './useThrottle/index.ts'
export type { UseTimeoutFnOptions, UseTimeoutFnReturn } from './useTimeoutFn/index.ts'
export { useTimeoutFn } from './useTimeoutFn/index.ts'
export type { UseToggleFn, UseToggleReturn } from './useToggle/index.ts'
export { useToggle } from './useToggle/index.ts'
export type { UseWindowSizeOptions, UseWindowSizeReturn } from './useWindowSize/index.ts'
export { useWindowSize } from './useWindowSize/index.ts'
