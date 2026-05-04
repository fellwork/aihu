import { defineConfig } from 'rolldown'
import { scribeCompilerPlugin } from '../../js/index.ts'

/**
 * Rolldown build config for the v1-syntax counter fixture.
 *
 * The scribeCompilerPlugin returns TypeScript (the Rust compiler emits
 * typed arbor calls). Rolldown strips TypeScript via its built-in oxc
 * transform, which recognises the module as TypeScript based on the
 * content returned from the plugin's transform hook.
 *
 * Workspace deps (@scribe/*) are kept external so the bundle resolves
 * them from the workspace symlinks at runtime.
 */
export default defineConfig({
  input: { counter: 'main.ts' },
  plugins: [scribeCompilerPlugin()],
  // Tell rolldown's oxc transform to treat .scribe files as TypeScript.
  // The scribe plugin's transform hook returns TypeScript (the Rust compiler
  // emits typed arbor calls); without this, rolldown's default JS parser
  // fails on generic syntax like `<T extends typeof HTMLElement>`.
  moduleTypes: {
    '.scribe': 'ts',
  },
  external: ['@scribe/arbor', '@scribe/signals', '@scribe/runtime'],
  output: {
    dir: 'dist',
    format: 'esm',
  },
})
