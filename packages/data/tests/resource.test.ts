// @vitest-environment node

import { runWithContext } from '@scribe/context'
import {
  createResource,
  createResourceSerializer,
  createResourceStore,
  ResourceStoreToken,
} from '@scribe/data'
import { batch, signal } from '@scribe/signals'
import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush all pending microtasks (resolved Promises). */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// Convenience: get state value from a resource
function stateOf<T>(resource: ReturnType<typeof createResource<T>>) {
  return resource.state[0]()
}

// Each test uses its own explicit store to avoid singleton pollution.

// ---------------------------------------------------------------------------
// T1: idle state when key is null
// ---------------------------------------------------------------------------
it('T1: idle state when key is null', () => {
  const store = createResourceStore()
  const fetcher = vi.fn().mockResolvedValue({ id: 1 })
  const keySignal = signal<string | null>(null)
  const resource = createResource(keySignal, fetcher, { store })

  expect(stateOf(resource)).toEqual({ status: 'idle' })
  expect(fetcher).not.toHaveBeenCalled()

  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T2: loading state when key becomes non-null
// ---------------------------------------------------------------------------
it('T2: loading state when key becomes non-null', async () => {
  const store = createResourceStore()
  let resolveP!: (v: string) => void
  const slowFetcher = vi.fn(
    () =>
      new Promise<string>((res) => {
        resolveP = res
      }),
  )

  const [getKey, setKey] = signal<string | null>(null)
  const resource = createResource([getKey, setKey], slowFetcher, { store })

  setKey('/api/test')
  // effect fires synchronously on signal write — state should be loading
  expect(stateOf(resource)).toEqual({ status: 'loading' })

  // cleanup
  resolveP('done')
  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T3: ready state after successful fetch
// ---------------------------------------------------------------------------
it('T3: transitions loading → ready on successful fetch', async () => {
  const store = createResourceStore()
  const fetcher = vi.fn().mockResolvedValue({ id: 1 })
  const resource = createResource(signal('/api/test'), fetcher, { store })

  expect(stateOf(resource)).toEqual({ status: 'loading' })
  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'ready', data: { id: 1 } })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher).toHaveBeenCalledWith('/api/test')

  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T4: error state after failed fetch
// ---------------------------------------------------------------------------
it('T4: transitions loading → error on rejected fetch', async () => {
  const store = createResourceStore()
  const err = new Error('fail')
  const fetcher = vi.fn().mockRejectedValue(err)
  const resource = createResource(signal('/api/test'), fetcher, { store })

  expect(stateOf(resource)).toEqual({ status: 'loading' })
  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'error', error: err })

  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T5: refetch triggers a new fetch
// ---------------------------------------------------------------------------
it('T5: refetch() forces a new fetch with current key', async () => {
  const store = createResourceStore()
  let call = 0
  const fetcher = vi.fn(() => {
    call++
    return Promise.resolve(call === 1 ? 'dataA' : 'dataB')
  })

  const resource = createResource(signal('/api/test'), fetcher, { store })
  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'dataA' })
  expect(fetcher).toHaveBeenCalledTimes(1)

  resource.refetch()
  expect(stateOf(resource)).toEqual({ status: 'loading' })

  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'dataB' })
  expect(fetcher).toHaveBeenCalledTimes(2)

  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T6: invalidate marks stale without immediate refetch
// ---------------------------------------------------------------------------
it('T6: invalidate() marks stale, state unchanged, refetch triggers new fetch', async () => {
  const store = createResourceStore()
  let call = 0
  const fetcher = vi.fn(() => {
    call++
    return Promise.resolve(call === 1 ? 'dataA' : 'dataB')
  })

  const resource = createResource(signal('/api/test'), fetcher, { store })
  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'dataA' })
  expect(fetcher).toHaveBeenCalledTimes(1)

  resource.invalidate()
  // State must still be ready — invalidate does NOT change signal state
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'dataA' })
  // No new fetch yet
  expect(fetcher).toHaveBeenCalledTimes(1)

  // Now refetch — should trigger a fresh fetch because _stale was set
  resource.refetch()
  expect(stateOf(resource)).toEqual({ status: 'loading' })

  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'dataB' })
  expect(fetcher).toHaveBeenCalledTimes(2)

  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T7: key signal change triggers new fetch; stale promise discarded
// ---------------------------------------------------------------------------
it('T7: key change triggers new fetch; previous key fetch result is discarded', async () => {
  const store = createResourceStore()
  // Track resolution functions per key
  const resolvers: Record<string, (v: string) => void> = {}
  const fetcher = vi.fn((k: string) => {
    return new Promise<string>((res) => {
      resolvers[k] = res
    })
  })

  const keySignal = signal<string | null>('/api/a')
  const resource = createResource(keySignal, fetcher, { store })

  // Should be loading for /api/a
  expect(stateOf(resource)).toEqual({ status: 'loading' })
  expect(fetcher).toHaveBeenCalledWith('/api/a')

  // Change key before /api/a resolves
  const [, setKey] = keySignal
  setKey('/api/b')
  expect(stateOf(resource)).toEqual({ status: 'loading' })
  expect(fetcher).toHaveBeenCalledWith('/api/b')

  // Now /api/b resolves
  resolvers['/api/b']?.('dataB')
  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'dataB' })

  // Now /api/a resolves (late) — must NOT update the state
  resolvers['/api/a']?.('dataA')
  await flushMicrotasks()
  // State must still be dataB
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'dataB' })

  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T8: store injection via context
// ---------------------------------------------------------------------------
it('T8: store injection via context — resource uses provided store', async () => {
  const store = createResourceStore()
  const fetcher = vi.fn().mockResolvedValue({ id: 42 })

  const contextMap = new Map([[ResourceStoreToken._id, store]])
  await runWithContext(contextMap, async () => {
    const resource = createResource(signal('/api/test'), fetcher)
    await flushMicrotasks()
    expect(stateOf(resource)).toEqual({ status: 'ready', data: { id: 42 } })
    // The store should have the cached entry
    const cached = store.get('/api/test')
    expect(cached).toEqual({ status: 'ready', data: { id: 42 } })

    ;(resource as { dispose?: () => void }).dispose?.()
  })
})

// ---------------------------------------------------------------------------
// T9: dehydration — createResourceSerializer emits only ready + dehydrate:true
// ---------------------------------------------------------------------------
describe('T9: dehydration via dehydrate option', () => {
  it('emits only ready+dehydratable entries; skips non-dehydratable and non-ready', async () => {
    const store = createResourceStore()
    const fetcher = vi.fn().mockResolvedValue('result')

    // Resource with dehydrate: true
    const r1 = createResource(signal('/api/a'), fetcher, { store, dehydrate: true })
    await flushMicrotasks()
    expect(stateOf(r1)).toEqual({ status: 'ready', data: 'result' })

    // Resource without dehydrate (default false)
    const r2 = createResource(signal('/api/b'), fetcher, { store })
    await flushMicrotasks()

    // Manually set an error entry and mark it dehydratable
    store.set('/api/c', { status: 'error', error: new Error('boom') })
    store.markDehydratable('/api/c')

    const serializer = createResourceSerializer(store)
    const result = serializer() as { resources: Record<string, unknown> }

    // /api/a: ready + dehydratable → included
    expect(result.resources).toHaveProperty('/api/a')
    // /api/b: ready but NOT dehydratable → excluded
    expect(result.resources).not.toHaveProperty('/api/b')
    // /api/c: dehydratable but status=error → excluded
    expect(result.resources).not.toHaveProperty('/api/c')

    ;(r1 as { dispose?: () => void }).dispose?.()
    ;(r2 as { dispose?: () => void }).dispose?.()
  })
})

// ---------------------------------------------------------------------------
// T10: SSR — state pre-loaded from dehydrated data, no fetch fired
// ---------------------------------------------------------------------------
it('T10: pre-populated store → resource starts ready without fetching', () => {
  const store = createResourceStore()
  // Simulate pre-hydrated store (as client entry point would set up)
  store.set('/api/user/1', { status: 'ready', data: { id: 1, name: 'Alice' } })

  const fetcher = vi.fn().mockResolvedValue({ id: 99 })
  const resource = createResource(signal('/api/user/1'), fetcher, { store })

  // Should immediately be ready from cache
  expect(stateOf(resource)).toEqual({ status: 'ready', data: { id: 1, name: 'Alice' } })
  // Fetcher must NOT have been called
  expect(fetcher).not.toHaveBeenCalled()

  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T11: multiple resources share same store — second resource hits cache
// ---------------------------------------------------------------------------
it('T11: multiple resources sharing a store reuse cached results', async () => {
  const store = createResourceStore()
  const fetcher = vi.fn().mockResolvedValue({ shared: true })

  const r1 = createResource(signal('/api/shared'), fetcher, { store })
  await flushMicrotasks()
  expect(stateOf(r1)).toEqual({ status: 'ready', data: { shared: true } })
  expect(fetcher).toHaveBeenCalledTimes(1)

  // r2 uses same key and same store — should hit cache
  const r2 = createResource(signal('/api/shared'), fetcher, { store })
  // Cache hit is synchronous (effect reads store immediately)
  expect(stateOf(r2)).toEqual({ status: 'ready', data: { shared: true } })
  // fetcher must still have been called only once
  expect(fetcher).toHaveBeenCalledTimes(1)

  ;(r1 as { dispose?: () => void }).dispose?.()
  ;(r2 as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// T12: dispose stops the key-watching effect
// ---------------------------------------------------------------------------
it('T12: dispose() stops the key-watching effect', async () => {
  const store = createResourceStore()
  const fetcher = vi.fn().mockResolvedValue('data')
  const keySignal = signal<string | null>(null)
  const resource = createResource(keySignal, fetcher, { store }) as {
    dispose?: () => void
  } & ReturnType<typeof createResource<string>>

  expect(stateOf(resource)).toEqual({ status: 'idle' })

  // Dispose before any key change
  resource.dispose?.()

  // Change key — effect should NOT fire because it's disposed
  const [, setKey] = keySignal
  setKey('/api/after-dispose')

  // Fetcher must never have been called
  expect(fetcher).not.toHaveBeenCalled()
  // State must still be idle
  expect(stateOf(resource)).toEqual({ status: 'idle' })
})

// ---------------------------------------------------------------------------
// LT1: multiple rapid invalidations in one batch → only one refetch fires
//
// Setup: pre-populate the store so the initial effect run takes the cache-hit
// path (reads _staleSignal.read()) and therefore subscribes to it. After that
// subscription is established, batching three invalidate() calls must produce
// exactly one effect re-run and therefore exactly one fetch.
// ---------------------------------------------------------------------------
it('LT1: multiple rapid invalidations in one batch coalesce to a single refetch', async () => {
  const store = createResourceStore()
  // Pre-populate so the initial effect run hits the cache, establishing the
  // reactive subscription to _staleSignal before we call invalidate().
  store.set('/api/test', { status: 'ready', data: 'cached-data' })

  let fetchCount = 0
  const fetcher = vi.fn(() => {
    fetchCount++
    return Promise.resolve(`data-${fetchCount}`)
  })

  const resource = createResource(signal('/api/test'), fetcher, { store })

  // The initial effect run took the cache-hit path — no fetch fired yet.
  expect(fetchCount).toBe(0)
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'cached-data' })

  // Three invalidations inside a single outer batch — should coalesce to one
  // effect re-run and therefore exactly one fetch (not three).
  batch(() => {
    resource.invalidate()
    resource.invalidate()
    resource.invalidate()
  })

  // After the batch drains the effect ran once (stale signal changed false→true
  // exactly once), triggering one _startFetch call.
  expect(fetchCount).toBe(1)

  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'data-1' })
  // Still exactly one fetch — confirms 3 invalidates did not produce 3 fetches.
  expect(fetchCount).toBe(1)

  ;(resource as { dispose?: () => void }).dispose?.()
})

// ---------------------------------------------------------------------------
// LT3: invalidate() after dispose does not throw and does not fire a fetch
// ---------------------------------------------------------------------------
it('LT3: invalidate() after dispose does not throw and does not fire a fetch', async () => {
  const store = createResourceStore()
  const fetcher = vi.fn().mockResolvedValue('data')

  const resource = createResource(signal('/api/test'), fetcher, { store })
  await flushMicrotasks()
  expect(stateOf(resource)).toEqual({ status: 'ready', data: 'data' })

  const handle = resource as { dispose?: () => void }
  handle.dispose?.()

  const fetchCountBefore = fetcher.mock.calls.length

  // invalidate() after dispose — must not throw
  expect(() => resource.invalidate()).not.toThrow()

  // Because the effect is disposed, committing to _staleSignal notifies no
  // subscribers — no new fetch fires.
  expect(fetcher.mock.calls.length).toBe(fetchCountBefore)
})
