# SSR child custom-element resolution — light DOM and shadow DOM

Status: **design agreed, not started.** Plan of record.

## The defect

`<site-header>` renders empty in every prerendered page on aihu.dev. Verified live:

```
<site-header>   inner=0   EMPTY
<weather-demo>  inner=0   EMPTY
```

…while the route component's own content renders fine (2,687 chars of hero copy
on `/`). So the boundary is exact: **a component renders its own template, but a
custom element referenced inside that template renders as an empty shell.**

`renderNodeAsync`'s branch path (`packages/server/src/ssr.ts:642`) does:

```js
controller.enqueue(`<${tag}${attrStr}>`)
for (const child of children) { … }      // children.length === 0
controller.enqueue(`</${tag}>`)
```

When a layout writes `<site-header></site-header>`, the arbor node is
`branch('site-header', {}, [])` — zero children. The child's template lives in
its own module and is only materialised when the element upgrades in the browser
(`connectedCallback` → `_build`). The renderer emits an empty element because it
has no way to know that tag maps to a component. Nothing is broken; a capability
is missing.

### Why it matters

- No site navigation in prerendered HTML on any page — crawlers and agents see a
  site with no nav, which cuts directly against aihu's "exposed for agents" thesis.
- The header is above the fold, so it paints late even after the #762 adoption win.
- **It blocks SSG/hybrid-SSG for consumers.** fellwork.com uses `<site-nav>` ×5,
  `<site-footer>` ×5, `<passage-picker>` ×5, `<hero-section>`, `<exegesis-section>`,
  `<workspace-sidebar>`, `<command-palette>` and more. Prerender there today and
  every one comes out empty.

## What already exists (and why this is tractable)

`renderToString`'s `wrapTag` path already emits exactly the shape needed:

```html
<site-header data-a="…" data-aihu-ssr="">…tree…</site-header>
```

And per `ssr.ts:1181`, arbor's `hydrate()` **already treats a nested marked host
as a path boundary** — "each wrapped render restarts `data-aihu-path` at
ROOT_PATH, so without the boundary an outer component's path map would collide
with every nested wrapped render". Nested wrapped renders are already a supported
client concept, from #759 and #762.

So the server needs a **resolver**, then recursion through machinery it already
has. No new wire format for the light-DOM case, and no client work.

The seam is even pre-named: `tests/integration/server-emission-ssr.test.ts`
describes `@aihu/app`'s `resolveComponent` finding `mod.default`. It was
designed, documented, and never written — the same shape as `contextSetup`
(#749) and `_injectLightScopeId` (#758).

## Both modes are in scope

Non-negotiable: this is a framework with both kinds of users. A light-DOM-only
fix would not fill in aihu.dev's own `<site-header>` (it takes the default,
`shadow`), nor unblock fellwork (whose `vite.config.ts` documents "Default
shadow DOM").

| mode | emission |
|---|---|
| `shadow: 'light'` | `<site-header data-a="…" data-aihu-ssr="">…tree…</site-header>` |
| `shadow: 'shadow'` | `<site-header data-aihu-ssr=""><template shadowrootmode="open">…tree…</template></site-header>` |

### Vocabulary boundary — DECIDED

`ShadowMode = 'light' | 'shadow'` is aihu's authoring vocabulary and stays the
currency through compiler → server → emitter. The DOM's `ShadowRootMode`
(`open`/`closed`) is a **different enum that merely shares the word "mode"**, and
it appears exactly once, at the serialisation boundary:

```
shadow: 'shadow'  →  shadowrootmode="open"     // the ONLY value aihu emits
shadow: 'light'   →  no template; tree renders as host children
```

`open` is never an authored value. `types.ts` already states why no `'closed'`
exists: "composition and hydration read `this.shadowRoot`, which a closed root
nulls out." DSD does not change that — closed roots would break the same
hydration path — so `shadowrootmode` stays permanently derived.

**The literal must not be duplicated.** `define-element.ts:35` already hardcodes
`{ mode: 'open' }`. A second bare `"open"` in the SSR emitter would be one
invariant encoded in two untested places — precisely the shape that produced the
mangled arbor wire format, `_injectLightScopeId`, and `contextSetup`. The emitted
value derives from the same single source the runtime attaches with, pinned by a
parity test. If the dependency direction forbids the import, it is a documented
single-source plus a test that fails the moment they diverge — never a bare
string in the emitter.

## Feasibility — both unknowns verified

1. **Shadow mode is knowable at compile time.** `shadow:` is a naked directive
   parsed in `packages/compiler/src/parser/state_wrappers.rs`, so the compiler
   can emit `export const __aihu_shadow__` on the server target beside the
   existing `__aihu_light_scope__` / `__aihu_tag__` (`packages/compiler/js/index.ts`).
2. **The `attachShadow` collision is a guard.** `define-element.ts:35` calls
   `this.attachShadow({ mode: 'open' })` unconditionally in the constructor.
   Under DSD the browser attaches during parsing, so that call throws
   `NotSupportedError`. It becomes `if (attachShadow && !this.shadowRoot)`, and
   when a root already exists the component adopts into it rather than mounting
   fresh. `packages/ui/tests/shadow-adoption.test.ts:36` already uses this exact
   guard shape.

## The expensive piece: styles under DSD

**The server currently emits no component styles at all.** The `@style` block is
deliberately elided on the server target — `server-emission-ssr.test.ts` states
it: "the `@style` block (module-scope `new CSSStyleSheet()`) is elided: styles
never reach server HTML."

For light DOM that is fine: styles arrive via the app stylesheet's
`@scope([data-a=…])` rules, which is what #758 wired up.

**For shadow DOM under DSD it is not.** A shadow root is style-isolated by
construction, so styles must ship *inside* the `<template>` or the pre-JS paint
is unstyled — exactly the failure that caused the #754 "LCP regression": content
rendering before its scoped CSS applies, stacking wrong and pushing LCP below the
fold. That regression is the cautionary tale for this step; do not ship DSD
emission without the styles in the same template.

This needs `@aihu/css-engine`'s per-component CSS available at SSR time. It is
the one step with real design surface and should not be bundled with the others.

## Sequencing

Ordered so nothing is ever half-wired; 1 and 2 are dormant until 3 lands.

1. **Compiler** — emit `__aihu_shadow__` on the server target. Additive; nothing
   consumes it yet.
2. **Runtime** — DSD-safe `attachShadow` guard + adopt-into-existing-root.
   Additive; no server emits DSD yet, so it is dormant.
3. **Server** — `resolveComponent` on `SsrOptions`, light-DOM child emission,
   both render paths (`_renderNode` sync at :517 and `renderNodeAsync` at :642 —
   divergence here is what the `AIHU_SSR_STRING=0` differential suite exists to
   catch). Proven end-to-end with a `shadow: 'light'` fixture.
4. **Server + css-engine** — DSD emission plus styles-into-template.
5. **Wire-up** — `@aihu/app` prerender supplies the resolver; aihu.dev's
   `<site-header>` filling in is the acceptance test.

## Scope boundaries for v1

- **Zero-children custom elements only.** `<site-header>Some text</site-header>`
  has both a resolvable component and light-DOM children to project. Slot
  projection is explicitly out of scope and must be documented as unimplemented
  rather than half-guessed.
- **Depth cap / cycle guard.** A component tree that references itself must not
  hang the prerender build.

## Acceptance

- aihu.dev `/` prerenders `<site-header>` with real nav content, both modes
  exercised by fixtures.
- Node-survivor count does not regress from #762's 320/393.
- Lighthouse perf stays 100 / LCP ~1480ms — with the styles present, per the
  #754/#758 lesson.
- `AIHU_SSR_STRING=0` differential suite green (sync and async paths agree).
- A parity test pinning the emitted `shadowrootmode` value to the runtime's
  `attachShadow` mode.
