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
 * Wave-3 integration seam. The `__aihu_state__` script is post-render CHANNEL
 * data appended by `renderToStream`'s emission site — NOT part of either
 * renderer's MARKUP. The walker path harvests component-local signals via its
 * post-render arbor tree walk (`_collectSignals`); the compiled string path
 * builds no arbor tree, so it emits an EMPTY signals map (stores still ride
 * along, arbor-independent). The two paths therefore legitimately diverge on
 * the signals channel while their MARKUP stays byte-identical. This gate pins
 * the MARKUP (the string renderer's actual contract, per this file's
 * docblock); the state channel is covered by the parity + state-channel
 * suites. See the seam commentary in packages/server/src/ssr.ts.
 */
const STATE_SCRIPT = /<script type="application\/json" id="__aihu_state__">.*?<\/script>$/s
function markup(html: string): string {
  return html.replace(STATE_SCRIPT, '')
}

/**
 * The differential assertion: walker MARKUP (a bare wrapper so the fast path
 * cannot engage) vs compiled-string bytes, both hydration modes, PLUS the
 * public entry (`renderToString(mod.default)` — fast path engaged) against
 * the same markup. The walker's post-render signals channel is stripped
 * before comparison (see `markup`): the string renderer emits markup only,
 * and byte-identity is a claim about the markup.
 */
async function expectByteIdentity(mod: CompiledModule, props?: Record<string, unknown>) {
  expect(typeof mod.__ssrString).toBe('function')
  for (const hydratable of [true, false]) {
    const walker = await renderToString(() => mod.__ssr(props), { hydratable })
    const fast = mod.__ssrString!(props ?? {}, { hydratable })
    expect(fast).toBe(markup(walker))
    if (props === undefined) {
      const publicPath = await renderToString(mod.default, { hydratable })
      expect(markup(publicPath)).toBe(markup(walker))
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
      // Same MARKUP — the hatch changes the engine, never the markup.
      expect(markup(viaWalker)).toBe(markup(viaFast))
      expect(markup(viaFast)).toBe(mod.__ssrString!({}, { hydratable: true }))
      // The wave-3 seam, made observable: this component's `{n}` is a
      // component-local signal. The walker engine harvests it into an
      // `__aihu_state__` signals channel via its post-render tree walk; the
      // string engine builds no tree and (with no store serializer here)
      // emits no state script at all. The hatch thus changes the signals
      // channel even though the markup is identical — the documented v1
      // limitation of string-path rendering.
      expect(viaWalker).toContain('id="__aihu_state__"')
      expect(viaWalker).toContain('"0.0.text":7')
      expect(viaFast).not.toContain('__aihu_state__')
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

  it('lightScopeId stamps data-a on the root — byte-identical across both renderers', async () => {
    // LDF §10 step 3: `root_scope_attr` (string emit) reads
    // `__opts.lightScopeId`; the walker reads `SsrOptions.lightScopeId`. Both
    // stamp the ROOT element only, between the static attrs and the path
    // marker — this pins the placement AND the parity, in both hydration
    // modes, plus the unstamped default staying unstamped.
    const { mod } = await compileToModule(
      'diff-light-scope',
      `@template {
  <section class="card">
    <h2>Scoped</h2>
  </section>
}
`,
    )
    const ssrString = mod.__ssrString as (
      props?: Record<string, unknown>,
      opts?: { hydratable?: boolean; lightScopeId?: string },
    ) => string
    for (const hydratable of [true, false]) {
      const walker = await renderToString(() => mod.__ssr(), {
        hydratable,
        lightScopeId: 'deadbee1',
      })
      const fast = ssrString({}, { hydratable, lightScopeId: 'deadbee1' })
      expect(fast).toBe(markup(walker))
      expect(fast).toContain(' data-a="deadbee1"')
      // Root only.
      expect(fast.match(/ data-a="/g)).toHaveLength(1)
    }
    // Placement: static attrs, then data-a, then the path marker.
    expect(ssrString({}, { hydratable: true, lightScopeId: 'deadbee1' })).toContain(
      '<section class="card" data-a="deadbee1" data-aihu-path="0">',
    )
    // Undefined stays unstamped on both paths.
    expect(ssrString({}, { hydratable: true })).not.toContain('data-a=')
    expect(await renderToString(() => mod.__ssr(), { hydratable: true })).not.toContain('data-a=')
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

// ─── Child component resolution (SSR children step 3d) ──────────────────────
//
// The gate that made the whole design worth its cost. A resolved child must
// come out byte-identical from BOTH renderers, because both call the same
// `__aihu_schild`. The rejected alternative — implementing resolution only in
// the walker and declining the fast path whenever a registry was supplied —
// would have forced this suite's contract to be WEAKENED to "identical unless
// a registry is present". Here it is instead strengthened: identity now covers
// resolved child subtrees, in both shadow modes, at depth.

/** Byte-identity with a child registry threaded into both renderers. */
async function expectByteIdentityWithChildren(
  mod: CompiledModule,
  children: ReadonlyMap<string, unknown>,
) {
  expect(typeof mod.__ssrString).toBe('function')
  for (const hydratable of [true, false]) {
    const opts = { hydratable, children } as Parameters<typeof renderToString>[1]
    const walker = await renderToString(() => mod.__ssr(), opts)
    const fast = (mod.__ssrString as (p: unknown, o?: unknown) => string)(
      {},
      { hydratable, children },
    )
    expect(fast).toBe(markup(walker))
  }
}

describe.skipIf(!hasBinary)('SSR string fast path — resolved child components', () => {
  const PARENT = `@template {
  <main class="page"><h1>Title</h1><x-kid></x-kid></main>
}
`
  const CHILD = `@template {
  <nav class="kid"><span>nav</span></nav>
}
`

  it('a light-DOM child renders identically on both paths', async () => {
    const parent = await compileToModule('diff-parent-light', PARENT)
    const kid = await compileToModule('diff-kid-light', CHILD)
    const children = new Map([
      ['x-kid', { ...kid.mod, __aihu_shadow__: 'light', __aihu_light_scope__: 'k1' }],
    ])
    await expectByteIdentityWithChildren(parent.mod, children)

    // …and it is actually FILLED IN, not just consistently empty. Two renderers
    // agreeing on nothing would satisfy byte-identity while shipping the very
    // bug this work exists to fix.
    const html = (parent.mod.__ssrString as (p: unknown, o?: unknown) => string)(
      {},
      { hydratable: true, children },
    )
    expect(html).toContain('<nav class="kid"')
    expect(html).toContain('data-a="k1"')
    expect(html).toContain('data-aihu-ssr=""')
  })

  it('a shadow-DOM child renders identically on both paths', async () => {
    const parent = await compileToModule('diff-parent-shadow', PARENT)
    const kid = await compileToModule('diff-kid-shadow', CHILD)
    const children = new Map([['x-kid', { ...kid.mod, __aihu_shadow__: 'shadow' }]])
    await expectByteIdentityWithChildren(parent.mod, children)

    const html = (parent.mod.__ssrString as (p: unknown, o?: unknown) => string)(
      {},
      { hydratable: true, children },
    )
    expect(html).toContain('<template shadowrootmode="open">')
    expect(html).toContain('<nav class="kid"')
  })

  it('a grandchild resolves through the child, identically on both paths', async () => {
    const parent = await compileToModule('diff-parent-deep', PARENT)
    const kid = await compileToModule(
      'diff-kid-deep',
      `@template {
  <nav class="kid"><x-grandkid></x-grandkid></nav>
}
`,
    )
    const grandkid = await compileToModule(
      'diff-grandkid',
      `@template {
  <b class="gk">deep</b>
}
`,
    )
    const children = new Map<string, unknown>([
      ['x-kid', { ...kid.mod, __aihu_shadow__: 'light' }],
      ['x-grandkid', { ...grandkid.mod, __aihu_shadow__: 'light' }],
    ])
    await expectByteIdentityWithChildren(parent.mod, children)

    const html = (parent.mod.__ssrString as (p: unknown, o?: unknown) => string)(
      {},
      { hydratable: true, children },
    )
    expect(html).toContain('<b class="gk" data-aihu-path="0">deep</b>')
    // Each nested host restarts its own path space at ROOT_PATH behind its own
    // `data-aihu-ssr` boundary — which is what makes the paths non-colliding
    // and is exactly what arbor's hydrate() expects of a nested marked host.
    expect(html).toContain('<x-grandkid data-aihu-path="0.0" data-aihu-ssr="">')
  })

  it('an unresolved tag stays an empty element on both paths', async () => {
    const parent = await compileToModule('diff-parent-unresolved', PARENT)
    // A registry that does not know this tag — the common case for any
    // third-party custom element on the page.
    const children = new Map<string, unknown>([['x-other', {}]])
    await expectByteIdentityWithChildren(parent.mod, children)

    const html = (parent.mod.__ssrString as (p: unknown, o?: unknown) => string)(
      {},
      { hydratable: true, children },
    )
    expect(html).toContain('<x-kid')
    expect(html).not.toContain('<nav class="kid"')
  })

  it('no registry at all is byte-identical to the pre-resolution renderer', async () => {
    // The safety property that lets 3a/3b/3c ship ahead of the callers that
    // populate the registry: every existing site renders exactly as before.
    const parent = await compileToModule('diff-parent-noreg', PARENT)
    await expectByteIdentity(parent.mod)
    const html = (parent.mod.__ssrString as (p: unknown, o?: unknown) => string)(
      {},
      { hydratable: true },
    )
    expect(html).toContain('<x-kid data-aihu-path="0.1"></x-kid>')
  })
})
