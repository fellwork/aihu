import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('virtual:aihu-routes', () => ({ default: [] }))
vi.mock('@aihu/arbor', () => ({ hydrate: vi.fn(), mount: vi.fn() }))
vi.mock('@aihu/signals', () => ({ signal: vi.fn() }))
vi.mock('@aihu/router', () => ({
  createRouter: vi.fn(() => ({ match: vi.fn(() => null) })),
}))
vi.mock('@aihu/runtime', () => ({
  _setMount: vi.fn(),
  _setSignal: vi.fn(),
  _setHydrate: vi.fn(),
}))

import { createApp } from '../src/client.ts'
import { _setHydrate, _setMount, _setSignal } from '@aihu/runtime'

function makeOutlet(id = 'outlet'): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  document.body.appendChild(el)
  return el
}

describe('createApp — runtime wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('wires _setMount and _setSignal unconditionally', () => {
    makeOutlet()
    createApp()
    expect(_setMount).toHaveBeenCalledOnce()
    expect(_setSignal).toHaveBeenCalledOnce()
  })

  it('wires _setHydrate when no rendering config (default SSR-capable)', () => {
    makeOutlet()
    createApp()
    expect(_setHydrate).toHaveBeenCalledOnce()
  })

  it('wires _setHydrate when mode is "ssr"', () => {
    makeOutlet()
    createApp({ rendering: { mode: 'ssr' } })
    expect(_setHydrate).toHaveBeenCalledOnce()
  })

  it('wires _setHydrate when mode is "hybrid"', () => {
    makeOutlet()
    createApp({ rendering: { mode: 'hybrid' } })
    expect(_setHydrate).toHaveBeenCalledOnce()
  })

  it('skips _setHydrate when mode is "spa"', () => {
    makeOutlet()
    createApp({ rendering: { mode: 'spa' } })
    expect(_setHydrate).not.toHaveBeenCalled()
  })
})

describe('createApp — outlet', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('throws when outlet element is absent', () => {
    expect(() => createApp()).toThrow(/no element with id="outlet"/)
  })

  it('accepts custom outletId', () => {
    makeOutlet('app-root')
    expect(() => createApp({ outletId: 'app-root' })).not.toThrow()
  })

  it('throws with the custom id in the error message', () => {
    expect(() => createApp({ outletId: 'missing' })).toThrow(/id="missing"/)
  })
})

describe('createApp — provide', () => {
  afterEach(() => {
    document.body.replaceChildren()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).testProvided
  })

  it('hoists provided values into globalThis', () => {
    makeOutlet()
    createApp({ provide: { testProvided: 42 } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((globalThis as any).testProvided).toBe(42)
  })
})
