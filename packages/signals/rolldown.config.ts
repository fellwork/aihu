import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  // Multi-entry: `index` is the guarded reactivity core (signal/computed/
  // effect/scope/batch); `lifecycle` is the DOM-free ownership CONTRACT
  // (docs/plans/2026-07-24-lifecycle-ownership-dx.md §6) — a SEPARATE
  // entry, on purpose, so it never adds a byte to the guarded
  // `dist/index.js` `.size-limit.json` row. `src/index.ts` must never
  // import `src/lifecycle.ts` (enforced by a unit test —
  // tests/lifecycle.test.ts — asserting the source text of `src/index.ts`
  // never mentions `lifecycle`).
  //
  // Multi-entry ALSO means rolldown may split out a shared `scope-<hash>.js`
  // chunk between the two entries. `scripts/mangle-dist.mjs` mangles every
  // `dist/*.js` file it finds with one shared replacement table — see that
  // script's header comment for why mangling `index.js` alone would be
  // unsafe here (a field's declaration and its access can land in different
  // emitted files once the build is code-split).
  input: {
    index: 'src/index.ts',
    lifecycle: 'src/lifecycle.ts',
  },
  checks: { circularDependency: true },
  // Replace `process.env.NODE_ENV` with the string `"production"` inside
  // the transform step so that Rolldown's minifier DCEs the `__DEV__`
  // guard in computed.ts (including the `read[__HOST] = node` assignment).
  transform: {
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
    // Match the arbor rolldown config — without minify the published tarball
    // ships unminified source. See packages/arbor/rolldown.config.ts and
    // .team/phase-3/telemetry-treeshake-investigation.md for context.
    minify: true,
  },
  plugins: [dts()],
})
