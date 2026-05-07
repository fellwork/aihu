# Template Syntax v2 — Platform Audit (Round 3)

Companion to:
- `2026-05-06-spec-template-syntax-v2.md` (the proposed Variant B template syntax spec, PROPOSED, 540 lines)
- `2026-05-06-spec-template-syntax-v2-samples.md` (the corpus-pulled syntax catalog)

This audit consolidates two parallel research rounds:

- **Auditor A** — Web Platform Integration + Component-Creation Sugar (38-row construct matrix + 10 sugar proposals). Disk mirror: `.team/audit-reports/platform-integration-001.md`. AGENTS.delta.db record id 1158474995.
- **Auditor B** — Cross-Cutting Concerns + Market-Lessons (six axes — security, data flow, style, accessibility, extension, pluggability — × 5+ frameworks). Disk mirror: `.team/audit-reports/cross-cutting-design-001.md`. AGENTS.delta.db record id 3656749825.

Reconciled by **Director r3** (`.team/director-notes/template-syntax-003.md`, AGENTS.delta.db record id 1601711401). All round-3 ratifications, v0.4 deferrals, v0.5+ deferrals, and rejects are listed in §5 of this doc.

**Status: PROPOSED — gates on user approval (per Director r3 §5 user-surface go/no-go).**

---

## §1 — Headline finding: aihu IS already Web-Components-native

The single load-bearing reframe of round 3: **aihu is not a manual-DOM framework dressed in Web Components clothes — it is a Web Components framework.** The compiler emits `customElements.define()` per SFC with default-open Shadow DOM and Constructable-Stylesheet style scoping. This is genuinely ahead of Vue 3 and Svelte 5 on platform alignment; closest peer is Lit.

**Verification path (cited):**

- `packages/compiler/src/codegen/emit.rs:858-861` — emits `defineElement('tag-name', defineComponent((ctx) => {…}))` per SFC. Confirmed by Director r3 §1.
- `packages/runtime/src/define-element.ts:75-87` — `defineElement` calls `customElements.define(name, Wrapped)` at line 86; the wrapped class extends `HTMLElement`, attaches Shadow DOM in its constructor, hooks `connectedCallback`/`disconnectedCallback`.
- `packages/runtime/src/define-element.ts:83` — `const mode: ShadowMode = options?.shadowMode ?? 'open'` — default-open Shadow DOM.
- `packages/compiler/src/codegen/emit.rs:32-77` — `@style` blocks emit `new CSSStyleSheet()` + `replaceSync` + `(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__]`. Constructable Stylesheets, the modern platform path.
- `packages/compiler/src/codegen/emit.rs:660-662` — `$prop` lowers to one-shot `JSON.parse((ctx.element as HTMLElement).getAttribute('{name}') ?? '{}')`. **Props are read-once-at-mount, not wired to `observedAttributes` + `attributeChangedCallback`.** This is a correctness bug, addressed in §3.6 / R1.

**Auditor A's verdict-roll-up across 38 audited constructs:**

- **ALREADY-INTEGRATED (AI): 16 rows** — block structure, `@style`, `@agent`, `$event`/`$emit`, attribute flow, `$on.click`, `<$slot>`, ARIA macro-elements, SSR mechanism, etc.
- **INTEGRABLE-WITH-REWORK (IR): 6 rows** — `$prop` reactivity (the bug), `$lifecycle` four-callback extension, `$bind` write-side verification, `$ref` shape, Declarative Shadow DOM in SSR, controller composition.
- **GENUINELY-EXTRAPOLATING (GE): 13 rows** — signals, `{#if}`/`{#each}`, `$computed`/`$action`/`$resource`/`$effect`, `$once`/`$memo`, `<$suspense>`/`<$shield>`/`<$guard>`, `<$warp>`. No platform equivalent; preserve cleanly.
- **PLATFORM-IS-WORSE (PW): 3 rows** — `@template` block (beats Lit's tagged-template), router (until Navigation API ships cross-browser), `$show` (should switch from `--show` custom property to `hidden` attribute).

**Why this reframes the audit conversation.** The user's "integrate not extrapolate" framing initially suggested a refactor agenda. The audit shows the agenda is narrower and sharper:

1. **Close 6 integrable-with-rework gaps.** The two largest are `$prop` reactivity (R1) and Declarative Shadow DOM in SSR (D1).
2. **Add aihu-flavored sugar where the platform leaves ergonomics on the table.** `$aria` collection, `$controller` collection, `$context` collection — each landing inside `@state` v2's collection-form unification.
3. **Preserve the 13 extrapolations cleanly.** Signal-based reactivity has no platform equivalent; control-flow blocks have no platform equivalent; async/error boundaries have no platform equivalent. Variant B's block-tag form preserves these on the right side of the platform line.

The conversation moves from defensive ("did we build this right?") to offensive ("we're already 16/38; here are the 6 gaps and the 3 enhancements worth shipping").

**Round 4 + Round 5 user-directed scope adjustments.** R5 (`$aria` + auto-keyboard-promotion), R6 (`$controller` collection), and R7 (`$context` collection, WICG-Context-aligned) are RATIFY-now sugar additions ON TOP of the 16/6/13/3 already-integrated framing. The 16/6/13/3 numbers remain accurate — these three sugar additions don't refactor the integration matrix; they extend `@state` v2 with new collections alongside `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event`. Citations: Director r4 (`.team/director-notes/template-syntax-004.md`, AGENTS.delta.db record id 2048522989) for R5 + R6; Director r5 (`.team/director-notes/template-syntax-005.md`, AGENTS.delta.db record id 4012772269) for R7.

---

## §2 — Integration matrix (Auditor A's 38 rows)

Verdict legend: **AI** = already-integrated; **IR** = integrable-with-rework; **GE** = genuinely-extrapolating; **PW** = platform-primitive-is-worse.

### §2.A — Block structure

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 1 | SFC component itself | `@state {} @template {} @style {}` block lowers to `defineElement('tag-name', defineComponent((ctx) => …))` (`emit.rs:859, 1208`) | `class extends HTMLElement {}` + `customElements.define()` + `attachShadow()` | **AI** | Compiler already emits the platform call. Userland writes blocks; compiler synthesizes class + registration + shadow root. The "magic behind it" the user asked for, working today. |
| 2 | Function-form component | `defineComponent((ctx) => Branch)` (`define-component.ts:47-80`) | Anonymous `class extends HTMLElement` | **AI** | Lowers cleanly; no rework needed. |
| 3 | Options-form component (with `@agent`) | `defineComponent({ attrs: [...] as const, setup(ctx) {…} })` (`define-component.ts:82-126`) | `class extends HTMLElement { static observedAttributes = […] }` + `attributeChangedCallback` | **AI** | This IS the platform path. The bug: function-form components do NOT use it (row 11). |
| 4 | `@template { … }` block | Compiles to `return branch(...)` returning an arbor tree (`emit.rs:848`) | Lit's `render()` method returning `html\`...\`` template literal | **PW** | Lit's tagged-template-literal forces JS expression-position; aihu's HTML-first block parses better in editor / AI workflows. Variant B's `{#if}`/`{#each}` block-tags + curly attribute bindings = same end-shape as Lit's `html` template, just authored as HTML. **Keep the block.** |
| 5 | `@style { … }` block | Emits `new CSSStyleSheet()` + `replaceSync` + assigns to `(ctx.host as ShadowRoot).adoptedStyleSheets` (`emit.rs:32-77`) | Constructable Stylesheets | **AI** | Aihu uses the modern platform path. **Better than Vue 3 / Svelte 5.** |
| 6 | `@route { … }` block | aihu router internals; out of round-3 scope | Native Navigation API (Chromium-only as of 2025) | **PW** | Navigation API not yet cross-browser; aihu router is the right call. |
| 7 | `@agent { … }` block | Lowers to `attrs: [...]` array → `observedAttributes` + per-attribute `Signal<string>` (`define-component.ts:85-115`) | `static observedAttributes` + `attributeChangedCallback` | **AI** | Genuinely the platform contract. Per-attribute signals on top is GE (signals aren't native), but cleanly so. |

### §2.B — Logic blocks (Variant B)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 8 | `{#if cond}…{/if}` | Lowers to `createIfBoundary(cond, () => subtree)` (`emit.rs:2024-2030`) | None native | **GE** | No native equivalent. Lit uses inline ternary — same situation. Aihu's block-tag is more readable. |
| 9 | `{#each xs as x (key)}…{/each}` | Lowers to `each(xs, key, (x, i) => subtree)` (`emit.rs:2092-2105`) for reactive lists, `createEachBoundary` for static | None native | **GE** | No native list construct. Lit-html uses `repeat()` directive (similar shape). Aihu's block-tag is more authoring-friendly than Lit's function call. |
| 10 | `{:else if}` / `{:else}` / `{:empty}` | Compiler-only | None native | **GE** | No native; compiler invents. Director r2 §4 finding: codemod must exercise these via Builder synthetic test. |

### §2.C — Reactive properties (`@state` v2 collections)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 11 | **`$prop: { name: { type, default } }`** ★ | Lowers to `const name = JSON.parse(ctx.element.getAttribute('name') ?? '{}')` ONE-SHOT at mount (`emit.rs:660-662`). NOT wired to `observedAttributes`. NOT wired to `attributeChangedCallback`. NOT reactive to parent mutations. | `static observedAttributes` + `attributeChangedCallback(name, old, new)` + DOM property accessors. Lit's `@property({ type, attribute, reflect })` decorator does both. | **IR** ★ | **The single largest integrable-with-rework opportunity.** Function-form `defineComponent` should mirror options-form's behavior — declare every `$prop` as observed attribute, allocate per-prop `Signal<string>` at construct time, dispatch `attributeChangedCallback` to the signal setter, expose JS property accessor. Closes via §3.6 / R1 (RATIFY-now). |
| 12 | `$computed: { x: () => … }` | Lowers to `const x = computed(() => …)` (`emit.rs:670-674`) | None native | **GE** | Preserve. |
| 13 | `$action: { name: (args) => … }` | Lowers to `function name(args) { return batch(() => …) }` (`emit.rs:698-701`) | None native (class methods would be the native idiom) | **GE** | Acceptable extrapolation; collection-form is more declarative. |
| 14 | `$resource: { name: () => Promise }` | Lowers to `createResource(() => …)` (`emit.rs:683-685`) | None native (Suspense proposal Chrome-only intent-to-prototype) | **GE** | Preserve. |
| 15 | `$effect: () => …` / `$effect.on(deps)` | Lowers to `effect(() => …)` (`emit.rs:716-721`) | None native | **GE** | Preserve. |
| 16 | **`$lifecycle: { mount, dispose }`** | Lowers to `onMount`/`onCleanup` runtime calls (`emit.rs:734-741`); wires into per-instance lifecycle queue (`define-component.ts:17-26`) | `connectedCallback` / `disconnectedCallback` / `adoptedCallback` / `attributeChangedCallback` | **IR** | Already runs inside `connectedCallback` (`define-component.ts:54-70`). Platform has FOUR lifecycle callbacks; aihu exposes only two. Closes via §3.1 / R2 (RATIFY-now): extend to `{ mount, dispose, adopt?, attributeChange? }`. |
| 17 | **`$event: { dayjump: { payload: { day: Date } } }`** (NEW this round) | Lowers to `dispatchEvent(new CustomEvent(name, { detail, bubbles, composed, cancelable: true }))` per spec §5.e | `CustomEvent` constructor — exact platform API | **AI** | Platform-native. New collection adds typed declaration + agent-readable `describe:` on top — pure additive value. |

### §2.D — Attribute handling (binding directives)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 18 | `class={signal}` | Compiler emits `{ class: signal }`; runtime `_applyAttrs` detects array tuple, wires `mountEffect(() => _setAttrOrProp(el, 'class', get()))` (`attrs.ts:91-99`); resolves to `el.setAttribute('class', String(value))` (`attrs.ts:117-120`) | `Element.setAttribute` — auto-escapes attribute values at the DOM API level | **AI** | Already on the platform. Auto-escape preserved. Per-attribute fine-grained `mountEffect` is GE addition (signals not native), lowering is clean. |
| 19 | `class={['a', cond && 'b']}` (Variant B array form) | Spec §3.A.1: runtime joins truthy entries with space | Same `setAttribute` lowering | **AI** | Compiler/runtime join logic is GE; output flows through `setAttribute`. clsx-shaped — LLM-familiar. |
| 20 | `style={{ color: 'red' }}` (object form) | Spec §3.A.1: runtime joins to `prop: value;` | `Element.style.setProperty` (per-property) | **AI** | Currently lowers via `setAttribute('style', ...)`. Recommend per-key `setProperty` for finer-grained updates (avoids one full re-parse per change). |
| 21 | `$on.click={fn}` (Variant B dot form) | Compiler emits `onClick: fn` (`emit.rs:1975-1977`); runtime `_applyAttrs` does `el.addEventListener('click', fn)` (`attrs.ts:87-89`) | `addEventListener` | **AI** | Cleanly on the platform. One platform feature unused: `addEventListener` options (`{ once, passive, capture, signal }`) — see L3 modifier proposal (DEFER v0.5+). |
| 22 | **`$bind.value={signal}`** | Compiler emits `value: signal`; runtime detects array tuple, wires read-side via `mountEffect`; **write-side wiring (signal setter on input event) NOT visible in the audited codepath** (`attrs.ts:1-120`) | DOM property assignment + `addEventListener('input', e => set(e.target.value))` | **IR** | **Audit gap.** The write direction must be added if not present. Closes via §3.9 / R4 (RATIFY-now Builder verification). |
| 23 | `$ref={signal}` | Currently silently dropped at codegen (`emit.rs:2088` `_ => {}` default arm); spec fixes via new `"ref"` arm | DOM element reference | **IR** | Spec correctly fixes. Recommend `Signal<Element \| null>` that receives element on `connectedCallback`, `null` on `disconnectedCallback` — matches Lit's `createRef()`/`ref()` directive. |
| 24 | `{@html expr}` (Variant B raw HTML) | Lowers to effect that assigns `expr` to element's HTML-content property (`emit.rs:2061-2068`); no sanitizer | `Element` HTML-content-property — known XSS sink | **AI** (mechanism), **IR** (security wrapper) | Platform primitive used correctly. Integration gap is the sanitizer — Auditor B §1 owns; spec §6 has identity-default hook. When Sanitizer API is cross-browser, switch to `el.setHTML(expr, sanitizer)`. |
| 25 | `$once` (boolean) | Lowers to `createOnceBoundary(() => subtree)` (`emit.rs:2069-2074`) | None native | **GE** | Preserve. |
| 26 | `$memo={[deps]}` | Lowers to `createMemoBoundary(deps, () => subtree)` (`emit.rs:2075-2081`) | None native | **GE** | Preserve. |
| 27 | **`$show={cond}`** | Lowers to `effect(() => el.style.setProperty('--show', cond ? '1' : '0'))` (`emit.rs:2031-2037`) | `el.hidden = bool` OR `el.toggleAttribute('hidden', !cond)` | **PW** | The `--show` custom-property route relies on userland CSS to map `--show: 0` → `display:none`. Closes via §3.10 / R3 (RATIFY-now): switch to `el.toggleAttribute('hidden', !cond)` — natively handled by every browser, accessibility-tree integrated. |
| 28 | `$raw` (children pass-through) | Children not parsed/processed (`emit.rs:1535`) | None native | **GE** | Preserve. |

### §2.E — Macro-elements (`<$tag>` family)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 29 | **`<$slot name="X" expose="...">`** | Lowers to `createSlotBoundary({ name, expose }, child)` (`emit.rs:1607-1643`); arbor's `slot('header')` returns actual `<slot>` element (`packages/arbor/src/slot.ts:20-21`) | `<slot>` + named slots + slot fallback | **AI** | Genuine platform primitive. Slot-fallback children naturally work as `<$slot>{fallback}</$slot>`. The `expose=` mechanism is GE (Vue-style "scoped slots"); platform `slotchange` event + `assignedElements()` available as escape hatch. |
| 30 | `<$suspense fallback="...">` | `createSuspenseBoundary(source, fallback, loaded)` (`emit.rs:1647-1660`) | None native (Chromium intent-to-prototype only) | **GE** | Preserve. |
| 31 | `<$shield>` / `<$guard>` | Custom boundary primitives | None native (Error Boundaries are React-only) | **GE** | Preserve. |
| 32 | `<$liveRegion>` | Lowers to `<div role="status" aria-live="...">` | ARIA live regions | **AI** | Pure platform — div + ARIA. |
| 33 | `<$skipLink>` / `<$focusTrap>` | Plain DOM + arbor focus management | Native focus management primitives + ARIA | **AI** | Platform-aligned. |
| 34 | `<$router>` / `<$link>` / `<$navigate>` | aihu router internals (`packages/router/`) | Native Navigation API — Chromium-only | **PW** | Aihu router is correct call until Navigation API is cross-browser. |
| 35 | `<$warp to=...>` | `createWarpBoundary(target, child)` — stub per `emit.rs:1692-1709` | None native (DOM portals are React-only) | **GE** | Preserve. |

### §2.F — SSR / hydration

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 36 | **SSR rendering** ★ | `renderToStream` / `renderToString` emit `<tag attr="...">inner</tag>` directly to document body (`server/src/ssr.ts:118-134`); Shadow DOM attaches client-side at `connectedCallback` only | Declarative Shadow DOM (DSD): `<template shadowrootmode="open">…</template>`. Cross-browser as of 2024 (Chrome 90+, Safari 16.4+, Firefox 123+) | **IR** ★ | **Second-largest integrable-with-rework opportunity.** Currently SSR ships markup that doesn't match client-rendered Shadow DOM → FOUC + hydration-mismatch risk. Closes via §3.8 / D1 (DEFER v0.4): SSR's `_renderNode` should emit `<template shadowrootmode="open">` wrapper inside each custom element. |
| 37 | Hydration markers | Optional `data-aihu-path` attribute on every node when `hydratable: true` (`ssr.ts:130, 197`) | None native; Lit-SSR uses lit-marker comments | **GE** | Preserve; aihu path-attr is fine. |

### §2.G — Component creation surface (extension points)

| # | Construct | aihu current shape | Platform native primitive | Verdict | Concrete platform-aligned form |
|---|---|---|---|---|---|
| 38 | Plugin contract `Macro { name, validIn, lowering }` | `packages/plugin/src/index.ts:140-151`; userland-defined macros lower via `MacroLowering` returning code strings | Native: none. Lit's Reactive Controllers are the closest analog (composable lifecycle-aware behavior objects) | **GE** + **IR** opportunity | Macros are compile-time contribution — that's GE. The IR opportunity: no runtime composition primitive equivalent to Lit Reactive Controllers. Closes via §3.1 / D3 (DEFER v0.4): `$controller:` collection in `@state` v2. |

**Top 5 INTEGRABLE-WITH-REWORK opportunities ranked by impact** (Auditor A §3):

1. **`$prop` reactivity through `attributeChangedCallback`** (row 11) — single biggest gap. Affects every SFC. → R1 RATIFY-now.
2. **Declarative Shadow DOM for SSR** (row 36) — eliminates FOUC + hydration mismatch. → D1 DEFER v0.4.
3. **`$bind` write-side verification** (row 22) — audit gap; without write side, two-way binding silently doesn't work. → R4 RATIFY-now.
4. **`$lifecycle` covers all four platform callbacks** (row 16) — currently only `mount`/`dispose`. → R2 RATIFY-now.
5. **Controller composition primitive** (row 38) — no runtime composition story. → D3 DEFER v0.4.

---

## §3 — Sugar proposals (consolidated; overlaps resolved per Director r3 §2)

For each proposed sugar, one consolidated entry. Where Auditor A and Auditor B overlapped, Director r3 reconciliation applied.

### §3.1 Lifecycle composition (additive: $lifecycle + $controller)

Per Director r3 §2.a — these are **additive, not competing**:

- **`$lifecycle`** (per-SFC platform hooks; mount/dispose/adopted/attributeChanged) — **RATIFY now**. Source: Auditor A §A1.
- **`$controller`** (composable behaviors; Lit-Reactive-Controller-flavored) — **RATIFY now** (was DEFER v0.4; user-pulled into round 3 per Director r4). Source: Auditor A §A10.4 + Auditor B §5.

The two are NOT the same surface. `$lifecycle` is for the SFC author wiring its own component to the platform's four callbacks. `$controller` is for reusable behavior objects (e.g., `useResizeObserver`, `useFetch`) consumed across many components. The Lit ecosystem has both `connectedCallback`/`disconnectedCallback` (per-element platform hooks) AND `ReactiveController` (composable behavior). Both are valuable; neither subsumes the other.

**Proposed surface — `$lifecycle` (RATIFY-now, R2):**

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

`adopt` and `attributeChange` default to no-op. When `attributeChange` is provided, the compiler synthesizes `static observedAttributes` from the union of all `$prop` names + names referenced in the body. Inside any `$lifecycle` body, `ctx.element` is the `HTMLElement` instance — userland can call any DOM API directly. `+10 LOC runtime, 0 LOC codemod` (additive).

### §3.1.R6 `$controller` collection (RATIFY-now, R6 — pulled into round 3 per Director r4 §3)

#### Surface

Userland writes:

```aihu
@state {
  $controller: {
    sensor: useResizeObserver(({ width, height }) => {
      // body — captured by the controller; framework wires lifecycle
    }),
    keys: useKeyboard({ Escape: close, ArrowDown: focusNext }),
    mouse: useMousePosition(),
  }
}
```

Where `useResizeObserver`, `useKeyboard`, `useMousePosition` are user- or library-defined factory functions returning a controller instance conforming to the protocol below. `$controller` is a new `@state` v2 collection-form macro. Per macro-vocab-v2 §2 grammar:

- **Bare entry-value** is **forbidden** for `$controller` — the entry must be a factory call (an expression that synchronously returns the controller object). Bare function expressions would imply a callback, which is the wrong mental model.
- **Wrapped entry-value** with metadata: `{ value: () => useResizeObserver(...), describe: '…' }`. The `value:` thunk is invoked once per SFC instance at construct time; the returned controller is registered.

Forbidden keys: `default`, `handler`, `on`, `expose` (controllers are SFC-internal; not agent-exposed surface).

#### Controller protocol

The controller factory returns an object conforming to:

```ts
interface AihuController {
  mount?(): void;        // wired into $lifecycle.mount (after author's mount fires)
  dispose?(): void;      // wired into $lifecycle.dispose (before author's dispose fires)
  adopt?(): void;        // wired into adoptedCallback (rare)
  attributeChange?(name: string, oldValue: string | null, newValue: string | null): void;
  // any other properties — typically reactive state (signals) the @template can reference
}
```

**Naming defense.** Director r4 picked the **aihu-flavored alternative** (`mount`/`dispose`/`adopt`/`attributeChange`) over Lit's (`hostConnected`/`hostDisconnected`/`hostAdopted`/`hostAttributeChanged`). Three reasons:

1. **Consistency with `$lifecycle`.** R2 (ratified r3) extends `$lifecycle` to `{ mount, dispose, adopt?, attributeChange? }`. Using the same vocabulary in `$controller` means authors don't toggle between `host*`-prefixed methods and `$lifecycle`-named methods within a single SFC.
2. **Aihu does not expose a "host" abstraction.** Lit names methods `hostConnected` because controllers receive a `ReactiveControllerHost` object. Aihu controllers receive a typed wrapper around `ctx` + `$state` (per below) — there's no host concept to name after.
3. **The cost of divergence is low.** Library authors porting Lit Reactive Controllers rename four method names. The benefit is a more uniform aihu surface.

#### Access to host

The controller factory is invoked **synchronously** at SFC construct time. To access the SFC's reactivity / element / lifecycle, the controller has two surfaces:

1. **Closure capture.** The factory is invoked inside the SFC body, so it has lexical access to `ctx`, signals, and `$state` collection results. Most controllers should use closure capture — it's the simplest path.

2. **Optional `host` parameter.** When a controller wants framework-friendly access without lexical capture, the factory accepts an optional first parameter:

   ```ts
   type AihuControllerHost = {
     element: HTMLElement;       // ctx.element
     signal<T>(initial: T): Signal<T>;
     effect(fn: () => void): void;
     onMount(fn: () => void): void;
     onCleanup(fn: () => void): void;
   };

   function useResizeObserver(host: AihuControllerHost, callback: (size: { width: number; height: number }) => void): AihuController { … }
   ```

   When the compiler detects a factory whose first parameter binds to `AihuControllerHost`, it injects the host wrapper at the call site:

   ```js
   sensor = useResizeObserver(__aihu_host__, ({ width, height }) => { … });
   ```

   The author writes `useResizeObserver(...)` without the `host` arg; the compiler adds it. **This is magic-behind-it; document explicitly.**

#### Composition

Multiple controllers coexist in `$controller`. They run in **declaration order** for `mount` / `adopt` / `attributeChange`; cleanup (`dispose`) runs in **reverse declaration order (LIFO)**. Composition rule mirrors typical resource-cleanup discipline (last-acquired-first-released).

```aihu
@state {
  $controller: {
    a: useFooController(),    // a.mount → b.mount → c.mount
    b: useBarController(),
    c: useBazController(),    // c.dispose → b.dispose → a.dispose
  }
}
```

#### Type-safety

The `$controller` entry's TypeScript type is the factory's return type. The .aihu.ts sidecar surfaces controller fields to the @template scope:

```ts
// generated sidecar (per Architect spec §7)
interface State_$controller {
  sensor: { width: Signal<number>; height: Signal<number> };
  keys: { /* … */ };
  mouse: { x: Signal<number>; y: Signal<number> };
}
```

Userland `@template` references like `<div data-w={sensor.width}>` get autocomplete + type-check via the sidecar.

#### IS-NOT-IN

- `$controller` does **NOT** replace `$action` or `$effect`. Those are SFC-internal mechanisms; controllers are reusable composables. Authors writing one-off side-effects belong in `$effect`; reusable cross-SFC behaviors belong in `$controller`.
- `$controller` does **NOT** make a controller a custom element. There is no separate `customElements.define` per controller; controllers are plain objects.
- `$controller` does **NOT** support cross-element controllers (single-host only — per-instance). A single `useGlobalKeyboard()` shared across many SFCs is module-scope-function territory (per r3 §2.a / Auditor B §5 recommendation), not `$controller`.
- `$controller` does **NOT** ship built-in controllers (`useResizeObserver`, `useIntersectionObserver`, `useKeyboard`) in this round.

#### Built-in controllers (out of scope for round 3)

Userland writes its own factories for v0.3. Aihu does **not** ship `@aihu/controllers` with batteries-included controllers in this round. **Defer to v0.4+** as a separate package: `@aihu/controllers` exporting `useResizeObserver`, `useIntersectionObserver`, `useKeyboard`, `useMousePosition`, `useFetch`. Tracked alongside D5 ($form) on the v0.4 spec roadmap. State this is an out-of-scope item in the spec amendment text so users don't expect them in the v0.3 ship.

#### Acceptance criteria (Builder will run)

1. **Two controllers fire `mount` in declaration order.** A test SFC with `$controller: { a: useA(), b: useB() }` where `useA` and `useB` log in `mount` — verify `a` logs before `b`.
2. **Cleanup fires in reverse order.** Same SFC: on disconnect, `b.dispose` fires before `a.dispose`.
3. **Controller exposing reactive state can be referenced from @template.** A `useCounter()` controller exposing `count: Signal<number>` — verify `<span>{counter.count()}</span>` re-renders on count change.
4. **`attributeChange` fires when $prop updates.** Depends on R1 ($prop reactivity fix). After R1 lands, declaring a controller with `attributeChange(name, old, new)` and updating a `$prop` from the parent triggers the controller's callback. **Builder seam: B5 depends on B1 — order matters.**

#### Estimated LOC

~60-100 compiler/runtime additions:
- Parser for `$controller` collection: ~15 LOC
- Codegen for factory call + lifecycle wiring: ~20-30 LOC
- Runtime controller registry per SFC instance: ~15-25 LOC
- Lifecycle dispatcher (declaration-order mount, LIFO dispose): ~10-20 LOC
- AihuControllerHost wrapper + injection: ~10-20 LOC

**0 LOC codemod** (additive — new collection).

**Ratification trail.** Director r4 note (`.team/director-notes/template-syntax-004.md`, AGENTS.delta.db record id 2048522989) §3 — verdict change from DEFER-v0.4 to RATIFY-now per user directive.

### §3.2 A11y ($aria collection wins per Director r3 §2.b — RATIFY-now per Director r4)

Director r3 chose **`$aria` collection** over `@a11y` block. Defense:

1. **Director r2 §1 explicit framing**: "@state v2's collection-form is *the* aihu shape going forward." A new top-level `@a11y` block fragments the surface. `$aria` lives alongside `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event` with the same bare/wrapped duality.
2. **Cross-cutting summary** (Auditor B): collection-form unification is one of the top-2 advantages over Vue worth marketing. A peer-block undermines that story.
3. The lowering is identical either way: `attachInternals()` once, `mountEffect` per `$aria.<name>`. Auditor A §A9 owns the platform mechanism.

**Verdict:** **RATIFY-now (R5)** (was DEFER v0.4 / D2; user-pulled into round 3 per Director r4). Highest-leverage proposal in the audit. No framework has shipped declarative ARIA + auto-keyboard wiring. Marketing territory.

#### Surface

Userland writes:

```aihu
@state {
  $aria: {
    role: 'button',
    label: $computed(() => `Day ${day().toLocaleDateString('en', { month: 'short', day: 'numeric' })}`),
    pressed: () => isSelected(),
    expanded: () => isOpen(),
    describedBy: 'tooltip-id',
  }
}
```

`$aria` is a new `@state` v2 collection-form macro alongside `$prop` / `$computed` / `$action` / `$resource` / `$effect` / `$lifecycle` / `$event`. Per macro-vocab-v2 §2 grammar:

- **Bare entry-value** (`role: 'button'` or `label: () => '…'`) — value-form sufficient when no metadata is present. String literals for static reflectable values (role, describedBy id refs); bare thunks (`() => …`) for reactive scalar values.
- **Wrapped entry-value** (`{ value: () => '…', describe?: '…' }`) — when an agent-readable `describe:` accompanies the value. Mirrors `$computed` shape. Forbidden keys: `default`, `handler`, `on`, `expose` (ARIA properties are not agent-exposed; they are platform-owned).

**Required at least one of:** `role`, `label`. Empty `$aria: {}` is a parse warning (per macro-vocab-v2 §2.1 empty-collection precedent).

#### Lowering (cite Auditor A §A9, platform-integration-001.md lines 399-422)

Compiler emits, per SFC declaring `$aria`:

```js
// connectedCallback (cached once per element)
if (!this._internals) this._internals = this.attachInternals();

// static entries (role, describedBy id) — set once on connect
this._internals.role = 'button';
this._internals.ariaDescribedByElements = [this.getRootNode().getElementById('tooltip-id')];

// reactive entries — wired via mountEffect (see Auditor A §A9)
mountEffect(() => { this._internals.ariaLabel = label(); });
mountEffect(() => { this._internals.ariaPressed = String(pressed()); });
mountEffect(() => { this._internals.ariaExpanded = String(expanded()); });
```

`attachInternals()` is called **at most once per element** (cached on `this._internals`). When R5 (`$form`) lands in v0.4, both collections share the same allocation. The `attachInternals()` call belongs in the wrapper class's `connectedCallback`, before `setup(ctx)` runs, so the internals reference is available to the SFC body.

ARIA property names map verbatim to `ElementInternals` IDL keys: `role` → `internals.role`; `label` → `internals.ariaLabel`; `pressed` → `internals.ariaPressed`; `expanded` → `internals.ariaExpanded`; `describedBy` → `internals.ariaDescribedByElements` (resolves the id-string to an Element via `getRootNode().getElementById`); `controls`, `current`, `disabled`, `hidden`, `invalid`, `keyShortcuts`, `level`, `live`, `modal`, `multiline`, `multiSelectable`, `orientation`, `placeholder`, `posInSet`, `readOnly`, `required`, `roleDescription`, `selected`, `setSize`, `sort`, `valueMax`, `valueMin`, `valueNow`, `valueText` — full WAI-ARIA reflection IDL set per [MDN ARIA state properties](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals#aria_state_properties).

#### Reactivity

Bare-thunk entries (`pressed: () => isSelected()`) are dependency-tracked through the standard signals pipeline (Scout D2). When `isSelected` updates, the `mountEffect` re-runs and writes `internals.ariaPressed = String(true)`. **Confirmed fine-grained reactivity.** Static entries (`role: 'button'`) are written once at connect; recompiling the SFC is the only path to change them.

#### Auto-keyboard-promotion

When `$aria.role` is one of `'button'`, `'link'`, `'menuitem'`, `'tab'`, the compiler emits an auto-keyboard handler alongside the `$on.click={fn}` listener:

| role | promoted keys | matches WAI-ARIA practices |
|---|---|---|
| `'button'` | Enter, Space | yes — buttons activate on both |
| `'link'` | Enter | yes — links activate on Enter only (Space scrolls) |
| `'menuitem'` | Enter, Space | yes — menu items activate on both |
| `'tab'` | Enter, Space | yes — tabs select on both |

Compiler-emitted handler shape:

```js
// only when $aria.role is a keyboard role AND $on.click is declared AND tagName !== 'BUTTON'
const _onKeydown = (e) => {
  if (e.key === 'Enter' || (e.key === ' ' && roleAcceptsSpace)) {
    e.preventDefault();
    fn(e);
  }
};
el.addEventListener('keydown', _onKeydown);
```

**Edge case (the double-fire guard).** When the underlying element is `<button>` (or `<a href>` for `role='link'`), the platform already fires `click` on Enter/Space natively. Emitting our own keydown handler causes double-fire. **Compiler guard:** at codegen, when the element is a native interactive element matching the role (`<button>` for role=button, `<a>` with href for role=link), the auto-keydown promotion is suppressed. Use `tagName !== 'BUTTON'` (and the equivalent for link) at codegen time. Authors hitting an unusual case can disable promotion explicitly via `$on.click.mouseOnly={fn}` (deferred — out-of-scope for round-3 ratification; userland workaround: use `$on.click.mouseOnly` modifier when it ships, or attach the listener via `$ref` for full manual control).

#### Default tabindex

When `$aria.role` is set to a focusable role (`'button'`, `'link'`, `'menuitem'`, `'tab'`, `'menuitemcheckbox'`, `'menuitemradio'`, `'option'`, `'switch'`, `'checkbox'`, `'radio'`, `'slider'`, `'spinbutton'`, `'textbox'`), the compiler auto-emits `tabindex="0"` on the root template element **unless tabindex is already declared**. Detection happens at codegen against the @template root element's attribute set; any `tabindex={…}` or `tabindex="…"` in author source wins. **Document this magic-behind-it explicitly:** the spec section names the auto-tabindex injection so authors aren't surprised when DevTools shows a tabindex they didn't write.

#### Type-safety

`$aria.role` is typed as the string-literal-union of WAI-ARIA roles per the [WAI-ARIA 1.2 Roles](https://www.w3.org/TR/wai-aria-1.2/#role_definitions) spec. The .aihu.ts sidecar (per Architect spec §7) declares:

```ts
type AriaRole =
  | 'alert' | 'alertdialog' | 'application' | 'article' | 'banner'
  | 'button' | 'cell' | 'checkbox' | 'columnheader' | 'combobox'
  | 'complementary' | 'contentinfo' | 'definition' | 'dialog' | 'directory'
  | 'document' | 'feed' | 'figure' | 'form' | 'grid' | 'gridcell'
  | 'group' | 'heading' | 'img' | 'link' | 'list' | 'listbox' | 'listitem'
  | 'log' | 'main' | 'marquee' | 'math' | 'menu' | 'menubar' | 'menuitem'
  | 'menuitemcheckbox' | 'menuitemradio' | 'navigation' | 'none' | 'note'
  | 'option' | 'presentation' | 'progressbar' | 'radio' | 'radiogroup'
  | 'region' | 'row' | 'rowgroup' | 'rowheader' | 'scrollbar' | 'search'
  | 'searchbox' | 'separator' | 'slider' | 'spinbutton' | 'status' | 'switch'
  | 'tab' | 'table' | 'tablist' | 'tabpanel' | 'term' | 'textbox' | 'timer'
  | 'toolbar' | 'tooltip' | 'tree' | 'treegrid' | 'treeitem';
```

Other ARIA properties typed per their `ElementInternals` IDL signatures (boolean for state properties; string for label/describedby/keyShortcuts; number for level/posInSet/setSize/valueMax/valueMin/valueNow). `$computed` thunks must return matching types; `tsc` catches the rest.

#### IS-NOT-IN

- `$aria` does **NOT** replace explicit `aria-*` attributes in `@template`. Authors can still write `<div aria-busy="true">` in template position; `$aria` is the collection-form alternative for component-author-owned ARIA, not a replacement for instance-level overrides. Mixing the two on the same element is permitted but cannot be made coherent in all cases — when `$aria.label` is declared on a component AND a consumer writes `<my-comp aria-label="override">`, the `aria-label` attribute wins (DOM precedence over `internals.ariaLabel`). Document this precedence in the spec.
- `$aria` does **NOT** auto-translate (no i18n magic). Userland threads its own i18n function through the thunk: `label: () => t('close')`.
- `$aria` does **NOT** manage focus rings (`:focus-visible` styling is the `@style` block's territory).
- `$aria` does **NOT** ship a build-time a11y lint pass (deferred as L4 in r3 manifest).

#### Acceptance criteria (Builder will run)

1. **Keyboard promotion works.** A `<div>` SFC with `$aria.role: 'button'` + `$on.click={fn}` responds to Enter and Space keypresses (calls `fn` once each, with `e.preventDefault()`).
2. **Screen reader announces declared role + label.** Test via axe-core if available; otherwise manual NVDA/VoiceOver verification. Scope to one synthetic test SFC; full a11y matrix is L4 territory.
3. **Reactive ARIA state updates.** `$aria.pressed: () => signal()` → consumer toggles `signal` → `internals.ariaPressed` reflects the new value within one microtask.
4. **No double-fire on native interactive elements.** A `<button>` SFC root with `$aria.role: 'button'` + `$on.click={fn}` fires `fn` exactly ONCE on Enter and ONCE on Space (not twice). Compiler guard suppresses auto-keydown when underlying tag is `<button>`.

#### Estimated LOC

~80-120 compiler/runtime additions:
- Parser for `$aria` collection in `@state` v2: ~20 LOC
- Codegen for `attachInternals()` cached call + per-key emit: ~30-50 LOC
- Auto-keyboard-promotion handler emit + role-table: ~20-30 LOC
- Default-tabindex codegen pass: ~10-20 LOC

**0 LOC codemod** (additive — existing .aihu files don't break, they just don't use the new collection).

Once `$aria` is declared, userland MUST NOT mix in raw `aria-*` attributes on the host — the framework owns the ARIA surface for that component.

**Ratification trail.** Director r4 note (`.team/director-notes/template-syntax-004.md`, AGENTS.delta.db record id 2048522989) §2 — verdict change from DEFER-v0.4 to RATIFY-now per user directive.

### §3.3 Form association (DEFER v0.4 + paired with $aria)

Per Director r3 §2.c — confirm v0.4 deferral. Source: Auditor A §A3, Auditor B §4 prop 5.

If we ship `$aria` and `$form` in v0.4, the surface is `$aria:` + `$form:` collections (consistent with §3.2 — no new top-level `@form` block). They share `attachInternals()` allocation; design them together in one spec round.

**Proposed surface (D5):**

```aihu
@state {
  $form: {
    value: () => internalValue(),
    name: { type: 'string', default: '' },
    validity: () => ({
      valueMissing: required && !internalValue(),
      tooShort: internalValue().length < minLength,
    }),
    validationMessage: () => 'Please fill out this field.',
  }
}
```

**Compiler emit.** When `$form:` is present: add `static formAssociated = true`; allocate `this._internals = this.attachInternals()` (shared with `$aria`); wire `mountEffect` per `value`/`validity` → `internals.setFormValue` / `internals.setValidity`; implement `formResetCallback`/`formStateRestoreCallback`/`formDisabledCallback` if userland declares matching keys.

**Defense.** Vue / Svelte have NO sugar for form-associated custom elements. Lit has `FormAssociatedMixin` from third-party `@open-wc/form-control`, not first-party. Stencil ships it. **Aihu would lead the framework field on this.**

### §3.4 Customized built-ins (REJECT)

Per Director r3 §2.d — Safari non-support. Source: Auditor A §A8.

Safari has refused to implement customized built-ins (`<button is="my-btn">`) since 2018. Polyfill is non-trivial. The autonomous-element + `ElementInternals` path covers the same use cases without polyfill complexity. Auditor B did not address. Auditor A's recommendation AGAINST is ratified.

**Verdict: X1 REJECT.** Document the decision in this audit; do not add `@component { extends: ... }`. Direct userland to autonomous + `ElementInternals`.

### §3.5 Style + Constructable Stylesheets + ::part (already-integrated; doc work)

Per Director r3 §2.e — both auditors agree. Aihu's `@style` block uses Constructable Stylesheets correctly today (`emit.rs:32-77`). Both auditors recommended `::part(name)` as the documented theming surface.

**Auditor B added** (§3 prop 2, L1): aggregate Constructable Stylesheets across instances in v0.4 (current path is per-instance; aggregation cuts bytes invisibly). No userland-visible API change.

**Verdict.** v0.4-or-later doc + invisible-runtime work. NOT Variant B Builder territory.

- L1 (DEFER v0.5+): Shared `adoptedStyleSheets` aggregation across instances.
- L2 (DEFER v0.5+): CSS `@layer aihu-component` for cascade control. Lower-stakes; defer to userland convention.
- Doc work: Adopt `::part(name)` as the documented theming surface. `<button part="primary">` in component is the contract; consumers theme via `my-component::part(primary) { … }`. Lit pioneered; the standards committee blessed it. Vue/Svelte's `:deep()` is on the wrong side of history.
- Preserve `$reactive(...)` as the reactive-CSS sugar — better than Lit's `styleMap`, matches Vue's `v-bind` in styles.

### §3.6 $prop reactivity (RATIFY now — CORRECTNESS BUG)

Auditor A's biggest finding (row 11, §A2). Props are read once at mount via `JSON.parse(getAttribute(name))` (`emit.rs:660-662`); NOT wired to `observedAttributes` + `attributeChangedCallback`. Affects every SFC that takes props.

**Verdict: R1 RATIFY-now.** This is a CORRECTNESS bug, not sugar.

**Proposed surface (optional keys on `$prop`):**

```aihu
@state {
  $prop: {
    name: { type: 'string', default: '', attribute: true, reflect: true },
    open: { type: 'boolean', default: false, attribute: true, reflect: true },
    count: { type: 'number', default: 0, attribute: true },
    items: { type: Array<TodoItem>, default: [], attribute: false },
    when: {
      type: Date,
      default: null,
      attribute: 'when',
      converter: {
        fromAttribute: (s) => s ? new Date(s) : null,
        toAttribute: (d) => d?.toISOString() ?? '',
      },
    },
  }
}
```

**Defaults.** Primitives (`string`, `number`, `boolean`) default `attribute: true, reflect: false`. Object/array types default `attribute: false`. `reflect` defaults `false` (avoid attribute-write loops; opt-in for important attributes like `open`, `disabled`, `selected`).

**Compiler emit changes (Auditor A §A2).**

1. Synthesize `static observedAttributes = [...]` from all `$prop` names with `attribute: true`.
2. Allocate one `Signal` per prop at constructor / connect time.
3. Wire `attributeChangedCallback(name, _, newValue)` to dispatch `signals[name][1](converter.fromAttribute(newValue))`.
4. Define a JS property accessor: `Object.defineProperty(C.prototype, name, { get: () => signals[name][0](), set: (v) => signals[name][1](v) })`.
5. When `reflect: true`, add a `mountEffect` that writes `setAttribute(name, converter.toAttribute(value))` whenever the signal changes.
6. Inside the SFC body, `name` reads as the current value (signal's getter) — no syntactic change for the author.

**Net effect.** `<my-grid items={signal}>` (parent template) — works reactively. `el.items = newArray` (parent JS) — works reactively. `el.setAttribute('items', '[...]')` — works for primitives; objects logged warning. `el.items` (direct read) — returns current value. The author still writes `$prop: { items: ... }` — no boilerplate added to the common case.

**LOC delta.** +50 LOC compiler emit, +20 LOC runtime, **0 LOC codemod** (existing `$prop` declarations remain valid; new keys are optional).

### §3.7 $context collection (RATIFY-now, R7 — pulled into round 3 per Director r5 §2)

Per Director r3 §4 prop 4 → Director r5 pull-in. Source: Auditor B §2.1. Closes the WICG-Context-aligned tree-scoped DI gap.

aihu's only path today is `globalThis` hoisting via `createApp({ provide: { … } })` (`packages/app/src/client.ts:39-41`) — global, not tree-scoped. Vue/Solid/Svelte/Lit-via-Context all have answers. Single largest data-flow gap vs the market.

**Verdict:** **RATIFY-now (R7)** (was DEFER v0.4 / D4; user-pulled into round 3 per Director r5).

#### Surface (provider side)

Userland writes:

```aihu
@state {
  $context: {
    provide: {
      theme: $computed(() => isDark() ? darkTheme : lightTheme),
      user: currentUser,                          // signal reference
      locale: 'en-US',                            // static value
      router: { value: () => routerInstance, describe: 'App router instance' },
    }
  }
}
```

`$context` is a new `@state` v2 collection-form macro per macro-vocab-v2 §2 grammar. The collection has **two reserved sub-keys** at the top level: `provide:` and `consume:`. Both are sub-collections (object literals). At least one must be present; an empty `$context: {}` (or one with only empty sub-collections) is a parse warning per macro-vocab-v2 §2.1.

Inside `provide:`, each entry's value is one of:

- **Bare static value** (`locale: 'en-US'`) — provides the value as-is, non-reactive. Re-providing requires a re-render, which in aihu-land means a new SFC instance.
- **Bare signal reference** (`user: currentUser`) — when the value is a `Signal<T>` reference, the framework reads it through the consumer-side accessor; consumer re-reads automatically pick up signal changes.
- **Bare thunk via `$computed`** (`theme: $computed(() => …)`) — preferred shape for derived reactive providers. Per macro-vocab-v2 §3.2 grammar, `$computed` returns a signal-equivalent that the provider re-emits on dependency change.
- **Wrapped form** (`{ value: () => …, describe?: '…' }`) — when metadata coexists with the running code. Mirrors `$computed` shape. Forbidden keys for provider entries: `default`, `handler`, `on`, `expose`, `type` (provided values are tree-scoped, not agent-exposed surface).

#### Surface (consumer side) — canonical form

Userland writes:

```aihu
@state {
  $context: {
    consume: {
      theme: { type: ThemeToken, describe: 'Active theme from <ThemeProvider> ancestor' },
      user: { type: User },
      locale: { type: Locale, default: 'en-US' },
    }
  }
}
```

**Decision: the wrapped form is canonical.** Consumer entries are **always wrapped**; bare entries are forbidden. Two reasons:

1. **Type-safety requires it.** The `type:` key is the declaration-site type binding — Auditor B §2 explicitly cited Vue's `inject('foo'): unknown` foot-gun and called for "typed at the declaration site, not at the consumer." Bare entries can't carry a `type:` key.
2. **Default-value semantics matter.** `default:` is the value used when no ancestor provides the key. Components mounted outside any provider (which is always possible — consumers do not constrain their mount location) must specify what happens. Without `default:`, the consumer reads `undefined`; with `default:`, the consumer reads the fallback. Making this explicit per-entry beats hiding it.

Valid keys for consumer entries: `type` (REQUIRED), `default?`, `describe?`. Forbidden: `value`, `handler`, `on`, `expose`, `provide` (the `provide:` sub-collection is the producer side, not a per-entry key).

The consumer-side accessor is generated as a per-name signal: in `@template`, `<div data-theme={theme()}>` (call-syntax — same as `$computed`); in body code, `theme()` reads the current value, tracking through the standard signals pipeline (Scout D2).

#### Lookup semantics

Tree-scoped, **DOM-walking, Shadow-DOM-piercing.** When a consumer's `connectedCallback` fires:

1. Consumer dispatches a **`ContextRequestEvent`** (per WICG Context Protocol — name: `'context-request'`; bubbles: `true`; composed: `true`; cancelable: `false`).
2. Event payload: `{ context: <key>, callback: (value, unsubscribe?) => void, subscribe: true }`.
3. The first ancestor element whose `$context.provide` declares that key handles the event by calling the callback synchronously with the current value AND registering the consumer for future updates.
4. If no ancestor handles the event before it reaches the document root, the consumer falls through to its declared `default:` (or `undefined` if absent).

`composed: true` on the event means the request **walks up across Shadow DOM boundaries** via `composedPath()`-style propagation — the standard mechanism. This is what makes context work for Web-Components-native frameworks where every SFC instantiates its own Shadow root.

**Re-evaluation cadence.** Lookup happens **once per consumer mount** (subscribe = true), and the provider re-invokes the callback on every value change. Consumers do NOT re-walk the tree on every read; the ancestor binding is captured at mount time and held until disconnect. This matches Lit `@lit/context` semantics and is the standards-track answer.

#### Platform-alignment story

**Decision: Option (i) — implement the WICG Context Protocol directly.**

Auditor B §2 stated explicitly: "Lowering should use the WICG Context proposal (`@lit/context` is a polyfill) — Auditor A owns the lowering, but the design prescription is: tree-scoped (DOM-event-driven), typed end-to-end via `consume.<name>.type`, opt-in (no implicit context)." Three reasons to commit fully:

1. **Interop is non-negotiable for a Web-Components-native framework.** Per Director r4 §1 headline finding, aihu IS Web-Components-native (16/38 already-integrated). An aihu-only context protocol would be a regression on the platform-integration thesis. A WICG-aligned protocol means an aihu consumer reads from a Lit provider (and vice versa) with zero shim — that's load-bearing for the marketing story.
2. **The `@lit/context` polyfill is small and stable.** Aihu can ship its own minimal WICG-Context implementation in `@aihu/runtime` (~30-50 LOC for the event class + provider-registration pattern + consumer-subscribe plumbing) without a runtime dep on `@lit/context`. We adopt the **protocol shape**, not the package.
3. **Future-proofing.** ChromeStatus tracks "Context Protocol" as a Working-Draft proposal. Building on it now means aihu lands on the right side of the platform when it ships.

**Auditor A reference check.** Auditor A's report does not have a dedicated $context section (their pass focused on platform-mechanism for the 38-row matrix; WICG Context did not surface in their callouts). The lowering is fresh ground for Builder. Director r5 prescribes: ship our own minimal WICG-Context-Protocol-shaped implementation; do NOT depend on `@lit/context` as a runtime package. **Builder owns the lowering details; r5 sets the protocol target.**

Escape hatch: userland that needs to interop with a non-WICG provider can attach a custom event listener via `$lifecycle.mount` + `$ref` for full manual control.

#### Type-safety

Each context entry is keyed by **string** at the runtime layer (the WICG standard uses string keys — or richer "Context" instances; aihu starts with strings for simplicity). Type-safety lands at **compile-time** via the `.aihu.ts` sidecar (Architect spec §7):

- Provider side: each `$context.provide.<name>` entry's TypeScript type is inferred from the value (signal/computed/static).
- Consumer side: each `$context.consume.<name>.type` declaration is the contract. The sidecar emits a per-context-key registry interface; provider and consumer SFCs that share a key must agree.
- **Cross-SFC type matching:** the sidecar emits a global `interface AihuContextRegistry { theme: ThemeToken; user: User; locale: Locale; ... }` aggregated across all SFCs in the project. Provider declarations contribute entries; consumer declarations type-check against entries. A consumer requesting a key not registered by any provider in the project is a `tsc` error (configurable; default warn in v0.3, error in v0.4 once the LSP lands).

Runtime cast is a fallback for cases where the sidecar can't see the producer (third-party Web Components, dynamic import boundaries). Document this explicitly.

#### Reactivity

When a provider's value changes (signal updates), all currently-subscribed consumers reactively update. Wiring (per Scout D2 + standard signals plumbing):

- Provider's `$computed`/signal value is dependency-tracked. The provider has a `mountEffect` that re-fires on change, iterating its consumer-callback-registry and calling each callback with the new value.
- Consumer-side: the `(value, unsubscribe) => …` callback writes to a per-consumer `Signal` allocated at consumer mount. Consumer's `@template` references read that signal; the standard signals pipeline handles re-renders.

This means consumers update synchronously-within-microtask on provider changes — same cadence as any other signal-driven update.

#### Lifecycle interaction

- **Consumer registers on `connectedCallback`** by dispatching the `ContextRequestEvent` once. The provider's response includes the unsubscribe handle, which the consumer captures.
- **Consumer deregisters on `disconnectedCallback`** by invoking the captured unsubscribe handle.
- **Mount-order edge case (consumer mounts before provider):** within the same render burst, when the consumer's `connectedCallback` fires before the ancestor provider's, the dispatched event has no handler and falls through to default. **Solution:** the consumer's mount-time event dispatch is wrapped in a `queueMicrotask` defer when no synchronous handler responds. This gives the provider a chance to register before the consumer falls through. Deferred dispatch is single-shot — if no provider responds within one microtask, the consumer commits to the default. Document this magic-behind-it explicitly.
- **Reconnection:** consumer disconnects (unsubscribes) → reconnects (re-dispatches `ContextRequestEvent`). Provider lookup is fresh — if the consumer was moved to a different subtree, it picks up the new ancestor's provider. No stale binding.

#### IS-NOT-IN

- `$context` does **NOT** replace `$emit` (parent↔child events). `$emit` is for explicit, typed event flow up the tree; `$context` is for ambient values walked across the tree.
- `$context` does **NOT** replace global state. Module-scope-signal pattern (per Auditor B §2 recommendation 2; r3 §3 note) remains the documented answer for app-level singletons. Userland imports a signal directly: `import { currentUser } from '@/stores/auth'`.
- `$context` does **NOT** support cross-document propagation. `composed: true` walks up the host document; it does not cross iframe or document boundaries. Use `BroadcastChannel` for cross-document state.
- `$context` does **NOT** magically thread props. Use `$prop` + `$emit` combination for explicit data flow between known parent/child pairs. `$context` is for the case where the producer and consumer are arbitrary distance apart and the intermediate components don't care about the value.
- `$context` does **NOT** ship batteries-included context keys (no built-in `$context.theme` / `.locale` / `.router`). Userland or library code declares its own.

#### Acceptance criteria (Builder will run)

1. **Provider mutates → all descendant consumers reactively update.** Test SFC: `<ProviderRoot>` declares `$context.provide.count: $computed(() => signal())`; three nested `<ConsumerLeaf>` SFCs each declare `$context.consume.count: { type: number, default: 0 }`. Mutate the signal; verify all three leaves' templates re-render to the new value within one microtask.
2. **Consumer mounted outside any provider falls through to default.** Same `<ConsumerLeaf>` SFC, mounted directly under `<body>` with no `<ProviderRoot>` ancestor. Verify the consumer reads the declared `default:` value.
3. **Two ancestors providing the same key — nearest wins.** `<OuterProvider count=1>` > `<InnerProvider count=2>` > `<ConsumerLeaf>`. Verify the consumer reads `2`.
4. **Consumer survives reconnection.** Mount → unmount → remount the consumer under a different provider tree. Verify the consumer's value reflects the new ancestor's provider on remount.
5. **WICG Context Protocol interop.** Pick the simpler direction for round-3: **consumer-aihu × provider-Lit**. Mount a `LitElement` ancestor that uses `@lit/context`'s `provide` controller with key `'theme'`. Mount an aihu `<ConsumerLeaf>` consuming `theme`. Verify the aihu consumer reads from the Lit provider. (Provider-aihu × consumer-Lit is symmetric and adds confidence; defer to v0.4 follow-up if scope creeps in B5.)

#### Estimated LOC

~70-110 compiler + runtime additions:

- Parser for `$context` collection with `provide` / `consume` sub-collections: ~20-30 LOC
- Runtime `ContextRequestEvent` class + provider event handler installation: ~15-25 LOC
- Provider-side registry + signal-update propagation to subscribed callbacks: ~15-25 LOC
- Consumer-side per-key signal allocation + microtask-deferred-dispatch on mount: ~15-25 LOC
- Sidecar `.aihu.ts` registry emit (cross-SFC `AihuContextRegistry` aggregation): ~5-15 LOC

**0 LOC codemod** (additive — existing `.aihu` files don't reference `$context`; new collection slots in cleanly).

**Defense.** Building on the WICG Context proposal positions aihu well for when the proposal lands (ChromeStatus: "WICG Context Protocol"). Vue's `provide`/`inject` is type-unsafe by default (`inject('foo')` returns `unknown`); aihu's consumer-side `type:` is typed at the declaration site, not at the consumer.

**Ratification trail.** Director r5 note (`.team/director-notes/template-syntax-005.md`, AGENTS.delta.db record id 4012772269) §2 — verdict change from DEFER-v0.4 to RATIFY-now per user directive.

### §3.8 DSD in SSR (DEFER v0.4)

Per Director r3 §4 prop 5. Source: Auditor A §A7. **Best-in-class WC SSR.**

`renderToStream` (`ssr.ts:292-344`) and `renderToString` (`ssr.ts:346-377`) should detect when a node represents a custom element with shadow mode `'open'` or `'closed'`, and emit:

```html
<my-grid items='[…]'>
  <template shadowrootmode="open">
    <link rel="stylesheet" href="...">
    <!-- shadow DOM rendered subtree -->
  </template>
  <!-- light DOM children projected to slots -->
</my-grid>
```

The runtime `connectedCallback` should detect that `this.shadowRoot` is already populated (DSD attached at parse time) and skip the initial render — only attach event listeners and signal effects.

**Defense.** Lit-SSR already does this. Vue 3 has no DSD support. Svelte 5 has no Shadow DOM by default. Aihu would be best-in-class on Web Components SSR.

**Connection user explicitly asked about (Director r3 §4):** Vite-elimination is in the same neighborhood as SSR contract changes; DSD work touches both. Flag the interconnect.

**LOC delta (estimate).** ~80 LOC SSR rewrite + runtime DSD-detection. Verdict: **D1 DEFER v0.4.**

### §3.9 $bind write-side verification (RATIFY now — Builder verification item)

Per Director r3 §3 R-verify. Source: Auditor A row 22.

Audit gap: the read direction is wired but the write direction needs verification. Without it, two-way binding silently doesn't work for user inputs.

**Verdict: R4 RATIFY-now (Builder verification).**

Builder MUST verify the write-side wiring for `$bind.value={signal}`: an `addEventListener('input', e => set(e.target.value))` is emitted alongside the read-side `mountEffect`. If absent in current `attrs.ts`, add it. Synthetic acceptance test: `<input $bind.value={sig}>`; `sig` updates when user types.

**LOC delta.** +0 LOC if already present; +30 LOC if absent (Builder must verify first).

### §3.10 $show → hidden attribute (RATIFY now)

Per Director r3 §3 R3. Source: Auditor A row 27.

`$show={cond}` lowers to `effect(() => el.toggleAttribute('hidden', !cond))` instead of the current `el.style.setProperty('--show', cond ? '1' : '0')`. The `hidden` HTML attribute is natively handled by every browser, integrated with the accessibility tree, and removes the userland-CSS-mapping requirement.

**Verdict: R3 RATIFY-now.** +5 LOC compiler emit, **0 LOC codemod** (semantics-preserving for any userland that didn't rely on `--show` directly).

### §3.11 Sanitizer factory + Trusted Types chokepoint (DEFER v0.4)

Source: Auditor B §1. Director r3 §3 D6.

Spec §6 already proposes `templates.htmlSanitizer?: (raw: string) => string` defaulting to identity. Auditor B's amendment: ship a one-line factory in `@aihu/runtime` (`defineAihuSanitizer`) that wraps a user-supplied sanitizer for discoverable integration. Userland call site: `templates.htmlSanitizer: defineAihuSanitizer(DOMPurify.sanitize)`.

Plus: consolidate raw-HTML write paths into one chokepoint module (`packages/runtime/src/dom-write.ts`) so a TT policy can be wired without source surgery in v0.4. Cheap forethought now; expensive retrofit later (Lit lesson).

**CSP guidance to publish:** "aihu compiles templates ahead-of-time; no `unsafe-eval` or `unsafe-inline` is required for `script-src`. `{@html expr}` violates `require-trusted-types-for 'script'` unless a TT-aware sanitizer is configured; document the policy site explicitly."

**Verdict: D6 DEFER v0.4.**

### §3.12 Slot composition + slotchange (already-integrated; doc refinement)

Source: Auditor A §A6. No verdict change.

`<$slot>` IS the platform `<slot>` element. The aihu `name=` is the platform `name=`. The `expose=` is aihu-only sugar for scoped slots. Document the equivalence. Userland can listen to `slotchange` events on the slot element via `$on.slotchange={...}` to react to slotted content changes (Lit's `@slotchange` precedent).

**Verdict.** Doc-only refinement; no spec amendment.

### §3.13 Shadow mode metadata (defer; consider with @component metadata block)

Source: Auditor A §A4. Default `'open'` already correct (`define-element.ts:83`). aihu currently has no userland surface to set the mode without going through the unstable `defineElement` direct-import path.

A new `@component` metadata block could expose `shadow: 'open' | 'closed' | 'none'`:

```aihu
@component {
  shadow: 'open',
}
```

**Verdict.** Not in Director r3's RATIFY/DEFER list explicitly; flagged here for future spec consideration. Userland can still set the mode via the unstable `defineElement` direct-import path.

---

## §4 — Cross-cutting concerns (Auditor B's six axes; reconciled)

Compressed from Auditor B's six-axis analysis. Each axis frames platform-native state today, aihu's current state, Vue 3's approach, other frameworks, and recommended aihu posture. Cross-references §3 sugar proposals where they cover the axis.

### §4.1 Security

**Platform native today.** Web Components escapes attribute values automatically when assigned via `Element.setAttribute()`. Property-path assignments don't traverse an HTML parser. Remaining unsafe vectors are markup-parsing string sinks (`innerHTML`, `outerHTML`, etc.). Two newer platform primitives mitigate: **Trusted Types** (Chrome shipped, Firefox in progress, Safari behind flag — not Baseline 2024); **Sanitizer API** (`Element.setHTML(input, { sanitizer })` — emerging Baseline).

**aihu current state.** Floor is excellent. Scout D3c verified zero dynamic-code-execution paths anywhere in production source — no `vm.runIn*`, no string-as-handler `setTimeout`. Single DOM-injection vector is `{@html expr}` (Variant B rename of `$html`), lowered at `emit.rs:2061-2068` to direct innerHTML-property assignment with WARNING comment. Curly-attribute serialization flows escape-by-default via `setAttribute(key, String(value))` (`attrs.ts:117-120`).

Gaps: no sanitizer plug-point in `aihu.config.ts` today (spec §6 proposes); no Trusted Types path (spec §12.5 defers); event-handler bodies execute in SFC module scope (no isolation, matches React/Vue/Solid); codegen silent-drop at `emit.rs:2088` (closes via C500 exhaustiveness check); `$emit` payload trust is typed but not sanitized.

**Vue 3.** `v-html` ships as recognized unsafe directive with prominent docs callout. **No built-in sanitizer.** Recommendation: bring DOMPurify yourself or avoid `v-html`. CSP: AOT-compiled SFCs avoid `unsafe-eval`. **What tripped Vue authors:** no first-class sanitizer hook (community wrappers vary by quality); `unsafe-eval` for runtime template compilation was a long-standing foot-gun until precompile became recommended.

**Other frameworks.**
- **Lit.** `unsafeHTML` directive (named, imported by symbol). Internal sanitizer hook (`setSanitizer` on `RenderOptions`). Trusted Types: lit-html defaults to rejecting non-Trusted values for `script`/`style` sinks under CSP enforcement.
- **Svelte 5.** `{@html expr}` — same call-site sigil shape Variant B picks up. Compiler emits `setAttribute`/property writes. No built-in sanitizer; community ships `svelte-purify`.
- **Solid.** Property-style raw-HTML escape hatch.
- **Stencil.** Compiler escape-by-default; no Stencil-specific raw-HTML directive.
- **FAST.** `html\`…\`` template tags, lit-html-style binding; FAST elements explicitly enable Trusted Types.

**Convergent signals.** (1) Every framework names the unsafe operation at the call site (`v-html`, `unsafeHTML`, `{@html}`). Variant B aligns. (2) Sanitizer is a plug-point, not a default. Bundling DOMPurify is rejected universally (size + false-safety). (3) Trusted Types is opt-in via app-level policy.

**Recommended aihu posture.** Ratify Spec §6 with three amendments:

1. **Default sanitizer hook to identity AND ship `defineAihuSanitizer` factory.** Director r2 §5 ratified the identity default. Audit amendment: ship factory in `@aihu/runtime`. Userland: `templates.htmlSanitizer: defineAihuSanitizer(DOMPurify.sanitize)`. Identity is default; userland opts in. → §3.11 / D6.
2. **Trusted Types as v0.4 first-class feature.** Spec §12.5 punts implementation. v0.4 acceptance criterion: runtime's raw-HTML write path goes through a single chokepoint module so a TT policy can be wired without source surgery. Lit lesson: TT integration is cheap *if* you've consolidated unsafe sinks early.
3. **Expand C500 closure to value-form mismatches.** Spec §6 closes only unknown-directive case (`$ifx={…}`). Same exhaustiveness check should error on known-directive + unsupported value-form (e.g., quoted form for `$on.click`).

**One-paragraph defense.** aihu's security floor is ahead of Vue today (zero dynamic-code-execution is a clean negative result Vue cannot match because of its runtime template compiler). Remaining gaps are addressable with surface area that already exists in the spec. Don't bundle DOMPurify (Lit and FAST both rejected on size + false-safety grounds).

**Escape hatch.** `import { unsafeWriteHTML } from '@aihu/runtime'` — named, ugly, log-warned in dev. Mirrors lit-html's `unsafeHTML` directive shape.

### §4.2 Data flow

**Platform native today.** Custom Elements expose two parallel state surfaces: attributes (string-typed, `observedAttributes` + `attributeChangedCallback`) and properties (any type). Platform does not auto-reflect properties to attributes. Cross-component data: Custom Events (child→parent via DOM bubbling); EventTarget as lightweight pub-sub; BroadcastChannel for cross-tab; **WICG Context proposal** (Lit Context, in Chrome behind flag) — `provide`/`consume` via DOM events, standards-track DI answer. Not Baseline.

**aihu current state.** Reactive contract is signals (push-based, synchronous, fine-grained per-attribute effects). Pipeline: parser → `Attr::Binding` → codegen tuple → runtime `_applyAttrs` → `mountEffect` → `_setAttrOrProp(el, key, get())`. No VDOM, no scheduler, no microtask queue.

Declaration surface (`@state` v2 collection-form): `$prop`, `$computed`, `$resource`, `$action`, `$effect`, `$lifecycle`, `$event` (NEW this round).

Gaps verified:
- **No provide/inject equivalent.** `createApp({ provide: { … } })` (`packages/app/src/client.ts:39-41`) hoists onto `globalThis` — global registry, not tree-scoped. **Hole.**
- **No documented global-state pattern.** Userland projects roll their own via signals at module scope. No docs page on stores.
- **`$emit` only goes up.** Default `bubbles: true, composed: false` (correct DOM semantics); no sibling-broadcast story.
- **Two-way binding** handles property-side; attribute-reflection on `$prop` is implicit only via options-form `defineComponent({ attrs: [...]})` — not first-class for function-form. Closes via §3.6 / R1.

**Vue 3.** Refs/reactive proxy-based reactivity. `defineProps` + `defineEmits` (Composition API macros, `<script setup>`) — direct precedent for aihu's `$prop` + `$event`/`$emit`. `defineModel` (3.4+) collapses two-way binding into one declaration. `provide`/`inject` for tree-scoped DI; type-safe via `InjectionKey<T>`. Pinia community-conventional global store.

**What Vue got right.** `defineEmits` made component-event types first-class. **What tripped Vue.** Vue 2 → Vue 3 emit migration was painful (events API reworked twice); `provide`/`inject` is type-unsafe by default.

**Aihu lessons.** Ship `$event` typed from day one (spec §5 does); never support an untyped fallback. If aihu adds inject-equivalent, make `inject<T>('key')` typed at the declaration site, not at the consumer.

**Other frameworks.**
- **Lit.** `@property({ type, reflect: true })`; cross-tree DI via WICG Context (`@lit/context`) — standards-track answer.
- **Svelte 5.** Runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`); `setContext`/`getContext` for tree-scoped DI.
- **Solid.** `createSignal`/`createMemo`/`createEffect` — direct precedent for aihu signals; `createContext` + `useContext` for DI.
- **Stencil.** `@Prop`, `@State`, `@Event` decorators. `@Event()` returns `EventEmitter<T>`.
- **FAST.** `@attr`/`@observable`; container-pattern DI.

**Convergent signals.** (1) Props-down + events-up is universal. aihu lands here. (2) Tree-scoped DI is universal except FAST. **aihu has a hole.** (3) Two-way binding split is real (Vue/Svelte/Lit/aihu have it; Solid/Stencil don't); don't expand without strong reason. (4) Global-state is community-conventional everywhere; don't ship one.

**Recommended aihu posture.**

1. **Add `$context` collection to `@state` v2 (DI hole-filler).** New collection-form macro alongside `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event`. WICG-Context-aligned (`@lit/context` polyfill). Tree-scoped, typed end-to-end, opt-in. → §3.7 / D4.
2. **Document module-scope-signal pattern as global-state recommendation, with `$store` helper.** No new block; doc-level guidance only. Solid/Svelte/Pinia all converge here.
3. **Add `bubbles`/`composed` knob to `$event:` and document the matrix.** Spec §5.a defaults `bubbles: true, composed: false`. Audit recommendation: keep defaults, expose third option `scope: 'self' \| 'parent' \| 'document'` that maps to bubbles/composed pair plus dispatch-target. Hide the famous platform foot-gun (why doesn't my event escape the shadow root? → composed = false). Default `'parent'` (current behavior). → noted; v0.4 follow-up.

**Escape hatch.** All paths preserve `addEventListener`/`dispatchEvent` access via `$ref={el}`-captured element refs.

**One-paragraph defense.** aihu's signals + `@state` v2 collection-form + new `$event` collection lands *ahead* of Vue 3 ergonomically — collection-form unification with per-name metadata is something Vue's `defineProps`/`defineEmits` macros can't match. The two gaps (DI, global state) are addressable without breaking Variant B; DI is the higher-leverage one. **Don't ship a Pinia.**

### §4.3 Style

**Platform native today.** Shadow DOM has three options: open (default), closed (devtools-hostile), none (flat DOM). Style primitives: `:host`, `::part(name)` — externally-targetable named parts (CSS-shadow-parts standard); `::slotted(selector)`; **Constructable Stylesheets** (`new CSSStyleSheet()` + `adoptedStyleSheets`) — Baseline 2023; CSS `@layer` — Baseline 2022; container queries — Baseline 2023; `@property` registered custom properties — Baseline 2024.

**aihu current state.** Defaults `shadowMode: 'open'` (`define-element.ts:75-87`). `'closed'` has v0 limitation (compiler-emitted code reads `this.shadowRoot` which returns `null` for closed mode). The `@style` block is in spec §10 IS-NOT-IN — explicit non-goal for current round. Documented shape uses `:host`, `$reactive(<expr>)` (signal-bound CSS custom property), `$media`, `$when`.

Gaps verified:
- **No `static styles`-style aggregation across components.** Each SFC's `@style` block is per-instance; Constructable Stylesheets aggregation NOT used (zero `adoptedStyleSheets` hits across instance-shared paths).
- **No documented `::part` story.**
- **No CSS `@layer` guidance.**
- **Style hot-reload status unclear** — runtime-side is signal-driven so style updates flow through `$reactive(...)`; structural changes likely require full SFC HMR via `_hmrReplace`.

**Vue 3.** `<style scoped>` uses attribute-selector hack (NOT Shadow DOM); `data-v-<hash>` on every element. Pros: no Shadow DOM tax. Cons: not encapsulated. **`v-bind` in styles** (3.0.0-beta.18+) — reactive CSS via JS-bound custom properties. Direct precedent for aihu's `$reactive(...)`.

**What Vue got right.** `v-bind` in styles. **What tripped Vue authors.** Scoped CSS leaks (`::v-deep`/`:deep()` added to fix); `:slotted()` confusion; CSS Modules vs scoped vs global per-block inconsistency.

**Other frameworks.**
- **Lit.** `static styles = [css\`…\`]` aggregates Constructable Stylesheets. **Gold standard.** `:host`/`::part`/`::slotted` all native. No inline-style reactivity sugar (`styleMap` is more verbose than Vue's `v-bind`).
- **Svelte.** Class-hash injection; no Shadow DOM by default; CSS-in-JS-style `--var: {expression}` reactive bindings.
- **Solid.** No built-in scoping; userland uses CSS Modules / vanilla-extract / Tailwind. Solid Element does Shadow DOM if opted in.
- **Stencil.** Shadow DOM by default; `static styles`; `$global: true` for full-document injection.
- **FAST.** Shadow DOM; `css\`…\``; design-token system as first-class API.

**Convergent signals.** (1) Shadow DOM scoping > attribute-hash for component-library use cases (Lit/Stencil/FAST/aihu). Attribute-hash wins for app-level use cases. (2) Constructable Stylesheets aggregation universal in Shadow-DOM frameworks. (3) Reactive CSS via `v-bind`-style sugar winning ergonomically.

**Recommended aihu posture** (cross-references §3.5).

1. **Keep Shadow DOM open as default.** Already the case.
2. **Land Constructable Stylesheets aggregation in v0.4** (L1). Invisible to userland; cuts bytes and parse time.
3. **Adopt `::part(name)` as documented theming surface.** `<button part="primary">` in component is the contract; consumers theme via `my-component::part(primary) { … }`. Lit pioneered; standards committee blessed it. Vue/Svelte's `:deep()` is on the wrong side of history.
4. **Preserve `$reactive(...)` as reactive-CSS sugar.** Better than Lit's `styleMap`; matches Vue's `v-bind` in styles.

**Migration cost.** Constructable Stylesheets aggregation is invisible to userland (no `.aihu` source changes); `::part` adoption is a doc + convention shift. Both can land in v0.4 without re-litigating `@style` in v0.3.

**Escape hatch.** `<my-component shadowmode="none">` is the existing escape; document it as the answer for "I need this in light DOM."

**One-paragraph defense.** aihu has a strong base (Shadow DOM open default + `$reactive` sugar). The two upgrades (Constructable Stylesheets aggregation + `::part` adoption) are platform-native, cost-free at the userland surface, and bring aihu to the Lit/Stencil bar without giving up Vue's ergonomic edge in reactive styles.

### §4.4 Accessibility

**Platform native today.** Custom Elements have first-class a11y primitives most frameworks underuse: ARIA attributes; ARIA reflection (`HTMLElement.role`, `el.ariaLabel`, etc.) — Baseline 2024+; **`ElementInternals`** (`this.attachInternals()`) — `internals.role = 'button'`, plus form-association via `setFormValue`/`setValidity` — Baseline 2023+; customized built-ins (Safari refuses); `delegatesFocus` option on `attachShadow` — Baseline 2023; `:focus-visible` — Baseline 2022; `inert` attribute — Baseline 2023; Popover API — Baseline 2024.

**aihu current state.** Partial a11y story via arch-5 macro-elements (`packages/runtime/src/a11y.ts`): `<$liveRegion>`, `<$skipLink>`, `<$focusTrap active={…}>`, `<$visuallyHidden>`.

Gaps verified by inspection:
- **No `ElementInternals` integration anywhere in production source.** Zero hits on `attachInternals` / `ElementInternals` across `packages/`. **Largest a11y gap.**
- **No `delegatesFocus` opt-in.**
- **No declarative ARIA story at the SFC author level.**
- **Form-association zero.** No `formAssociated`, `setFormValue`, `setValidity`.
- **No keyboard-equivalent enforcement.** A `<div role="button" $on.click={fn}>` does NOT fire on Enter/Space.
- **No reduced-motion respect** in `$reactive(...)`.

**Vue 3.** No first-class declarative ARIA. Docs page covers manual ARIA pass-through, focus management, keyboard handlers — all opt-in and hand-rolled. **What tripped Vue:** authors routinely ship `<div role="button">` without keyboard handlers; form-association in Vue Custom Elements is awkward. **a11y was an afterthought; it shows.**

**Other frameworks.**
- **Lit.** Recommends `ElementInternals` + ARIA reflection in docs. Pattern: `_internals = this.attachInternals(); this._internals.role = 'button';`. Lit's examples ship this; framework-level enforcement is zero. Reactive Controllers heavily used for focus management.
- **Stencil.** `formAssociated: true` on `@Component` decorator + `@AttachInternals()` decorator. Closer to first-class than Vue.
- **Svelte.** Compiler emits a11y *warnings* — flagging missing `alt`, missing `aria-label` on icon-only buttons. **Only framework with build-time a11y linting in core.** Worth mirroring (L4).
- **Solid.** No first-class a11y story.
- **FAST.** Design-system level: every shipped component has built-in keyboard handling, `ElementInternals` ARIA, form-association.

**Convergent signals.** (1) **a11y is universally an afterthought** in template syntax. aihu has an opportunity. (2) `ElementInternals` is the standards-track answer; Lit + Stencil have adopted; Vue + Svelte + Solid have not. (3) Build-time a11y linting (Svelte) is rare and high-value.

**Recommended aihu posture. THE HIGHEST-LEVERAGE AXIS IN THE AUDIT.** No framework has shipped what proposals 1+2 below describe.

1. **Add `$aria` collection to `@state` v2 (declarative ARIA via `ElementInternals`).** → §3.2 / D2. Defer v0.4. New collection-form macro; wires `attachInternals()` once, `mountEffect` per `$aria.<name>` to `internals.aria<Name>` (or role).
2. **Auto-promote `$on.click={fn}` to fire on Enter/Space** when component has `$aria.role` declared as a keyboard role (`button`, `link`, `menuitem`, etc.). Compiler-time check; auto-wires `keydown` listener with `e.preventDefault()`. **#1 a11y bug across every framework — closing it at framework level is marketing win.** → §3.2 paired bonus.
3. **Add `delegatesFocus: boolean` to `defineElement` options + `<DefineOptions>` field.** Default false; document use case. One-line addition to `packages/runtime/src/define-element.ts:38`. Essential for custom button/input wrappers.

**Bonus proposals (lower priority but cheap):**

4. **Build-time a11y lint pass** (L4) — flags `<img>` without `alt`, icon-only `<button>` without `$aria.label`, `$on.click` on non-interactive without `$aria.role`. Svelte does this; loved.
5. **First-class form-association** (D5) — `$form` collection per §3.3.
6. **`prefers-reduced-motion` first-class** (L8) — `$reactive.motion(<expr>)` form. WCAG 2.2 AAA hook.

**Reference WCAG 2.2 baseline.** Recommendation: aihu publishes a "WCAG 2.2 AA Baseline" doc listing every framework feature that contributes (declarative ARIA, keyboard auto-promotion, focus trap, skip-link, live region, reduced-motion, focus-visible) and userland responsibilities (color contrast, alt text, semantic HTML choices). Marketing leverage: **"aihu is the first SFC framework with first-class a11y."**

**Escape hatch.** `$ref={el}` exposes the element. Once `$aria` is declared, userland MUST NOT mix in raw `aria-*` attributes — framework owns the ARIA surface for that component.

**One-paragraph defense.** Vue 3, Solid, Svelte 5 all treat a11y as userland responsibility. Lit and Stencil partially adopt `ElementInternals` but don't enforce. **No framework has shipped declarative `$aria` + auto-keyboard promotion.** aihu has an unclaimed mountain to plant a flag on.

### §4.5 Extension

**Platform native today.** Class extension; mixins (lose static-method inheritance ergonomics); customized built-ins (Safari blocks, dead). No platform "composable" primitive — JavaScript module-scope-function pattern is the answer.

**aihu current state.** Composable story today is module-scope functions calling `signal()`. Verified: no `defineComposable` or `useComposable` helper exported. `onMount`/`onCleanup` (re-exported as `_onMount`/`_onCleanup`) work *only inside `setup()`* — throw `RuntimeError SCR-R0010` if called outside an owner context.

Component extension surface: composition via slots/props; `<$slot name="X" />`; project-level shadowing (Plugin Contract §6.3); no "extending a component class" pattern.

Composables / shared logic gap: no documented composable pattern; Lit "reactive controller" pattern (component-scoped composable with lifecycle access) has no aihu equivalent; Vue's "composable function" pattern maps trivially via module-scope but isn't documented.

**Vue 3.** Three mechanisms: (1) **Composables** — JS functions returning reactive state; convention `useFoo()`; can call `onMounted`/`onUnmounted` if called from `setup()`. **Dominant pattern.** (2) **Custom directives** — `app.directive('foo', { mounted(el, binding) { … } })`; lower-level than composables. (3) Mixins — Options API only; deprecated in Composition API.

**What Vue got right.** Composables as plain functions — no class boilerplate, no decorator soup. Type inference trivial. **What tripped Vue.** Custom directives awkward in Composition API (live outside component-function scope; directive's `mounted`/`updated` hooks don't have access to component's reactive context). **Lesson:** two layers (composable + directive) are confusing.

**Other frameworks.**
- **Lit.** **Reactive Controllers** are the elegant answer. Class implementing `ReactiveController` with `hostConnected`/`hostDisconnected` lifecycle. Has access to host AND can call `host.requestUpdate()`. **The pattern aihu should adopt.**
- **Solid.** Composables as plain functions; `createSignal`/`createMemo` work outside component scope if owners are right. Lifecycle via `onCleanup`.
- **Svelte 5.** Runes work inside `*.svelte.ts` files — composables first-class as `*.svelte.ts` modules.
- **Stencil.** No composable pattern; everything in `@Component` class.
- **FAST.** Behaviors (similar to Lit Controllers); design-token system pluggable axis.

**Convergent signals.** (1) Composables-as-functions is dominant (Vue 3, Solid, Svelte 5). (2) Lit Controllers add lifecycle-aware composables — *superset* of function pattern. **Aihu should adopt.** (3) Custom directives de-emphasized.

**Recommended aihu posture.** Position aihu's extension story between Vue 3 composables and Lit Reactive Controllers.

1. **Document module-scope-function composables as recommended pattern.** No new API; doc-level guidance only. Vue 3 + Solid + Svelte 5 converge here.
2. **Add `$controller` collection to `@state` v2 (Lit-Reactive-Controller equivalent).** → §3.1 / D3. Lowering: `$controller.<name>.value()` called once at `mount`; if result has `hostConnected`/`hostDisconnected`, wired automatically; result exposed in `@template` scope. **Lit's pattern with zero class boilerplate via collection-form unification — Vue/Solid/Svelte can't match this ergonomically without breaking their block model.**
3. **Skip custom directives entirely.** Don't ship `app.directive('foo', …)` API. `$controller` + `$ref` (now functional) cover every directive use case. Vue's directive ergonomics are mediocre; nobody else has them; cutting the surface is a clarity win.
4. **Document `onMount`/`onCleanup` access from `$controller` AND `$lifecycle`.** Currently exported but undocumented.

**Default vs opt-in.** Composables are default for shared logic. `$controller` opt-in for lifecycle-aware composables. Custom directives — none.

**Escape hatch.** `$ref={el}` + module-scope function with manual `addEventListener`/cleanup.

**One-paragraph defense.** Vue's two-layer (composable + directive) story is a known wart; Lit's Reactive Controllers are widely admired but require class boilerplate; aihu's `$controller` collection gets the Lit benefit with zero class boilerplate by reusing the same `@state` collection-form authors already know. **Free win.**

### §4.6 Pluggability

**Platform native today.** Build-tool integration via Vite plugins (current dominant); Rolldown plugins (Rust-rewritten Vite-API-compatible; Vite 8+ uses internally); esbuild plugins (mostly subsumed); Browser DevTools custom panels; LSP for editor integration.

**aihu current state.** Pluggability surface is real and well-shaped. Plugin contract: Identity (`name`, `version`, `namespace`, `aihuVersion`); Contributions (`blocks`, `macros`, `components`, `transforms`, `serverRuntime`, `middleware`); Lifecycle hooks (`beforeCompile`, `afterParse`, `transformBlock`, `afterCompile`); Block parsers + macro lowerings; Validation (`validatePlugin` with stable error codes per spec §8.1); Server-side contributions (provisional in v1.0); Plugin composition / dependencies (topological sort).

Working today: type contract complete; v0.2.1 ships `definePlugin` factory + `validatePlugin`; `aihu.config.ts` registration explicit (auto-discovery forbidden); plugin host inside Vite (`viteAihuPlugin()`).

Gaps verified:
- **Compiler dispatcher is stub** — "v0.2.1 ships the type contract … the compiler dispatcher is a no-op until v0.3+ wires block parsers, macro lowerings, and hook execution." Plugins don't actually *run* yet.
- **No LSP.** VS Code extension is TextMate-only; `aihu.tmLanguage.json:144-171` regex grammar is brittle (Scout D6.2 — non-recursive `\{[^}]*\}` mis-tokenizes nested braces).
- **No DevTools panel.**
- **No runtime plugin contract** — only build-time.
- **Vite-coupling concern (user-flagged).** `packages/app/src/vite-plugin.ts` imports `vite` types extensively; `viteAihuPlugin()` is Vite-shaped.

**Vue 3.** Layers: Vue plugins (`app.use(MyPlugin)`); Vite/Rollup plugins (`@vitejs/plugin-vue`); **Volar** — language server, first-class IDE story; Vue DevTools Chrome extension; vue-cli legacy. **What Vue got right.** Volar — dedicated LSP for `.vue` SFCs end-to-end. Major reason Vue feels "first-class" in IDEs. **What tripped Vue.** vue-cli legacy migration tax; Vue 2 → 3 plugin contract change broke ecosystem plugins. **Lesson:** version plugin contract carefully (aihu does — `aihuVersion` in `Plugin.aihuVersion`).

**Other frameworks.**
- **Lit.** No build step required. Pluggability story is **the standards-track web platform itself.** Compelling story by avoidance.
- **Stencil.** Compiler has its own plugin API; SSR, lazy-loading, prerendering all configured at compiler level. More invasive than Vue/aihu but less ecosystem.
- **Svelte.** `svelte-preprocess` plugin-able preprocessor; `vite-plugin-svelte`; community-maintained Svelte LSP (solid).
- **FAST.** Conventional Webpack/Vite; pluggability is design-system-shaped.

**Convergent signals.** (1) Build-step is dominant pluggability surface for SFC frameworks. Lit's no-build story is unique. (2) LSP is universal-but-uneven. Volar is gold standard. (3) DevTools extensions are framework-specific and high-impact for adoption.

**Recommended aihu posture.** Five concrete proposals:

1. **Land v0.3 compiler dispatcher** (block parsers, macro lowerings, hook execution). Currently stubbed; without dispatcher, `Contributes.macros` doesn't work. Plugin contract on paper without runtime is theatre. **Must-ship.**
2. **Define runtime plugin contract distinct from build-time** (L6). Add `RuntimePlugin` to `@aihu/runtime` exports. Hooks: `beforeMount(host, tree)`, `afterMount(host, scope)`, `wrapMountEffect(fn)`, `wrapEvent(name, handler)`. Use cases: tracing, error boundaries, instrumentation. Vue's `app.use()` runtime-plugin shape is the model.
3. **Decouple from Vite as hard dependency** (L7). Extract `BuildHost` interface in `@aihu/compiler`; Vite, Rolldown-as-host, Webpack/esbuild adapters implement. Vite plugin becomes one host adapter. **The user's flagged "remove Vite" path lands here.** Lit's no-build story shows the value of not coupling to one host. aihu can't be no-build (requires Rust compiler) but it can be host-agnostic.
4. **Ship LSP as Builder priority for v0.4** (D6). Volar-shaped (`.aihu`-aware language server with hover, go-to-def, rename, diagnostics). Spec §7 generated `.aihu.ts` sidecar is correct stopgap; LSP is long-term answer. **Largest single DX gap.**
5. **Author DevTools panel as community plugin** (L5). Use runtime plugin contract from #2 as data source. Inspect `componentInstanceRegistry`, `@state` signal values, `$emit`'d events, mount-effect tracking. Don't bloat core.

**Pluggability surface diagram (recommended documentation):**

```
build-time plugins (definePlugin)
  ├── block parsers       — new @blocks
  ├── macro lowerings     — new $macros
  ├── components          — bare-import elements
  ├── transforms          — AST passes
  └── server contributions — middleware, RPC
runtime plugins (defineRuntimePlugin) [NEW]
  ├── beforeMount / afterMount hooks
  ├── wrapMountEffect    — instrument all effects
  └── wrapEvent          — instrument all event handlers
build-host adapters (BuildHost) [NEW]
  ├── Vite (default)
  ├── Rolldown (v0.4)
  └── Esbuild (community)
LSP (`@aihu/lsp`) [v0.4]
  ├── hover / go-to-def / rename
  └── diagnostics (C300-C500 surfaced in editor)
DevTools (`@aihu/devtools`) [community]
  └── reads runtime plugin hooks
```

**One-paragraph defense.** aihu's plugin contract (already ratified, 920+ lines of spec) is more thorough than Vue's `app.use()` API and more ergonomic than Stencil's compiler-internal hooks. Gaps — dispatcher, runtime contract, host-agnosticism, LSP, DevTools — are mostly known and on the roadmap. Audit's leverage is sequencing: **dispatcher first (unlock the contract), runtime contract + host-agnosticism second (open door to user's "remove Vite" path), LSP third (close largest DX gap).** None of these break Variant B.

### Cross-axis summary

**Highest-leverage proposals (top 3 across all axes):**

1. **§4.4 prop 1+2 — `$aria` collection + auto-keyboard-promotion on `$on.click` for keyboard-roles.** No framework has shipped this. Marketing leverage: "aihu is the first SFC framework with first-class declarative a11y." Cost: medium. → D2.
2. **§4.5 prop 2 — `$controller` collection (Lit-Reactive-Controller equivalent inside `@state` v2).** Free ergonomic win — Lit-Controller pattern with zero class boilerplate. Cost: low. → D3.
3. **§4.2 prop 1 — `$context` collection (provide/inject hole-filler, WICG-Context-aligned).** Closes competitive gap with Vue/Solid; aligns with standards-track Context proposal. Cost: medium. → D4.

**Top 2 places aihu has clear advantage over Vue worth marketing:**

1. **Security floor: zero dynamic-code-execution paths in production source** (Scout D3c). Vue 3's runtime template compiler requires `unsafe-eval` unless precompiled; aihu compiles ahead-of-time, period. **CSP-friendly by default.** Story Vue can't tell.
2. **Collection-form unification across `@state` v2 macros** (`$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event` / future `$aria`/`$controller`/`$context`). Vue 3's six different macros (`defineProps`/`defineEmits`/`defineExpose`/`defineSlots`/`defineModel`/`defineOptions`) can't match. aihu's one-block-with-named-collections is *cleaner* and *more discoverable*. New collections extend the same shape.

**Top 2 places aihu lags vs market:**

1. **No LSP.** Volar (Vue), Svelte LSP, Stencil all ahead. **Largest single devex gap.** v0.4 priority.
2. **No tree-scoped DI.** Vue, Solid, Svelte, Lit-via-Context all have answers. aihu's only path today is `globalThis` hoisting. `$context` proposal closes this; load-bearing for v0.4.

---

## §5 — Ratify-now manifest (Director r3 §3 categorization)

Single, scannable table. Every audit proposal categorized.

| ID | Proposal | Verdict | Spec section affected | LOC delta | Notes |
|----|----------|---------|------------------------|-----------|-------|
| **R1** | `$prop` reactivity fix + optional `attribute`/`reflect`/`converter` keys | **RATIFY now** | new spec §X.1 | +50 LOC compiler emit, +20 LOC runtime | CORRECTNESS bug — Auditor A row 11 |
| **R2** | `$lifecycle` four-callback extension | **RATIFY now** | spec §X.2 | +10 LOC runtime dispatcher | additive — Auditor A row 16 |
| **R3** | `$show` → `hidden` attribute | **RATIFY now** | §3.D.27 (existing) | +5 LOC compiler emit | semantics-preserving — Auditor A row 27 |
| **R4** | `$bind` write-side verify | **RATIFY now** | §11 acceptance criterion | 0 LOC if present; +30 LOC if absent | verification only — Auditor A row 22 |
| **R5** | `$aria` + auto-keyboard-promotion | **RATIFY now** | new spec §X.4 (r4 §2) | +80-120 LOC compiler/runtime | r4 pull-in — Auditor B §4.1+§4.2 |
| **R6** | `$controller` collection | **RATIFY now** | new spec §X.5 (r4 §3) | +60-100 LOC compiler/runtime | r4 pull-in — Auditor B §5.2 + Auditor A §A10.4 |
| **R7** | `$context` collection (provide/consume, WICG-aligned) | **RATIFY now** | new spec §X.6 (r5 §2) | +70-110 LOC compiler/runtime | r5 pull-in — Auditor B §2.1 |
| **D1** | Declarative Shadow DOM (DSD) in SSR | **DEFER v0.4** | new spec | ~80 LOC SSR rewrite + DSD-detection | Eliminates FOUC + hydration mismatch. **Best-in-class WC SSR.** Lit-SSR has it; Vue 3 / Svelte 5 don't. **Connection: user's Vite-elimination interest** — DSD changes SSR contract; v0.4 is the natural slot for both. |
| **D5** | `$form` collection (form-associated custom elements) | **DEFER v0.4** | paired w/ R5 | medium | `formAssociated = true` + `ElementInternals` form-state. Shares `attachInternals()` cache with R5 (work reduction in v0.4). **Aihu would lead the framework field on this** (Vue/Svelte have no first-party answer; only Stencil ships). |
| **D6** | LSP / IDE story | **DEFER v0.4** | tooling | medium | Volar-shaped `.aihu` language server with hover, go-to-def, rename, diagnostics. Spec §7 generated `.aihu.ts` sidecar is correct stopgap; LSP is long-term answer. Largest single DX gap. (`defineAihuSanitizer` factory + TT chokepoint folded into the same v0.4 round.) |
| **L1** | Shared `adoptedStyleSheets` across instances | **DEFER v0.5+** | @style runtime | small | Bytes/parse-time win; invisible runtime change. Land alongside `@style` block work in v0.5+. |
| **L2** | CSS `@layer aihu-component` for cascade control | **DEFER v0.5+** | @style doc | small | Lower-stakes; defer to userland convention. |
| **L3** | `$on.click.once` / `.passive` / `.signal` modifiers | **DEFER v0.5+** | template syntax | small | Maps to `addEventListener` options. Nice-to-have; userland can `$on.click={fn}` + manual `{ once: true }` via `$ref` today. |
| **L4** | Build-time a11y lint pass | **DEFER v0.5+** | compiler pass | small | Mirror Svelte's compiler warnings (missing `alt`, icon-only buttons without `$aria.label`). Build-time only; lands once `$aria` ships. |
| **L5** | DevTools panel (community) | **DEFER v0.5+** | out of core | – | Out of core. Use runtime plugin contract as data source. |
| **L6** | Runtime plugin contract (`defineRuntimePlugin`) | **DEFER v0.5+** | runtime API | medium | Distinct from build-time contract; opens tracing/instrumentation use cases. |
| **L7** | `BuildHost` abstraction (Vite decoupling) | **DEFER v0.5+** | compiler API | medium-large | The user's earlier "remove Vite" interest lands here. Significant work; not blocking template-syntax v2. |
| **L8** | `$reactive.motion` (`prefers-reduced-motion` aware) | **DEFER v0.5+** | @style sugar | small | WCAG 2.2 AAA hook. Ships alongside `@style` block work. |
| **X1** | Customized built-ins (`<button is="my-btn">`) | **REJECT** | n/a | – | Safari refuses to implement (since 2018). Polyfill non-trivial. Autonomous element + `ElementInternals` covers same use cases without polyfill complexity. |

**Total RATIFY-now LOC delta:** ~270-390 LOC compiler/runtime additions across R1-R7; **0 LOC codemod** (all seven amendments strictly additive — no userland `.aihu` source changes).

**Updated codemod budget:** Variant B base 560 LOC + 0 codemod from R1-R7 = **560 LOC unchanged**. Compiler/runtime gets +270-390 LOC; still well within scope when split across B1-B5 Builder seams.

**Re-cut threshold check (Director r1 §7 + r2 §3 + r3 §3 + r4 §4 + r5 §4).**
- Variant B base codemod: 560 LOC.
- RATIFY-now amendments add: ~270-390 LOC of compiler/runtime work, **+0 LOC of codemod**.
- Net codemod budget: **560 LOC unchanged**.
- Trigger count unchanged (additive only; no new sigil, no value-form change, no structural template-side addition; +0 LOC codemod). R5/R6/R7 add new collections within the existing collection-form shape.
- Compiler/runtime ~50% larger than r3's projection but still under per-round 500-LOC ceiling when split across B1-B5 seams.
- **No re-cut required.** User-gate remains the binding constraint.

---

## §6 — Deferred items roadmap

Concise list of v0.4 and v0.5+ deferrals with one-paragraph each describing scope. Useful as a track for follow-up specs.

### v0.4 candidates

- **D1 — DSD in SSR.** Rewrite `renderToStream`/`renderToString` to emit `<template shadowrootmode="open">` wrappers inside custom elements when `shadowMode !== 'none'`. Runtime `connectedCallback` detects pre-attached shadow root and skips initial render. Best-in-class WC SSR; eliminates FOUC + hydration mismatch. ~80 LOC. **Connection to Vite-elimination:** SSR contract changes touch both.
- **D5 — `$form` collection (form-associated custom elements).** New collection-form macro. Lowers to `static formAssociated = true` + `attachInternals()` (shared with R5 `$aria` — work reduction in v0.4 since R5 has already landed the cached `attachInternals()` allocation) + `setFormValue`/`setValidity` mountEffects. Implements `formResetCallback`/`formStateRestoreCallback`/`formDisabledCallback` if userland declares matching keys. **Aihu would lead the framework field.**
- **D6 — `defineAihuSanitizer` factory + TT chokepoint + LSP.** Three v0.4-class items consolidated under D6:
  - Ship `defineAihuSanitizer` factory in `@aihu/runtime` for discoverable sanitizer integration.
  - Consolidate raw-HTML write paths into one chokepoint module (`packages/runtime/src/dom-write.ts`-shaped) so a TT policy can be wired without source surgery.
  - Ship LSP (Volar-shaped `.aihu` language server with hover, go-to-def, rename, diagnostics). Spec §7 generated `.aihu.ts` sidecar is correct stopgap; LSP is long-term answer. **Largest single DX gap.**

### v0.5+ candidates

- **L1 — Shared `adoptedStyleSheets` aggregation.** Runtime aggregates Constructable Stylesheets across instances of the same component class. Invisible to userland; cuts bytes and parse time materially. Land alongside `@style` block work.
- **L2 — CSS `@layer aihu-component`.** Cascade-layer guidance for predictable precedence. Lower-stakes; defer to userland convention.
- **L3 — `$on.click.once` / `.passive` / `.signal` modifiers.** Maps to `addEventListener` options object. Nice-to-have ergonomic; userland can `$on.click={fn}` + manual via `$ref` today.
- **L4 — Build-time a11y lint pass.** New compiler pass (post-parse) flagging missing `alt={...}`, icon-only buttons without `$aria.label`, `$on.click` on non-interactive without `$aria.role`, color-only state indicators. Mirrors Svelte's compiler a11y warnings (loved). Lands once `$aria` ships.
- **L5 — DevTools panel.** Community plugin (not in-core). Uses runtime plugin contract from L6 as data source. Inspects `componentInstanceRegistry`, `@state` signal values, `$emit`'d events, mount-effect tracking. Don't bloat core.
- **L6 — Runtime plugin contract.** `defineRuntimePlugin` in `@aihu/runtime` exports. Hooks: `beforeMount`/`afterMount`/`wrapMountEffect`/`wrapEvent`. Use cases: tracing, error boundaries, instrumentation. Currently userland has no path; module-scope monkey-patching is the only answer.
- **L7 — `BuildHost` abstraction.** Extract `BuildHost` interface in `@aihu/compiler`. Vite, Rolldown-as-host, future Webpack/esbuild adapters implement. Vite plugin becomes one host adapter among many. **The user's flagged "remove Vite" path lands here.** Significant work; not blocking template-syntax v2.
- **L8 — `$reactive.motion`.** `prefers-reduced-motion`-aware sugar in `@style` block. WCAG 2.2 AAA compliance hook. Discoverable in autocomplete; correct by default.

### Rejected

- **X1 — Customized built-ins (`<button is="my-btn">`).** Safari has refused to implement since 2018; polyfill is non-trivial. Autonomous element + `ElementInternals` (R5 + D5) covers same use cases without polyfill complexity. Document the decision; do not add `@component { extends: ... }`. Direct userland to autonomous + ElementInternals.

---

## Provenance

- Auditor A platform-integration report: `.team/audit-reports/platform-integration-001.md` (AGENTS.delta.db record id 1158474995)
- Auditor B cross-cutting + market-lessons report: `.team/audit-reports/cross-cutting-design-001.md` (AGENTS.delta.db record id 3656749825)
- Director r3 reconciliation: `.team/director-notes/template-syntax-003.md` (AGENTS.delta.db record id 1601711401)
- Director r4 user-directed scope adjustment (R5 + R6 pull-in): `.team/director-notes/template-syntax-004.md` (AGENTS.delta.db record id 2048522989)
- Director r5 user-directed scope adjustment (R7 pull-in): `.team/director-notes/template-syntax-005.md` (AGENTS.delta.db record id 4012772269)
- Director r2 reconciliation (variant choice): `.team/director-notes/template-syntax-002.md` (AGENTS.delta.db record id 2273508187)
- Architect spec (variants A/B/C evaluation): AGENTS.delta.db record id 76882731
- Variant B spec (PROPOSED, 540 lines): `docs/superpowers/specs/2026-05-06-spec-template-syntax-v2.md`
- Samples catalog: `docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-samples.md` (AGENTS.delta.db record id 2593429655)
- Topic summary (round 2; superseded this round): AGENTS.delta.db record id 3978623683
- Topic summary file: `docs/topic-summaries/template-syntax-summary.md`

*End of Template Syntax v2 — Platform Audit (Round 3) — 2026-05-06.*
