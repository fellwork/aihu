import { describe, expect, it } from 'vitest'
import { createResource } from '../src/resource.ts'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createResource', () => {
  it('starts loading, then resolves data', async () => {
    const r = createResource(async () => 42)
    expect(r.loading).toBe(true)
    expect(r.data).toBe(null)
    await tick()
    expect(r.loading).toBe(false)
    expect(r.data).toBe(42)
    expect(r.error).toBe(null)
  })

  it('captures errors without setting data', async () => {
    const r = createResource<number>(async () => {
      throw new Error('boom')
    })
    await tick()
    expect(r.loading).toBe(false)
    expect(r.error).toBeInstanceOf(Error)
    expect(r.error?.message).toBe('boom')
    expect(r.data).toBe(null)
  })

  it('refetch re-runs the factory', async () => {
    let n = 0
    const r = createResource(async () => ++n)
    await tick()
    expect(r.data).toBe(1)
    await r.refetch()
    expect(r.data).toBe(2)
  })

  it('a superseded run does not clobber fresher data', async () => {
    let call = 0
    const r = createResource<string>(() => {
      call++
      const delay = call === 1 ? 30 : 1
      const val = call === 1 ? 'slow' : 'fast'
      return new Promise((res) => setTimeout(() => res(val), delay))
    })
    void r.refetch() // start the fast (newer) run while the slow first is in flight
    await new Promise((res) => setTimeout(res, 50))
    expect(r.data).toBe('fast')
  })
})
