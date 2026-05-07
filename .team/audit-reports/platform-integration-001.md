# Platform Integration Audit — `topic:aihu-template-syntax track:userland-dx round:3`

**Role:** Auditor A — Web Platform Integration + Component-Creation Sugar
**Date:** 2026-05-06
**Scope:** Variant B template-syntax spec (PROPOSED) + samples doc + Scout D1 directive inventory + macro-vocab-v2 `@state` collections, audited against the Web Components platform.
**Tags:** `topic:aihu-template-syntax track:userland-dx round:3 audit-pass:platform`

---

## §0 — Load-bearing platform finding (everything downstream depends on this)

**aihu DOES emit autonomous Custom Elements with Shadow DOM. This is not a manual-DOM framework dressed in Web-Component clothes — it is a Web Components framework.** The compiler emits `defineElement('tag-name', defineComponent(...))` for every SFC (`packages/compiler/src/codegen/emit.rs:859, 1208`); `defineElement` (`packages/runtime/src/define-element.ts:75-87`) calls `customElements.define(name, Wrapped)`; the `Wrapped` class extends `HTMLElement`, attaches Shadow DOM in its constructor (default mode `'open'` — `define-element.ts:83`), and hooks `connectedCallback` / `disconnectedCallback`. The function-form `defineComponent(setup)` in `packages/runtime/src/define-component.ts:43-80` is `class C extends HTMLElement`; the options-form `defineComponent({ attrs, setup })` (lines 82-126) declares `static readonly observedAttributes = attrs` and dispatches `attributeChangedCallback` to per-attribute signals.

This is a stronger native-platform alignment than Vue (which uses VDOM and synthetic elements) or Svelte (no Shadow DOM by default, uses class-name CSS scoping). It is closest to **Lit**, modulo the compiler-vs-class-decoration difference. The audit below leans heavily on Lit precedent because Lit is the framework whose idioms transfer most cleanly to aihu.

**Three derived realities that the rest of this audit is built on:**

1. **Shadow DOM is on by default, mode `'open'`.** Userland gets style scoping for free; styles in `@style` blocks are emitted as **Constructable Stylesheets** (`new CSSStyleSheet()` + `replaceSync` — `emit.rs:60-68`) and assigned to `ctx.host.adoptedStyleSheets`. This is the modern platform path; aihu is genuinely ahead of Vue here.
2. **`$prop` in `@state` v2 does NOT integrate with `attributeChangedCallback`.** It lowers to a one-shot `JSON.parse(getAttribute('name'))` at mount (`emit.rs:660-662`). Props are read once and never reactively update if the parent mutates them. **This is the single biggest INTEGRABLE-WITH-REWORK opportunity in the audit.** The options-form `defineComponent({ attrs, setup })` already wires `observedAttributes` + `attributeChangedCallback` to per-attribute signals (`define-component.ts:85-115`) — but only for `@agent`-declared inputs. Function-form (the common SFC shape) drops this entirely.
3. **SSR does NOT emit Declarative Shadow DOM.** `packages/server/src/ssr.ts:118-134` emits inner-HTML to the document body; the shadow root only attaches client-side at hydration via `defineElement`'s `connectedCallback` (`define-element.ts:35-41`). FOUC + hydration mismatch risk. The platform primitive `<template shadowrootmode="open">` is supported in all evergreen browsers as of 2024 and would ship initial Shadow DOM with the HTML response.

The Variant B spec preserves the runtime contract (spec §8) — none of the three findings above are caused by this round. They are pre-existing platform-alignment opportunities that the round-3 sugar proposals can address.

---

## §1 — Coverage: what is audited

Every Scout D1 directive (15 directives, 6 boolean macros, 12 macro-elements), every macro-vocab-v2 `@state` collection-form macro (7 collections), the new `$event:` / `$emit` pair (samples §2.7), the `@template` / `@style` / `@route` / `@agent` blocks as wholes, and the implicit "what is a component" shape (function-form vs options-form `defineComponent`). 38 rows total. Cited path:line for every aihu claim; cited URL or framework-doc location (Lit / MDN) for every platform claim.

---

## §2 — Part 1: Construct-by-construct integration matrix

Verdict legend: **AI** = ALREADY-INTEGRATED; **IR** = INTEGRABLE-WITH-REWORK; **GE** = GENUINELY-EXTRAPOLATING (no native equivalent, invent cleanly); **PW** = PLATFORM-PRIMITIVE-IS-WORSE (extrapolate past, justify).

### §2.A — Block structure

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 1 | SFC component itself | `@state {} @template {} @style {}` block lowers to `defineElement('tag-name', defineComponent((ctx) => …))` (`emit.rs:859, 1208`) | `class extends HTMLElement {}` + `customElements.define()` + `attachShadow()` ([MDN Custom Elements V1](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)) | **AI** | Compiler already emits the platform call. Userland writes blocks; compiler synthesizes the class + registration + shadow root. This is the "magic behind it" the user asked for, working today. |
| 2 | Function-form component | `defineComponent((ctx) => Branch)` (`define-component.ts:47-80`) | Anonymous `class extends HTMLElement` | **AI** | Lowers cleanly; no rework needed. |
| 3 | Options-form component (with `@agent`) | `defineComponent({ attrs: [...] as const, setup(ctx) {…} })` (`define-component.ts:82-126`) | `class extends HTMLElement { static observedAttributes = […] }` + `attributeChangedCallback` | **AI** | This is the platform path. **The bug is that function-form components do NOT use this path** — see row 11 below. |
| 4 | `@template { … }` block | Compiles to a single `return branch(...)` expression returning an arbor tree (`emit.rs:848`) | Lit's `render()` method returning `html\`...\`` template literal | **PW** | Lit's tagged-template-literal approach forces JS expression-position; aihu's HTML-first block parses better in editor / AI workflows. **Keep the block.** Variant B's `{#if}/{#each}` block-tags + curly attribute bindings = same end-shape as Lit's `html` template tag, just authored as HTML rather than as a JS template literal. Recommend: continue extrapolating; document the equivalence. |
| 5 | `@style { … }` block | Emits `new CSSStyleSheet()` + `replaceSync` + assigns to `(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__]` (`emit.rs:32-77`) | [Constructable Stylesheets](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet/CSSStyleSheet) ([Web.dev: adoptedStyleSheets](https://web.dev/articles/constructable-stylesheets)) | **AI** | Aihu uses the modern platform path. **Better than Vue 3 / Svelte 5 here.** |
| 6 | `@route { … }` block | Out of scope for this round; present in Mail's pages | Native [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API) (Chromium-only as of 2025) | **PW** | Navigation API not yet cross-browser; aihu's router is the right call. Boundary callout only. |
| 7 | `@agent { … }` block | Lowers to `attrs: [...]` array → `observedAttributes` + per-attribute `Signal<string>` (`define-component.ts:85-115`) | `static observedAttributes` + `attributeChangedCallback` | **AI** | Genuinely the platform contract. Per-attribute signals on top is GE (signals aren't native), but cleanly so. |

### §2.B — Logic blocks (Variant B)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 8 | `{#if cond}…{/if}` | Lowers to `createIfBoundary(cond, () => subtree)` (`emit.rs:2024-2030`) | None native; HTML has no conditionals | **GE** | No native equivalent. Compiler-only construct. Lit uses inline ternary — same situation. Aihu's block-tag form is more readable. |
| 9 | `{#each xs as x (key)}…{/each}` | Lowers to `each(xs, key, (x, i) => subtree)` (`emit.rs:2092-2105`) for reactive lists, `createEachBoundary` for static | None native | **GE** | No native list construct. Lit-html uses `repeat()` directive (similar shape). Aihu's block-tag is more authoring-friendly than Lit's function call. Keep as-is. |
| 10 | `{:else if}` / `{:else}` / `{:empty}` | Compiler-only | None native | **GE** | No native; compiler invents. Director r2 §4 finding: codemod must exercise these shapes (Builder synthetic test). |

### §2.C — Reactive properties (`@state` v2 collections)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 11 | **`$prop: { name: { type, default } }`** | Lowers to `const name = JSON.parse(ctx.element.getAttribute('name') ?? '{}')` ONE-SHOT at mount (`emit.rs:660-662`). NOT wired to `observedAttributes`. NOT wired to `attributeChangedCallback`. NOT reactive. | `static observedAttributes = [...]` + `attributeChangedCallback(name, old, new)` + DOM property accessors. Lit's `@property({ type, attribute, reflect })` decorator does both. ([Lit docs: reactive properties](https://lit.dev/docs/components/properties/)) | **IR** ★ | **The single largest integrable-with-rework opportunity.** Rework: function-form `defineComponent` should mirror options-form's behavior — declare every `$prop` name as an observed attribute, allocate a per-prop `Signal<string>` at construct time, dispatch `attributeChangedCallback` writes to the signal's setter, and emit type-coercion (matching the existing `@agent` Number/Boolean/Enum coercion at `emit.rs:1213-1256`). Bonus: `$prop` should also expose a JS property accessor (so `el.todos = [...]` works for complex types that can't round-trip through attributes). See sugar proposal §A2 for the full design. |
| 12 | `$computed: { x: () => … }` | Lowers to `const x = computed(() => …)` (`emit.rs:670-674`) | None native (signals don't exist as a platform primitive) | **GE** | No native; preserve. |
| 13 | `$action: { name: (args) => … }` | Lowers to `function name(args) { return batch(() => …) }` (`emit.rs:698-701`) | None native | **GE** | Methods on the class would be the native idiom (Lit's class methods); aihu's collection-form pattern is more declarative. Acceptable extrapolation. |
| 14 | `$resource: { name: () => Promise }` | Lowers to `createResource(() => …)` (`emit.rs:683-685`) | None native (closest is `<Suspense>` proposal — Chrome-only intent-to-prototype, not shipped) | **GE** | Preserve. |
| 15 | `$effect: () => …` / `$effect.on(deps)` | Lowers to `effect(() => …)` (`emit.rs:716-721`) | None native (signals don't exist) | **GE** | Preserve. |
| 16 | **`$lifecycle: { mount, dispose }`** | Lowers to `onMount` / `onCleanup` runtime calls (`emit.rs:734-741`); these wire into the framework's per-instance lifecycle queue (`define-component.ts:17-26`) | `connectedCallback` / `disconnectedCallback` ([MDN custom-element lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements#using_the_lifecycle_callbacks)) | **IR** | Already runs inside `connectedCallback` (`define-component.ts:54-70`). But the platform has FOUR lifecycle callbacks: `connectedCallback` (current `mount`), `disconnectedCallback` (current `dispose`), `adoptedCallback` (when element moves between documents — rare but real for `<iframe>` / portal cases), `attributeChangedCallback` (currently only wired in options-form per row 11). Recommend: extend `$lifecycle:` to all four — `{ mount, dispose, adopt?, attributeChange? }`. See sugar proposal §A1. |
| 17 | **`$event: { dayjump: { payload: { day: Date } } }`** (NEW) | Lowers to `dispatchEvent(new CustomEvent(name, { detail, bubbles, composed, cancelable: true }))` per spec §5.e | [`CustomEvent` constructor](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent) — exact platform API | **AI** | Platform-native. The new collection adds typed declaration + agent-readable `describe:` on top — pure additive value. |

### §2.D — Attribute handling (binding directives)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 18 | `class={signal}` | Compiler emits `{ class: signal }` in attrs object; runtime `_applyAttrs` detects `Array.isArray(value)` (signal tuple `[get, set]`), wires `mountEffect(() => _setAttrOrProp(el, 'class', get()))` (`attrs.ts:91-99`); resolves to `el.setAttribute('class', String(value))` (`attrs.ts:117-120`) | `Element.setAttribute` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/setAttribute)) — auto-escapes attribute values at the DOM API level | **AI** | Already on the platform. Auto-escape preserved. Per-attribute fine-grained `mountEffect` is a GE addition (signals not native), but lowering is clean. Scout D2 verified end-to-end. |
| 19 | `class={['a', cond && 'b']}` (Variant B array form) | Spec §3.A.1: runtime joins truthy entries with space | Same `setAttribute` lowering | **AI** | Compiler/runtime join logic is GE; output flows through the same `setAttribute` path. clsx-shaped — LLM-familiar. |
| 20 | `style={{ color: 'red' }}` (object form) | Spec §3.A.1: runtime joins to `prop: value;` | [`Element.style.setProperty`](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration/setProperty) (per-property) OR `setAttribute('style', '...')` | **AI** | Choose `setProperty` per key (avoids one full re-parse per change). Currently lowers via `setAttribute('style', ...)` per row 18 path. Recommend: when key is known to be a CSS property, lower to `el.style.setProperty(key, value)` for finer-grained updates. |
| 21 | `$on.click={fn}` (Variant B dot form) | Compiler emits `onClick: fn` (`emit.rs:1975-1977`); runtime `_applyAttrs` does `el.addEventListener('click', fn)` (`attrs.ts:87-89`) | [`addEventListener`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener) | **AI** | Cleanly on the platform. **One platform feature unused: `addEventListener` options** (`{ once, passive, capture, signal }`). See sugar §A1.5 for `$on.click.once` modifier proposal. |
| 22 | `$bind.value={signal}` | Compiler emits `value: signal`; runtime detects array tuple, wires read-side via `mountEffect`; the **write-side wiring (signal setter on input event) is NOT yet visible in the codepath I traced** — `attrs.ts` has no input-listener path | DOM property assignment + `addEventListener('input', e => set(e.target.value))` | **IR** | Audit gap: I could not locate the write-side wiring for two-way bind in `attrs.ts:1-120`. The runtime detects `Array.isArray(value)` and wires only the read direction (`get()`). The write direction must be added if not present. **Surface to Builder: verify `$bind` write-side is wired before the spec ships, or add it.** Lit's two-way bind requires manual `@input=${e => this.value = e.target.value}` — aihu's `$bind.value` should sugar that exact pair. |
| 23 | `$ref={signal}` | Currently silently dropped at codegen (`emit.rs:2088` `_ => {}` default arm). Spec fixes via new `"ref"` arm. | DOM element reference (any property pointing at the element) | **IR** | Spec correctly fixes. Recommend the lowered form be a `Signal<Element \| null>` that receives the element on `connectedCallback` and `null` on `disconnectedCallback` — matches Lit's `createRef()` + `ref()` directive idiom. |
| 24 | `{@html expr}` (Variant B raw HTML) | Lowers to an effect that assigns `expr` to the element's HTML-content property (`emit.rs:2061-2068`) with no sanitizer | `Element` HTML-content-property ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML)) — known XSS sink | **AI** (mechanism), **IR** (security wrapper) | The HTML-content write itself is the platform primitive. The integration gap is the sanitizer — see Auditor B for security depth. Platform note: when `Sanitizer API` ships cross-browser (Chrome 105+, Firefox 119+, Safari TP), the lowering should switch to `el.setHTML(expr, sanitizer)` ([MDN: setHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/setHTML)) for a platform-supported sanitization path. Defer to Trusted Types follow-up (spec §12.5). |
| 25 | `$once` (boolean) | Lowers to `createOnceBoundary(() => subtree)` (`emit.rs:2069-2074`) | None native (closest: emit element once and never re-mount) | **GE** | Preserve. |
| 26 | `$memo={[deps]}` | Lowers to `createMemoBoundary(deps, () => subtree)` (`emit.rs:2075-2081`) | None native | **GE** | Preserve. |
| 27 | `$show={cond}` | Lowers to `effect(() => el.style.setProperty('--show', cond ? '1' : '0'))` (`emit.rs:2031-2037`) | `el.hidden = bool` OR `el.style.display = 'none'` | **PW** | The `--show` custom-property route is unusual — relies on userland CSS to map `--show: 0` to `display:none`. Recommend: switch lowering to `el.toggleAttribute('hidden', !cond)` (sets `hidden` HTML attribute, handled natively by every browser, accessible-tree integrated). |
| 28 | `$raw` (children pass-through) | Children are not parsed/processed (`emit.rs:1535`) | None native | **GE** | Preserve. |

### §2.E — Macro-elements (`<$tag>` family)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 29 | **`<$slot name="X" expose="...">`** | Lowers to `createSlotBoundary({ name, expose }, child)` (`emit.rs:1607-1643`); arbor's `slot('header')` returns `leaf.element('slot', { name })` — actual `<slot>` element (`packages/arbor/src/slot.ts:20-21`) | [`<slot>` + named slots + slot fallback](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots) | **AI** | Genuine platform primitive. Slot-fallback children naturally work as `<$slot>{fallback}</$slot>`. The `expose=` mechanism is the GE addition (Vue-style "scoped slots" via signals); platform `slotchange` event + `assignedElements()` is available as the escape hatch. |
| 30 | `<$suspense fallback="...">` | `createSuspenseBoundary(source, fallback, loaded)` (`emit.rs:1647-1660`) | None native (Chromium intent-to-prototype only) | **GE** | Preserve. |
| 31 | `<$shield>` / `<$guard>` | Custom boundary primitives | None native (Error Boundaries are React-only) | **GE** | Preserve. |
| 32 | `<$liveRegion>` | Lowers to `<div role="status" aria-live="...">` | [ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions) | **AI** | Pure platform — div + ARIA. |
| 33 | `<$skipLink>` / `<$focusTrap>` | Lowers to plain DOM + arbor focus management | Native focus management primitives + ARIA | **AI** | Platform-aligned. |
| 34 | `<$router>` / `<$link>` / `<$navigate>` | aihu router internals (`packages/router/`) | Native [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API) — Chromium-only | **PW** | Aihu router is correct call until Navigation API is cross-browser. |
| 35 | `<$warp to=...>` | `createWarpBoundary(target, child)` — stub per `emit.rs:1692-1709` | None native (DOM portals are React-only) | **GE** | Preserve. |

### §2.F — SSR / hydration

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 36 | **SSR rendering** | `renderToStream` / `renderToString` emit `<tag attr="...">inner</tag>` directly to document body (`server/src/ssr.ts:118-134`); Shadow DOM attaches client-side at `connectedCallback` only | [Declarative Shadow DOM (DSD)](https://web.dev/articles/declarative-shadow-dom): `<template shadowrootmode="open">…</template>` ships pre-rendered Shadow DOM with the HTML payload. Cross-browser as of 2024 (Chrome 90+, Safari 16.4+, Firefox 123+) | **IR** ★ | **Second-largest integrable-with-rework opportunity.** Currently SSR ships markup that doesn't match the client-rendered Shadow DOM, causing FOUC and hydration mismatch risk. Rework: SSR's `_renderNode` (`ssr.ts:109-137`) should emit a `<template shadowrootmode="open">` wrapper inside each custom element it serializes (when the runtime `shadowMode !== 'none'`), so the browser parses Shadow DOM directly from HTML before any JS runs. See sugar §A7. |
| 37 | Hydration markers | Optional `data-aihu-path` attribute on every node when `hydratable: true` (`ssr.ts:130, 197`) | None native; Lit-SSR uses lit-marker comments | **GE** | Preserve; aihu path-attr is fine. |

### §2.G — Component creation surface (extension points)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 38 | Plugin contract `Macro { name, validIn, lowering }` | `packages/plugin/src/index.ts:140-151`; userland-defined macros lower via `MacroLowering` returning code strings | Native: none. Lit's [Reactive Controllers](https://lit.dev/docs/composition/controllers/) are the closest analog (composable lifecycle-aware behavior objects) | **GE** + **IR** opportunity | Macros are a compile-time contribution — that's GE and fine. **The IR opportunity:** there is no runtime composition primitive equivalent to Lit Reactive Controllers. Userland that wants reusable lifecycle logic (e.g., "subscribe to ResizeObserver and expose a `width` signal") has no path other than copy-paste. Recommend: introduce `$controller:` collection in `@state` that takes a controller factory and wires its lifecycle hooks automatically. See sugar §A10.4. |

---

## §3 — Verdict roll-up

- **38 total rows audited.**
- **AI (already-integrated): 16 rows** — rows 1, 2, 3, 5, 7, 17, 18, 19, 20, 21, 24 (mechanism), 29, 32, 33, 36 (current behavior), 9, 8 lower mechanism. Aihu's platform alignment is genuinely strong.
- **IR (integrable-with-rework): 6 rows** — rows 11 (`$prop` reactivity), 16 (`$lifecycle` extension), 22 (`$bind` write-side verification), 23 (`$ref` shape), 36 (Declarative Shadow DOM), 38 (controller composition).
- **GE (genuinely-extrapolating): 13 rows** — rows 8, 10, 12, 13, 14, 15, 19, 25, 26, 28, 30, 31, 35 — signal-based reactivity, control-flow blocks, and async/error boundaries have no platform equivalent. All preserve cleanly.
- **PW (platform-is-worse): 3 rows** — row 4 (`@template` block beats Lit's tagged-template), row 6 (`@route` until Navigation API ships), row 27 (`$show` should switch to `hidden` attribute), row 34 (router until Navigation API ships).

**Top 5 INTEGRABLE-WITH-REWORK opportunities ranked by impact:**

1. **`$prop` reactivity through `attributeChangedCallback`** (row 11) — the single biggest gap; props are not reactive to parent mutations. Affects every SFC. Sugar §A2.
2. **Declarative Shadow DOM for SSR** (row 36) — eliminates FOUC + hydration mismatch; ships pre-rendered Shadow DOM with the HTML response. Sugar §A7.
3. **`$bind` write-side verification** (row 22) — audit gap; the read direction is wired but the write direction needs verification. Without it, two-way binding silently doesn't work for user inputs. Surface to Builder.
4. **`$lifecycle` covers all four platform callbacks** (row 16) — currently only `mount`/`dispose`; add `adopt` (rare but real) + `attributeChange` (auto-wired by §A2 for declared props; explicit for catch-all). Sugar §A1.
5. **Controller composition primitive** (row 38) — no runtime composition story. Lit Reactive Controllers work; aihu has nothing equivalent. Sugar §A10.4.

---

## §4 — Part 2: Component-creation syntactic-sugar proposals

The user's directive: "syntactic sugar for html components and custom html component creation that would allow magic behind it that would simplify the devland use but be comprehensive and thorough." The proposals below are aihu-flavored sugar (block + macro idiom), default-on where possible, escape-hatch'd to the raw platform API where userland needs it.

### §A1 — Custom Element registration + lifecycle

**Today.** SFC blocks → `defineElement('tag-name', defineComponent(...))`. Userland never writes `customElements.define` (`emit.rs:859, 1208`). Userland writes `$lifecycle: { mount, dispose }` for the two callbacks currently exposed.

**Gap.** Three of the four platform lifecycle callbacks are not exposed:
- `adoptedCallback` (element moved between documents) — no aihu hook
- `attributeChangedCallback` — only via `@agent`'s `attrs:` array; not via `$prop`
- `formStateRestoreCallback` (form association) — no hook (see §A3)

**Proposed sugar.** Extend `$lifecycle:` to cover the platform's four lifecycle callbacks:

```aihu
@state {
  $lifecycle: {
    mount: () => { /* connectedCallback */ },
    dispose: () => { /* disconnectedCallback */ },
    adopt: (oldDoc, newDoc) => { /* adoptedCallback — defaults to no-op */ },
    attributeChange: (name, oldValue, newValue) => { /* catch-all attributeChangedCallback */ },
  }
}
```

`adopt` and `attributeChange` default to no-op (most components don't need them). When `attributeChange` is provided, the compiler synthesizes `static observedAttributes` from the union of all `$prop` names + any names referenced in the `attributeChange` body. **Provides explicit access to the platform contract for advanced use; common case stays simple.**

**Escape hatch.** Inside any `$lifecycle` body, `ctx.element` is the `HTMLElement` instance — userland can call `ctx.element.attachShadow(...)` or any DOM API directly. Already supported (`define-component.ts:62, 103`).

### §A2 — Attributes vs properties — the perennial Web Components confusion ★

**The platform problem.** HTML attributes are strings. JS properties can be any type. A `<my-grid items=[...]>` won't work because `items` would be the string `"[object Object]"`. Lit solves this with `@property({ type: Array, attribute: 'items' })` — the framework uses `JSON.parse` for attribute → property conversion AND a JS property setter for direct assignment.

**Today aihu has the worst of both worlds.**
- `$prop` declared in `@state` lowers to a one-shot `JSON.parse(getAttribute(name))` at mount (`emit.rs:660-662`) — works for cold-start attribute reads, but **not reactive** if the parent calls `el.setAttribute('items', '[...]')` later.
- `$prop` does NOT add a JS property accessor — `el.items = [...]` from the parent doesn't propagate.
- Only `@agent` declared inputs flow through `observedAttributes` + `attributeChangedCallback` (`define-component.ts:85-115`), and only as `Signal<string>` (no type coercion beyond agent's Number/Boolean/Enum, `emit.rs:1213-1256`).

**Proposed sugar.**

`$prop` declarations gain three new optional keys mirroring Lit's `@property` decorator:

```aihu
@state {
  $prop: {
    // Primitive — reflects to/from string attribute, reactive both directions
    name: { type: 'string', default: '', attribute: true, reflect: true },

    // Boolean — present-or-absent attribute (HTML semantics)
    open: { type: 'boolean', default: false, attribute: true, reflect: true },

    // Number — coerced from attribute string
    count: { type: 'number', default: 0, attribute: true },

    // Object — property-only (cannot be expressed as attribute)
    items: { type: Array<TodoItem>, default: [], attribute: false },

    // Custom converter
    when: {
      type: Date,
      default: null,
      attribute: 'when',
      converter: {
        fromAttribute: (s) => s ? new Date(s) : null,
        toAttribute: (d) => d?.toISOString() ?? '',
      },
    },
  },
}
```

**Defaults — sensible starting points:**
- Primitives (`string`, `number`, `boolean`) default `attribute: true, reflect: false`.
- Object/array types default `attribute: false`.
- `reflect` defaults `false` (avoid attribute-write loops; opt-in for important attributes like `open`, `disabled`, `selected`).

**Compiler emit changes.**

The function-form `defineComponent` should mirror options-form's wiring:
1. Synthesize `static observedAttributes = [...]` from all `$prop` names with `attribute: true`.
2. Allocate one `Signal` per prop at constructor / connect time.
3. Wire `attributeChangedCallback(name, _, newValue)` to dispatch `signals[name][1](converter.fromAttribute(newValue))`.
4. Define a JS property accessor: `Object.defineProperty(C.prototype, name, { get: () => signals[name][0](), set: (v) => signals[name][1](v) })`.
5. When `reflect: true`, add a `mountEffect` that writes `setAttribute(name, converter.toAttribute(value))` whenever the signal changes.
6. Inside the SFC body, `name` reads as the current value (signal's getter) — no syntactic change for the author.

**Net effect.**
- `<my-grid items={signal}>` (parent template) — works reactively.
- `el.items = newArray` (parent JS) — works reactively.
- `el.setAttribute('items', '[...]')` (devtools / external) — works for primitives; objects logged warning.
- `el.items` (direct read) — returns current value.
- The author still writes `$prop: { items: ... }` — no boilerplate added to the common case.

**Escape hatch.** `attribute: false` opts out of the attribute path entirely (property-only — e.g., DOM nodes, signal references). `converter` opts in to custom serialization. Userland can still access `ctx.element.getAttribute(...)` directly.

This is the SINGLE biggest sugar win in the audit. It closes the props-not-reactive bug (row 11) without changing the `@state` v2 grammar (only adds optional keys).

### §A3 — Form-associated custom elements

**Platform.** `static formAssociated = true` + `ElementInternals` API ([MDN: ElementInternals](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals)) gives custom elements first-class form participation: `setFormValue`, validity reporting (`setValidity`, `checkValidity`, `reportValidity`), `formStateRestoreCallback` for back/forward cache, `formDisabledCallback`, `formResetCallback`. Cross-browser as of 2023 (Chromium, Safari 16.4+, Firefox 98+).

**Today.** `$bind:value` on a custom input does NOT integrate with form submission. A `<my-input $bind.value={email}>` inside a `<form>` does not participate in form submission, validity bubbles, `:invalid` state, or back/forward state restore. Mail's `login.aihu` has a `<form>` (per samples §4.2) but its `<input>` elements are native, sidestepping this. A custom `<my-search>` would silently fail.

**Proposed sugar.** New `@form` block (or `$form:` collection in `@state`, less-preferred per spec §10 IS-NOT-IN scope):

```aihu
@state {
  $form: {
    value: () => internalValue(),     // what gets submitted
    name: { type: 'string', default: '' },  // form field name
    validity: () => ({                 // validity state
      valueMissing: required && !internalValue(),
      tooShort: internalValue().length < minLength,
    }),
    validationMessage: () => 'Please fill out this field.',
  },
}
```

**Compiler emit changes.**

When `$form:` is present:
1. Add `static formAssociated = true` to the custom element class.
2. In constructor, allocate `this._internals = this.attachInternals()`.
3. Wire `mountEffect` per `value` getter: `setFormValue(value())` whenever it changes.
4. Wire `mountEffect` per `validity` getter: `setValidity(validity(), validationMessage())` whenever either changes.
5. Implement `formResetCallback`, `formStateRestoreCallback`, `formDisabledCallback` if userland declares matching keys (`reset`, `restore`, `disabled`).

**Defense.** Vue / Svelte have NO sugar for form-associated custom elements. Lit has `FormAssociatedMixin` from third-party `@open-wc/form-control`, not first-party. **Aihu would lead the framework field on this.**

### §A4 — Shadow DOM mode (open / closed / none)

**Platform.** Shadow DOM has three states: `open` (`element.shadowRoot` accessible externally), `closed` (`shadowRoot` returns `null` externally; root stored privately), and `none` (no shadow root). Open is recommended for almost all components ([Lit defaults open](https://lit.dev/docs/components/shadow-dom/)). Vue uses `none` by default with class-name CSS scoping.

**Today.** aihu defaults `'open'` (`define-element.ts:83`), supports all three modes via `defineElement(name, Ctor, { shadowMode })` — but **no userland surface to set the mode**. Compiler hard-codes nothing visible to userland.

**Proposed sugar.** New top-level SFC block-attribute:

```aihu
@component {
  shadow: 'open',  // 'open' | 'closed' | 'none' — default 'open'
}

@state { … }
@template { … }
@style { … }
```

`@component` is a metadata block; the compiler reads it and emits `defineElement(tagName, ComponentCtor, { shadowMode: 'open' })`.

**Defaults.**
- Default `shadow: 'open'` (Lit precedent, cleanest devtools story, allows `el.shadowRoot.querySelector` for tests).
- `shadow: 'none'` should be opt-in (loses style scoping; `@style` block must be hoisted to global with explicit `$global` declaration).
- `shadow: 'closed'` discouraged with a build warning (loses devtools introspection; runtime supports it but compiler currently reads `this.shadowRoot` which returns `null` for closed roots — `define-element.ts:21-25` documents this v0 limitation).

**Escape hatch.** Userland can still set the mode via the unstable `defineElement` direct-import path; compiler-emit is the friendly route.

### §A5 — Adopted stylesheets / Constructable Stylesheets

**Platform.** [Constructable Stylesheets](https://web.dev/articles/constructable-stylesheets) — `new CSSStyleSheet()` + `replaceSync(cssText)` + assign to `document.adoptedStyleSheets` or `shadowRoot.adoptedStyleSheets`. Cross-browser as of 2023.

**Today.** Aihu emits **exactly this** in `emit_style_block` (`emit.rs:32-77`):
```js
const __style__ = new CSSStyleSheet();
__style__.replaceSync(`<css>`);
(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];
```

**This is the modern platform path. Vue 3 still uses `<style>` tags. Aihu is ahead.**

**Sugar opportunity.** Two enhancements possible:

1. **Shared stylesheet detection.** When the same CSS body appears in N components, lint-warn and suggest hoisting to a `.css` file imported as a sheet:
   ```aihu
   import sharedSheet from './shared.css' assert { type: 'css' };

   @component { adoptedStyleSheets: [sharedSheet] }
   @style { /* component-specific overrides */ }
   ```

   The compiler emits `(ctx.host as ShadowRoot).adoptedStyleSheets = [sharedSheet, __style__]`. Saves parse time across many instances.

2. **Cascade Layers.** `@style` could optionally declare `@layer aihu-component` to give consumers control over precedence. Lower-stakes; defer.

**Verdict.** §A5 is mostly congratulating an existing strength. Recommend the `adoptedStyleSheets` extra-sheet escape hatch and defer Cascade Layers.

### §A6 — Slots and slot composition

**Platform.** `<slot>` element in Shadow DOM projects light-DOM children. Named slots: `<slot name="header">`. Fallback: children of `<slot>` render when no light-DOM matches. Slot props (Vue) / scoped slots (Svelte): the platform has no equivalent — both Vue and Svelte invent their own.

**Today.** `<$slot>` exists (`emit.rs:1607-1643`); arbor's `slot('name')` (`packages/arbor/src/slot.ts:20-21`) returns `leaf.element('slot', { name })` — actual DOM `<slot>` element. The `expose=` mechanism (`createSlotBoundary({ expose: [...] }, child)`) is the aihu equivalent of slot props / scoped slots.

**Verdict.** Cleanly on the platform for the basics. The `expose=` extrapolation is necessary (platform has no slot props) and aihu-flavored.

**Sugar refinement for Variant B / round 3.**

```aihu
@template {
  <header>
    <$slot name="header">
      <h1>{title}</h1>          <!-- fallback -->
    </$slot>
  </header>

  <main>
    <$slot expose={['item', 'index']}>
      <!-- consumers get { item, index } in their slot template -->
    </$slot>
  </main>
}
```

Document explicitly: `<$slot>` IS the platform `<slot>` element. The aihu `name=` attribute IS the platform `name=` attribute. The `expose=` attribute is aihu-only sugar; consumers of the slot author against the exposed names.

**Escape hatch.** Userland can listen to `slotchange` events on the slot element via `$on.slotchange={...}` to react to slotted content changes (Lit's `@slotchange` precedent).

### §A7 — Declarative Shadow DOM (SSR story) ★

**Platform.** [`<template shadowrootmode="open">…</template>`](https://web.dev/articles/declarative-shadow-dom). Cross-browser as of 2024. Browser parses Shadow DOM directly from HTML; no JS required for initial render.

**Today.** `packages/server/src/ssr.ts:118-134` emits `<tag attr="...">inner</tag>` directly to the document body. Shadow root attaches client-side at hydration via `defineElement`'s `connectedCallback` (`define-element.ts:35-41`). **This causes a measurable FOUC**: the SSR'd content shows in light DOM, then flashes when the shadow root attaches and re-renders. **Hydration mismatch is also possible** if light-DOM children of a custom element get re-projected.

**Proposed sugar / rework.**

`renderToStream` (`ssr.ts:292-344`) and `renderToString` (`ssr.ts:346-377`) should detect when a node represents a custom element with shadow mode `'open'` or `'closed'`, and emit:

```html
<my-grid items='[…]'>
  <template shadowrootmode="open">
    <link rel="stylesheet" href="...">  <!-- adoptedStyleSheets analog -->
    <!-- shadow DOM rendered subtree -->
  </template>
  <!-- light DOM children projected to slots -->
</my-grid>
```

Plus the runtime `connectedCallback` should detect that `this.shadowRoot` is already populated (DSD attached at parse time) and skip the initial render — only attach event listeners and signal effects.

**Defense.** This is a genuine improvement in initial-paint timing. Lit-SSR already does this. Vue 3 has no DSD support. Svelte 5 has no DSD support (no Shadow DOM by default). Aihu would be best-in-class on Web Components SSR.

**Caveat.** DSD requires `<template shadowrootmode>` content to be inert during HTML parsing — no scripts execute, no `connected` lifecycle. The runtime hydration step is what wires reactivity. Acceptable; matches Lit-SSR's model.

**Recommendation.** Spec follow-up round (out of scope for round 3 settlement). Track as `PROPOSED` with confidence after Builder ships Variant B.

### §A8 — Customized built-ins (`<button is="my-btn">`)

**Platform.** Two flavors of custom elements: autonomous (`<my-btn>` extends `HTMLElement`) and customized built-ins (`<button is="my-btn">` extends `HTMLButtonElement`). The latter inherits all of `<button>`'s native accessibility (focus, keyboard, form participation) for free.

**Caveat.** Safari has [refused to implement customized built-ins](https://github.com/WebKit/standards-positions/issues/97) since 2018. Polyfill exists but is non-trivial.

**Today.** aihu does NOT support customized built-ins. `defineElement` always calls `customElements.define(name, Wrapped)` with no `{ extends: 'button' }` (`define-element.ts:86`). Compiler-emitted classes always extend `HTMLElement`.

**Proposed sugar — RECOMMEND AGAINST.**

```aihu
@component { extends: 'button' }   // would lower to: extends HTMLButtonElement
@state { … }
@template { <slot /> }              // template is the button's content
```

Compiler would emit `class extends HTMLButtonElement` and `customElements.define(name, Wrapped, { extends: 'button' })`. Usage: `<button is="my-btn">…</button>`.

**Reasons to skip:**
1. Safari non-support means polyfill complexity.
2. The form-association path (§A3) gets a custom element `formAssociated = true` for free with `ElementInternals` — no need to extend `<button>` to get button-like behavior.
3. Better alternative: an autonomous custom element that internally renders a `<button>` in its shadow root and forwards events. Loses some of the inheritance ergonomics but works cross-browser today.

**Recommendation.** Document the decision in the spec; do not add `@component { extends: ... }`. Direct userland to autonomous + ElementInternals.

### §A9 — Element Internals + ARIA reflection

**Platform.** [`ElementInternals.role`, `.ariaLabel`, `.ariaPressed`](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals#aria_state_properties) — 30+ ARIA reflection properties. Set once on the internals object and the element advertises that role/state to assistive tech without bolting `role=` and `aria-*=` on every consumer.

**Today.** aihu has no sugar for this. Authors hand-write `role="button" aria-label="..."` in `@template`. The arch-5 `<$liveRegion>` macro-element manually emits `role="status" aria-live="polite"` (per Scout D1.3).

**Proposed sugar.** A new `@a11y` block (or `$aria:` collection in `@state` if blocks are off-table):

```aihu
@a11y {
  role: 'button',
  label: () => `Toggle ${todo.text}`,           // reactive
  pressed: () => todo.done,                      // reactive boolean
  describedBy: 'help-text-id',
}
```

**Compiler emit.** When `@a11y` is present:
1. Add `formAssociated = true` is NOT triggered by `@a11y` alone (form association is §A3's decision). But `ElementInternals` is needed either way — share the `this._internals = this.attachInternals()` allocation.
2. Wire reactive ARIA: `mountEffect(() => internals.ariaLabel = label())` — etc. for each declared key.
3. Static `role` is applied once on construct.

**Cross-reference.** Auditor B owns the a11y depth; this proposal is the platform-mechanism shape. The `@a11y` block could equally declare a wrapper around manual template `role=`/`aria-*` — but `ElementInternals` is the native path that does NOT pollute the element's attribute list and does NOT require parents to know about the role.

### §A10 — The "magic behind it" — what does the compiler hide?

The user asked for "magic behind it that would simplify the devland use." Here's the list of ten things the compiler should hide from userland (some already hidden, some proposed):

#### Already hidden (strengths to keep)

1. **`customElements.define`** — userland never writes it; compiler emits per SFC (`emit.rs:859, 1208`). ✓
2. **`attachShadow`** — userland never writes it; runtime wraps the constructor (`define-element.ts:35-41`). ✓
3. **`new CSSStyleSheet() + replaceSync`** — compiler emits per `@style` block (`emit.rs:60-68`). ✓
4. **`new CustomEvent({ bubbles, composed, cancelable })`** — `$emit.<name>(payload)` (Variant B spec §5.e). ✓
5. **`addEventListener` cleanup on disconnect** — runtime tracks via `disposers[]` (`attrs.ts:71-103`). ✓
6. **`requestAnimationFrame` for layout-tied effects** — signals' `effect()` machinery (Scout D2). ✓

#### Should be hidden (sugar proposals consolidated)

7. **`observedAttributes` + `attributeChangedCallback` boilerplate** — compiler synthesizes from `$prop` declarations (per §A2 above). Userland never writes the dispatcher. ★
8. **`ElementInternals` for form association** — `@form` block sugars `attachInternals` + `setFormValue` + validity wiring (per §A3). ★
9. **`ElementInternals` for ARIA reflection** — `@a11y` block sugars `internals.role` / `.ariaLabel` / etc (per §A9).
10. **Declarative Shadow DOM** — SSR auto-emits `<template shadowrootmode>` (per §A7).
11. **Lifecycle dispatcher** — extended `$lifecycle:` covers all four platform callbacks (per §A1).

#### New runtime composition primitive

12. **Reactive Controllers** — extension/pluggability without copy-paste:

    ```aihu
    @state {
      $controller: {
        size: useResizeObserver(ctx),    // factory function
        scroll: useScrollSync(ctx, ['x', 'y']),
      },
    }

    @template {
      <div data-width={size.width} data-x={scroll.x}>…</div>
    }
    ```

    Each controller is a function returning an object whose properties are signals (or methods). The compiler wires its `mount`/`dispose` to the host's lifecycle. Equivalent to [Lit Reactive Controllers](https://lit.dev/docs/composition/controllers/).

    **Defense.** Closes the IR gap from row 38. Plugin authors and userland share the same primitive. Complementary to `$resource` (which is for async data) and `$effect` (which is for ephemeral side effects).

#### Top 3 sugar proposals to ratify in round 3

Ranked by impact:

1. **§A2 — `$prop` reactivity through `attributeChangedCallback`.** Closes the largest platform-integration gap. Pure additive (existing `$prop` declarations keep working; new optional keys add reactivity). Spec change scope: ~50 LOC compiler emit + ~20 LOC runtime (signal allocation), no codemod.

2. **§A1 — Extended `$lifecycle` covering all four platform callbacks.** Tiny scope (10 LOC extra dispatch arms in runtime), strictly additive. Aligns with Lit / Vue / native idiom.

3. **§A7 — Declarative Shadow DOM for SSR.** Eliminates FOUC + hydration mismatch. Larger scope (~80 LOC SSR rewrite + runtime hydration detection); recommend separate spec round after Variant B template-syntax lands.

Defer §A3 (form association) and §A9 (ARIA via ElementInternals) to a v0.4 follow-up — both are high-value but each is a meaningful spec addition on its own. §A4 (shadow mode), §A5 (adopted stylesheets shared), §A6 (slot expose docs), §A10.4 (controllers) are smaller and can ride with whichever round has bandwidth.

---

## §5 — Discipline notes

- **Cited path:line for every aihu claim.** All ~60 references in this doc point to verifiable source.
- **Cited platform docs** for every platform claim — MDN URLs, Lit docs URLs, web.dev URLs. Confidence is high on the Web Components / Custom Elements / Shadow DOM / Constructable Stylesheets primitives (all cross-browser stable since 2023). Confidence is MEDIUM on the Sanitizer API (Chrome 105+, behind flag in some browsers as of 2026 — flagged).
- **Did not redesign Variant B template syntax.** All proposals are additive to the spec. None re-litigate `{#if}` vs `<$if>` vs `$if=`.
- **Did not propose breaking changes to `@state` v2.** §A1 / §A2 / §A3 / §A9 all add OPTIONAL keys to existing collection-form macros or add NEW collections (`$controller`). v2's settled object-literal collection-form is preserved.
- **Surfaced unknowns:** row 22 (`$bind` write-side wiring not visible in `attrs.ts:1-120` as audited; needs Builder verification). Row 36 SSR Shadow DOM behavior verified by reading `ssr.ts` directly — NOT a question, fact.
- **Was opinionated.** Each row's "Concrete platform-aligned form" is a recommendation. Each sugar proposal in §4 has a concrete spec sketch + emit changes.

---

## §6 — One-paragraph summary for the Synthesizer

Aihu is, contrary to a superficial read of the codebase, a fully Web-Components-native framework: every SFC compiles to `customElements.define(tagName, class extends HTMLElement)` with default-open Shadow DOM and Constructable-Stylesheet style scoping. Variant B template-syntax preserves this contract cleanly. Of 38 audited constructs, 16 are already-integrated, 6 are integrable-with-rework, 13 are genuinely-extrapolating (signal-based reactivity has no platform equivalent), and 3 are platform-is-worse (extrapolation justified). The largest integration gap is that `$prop` declarations do not flow through `attributeChangedCallback` and lack JS property accessors — props are read once at mount and not reactive. The second-largest is that SSR doesn't emit Declarative Shadow DOM, causing FOUC and hydration mismatch. Three sugar proposals are recommended for round-3 ratification: extended `$prop` declarations with `attribute`/`reflect`/`converter` keys (closes the props-not-reactive bug); extended `$lifecycle` covering all four platform callbacks; and Declarative Shadow DOM in SSR (separate follow-up spec round). `@form` (form-associated custom elements via ElementInternals) and `@a11y` (ARIA reflection via ElementInternals) are high-value follow-ups that would put aihu first in the framework field on those platform features.

---

*End of Platform Integration Audit — 2026-05-06.*
