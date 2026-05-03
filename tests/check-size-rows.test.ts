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
    expect(classify('@scribe/signals')).toBe('browser-eligible')
    expect(classify('@scribe/arbor')).toBe('browser-eligible')
    expect(classify('@scribe/runtime')).toBe('browser-eligible')
    expect(classify('@scribe/data')).toBe('browser-eligible')
    expect(classify('@scribe/router')).toBe('browser-eligible')
    expect(classify('@scribe/context')).toBe('browser-eligible')
    expect(classify('@scribe/agent')).toBe('browser-eligible')
    expect(classify('@scribe/agent-service')).toBe('browser-eligible')

    expect(classify('@scribe/server')).toBe('server-side')
    expect(classify('@scribe/agent-readiness')).toBe('server-side')

    expect(classify('@scribe/plugin')).toBe('build-dev-only')
    expect(classify('@scribe/compiler')).toBe('build-dev-only')
  })

  it('passes on a valid configuration (current main snapshot)', () => {
    const packages = [
      {
        name: '@scribe/signals',
        dir: '/p/signals',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@scribe/arbor',
        dir: '/p/arbor',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@scribe/runtime',
        dir: '/p/runtime',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@scribe/data',
        dir: '/p/data',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@scribe/router',
        dir: '/p/router',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@scribe/context',
        dir: '/p/context',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@scribe/agent',
        dir: '/p/agent',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@scribe/agent-service',
        dir: '/p/agent-service',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      {
        name: '@scribe/server',
        dir: '/p/server',
        hasIndexTs: true,
        classification: 'server-side' as const,
      },
      {
        name: '@scribe/agent-readiness',
        dir: '/p/agent-readiness',
        hasIndexTs: true,
        classification: 'server-side' as const,
      },
      {
        name: '@scribe/plugin',
        dir: '/p/plugin',
        hasIndexTs: true,
        classification: 'build-dev-only' as const,
      },
      {
        name: '@scribe/compiler',
        dir: '/p/compiler',
        hasIndexTs: false,
        classification: 'build-dev-only' as const,
      },
    ]
    const rows = [
      { name: '@scribe/signals', path: 'x', limit: '1970 B' },
      { name: '@scribe/arbor', path: 'x', limit: '2200 B' },
      { name: '@scribe/runtime', path: 'x', limit: '1170 B' },
      { name: '@scribe/data', path: 'x', limit: '750 B' },
      { name: '@scribe/router', path: 'x', limit: '1536 B' },
      { name: '@scribe/context', path: 'x', limit: '300 B' },
      { name: '@scribe/agent', path: 'x', limit: '200 B' },
      { name: '@scribe/agent-service', path: 'x', limit: '600 B' },
    ]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('catches a browser-eligible package missing its row', () => {
    const packages = [
      {
        name: '@scribe/signals',
        dir: '/p/signals',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
      // imagine a new browser-eligible package added without a row
      {
        name: '@scribe/forms',
        dir: '/p/forms',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
    ]
    const rows = [{ name: '@scribe/signals', path: 'x', limit: '1970 B' }]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('@scribe/forms') && e.includes('no row'))).toBe(
      true,
    )
  })

  it('catches a server-side package with a forbidden row', () => {
    const packages = [
      {
        name: '@scribe/server',
        dir: '/p/server',
        hasIndexTs: true,
        classification: 'server-side' as const,
      },
    ]
    const rows = [{ name: '@scribe/server', path: 'x', limit: '5 kB' }]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('@scribe/server') && e.includes('MUST NOT'))).toBe(
      true,
    )
  })

  it('catches a build/dev-time-only package with a forbidden row', () => {
    const packages = [
      {
        name: '@scribe/plugin',
        dir: '/p/plugin',
        hasIndexTs: true,
        classification: 'build-dev-only' as const,
      },
    ]
    const rows = [{ name: '@scribe/plugin', path: 'x', limit: '5 kB' }]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('@scribe/plugin') && e.includes('MUST NOT'))).toBe(
      true,
    )
  })

  it('skips packages without src/index.ts (e.g. @scribe/compiler)', () => {
    const packages = [
      {
        name: '@scribe/compiler',
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
        name: '@scribe/signals',
        dir: '/p/signals',
        hasIndexTs: true,
        classification: 'browser-eligible' as const,
      },
    ]
    const rows = [
      { name: '@scribe/signals', path: 'x', limit: '1970 B' },
      { name: '@scribe/ghost', path: 'x', limit: '500 B' },
    ]
    const result = checkPolicy(packages, rows)
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.includes('@scribe/ghost'))).toBe(true)
  })
})
