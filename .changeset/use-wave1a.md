---
"@aihu/use": minor
"@aihu/compiler": patch
---

feat(use): Wave 1a — 33 CORE composables (timers, preference-media, observers/sensors, async/collections)

`@aihu/use` grows 33 new CORE composables (no `--family`, signals-only,
`packages/use/families.json` unaffected):

- **Timers**: `useTimestamp`, `useInterval`, `useTimeout`, `useTimer`,
  `useCountdown`, `useStopwatch`, `useDateFormat`, `useTimeAgo`.
- **Preference/media**: `usePreferredReducedMotion` (now the canonical
  implementation — `@aihu/use/motion`'s `useReducedMotion` is refactored to
  a thin delegating wrapper, family -> core), `usePreferredContrast`,
  `usePreferredReducedTransparency`, `usePreferredLanguages`,
  `useBrowserLanguage`, `useOperatingSystem`, `useTextDirection`.
- **Observers/sensors**: `useResizeObserver`, `useIntersectionObserver`,
  `useMutationObserver`, `usePerformanceObserver`, `useBreakpoints`,
  `useDevicePixelRatio`, `useOrientation`, `useDeviceOrientation`,
  `useDeviceMotion`, `usePageLeave`.
- **Async/collections**: `useAsync`, `useAsyncAbortable`, `useNetworkState`,
  `useIdle`, `useMap`, `useSet`, `useMeasure`, `useFocusWithin`.

All 33 follow the house composable contract: `isClient`-guard-first SSR
no-ops, `tryOnScopeDispose` teardown for every timer/listener/observer, and
CORE's signals-only dependency rule (verified by
`scripts/dep-check.ts`'s `checkUseSubpathPurity`). 61 composables now pass
`scripts/check-use-registry-parity.ts`'s family-aware six/seven-touch-point
check (up from 28).

`packages/compiler/src/codegen/use_registry.rs`'s `USE_COMPOSABLES` registry
gains all 33 auto-import tuples for this wave, hence the compiler patch bump
(and the matching platform-binary version bump under
`packages/compiler/npm/*`, per `check:compiler-binary-bump`).
