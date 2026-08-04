/**
 * The node wire format, asserted against the BUILT package.
 *
 * WHY THIS FILE EXISTS, AND WHY IT MUST NOT IMPORT `@aihu/arbor`.
 *
 * Every other test in this repo resolves `@aihu/arbor` through the alias in
 * `vitest.config.ts`, which points at `packages/arbor/src`. That is normally a
 * convenience. For this one property it is a blind spot, because
 * `scripts/mangle-dist.mjs` rewrites property names in `dist/index.js` AFTER
 * rolldown runs — so `src` and `dist` can disagree about the shape of an
 * object, and only `dist` is what consumers actually receive.
 *
 * They did disagree. `structuralKind`, `condition`, `listGrow` and `keyFn`
 * were mangled to `sk`/`cn`/`lg`/`kf`, while `@aihu/server`'s
 * `_structuralSubtrees` reads the long names. Against the built package every
 * branch missed, the function returned `[]`, and EVERY `each` and EVERY `if`
 * server-rendered as an empty pair of structural markers — in every SSR and
 * SSG build. Nothing failed, anywhere, because the failure mode of a mangled
 * field is `undefined === 'list'` taking the quiet path, and because the
 * entire suite was reading `src`.
 *
 * So this file imports the built file by RELATIVE PATH deliberately. If you
 * "fix" it to use the package name, it stops testing the thing it exists for.
 *
 * If this test fails with a missing `dist/index.js`, run `bun run build` in
 * packages/arbor first — the built artifact is the subject under test.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.js')

/**
 * The built module is loaded by path, so it carries no types — deliberately.
 * Importing the package's declarations would describe `src`, which is the very
 * thing this file exists NOT to trust. The factories are therefore typed as
 * loose callables returning a bag of unknowns, and every field is asserted at
 * runtime below.
 */
type NodeBag = Record<string, unknown>
interface Dist {
  each: (list: unknown, key: unknown, grow: unknown) => NodeBag
  when: (condition: unknown, grow: unknown) => NodeBag
}

const load = async (): Promise<Dist> =>
  (await import(/* @vite-ignore */ DIST)) as unknown as Dist

describe('@aihu/arbor dist — node wire format', () => {
  it('has a built dist to test', () => {
    expect(existsSync(DIST)).toBe(true)
  })

  // The exact four fields `@aihu/server`'s `_structuralSubtrees` reads. Named
  // individually rather than snapshotted so a failure says which one moved.
  it('each() keeps the field names @aihu/server reads', async () => {
    const { each } = await load()
    const node = each(
      () => [{ id: 'a' }],
      (i: { id: string }) => i.id,
      (i: { id: string }) => ({ kind: 'leaf', leafKind: 'text', value: i.id }),
    )

    expect(node.kind).toBe('structural')
    expect(node.structuralKind).toBe('list')
    expect(typeof node.listGrow).toBe('function')
    expect(typeof node.keyFn).toBe('function')
    expect(node.list).toBeDefined()
  })

  it('when() keeps the field names @aihu/server reads', async () => {
    const { when } = await load()
    const node = when(
      () => true,
      () => ({ kind: 'leaf', leafKind: 'text', value: 'x' }),
    )

    expect(node.kind).toBe('structural')
    expect(node.structuralKind).toBe('conditional')
    expect(node.condition).toBeDefined()
    expect(typeof node.grow).toBe('function')
  })

  // The regression in its own terms: a consumer walking the node the way
  // `_structuralSubtrees` does must reach the items. This is the assertion
  // that would have gone red the day the mangle list grew.
  it('a server-style walk over a dist each() node yields its items', async () => {
    const { each } = await load()
    const items = [{ id: 'a' }, { id: 'b' }]
    const node = each(
      () => items,
      (i: { id: string }) => i.id,
      (i: { id: string }) => ({ kind: 'leaf', leafKind: 'text', value: i.id }),
    )

    // Mirrors packages/server/src/ssr.ts `_structuralSubtrees`.
    expect(node.structuralKind).toBe('list')
    const grow = node.listGrow as (item: unknown, i: number) => { value: string }
    const list = typeof node.list === 'function' ? node.list() : node.list
    const rendered = (list as Array<{ id: string }>).map((it, i) => grow(it, i).value)

    expect(rendered).toEqual(['a', 'b'])
  })
})
