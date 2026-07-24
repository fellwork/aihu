/**
 * Test fixture for `scripts/check-size-rows.ts` (v0.2.4 size-row policy).
 *
 * Calls the pure `checkPolicy()` function with synthesized package + row
 * inputs to confirm the lint catches each violation class:
 *   1. browser-eligible package missing a row
 *   2. server-side package with a forbidden row
 *   3. build/dev-time-only package with a forbidden row
 *
 * Also confirms the green path on a snapshot of current state.
 */
import { describe, expect, it } from 'vitest'
import { checkPolicy, classify } from '../scripts/check-size-rows.ts'

describe('check-size-rows policy lint', () => {
  it('classifies known packages correctly', () => {
    expect(classify('@aihu/signals')).toBe('browser-eligible')
    expect(classify('@aihu/arbor')).toBe('browser-eligible')
    expect(classify('@aihu/runtime')).toBe('browser-eligible')
    expect(classify('@aihu-plugin/data')).toBe('browser-eligible')
    expect(classify('@aihu/router')).toBe('browser-eligible')
    expect(classify('@aihu/context')).toBe('browser-eligible')
    expect(classify('@aihu/agent')).toBe('browser-eligible')
    expect(classify('@aihu/agent-service')).toBe('browser-eligible')
    // @aihu/reactive is not in any of the forbidden allowlists, so it falls
    // through to the default classification — same mechanism that already
    // covers @aihu/store and @aihu/use (design doc
    // docs/plans/2026-07-24-deep-reactivity.md §3 landing checklist).
    expect(classify('@aihu/reactive')).toBe('browser-eligible')

    expect(classify('@aihu/server')).toBe('server-side')
    expect(classify('@aihu-plugin/agent-readiness')).toBe('server-side')

    expect(classify('@aihu/plugin')).toBe('build-dev-only')
    expect(classify('@aihu/compiler')).toBe('build-dev-only')

    expect(classify('@aihu/ui')).toBe('source-distributed')
  })

  it('exempts source-distributed @aihu/ui from a row even without src/index.ts', () => {
    const packages = [
      {
        name: '@aihu/ui',
        dir: '/p/ui',
        hasIndexTs: false,
        classification: 'source-distributed' as const,
      },
    ]
    const rows: { name: string; path: string; limit: string }[] = []
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('catches a source-distributed package with a forbidden row', () => {
    const packages = [
      {
        name: '@aihu/ui',
        dir: '/p/ui',
        hasIndexTs: false,
        classification: 'source-distributed' as const,
      },
    ]
    const rows = [{ name: '@aihu/ui', path: 'x', limit: '5 kB' }]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('@aihu/ui') && e.includes('MUST NOT'))).toBe(true)
  })

  it('passes on a valid configuration (current main snapshot)', () => {
    const packages = [
      {
        name: '@aihu/signals',
        dir: '/p/signals',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@aihu/arbor',
        dir: '/p/arbor',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@aihu/runtime',
        dir: '/p/runtime',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@aihu-plugin/data',
        dir: '/p/data',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@aihu/router',
        dir: '/p/router',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@aihu/context',
        dir: '/p/context',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@aihu/agent',
        dir: '/p/agent',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@aihu/agent-service',
        dir: '/p/agent-service',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@aihu/server',
        dir: '/p/server',
        hasIndexTs: true,
        classification: 'server-side' as const,
      },
      {
        name: '@aihu-plugin/agent-readiness',
        dir: '/p/agent-readiness',
        hasIndexTs: true,
        classification: 'server-side' as const,
      },
      {
        name: '@aihu/plugin',
        dir: '/p/plugin',
        hasIndexTs: true,
        classification: 'build-dev-only' as const,
      },
      {
        name: '@aihu/compiler',
        dir: '/p/compiler',
        hasIndexTs: false,
        classification: 'build-dev-only' as const,
      },
    ]
    const rows = [
      { name: '@aihu/signals', path: 'x', limit: '1970 B' },
      { name: '@aihu/arbor', path: 'x', limit: '2200 B' },
      { name: '@aihu/runtime', path: 'x', limit: '1170 B' },
      { name: '@aihu-plugin/data', path: 'x', limit: '750 B' },
      { name: '@aihu/router', path: 'x', limit: '1536 B' },
      { name: '@aihu/context', path: 'x', limit: '300 B' },
      { name: '@aihu/agent', path: 'x', limit: '200 B' },
      { name: '@aihu/agent-service', path: 'x', limit: '600 B' },
    ]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('catches a browser-eligible package missing its row', () => {
    const packages = [
      {
        name: '@aihu/signals',
        dir: '/p/signals',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      // imagine a new browser-eligible package added without a row
      {
        name: '@aihu/forms',
        dir: '/p/forms',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
    ]
    const rows = [{ name: '@aihu/signals', path: 'x', limit: '1970 B' }]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('@aihu/forms') && e.includes('no row'))).toBe(true)
  })

  it('exempts a private package from the row requirement (e.g. @aihu/plugin-demo)', () => {
    const packages = [
      {
        name: '@aihu/signals',
        dir: '/p/signals',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      // private demo: browser runtime export, but never published → no contract
      {
        name: '@aihu/plugin-demo',
        dir: '/p/plugin-demo',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
        isPrivate: true,
      },
    ]
    const rows = [{ name: '@aihu/signals', path: 'x', limit: '1970 B' }]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.summary).toContain('1 private, exempt')
  })

  it('catches a server-side package with a forbidden row', () => {
    const packages = [
      {
        name: '@aihu/server',
        dir: '/p/server',
        hasIndexTs: true,
        classification: 'server-side' as const,
      },
    ]
    const rows = [{ name: '@aihu/server', path: 'x', limit: '5 kB' }]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('@aihu/server') && e.includes('MUST NOT'))).toBe(
      true,
    )
  })

  it('catches a build/dev-time-only package with a forbidden row', () => {
    const packages = [
      {
        name: '@aihu/plugin',
        dir: '/p/plugin',
        hasIndexTs: true,
        classification: 'build-dev-only' as const,
      },
    ]
    const rows = [{ name: '@aihu/plugin', path: 'x', limit: '5 kB' }]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('@aihu/plugin') && e.includes('MUST NOT'))).toBe(
      true,
    )
  })

  it('skips packages without src/index.ts (e.g. @aihu/compiler)', () => {
    const packages = [
      {
        name: '@aihu/compiler',
        dir: '/p/compiler',
        hasIndexTs: false,
        classification: 'build-dev-only' as const,
      },
    ]
    const rows: { name: string; path: string; limit: string }[] = []
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(true)
  })

  it('warns about size-limit rows pointing at unknown packages', () => {
    const packages = [
      {
        name: '@aihu/signals',
        dir: '/p/signals',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
    ]
    const rows = [
      { name: '@aihu/signals', path: 'x', limit: '1970 B' },
      { name: '@aihu/ghost', path: 'x', limit: '500 B' },
    ]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.includes('@aihu/ghost'))).toBe(true)
  })
})
