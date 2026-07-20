/**
 * CI-gate config (#434/#445) — the root `vitest.config.ts` excludes
 * `packages/cli/tests/legacy-snapshot.test.ts` so the full coverage run
 * (`bun run test --coverage`, plan-a.yml) does not double-run it. The named
 * plan-a gate step runs that test through THIS config, which is the root
 * config with the gated test un-excluded — otherwise the config exclude
 * defeats even an explicit file filter and vitest reports "No test files
 * found" (the #445 silent no-op).
 *
 * passWithNoTests stays false here AND at root: a gate step that selects
 * zero tests must fail loud, never exit 0 vacuously.
 */
import { defineConfig } from 'vitest/config'
import base from './vitest.config'

const baseTest = (base as { test?: Record<string, unknown> }).test ?? {}

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    exclude: ['**/node_modules/**'],
    passWithNoTests: false,
  },
})
