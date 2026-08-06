# SSR child custom-element resolution — light DOM and shadow DOM

Status: **steps 1-2 merged (#770, #772). Step 3 REDESIGNED 2026-08-05** — see
"There are four renderers" and "Step 3, expanded". Plan of record.

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

> **Amended 2026-08-05.** That pre-named seam is the wrong shape and must not be
> built as written — see "There are four renderers" below. Resolution belongs to
> the CALLER as a pre-resolved registry, not to the renderer as a callback. The
> test comment gets updated in step 3c, so the repo does not accrete one more
> documented-but-never-wired callback named only in a test comment.

## There are four renderers, not two — CORRECTION

The sequencing below originally named `_renderNode` (`ssr.ts:503`) and
`renderNodeAsync` (`ssr.ts:581`) as "both render paths". That is wrong on both
counts, and the correction is what shapes step 3.

| # | renderer | reached by |
|---|---|---|
| 1 | compiled string fast path (`__aihu_ssr_string__`, Rust `ssr_string_emit.rs`) | **all production traffic** — `ssr.ts:1011`, via the Workers handler (`router/server.ts:254`) and SSG prerender (`app/prerender.ts:40`) |
| 2 | TS async walker (`renderNodeAsync`) | hand-built `dataSource` trees; `AIHU_SSR_STRING=0` |
| 3 | TS sync walker (`_renderNode`) | **nothing — dead since `ec24d411`** |
| 4 | native napi (`renderToStringNative`) | components with no string renderer, when the `loader.ts:67` guard lets them through |

Two consequences:

- **`_renderNode` is unreachable.** Not exported, no caller, only self-recursion;
  no lint rule covers it. Successive waves (Wave 3, LDF §10, structural SSR) kept
  dutifully updating it anyway. It is the newest instance of this repo's named
  failure mode — a contract asserted in two places where only one is tested — and
  step 3 as originally written directed new feature work INTO it. It gets deleted,
  not extended.
- **A JS-side resolver would only run on the path production does not take.** The
  Rust emitter renders a component reference as its kebab tag with only
  reference-site children (`ssr_string_emit.rs:651`), and templates reference
  children by tag with no import, so the emitter has no cross-module view.

`loader.ts:67-75` is a live trap: its guard already falls through to TS for
`lightScopeId` precisely because the napi `renderTree(treeJson, hydratable)`
signature would SILENTLY DROP it. Any new `SsrOptions` member that cannot cross
FFI must join that guard in the same commit that adds it.

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
3. **One shared child renderer** — see the four sub-steps below. Replaces the
   original step 3 wholesale.
4. **Server + css-engine** — DSD styles. The `<template>` is emitted by
   `__aihu_schild`, so the child's compiled CSS travels on the module channel as
   `__aihu_css__` beside `__aihu_shadow__` and is inlined as `<style>` INSIDE the
   template by the helper. One emission point makes the #754 lesson — never ship
   DSD without its styles in the same template — enforceable in one place.

   **SCOPED 2026-08-05, and smaller than this plan assumed — no css-engine work.**
   The client path (`emit_style_block`, `emit.rs:139`) emits
   `new CSSStyleSheet(); replaceSync(\`<css>\`)` from `style.content`, applying
   NO scoping transform: a shadow component's isolation is structural, the
   shadow root itself. The server target elides that block only because
   `CSSStyleSheet` is a DOM dependency (`ssr_no_dom`, `emit.rs:1052`), not
   because the CSS needs processing. So step 4 is: emit the SAME escaped string
   as `export const __aihu_css__` on the server target, and have `__aihu_schild`
   inline it as `<style>` inside the template. Three cautions:
   - Light-DOM children need NOTHING here — `@scope([data-a=…])` from the app
     stylesheet already covers them (#758). This is shadow-only.
   - The CSS is already escaped for a JS template literal; it needs a SECOND
     escape for HTML raw-text context. A literal `</style` in authored CSS (a
     comment, a `content:` string) terminates the element early. `ssr.ts`'s
     `ScriptTag` doc records the same hazard for `</script>` and the `</`
     escaping the SEO mapper uses — follow that precedent.
   - Utility classes inside a shadow root do not resolve from the app
     stylesheet. That is pre-existing and orthogonal; do not try to fix it here.

   **Step 4 MUST land before step 5's acceptance.** aihu.dev's `<site-header>`
   takes the default `shadow` mode, so wiring the registry first would prerender
   it into a styleless declarative shadow root — content painting before its CSS
   applies, which is exactly the #754 regression this plan cites as its
   cautionary tale.
5. **Wire-up** — the callers build the registry: SSG via `ssrLoadModule` over
   discovered components, the Worker via a generated tag→module manifest.
   aihu.dev's `<site-header>` filling in is the acceptance test.

### Step 3, expanded

The rejected alternative was to decline the fast path whenever a resolver is
supplied and implement resolution only in the walker. It is cheaper now and
much more expensive later: every real page has child components, so "decline
when a resolver is present" means the fast path never runs in production again,
and the Rust emitter plus its differential gate become `_renderNode` at scale —
maintained forever, exercised only by tests. The decision in one line: under the
chosen design the byte-identity gate stays true and grows stronger; under the
rejected one it has to be repealed.

- **3a. Compiler (Rust).** Component-reference sites in `ssr_string_emit.rs` emit
  `__aihu_schild(tag, attrs, path, __opts)` through the existing `helpers`
  channel (`:68`/`:177`), and the module exports `__aihu_child_tags__` — the
  static set of referenced component tags — beside `__aihu_tag__` /
  `__aihu_shadow__` / `__aihu_light_scope__`. With no registry the helper emits
  today's empty element, byte-identical to current output.
  **STATUS: the `__aihu_schild` lowering landed in #773; `__aihu_child_tags__`
  did NOT.** It is only needed to drive step 5's transitive registry walk, so it
  is carried there rather than left implied — nothing in 3a–3d depends on it,
  and `SsrOptions.children` accepts any map the caller assembles.
- **3b. Runtime.** `__aihu_schild` in `packages/runtime/src/ssr-string.ts`:
  registry lookup, recursive render through the CHILD's own `__ssrString`, host
  wrapping per the child's `__aihu_shadow__` — light gets `data-a` +
  `data-aihu-ssr` on host children, shadow gets `<template shadowrootmode>`. This
  is the single serialization point for a resolved child, in both modes. It
  imports `SHADOW_ROOT_MODE` from `./types.ts` directly — same package — so the
  "documented single-source plus divergence test" fallback this plan braced for is
  no longer needed.
- **3c. Server.** `SsrOptions.children?: ReadonlyMap<string, ChildModule>` —
  SYNC and pre-resolved, not an async callback; module loading is the caller's
  job, which keeps the fast path synchronous. Forwarded into the fast-path opts
  (`ssr.ts:1015`) and through `attachSsrString`; the walker's branch arm calls the
  same `__aihu_schild`. **Add `children` to `loader.ts`'s fall-through guard.**
  **Delete `_renderNode`.** Update the `resolveComponent` seam comment in
  `server-emission-ssr.test.ts:24` to the registry shape.
- **3d. Gate.** Extend `ssr-string-differential.test.ts` with parent+child
  fixtures: light child, shadow child, child-of-child, unresolved tag, sibling
  mix, and a bail-listed child (the fast path declines; walker+helper output is
  canonical). Plus a closure test: a cyclic tag graph fails LOUDLY at registry
  build time, never at render time.

Why a registry and not a callback: resolution is async (module loading), the fast
path is sync, and the cycle guard wants to run once over the whole graph rather
than at every render. Hoisting all three to the caller is what lets the fast path
survive.

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
- `AIHU_SSR_STRING=0` differential suite green — now covering RESOLVED CHILDREN
  in both modes at depth, not just the parent's own template. This criterion
  survives the amendment and is strengthened by it; under the rejected design it
  would have had to be weakened to "identical unless a resolver is present."
- ~~A parity test pinning the emitted `shadowrootmode` to the runtime's
  `attachShadow` mode.~~ Unnecessary under 3b: the helper lives in `@aihu/runtime`
  and imports `SHADOW_ROOT_MODE` directly, so there is one literal, not two to
  keep in agreement.

## The invariant

For any component and any pre-resolved child registry, the compiled string
renderer and the tree walker produce BYTE-IDENTICAL markup — including every
resolved child subtree, in both shadow modes, at any nesting depth. A tag absent
from the registry renders as an empty custom element identically on both paths.
The emitted `shadowrootmode` value is the runtime's `SHADOW_ROOT_MODE` by import,
never by literal.
