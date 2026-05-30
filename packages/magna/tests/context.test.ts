/**
 * arch-3 M2 (RFC-003) — MagnaFetchToken injection contract.
 *
 * The compiler lowers `$query` / magna-origin `$resource` to
 * `createMagnaResource(inject(MagnaFetchToken), ...)`. This asserts the token
 * is a real context token and that provide/inject round-trips a MagnaFetch.
 */
import { inject, provide, runWithContext } from '@aihu/context'
import { describe, expect, it } from 'vitest'
import { MagnaFetchToken } from '../src/context.js'
import type { MagnaFetch } from '../src/types.js'

describe('MagnaFetchToken', () => {
  it('is a defined context token exported from the package root', async () => {
    const root = await import('../src/index.js')
    expect(root.MagnaFetchToken).toBe(MagnaFetchToken)
    expect(MagnaFetchToken).toBeDefined()
  })

  it('provide/inject round-trips a MagnaFetch', () => {
    const fetch: MagnaFetch = async () => ({ data: { ok: true } as never })

    runWithContext(new Map(), () => {
      provide(MagnaFetchToken, fetch)
      const resolved = inject(MagnaFetchToken)
      expect(resolved).toBe(fetch)
    })
  })

  it('inject returns undefined when no fetch is provided', () => {
    runWithContext(new Map(), () => {
      expect(inject(MagnaFetchToken)).toBeUndefined()
    })
  })
})
