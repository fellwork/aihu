import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'
import pkg from './package.json' with { type: 'json' }

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
  //
  // FAMILY subpaths (namespace-wave0: `math`, `motion`, `router`,
  // `integrations`) land here too once their first composable is scaffolded
  // — a bare family key (`math: 'src/math/index.ts'`) is the aggregate
  // barrel, only present for `aggregate: true` families with >=1 member; a
  // quoted `'family/name'` key is a member entry. Nothing is added here
  // pre-emptively (see `packages/use/families.json` for the declared
  // families themselves) — `scripts/gen-use.ts --family <family>` is what
  // adds these once a composable actually lands.
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
    math: 'src/math/index.ts',
    'math/useClamp': 'src/math/useClamp/index.ts',
    motion: 'src/motion/index.ts',
    'motion/useReducedMotion': 'src/motion/useReducedMotion/index.ts',
    'integrations/useJwt': 'src/integrations/useJwt/index.ts',
    router: 'src/router/index.ts',
    'router/useRouteParams': 'src/router/useRouteParams/index.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
  },
  plugins: [dts()],
  // @aihu/signals stays external so each composable's dist measures only its
  // own code (matching the `.size-limit.json` ignore lists). Every declared
  // optional peer (packages/use/package.json `peerDependencies`) is external
  // too, derived from the manifest so the two can never drift — peers are
  // installed as devDependencies for typecheck/test, so WITHOUT this they
  // would be silently inlined into whichever family bundle imports them.
  // Harmless today: `peerDependencies` is empty until a family's first
  // peer-bearing composable lands.
  //
  // Package-boundary-aware, not a bare array: an array is exact-match only,
  // so a subpath import (`@aihu/signals/lifecycle`) would fail to match
  // `'@aihu/signals'` and rolldown would silently INLINE it into every
  // consuming entry, inflating that entry's `.size-limit.json` row. Match on
  // the package-name boundary — exact name or `<name>/...` — never a bare
  // prefix (which would also admit an unrelated package sharing a prefix).
  external: (id: string) =>
    ['@aihu/signals', ...Object.keys(pkg.peerDependencies ?? {})].some(
      (name) => id === name || id.startsWith(`${name}/`),
    ),
})
