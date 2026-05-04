/**
 * v0.6b tests for @scribe/server:
 *   - v0.6.5: BuildTarget type + build.target in defineScribeConfig
 *   - v0.6.7: createServerCall stub
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuildConfig, BuildTarget } from '../src/index.ts'
import { createServerCall, defineScribeConfig } from '../src/index.ts'

// ---------------------------------------------------------------------------
// v0.6.5 — BuildTarget type + ScribeConfig.build
// ---------------------------------------------------------------------------

describe('ScribeConfig — v0.6.5 build.target', () => {
  it('build.target accepts "client"', () => {
    const target: BuildTarget = 'client'
    const cfg = defineScribeConfig({ build: { target } })
    expect(cfg.build?.target).toBe('client')
  })

  it('build.target accepts "server"', () => {
    const target: BuildTarget = 'server'
    const cfg = defineScribeConfig({ build: { target } })
    expect(cfg.build?.target).toBe('server')
  })

  it('build.target accepts "universal"', () => {
    const target: BuildTarget = 'universal'
    const cfg = defineScribeConfig({ build: { target } })
    expect(cfg.build?.target).toBe('universal')
  })

  it('build field is optional — existing configs remain valid', () => {
    const cfg = defineScribeConfig({ server: { cors: { origin: '*' } } })
    expect(cfg.build).toBeUndefined()
  })

  it('BuildConfig target is optional — empty build config is valid', () => {
    const buildCfg: BuildConfig = {}
    const cfg = defineScribeConfig({ build: buildCfg })
    expect(cfg.build?.target).toBeUndefined()
  })

  it('build.target round-trips through defineScribeConfig', () => {
    const cfg = defineScribeConfig({
      server: { basePath: '/api' },
      build: { target: 'universal' },
    })
    expect(cfg.server?.basePath).toBe('/api')
    expect(cfg.build?.target).toBe('universal')
  })
})

// ---------------------------------------------------------------------------
// v0.6.7 — createServerCall
// ---------------------------------------------------------------------------

describe('createServerCall()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a function', () => {
    const stub = createServerCall('my-comp/doThing')
    expect(typeof stub).toBe('function')
  })

  it('calls fetch with the correct URL and method', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 42 }),
      statusText: 'OK',
    })
    vi.stubGlobal('fetch', mockFetch)

    const stub = createServerCall<[number], { result: number }>('my-comp/doThing')
    await stub(1)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/server/_actions/my-comp/doThing')
    expect(init.method).toBe('POST')
  })

  it('serialises args as JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => 'ok',
      statusText: 'OK',
    })
    vi.stubGlobal('fetch', mockFetch)

    const stub = createServerCall<[string, number], string>('comp/fn')
    await stub('hello', 99)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual(['hello', 99])
  })

  it('sets content-type: application/json header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => null,
      statusText: 'OK',
    })
    vi.stubGlobal('fetch', mockFetch)

    const stub = createServerCall('comp/fn')
    await stub()

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('returns the parsed JSON from the response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 7, name: 'Alice' }),
      statusText: 'OK',
    })
    vi.stubGlobal('fetch', mockFetch)

    const stub = createServerCall<[], { id: number; name: string }>('users/getCurrent')
    const result = await stub()
    expect(result).toEqual({ id: 7, name: 'Alice' })
  })

  it('throws when the response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => null,
      statusText: 'Internal Server Error',
    })
    vi.stubGlobal('fetch', mockFetch)

    const stub = createServerCall('comp/fail')
    await expect(stub()).rejects.toThrow('Server action failed: Internal Server Error')
  })

  it('different endpoints produce different URLs', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => null,
      statusText: 'OK',
    })
    vi.stubGlobal('fetch', mockFetch)

    const stub1 = createServerCall('a/fn1')
    const stub2 = createServerCall('b/fn2')
    await stub1()
    await stub2()

    const url1 = (mockFetch.mock.calls[0] as [string, RequestInit])[0]
    const url2 = (mockFetch.mock.calls[1] as [string, RequestInit])[0]
    expect(url1).toBe('/server/_actions/a/fn1')
    expect(url2).toBe('/server/_actions/b/fn2')
  })
})
