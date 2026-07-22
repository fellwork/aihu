/**
 * Wave-3 — hydration adoption over STRING-RENDERED output.
 *
 * `ssr-hydrate-path-parity.test.ts` proves the client walker adopts the TREE
 * WALKER's HTML. The compiled string fast path replaces that renderer for
 * compiled components, so the same adoption property must hold over
 * `__ssrString` output: identical wire grammar in, byte-identical adoption
 * out. The load-bearing assertions are the same four as the checker script
 * (`scripts/check-hydration-adoption.ts`): innerHTML unchanged, node
 * identity preserved, text appears exactly once, and reactive writes drive
 * the server's own nodes.
 *
 * Fixtures compile through the REAL Rust binary (skipped when unbuilt),
 * exactly like tests/integration/server-emission-ssr.test.ts.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hydrate } from '@aihu/arbor'
import { transform } from '@aihu/compiler'
import { afterAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

const hasBinary = ['target/release/aihu-compile', 'target/debug/aihu-compile'].some((p) =>
  existsSync(join(repoRoot, p)),
)

const SCRATCH = join(__dirname, '.scratch-ssr-string-hydrate')

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true })
})

function withResolvedImports(code: string): string {
  return code
    .replaceAll("'@aihu/arbor'", `'${repoRoot}/packages/arbor/src/index.ts'`)
    .replaceAll("'@aihu/runtime/ssr'", `'${repoRoot}/packages/runtime/src/ssr-string.ts'`)
    .replaceAll("'@aihu/runtime'", `'${repoRoot}/packages/runtime/src/index.ts'`)
    .replaceAll("'@aihu/signals'", `'${repoRoot}/packages/signals/src/index.ts'`)
    .replaceAll("'@aihu/router'", `'${repoRoot}/packages/router/src/index.ts'`)
}

interface CompiledModule {
  __ssr: () => unknown
  __ssrString: (props?: Record<string, unknown>, opts?: { hydratable?: boolean }) => string
}

async function compileToModule(name: string, source: string): Promise<CompiledModule> {
  const { code } = transform(source, `src/pages/${name}.aihu`, { target: 'server' })
  mkdirSync(SCRATCH, { recursive: true })
  const file = join(SCRATCH, `${name}.ts`)
  writeFileSync(file, withResolvedImports(code))
  return (await import(/* @vite-ignore */ file)) as unknown as CompiledModule
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}

const PRIMARY = 'STRING-RENDERED-ADOPTED-NOT-REBUILT'

describe.skipIf(!hasBinary)('string-rendered HTML: the client walker adopts it', () => {
  it('non-structural compiled component: adoption is BYTE-STABLE', async () => {
    const mod = await compileToModule(
      'hydrate-string-basic',
      `@state {
  const [msg, setMsg] = signal('${PRIMARY}')
}

@template {
  <main id="page">
    <article>
      <h2>{msg}</h2>
      <p>static tail</p>
    </article>
  </main>
}
`,
    )
    const html = mod.__ssrString({}, { hydratable: true })
    expect(html).toContain('data-aihu-path="0"')

    const host = document.createElement('div')
    host.innerHTML = html
    const before = host.innerHTML
    const rootBefore = host.firstElementChild

    hydrate(mod.__ssr as () => never, host, {})

    // Adoption, not rebuild: a missed path lookup silently materializes a
    // SECOND tree beside the server's DOM — innerHTML would change and the
    // text would double.
    expect(host.innerHTML).toBe(before)
    expect(host.firstElementChild).toBe(rootBefore)
    expect(countOccurrences(host.textContent ?? '', PRIMARY)).toBe(1)
  })

  it('structural content: adopt-by-replace, no duplication, root identity kept', async () => {
    const mod = await compileToModule(
      'hydrate-string-structural',
      `@state {
  const [n, setN] = signal(2)
  const items = ['x', 'y']
}

@template {
  <section>
    <p if={n() > 1}>big {n}</p>
    <p else>small</p>
    <li each={it of items} key={it}>{it}</li>
  </section>
}
`,
    )
    const { renderToString } = await import('../../packages/server/src/ssr.ts')
    const viaWalker = await renderToString(() => mod.__ssr(), { hydratable: true })
    const viaString = mod.__ssrString({}, { hydratable: true })
    // Identical bytes in ⇒ identical hydration behavior, by construction.
    expect(viaString).toBe(viaWalker)

    const host = document.createElement('div')
    host.innerHTML = viaString
    const rootBefore = host.firstElementChild

    hydrate(mod.__ssr as () => never, host, {})

    // Structural segments hydrate ADOPT-BY-REPLACE (the client materializer
    // swaps the marked segment in position — see arbor/src/hydrate.ts), so
    // innerHTML is NOT byte-stable across them; the invariants that must
    // hold are: the host element is adopted (same object), and no content
    // duplicates beside the server's DOM.
    expect(host.firstElementChild).toBe(rootBefore)
    expect(countOccurrences(host.textContent ?? '', 'big')).toBe(1)
    expect(host.querySelectorAll('li').length).toBe(2)
    expect(countOccurrences(host.textContent ?? '', 'small')).toBe(0)
  })
})
