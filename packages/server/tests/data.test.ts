import { describe, expect, it } from 'vitest'
import { defineLoader, runLoader } from '../src/data.ts'

describe('@scribe/server data', () => {
  it('defineLoader returns a DefinedLoader with correct _brand', () => {
    const loader = defineLoader(async () => 42)
    expect(loader._brand).toBe('DefinedLoader')
  })

  it('defineLoader stores the provided fn', () => {
    const fn = async () => 'hello'
    const loader = defineLoader(fn)
    expect(loader.fn).toBe(fn)
  })

  it('runLoader returns { data, status: 200 } on success', async () => {
    const loader = defineLoader(async () => ({ id: 1, name: 'Test' }))
    const ctx = { params: {}, url: new URL('https://example.com/') }
    const result = await runLoader(loader.fn, ctx)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ id: 1, name: 'Test' })
    expect(result.error).toBeUndefined()
  })

  it('runLoader wraps thrown Error into result.error with status 500', async () => {
    const loader = defineLoader(async () => {
      throw new Error('Load failed')
    })
    const ctx = { params: {}, url: new URL('https://example.com/') }
    const result = await runLoader(loader.fn, ctx)
    expect(result.status).toBe(500)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('Load failed')
  })

  it('runLoader wraps non-Error throws into an Error', async () => {
    const loader = defineLoader(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'string error'
    })
    const ctx = { params: {}, url: new URL('https://example.com/') }
    const result = await runLoader(loader.fn, ctx)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('string error')
  })
})
