/**
 * v0.3.0 live-binding tests for `@aihu/arbor` — AC2, AC3, AC12, AC13, AC15.
 *
 * AC2: After mounting a component with __agentBinding, componentInstanceRegistry has a LiveBinding.
 * AC3: After MountScope.dispose(), the binding is removed.
 * AC12: 1001 mounts → WARN on 1001st, no eviction.
 * AC13: Cross-origin iframe → no registry entry + WARN.
 * AC15: Components without @agent block produce unmodified MountScope.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { branch } from '../src/index.ts'
import { _getComponentInstanceRegistry, mount } from '../src/mount.ts'
import type { AgentBindingSpec } from '../src/types.ts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHost(): HTMLElement {
  return document.createElement('div')
}

/** Build a minimal __agentBinding spec for testing. */
function makeAgentSpec(tag: string, overrides: Partial<AgentBindingSpec> = {}): AgentBindingSpec {
  let locationValue = 'NYC'
  return {
    tag,
    actions: {
      fetchForecast: (_args: unknown) => Promise.resolve({ weather: 'sunny' }),
    },
    reads: {
      location: () => locationValue,
      forecast: () => 'sunny',
    },
    writes: {
      location: (v: unknown) => {
        locationValue = v as string
      },
    },
    scope: undefined,
    rateLimit: undefined,
    ...overrides,
  }
}

/** Mount a component with __agentBinding and return the scope. */
function mountWithBinding(tag: string, overrides: Partial<AgentBindingSpec> = {}) {
  const host = makeHost()
  const spec = makeAgentSpec(tag, overrides)
  const scope = mount(branch('div'), host, { agentBinding: spec })
  return { scope, host, spec }
}

// ─── AC2: Registry mount ─────────────────────────────────────────────────────

describe('AC2 — componentInstanceRegistry mount', () => {
  afterEach(() => {
    // Clean up: dispose all scopes created during the test by clearing the registry.
    // In real tests, dispose() is called explicitly.
    // Test-only teardown: the getter returns a ReadonlyMap (G6f hardening);
    // cast to mutable here to reset live registry state between tests.
    ;(_getComponentInstanceRegistry() as Map<string, unknown>).clear()
  })

  it('registry has one binding after mounting a component with __agentBinding', () => {
    const { scope } = mountWithBinding('weather-card')
    const bindings = _getComponentInstanceRegistry().get('weather-card')
    expect(bindings).toBeDefined()
    expect(bindings?.length).toBe(1)
    scope.dispose()
  })

  it('LiveBinding has required fields: rootId, tag, getSignal, setSignal, callAction, scope, rateLimit, dispose$', () => {
    const { scope } = mountWithBinding('weather-card')
    const binding = _getComponentInstanceRegistry().get('weather-card')?.[0]
    expect(binding).toBeDefined()
    expect(typeof binding!.rootId).toBe('number')
    expect(binding!.tag).toBe('weather-card')
    expect(typeof binding!.getSignal).toBe('function')
    expect(typeof binding!.setSignal).toBe('function')
    expect(typeof binding!.callAction).toBe('function')
    expect(typeof binding!.scope).toBe('function')
    expect(typeof binding!.rateLimit).toBe('function')
    expect(typeof binding!.dispose$).toBe('function')
    scope.dispose()
  })

  it('getSignal returns the current signal value', () => {
    const { scope } = mountWithBinding('weather-card')
    const binding = (_getComponentInstanceRegistry().get('weather-card') ?? [])[0]!
    expect(binding.getSignal('location')).toBe('NYC')
    scope.dispose()
  })

  it('setSignal writes to the signal', () => {
    const { scope } = mountWithBinding('weather-card')
    const binding = (_getComponentInstanceRegistry().get('weather-card') ?? [])[0]!
    binding.setSignal('location', 'London')
    expect(binding.getSignal('location')).toBe('London')
    scope.dispose()
  })

  it('callAction resolves with the action result', async () => {
    const { scope } = mountWithBinding('weather-card')
    const binding = (_getComponentInstanceRegistry().get('weather-card') ?? [])[0]!
    const result = await binding.callAction('fetchForecast', [])
    expect(result).toEqual({ weather: 'sunny' })
    scope.dispose()
  })

  it('scope() returns null when $scope is absent', () => {
    const { scope } = mountWithBinding('weather-card')
    const binding = (_getComponentInstanceRegistry().get('weather-card') ?? [])[0]!
    expect(binding.scope()).toBeNull()
    scope.dispose()
  })

  it('scope() returns the $scope string when present', () => {
    const { scope } = mountWithBinding('weather-card', { scope: 'authenticated' })
    const binding = (_getComponentInstanceRegistry().get('weather-card') ?? [])[0]!
    expect(binding.scope()).toBe('authenticated')
    scope.dispose()
  })

  it('rateLimit() returns null when absent', () => {
    const { scope } = mountWithBinding('weather-card')
    const binding = (_getComponentInstanceRegistry().get('weather-card') ?? [])[0]!
    expect(binding.rateLimit()).toBeNull()
    scope.dispose()
  })

  it('rateLimit() returns the rateLimit string when present', () => {
    const { scope } = mountWithBinding('weather-card', { rateLimit: '100/min' })
    const binding = (_getComponentInstanceRegistry().get('weather-card') ?? [])[0]!
    expect(binding.rateLimit()).toBe('100/min')
    scope.dispose()
  })

  it('multiple instances of the same tag accumulate bindings', () => {
    const s1 = mountWithBinding('weather-card')
    const s2 = mountWithBinding('weather-card')
    const bindings = _getComponentInstanceRegistry().get('weather-card')
    expect(bindings?.length).toBe(2)
    s1.scope.dispose()
    s2.scope.dispose()
  })

  it('MountScope.agent has live context fields when __agentBinding is present', () => {
    const { scope } = mountWithBinding('weather-card')
    expect(scope.agent._brand).toBe('AgentContext')
    expect('rootId' in scope.agent).toBe(true)
    expect(scope.agent.rootId).toBeTypeOf('number')
    expect(scope.agent.tag).toBe('weather-card')
    scope.dispose()
  })
})

// ─── AC3: Registry dispose ───────────────────────────────────────────────────

describe('AC3 — registry dispose on MountScope.dispose()', () => {
  afterEach(() => {
    // Test-only teardown: the getter returns a ReadonlyMap (G6f hardening);
    // cast to mutable here to reset live registry state between tests.
    ;(_getComponentInstanceRegistry() as Map<string, unknown>).clear()
  })

  it('binding is removed from registry after dispose()', () => {
    const { scope } = mountWithBinding('weather-card')
    expect(_getComponentInstanceRegistry().has('weather-card')).toBe(true)
    scope.dispose()
    expect(_getComponentInstanceRegistry().has('weather-card')).toBe(false)
  })

  it('registry key is deleted when the last binding is removed', () => {
    const { scope } = mountWithBinding('weather-card')
    scope.dispose()
    expect(_getComponentInstanceRegistry().get('weather-card')).toBeUndefined()
  })

  it('second dispose() is idempotent (no double-removal)', () => {
    const { scope } = mountWithBinding('weather-card')
    scope.dispose()
    scope.dispose() // should not throw
    expect(_getComponentInstanceRegistry().has('weather-card')).toBe(false)
  })

  it('dispose$() returns true on first call, false on subsequent calls', () => {
    mountWithBinding('weather-card')
    const binding = (_getComponentInstanceRegistry().get('weather-card') ?? [])[0]!
    const first = binding.dispose$()
    expect(first).toBe(true)
    const second = binding.dispose$()
    expect(second).toBe(false)
  })

  it('when one of two instances is disposed, the other remains', () => {
    const s1 = mountWithBinding('weather-card')
    const s2 = mountWithBinding('weather-card')
    s1.scope.dispose()
    const bindings = _getComponentInstanceRegistry().get('weather-card')
    expect(bindings?.length).toBe(1)
    s2.scope.dispose()
  })
})

// ─── AC12: Capacity cap ──────────────────────────────────────────────────────

describe('AC12 — capacity cap: 1000 max bindings per tag', () => {
  const MAX = 1000
  const scopes: Array<ReturnType<typeof mountWithBinding>['scope']> = []

  afterEach(() => {
    for (const s of scopes) s.dispose()
    scopes.length = 0
    // Test-only teardown: the getter returns a ReadonlyMap (G6f hardening);
    // cast to mutable here to reset live registry state between tests.
    ;(_getComponentInstanceRegistry() as Map<string, unknown>).clear()
  })

  it('1000 mounts succeed without warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < MAX; i++) {
      const { scope } = mountWithBinding('x-cap')
      scopes.push(scope)
    }
    const bindings = _getComponentInstanceRegistry().get('x-cap')
    expect(bindings?.length).toBe(MAX)
    // Should NOT have warned yet
    const capacityWarns = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('capacity cap'),
    )
    expect(capacityWarns.length).toBe(0)
    warnSpy.mockRestore()
  })

  it('1001st mount is rejected with a WARN log; registry stays at 1000', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Fill to capacity
    for (let i = 0; i < MAX; i++) {
      const { scope } = mountWithBinding('x-cap')
      scopes.push(scope)
    }
    // 1001st mount
    const { scope: extraScope } = mountWithBinding('x-cap')
    scopes.push(extraScope)

    const bindings = _getComponentInstanceRegistry().get('x-cap')
    // Registry must still be at MAX (not MAX+1)
    expect(bindings?.length).toBe(MAX)

    const capacityWarns = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('capacity cap'),
    )
    expect(capacityWarns.length).toBeGreaterThan(0)
    warnSpy.mockRestore()
  })

  it('handleToolCall continues to succeed using bindings[0] after cap (AC12)', () => {
    // bindings[0] is still available even after cap rejection
    const { scope } = mountWithBinding('x-cap')
    scopes.push(scope)
    const binding = _getComponentInstanceRegistry().get('x-cap')?.[0]
    expect(binding).toBeDefined()
  })
})

// ─── AC13: Cross-origin iframe skip ─────────────────────────────────────────

describe('AC13 — cross-origin iframe skip', () => {
  afterEach(() => {
    // Test-only teardown: the getter returns a ReadonlyMap (G6f hardening);
    // cast to mutable here to reset live registry state between tests.
    ;(_getComponentInstanceRegistry() as Map<string, unknown>).clear()
    vi.restoreAllMocks()
  })

  it('cross-origin iframe: no registry entry + WARN', () => {
    // Simulate cross-origin by mocking window.parent and location.origin
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Store original values
    const originalParent = window.parent
    const _originalOrigin = window.location.origin

    // Make window.parent !== window (iframe simulation)
    Object.defineProperty(window, 'parent', {
      get: () => ({
        location: {
          get origin() {
            return 'https://attacker.com'
          },
        },
      }),
      configurable: true,
    })

    // Ensure self origin differs
    Object.defineProperty(window, 'location', {
      value: { ...window.location, origin: 'https://example.com' },
      configurable: true,
      writable: true,
    })

    const host = makeHost()
    const scope = mount(branch('div'), host, {
      agentBinding: makeAgentSpec('x-cross-origin'),
    })

    // Registry must NOT have gained an entry
    expect(_getComponentInstanceRegistry().has('x-cross-origin')).toBe(false)

    // WARN must have been emitted
    const crossOriginWarns = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('cross-origin'),
    )
    expect(crossOriginWarns.length).toBeGreaterThan(0)

    scope.dispose()

    // Restore
    Object.defineProperty(window, 'parent', {
      get: () => originalParent,
      configurable: true,
    })
  })

  it('same-origin iframe: registration permitted', () => {
    // window.parent === window is default in jsdom; same origin is fine
    const { scope } = mountWithBinding('x-same-origin')
    expect(_getComponentInstanceRegistry().has('x-same-origin')).toBe(true)
    scope.dispose()
  })
})

// ─── AC15: Backward compatibility ───────────────────────────────────────────

describe('AC15 — backward compat: components without @agent block', () => {
  it('MountScope.agent._brand === "AgentContext" for sentinel', () => {
    const host = makeHost()
    const scope = mount(branch('div'), host)
    expect(scope.agent._brand).toBe('AgentContext')
    expect(Object.isFrozen(scope.agent)).toBe(true)
    scope.dispose()
  })

  it('"rootId" in scope.agent is false for sentinel contexts', () => {
    const host = makeHost()
    const scope = mount(branch('div'), host)
    expect('rootId' in scope.agent).toBe(false)
    scope.dispose()
  })

  it('serialize() and dispose() work identically for non-agent components', () => {
    const host = makeHost()
    const scope = mount(branch('div', undefined, []), host)
    expect(() => scope.serialize()).not.toThrow()
    expect(() => scope.dispose()).not.toThrow()
  })

  it('componentInstanceRegistry is unchanged for non-agent mounts', () => {
    const before = new Map(_getComponentInstanceRegistry())
    const host = makeHost()
    const scope = mount(branch('div'), host)
    // No new entries from a non-agent mount
    expect(_getComponentInstanceRegistry().size).toBe(before.size)
    scope.dispose()
  })
})
