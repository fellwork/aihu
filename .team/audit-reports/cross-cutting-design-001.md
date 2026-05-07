# Cross-Cutting Design Audit — `topic:aihu-template-syntax track:userland-dx round:3 audit-pass:cross-cutting`

**Auditor:** Auditor B (cross-cutting concerns + market lessons)
**Date:** 2026-05-06
**Tags:** `topic:aihu-template-syntax track:userland-dx round:3 audit-pass:cross-cutting`
**Status:** DRAFT-PROPOSED — feeds Synthesizer alongside Auditor A's platform-mechanism pass.
**Mirror:** this file is the disk mirror; AGENTS.delta.db record companion via `agents_context_write` (kind: `cross_cutting_audit`).

**Variant context.** This audit assumes Variant B (block-tag control flow) per Director r2 reconciliation
(`.team/director-notes/template-syntax-002.md`). Architect spec at
`docs/superpowers/specs/2026-05-06-spec-template-syntax-v2.md` (PROPOSED, 540 lines). Settled cross-variant
constructs: `$on.click` / `$bind.value` (dot, not colon), `$emit.<name>(payload)` proxy, new `$event:`
collection in `@state` v2, `$ref={…}` fixed this round, `{@html expr}` for raw HTML. Six axes audited:
**security, data flow, style, accessibility, extension, pluggability**. Each axis frames platform-native
state today, aihu's current state, what Vue 3 settled on, what other frameworks converged on, and an
opinionated aihu-specific recommendation.

**Boundary with Auditor A.** Auditor A owns: platform-mechanism per construct
(e.g., "$aria block lowers to ElementInternals.role"), `defineComponent`-flavored sugar, custom-element
construction surface. This audit owns: design-ergonomics, market-lessons, default-vs-opt-in
prescriptions. Where lowering is mentioned, I cite "Auditor A owns the lowering" unless the lowering is
already in the spec or runtime.

**Citation gaps surfaced up front.** Context7 budget exhausted on Vue 3 + Lit. Svelte 5, Solid, Stencil,
FAST claims below draw on general knowledge as of 2024-2025; flagged inline with `[citation gap]` where
a doc URL would be load-bearing.

---

## §1 — Security

### Platform native today

The Web Components platform escapes attribute values automatically when assigned via `Element.setAttribute()`
(no string concatenation into an HTML buffer). Property-path assignments (`el.value = …`, `el.className = …`)
also do not traverse an HTML parser. The remaining unsafe vector is markup-parsing string sinks
(`innerHTML`, `outerHTML`, `Document.write`, `setHTMLUnsafe`).

Two newer platform primitives mitigate the unsafe paths:

- **Trusted Types** (Chrome shipped, Firefox in progress, Safari behind flag — not Baseline 2024).
  CSP `require-trusted-types-for 'script'` rejects raw strings into the dangerous sinks; only
  `TrustedHTML` / `TrustedScript` / `TrustedScriptURL` objects are accepted. Authors create them via
  `trustedTypes.createPolicy('name', { createHTML: input => sanitize(input) })`. (MDN:
  developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API.)
- **Sanitizer API** (`Element.setHTML(input, { sanitizer })`). Chrome 124+, Firefox 134+, Safari behind
  flag — emerging Baseline. Replaces ad-hoc DOMPurify.

CSP guidance for custom elements: prefer external module scripts, avoid inline event handler attribute
strings, use nonces for any required inline `<script>` (custom-element registration itself never requires
inline script).

### aihu current state

**Floor is excellent.** Scout D3c verified zero dynamic-code-execution paths anywhere in production
source — no anti-pattern primitives, no `vm.runIn*`, no string-as-handler `setTimeout`. The single
DOM-injection vector is `$html` (renamed `{@html expr}` in Variant B), lowered at
`packages/compiler/src/codegen/emit.rs:2061-2068` to a direct innerHTML-property assignment with an
in-output `// WARNING: $html is unsafe; sanitize consumer-side` comment (Scout D3a). Curly-attribute
serialization flows `parser → Attr::Binding → runtime tuple → mountEffect + setAttribute(key, String(value))`
(`packages/arbor/src/attrs.ts:117-120`) — escape-by-default at the DOM API layer (Scout D3b).

**Gaps acknowledged in the spec.**
- No sanitizer plug-point in `aihu.config.ts` today (verified — zero `sanitiz*` hits in `packages/`).
  Spec §6 proposes `templates.htmlSanitizer?: (raw: string) => string` defaulting to identity.
- No Trusted Types path. Spec §6 + §12.5 explicitly defer.
- Event-handler bodies execute in SFC module scope; no isolation boundary, no CSP-nonce mechanism (Scout
  D3d). Documented stance: ".aihu source from untrusted authors is NOT a supported use-case." This
  matches React/Vue/Solid posture.
- Codegen silent-drop at `emit.rs:2088` (`_ => {}`) means typo'd directives (e.g. `$ifx={…}`) are
  no-op'd at build, not errored. Spec §6 closes via the C500 exhaustiveness check.
- `$emit` payload trust: typed but not sanitized on either end (spec §6 explicit).

### Vue 3's approach

Vue 3 ships `v-html` as a recognized unsafe directive. The name itself is the warning sigil; docs
include a prominent "**Dynamically rendering arbitrary HTML on your website can be very dangerous because
it can easily lead to XSS vulnerabilities. Only use `v-html` on trusted content and never on user-provided
content.**" callout. **No built-in sanitizer is shipped.** Vue's recommendation is to bring a sanitizer
yourself (DOMPurify) or avoid `v-html` entirely.

Vue's attribute-value escaping is correct (the template compiler emits `setAttribute` / property-path
writes per attribute kind). CSP guidance: Vue documents using AOT-compiled SFCs (no runtime template
compilation in the browser) so `unsafe-eval` is not required for production.

**What Vue got right.** The unsafe operation has a name that flags itself at the call site
(`v-html`, not the raw HTML-property setter name). The escape-by-default story is correct; the docs page on
security explicitly frames the threat model.

**What tripped Vue authors.** No first-class sanitizer hook — userland projects ship their own DOMPurify
wrapper, and the wrapper-quality varies by team. CSP integration (`unsafe-eval` for runtime template
compilation) was a foot-gun for a long time; the SFC-precompile workflow fixed it but the docs took years
to make precompile the recommended path.

### Other frameworks

- **Lit.** `lit-html`'s `unsafeHTML` directive is the explicit unsafe path (named, imported by symbol,
  not a string sigil). Lit-html has an internal sanitizer hook
  (`setSanitizer` on the lit-html `RenderOptions`) that lets policy code intercept any binding before it
  reaches the DOM. Lit explicitly supports Trusted Types: when CSP enforces it, lit-html defaults to
  rejecting non-Trusted values for `script`/`style` sinks, and applications opt their `<my-element>`s
  into TT via the policy. Reactive properties go through `setAttribute`/property-path, same as aihu.
- **Svelte 5.** `{@html expr}` is the dedicated raw-HTML expression — same call-site-sigil shape Variant B
  picks up. Svelte's compiler emits `setAttribute`/property writes for bindings. No built-in sanitizer
  in core; the community ships `svelte-purify` for DOMPurify integration. `[citation gap]` on Svelte 5's
  Trusted Types posture.
- **Solid.** A property-style raw-HTML escape hatch is the explicit unsafe path; bound as a property,
  not a sigil. `[citation gap]` on Solid's sanitizer + Trusted Types story.
- **Stencil.** `Component({ shadow: true })` + JSX. Stencil's compiler does escape-by-default. There
  is no Stencil-specific raw-HTML directive — authors use the platform property write or render trusted
  strings via wrapper components.
- **FAST (Microsoft).** `html\`…\`` template tags use lit-html-style binding; FAST elements explicitly
  enable Trusted Types when CSP requires. Sanitizer plug similar to Lit's.

**Convergent signals.**
1. Every framework names the unsafe operation at the call site (`v-html`, `unsafeHTML`, `{@html}`,
   property-style writes). Variant B's `{@html expr}` aligns.
2. Sanitizer is a plug-point, not a default. Bundling DOMPurify is rejected by every framework
   (size cost, false-safety claim).
3. Trusted Types is opt-in via app-level policy, not framework-level. Lit and FAST integrate; Vue and
   Solid don't yet; Svelte's posture is unclear.

### Recommended aihu posture

**Ratify Spec §6 with three amendments.**

1. **Default the sanitizer hook to identity AND ship a `defineAihuSanitizer` factory.** Spec §6 already
   proposes the identity default, and Director r2 §5 ratified it. Auditor's amendment: ship a one-line
   factory in `@aihu/runtime` that wraps a user-supplied `(raw: string) => string` into the right shape,
   so the userland call site reads `aihu.config.ts` →
   `templates.htmlSanitizer: defineAihuSanitizer(DOMPurify.sanitize)`. This makes the integration path
   discoverable without bundling DOMPurify. **Default vs opt-in:** identity is the default (no-op);
   userland opts in.

2. **Land Trusted Types as a v0.4 first-class feature, not a "deferred" item.** Spec §12.5 punts it. The
   recommendation: keep deferred *implementation* but add a v0.4 acceptance criterion that the runtime's
   raw-HTML write path goes through a single chokepoint (`packages/runtime/src/dom-write.ts`-shaped
   module) so a TT policy can be wired without source surgery. This is design-time decision, not a v0.3
   ship. **Lit lesson:** TT integration is cheap *if* you've consolidated the unsafe sinks early; expensive
   if you've sprinkled them.

3. **Expand the silent-drop closure (C500) to attribute-value form mismatches as well.** Spec §6 closes
   only the unknown-directive case (`$ifx={…}`). The audit recommendation: same exhaustiveness check
   should error when a known directive receives an unsupported value-form (e.g., `$on.click="fn"` —
   curly-canonical Variant B/A drops the quoted form per Director r2 §2.3, but the codemod is the only
   guard. Build-side error for spec-drift cases is cheap insurance.) **Auditor A owns the lowering;
   I'm flagging the policy.**

**One-paragraph defense.** aihu's security floor is ahead of Vue today (zero dynamic-code-execution is a
clean negative result that Vue cannot match because of its runtime template compiler). The remaining gaps
— no sanitizer hook, no TT path — are addressable with surface area that already exists in the spec. Don't
over-rotate; don't bundle DOMPurify (Lit and FAST both rejected this on size + false-safety grounds).
**CSP guidance to publish:** "aihu compiles templates ahead-of-time; no `unsafe-eval` or `unsafe-inline`
is required for `script-src`. `{@html expr}` violates `require-trusted-types-for 'script'` unless a
TT-aware sanitizer is configured; document the policy site explicitly."

**Escape hatch.** When userland needs raw platform: `import { unsafeWriteHTML } from '@aihu/runtime'` —
named, ugly, log-warned in dev mode. Mirrors lit-html's `unsafeHTML` directive shape.

---

## §2 — Data flow

### Platform native today

Custom Elements expose two parallel state surfaces: **attributes** (string-typed, observable via
`observedAttributes` + `attributeChangedCallback`) and **properties** (any type, mutated via
`el.foo = …`). The platform does not auto-reflect properties to attributes; authors who want both
must implement reflection per property (or use Lit's `@property({ reflect: true })`).

Cross-component data:
- **Custom events** (`new CustomEvent('name', { detail, bubbles, composed, cancelable })`) — child→parent
  via DOM bubbling.
- **EventTarget** as a lightweight pub-sub.
- **BroadcastChannel** for cross-tab/cross-document.
- **WICG Context proposal** (Lit Context, in Chrome behind flag) — `provide`/`consume` via DOM events,
  the standards-track answer to dependency injection across the tree. Not Baseline.

### aihu current state

aihu's reactive contract is **signals** (push-based, synchronous, fine-grained per-attribute effects).
Verified pipeline (Scout D2 + my read of `arbor/src/attrs.ts:71-103`): a signal-bound attribute flows
parser → `Attr::Binding` → codegen tuple → runtime `_applyAttrs` → `mountEffect` →
`_setAttrOrProp(el, key, get())`. No VDOM, no scheduler, no microtask queue
(`docs/site/reactivity.md:144` — "push-based, synchronous").

**Declaration surface (per `@state` v2 collection-form, `docs/site/authoring-components.md:9-39`):**
- `$prop` — public, attribute-settable, reactive. Optional `expose: { read, write }` for agents.
- `$computed` — derived signals.
- `$resource` — async-iife pattern (3-state loader).
- `$action` — named methods, optionally agent-exposed.
- `$effect` — reactive side effects.
- `$lifecycle` — `mount` / `dispose` hooks.
- `$event` (NEW this round, spec §5) — typed custom events declared at the component, dispatched via
  `$emit.<name>(payload)`.

**Gaps verified.**
- **No provide/inject equivalent.** Searched `docs/site/`, `packages/`. No "provide", "inject",
  "context" mention outside React/Vue references in archived docs. The `createApp({ provide: { … } })`
  in `packages/app/src/client.ts:39-41` hoists values onto `globalThis` — effectively a global registry,
  not a tree-scoped context. **This is a hole.**
- **No documented global-state pattern.** Userland projects (`mail/`, `pitch/`) likely roll their own
  via signals at module scope. No docs page on stores.
- **`$emit` only goes up.** Spec §5.e dispatches custom events with `bubbles: true`/`composed: false` by
  default. Up via the parent listener; not a broadcast. This is correct DOM semantics; the gap is the
  absence of a sibling-broadcast story.
- **Two-way binding** (`$bind.value={signal}`) handles property-side; attribute-reflection on `$prop`
  is implicit (the Custom Element's `observedAttributes` is wired by `defineComponent({ attrs: [...]})`
  per `packages/runtime/src/define-component.ts:82-115`). Properties → attributes reflection back is
  not first-class.

### Vue 3's approach

Vue 3 settled on:
- **Refs / reactive** as the atomic state primitive (proxy-based, deep-reactive).
- **`defineProps`** + **`defineEmits`** (Composition API macros, `<script setup>`) — props down, events up.
  Direct ergonomic precedent for aihu's `$prop` + `$event`/`$emit`.
- **`defineModel`** (Vue 3.4+) — collapses `props.modelValue` + `emit('update:modelValue')` into one declaration
  for two-way binding. The aihu equivalent is `$bind.value={signal}` on the consumer side; declaration
  side is `$prop` + `$event` paired. **Worth considering whether aihu adds a `$model:` collection-form
  shorthand; see recommendation.**
- **`provide`/`inject`** for cross-tree dependency injection. Tree-scoped, not global. Composition API
  exposes `provide('key', value)` / `const v = inject('key')`. Type-safe via `InjectionKey<T>` (Vue docs:
  vuejs.org/guide/components/provide-inject).
- **Pinia** — community-conventional global store. Not in core but recommended in docs.

**What Vue got right.** `defineEmits` made component-event types first-class — Vue 2's `events:` option
was string-typed and untyped at the listener; Vue 3's `defineEmits<{(e: 'foo', payload: Foo): void}>()`
gives end-to-end TS coverage. Aihu's `$event:` collection in `@state` v2 (spec §5.a) is the same
ergonomic move and lands better than Vue 3 because aihu already had collection-form duality (bare/wrapped
+ `describe:` / `expose:`) — so `$event` slots in alongside `$prop`/`$action` with zero new conceptual
cost.

**What tripped Vue.** Two patterns:
1. The Vue 2 → Vue 3 emit migration was painful — Vue's events API was reworked twice (Options API
   `events:` array → Options API `emits:` array → Composition API `defineEmits`). Authors couldn't carry
   types across the boundary. **Aihu lesson:** ship `$event` typed from day one (spec §5 does); never
   support an untyped fallback.
2. `provide`/`inject` is type-unsafe by default — `inject('foo')` returns `unknown`. The
   `InjectionKey<T>` workaround works but is awkward. **Aihu lesson:** if aihu adds an inject equivalent,
   make `inject<T>('key')` typed at the declaration site, not at the consumer.

### Other frameworks

- **Lit.** `@property({ type: …, reflect: true })` decorator; reactive properties auto-call `requestUpdate`.
  Cross-tree DI via the WICG Context proposal (`@lit/context`) — `provide`/`consume` controllers wire
  through DOM events. **The Lit-context pattern is the standards-track answer**; Solid and Vue both
  adopted variants.
- **Svelte 5.** Runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`) — close to aihu's signals
  conceptually, though Svelte 5's runes look like compile-time macros. `$props()` returns a reactive
  object; `$bindable()` makes a prop two-way-bindable. `setContext` / `getContext` for tree-scoped DI.
- **Solid.** `createSignal`, `createMemo`, `createEffect` — direct ergonomic precedent for aihu's signals.
  `createContext` + `useContext` for DI (React-shaped). Stores via `createStore` for nested reactive
  objects. `[citation gap]` on Solid's emit-equivalent (Solid uses props for callbacks: `onClick={fn}`
  prop, not events; Solid components have no host element by default).
- **Stencil.** `@Prop()`, `@State()`, `@Event()` decorators. `@Event()` returns an `EventEmitter<T>` —
  closer to Vue's `defineEmits` ergonomically; lowers to `dispatchEvent(new CustomEvent(...))`. No
  built-in DI; userland uses module-scope signals or context-via-DOM-event patterns.
- **FAST.** `@attr()` for attribute-reflected props; `@observable()` for non-attr reactive props. No
  built-in DI; uses dependency-injection container pattern via `Container.findResponsibleContainer`.

**Convergent signals.**
1. Props down + events up is universal. aihu's `$prop` + `$event` lands here.
2. Tree-scoped DI is universal except FAST. **aihu has a hole.**
3. Two-way binding is *not* universal — Solid and Stencil don't do it; Vue 3 (`defineModel`), Svelte
   (`$bindable`), Lit (`@property` + manual event dispatch), and aihu (`$bind.value`) do. The split is
   real; don't expand on this axis without strong reason.
4. Global-state is community-conventional in every framework (Pinia, Redux, Zustand, etc.). Don't ship
   one; document the patterns.

### Recommended aihu posture

**Three concrete proposals.**

1. **Add a `$context` collection to `@state` v2 (DI hole-filler).** New collection-form macro alongside
   `$prop`/`$computed`/`$action`/`$resource`/`$effect`/`$lifecycle`/`$event`. Surface:

   ```aihu
   @state {
     $context: {
       provide: {
         theme: { value: () => themeSignal, describe: 'Active theme token' },
       },
       consume: {
         locale: { type: Locale, describe: 'App locale from <LocaleProvider>' },
       },
     }
   }
   ```

   Lowering should use the WICG Context proposal (`@lit/context` is a polyfill) — **Auditor A owns the
   lowering**, but the design prescription is: tree-scoped (DOM-event-driven), typed end-to-end via
   `consume.<name>.type`, opt-in (no implicit context). **Default vs opt-in:** opt-in (most components
   don't need it). **Defense:** Vue and Solid both have this; aihu's lack is a competitive gap. The
   `@lit/context` polyfill makes the platform answer cheap; building on it positions aihu well for when
   the proposal lands (ChromeStatus: "WICG Context Protocol" — promising).

2. **Document a "module-scope signal" pattern as the global-state recommendation, with a `$store`
   helper.** No new block. Doc-level guidance (`docs/site/reactivity.md`):

   ```ts
   // src/stores/auth.ts
   import { signal } from '@aihu/signals'
   export const currentUser = signal<User | null>(null)
   ```

   Components import `currentUser` directly. **Defense:** Solid does this; Svelte does this; Pinia is
   sugar over the same pattern. Don't ship a global-state library; ship the recommendation. **Default
   vs opt-in:** patterns-doc only, no API surface.

3. **Add an explicit `bubbles`/`composed` knob to `$event:` and document the matrix.** Spec §5.a
   says `bubbles: boolean = true, composed: boolean = false`. The audit recommendation: keep the
   defaults but expose a third option `scope: 'self' | 'parent' | 'document'` that maps to the
   bubbles/composed pair plus dispatch-target (e.g., `scope: 'document'` dispatches on `document` for
   broadcast-style events). **Defense:** the bubbles/composed pair is a famous platform foot-gun (why
   doesn't my event escape the shadow root? → composed = false). Hide the foot-gun. **Default vs
   opt-in:** keep `scope:` optional with default `'parent'` (current behavior).

**Escape hatch when userland needs raw platform.** All paths preserve `addEventListener` /
`dispatchEvent` access via `$ref={el}`-captured element refs (now functional this round per spec §3).

**One-paragraph defense.** aihu's signals + `@state` v2 collection-form + new `$event` collection lands
*ahead* of Vue 3 ergonomically — collection-form unification with per-name metadata is something Vue's
`defineProps`/`defineEmits` macros can't match (each is a separate macro; aihu has them in one block
with one shape). The two gaps (DI, global state) are addressable without breaking Variant B; the DI
gap is the higher-leverage one. **Don't ship a Pinia.**

---

## §3 — Style

### Platform native today

Shadow DOM offers three options:
- **Open shadow root** (`mode: 'open'`) — `el.shadowRoot` is accessible externally. Default in most
  frameworks. Style scoped via Shadow DOM tree.
- **Closed shadow root** (`mode: 'closed'`) — `el.shadowRoot` returns `null` externally; runtime stores
  a private reference. Stronger encapsulation; tooling-hostile (devtools see less, e2e tests see less).
- **No shadow root** — flat DOM; styles cascade in.

**Shadow DOM style primitives:**
- `:host` / `:host(.modifier)` / `:host([attr])` — style the custom element from the inside.
- `::part(name)` — externally-targetable named parts. The CSS-shadow-parts standard for theming.
- `::theme(name)` — *not standard*; `::part` does most of what `::theme` was proposed for.
- `::slotted(selector)` — style slotted (light-DOM) children projected through `<slot>`.
- **Constructable Stylesheets** (`new CSSStyleSheet()` + `adoptedStyleSheets`) — share one stylesheet
  instance across many elements; vastly cheaper than per-element `<style>` injection. Baseline 2023.
- **CSS `@layer`** — explicit cascade ordering; Baseline 2022.
- **Container queries** (`@container`) — Baseline 2023.
- **`@property`** registered custom properties — animatable, type-checked CSS variables. Baseline 2024.

### aihu current state

`packages/runtime/src/define-element.ts:75-87` — aihu defaults to **`shadowMode: 'open'`** (Shadow DOM,
open root). `'closed'` and `'none'` are options; `'closed'` has a v0 limitation noted in
`packages/runtime/src/types.ts:21-25` — compiler-emitted code reads `this.shadowRoot`, which returns
`null` for closed mode (full closed support deferred).

The `@style` block is in spec §10 IS-NOT-IN — explicit non-goal for the current round. Documented
shape (`docs/site/authoring-components.md:115-135`):

```aihu
@style {
  :host { color: $reactive(textColor); }
  $media (max-width: 600px) { :host { font-size: 14px; } }
  $when (isDark) { :host { background: #111; } }
}
```

`$reactive(<expr>)` lowers to a CSS custom-property bound to a signal (Auditor A owns the lowering);
`$media` and `$when` are framework macros over `@media` and runtime conditional class-assignment.

**Gaps verified.**
- **No `static styles`-style aggregation across components.** Each SFC's `@style` block is per-instance;
  Constructable Stylesheets are not used (verified by Grep on `adoptedStyleSheets` in `packages/` —
  zero hits in production source).
- **No documented `::part` story.** A Shadow-DOM-scoped component's parts are not exposed for parent
  theming; userland projects fight this every time.
- **No CSS `@layer` guidance.** Userland mixes layers ad-hoc.
- **Style hot-reload status unclear** — verified via Grep on `hmr` in `packages/` — runtime-side is
  signal-driven so style updates flow through `$reactive(...)`; structural style changes likely require
  full SFC HMR via `_hmrReplace` (`packages/runtime/src/define-component.ts:128-135`).

### Vue 3's approach

Vue 3's `<style scoped>` uses an attribute-selector hack (NOT Shadow DOM): the compiler emits
`data-v-<hash>` on every element + the selectors get an attribute-suffix transform. Pros: no Shadow
DOM tax (no slot retargeting, no `::part` boilerplate); cons: not encapsulated (any selector can leak
in or out via global stylesheets), no `:host` semantics natively (it's the component root with the
hash attribute).

**`v-bind` in styles** (Vue 3.0.0-beta.18+):

```vue
<style scoped>
.text { color: v-bind(color); }
</style>
<script setup>
const color = ref('red')
</script>
```

The compiler lifts `color` into a CSS custom property; signal-update flushes the property via JS
`element.style.setProperty('--<hash>', newValue)`. Direct precedent for aihu's `$reactive(...)`.

**What Vue got right.** `v-bind` in styles — reactive CSS without leaving the style block. This is
elegant and aihu's `$reactive(...)` matches it. Vue's `<style scoped>` keeps tooling friendly (Biome,
Prettier, IDE autocomplete in CSS work because there's no `<style>` MIME-type ambiguity).

**What tripped Vue authors.**
1. Scoped CSS leaks in subtle ways — `::v-deep`/`:deep()` was added because parent-to-child styling
   was impossible without it; the docs took years to clarify the deep-selector semantics.
2. Slotted-content styling requires `:slotted()` (Vue 3) — different syntax from Shadow DOM's
   `::slotted` and from `<style>` global rules. Authors confuse the three.
3. CSS Modules vs scoped CSS vs global — Vue offers all three; the choice is per-block, leading to
   inconsistency within one team's codebase.

### Other frameworks

- **Lit.** `static styles = [css\`…\`]` aggregates Constructable Stylesheets across instances. **The gold
  standard.** `:host`, `::part`, `::slotted` all work natively (Shadow DOM is required for `LitElement`).
  No inline-style reactivity sugar — authors use `style=${styleMap({color: x})}` directive, more verbose
  than Vue's `v-bind`.
- **Svelte.** Scoped via class-hash injection (similar to Vue's attribute-hash). No Shadow DOM by default.
  `:global(.x)` escape hatch; CSS-in-JS-style `--var: {expression}` reactive bindings.
  `[citation gap]` on Svelte 5's stylesheet aggregation.
- **Solid.** No built-in scoping; userland uses CSS Modules, vanilla-extract, or Tailwind. Solid
  Element (custom-element wrapper) does Shadow DOM if opted in.
- **Stencil.** Shadow DOM by default; `static styles` like Lit; `$global: true` flag for full-document
  injection.
- **FAST.** Shadow DOM; `css\`…\`` template literal; design-token system as first-class API
  (`DesignToken<T>`).

**Convergent signals.**
1. Shadow DOM scoping > attribute-hash scoping for component-library use cases (Lit/Stencil/FAST/aihu).
   Attribute-hash wins for app-level use cases (Vue/Svelte) — less encapsulation, better debugging.
2. Constructable Stylesheets / `static styles` aggregation is universal in Shadow-DOM frameworks.
3. Reactive CSS via `v-bind`-style sugar is winning ergonomically (Vue, Svelte, aihu via `$reactive`).
   Lit's `styleMap` is more verbose; this is a learnable advantage for aihu.

### Recommended aihu posture

Even though `@style` block format is IS-NOT-IN this round, the audit's prescription on
**defaults** stands:

1. **Keep Shadow DOM open as default.** Already the case
   (`packages/runtime/src/define-element.ts:83`). This is the Lit/Stencil/FAST consensus and is correct
   for a component-library-positioned framework.

2. **Land Constructable Stylesheets aggregation in v0.4.** The runtime today injects a per-instance
   `<style>`-equivalent (verified in `packages/runtime/src/a11y.ts:25-31` for the a11y CSS injector;
   the same pattern likely for `@style` blocks per the spec ratification path). Aggregating into
   `adoptedStyleSheets` cuts bytes and parse time materially. **Auditor A owns the lowering.**
   **Default vs opt-in:** default. No userland-visible API change.

3. **Adopt `::part(name)` as the documented theming surface.** Add a doc-level convention:
   `<button part="primary">` in a component is the contract; consumers theme via
   `my-component::part(primary) { … }`. **Defense:** Lit pioneered this; the standards committee blessed
   it. Vue/Svelte's `:deep()` is on the wrong side of history. **Default vs opt-in:** opt-in (component
   author marks parts).

4. **Preserve `$reactive(...)` as the reactive-CSS sugar.** It's better than Lit's `styleMap` and
   matches Vue's `v-bind` in styles. Document the lowering: signal-update → `style.setProperty` (Auditor
   A owns the actual emitted code). **Defense:** ergonomic parity with Vue's most-celebrated style
   feature.

**Migration cost from current state.** Constructable Stylesheets aggregation is invisible to userland
(no `.aihu` source changes); `::part` adoption is a doc + convention shift. Both can land in v0.4
without re-litigating `@style` in v0.3.

**Escape hatch when userland needs raw platform.** `<my-component shadowmode="none">` (per
`packages/runtime/src/types.ts:29`) is the existing escape; document it as the answer for "I need this
in light DOM."

**One-paragraph defense.** aihu has a strong base (Shadow DOM open default + `$reactive` sugar). The
two upgrades (Constructable Stylesheets + `::part` adoption) are platform-native, cost-free at the
userland surface, and bring aihu to the Lit/Stencil bar without giving up Vue's ergonomic edge in
reactive styles.

---

## §4 — Accessibility

### Platform native today

Custom Elements have first-class accessibility primitives that most frameworks underuse:

- **ARIA attributes** — `aria-label`, `aria-describedby`, `aria-live`, `role`, etc. Pass-through works
  on any element via `setAttribute`.
- **ARIA reflection** (`HTMLElement.role`, `el.ariaLabel`, `el.ariaLabelledByElements`, etc.) — typed
  IDL property API. Baseline 2024+ in modern browsers.
- **`ElementInternals`** (`this.attachInternals()`) — the platform answer to ARIA-on-custom-elements
  without bolting `role=` onto consumers. `internals.role = 'button'`, `internals.ariaLabel = 'Close'`,
  etc. **Form-association** (`internals.setFormValue`, `internals.setValidity`) — custom elements
  participate in `<form>` natively. Baseline 2023+.
- **Customized built-ins** (`class MyButton extends HTMLButtonElement`) — inherit native a11y for free.
  Safari refuses to ship; effectively dead-letter.
- **`delegatesFocus`** option on `attachShadow` — focus delegation across shadow boundary. Baseline 2023.
- **`:focus-visible`** — keyboard-only focus styling. Baseline 2022.
- **`inert`** attribute — entire subtree is non-interactive + screen-reader-invisible. Baseline 2023.
- **Popover API** (`popover` attribute, `togglePopover()`) — declarative popover with focus management.
  Baseline 2024.
- **CustomElement Accessibility Object Model (AOM)** — partially shipped; primary delivery is via
  `ElementInternals` ARIA-reflection IDL.

### aihu current state

aihu has **partial a11y story** via the arch-5 macro-elements
(`packages/runtime/src/a11y.ts`):

- `<$liveRegion politeness="polite" atomic="…">` — singleton announcer (used by `announce(...)` from
  `@state` actions), wires `<div aria-live aria-atomic data-aihu-announce>` into `<body>`.
- `<$skipLink target="#main">` — skip-link rendered with `.aihu-skip-link` CSS class
  (`packages/runtime/src/a11y.ts:28-30`).
- `<$focusTrap active={…} initialFocus="…" returnFocus>` — Tab cycling with reactive `active`
  (`a11y.ts:91-153`).
- `<$visuallyHidden>` — sr-only CSS-class rendering (mentioned in spec but not a fully read element).

**Gaps verified by inspection.**
- **No `ElementInternals` integration anywhere in production source.** Grepped — zero hits on
  `attachInternals` / `ElementInternals` across `packages/`. This is the largest a11y gap.
- **No `delegatesFocus` opt-in** — `attachShadow({ mode })` in `packages/runtime/src/define-element.ts:38`
  is called without `delegatesFocus`. Userland custom elements that contain a focusable child
  don't pass focus down; a `<my-button>` that wraps a real `<button>` is awkward to focus.
- **No declarative ARIA story at the SFC author level.** Authors can write
  `<div role="button" aria-label="Close" $on.click={fn}>` but there's no aihu-blessed declaration.
- **Form-association zero.** `formAssociated` flag, `setFormValue`, `setValidity` — none used.
- **No keyboard-equivalent enforcement.** A `<div role="button" $on.click={fn}>` does NOT fire on
  Enter/Space the way a real `<button>` does; aihu doesn't auto-add the keydown handlers.
- **Reduced-motion respect** — `$reactive(...)` style sugar doesn't auto-pair with
  `prefers-reduced-motion`; userland writes its own `@media (prefers-reduced-motion: reduce)` rules.

### Vue 3's approach

Vue 3 has **no first-class declarative ARIA in components.** The docs include a "Vue and Accessibility"
section (vuejs.org/guide/best-practices/accessibility) that covers manual ARIA attribute pass-through,
focus management patterns, and keyboard-handler conventions — but everything is opt-in and hand-rolled.

**What Vue got right.** Documenting the patterns at all (Vue 2 had nothing for years; Vue 3 added
the docs page).

**What tripped Vue.** Component authors routinely ship `<div role="button">` without keyboard
handlers because the framework doesn't enforce it. Form-association in Vue Custom Elements
(`defineCustomElement`) is awkward — `formAssociated` is exposed but doesn't connect to Vue's reactive
form state. **a11y was an afterthought; it shows.**

### Other frameworks

- **Lit.** Recommends `ElementInternals` + ARIA reflection in docs. The pattern is `class MyButton extends
  LitElement { _internals = this.attachInternals(); constructor() { super(); this._internals.role =
  'button'; } }`. Lit's examples ship this; framework-level enforcement is zero. Reactive Controllers
  (see §5) are heavily used for focus management and ARIA-state coordination.
- **Stencil.** `formAssociated: true` on the `@Component` decorator + `@AttachInternals()` decorator.
  Closer to first-class than Vue.
- **Svelte.** `[citation gap]` — Svelte's a11y story is community-conventional; the compiler emits a11y
  *warnings* (`svelte:options` for the actual element ID; the compiler is smart about flagging missing
  `alt` on `<img>`, missing `aria-label` on icon-only buttons, etc.) — **the only framework with
  build-time a11y linting in core.** Worth mirroring.
- **Solid.** No first-class a11y story; userland convention.
- **FAST.** Design-system level a11y: every shipped component (`<fluent-button>`, `<fluent-dialog>`)
  has built-in keyboard handling, `ElementInternals` ARIA, and form-association. The framework doesn't
  enforce a11y on user code; it ships with high-quality components as the example.

**Convergent signals.**
1. **a11y is universally an afterthought** in template syntax. Aihu has an opportunity.
2. `ElementInternals` is the standards-track answer; Lit + Stencil have adopted; Vue + Svelte + Solid
   have not (or incompletely).
3. Build-time a11y linting (Svelte) is rare and high-value.

### Recommended aihu posture

**This is the highest-leverage axis in the audit. aihu should ship a first-class a11y story.**

Three concrete proposals:

1. **Add an `$aria` collection to `@state` v2 (declarative ARIA via `ElementInternals`).** New
   collection-form macro:

   ```aihu
   @state {
     $aria: {
       role: { value: 'button', describe: 'This component IS a button.' },
       label: { value: () => `Close ${itemName()}`, describe: 'Accessible name' },
       expanded: { value: () => isOpen() },
       describedBy: { ref: 'desc-1' },  // points at $ref'd element
     }
   }
   ```

   **Lowering (Auditor A owns):** the compiler wires `this.attachInternals()` once per component;
   each `$aria.<name>` flows through a `mountEffect` that writes `internals.aria<Name>` (or the role).
   This is the platform's intended path. **Default vs opt-in:** opt-in (only components that *are* a
   role declare it). **Defense:** Lit + Stencil already do this; Vue + Solid don't; aihu beats Vue
   here.

2. **Auto-promote `$on.click={fn}` to also fire on Enter/Space when the component has `$aria.role:
   'button'` (or any role with that contract).** Compiler-time check: if `$aria.role` is a role that
   requires keyboard activation (`button`, `link`, `menuitem`, etc.), `$on.click` automatically
   wires a `keydown` listener that fires `fn` on Enter/Space + calls `e.preventDefault()`. **Defense:**
   the #1 a11y bug in non-button-element click handlers across every framework. Closing it at the
   framework level is a marketing win. **Default vs opt-in:** automatic when `$aria.role` declares a
   keyboard role; off otherwise. Escape hatch: `$on.click.mouseOnly={fn}` modifier (out-of-scope
   detail, can land later).

3. **Add `delegatesFocus: boolean` to `defineElement` options + a `<DefineOptions>` field. Default
   false; document the use case.** Already wirable via `attachShadow({ mode, delegatesFocus })`. One-line
   addition to `packages/runtime/src/define-element.ts:38`. **Defense:** essential for custom
   button/input wrappers; the platform handles focus delegation natively when opted in.

**Bonus proposals (lower priority but cheap):**

4. **Build-time a11y lint pass.** A new compiler pass (post-parse) that flags: `<img>` without
   `alt={…}`, icon-only `<button>` without `$aria.label`, `$on.click` on non-interactive element
   without `$aria.role`, color-only state indicators (heuristic). **Defense:** Svelte does this and
   it's loved. Build-time + lintable; userland doesn't have to think about it.

5. **First-class form-association.** A `$form` block (or `formAssociated: true` flag in `@state`):

   ```aihu
   @state {
     $form: {
       value: { signal: () => valueSig, type: 'string' },
       validity: { check: () => valueSig().length > 0 ? 'valid' : 'invalid' },
     }
   }
   ```

   Lowering wires `internals.setFormValue()` + `internals.setValidity()`. Custom elements participate
   in `<form>` like real `<input>`s. **Default vs opt-in:** opt-in. **Defense:** Stencil ships this;
   it's a major form-builder unlock.

6. **`prefers-reduced-motion` first-class in `$reactive(...)` style sugar.** A
   `$reactive.motion(<expr>)` form that returns `<expr>` when motion is allowed, an identity-ish
   fallback when reduced. Discoverable in autocomplete; correct by default. **Defense:** WCAG 2.2
   AAA compliance hook.

**Reference WCAG 2.2 baseline.** The recommendation: aihu publishes a "WCAG 2.2 AA Baseline" doc
listing every framework feature that contributes (declarative ARIA, keyboard auto-promotion, focus
trap, skip-link, live region, reduced-motion, focus-visible) and userland responsibilities (color
contrast, alt text, semantic HTML choices). **Marketing leverage:** "aihu is the first SFC framework
with first-class a11y."

**Escape hatch when userland needs raw platform.** `$ref={el}` exposes the element; userland calls
`el.attachInternals()` (forbidden after the framework has already attached) or uses raw ARIA attributes.
The recommendation should explicitly document that **once `$aria` is declared, userland MUST NOT mix
in raw `aria-*` attributes** — the framework owns the ARIA surface for that component.

**One-paragraph defense.** Vue 3, Solid, and Svelte 5 all treat a11y as userland responsibility. Lit
and Stencil partially adopt `ElementInternals` but don't enforce. **No framework has shipped what
proposal §1 + §2 describes** (declarative `$aria` + auto-keyboard promotion). aihu has an unclaimed
mountain to plant a flag on. The audit's strongest "aihu does what the market lags on" recommendation
sits here.

---

## §5 — Extension (extending what aihu provides)

### Platform native today

Custom Elements support extension via:
- **Class extension** (`class MyButton extends BaseButton` where `BaseButton extends HTMLElement`).
  Ergonomic for native-class composition.
- **Mixins** (`class extends Mixin(BaseClass)`). The `class-mixins` pattern works but loses static-method
  inheritance ergonomics.
- **Customized built-ins** (`class MyButton extends HTMLButtonElement` + `customElements.define('my-btn',
  MyButton, { extends: 'button' })`). Safari blocks; effectively dead.

There's no platform "composable" primitive — the JavaScript module-scope-function pattern is the answer.

### aihu current state

The `@composable` story today is **module-scope functions that call `signal()`**. Verified pattern:
nothing in `packages/runtime/src/index.ts` exports a `defineComposable` or `useComposable` helper. The
`onMount` / `onCleanup` hooks (re-exported from `define-component.ts:138-146` as `_onMount` /
`_onCleanup`) work *only inside `setup()` of `defineComponent`* — they throw `RuntimeError` `SCR-R0010`
if called outside an owner context (`define-component.ts:139`). This is correct, but it means userland
composables that need lifecycle hooks have to be called from `@state` in a way that's currently
undocumented.

**Component extension surface:**
- `<MyComponent prop={x} />` — composition via slots/props.
- `<$slot name="X" />` — slot insertion.
- Project-level shadowing (per Plugin Contract §6.3) — `src/components/Input.aihu` overrides
  plugin-shipped `Input.aihu`.
- No "extending a component class" pattern — aihu doesn't expose the underlying `HTMLElement`-derived
  class for inheritance. Userland composes via slots + props instead.

**Composables / shared logic gap.**
- No documented composable pattern in `docs/site/`. Verified by searching for "composable" — zero hits
  in user-facing docs.
- The Lit "reactive controller" pattern (component-scoped composable with lifecycle access) has no
  aihu equivalent.
- Vue's "composable function" pattern (function returning reactive state, no lifecycle, just reads/writes
  signals) maps trivially to aihu via module-scope functions but isn't documented.

### Vue 3's approach

Vue 3 settled on three mechanisms:
1. **Composables** — JavaScript functions that return reactive state. By convention named
   `useFoo()`. Examples: `useFetch`, `useMouse`. Composables can call `onMounted` / `onUnmounted`
   inside if the composable is called from `setup()`. Type-safe. **The dominant Vue 3 pattern.**
2. **Custom directives** — `app.directive('foo', { mounted(el, binding) { … } })`. Lower-level than
   composables; bind to specific elements via `v-foo="value"`. Useful for DOM-level concerns
   (auto-focus, click-outside). Vue 3 docs section: vuejs.org/guide/reusability/custom-directives.
3. **Mixins** — Options API only; deprecated in Composition API. Vue 3's docs explicitly recommend
   composables over mixins.

**What Vue got right.** Composables as plain functions — no class boilerplate, no decorator soup, no
"controller lifecycle" registration. Type inference is trivial because functions are functions.

**What tripped Vue.** Custom directives are awkward in Composition API — they live outside the
component-function scope (registered globally on `app`). Vue 3.4 added `vDirective` local-import syntax
to reduce friction, but the directive object's `mounted` / `updated` hooks don't have access to the
component's reactive context — userland often writes a composable that wraps the directive. **Lesson:**
two layers (composable + directive) are confusing; the framework should pick one.

### Other frameworks

- **Lit.** **Reactive Controllers** are the elegant answer (verified via Context7 query against
  `/lit/lit.dev`). A class implementing `ReactiveController` with `hostConnected` / `hostDisconnected`
  lifecycle. The controller has access to the host element AND can call `host.requestUpdate()`.
  Composes with `@property` reactivity. **This is the pattern aihu should adopt.** Example:

  ```ts
  class FetchController<T> implements ReactiveController {
    constructor(host: ReactiveControllerHost, url: string) { host.addController(this); … }
    async hostConnected() { /* fetch + requestUpdate */ }
  }
  // In a component:
  private fetcher = new FetchController(this, '/api/x')
  ```

- **Solid.** Composables are plain functions; `createSignal`/`createMemo` work outside component scope
  if owners are right. Lifecycle via `onCleanup` (works inside `createRoot` / `createEffect`). Closer to
  Vue 3 but with finer-grained owner control.
- **Svelte 5.** Runes (`$state` / `$derived` / `$effect`) work inside `*.svelte.ts` files — composables
  are first-class as `*.svelte.ts` modules. Lifecycle via `$effect` cleanup pattern.
- **Stencil.** No composable pattern; everything goes in the `@Component` class. Mixins discouraged;
  prop-drilling preferred.
- **FAST.** Behaviors (similar to Lit Controllers) attach to elements; design-token system is the
  pluggable axis.

**Convergent signals.**
1. Composables-as-functions is the dominant pattern (Vue 3, Solid, Svelte 5).
2. Lit Controllers add lifecycle-aware composables — a *superset* of the function pattern. **Aihu
   should adopt.**
3. Custom directives are de-emphasized (Vue 3 still has them; Lit/Solid/Svelte don't really).

### Recommended aihu posture

**Position aihu's extension story between Vue 3 composables and Lit Reactive Controllers.**

1. **Document module-scope-function composables as the recommended pattern.** No new API surface;
   doc-level guidance only:

   ```ts
   // src/composables/useMouse.ts
   import { signal, effect } from '@aihu/signals'
   export function useMouse() {
     const pos = signal({ x: 0, y: 0 })
     // call from $lifecycle.mount in consumer
     return { pos }
   }
   ```

   **Defense:** Vue 3 + Solid + Svelte 5 converge here. Don't invent.

2. **Add a `$controller` collection to `@state` v2 (Lit-Reactive-Controller equivalent).** New
   collection-form macro:

   ```aihu
   @state {
     $controller: {
       fetcher: { value: () => new FetchController('/api/x'), describe: 'Async data loader' },
       mouse: { value: () => new MouseController() },
     }
   }
   ```

   Lowering: `$controller.<name>.value()` is called once at `mount`; if the result has
   `hostConnected` / `hostDisconnected` methods, they're wired automatically; the result is exposed
   in `@template` scope. **Default vs opt-in:** opt-in. **Defense:** Lit's Reactive Controllers are
   the highest-acclaim pattern in the modern Web Components space. aihu's collection-form unification
   makes them feel native — Vue/Solid/Svelte can't match this ergonomically without breaking their
   block model. **Auditor A owns the lowering details (lifecycle wiring, host context interface).**

3. **Skip custom directives entirely.** Don't ship a Vue-style `app.directive('foo', …)` API. The
   `$controller` pattern + `$ref` (now functional) cover every directive use case. **Defense:** Vue 3's
   directive ergonomics are mediocre; nobody else has them; cutting the surface is a clarity win.

4. **Document the `onMount` / `onCleanup` access from `$controller` AND `$lifecycle`.** Currently
   exported but undocumented (verified — `docs/site/authoring-components.md` mentions `$lifecycle.mount`
   but not `onMount` outside it). The `$controller`-spawned controllers inherit these lifecycle hooks;
   document the lifecycle access surface explicitly.

**Default vs opt-in.** Composables (functions) are the default for shared logic. `$controller` is
opt-in for lifecycle-aware composables. Custom directives — none.

**Escape hatch when userland needs raw platform.** `$ref={el}` + module-scope function with manual
`addEventListener` / cleanup. Document the pattern.

**One-paragraph defense.** Vue's two-layer (composable + directive) story is a known wart; Lit's
Reactive Controllers are widely admired but require class boilerplate; aihu's `$controller` collection
gets the Lit benefit with zero class boilerplate by reusing the same `@state` collection-form authors
already know. **This is a free win.**

---

## §6 — Pluggability (extending the framework itself)

### Platform native today

The "framework pluggability" question is build-tool integration:
- **Vite plugins** (`vite.config.ts` `plugins: [...]`) — current dominant build-plugin contract.
  Extension via `transform`, `load`, `resolveId`, `configureServer`, etc.
- **Rolldown plugins** — Rust-rewritten Vite-API-compatible bundler; same plugin shape, faster.
  Vite 8+ uses Rolldown internally (`packages/compiler/js/index.ts` mentioned in CLAUDE.md as
  "transformWithOxc in vite 8+").
- **Esbuild plugins** — different plugin API; mostly subsumed by Rolldown for new projects.
- **Browser DevTools** — custom panels via `chrome.devtools.panels.create()`; framework-specific
  inspection requires authoring an extension.
- **LSP** (Language Server Protocol) — TS lang-server is the dominant editor integration; framework
  authors can ship their own LSP for `.aihu`-shaped DSLs (Volar for Vue, Svelte LSP, etc.).

### aihu current state

**The aihu pluggability surface is real and well-shaped. Verified by reading
`packages/plugin/src/index.ts` (493 lines, full type contract) +
`docs/superpowers/specs/2026-05-02-spec-plugin-contract.md` (920+ lines, ratified 2026-05-02).**

Plugin contract surface:
- **Identity** (`name`, `version`, `namespace`, `aihuVersion`).
- **Contributions** (`blocks`, `macros`, `components`, `transforms`, `serverRuntime`, `middleware`).
- **Lifecycle hooks** (`beforeCompile`, `afterParse`, `transformBlock`, `afterCompile`).
- **Block parsers** + **macro lowerings** (build-time codegen extension; spec §5).
- **Validation** (`validatePlugin` with stable error codes per spec §8.1).
- **Server-side contributions** (provisional in v1.0; spec §6.5).
- **Plugin composition / dependencies** (`dependencies: ['data']`; topological sort; spec §10).

**What's working today:**
- Type contract is complete; v0.2.1 ships `definePlugin` factory + `validatePlugin` validator
  (`packages/plugin/src/index.ts:487-493`).
- `aihu.config.ts` registration is explicit; auto-discovery is forbidden (spec §7.2). Auditable.
- Plugin host inside Vite: `viteAihuPlugin()` in `packages/app/src/vite-plugin.ts:122-195` composes
  `aihuCompilerPlugin` + router + agent-readiness + user plugins + adapter.

**Gaps verified:**
- **Compiler dispatcher is stub** — `packages/plugin/src/index.ts:11` says "v0.2.1 ships the type
  contract … the compiler dispatcher is a no-op until v0.3+ wires block parsers, macro lowerings, and
  hook execution." Plugins don't actually *run* yet.
- **No LSP.** Scout D6.1 verified: VS Code extension is TextMate-only, no language server. Architect
  `arch-4-dx-tools.md:28` admits the gap. `aihu.tmLanguage.json:144-171` regex grammar is brittle
  (Scout D6.2 — non-recursive `\{[^}]*\}` mis-tokenizes nested braces).
- **No DevTools panel.** No Chrome extension; no Vue-DevTools-equivalent for inspecting `@state`
  signals at runtime.
- **No runtime plugin contract** — only build-time. Authors can't write a runtime-only plugin
  (e.g., a logging middleware that wraps `mountEffect`).
- **Vite-coupling concern (user-flagged).** Recent CLAUDE.md notes "use `transformWithOxc` in vite 8+"
  and the user has expressed interest in "eliminating Vite dependency." `packages/app/src/vite-plugin.ts`
  imports `vite` types extensively; `viteAihuPlugin()` is a Vite plugin first. The pluggability surface
  is build-host-aware but currently Vite-shaped.

### Vue 3's approach

Vue 3's pluggability layers:
1. **Vue plugins** — `app.use(MyPlugin)`; the plugin receives `(app, options)` and registers globals,
   directives, components. Runtime contract; small.
2. **Vite/Rollup plugins** — `@vitejs/plugin-vue` is the canonical SFC compiler; userland adds before/after
   transforms via standard Vite plugin API.
3. **Volar** — language server (LSP) for Vue. First-class IDE story.
4. **Vue DevTools** — Chrome extension; inspects component tree, reactive state, events.
5. **vue-cli plugins** (legacy; superseded by Vite).

**What Vue got right.** Volar — a dedicated LSP that understands `.vue` SFCs end-to-end (template + script
+ style) and provides hover, go-to-def, rename, refactor across blocks. It's the framework-pluggability
flagship and a major reason Vue feels "first-class" in IDEs.

**What tripped Vue.** vue-cli legacy was a long migration tax; the Vue 2 → Vue 3 plugin contract change
broke ecosystem plugins. **Lesson:** version the plugin contract carefully; aihu already does (`aihuVersion`
in `Plugin.aihuVersion`).

### Other frameworks

- **Lit.** No build step is required; `lit-html` and `lit-element` work from raw `.ts` files. The
  pluggability story is **the standards-track web-platform itself** — Lit doesn't need a compiler plugin
  contract. **A compelling story by avoidance.** Build-time plugins for production optimizations (e.g.,
  babel-plugin-template-html-minifier) exist as ecosystem.
- **Stencil.** Stencil's compiler has its own plugin API (separate from Vite/Rollup). Server-side
  rendering, lazy-loading, prerendering all configured at the compiler level. More invasive than
  Vue/aihu but less ecosystem.
- **Svelte.** `svelte-preprocess` — plugin-able preprocessor stage. `vite-plugin-svelte` — Vite
  integration. Svelte LSP is community-maintained but solid.
- **FAST.** Webpack/Vite story is conventional; FAST's pluggability is design-system-shaped (Design
  Tokens, behaviors, fixtures).

**Convergent signals.**
1. Build-step is the dominant pluggability surface for SFC frameworks (Vue, Stencil, Svelte). Lit's
   no-build story is unique.
2. LSP is universal-but-uneven. Volar (Vue) is the gold standard; Svelte LSP is solid; Stencil/FAST
   rely on TS lang-server with limitations.
3. DevTools extensions are framework-specific and high-impact for adoption (Vue DevTools, React
   DevTools).

### Recommended aihu posture

**Five concrete proposals.**

1. **Land the v0.3 compiler dispatcher (block parsers, macro lowerings, hook execution).** Currently
   stubbed (spec §1.1 + `packages/plugin/src/index.ts:11`). Without dispatcher, `Contributes.macros`
   doesn't work. **Defense:** plugin contract on paper without a runtime is theatre; users can't write
   real plugins. **Default vs opt-in:** must-ship; not user-visible.

2. **Define a runtime plugin contract distinct from build-time.** Add `RuntimePlugin` to
   `@aihu/runtime` exports. Hooks: `beforeMount(host, tree)`, `afterMount(host, scope)`,
   `wrapMountEffect(fn)`, `wrapEvent(name, handler)`. Use cases: tracing, error boundaries,
   instrumentation. Currently userland has no path to these; module-scope monkey-patching is the only
   answer. **Defense:** Vue's `app.use()` runtime-plugin shape is the model; aihu lacks an equivalent.
   **Default vs opt-in:** opt-in; document use cases.

3. **Decouple from Vite as a hard dependency.** Today `viteAihuPlugin()` in
   `packages/app/src/vite-plugin.ts` is the canonical entrypoint. Recommendation: extract a
   `BuildHost` interface in `@aihu/compiler` that Vite, Rolldown-as-host, and (future) Webpack/esbuild
   adapters implement. The Vite plugin becomes one host adapter among many. The user's flagged "remove
   Vite dependency" path lands here. **Auditor A may have a more detailed lowering plan; this is the
   design prescription.** **Default vs opt-in:** Vite remains the recommended host; Rolldown becomes a
   first-class alternative when Vite 8 lands. **Defense:** Lit's no-build story shows the value of
   not coupling to one host. aihu can't be no-build (requires a Rust compiler) but it can be host-
   agnostic.

4. **Ship the LSP as a Builder priority for v0.4.** Volar-shaped (`.aihu`-aware language server with
   hover, go-to-def, rename, diagnostics). Spec §7 path (i) — generated `.aihu.ts` sidecar — is a
   correct stopgap; an LSP is the long-term answer. Roadmap: `arch-4-dx-tools.md` already accepts the
   gap. **Defense:** Volar is one of the top-3 reasons Vue feels first-class in IDE; aihu's IDE story
   is the largest single DX gap (Scout D6).

5. **Author a DevTools panel as a community plugin (not in-core).** Use the runtime plugin contract
   from proposal 2 as the data source. Inspect `componentInstanceRegistry` (mentioned in live-binding
   spec), `@state` signal values, `$emit`'d events, mount-effect tracking. **Defense:** Vue DevTools
   shipped as a community project; React DevTools likewise. Don't bloat core. **Default vs opt-in:**
   community-maintained.

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

**Default vs opt-in.** Build-time plugins: opt-in via config. Runtime plugins: opt-in. Build-host
adapters: Vite default; Rolldown opt-in. LSP: opt-in install. DevTools: opt-in install.

**Escape hatch when userland needs raw platform.** Build-time: `aihu.config.ts` `vite: { … }` passthrough
(already in `packages/app/src/vite-plugin.ts:145-150`). Runtime: module-scope monkey-patching is always
available. Document explicitly that "if you need to do X and aihu's plugin contract doesn't expose it,
file an issue" — community-driven evolution of the contract.

**One-paragraph defense.** aihu's plugin contract (already ratified, 920+ lines of spec) is more
thorough than Vue's `app.use()` API and more ergonomic than Stencil's compiler-internal hooks. The
gaps — dispatcher, runtime contract, host-agnosticism, LSP, DevTools — are mostly known and on the
roadmap. This audit's leverage is sequencing: **dispatcher first (unlock the contract), runtime
contract + host-agnosticism second (open the door to the user's "remove Vite" path), LSP third (close
the largest single DX gap).** None of these break Variant B; all of them make Variant B's surface
more livable.

---

## Cross-axis summary

### Highest-leverage proposals (top 3 across all axes)

1. **§4.1 + §4.2 — `$aria` collection + auto-keyboard-promotion on `$on.click` for keyboard-roles.** No
   framework has shipped this. Marketing leverage: "aihu is the first SFC framework with first-class
   declarative a11y." Cost: medium (new collection, compiler-side ARIA lowering through
   `ElementInternals`, keyboard-handler injection). Auditor A owns the lowering details.

2. **§5.2 — `$controller` collection (Lit-Reactive-Controller equivalent inside `@state` v2).** Free
   ergonomic win — the Lit-Controller pattern with zero class boilerplate. Lit users will recognize
   the pattern and feel at home; Vue users will appreciate the lifecycle access composables don't have.
   Cost: low (collection-form is established; lifecycle wiring is a small lowering pass).

3. **§2.1 — `$context` collection (provide/inject hole-filler, WICG-Context-aligned).** Closes a
   competitive gap with Vue/Solid; aligns with the standards-track Context proposal so the work isn't
   wasted when the platform ships. Cost: medium (new collection, DI wiring via `@lit/context` polyfill
   or equivalent). Auditor A owns the lowering.

### Top 2 places aihu has a clear advantage over Vue worth marketing

1. **Security floor: zero dynamic-code-execution paths in production source** (Scout D3c). Vue 3 has a
   runtime template compiler that requires `unsafe-eval` unless precompiled; aihu compiles
   ahead-of-time, period. **CSP-friendly by default.** This is a story Vue can't tell.

2. **Collection-form unification across `@state` v2 macros** (`$prop` / `$computed` / `$action` /
   `$resource` / `$effect` / `$lifecycle` / `$event` / future `$aria` / `$controller` / `$context`).
   Vue 3's Composition API has six different macros (`defineProps`, `defineEmits`, `defineExpose`,
   `defineSlots`, `defineModel`, `defineOptions`), each with its own shape and ergonomics. aihu's
   one-block-with-named-collections is *cleaner* and *more discoverable*. The new collections (`$event`
   in this round, `$aria` / `$controller` / `$context` proposed) extend the same shape — Vue's macros
   each need their own DX investment.

### Top 2 places aihu lags vs the market and needs work

1. **No LSP.** Volar (Vue), Svelte LSP, and even Stencil's TS-tooling are all ahead. `arch-4-dx-tools.md`
   admits the gap. The generated `.aihu.ts` sidecar (spec §7) is a stopgap; v0.4 must ship an LSP or
   the IDE story stays broken. **This is the single largest devex gap.**

2. **No tree-scoped DI (provide/inject equivalent).** Vue, Solid, Svelte, Lit-via-Context all have
   answers. aihu's only path today is `globalThis` hoisting via `createApp({ provide: { … } })` —
   which is global, not tree-scoped. **§2.1's `$context` proposal closes this; it's load-bearing for
   v0.4.**

---

## Synthesis pointer

This audit pairs with **Auditor A — Platform Integration + Component-Creation Sugar** for `topic:
aihu-template-syntax track:userland-dx round:3`. Boundary: A handles platform-mechanism (lowering details
for `$aria` → `ElementInternals`, `$controller` → reactive controller wiring, `$context` → WICG Context
events, build-host abstraction); B (this doc) handles design-ergonomics, market-lessons, and aihu-shaped
prescriptions. Synthesizer merges both into one master audit doc.

**Spec amendments this audit recommends (additive only; no v2 re-litigation):**
- New `@state` v2 collections: `$aria`, `$controller`, `$context` (and possibly `$form`).
- New runtime plugin contract: `defineRuntimePlugin` in `@aihu/runtime`.
- New build-host abstraction: `BuildHost` in `@aihu/compiler`.
- Spec §6 amendment: ship `defineAihuSanitizer` factory + plan TT for v0.4.
- Spec §10 IS-NOT-IN amendment: remove the `@style` exclusion to admit Constructable Stylesheets work
  (still no userland-visible API change). Or carry the exclusion to v0.4; either is fine.

**Re-cut threshold check.** This audit proposes ADDITIONS only; no v2-settled territory is re-litigated.
Director r1 §7 trigger categories (sigil change, value-form change, structural addition, runtime
contract change) — proposals add four new collection-form macros (within existing collection-form
shape; not a sigil change), a runtime plugin contract (new but distinct from the template syntax v2
spec), and a build-host abstraction (build-time only). **Should not trigger Director re-cut**; should
land as separate sub-specs in v0.4 cycle, sequenced after Variant B Builder lands.

---

*End of cross-cutting design audit — Auditor B, 2026-05-06.*
