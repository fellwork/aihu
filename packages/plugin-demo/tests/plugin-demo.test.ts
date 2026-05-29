/**
 * @aihu/plugin-demo — vitest test suite.
 *
 * Covers the 3 acceptance surfaces from the consumer contract (Pattern 5):
 *   1. validatePlugin(demo()) returns { ok: true }
 *   2. createDemoRoutes returns a RouteHandler that responds correctly to
 *      GET /__demo/ping → { ok: true, plugin: '@aihu/plugin-demo', version: '0.1.0' }
 *   3. createDemoRuntime drives a reactive signal end-to-end (count, increment)
 */

import { resetValidationState, validatePlugin } from '@aihu/plugin'
import { afterEach, describe, expect, test } from 'vitest'
import { createDemoRoutes, createDemoRuntime, demo } from '../src/index.ts'

// Reset duplicate-namespace tracker between tests so validatePlugin doesn't
// accumulate stale state across describe blocks.
afterEach(() => {
  resetValidationState()
})

// ---------------------------------------------------------------------------
// 1. validatePlugin shape
// ---------------------------------------------------------------------------

describe('@aihu/plugin-demo — validatePlugin', () => {
  test('demo() returns a valid plugin shape (validatePlugin returns { ok: true })', () => {
    const plugin = demo()

    // Brand check
    expect(plugin.__aihu_plugin).toBe(true)

    // Required fields
    expect(plugin.name).toBe('@aihu/plugin-demo')
    expect(plugin.version).toBe('0.1.0')
    expect(plugin.namespace).toBe('demo')

    // Contribution slots exercised: macros, middleware, transforms
    expect(plugin.contributes?.macros).toHaveLength(1)
    expect(plugin.contributes?.macros?.[0]?.name).toBe('$greeting')
    expect(plugin.contributes?.middleware).toHaveLength(1)
    expect(plugin.contributes?.transforms).toHaveLength(1)

    // validatePlugin passes — { ok: true }
    const result = validatePlugin(plugin)
    expect(result.ok).toBe(true)
  })

  test('demo() accepts options and uses greetingName', () => {
    const plugin = demo({ greetingName: 'aihu' })
    expect(plugin.__aihu_plugin).toBe(true)
    // Validate — still valid with options
    const result = validatePlugin(plugin)
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. createDemoRoutes — route handler: Request → Response
// ---------------------------------------------------------------------------

describe('@aihu/plugin-demo — createDemoRoutes', () => {
  test('GET /__demo/ping returns { ok: true, plugin, version }', async () => {
    const routes = createDemoRoutes({})
    const req = new Request('http://localhost/__demo/ping')
    const ctx = { params: {}, url: new URL('http://localhost/__demo/ping') }

    const res = await routes.demoEndpoint(req, ctx)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')

    const body = await res.json()
    expect(body).toEqual({
      ok: true,
      plugin: '@aihu/plugin-demo',
      version: '0.1.0',
    })
  })

  test('createDemoRoutes called with no config still works', async () => {
    const routes = createDemoRoutes()
    const req = new Request('http://localhost/__demo/ping')
    const ctx = { params: {}, url: new URL('http://localhost/__demo/ping') }

    const res = await routes.demoEndpoint(req, ctx)
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// 3. createDemoRuntime — reactive signal end-to-end
// ---------------------------------------------------------------------------

describe('@aihu/plugin-demo — createDemoRuntime', () => {
  test('count starts at 0', () => {
    const runtime = createDemoRuntime()
    expect(runtime.count()).toBe(0)
  })

  test('increment() increases count by 1', () => {
    const runtime = createDemoRuntime()
    runtime.increment()
    expect(runtime.count()).toBe(1)
  })

  test('multiple increments accumulate', () => {
    const runtime = createDemoRuntime()
    runtime.increment()
    runtime.increment()
    runtime.increment()
    expect(runtime.count()).toBe(3)
  })

  test('each createDemoRuntime() call returns an independent counter', () => {
    const a = createDemoRuntime()
    const b = createDemoRuntime()
    a.increment()
    a.increment()
    expect(a.count()).toBe(2)
    expect(b.count()).toBe(0)
  })
})
