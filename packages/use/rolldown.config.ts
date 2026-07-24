import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  // Multi-entry: one key per composable (+ the shared SSR-guard substrate).
  // Each lowers to its own `dist/<name>.js` so every composable gets an
  // independent `.size-limit.json` row that tree-shakes on its own — the
  // @aihu/primitives per-subpath model (effect-scope plan §5). Shared
  // substrate is double-counted across importing rows on purpose: budgets
  // stay honest per import path.
  //
  // Entry (and subpath) names are camelCase (`useEventListener`) — a
  // deliberate, ratified divergence from primitives' kebab-case: subpaths
  // mirror the exported `useX` composable names (the VueUse convention).
  input: {
    index: 'src/index.ts',
    shared: 'src/shared/index.ts',
    useClipboard: 'src/useClipboard/index.ts',
    useColorScheme: 'src/useColorScheme/index.ts',
    useCounter: 'src/useCounter/index.ts',
    useDebounced: 'src/useDebounced/index.ts',
    useDocumentVisibility: 'src/useDocumentVisibility/index.ts',
    useElementSize: 'src/useElementSize/index.ts',
    useElementVisibility: 'src/useElementVisibility/index.ts',
    useEventListener: 'src/useEventListener/index.ts',
    useEventListenerMap: 'src/useEventListenerMap/index.ts',
    useIntervalFn: 'src/useIntervalFn/index.ts',
    useLocalStorage: 'src/useLocalStorage/index.ts',
    useMediaQuery: 'src/useMediaQuery/index.ts',
    useMouse: 'src/useMouse/index.ts',
    useNow: 'src/useNow/index.ts',
    usePreferredDark: 'src/usePreferredDark/index.ts',
    usePrevious: 'src/usePrevious/index.ts',
    useRafFn: 'src/useRafFn/index.ts',
    useScroll: 'src/useScroll/index.ts',
    useSupported: 'src/useSupported/index.ts',
    useThrottle: 'src/useThrottle/index.ts',
    useTimeoutFn: 'src/useTimeoutFn/index.ts',
    useToggle: 'src/useToggle/index.ts',
    useWindowSize: 'src/useWindowSize/index.ts',
    watch: 'src/watch/index.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
  },
  plugins: [dts()],
  // @aihu/signals stays external so each composable's dist measures only its
  // own code (matching the `.size-limit.json` ignore lists).
  external: ['@aihu/signals'],
})
