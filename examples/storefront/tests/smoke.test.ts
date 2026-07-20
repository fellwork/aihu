/**
 * EX-13 storefront smoke test.
 *
 * Verifies (per m2-a2 round-7 brief):
 *   A6-1:  storefront-root.aihu contains `createResourceSerializer`
 *   A6-2:  storefront-root.aihu contains `createResourceStore`
 *   A6-3:  storefront-root.aihu contains `provide`
 *   A6-4:  storefront-root.aihu contains `CartContext`
 *   A6-5:  storefront-root.aihu exposes agent metadata via v2 `expose:` collection form
 *   A6-6:  product-list.aihu contains `createResource`
 *   A6-7:  product-list.aihu contains `@aihu-plugin/data`
 *   A6-8:  product-list.aihu contains `inject`
 *   A6-9:  product-list.aihu exposes state via v2 `expose:` collection form
 *   A6-10: cart-drawer.aihu contains `inject`
 *   A6-11: cart-drawer.aihu contains `checkout`
 *   A6-12: cart-drawer.aihu contains `Authorization`
 *   A6-13: cart-drawer.aihu contains `demo-token-xyz`
 *   A6-14: cart-drawer.aihu contains `live Stripe binding pending`
 *   A6-15: server.ts contains `requireAuth`
 *   A6-16: server.ts contains `5213`
 *   A6-17: server.ts contains `/api/checkout`
 *   A6-18: server.ts contains `/api/products`
 *   A6-19: Registry simulation — registerAgentMetadata for storefront-root does not throw;
 *          getAllAgentMetadata()[0].tag === 'storefront-root'
 *
 * Harness: source-text + registry simulation. Offline-safe — no network calls.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error — internal test reset not on public types
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

const ROOT_SFC = resolve(__dirname, '../src/storefront-root.aihu')
const PRODUCTS_SFC = resolve(__dirname, '../src/product-list.aihu')
const CART_SFC = resolve(__dirname, '../src/cart-drawer.aihu')
const SERVER_PATH = resolve(__dirname, '../server.ts')

// ---------------------------------------------------------------------------
// A6-1 through A6-5: storefront-root.aihu source-text checks
// ---------------------------------------------------------------------------

describe('EX-13 storefront — storefront-root.aihu source-text checks', () => {
  const sfcSrc = readFileSync(ROOT_SFC, 'utf8')

  it('A6-1: storefront-root.aihu contains createResourceSerializer', () => {
    expect(sfcSrc).toContain('createResourceSerializer')
  })

  it('A6-2: storefront-root.aihu contains createResourceStore', () => {
    expect(sfcSrc).toContain('createResourceStore')
  })

  it('A6-3: storefront-root.aihu contains provide', () => {
    expect(sfcSrc).toContain('provide')
  })

  it('A6-4: storefront-root.aihu contains CartContext', () => {
    expect(sfcSrc).toContain('CartContext')
  })

  it('A6-5: storefront-root.aihu exposes agent metadata via v2 collection form', () => {
    // v2 (#425) retired the `@agent { … }` / `$expose name` forms; agent
    // exposure now rides on a collection entry as `expose: { read | write }`.
    expect(sfcSrc).toContain('expose:')
  })
})

// ---------------------------------------------------------------------------
// A6-6 through A6-9: product-list.aihu source-text checks
// ---------------------------------------------------------------------------

describe('EX-13 storefront — product-list.aihu source-text checks', () => {
  const sfcSrc = readFileSync(PRODUCTS_SFC, 'utf8')

  it('A6-6: product-list.aihu contains createResource', () => {
    expect(sfcSrc).toContain('createResource')
  })

  it('A6-7: product-list.aihu contains @aihu-plugin/data', () => {
    expect(sfcSrc).toContain('@aihu-plugin/data')
  })

  it('A6-8: product-list.aihu contains inject', () => {
    expect(sfcSrc).toContain('inject')
  })

  it('A6-9: product-list.aihu exposes state via v2 collection form', () => {
    // v2 (#425) retired `$expose name`; exposure rides on a collection entry
    // as `expose: { read | write }`.
    expect(sfcSrc).toContain('expose:')
  })
})

// ---------------------------------------------------------------------------
// A6-10 through A6-14: cart-drawer.aihu source-text checks
// ---------------------------------------------------------------------------

describe('EX-13 storefront — cart-drawer.aihu source-text checks', () => {
  const sfcSrc = readFileSync(CART_SFC, 'utf8')

  it('A6-10: cart-drawer.aihu contains inject', () => {
    expect(sfcSrc).toContain('inject')
  })

  it('A6-11: cart-drawer.aihu contains checkout', () => {
    expect(sfcSrc).toContain('checkout')
  })

  it('A6-12: cart-drawer.aihu contains Authorization', () => {
    expect(sfcSrc).toContain('Authorization')
  })

  it('A6-13: cart-drawer.aihu contains demo-token-xyz', () => {
    expect(sfcSrc).toContain('demo-token-xyz')
  })

  it('A6-14: cart-drawer.aihu contains live Stripe binding pending', () => {
    expect(sfcSrc).toContain('live Stripe binding pending')
  })
})

// ---------------------------------------------------------------------------
// A6-15 through A6-18: server.ts source-text checks
// ---------------------------------------------------------------------------

describe('EX-13 storefront — server.ts source-text checks', () => {
  const serverSrc = readFileSync(SERVER_PATH, 'utf8')

  it('A6-15: server.ts contains requireAuth', () => {
    expect(serverSrc).toContain('requireAuth')
  })

  it('A6-16: server.ts contains 5213', () => {
    expect(serverSrc).toContain('5213')
  })

  it('A6-17: server.ts contains /api/checkout', () => {
    expect(serverSrc).toContain('/api/checkout')
  })

  it('A6-18: server.ts contains /api/products', () => {
    expect(serverSrc).toContain('/api/products')
  })
})

// ---------------------------------------------------------------------------
// A6-19: Registry simulation — registerAgentMetadata for storefront-root
// ---------------------------------------------------------------------------

describe('EX-13 storefront — agent metadata registry', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('A6-19: registers storefront-root agent metadata without throwing; tag === storefront-root', () => {
    expect(() => {
      registerAgentMetadata({
        tag: 'storefront-root',
        describes:
          'EX-13: Storefront with createResource product list, @aihu/context cart, and requireAuth checkout',
        state: {
          cartCount: 'Total number of items in the cart',
        },
        actions: {},
      })
    }).not.toThrow()

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('storefront-root')
  })
})
