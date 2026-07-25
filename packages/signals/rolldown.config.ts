import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

// Shared build knobs. Both builds below emit into the SAME `dist/` dir but
// are deliberately kept as two INDEPENDENT single-entry builds — see the
// note on `lifecycleBuild` for why a single multi-entry build is not used.
const transform = {
  // Replace `process.env.NODE_ENV` with the string `"production"` inside
  // the transform step so that Rolldown's minifier DCEs the `__DEV__`
  // guard in computed.ts (including the `read[__HOST] = node` assignment).
  define: {
    'process.env.NODE_ENV': '"production"',
  },
} as const

const output = {
  dir: 'dist',
  format: 'esm',
  sourcemap: true,
  entryFileNames: '[name].js',
  // Match the arbor rolldown config — without minify the published tarball
  // ships unminified source. See packages/arbor/rolldown.config.ts and
  // .team/phase-3/telemetry-treeshake-investigation.md for context.
  minify: true,
} as const

/**
 * The guarded reactivity core (signal/computed/effect/scope/batch).
 *
 * SINGLE-ENTRY ON PURPOSE. `dist/index.js` must stay one self-contained
 * module: `_currentScope`, `getCurrentScope`/`setCurrentScope` and the
 * scope cleanup register/unregister pair sit on the propagation and
 * creation hot paths, and a chunk boundary through them costs real time.
 * Measured (interleaved A/B against `main`, n=12 fresh processes per arm,
 * write-up in PR #549): letting rolldown hoist `scope.ts` into a chunk
 * shared with the `lifecycle` entry cost +3.3 %..+21 % on `dynamic-deps`
 * (ranges DISJOINT from main across every rep) and a few percent on
 * `creation-1to1000`, while a control arm whose `dist/index.js` was
 * byte-identical to main measured ~0 %. Keeping this build single-entry
 * restores `cmp`-byte-identity with main's `dist/index.js`.
 */
const indexBuild = {
  input: { index: 'src/index.ts' },
  checks: { circularDependency: true },
  transform,
  output,
  plugins: [dts()],
}

/**
 * `@aihu/signals/lifecycle` — the DOM-free ownership CONTRACT
 * (docs/plans/2026-07-24-lifecycle-ownership-dx.md §6). A SEPARATE entry,
 * on purpose, so it never adds a byte to the guarded `dist/index.js`
 * `.size-limit.json` row. `src/index.ts` must never import
 * `src/lifecycle.ts` (enforced by tests/lifecycle.test.ts, which asserts
 * the source text of `src/index.ts` never mentions `lifecycle`).
 *
 * It needs exactly one runtime value from the core — `getCurrentScope` —
 * and it takes it as an EXTERNAL import of the sibling entry
 * (`import{getCurrentScope}from"./index.js"`) rather than by bundling
 * `scope.ts`. Two reasons, in priority order:
 *
 *  1. CORRECTNESS. `scope.ts` owns the module-level `_currentScope`
 *     binding. Inlining a second copy into `dist/lifecycle.js` would give
 *     the package TWO current-scope variables: a scope entered through
 *     `@aihu/signals` would be invisible to `getLifecycleHost()`, so
 *     ownership would silently resolve to `undefined`. The external import
 *     guarantees ONE instance — `./index.js` resolves to the same file
 *     path (and therefore the same module record) as the `.` export
 *     condition, in Node and in every bundler.
 *  2. PERFORMANCE. It is the only way to get (1) without a shared chunk,
 *     which is what regressed the core hot paths (see `indexBuild` above).
 *
 * The specifier is kept RELATIVE (`./index.js`, not the bare
 * `@aihu/signals`) so the two files can never be resolved to different
 * copies by an aliasing consumer.
 */
const lifecycleBuild = {
  input: { lifecycle: 'src/lifecycle.ts' },
  checks: { circularDependency: true },
  transform,
  output,
  plugins: [
    {
      name: 'aihu-scope-as-external-entry',
      resolveId(source: string) {
        if (source === './scope.ts' || source === './scope') {
          return { id: './index.js', external: true }
        }
        return null
      },
    },
    dts(),
  ],
}

export default defineConfig([indexBuild, lifecycleBuild])
