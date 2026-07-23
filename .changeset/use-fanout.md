---
"@aihu/use": minor
---

Fan out `@aihu/use` with ~20 new signals-only composables, each with its own
per-composable subpath entry (`@aihu/use/useX`) and `.size-limit.json` row.
SSR-safety and scope-cleanup have been fable-reviewed across the set.

New composables:

- `useClipboard`
- `useColorScheme`
- `useCounter`
- `useDebounced`
- `useDocumentVisibility`
- `useElementSize`
- `useElementVisibility`
- `useIntervalFn`
- `useLocalStorage`
- `useMediaQuery`
- `useNow`
- `usePreferredDark`
- `usePrevious`
- `useRafFn`
- `useScroll`
- `useSupported`
- `useThrottle`
- `useTimeoutFn`
- `useToggle`
- `useWindowSize`
