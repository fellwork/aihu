import { defineConfig } from 'rolldown'
import { aihuCompilerPlugin } from '../../js/index.ts'

/**
 * Rolldown build config for the v1-syntax counter fixture.
 *
 * The aihuCompilerPlugin returns TypeScript (the Rust compiler emits
 * typed arbor calls). Rolldown strips TypeScript via its built-in oxc
 * transform, which recognises the module as TypeScript based on the
 * content returned from the plugin's transform hook.
 *
 * Workspace deps (@aihu/*) are kept external so the bundle resolves
 * them from the workspace symlinks at runtime.
 */
export default defineConfig({
  input: { counter: 'main.ts' },
  plugins: [aihuCompilerPlugin()],
  // Tell rolldown's oxc transform to treat .aihu files as TypeScript.
  // The aihu plugin's transform hook returns TypeScript (the Rust compiler
  // emits typed arbor calls); without this, rolldown's default JS parser
  // fails on generic syntax like `<T extends typeof HTMLElement>`.
  moduleTypes: {
    '.aihu': 'ts',
  },
  external: ['@aihu/arbor', '@aihu/signals', '@aihu/runtime'],
  output: {
    dir: 'dist',
    format: 'esm',
  },
})
