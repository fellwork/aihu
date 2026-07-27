import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  // node: builtins externalized by PATTERN, not a hand-listed array, so the
  // allowlist can't silently drift as new builtins are imported (FEL-EXTERNALS).
  external: ['@aihu/app', /^node:/, 'vite'],
  checks: { circularDependency: true },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
