// @vitest-environment node

import { describe, expect, test } from 'vitest'

/**
 * Optional-peer guarantee: `drizzle-orm` (and its drivers `postgres` /
 * `@libsql/client`) are OPTIONAL peerDependencies and are NOT installed in this
 * workspace. Importing `@aihu-plugin/drizzle` and using its full API MUST work
 * regardless — the package references Drizzle types only via `import type`
 * (erased at build time) and never `import`s a `drizzle-orm` runtime value.
 *
 * If the adapter ever statically imported `drizzle-orm`, the dynamic import
 * below would reject with a module-resolution error and this test would fail.
 */
describe('optional-peer (drizzle-orm absent)', () => {
  test('drizzle-orm is genuinely not resolvable in this env', async () => {
    // Non-literal specifier so tsc does not try to resolve the (intentionally
    // uninstalled) optional peer at type-check time — this is a RUNTIME probe.
    const peer = ['drizzle', 'orm'].join('-')
    await expect(import(/* @vite-ignore */ peer)).rejects.toBeTruthy()
  })

  test('importing @aihu-plugin/drizzle succeeds with no drizzle-orm installed', async () => {
    const mod = await import('@aihu-plugin/drizzle')
    expect(typeof mod.createDrizzleResource).toBe('function')
    expect(typeof mod.drizzleLoader).toBe('function')
    expect(typeof mod.drizzle).toBe('function')
  })

  test('the full API is usable end-to-end with no Drizzle peer present', async () => {
    const { createDrizzleResource, drizzleLoader } = await import('@aihu-plugin/drizzle')

    // A caller-supplied "db" + query fn — the adapter never inspects the handle
    // nor imports any drizzle runtime, so a plain object stands in fine.
    const db = { tag: 'stub-db' }
    const fetcher = createDrizzleResource(db, async (_d, key: string) => `row:${key}`)
    await expect(fetcher('42')).resolves.toBe('row:42')

    const loader = drizzleLoader(db, async () => ({ ok: true }))
    expect(loader._brand).toBe('DefinedLoader')
  })
})
