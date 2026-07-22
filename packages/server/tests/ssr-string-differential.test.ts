// @vitest-environment node
/**
 * Wave-3 keystone — the SSR string fast path's DIFFERENTIAL GATE.
 *
 * The compiled `__ssrString` renderer's whole contract is byte-identity with
 * the tree walker: for the same component+state, `__ssrString(props, opts)`
 * must produce EXACTLY the bytes `renderToString`'s walk over `__ssr(props)`
 * produces — every `data-aihu-path`, every `<!--aihu:s:…-->` structural
 * marker, every `<!--|-->` text-leaf boundary, every escaped byte. These
 * tests run a representative component set through BOTH renderers (the
 * walker via a plain wrapper that hides the fast path; the string fn
 * directly) and assert `toBe` on the full output, hydratable and plain.
 *
 * Real pipeline throughout: Rust compiler binary → server artifact written
 * to scratch → dynamic import in a DOM-less node environment. Mirrors
 * tests/integration/server-emission-ssr.test.ts.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from '@aihu/compiler'
import { afterAll, describe, expect, it } from 'vitest'
import { renderToStream, renderToString } from '../src/ssr.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

const hasBinary = ['target/release/aihu-compile', 'target/debug/aihu-compile'].some((p) =>
  existsSync(join(repoRoot, p)),
)

const SCRATCH = join(__dirname, '.scratch-ssr-string')

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
  __ssr: (props?: Record<string, unknown>) => unknown
  __ssrString?: (props?: Record<string, unknown>, opts?: { hydratable?: boolean }) => string
  default: (props?: Record<string, unknown>) => unknown
}

let seq = 0
async function compileToModule(
  name: string,
  source: string,
): Promise<{ mod: CompiledModule; code: string }> {
  const { code } = transform(source, `src/pages/${name}.aihu`, { target: 'server' })
  mkdirSync(SCRATCH, { recursive: true })
  const file = join(SCRATCH, `${name}.${seq++}.ts`)
  writeFileSync(file, withResolvedImports(code))
  const mod = (await import(/* @vite-ignore */ file)) as unknown as CompiledModule
  return { mod, code }
}

/**
 * The differential assertion: walker bytes (a bare wrapper so the fast path
 * cannot engage) vs compiled-string bytes, both hydration modes, PLUS the
 * public entry (`renderToString(mod.default)` — fast path engaged) against
 * the same bytes.
 */
async function expectByteIdentity(mod: CompiledModule, props?: Record<string, unknown>) {
  expect(typeof mod.__ssrString).toBe('function')
  for (const hydratable of [true, false]) {
    const walker = await renderToString(() => mod.__ssr(props), { hydratable })
    const fast = mod.__ssrString!(props ?? {}, { hydratable })
    expect(fast).toBe(walker)
    if (props === undefined) {
      const publicPath = await renderToString(mod.default, { hydratable })
      expect(publicPath).toBe(walker)
    }
  }
}

describe.skipIf(!hasBinary)('SSR string fast path — differential byte-identity', () => {
  it('precondition: DOM-less environment', () => {
    expect(typeof HTMLElement).toBe('undefined')
  })

  it('static-only component (folds to pure literals)', async () => {
    const { mod, code } = await compileToModule(
      'diff-static',
      `@template {
  <main class="page" data-kind="static">
    <h1>Title &amp; more</h1>
    <img src="/x.png" alt="a&quot;b">
    <br>
    <p>1 &lt; 2 &gt; 0</p>
  </main>
}
`,
    )
    expect(code).toContain('export const __ssrString')
    await expectByteIdentity(mod)
    // Sanity on the folded shape: the walker closes every branch tag
    // (leaf.element voids are not emitted by the compiler).
    const html = mod.__ssrString!({}, { hydratable: true })
    expect(html).toContain('data-aihu-path="0"')
    expect(html).toContain('Title &amp; more')
  })

  it('interpolations: signals, getter calls, eager projections, escaping', async () => {
    const { mod } = await compileToModule(
      'diff-interp',
      `@state {
  const [count, setCount] = signal(3)
  const [name, setName] = signal('a<b&"c')
  const label = () => 'L' + count()
  const plain = 'static <text>'
}

@template {
  <div>
    <h1>Hello {name} you have {count} items</h1>
    <p>{label()} and {count() * 2} and {plain}</p>
    <span>{count() > 2 ? 'many' : 'few'}</span>
  </div>
}
`,
    )
    await expectByteIdentity(mod)
    const html = mod.__ssrString!({}, { hydratable: true })
    expect(html).toContain('a&lt;b&amp;"c')
    expect(html).toContain('<!--|-->')
  })

  it('reactive + static + computed-expression attributes, class array form, bind/on', async () => {
    const { mod } = await compileToModule(
      'diff-attrs',
      `@state {
  const [cls, setCls] = signal('on')
  const [count, setCount] = signal(1)
  const [text, setText] = signal('t')
  const inc = () => setCount(count() + 1)
}

@template {
  <section data-x="a&b">
    <p class={cls} title={count() > 0 ? 'pos"itive' : 'neg'}>x</p>
    <p class={['base', count() > 0 && 'pos']}>y</p>
    <input bind:value={text}>
    <button onclick={inc} on:click.prevent={inc}>go</button>
  </section>
}
`,
    )
    await expectByteIdentity(mod)
    const html = mod.__ssrString!({}, { hydratable: false })
    // Reactive attrs resolve to VALUES (the serializeAttrs fix) — never
    // function source; event handlers never serialize.
    expect(html).toContain('class="on"')
    expect(html).toContain('title="pos&quot;itive"')
    expect(html).toContain('class="base pos"')
    expect(html).toContain('value="t"')
    expect(html).not.toContain('=>')
  })

  it('if / elseif / else chains and lone-if attribute form', async () => {
    const { mod } = await compileToModule(
      'diff-if',
      `@state {
  const [n, setN] = signal(1)
}

@template {
  <div>
    <p if={n() === 0}>zero</p>
    <p elseif={n() === 1}>one</p>
    <p else>many</p>
    <span if={n() > 0}>lone-if body</span>
  </div>
}
`,
    )
    await expectByteIdentity(mod)
    const html = mod.__ssrString!({}, { hydratable: true })
    // All three chain branches carry markers even when inactive.
    expect(html).toContain('<!--aihu:s:0.0.0-->')
    expect(html).toContain('<!--aihu:s:0.0.1-->')
    expect(html).toContain('<!--aihu:s:0.0.2-->')
  })

  it('each: keyed, unkeyed, nested, group-each fragments, empty arm, path-hostile keys', async () => {
    const { mod } = await compileToModule(
      'diff-each',
      `@state {
  const [rows, setRows] = signal([
    { id: 'a.dot', label: 'A' },
    { id: 'b-dash', label: 'B<' },
  ])
  const none = []
  const groups = [['g1', ['x', 'y']], ['g2', []]]
}

@template {
  <div>
    <ul>
      <li each={r of rows()} key={r.id} data-k={r.id}>{r.label}</li>
    </ul>
    <group each={g of groups}>
      <h2>{g[0]}</h2>
      <ol>
        <li each={c of g[1]}>{c}</li>
      </ol>
    </group>
    <p each={x of none}>{x}</p>
    <p empty>nothing here</p>
  </div>
}
`,
    )
    await expectByteIdentity(mod)
    const html = mod.__ssrString!({}, { hydratable: true })
    // Dots in keys fold to `_` in paths; dashes fold to `_` in comment
    // markers but stay verbatim in the path attribute.
    expect(html).toContain('.list.a_dot')
    expect(html).toContain('data-aihu-path="0.0.0.list.b-dash"')
    expect(html).toContain('nothing here')
  })

  it('structural churn: same template, different state shapes, still identical', async () => {
    const src = (init: string) => `@state {
  const [items, setItems] = signal(${init})
  const [open, setOpen] = signal(${init.length % 2 === 0 ? 'true' : 'false'})
}

@template {
  <div>
    <details if={open()}>
      <p each={it, i of items()} key={i}>{it}</p>
    </details>
    <span else>closed</span>
  </div>
}
`
    for (const init of ["['a']", "['a','b','c']", '[]']) {
      const { mod } = await compileToModule('diff-churn', src(init))
      await expectByteIdentity(mod)
    }
  })

  it('mount-time effect directives (class:/show/ref) are SSR-transparent, not crashes', async () => {
    const { mod } = await compileToModule(
      'diff-effects',
      `@state {
  const [on, setOn] = signal(true)
  let el = null
}

@template {
  <div>
    <button class:active={on()} show={on()} ref={el}>go</button>
  </div>
}
`,
    )
    // Pre-slice, the un-guarded onMount registration threw SCR-R0010
    // ('no owner') on every host-less render of these directives.
    await expectByteIdentity(mod)
    const html = mod.__ssrString!({}, { hydratable: true })
    expect(html).toContain('<button')
  })

  it('enhanced <a> (internal), opted-out <a> (external), dynamic href', async () => {
    const { mod } = await compileToModule(
      'diff-anchor',
      `@state {
  const [slug, setSlug] = signal('post-1')
}

@template {
  <nav>
    <a href="/about" class="lnk">About</a>
    <a href={'/blog/' + slug()}>Post</a>
    <a href="https://ext.example" target="_blank">Ext</a>
  </nav>
}
`,
    )
    await expectByteIdentity(mod)
    const html = mod.__ssrString!({}, { hydratable: false })
    expect(html).toContain('href="/about"')
    expect(html).toContain('data-aihu-link=""')
    expect(html).toContain('href="/blog/post-1"')
    // The external anchor renders plain — no SPA enhancement bytes.
    expect(html).toContain('<a href="https://ext.example" target="_blank">Ext</a>')
  })

  it('options-form ($prop) artifact threads props through both renderers', async () => {
    const { mod, code } = await compileToModule(
      'diff-props',
      `@state {
  $prop: {
    route: {
      type: { params: { slug: string }; data: { title: string } },
    },
  }
}

@template {
  <article>
    <h1>{route.data.title}</h1>
    <p>{route.params.slug}</p>
  </article>
}
`,
    )
    expect(code).toContain('export const __ssrString')
    const props = { route: { params: { slug: 's-1' }, data: { title: 'T&T' } } }
    await expectByteIdentity(mod, props)
    const html = mod.__ssrString!(props, { hydratable: true })
    expect(html).toContain('T&amp;T')
    expect(html).toContain('s-1')
  })

  it('AIHU_SSR_STRING=0 escape hatch routes the public entry back to the walker', async () => {
    const { mod } = await compileToModule(
      'diff-hatch',
      `@state {
  const [n, setN] = signal(7)
}

@template {
  <p>{n}</p>
}
`,
    )
    const before = process.env.AIHU_SSR_STRING
    try {
      process.env.AIHU_SSR_STRING = '0'
      const viaWalker = await renderToString(mod.default, { hydratable: true })
      delete process.env.AIHU_SSR_STRING
      const viaFast = await renderToString(mod.default, { hydratable: true })
      // Both paths, same bytes — the hatch changes the engine, never output.
      expect(viaWalker).toBe(viaFast)
      expect(viaFast).toBe(mod.__ssrString!({}, { hydratable: true }))
    } finally {
      if (before === undefined) delete process.env.AIHU_SSR_STRING
      else process.env.AIHU_SSR_STRING = before
    }
  })

  it('unsupported constructs bail: no __ssrString export, walker unaffected', async () => {
    const { mod, code } = await compileToModule(
      'diff-bail',
      `@state {
  const src = { status: 'ready', value: 1, onReady: () => () => {} }
}

@template {
  <div>
    <suspense source={src}>
      <p>loaded</p>
    </suspense>
  </div>
}
`,
    )
    expect(code).not.toContain('__ssrString')
    expect(mod.__ssrString).toBeUndefined()
    // The walker remains the renderer of record for bailed templates. (The
    // suspense boundary's SSR stub renders its fallback slot — empty here —
    // so the observable walker output is the bare wrapper.)
    const html = await renderToString(mod.default, { hydratable: true })
    expect(html).toBe('<div data-aihu-path="0"></div>')
  })

  it('dataSource trees (hand-built) never carry a string renderer; streaming intact', async () => {
    // Compiled templates cannot produce dataSource branches — this shape only
    // exists for hand-built trees, which have no __ssrString by construction.
    const readySource = {
      status: 'ready' as const,
      value: 42,
      onReady: (_cb: () => void) => () => {},
    }
    const component = () => ({
      kind: 'branch',
      tag: 'div',
      attrs: { id: 'ds' },
      children: [{ kind: 'leaf', leafKind: 'text', value: 'data', tag: null, attrs: null }],
      dataSource: readySource,
    })
    const stream = renderToStream(component)
    const reader = stream.getReader()
    const chunks: string[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    expect(chunks.join('')).toBe('<div id="ds">data</div>')
  })
})
