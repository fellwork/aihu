/**
 * `__aihu_schild` — the single serialization point for a resolved child
 * component (step 3b of `docs/plans/2026-08-05-ssr-child-components.md`).
 *
 * Both the compiled string renderer and @aihu/server's tree walker call this
 * one function, so a child's markup is produced in exactly one place no matter
 * which renderer is running. That is the whole point of the design: the two
 * paths previously could only drift in bytes (which the differential suite
 * pins); resolving children in each of them separately would have let them
 * drift in CAPABILITY, which nothing pins.
 *
 * The fail-closed rules get the most attention here. Every one of them must
 * return byte-identical output to the pre-child-resolution renderer, because a
 * site that supplies no registry — which is every site until step 5 wires one
 * up — must see no change whatsoever.
 */

import { describe, expect, it, vi } from 'vitest'
import { __aihu_schild, type SsrChildModule, type SsrChildRenderOpts } from '../src/ssr-string.ts'
import { SHADOW_ROOT_MODE } from '../src/types.ts'

const lightChild = (html = '<nav>n</nav>'): SsrChildModule => ({
  __ssrString: () => html,
  __aihu_shadow__: 'light',
  __aihu_light_scope__: 'a1b2c3',
})

const shadowChild = (html = '<nav>n</nav>'): SsrChildModule => ({
  __ssrString: () => html,
  __aihu_shadow__: 'shadow',
})

const registry = (mod: SsrChildModule, tag = 'site-header') =>
  new Map<string, SsrChildModule>([[tag, mod]])

const BARE = '<site-header></site-header>'

describe('fail-closed — output is byte-identical to the pre-resolution renderer', () => {
  it('no opts at all', () => {
    expect(__aihu_schild('site-header', '')).toBe(BARE)
  })

  it('no registry', () => {
    expect(__aihu_schild('site-header', '', { hydratable: true })).toBe(BARE)
  })

  it('registry without this tag', () => {
    const opts = { hydratable: true, children: registry(lightChild(), 'other-tag') }
    expect(__aihu_schild('site-header', '', opts)).toBe(BARE)
  })

  it('module with no __ssrString (the emitter bail list)', () => {
    const opts = { hydratable: true, children: registry({ __aihu_shadow__: 'light' as const }) }
    expect(__aihu_schild('site-header', '', opts)).toBe(BARE)
  })

  it('module with no __aihu_shadow__ — the mode is never guessed', () => {
    // There is no safe default. Emitting a declarative template for a
    // light-DOM component (or host children for a shadow one) produces markup
    // the client can never adopt, so an unknown mode renders nothing.
    const opts = { hydratable: true, children: registry({ __ssrString: () => '<nav>n</nav>' }) }
    expect(__aihu_schild('site-header', '', opts)).toBe(BARE)
  })

  it('a child whose render throws does not take the page down', () => {
    const boom: SsrChildModule = {
      __ssrString: () => {
        throw new Error('child exploded')
      },
      __aihu_shadow__: 'light',
    }
    const opts = { hydratable: true, children: registry(boom) }
    expect(() => __aihu_schild('site-header', '', opts)).not.toThrow()
    expect(__aihu_schild('site-header', '', opts)).toBe(BARE)
  })

  it('reference-site attributes survive on the bare element', () => {
    expect(__aihu_schild('site-header', ' class="x"')).toBe('<site-header class="x"></site-header>')
  })
})

describe('light-DOM child', () => {
  it('renders the tree as host children, with data-a and the adoption marker', () => {
    const out = __aihu_schild('site-header', '', {
      hydratable: true,
      children: registry(lightChild()),
    })
    expect(out).toBe('<site-header data-a="a1b2c3" data-aihu-ssr=""><nav>n</nav></site-header>')
  })

  it('omits the adoption marker on a terminal (non-hydratable) render', () => {
    // Like the path markers, `data-aihu-ssr` is a property of the DESTINATION:
    // terminal output must not carry adoption bytes.
    const out = __aihu_schild('site-header', '', {
      hydratable: false,
      children: registry(lightChild()),
    })
    expect(out).toBe('<site-header data-a="a1b2c3"><nav>n</nav></site-header>')
  })

  it('does NOT pass lightScopeId down to the child render', () => {
    // `data-a` belongs on the host — that is where the client stamps it. A
    // second stamp on the template root would make it a nested scope root and
    // cut the child's own `@scope(…) to ([data-a])` rules off at its first
    // child.
    const render = vi.fn((_props: unknown, _opts?: SsrChildRenderOpts) => '<nav>n</nav>')
    const mod: SsrChildModule = {
      __ssrString: render,
      __aihu_shadow__: 'light',
      __aihu_light_scope__: 'a1b2c3',
    }
    __aihu_schild('site-header', '', { hydratable: true, children: registry(mod) })
    expect(render.mock.calls[0]![1]).not.toHaveProperty('lightScopeId')
  })

  it('escapes the scope id into the attribute', () => {
    const mod: SsrChildModule = {
      __ssrString: () => '',
      __aihu_shadow__: 'light',
      __aihu_light_scope__: 'a"b&c',
    }
    const out = __aihu_schild('site-header', '', { children: registry(mod) })
    expect(out).toContain('data-a="a&quot;b&amp;c"')
  })

  it('renders without data-a when the module declares no scope id', () => {
    const mod: SsrChildModule = { __ssrString: () => '<nav>n</nav>', __aihu_shadow__: 'light' }
    const out = __aihu_schild('site-header', '', { children: registry(mod) })
    expect(out).toBe('<site-header><nav>n</nav></site-header>')
  })
})

describe('shadow-DOM child', () => {
  it('wraps the tree in a declarative shadow root', () => {
    const out = __aihu_schild('site-header', '', {
      hydratable: true,
      children: registry(shadowChild()),
    })
    expect(out).toBe(
      '<site-header data-aihu-ssr=""><template shadowrootmode="open"><nav>n</nav></template></site-header>',
    )
  })

  it('names the mode the runtime attaches with, by import', () => {
    const out = __aihu_schild('site-header', '', { children: registry(shadowChild()) })
    expect(out).toContain(`shadowrootmode="${SHADOW_ROOT_MODE}"`)
    // The runtime attaches `{ mode: SHADOW_ROOT_MODE }`; a closed root would
    // null out `this.shadowRoot` and break the adoption this markup exists for.
    expect(SHADOW_ROOT_MODE).toBe('open')
  })

  it('never stamps data-a on a shadow child', () => {
    // Shadow components are style-isolated by construction — light-DOM scoping
    // does not apply and a stray `data-a` would be a lie about the mode.
    const mod: SsrChildModule = {
      __ssrString: () => '<nav>n</nav>',
      __aihu_shadow__: 'shadow',
      __aihu_light_scope__: 'a1b2c3',
    }
    const out = __aihu_schild('site-header', '', { children: registry(mod) })
    expect(out).not.toContain('data-a=')
  })
})

describe('recursion', () => {
  it('threads the registry into the child so grandchildren resolve', () => {
    const render = vi.fn((_props: unknown, _opts?: SsrChildRenderOpts) => '<nav>n</nav>')
    const children = registry({ __ssrString: render, __aihu_shadow__: 'light' })
    __aihu_schild('site-header', '', { hydratable: true, children })
    expect(render.mock.calls[0]![1]).toMatchObject({ hydratable: true, children })
  })

  it('increments depth on the way down', () => {
    const render = vi.fn((_props: unknown, _opts?: SsrChildRenderOpts) => '')
    const children = registry({ __ssrString: render, __aihu_shadow__: 'light' })
    __aihu_schild('site-header', '', { children, __depth: 4 })
    expect(render.mock.calls[0]![1]?.__depth).toBe(5)
  })

  it('a self-referencing child terminates instead of hanging the build', () => {
    // The registry builder rejects cyclic tag graphs before any render, so
    // reaching the cap means that guard was bypassed or a registry was
    // hand-built. Degrading to the empty element beats taking down a prerender.
    const children = new Map<string, SsrChildModule>()
    children.set('site-header', {
      __aihu_shadow__: 'light',
      __ssrString: (_p, o) => __aihu_schild('site-header', '', o),
    })
    let out = ''
    expect(() => {
      out = __aihu_schild('site-header', '', { children })
    }).not.toThrow()
    expect(out).toContain('<site-header>')
  })
})

describe('shadow child styles (step 4)', () => {
  const styled = (css: string): SsrChildModule => ({
    __ssrString: () => '<nav class="kid">n</nav>',
    __aihu_shadow__: 'shadow',
    __aihu_css__: css,
  })

  it('inlines the CSS inside the template, ahead of the content', () => {
    // Not cosmetic ordering: a shadow root is style-isolated, so a declarative
    // one whose CSS lives outside it paints unstyled until the component's
    // chunk loads — the #754 regression, content rendering ahead of its scoped
    // CSS. Emitting the tree without the styles trades an empty header for a
    // broken one.
    const out = __aihu_schild('site-header', '', {
      hydratable: true,
      children: registry(styled('.kid{color:red}')),
    })
    expect(out).toBe(
      '<site-header data-aihu-ssr=""><template shadowrootmode="open"><style>.kid{color:red}</style><nav class="kid">n</nav></template></site-header>',
    )
  })

  it('emits no <style> when the module carries no CSS', () => {
    const out = __aihu_schild('site-header', '', { children: registry(shadowChild()) })
    expect(out).not.toContain('<style>')
  })

  it('a light-DOM child ignores __aihu_css__ entirely', () => {
    // Light-DOM rules arrive through the app stylesheet's @scope([data-a=…])
    // blocks (#758); inlining a <style> here would duplicate them into the
    // document at every reference site.
    const mod: SsrChildModule = {
      __ssrString: () => '<nav>n</nav>',
      __aihu_shadow__: 'light',
      __aihu_css__: '.kid{color:red}',
    }
    const out = __aihu_schild('site-header', '', { children: registry(mod) })
    expect(out).not.toContain('<style>')
    expect(out).toBe('<site-header><nav>n</nav></site-header>')
  })

  it('escapes </style in a CSS comment so the element cannot close early', () => {
    // <style> is RAW TEXT — no entities, and the only terminator is the literal
    // `</style`. Unescaped, the rest of the stylesheet would spill into the
    // document as markup.
    const out = __aihu_schild('site-header', '', {
      children: registry(styled('/* </style> */ .a{}')),
    })
    expect(out).not.toContain('</style> */')
    expect(out).toContain('<\\/style>')
    // Exactly one real closing tag: the one this helper wrote.
    expect(out.match(/<\/style>/g)?.length).toBe(1)
  })

  it('escapes </style inside a CSS string, where it still renders correctly', () => {
    // `\/` is a valid CSS escape for `/` inside a string, so the authored
    // `content: "</style>"` still produces `</style>` at paint time.
    const out = __aihu_schild('site-header', '', {
      children: registry(styled('.a{content:"</style>"}')),
    })
    expect(out).toContain('content:"<\\/style>"')
    expect(out.match(/<\/style>/g)?.length).toBe(1)
  })
})
