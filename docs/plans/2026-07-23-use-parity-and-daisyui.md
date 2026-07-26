# `@aihu/use` Parity Build Plan + daisyUI Integration Strategy

**Date:** 2026-07-23
**Status:** Founder decisions ratified 2026-07-23 (see below) — composable/primitive
sequencing in §5 is authorized to proceed; the detailed Option 4 hybrid css-engine design is
in progress as a separate design pass (placeholder in §3(a) until that lands).
**Scope:** `@aihu/use`, `@aihu/primitives` (config-provider `documentRoot` extension,
drawer/dropdown/tabs/accordion assemblies), `@aihu/css-engine` (Option 4 hybrid — separate
design pass), `@aihu/ui` (registry recipes, gated behind primitives), shipped `StylePack`s
(`.dark`-class → `data-theme` reconciliation)
**Depends on / extends:**
[`2026-07-22-effect-scope-and-composables.md`](./2026-07-22-effect-scope-and-composables.md)
(the `@aihu/use`/`@aihu/primitives` split, `create*` vs `use*` naming, and the layering rules
this doc's roadmap builds on)

Synthesizes four research streams: the VueUse catalog/gap audit (278 functions cross-checked
against aihu source), the beyond-VueUse survey (react-use, @react-hookz/web, solid-primitives,
Runed, Angular CDK), the daisyUI integration analysis, and the aihu current-surface audit
(what `@aihu/use`/`@aihu/primitives`/`@aihu/router`/`@aihu/css-engine` actually contain today,
verified against source, not memory).

---

> **AMENDED (light-DOM leaf flip), 2026-07-24 — do not silently rewrite history, read this
> before §3(a)/§1/Founder-decision #2 below.**
>
> [`2026-07-24-light-dom-leaf-flip.md`](./2026-07-24-light-dom-leaf-flip.md) proposes flipping
> `@aihu/css-engine`'s leaf-component default from shadow DOM to light DOM. That is a separate,
> not-yet-approved design; it does **not** retroactively change what was ratified here on
> 2026-07-23. What it does change is **the stated rationale** for the ratified decision.
>
> **What is now VOID.** Founder-decision #2 and §3(a)/§1 justify Option 4 and reject Option 3
> partly on the grounds that Option 3 "re-introduces the exact global-cascade / second-
> vocabulary problem **css-engine's shadow-DOM-scoped design exists to avoid**." That clause —
> and any reading of "shadow-DOM-scoped" as css-engine's defining, permanent property — is void
> if the flip lands. Post-flip, css-engine's *default* leaf output is itself global-cascade CSS
> (attribute-scoped for authored `@style` recipes, but genuinely global for the utility
> channel — see the flip doc §1.2/§1.4). An argument of the form "daisyUI is global, we are
> scoped, therefore structural conflict" no longer holds as stated.
>
> **What survives, and why — the current recommendation.** Option 4 (hybrid: transcribe daisyUI
> recipes/theme catalog onto our own css-engine, do not run a second Tailwind/daisyUI pipeline)
> still stands, but on grounds that do not depend on shadow vs. light at all:
> 1. **Dual-mode coverage** — `$shadow: 'shadow'` remains a live, supported per-component opt-in
>    even after the flip. A vendored global Tailwind+daisyUI stylesheet cannot cross a shadow
>    boundary, so any component that opts back into shadow would silently lose all daisyUI
>    styling under Option 3. css-engine folds its output per-component and therefore works in
>    both modes — this is now the *strongest* argument for Option 4, and the flip doc notes the
>    2026-07-23 draft did not make it.
> 2. **One utility vocabulary** — Option 3 runs *alongside* css-engine, not instead of it. Two
>    independent emitters scanning the same templates and both emitting `.p-4`/`.flex`/
>    `.md\:grid`, with different theme registries and no defined ordering between the two output
>    sheets, is a real structural conflict that has nothing to do with shadow DOM and would only
>    dissolve if css-engine were retired outright.
> 3. **No second build pipeline** — Option 3 still adds a PostCSS/Tailwind plugin, a `@source`
>    scan config, a second config surface, and a second cache-invalidation model to a build that
>    currently spawns one Rust binary.
>
> **What gets easier, not harder, if the flip lands** (fold into the in-progress Option 4 design
> pass rather than treat as a new risk): daisyUI's `.btn`/`.btn-primary`/`.card-body` recipes are
> already global class rules, so they transcribe near-literally into the flip's **utilities**
> channel with no reshaping into `:host`-relative selectors; the theme catalog transcribes into
> the flip's **tokens** channel at `:root` rather than fighting `:host`; and the `.dark`-class →
> `data-theme` reconciliation named in Founder-decision #3 gets *easier* under the flip, because
> `[data-theme]` on `<html>` cascades natively into light-DOM leaves with no `:host([data-theme])`
> half of a dual selector required for the leaf side. The "tree-shake like Tailwind's JIT"
> requirement (already ratified here) becomes *more* urgent under the flip, not less: 168 light
> leaves each pulling a virtual CSS module makes unshaken output multiply across modules where it
> previously stayed inside one shared shadow stylesheet per component.
>
> **Action for the in-progress Option 4 design pass**: when that design lands, its own text
> should replace "shadow-DOM-scoped model" wherever it appears in §3(a) below with "css-engine's
> own scoping model (attribute-scoped for authored recipes, global for utilities)," and replace
> the parenthetical in Founder-decision #2 with the three reasons above — **once the flip itself
> is founder-approved**, not before. Until then this amendment note is the authoritative
> correction; §3(a) and Founder-decision #2's original text below are left unedited as the
> historical record of what was actually ratified on 2026-07-23.

---

## Founder decisions (ratified 2026-07-23)

These four rulings resolve every open question below that asked the founder to pick a
direction. They supersede the tentative option-framing in §1, §3, and §5 wherever those
sections previously hedged between alternatives — those sections are edited in place to match,
but the rulings are recorded here first because they are the load-bearing decisions for
everything that follows.

1. **daisyUI scope = FULL recipe port.** Not theme-layer-only (old Option 2 alone), not a
   named subset (just drawer/tabs/accordion/dropdown). The complete daisyUI component recipe
   set gets ported into `@aihu/ui`'s registry (`packages/ui/registry/<name>/*.aihu`) —
   §3(a)'s Option 1 language is now the ratified scope, not one of three alternatives.
2. **Integration approach = a new Option 4 (hybrid), which supersedes the Option 1/2/3 framing
   in §3(a).** Combine aihu's existing `@aihu/css-engine` + the best parts of daisyUI +
   Tailwind-style code-shaking: **transcribe** daisyUI's component recipes *and* theme catalog
   into css-engine's native, shadow-DOM-scoped model (sidesteps daisyUI's global-cascade
   conflict rather than fighting it), **and** make css-engine's emission content-scanned/
   tree-shaken the way Tailwind's JIT is. Option 3 (running real Tailwind+daisyUI as a
   parallel pipeline) remains **rejected** — not on cost alone, but because it re-introduces
   the exact global-cascade / second-vocabulary problem css-engine's shadow-DOM-scoped design
   exists to avoid. **The detailed Option 4 design is in progress as a separate design pass by
   another agent — see the placeholder in §3(a) below; this doc frames the decision only, it
   is not the Option 4 spec.**
3. **`useTheme` standardizes on daisyUI's `data-theme` attribute on `<html>`**, not aihu's
   `.dark`-class convention. This resolves the config-provider/document-root gap flagged in
   §3(b) (config-provider today reflects to its own host element, not
   `document.documentElement`) — the config-provider extension writes `data-theme` to the
   document root. It also means the shipped `StylePack` CSS (`aihu-default.css`/
   `aihu-graphite.css`), which keys dark mode off a `.dark` class at `:root`, needs
   reconciling with `data-theme` (dual-key both selectors during a transition, or migrate the
   StylePacks — an implementation detail for the build, not re-litigated here). The
   reviewer-mandated split stays intact: state-only persistence lives in `@aihu/use`
   (`useColorScheme` + pluggable storage); `configContext`-precedence + document-root
   reflection is `@aihu/primitives` work (the `AihuConfigProvider` `documentRoot` extension).
4. **Primitives-first.** Do not ship daisyUI-style CSS recipes for drawer/dropdown/tabs/
   accordion until the corresponding `@aihu/primitives` assemblies (`AihuDrawerRoot`,
   `createDropdown`/`AihuMenuRoot`, `AihuTabsRoot`, the accordion assembly) exist and meet the
   same accessibility bar as the shipped `dialog`/`roving-focus`/`collection` primitives. §5
   is updated below so recipe authoring for these four is explicitly gated behind the matching
   primitive landing, not run in parallel with it.

---

> **Reviewer corrections (fable)**: 8 fixes applied to this draft —
> (1) `useTheme` was a layering violation (needs `configContext`/document-root writes,
> both illegal in `@aihu/use`); split into a state-only `useColorScheme`-persistence
> composable (`@aihu/use`) + a `documentRoot` reflect option on `AihuConfigProvider`
> (`@aihu/primitives`). (2) Focus-trap "just expose" re-costed S→M — the existing
> `querySelectorAll`-based walk stops at shadow boundaries; needs a shared composed-tree
> tabbable walk first. (3) `useDrawer`/`useTabs`/`useDropdown`/`useLockBodyScroll` renamed
> to `createDrawer`/`AihuDrawerRoot`, `AihuTabsRoot`, `createDropdown`/`AihuMenuRoot`,
> `createScrollLock` — `use*` is reserved for `@aihu/use` only. (4) `useDisclosure` scoped
> to single-instance state only; group/accordion coordination moved to a `@aihu/primitives`
> accordion assembly. (5) "13 for free" Watch-category claim split into true thin wrappers
> vs. deep-reactivity-dependent items that don't map onto reference-compared signal tuples.
> (6) `useAsync` SSR semantics specified (no-op `execute()` server-side; SSR data-fetching
> out of scope). (7) `boolAttr` fixed to `@aihu/use/shared` only, rationale reworded (output-side
> complement, not the footgun's remedy). (8) daisyUI Option 2 "cheap" claim corrected — needs
> a token-mapping table + theme-pairing convention; recommend starting with 3-4 flagship themes.

---

## 1. Headline recommendation

`@aihu/use` at 0.3.0 (22 composables) is the right *shape* — signals-only, zero core-lib deps,
`isClient`-guarded, getter-object return convention — it just needs *volume*. The fastest path
to real parity is **one arc that generalizes the existing `useEventListener` + a lazy/filtered
`watch()` primitive**, which the VueUse audit shows unlocks most of the 13-function Watch
category as thin timing/trigger wrappers — the deep-reactivity-dependent members (`watchArray`,
`watchDeep`, `deep:true` options) do NOT come "for free" and need their own resolution (see §2
Tier 2) — plus ~15 standalone Tier-1 composables that are pure signals + browser-API
wrapping with no architectural risk. **Founder-ratified**: daisyUI is not installed or run as a
second Tailwind pipeline (Option 3, rejected on structural grounds — see Founder decisions
above) — it gets a **FULL recipe port** into `@aihu/ui` (the whole component set, not a
theme-layer-only or named-subset scope) via a **new Option 4 hybrid**: transcribe daisyUI's
component recipes *and* theme catalog into `@aihu/css-engine`'s native shadow-DOM-scoped model,
plus make css-engine's emission content-scanned/tree-shaken the way Tailwind's JIT is — the
detailed Option 4 design is a separate in-progress design pass (§3(a) placeholder); this doc
frames the decision, not the mechanism. This sidesteps the structural conflict between
`@aihu/css-engine`'s shadow-DOM-scoped-by-default model and daisyUI's global-cascade, zero-JS
component CSS, rather than fighting it. Of the six daisyUI interactive components examined, four
map to work aihu's `@aihu/primitives` already substantially covers (modal→`dialog`, dropdown→
`roving-focus`+`collection`, tabs→`roving-focus`, swap→`useToggle` already shipped) — only a
state-only `useColorScheme`-persistence composable and a single-instance `useDisclosure` cleanly
belong in `@aihu/use` itself. `useTheme` as originally scoped is a **layering violation**: its
config-provider precedence + document-root reflection needs are `@aihu/primitives` work (a
`documentRoot` reflect option on `AihuConfigProvider`, writing daisyUI's **`data-theme` attribute
on `<html>`** per the founder's ratified theme-convention ruling), not `@aihu/use` work — see
§3(b) for the split. Likewise, `createDrawer`/`AihuDrawerRoot`, `createDropdown`/`AihuMenuRoot`,
and `AihuTabsRoot` assembly is `@aihu/primitives` work, not `@aihu/use` work, and must not be
miscategorized just because daisyUI files them as simple — nor named with the `use*` prefix,
which is reserved for `@aihu/use`. Per the founder's primitives-first ruling, none of these three
(plus the accordion assembly) ship a styled `@aihu/ui` recipe until the primitive itself is built
and meets the shipped dialog/roving-focus/collection accessibility bar.

---

## 2. Prioritized composable roadmap

Every row cites target layer, effort (S/M/L), and — where relevant — the specific reason
something is *excluded* or *relocated* rather than added directly to `@aihu/use`.

### Tier 0 — foundational unlocks (build first; everything else in Tier 1/2 gets cheaper after)

| Item | Layer | Effort | Why first |
|---|---|---|---|
| `watch()` primitive (lazy/filtered veneer over `@aihu/signals`' eager `effect()`) | `@aihu/use` | M | VueUse audit: unlocks the true-thin-wrapper subset of the 13-function Watch category (`watchDebounced`, `watchThrottled`, `watchOnce`, `pausableWatch`, `whenever` — timing/trigger only) once built. The deep-reactivity-dependent subset (`watchArray`, `watchDeep`, `deep:true`) does NOT come free — see Tier 2. Build once, ship the thin subset many. |
| `createEventListener`-style reactive-target variant + `createEventListenerMap` (bind `{event: handler}` map, one cleanup) on top of existing `useEventListener` | `@aihu/use` | S/M | solid-primitives pattern; generalizes the one composable everything else in the package is already built on. Every DOM-facing sensor composable downstream benefits. |
| Out-of-scope-owner-check on scope-exit (warn if a composable's `tryOnScopeDispose` is called with no active effect scope, mirroring Solid's "disposed outside `createRoot`" warning) | `@aihu/signals` (small addition) | S | Cheap correctness net before Tier 1/2 volume lands — catches the exact `@aihu/primitives`-imports-`@aihu/use` misuse the primitives-team convention already flags as a hard layering violation. |

### Tier 1 — high-value quick wins toward parity (signals-only, no new architecture)

| Composable | Layer | Effort | Source / rationale |
|---|---|---|---|
| `onClickOutside` | **`@aihu/primitives`**, NOT `@aihu/use` | S | Already explicitly decided in the ratified plan doc (`docs/plans/2026-07-22-effect-scope-and-composables.md` §5) — participates in a dismiss-layer/APG contract. Flagging here only so it isn't relitigated into `@aihu/use`. |
| `useMap` / `useSet` (reactive Map/Set state) | `@aihu/use` | S | react-use; cheap on signals, no DOM coupling, common state shape aihu has zero coverage of. |
| `useMeasure` (full DOMRect via ResizeObserver) | `@aihu/use` | S | Complements existing `useElementSize`; same ResizeObserver substrate, different return shape. |
| `useNetworkState` | `@aihu/use` | S | Navigator API sensor, same pattern as `useSupported`/`useDocumentVisibility`. |
| `useIdle` | `@aihu/use` | S | Composes existing `useEventListener` + `useTimeoutFn`; no new primitive needed. |
| `PersistedState`-style storage-backend generalization of `useLocalStorage` | `@aihu/use` | S | Runed; make storage backend pluggable (session storage, custom adapter) rather than hardcoded to `localStorage`. |
| `boolAttr` (signal → spec-correct boolean HTML attribute) | `@aihu/use/shared` | S | Runed; complements the planned compiler prop-coercion fix on the OUTPUT side (it is not the footgun's remedy — the footgun is an input-coercion bug in the compiler; this only helps produce spec-correct boolean attributes downstream). Files next to `toValue`/`unrefElement`; no `@aihu/signals` option — that package's size row is already tight. |
| `IsFocusWithin` | `@aihu/use` | S | Runed; pure `focusin`/`focusout` + `contains()` check, no primitive dependency. |
| `useAsync` / `useAsyncAbortable` | `@aihu/use` | M | @react-hookz; genuine gap — aihu has **no async-state composable at all** today. AbortSignal threaded into the async fn for cancel-on-rerun. Real, not cosmetic, parity gap. Server behavior: no-op `execute()` + initial-state getters (consistent with the `isClient` invariant) — SSR data-fetching is explicitly OUT of scope for `@aihu/use`; revisit only if the #465 SSR-walk grows a data story. |
| `useColorScheme` persistence (compose existing `useColorScheme` + pluggable storage backend, NO `configContext`, NO document-root writes) | `@aihu/use` | S | daisyUI-driven, **rescoped from the original `useTheme` proposal** — that shape needed `configContext` (host-element + DOM traversal, illegal in `@aihu/use`'s signals-only/`@aihu/signals`-only-dep posture) and/or document-root writes (re-opens the explicitly-rejected `useDark`). This composable stays context-free and state-only; the config-provider-precedence + document-root reflection half of the original spec moves to `@aihu/primitives` — see §3(b). **Founder-ratified (2026-07-23)**: the document-root reflection writes daisyUI's `data-theme` attribute on `<html>`, not aihu's `.dark`-class convention — see Founder decisions §3 above. |
| `useDisclosure` (single-instance open/closed signal + open/close/toggle only) | `@aihu/use` | S | daisyUI collapse/accordion; closest analog to already-shipped `useToggle`, genuinely signals-only. Group/accordion coordination (cross-component + ARIA wiring) is explicitly OUT of scope here — that's an `@aihu/primitives` accordion assembly built on the collection substrate, not a `@aihu/use` concern. |
| Micro-utils size-limit consolidation (`useToggle`/`useCounter`/`usePrevious`/`useSupported` → one grouped row) | `@aihu/use` (housekeeping) | S | Live TODO already noted in the ratified plan doc — bundle before adding more micro-utils to the same family, not after. |

### Tier 2 — medium-effort, real demand, needs new substrate

| Composable | Layer | Effort | Notes |
|---|---|---|---|
| Watch-family true-thin wrappers (`watchDebounced`, `watchThrottled`, `watchOnce`, `pausableWatch`, `whenever` — timing/trigger only, 5 of the 13) | `@aihu/use` | S each (post `watch()`) | See Tier 0. Ship as one arc, not picked off individually. |
| Watch-family deep-reactivity-dependent members (`watchArray` diffing, `watchDeep`, `deep:true` options — 8 of the 13) | **Tier-3 does-not-map exclusion** (next to the `toRef`/`toReactive` cluster), unless respec'd as explicit shallow-only | — | These depend on Vue Proxy deep reactivity; aihu's reference-compared signal tuples cannot emulate deep-diffing without a structural change. Do not count these toward "13 for free" — either exclude outright or spec explicit shallow-only semantics as a deliberate scope decision. |
| `createScheduled`-style dirty-signal debounce/throttle (dependency-graph-native alternative to callback-wrapped `useDebounced`/`useThrottle`) | `@aihu/signals` | M | solid-primitives; more idiomatic for a signals system — a `scheduled()` boolean getter that participates in tracking. Ship *alongside* existing `useDebounced`/`useThrottle`, not as a replacement (both shapes have callers). |
| `useBroadcastChannel` | `@aihu/use` | M | solid-primitives; cross-tab primitive, zero coverage today. |
| `useWebSocket` / `useSSE` | `@aihu/use` | M each | solid-primitives; real streaming demand, zero coverage today. |
| `useGeolocation`, `usePermission`, `useVibrate` | `@aihu/use` | S each | Breadth, not urgent — device-sensor Navigator APIs, same pattern as shipped sensors. |
| `StateHistory` (undo/redo over a reactive value) | `@aihu/use` | M | Runed; niche but cheap once `watch()`/signals substrate exists. |
| `FiniteStateMachine` | `@aihu/use` or `@aihu/primitives` | M | Runed / solid-primitives `state-machine`; useful internal-state underlay for dialog/combobox — decide layer based on first consumer (if `@aihu/primitives` needs it for dropdown/combobox internal state, it lives there). |

### Tier 3 — long tail / low priority

| Composable | Layer | Effort | Notes |
|---|---|---|---|
| `spring`/`tween` physics-based interpolation | `@aihu/use` or `@aihu/primitives` | L | Nice for motion-heavy UI, not core parity. |
| Reactivity-category cluster (`toRef`, `toReactive`, `reactify`, `extendRef`) | **N/A — does not map** | — | Built on Vue's `ref()`/`reactive()` Proxy object; aihu's signal-tuple model has no structural analog. Exclude from roadmap entirely rather than force a shape. |
| `templateRef` | **N/A — superseded** | — | aihu's native `$ref` already does this job. Exclude. |
| `createReusableTemplate` / `createTemplatePromise` | **N/A — render-function-dependent** | — | No aihu analog; exclude. |
| Electron/Firebase/RxJS bridge functions (~26 VueUse functions) | **Out of scope** | — | Would violate `@aihu/use`'s zero-core-lib-deps rule. Exclude permanently, don't re-litigate per-function. |

### Router-layer relocations (NOT `@aihu/use` — hard layering rule)

| Item | Layer | Effort | Reason |
|---|---|---|---|
| `useUrlSearchParams` | `@aihu/router` | S | Reads/writes URL query — touches the router's model. |
| `useBrowserLocation` | `@aihu/router` | S | VueUse files this as generic Browser-category, but it touches history — relocates per the hard rule. |
| Router-coupled scroll-restoration (scroll-to-position-on-nav, scroll-position cache keyed by route) | `@aihu/router` | M | Confirmed absent — `grep -rn scroll src/` in `packages/router` returns nothing today. Reads nav-type/route match to decide when/where to scroll — exactly the disqualifying condition for `@aihu/use`. This is real, unbuilt work, not a doc gap: no scroll-restoration exists anywhere in the router package today. |
| `useSearchParams` (Runed) | `@aihu/router` | S | Same rule — do not let this land in `@aihu/use` even though Runed files it as a generic composable. |
| Route-coupled active-link/active-descendant highlighting | `@aihu/router` | S | Depends on router state (current match), not signals-only. |

### `@aihu/primitives`-layer relocations (NOT `@aihu/use` — do not duplicate existing coverage)

| Item | Layer | Effort | Reason / existing coverage to extend |
|---|---|---|---|
| `useTemplateRefsList` equivalent | Already covered | — | `@aihu/primitives`' `collection` substrate already does this job. No new work. |
| Focus-trap exposure | Under-costed, re-scoped | M (was S) | `dialog/focus-trap.ts`'s existing `createFocusTrap` uses `container.querySelectorAll` — stops at shadow boundaries, the exact anti-pattern §3c(3) forbids. Not "just expose": first build a composed-tree tabbable walk (`TreeWalker`/`shadowRoot` drilling) as **shared substrate** with `InteractivityChecker`/`ListKeyManager`, build it once, then expose `createFocusTrap` on top of that walk (matches the primitives-package convention of `create*` factories, not scope-bound `use*`, since primitives have no active effect scope in `connectedCallback`). |
| `createScrollLock` (scroll-lock) | `@aihu/primitives` | S | react-use (`useLockBodyScroll`, renamed — `use*` is reserved for `@aihu/use`); directly needed by dialog/overlay/drawer — a DOM side effect, disqualifying it from `@aihu/use`'s signals-only posture. |
| `createSwitchTransition` / `createListTransition` (headless Presence + list-transition) | `@aihu/primitives` | L | solid-primitives; foundational for dialog/tooltip/collapsible enter-exit and any animated list. `presence-gate` is the existing analog for single-element exit-hold — this generalizes to lists. |
| `FocusTrap` (Tab-cycle containment) | Already substantially covered, expose re-costed | M (was S) | See focus-trap exposure row above — do not rebuild the trap logic, but do build the shared composed-tree tabbable walk before exposing it. |
| `FocusMonitor` (focus-origin: mouse/keyboard/touch/program) | `@aihu/primitives` | M | Angular CDK; enables real focus-visible-quality UX. New primitive, not covered today. |
| `ListKeyManager` family (`ActiveDescendantKeyManager`, `TreeKeyManager`) | `@aihu/primitives` | L | Angular CDK; extends the existing `roving-focus` primitive (the `FocusKeyManager` analog is already shipped) — combobox/listbox/tree-view are the missing siblings, not a rebuild. |
| `LiveAnnouncer` | `@aihu/primitives` | S/M | Angular CDK; must mount its `aria-live` region at the true document level (light DOM), never inside a component's shadow root — see Shadow-DOM anti-pattern (d)(4) below. |
| `InteractivityChecker` (is-tabbable/focusable/visible) | `@aihu/primitives` | M | Angular CDK; underlies FocusTrap/roving-focus — worth extracting as its own testable primitive rather than leaving inline. |
| Overlay positioning (anchor + flip + push + grow) + `ScrollStrategy` | `@aihu/primitives` | L | Angular CDK; the single biggest structural gap — shapes tooltip/popover/menu/select positioning. `tooltip`'s existing `position()` shim (css-engine's progressive runtime) is the seed to extend, not replace. |
| Portal abstraction (Component/Template/Dom-content variants) | `@aihu/primitives` | M | Must resolve the correct shadow root per host, never assume `document.body` — see anti-pattern (d)(1)/(2). |
| `createDrawer`/`AihuDrawerRoot` (open-state + focus-trap + Escape + scroll-lock) | `@aihu/primitives` | M | daisyUI-driven; reuse dialog's `focus-trap.ts` internals + new `createScrollLock`, do not reinvent. Genuine gap — daisyUI's own drawer has none of this. Renamed from `useDrawer` — primitives ship `create*` manual-handle factories/root components, not `use*` (no active effect scope in `connectedCallback`; a `use*`/`tryOnScopeDispose` API here would silently leak). |
| `AihuTabsRoot` (roving-tabindex + arrow-key/Home/End, `role=tablist`) | `@aihu/primitives` | M | daisyUI-driven; built directly on existing `roving-focus` — composition, not new invention. Renamed from `useTabs` — same `use*`-reservation rule as above. |
| `createDropdown`/`AihuMenuRoot` (roving-tabindex + outside-click + ESC + collection registration) | `@aihu/primitives` | M | daisyUI-driven; composed from existing `roving-focus` + `collection` — the clearest "80% already exists" case in the whole survey. Renamed from `useDropdown` — same `use*`-reservation rule as above. |
| Accordion assembly (group/multi-instance exclusivity + cross-component ARIA wiring on top of single-instance `useDisclosure` state) | `@aihu/primitives` (new) | M | daisyUI-driven; split out of the original `useDisclosure` proposal — group-exclusivity coordination is a multi-component concern built on the collection substrate, not signals-only state, so it belongs here rather than in `@aihu/use`. |
| `configProvider` `documentRoot` reflect option (config-provider-precedence + **`data-theme`-attribute-on-`<html>`** reflection for theme state — founder-ratified 2026-07-23, supersedes the `.dark`-class-at-`:root` framing this row originally proposed) | `@aihu/primitives` (extension to `AihuConfigProvider`) | M | Split out of the original `useTheme` proposal — `configContext` (host element + DOM traversal) and document-root writes are both illegal in `@aihu/use`'s signals-only/`@aihu/signals`-only-dep posture, and the latter re-opens the explicitly-rejected `useDark`. This closes the config-provider/document-root gap named in §3(b) at the correct layer, writing `data-theme` per the founder's ratified theme-convention decision (see Founder decisions §3 above) — the shipped `StylePack` CSS's `.dark`-class selectors need reconciling with `data-theme` as part of this work. |

### `@aihu/seo` / `@aihu/runtime` (named exceptions, confirmed, no action needed beyond noting)

| Item | Layer | Status |
|---|---|---|
| `useMounted` | `@aihu/runtime` | The one stated exception to the router-coupling rule; already the target layer, no relocation needed. |
| Head/SchemaOrg (`useHead`, `useSeoMeta` equivalents) | `@aihu/seo` | Already covered — `createSeoRoutes`/`JsonLdPage` do this job; 2 remaining open gaps per the VueUse audit, not yet itemized here, worth a follow-up pass scoped to `@aihu/seo` specifically. |
| `useTitle` | **Rejected, not a gap** | Explicitly dropped in the ratified plan doc — loses to `@aihu/seo`'s `head-apply.ts` route-nav interaction. Do not re-add without a fresh respec. |

### Explicitly excluded/already-rejected (do not relitigate)

- `useDark` (a *writing* composable in `@aihu/use`) — **rejected**; scheme-writing is `config-provider`'s job, keep only the read-only `usePreferredDark`.
- `useTitle` — **dropped**, see above.
- `onClickOutside` in `@aihu/use` — **wrong layer**, belongs in `@aihu/primitives` (dismiss-layer/APG contract).
- Reactivity-category Vue-Proxy cluster (`toRef`/`toReactive`/`reactify`/`extendRef`), `templateRef`, `createReusableTemplate`/`createTemplatePromise` — **no aihu analog**, exclude from the roadmap rather than force-fit.
- Electron/Firebase/RxJS/3rd-party-lib bridges (~26 functions) — **out of scope**, violates zero-core-lib-deps.

---

## 3. daisyUI integration strategy

### (a) Recommended approach

> **Founder-ratified (2026-07-23) — supersedes the Option 1/2/3 framing below.** The chosen
> approach is a **new Option 4 (hybrid)**, not a pick between Options 1/2/3 as originally
> posed. Options 1/2/3 are kept in this section only as historical context for *why* Option 4
> looks the way it does — do not read them as live alternatives.
>
> **Option 4 (hybrid) — ratified, detailed design IN PROGRESS as a separate design pass.**
> Combine aihu's existing `@aihu/css-engine` + the best parts of daisyUI + Tailwind-style
> code-shaking:
> - **Transcribe** daisyUI's component recipes *and* its named theme catalog into
>   css-engine's native, shadow-DOM-scoped model — this is what sidesteps daisyUI's
>   global-cascade conflict (old Option 3) rather than fighting it, while still getting full
>   recipe coverage (old Option 1) and full theme coverage (old Option 2, but as **the full
>   catalog**, not a 3-4-flagship-theme starting subset).
> - **Tree-shake the emission**: css-engine's output must be content-scanned/tree-shaken the
>   way Tailwind's JIT is, not ship the full transcribed recipe+theme surface unconditionally.
> - Old **Option 3** (run real Tailwind + real daisyUI as a second pipeline) is **rejected**,
>   not superseded-into-Option-4 — it remains off the table on structural grounds (the
>   global-cascade / second-vocabulary problem css-engine's shadow-DOM-scoped design exists to
>   avoid), not merely cost.
>
> **~~PLACEHOLDER~~ — RESOLVED 2026-07-26. The detailed Option 4 design (token-mapping
> mechanics, tree-shake/content-scan implementation, recipe-transcription workflow, migration
> plan for the `.dark`-class → the `data-theme` StylePack reconciliation named in the Founder
> decisions) now lives at
> [`2026-07-26-option-4-daisyui-design.md`](./2026-07-26-option-4-daisyui-design.md).** That
> document is the spec; the bullets above and the Option 1/2/3 table retained below capture only
> the decision, not the mechanism. Two items in it require founder sign-off before the
> token-contract slice can land (its §7.4). Note also that per the light-DOM-flip amendment at
> the top of this file, §3(a)'s "shadow-DOM-scoped model" wording is left unedited on purpose —
> it is rewritten only once the flip itself is founder-approved.

Options 1/2/3 as originally analyzed (retained for context; superseded per above):

| Option | What it does | Effort | Risk |
|---|---|---|---|
| **1 — Recipe port** | Hand-port daisyUI's visual recipes into `@aihu/ui`'s registry format (`packages/ui/registry/<name>/*.aihu`), authored against the existing `--color-*` token contract. Registry today has 11 components (`badge, button, card, checkbox, dialog, input, label, separator, switch, textarea, tooltip`) — no `accordion/tabs/drawer/dropdown-menu`, so this is additive. **Founder-ratified scope: the FULL daisyUI recipe set**, not a named subset. | Highest one-time authoring cost | Zero architectural risk — stays inside `aihu add`, stays scoped, renders under any current/future `StylePack` for free |
| **2 — Theme packs** | Transcribe daisyUI's named theme catalog (`light`, `dark`, `cupcake`, `dracula`, etc.) into `StylePackInput.tokens`/`.dark` shape via the existing `defineStylePack()` API (explicitly the same API external orgs already use). | Cheap | Solves theming variety only — not component convenience or JS behavior. Complementary, not a substitute for Option 1. |
| **3 — Parallel Tailwind pipeline** | Run real Tailwind + real daisyUI plugin as a second CSS pipeline. | Zero porting effort | Two independent class vocabularies/scoping models in one app, cascade/specificity collisions, a second build tool the css-engine's own single-engine philosophy was designed to avoid. **Rejected on structural grounds (founder-ratified 2026-07-23)** — not a cost tradeoff; superseded entirely by Option 4 above. |

### (b) Behavior → composable/primitive mapping

| daisyUI component | Real JS need | aihu shape | Layer | Already covered? |
|---|---|---|---|---|
| theme-controller | None built-in (pure CSS var-swap; persistence/detection is "your job" per daisyUI docs) | `useTheme` — composes `useColorScheme` + `useLocalStorage`, state-only, caller applies to DOM | `@aihu/use` | Partially — both dependencies already shipped; `useTheme` is a thin composition, not new primitives. **Must follow config-provider's existing precedence**: inject `configContext` first (config-provider owns `colorScheme` reflected to its own host's `data-color-scheme`), fall back to `usePreferredDark` only if no provider ancestor — mirrors the `dir` fallback pattern already in `roving-focus/index.ts:117-125`. **Founder-ratified (2026-07-23)**: the document-root reflection writes daisyUI's **`data-theme` attribute on `<html>`**, not aihu's `.dark`-class convention. This closes the gap directly: `config-provider` today reflects only to its *own host element*, not `document.documentElement`; the `AihuConfigProvider` `documentRoot` extension now writes `data-theme` to the document root. The shipped CSS packs (`aihu-default.css`/`aihu-graphite.css`), which key dark mode off a `.dark` class at `:root`, need reconciling with `data-theme` as part of the same build (dual-key or migrate — see Founder decisions §3). |
| modal/dialog | `showModal()`/`close()`, native ESC, backdrop-click | Nothing new | `@aihu/primitives` | **Fully covered, superset even** — `dialog` already does focus-trap + return-focus, Escape-to-close, `role=dialog`/`aria-modal`, trigger `aria-haspopup`/`aria-expanded` per WAI-ARIA APG. Just author a `modal`-styled recipe on top of the existing primitive. Do NOT build a `useDialog` — would duplicate `AihuDialogRoot`. |
| drawer | daisyUI's is checkbox-hack only — no ESC/focus-trap/scroll-lock | `createDrawer`/`AihuDrawerRoot` — open signal + focus-trap (reuse `focus-trap.ts`) + Escape + scroll-lock | `@aihu/primitives` (new) | Not covered — genuine gap, but reuses dialog's focus-trap internals + a new `createScrollLock` rather than fresh code. **Founder-ratified primitives-first gate**: the `@aihu/ui` drawer recipe does not ship until `AihuDrawerRoot` exists and clears the dialog/roving-focus/collection accessibility bar. |
| dropdown | 3 CSS-only variants (`<details>`, `:focus`, Popover API), none with outside-click/ESC by default | Assemble from existing `roving-focus` + `collection` (`createDropdown`/`AihuMenuRoot`) | `@aihu/primitives` (assembly) | Partially — building blocks exist; no assembled menu/dropdown primitive yet. Clearest "80% already exists" case. **Founder-ratified primitives-first gate**: no daisyUI-styled dropdown recipe until `AihuMenuRoot` ships and meets the accessibility bar. |
| tabs | Radio-input CSS-only, not APG-conformant (no arrow-key nav) | `AihuTabsRoot` on top of `roving-focus` | `@aihu/primitives` (assembly) | Not assembled, but the hard part (`roving-focus`) already ships. **Founder-ratified primitives-first gate**: no daisyUI-styled tabs recipe until `AihuTabsRoot` ships and meets the accessibility bar. |
| collapse/accordion | CSS-only (checkbox/`<details>`/radio group), no JS | `useDisclosure` (single-instance state) + a new `@aihu/primitives` accordion assembly (group/multi-instance exclusivity + ARIA wiring) | `@aihu/use` (state) + `@aihu/primitives` (assembly) | Not covered, but genuinely fits `@aihu/use`'s existing contract for single-instance state — closest analog to shipped `useToggle`. **Founder-ratified primitives-first gate**: no daisyUI-styled accordion recipe until the `@aihu/primitives` accordion assembly ships and meets the accessibility bar. |
| swap | Checkbox-driven class toggle | Nothing new — `useToggle` already ships | `@aihu/use` | **Fully covered already.** |

**Layering-rule check**: none of the six read/write router state, so nothing here relocates to
`@aihu/router`. Only `useTheme` and `useDisclosure` are genuinely `@aihu/use`-shaped (state +
minimal side effects, SSR-safe); drawer/dropdown/tabs land in `@aihu/primitives` even though
they're not router-coupled, because they need DOM focus management / scroll-lock, which
disqualifies them from `@aihu/use`'s signals-only posture the same way `onClickOutside` was
already excluded.

**Primitives-first sequencing (founder-ratified 2026-07-23)**: drawer, dropdown, tabs, and
accordion recipes in `@aihu/ui` are explicitly gated behind their `@aihu/primitives`
counterparts landing and meeting the shipped `dialog`/`roving-focus`/`collection` accessibility
bar — see §5 for the updated sequencing.

### (c) Shadow-DOM anti-patterns to design around (from the beyond-VueUse survey, apply to any ported primitive)

1. No global overlay-container singleton appended to `document.body` — resolve the nearest
   shadow root or a per-host portal target instead (Angular CDK's `OverlayContainer` needs a
   custom override for this exact reason under Shadow DOM).
2. No portal/"teleport" that assumes a flat light-DOM tree — teleporting out of a shadow root
   orphans CSS custom-property/theming inheritance from the originating scope.
3. Focus-trap/tabbable-element traversal must cross shadow boundaries explicitly (chained
   `element.shadowRoot.activeElement` drilling or a `TreeWalker`-based composed-tree walk) —
   `document.querySelectorAll(...)`-based approaches (what most ported CDK/React modal code
   uses) silently stop at the first shadow boundary. Non-negotiable for any ported `FocusTrap`/
   `ListKeyManager`/roving-focus extension.
4. `aria-live` announcer regions must mount at the true document level (light DOM), not inside
   whichever shadow root calls `announce()` — screen readers frequently miss live regions
   nested inside custom-element shadow DOM.
5. Native closed shadow roots (`<video controls>`) are an unfixable blind spot for any
   tabbable-element enumeration — document this limitation, don't silently mishandle it.
6. Route all ported primitive styling through `@aihu/css-engine`'s scoping mechanism, not
   global class injection the way CDK's `.cdk-overlay-container`/`.cdk-focused` do.

---

## 4. DX / editor track

Sequenced as its own track that should run **interleaved with, not blocking, composable
additions** — every new composable in Tiers 0-2 should land through this pipeline once it
exists, so the track should be built early enough to absorb Tier 1 volume, not after Tier 3.

1. **Generated registry manifest** — the plan doc's own audit already found the machine-checked
   source of truth: `packages/compiler/src/codegen/use_registry.rs`'s `USE_COMPOSABLES` const
   array (confirmed *already shipped and live*, not future work as an existing plan doc's
   stale future-work section describes — auto-import of bare `useX()` calls in `@state` is
   real today). Any new composable must add one tuple here, one barrel-export pair in
   `packages/use/src/index.ts`, one `exports` block in `package.json`, one `input` entry in
   `rolldown.config.ts`, and one `.size-limit.json` row — five touch points, confirmed by
   tracing `useEventListener` across all of them. This is mechanical and should be the first
   thing scripted/automated (a `pnpm gen:use <name>` scaffolder) before Tier 1 volume lands, to
   avoid 15+ manual five-touch-point additions.
2. **LSP completions** — once the registry manifest is provably the single source of truth
   (step 1), the editor/LSP layer that surfaces `useX()` completions in `.aihu` template/`@state`
   blocks should read directly from `USE_COMPOSABLES` rather than a hand-maintained list, so new
   composables get completions for free the moment they're registered.
3. **src↔registry parity test** — a CI check asserting every composable in
   `packages/use/src/` has a corresponding `USE_COMPOSABLES` entry, `package.json` export, and
   `.size-limit.json` row (and vice versa) — catches the exact kind of drift the audit had to
   manually verify this time. This should exist *before* Tier 1 lands, since Tier 1 is the first
   batch large enough for manual drift to actually occur.
4. **Per-composable docs** — confirmed no auto-generated docs-registry today (cookbook/docs
   are hand-authored). Lowest priority of the four; can trail composable landings rather than
   gate them, but should consume the same manifest (step 1) once it exists so docs generation
   isn't a sixth manual touch point.

**Sequencing within this track**: 1 → 3 (scaffolder before parity gate, so the gate has
something conformant to check) → then Tier 0/1 composables flow through both → 2 and 4 can
build concurrently with early Tier 1 landings once 1 is stable.

---

## 5. Recommended overall sequencing

1. **Tier 0** (foundational unlocks: `watch()` primitive, `useEventListener` generalization,
   scope-exit warning) — do first, everything downstream gets cheaper.
2. **DX track steps 1 + 3** (scaffolder + parity test) — build immediately after Tier 0 lands,
   *before* Tier 1 volume, so 15+ additions don't each hand-touch five files with no safety net.
3. **Tier 1** (quick wins: `useMap`/`useSet`, `useMeasure`, `useNetworkState`, `useIdle`,
   `PersistedState`, `boolAttr`, `IsFocusWithin`, `useAsync`, `useTheme`, `useDisclosure`,
   micro-util consolidation) — runs through the now-scaffolded pipeline; ships incrementally,
   not as one batch. `useTheme`'s document-root half writes `data-theme` per the founder's
   ratified theme-convention decision (Founder decisions §3).
4. **daisyUI Option 4 (hybrid) recipe/theme work, full catalog, in parallel with Tier 1 —
   MODAL/SWAP/COLLAPSE-STATE ONLY at this stage.** Recipe authoring and theme-catalog
   transcription don't depend on new composables for the components already fully covered by
   existing primitives (modal, swap) or by Tier-1 `useDisclosure` state (collapse), so those can
   run concurrently with Tier 1. **Founder-ratified primitives-first gate**: the drawer,
   dropdown, tabs, and accordion recipes are explicitly EXCLUDED from this parallel track — see
   step 6 below, they wait for their `@aihu/primitives` counterparts. The detailed Option 4
   hybrid mechanism (content-scan/tree-shake implementation, full transcription workflow) is a
   separate in-progress design pass — this step can start once that design lands.
5. **Watch-family wrappers** (Tier 2, post-`watch()`) — ship as one arc once Tier 0's `watch()`
   lands; cheap per-item once the substrate exists.
6. **`@aihu/primitives` daisyUI-driven work** (`AihuDrawerRoot`, `createDropdown`/`AihuMenuRoot`
   assembly, `AihuTabsRoot`, the accordion assembly) — sequence after the Tier-0 scope-exit
   warning exists (these primitives are exactly where a misplaced `tryOnScopeDispose` call would
   previously have silently leaked) and after the Shadow-DOM anti-pattern guidance (§3c) is
   agreed, since all four touch focus-trap/portal-adjacent code. **Only once each of these
   individually meets the dialog/roving-focus/collection accessibility bar (founder-ratified
   primitives-first gate) does step 4's daisyUI recipe work resume for that specific
   component** — this is a per-component gate, not an all-or-nothing batch: e.g. if
   `AihuTabsRoot` lands and passes its accessibility bar before the drawer/dropdown/accordion
   primitives do, the tabs recipe may ship immediately without waiting on the other three.
7. **Remaining Tier 2** (scheduled-signal debounce/throttle, broadcast/websocket/SSE,
   geolocation/permission/vibrate, StateHistory, FiniteStateMachine) and the larger
   `@aihu/primitives` CDK-derived items (FocusMonitor, ListKeyManager siblings, LiveAnnouncer,
   InteractivityChecker, overlay positioning, portal abstraction) — long-tail, sequence by
   founder priority once Tiers 0/1 and the daisyUI Option 4 modal/swap/collapse-state work have
   shipped and validated the pipeline end-to-end.
8. **Tier 3** — opportunistic, no fixed sequencing.

---

## 6. Open questions for the founder

1. **daisyUI scope** — **RESOLVED (founder-ratified 2026-07-23)**: full recipe port. Not
   theme-layer-only, not a named subset. See Founder decisions §1.
2. **Primitives-first vs. recipe-first** for drawer/dropdown/tabs/accordion — **RESOLVED
   (founder-ratified 2026-07-23)**: primitives-first. No daisyUI-styled recipe for any of the
   four ships until its matching `@aihu/primitives` assembly exists and meets the
   dialog/roving-focus/collection accessibility bar. See Founder decisions §4 and the updated
   §5 sequencing.
3. **Theme-controller semantics** — **RESOLVED (founder-ratified 2026-07-23)**: `useTheme`
   standardizes on daisyUI's `data-theme` attribute on `<html>`, not aihu's `.dark`-class
   convention. This resolves the config-provider/document-root gap named in §3(b) — the
   `AihuConfigProvider` `documentRoot` extension writes `data-theme`, and the shipped
   `StylePack` CSS's `.dark`-class selectors need reconciling with it. See Founder decisions §3.
4. **`packages/css-engine/README.md` self-contradiction** ("Tailwind v4 hard fork" in the
   summary vs. "inspired by Tailwind v4, not a fork" in the vocabulary section) — **still open**.
   Worth a doc fix independent of the daisyUI decision, since it directly affects how confidently
   anyone can state whether daisyUI can plug in at all.
5. **Is Option 3 (parallel real-Tailwind pipeline) off the table on principle, or only on
   cost?** — **RESOLVED (founder-ratified 2026-07-23)**: on principle/structural grounds, not
   cost — and the question is now moot in its original form, since Option 3 isn't being weighed
   against Options 1/2 at all anymore: the ratified approach is the new Option 4 hybrid, which
   supersedes the whole Option 1/2/3 framing. See Founder decisions §2.
6. **`@aihu/seo`'s 2 remaining open gaps** (from the VueUse audit's category breakdown) weren't
   itemized in this pass — **still open**. Worth a short follow-up scoped specifically to
   `@aihu/seo` before calling that layer "done."
7. **Docs-next scroll-reset stopgap** — **RESOLVED**: it lives on the `feat/docs-next-site`
   branch, not on `main` — that's why the current-surface audit (run against `main`) couldn't
   find it in `apps/docs/src/components/docs-shell.aihu`. Not missing, not removed — just not on
   the branch this audit was run against. The router-layer scroll-restoration work (§2, router
   relocations) should treat this as *existing prior art to consult/port* from
   `feat/docs-next-site`, not as something to build from scratch.
8. **`FiniteStateMachine` layer**: Tier 2 lists it as `@aihu/use` or `@aihu/primitives` pending
   first consumer — **still open**. Should this wait until dropdown/combobox internal-state
   needs are concrete, or is there value in shipping it standalone now?

---

## Sources / files referenced across all four research streams

- VueUse catalog artifact: `https://claude.ai/code/artifact/5b5a12b4-75fb-4692-b760-a48559cc6f96`
  (working source: `/private/tmp/claude-501/-Users-smcguirt-conductor-workspaces-data-islamabad/5a8cdcf8-e5d4-458a-8324-1e4e3f8dc186/scratchpad/vueuse-gap.html`)
- Beyond-VueUse survey: react-use, @react-hookz/web, @solid-primitives, Runed, Angular CDK
  (see individual GitHub/docs citations embedded in the research stream above)
- daisyUI analysis: daisyui.com live docs (Introduction, Modal, Dropdown, Drawer,
  Theme Controller, Tab, Collapse, Swap)
- aihu current-surface audit, all under `/Users/smcguirt/conductor/workspaces/aihu/gwangju`:
  `packages/use/src/index.ts`, `package.json`, `rolldown.config.ts`, `src/shared/index.ts`,
  `src/useEventListener/index.ts`, `src/useColorScheme/index.ts`, `src/usePreferredDark/index.ts`,
  `src/useLocalStorage/index.ts`, `.size-limit.json`,
  `packages/compiler/src/codegen/use_registry.rs`,
  `packages/primitives/src/{index.ts,dom-context.ts,tooltip,config-provider,roving-focus,collection,presence-gate,dialog/focus-trap.ts}`,
  `packages/ui/registry.json`,
  `packages/css-engine/README.md`, `styles/aihu-default.css`, `styles/aihu-graphite.css`,
  `packages/router/src/{index.ts,runtime.ts,router.ts}`,
  `docs/plans/2026-07-22-effect-scope-and-composables.md` (§4, §5, review log, future-work —
  ratified source for the layering rule and prior overlap decisions)
