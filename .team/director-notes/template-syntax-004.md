# Director Note — topic:aihu-template-syntax track:userland-dx — Round 4 (User-Directed Scope Adjustment)

**Mode:** 2 (build/refactor — research/governance phase, fourth pass)
**Iteration counter:** 0 of 5 (no Builder ↔ Verifier yet — Builder phase begins post-user-approval)
**Date:** 2026-05-06
**Author:** Director
**Tags:** `topic:aihu-template-syntax track:userland-dx round:4 user-directed-scope-adjustment`

**STATUS:** R4 RATIFIED — manifest revised: 6 RATIFY-now / 4 DEFER-v0.4 / 8 DEFER-v0.5+ / 1 REJECT. Codemod budget unchanged at 560 LOC; compiler/runtime grows ~200-280 LOC over r3's projection. Builder seam plan = 5 rounds (at iteration ceiling). Synthesizer in flight with stale categorization — Team Lead patches master doc + topic_summary post-landing.

---

## §1 — Trigger + decision

After reviewing the round-3 audit reconciliation (r3 §3 manifest + §5 user-surface), the user **pulled D2 → R5 ($aria collection + auto-keyboard-promotion) and D3 → R6 ($controller collection) into RATIFY-now status.** D1 (DSD in SSR), D4 ($context), D5 ($form), and D6 (defineAihuSanitizer factory + Trusted Types chokepoint) remain DEFER-to-v0.4. The user has NOT green-lit Builder dispatch — they are still in curation mode and want the refined round-3 spec amendments documented before Builder fires. This is a **user-directed scope adjustment**, well-grounded: D2 + D3 were the #2 and #3 strong-signal proposals from r3 §4, and lifting them into the same Variant B Builder cycle avoids a separate v0.4 spec round for two collections that lower cleanly through the same `attachInternals()` allocation already needed by other deferrals. R4 documents the spec-section text Builder will implement against.

---

## §2 — Spec-section text for $aria collection (R5)

### §2.a — Surface

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

### §2.b — Lowering (cite Auditor A §A9, platform-integration-001.md lines 399-422)

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

### §2.c — Reactivity

Bare-thunk entries (`pressed: () => isSelected()`) are dependency-tracked through the standard signals pipeline (Scout D2). When `isSelected` updates, the `mountEffect` re-runs and writes `internals.ariaPressed = String(true)`. **Confirmed fine-grained reactivity.** Static entries (`role: 'button'`) are written once at connect; recompiling the SFC is the only path to change them.

### §2.d — Auto-keyboard-promotion

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

### §2.e — Default tabindex

When `$aria.role` is set to a focusable role (`'button'`, `'link'`, `'menuitem'`, `'tab'`, `'menuitemcheckbox'`, `'menuitemradio'`, `'option'`, `'switch'`, `'checkbox'`, `'radio'`, `'slider'`, `'spinbutton'`, `'textbox'`), the compiler auto-emits `tabindex="0"` on the root template element **unless tabindex is already declared**. Detection happens at codegen against the @template root element's attribute set; any `tabindex={…}` or `tabindex="…"` in author source wins. **Document this magic-behind-it explicitly:** the spec section names the auto-tabindex injection so authors aren't surprised when DevTools shows a tabindex they didn't write.

### §2.f — Type-safety

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

### §2.g — IS-NOT-IN

- `$aria` does **NOT** replace explicit `aria-*` attributes in `@template`. Authors can still write `<div aria-busy="true">` in template position; `$aria` is the collection-form alternative for component-author-owned ARIA, not a replacement for instance-level overrides. Mixing the two on the same element is permitted but cannot be made coherent in all cases — when `$aria.label` is declared on a component AND a consumer writes `<my-comp aria-label="override">`, the `aria-label` attribute wins (DOM precedence over `internals.ariaLabel`). Document this precedence in the spec.
- `$aria` does **NOT** auto-translate (no i18n magic). Userland threads its own i18n function through the thunk: `label: () => t('close')`.
- `$aria` does **NOT** manage focus rings (`:focus-visible` styling is the `@style` block's territory).
- `$aria` does **NOT** ship a build-time a11y lint pass (deferred as L4 in r3 manifest).

### §2.h — Acceptance criteria (Builder will run)

1. **Keyboard promotion works.** A `<div>` SFC with `$aria.role: 'button'` + `$on.click={fn}` responds to Enter and Space keypresses (calls `fn` once each, with `e.preventDefault()`).
2. **Screen reader announces declared role + label.** Test via axe-core if available; otherwise manual NVDA/VoiceOver verification. Scope to one synthetic test SFC; full a11y matrix is L4 territory.
3. **Reactive ARIA state updates.** `$aria.pressed: () => signal()` → consumer toggles `signal` → `internals.ariaPressed` reflects the new value within one microtask.
4. **No double-fire on native interactive elements.** A `<button>` SFC root with `$aria.role: 'button'` + `$on.click={fn}` fires `fn` exactly ONCE on Enter and ONCE on Space (not twice). Compiler guard suppresses auto-keydown when underlying tag is `<button>`.

### §2.i — Estimated LOC

~80-120 compiler/runtime additions:
- Parser for `$aria` collection in `@state` v2: ~20 LOC
- Codegen for `attachInternals()` cached call + per-key emit: ~30-50 LOC
- Auto-keyboard-promotion handler emit + role-table: ~20-30 LOC
- Default-tabindex codegen pass: ~10-20 LOC

**0 LOC codemod** (additive — existing .aihu files don't break, they just don't use the new collection).

---

## §3 — Spec-section text for $controller collection (R6)

### §3.a — Surface

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

Where `useResizeObserver`, `useKeyboard`, `useMousePosition` are user- or library-defined factory functions returning a controller instance conforming to the protocol in §3.b. `$controller` is a new `@state` v2 collection-form macro. Per macro-vocab-v2 §2 grammar:

- **Bare entry-value** is **forbidden** for `$controller` — the entry must be a factory call (an expression that synchronously returns the controller object). Bare function expressions would imply a callback, which is the wrong mental model.
- **Wrapped entry-value** with metadata: `{ value: () => useResizeObserver(...), describe: '…' }`. The `value:` thunk is invoked once per SFC instance at construct time; the returned controller is registered.

Forbidden keys: `default`, `handler`, `on`, `expose` (controllers are SFC-internal; not agent-exposed surface).

### §3.b — Controller protocol

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

**Naming defense.** I picked the **aihu-flavored alternative** (`mount`/`dispose`/`adopt`/`attributeChange`) over Lit's (`hostConnected`/`hostDisconnected`/`hostAdopted`/`hostAttributeChanged`). Three reasons:

1. **Consistency with `$lifecycle`.** R2 (ratified r3) extends `$lifecycle` to `{ mount, dispose, adopt?, attributeChange? }`. Using the same vocabulary in `$controller` means authors don't toggle between `host*`-prefixed methods and `$lifecycle`-named methods within a single SFC.
2. **Aihu does not expose a "host" abstraction.** Lit names methods `hostConnected` because controllers receive a `ReactiveControllerHost` object. Aihu controllers receive a typed wrapper around `ctx` + `$state` (per §3.c) — there's no host concept to name after.
3. **The cost of divergence is low.** Library authors porting Lit Reactive Controllers rename four method names. The benefit is a more uniform aihu surface.

### §3.c — Access to host

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

### §3.d — Composition

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

### §3.e — Type-safety

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

### §3.f — IS-NOT-IN

- `$controller` does **NOT** replace `$action` or `$effect`. Those are SFC-internal mechanisms; controllers are reusable composables. Authors writing one-off side-effects belong in `$effect`; reusable cross-SFC behaviors belong in `$controller`.
- `$controller` does **NOT** make a controller a custom element. There is no separate `customElements.define` per controller; controllers are plain objects.
- `$controller` does **NOT** support cross-element controllers (single-host only — per-instance). A single `useGlobalKeyboard()` shared across many SFCs is module-scope-function territory (per r3 §2.a / Auditor B §5 recommendation), not `$controller`.
- `$controller` does **NOT** ship built-in controllers (`useResizeObserver`, `useIntersectionObserver`, `useKeyboard`) in this round. See §3.g.

### §3.g — Built-in controllers (out of scope for round 3)

Userland writes its own factories for v0.3. Aihu does **not** ship `@aihu/controllers` with batteries-included controllers in this round. **Defer to v0.4+** as a separate package: `@aihu/controllers` exporting `useResizeObserver`, `useIntersectionObserver`, `useKeyboard`, `useMousePosition`, `useFetch`. Tracked alongside D4 ($context) + D5 ($form) on the v0.4 spec roadmap. State this is an out-of-scope item in the spec amendment text so users don't expect them in the v0.3 ship.

### §3.h — Acceptance criteria (Builder will run)

1. **Two controllers fire `mount` in declaration order.** A test SFC with `$controller: { a: useA(), b: useB() }` where `useA` and `useB` log in `mount` — verify `a` logs before `b`.
2. **Cleanup fires in reverse order.** Same SFC: on disconnect, `b.dispose` fires before `a.dispose`.
3. **Controller exposing reactive state can be referenced from @template.** A `useCounter()` controller exposing `count: Signal<number>` — verify `<span>{counter.count()}</span>` re-renders on count change.
4. **`attributeChange` fires when $prop updates.** Depends on R1 ($prop reactivity fix). After R1 lands, declaring a controller with `attributeChange(name, old, new)` and updating a `$prop` from the parent triggers the controller's callback. **Builder seam: B5 depends on B1 — order matters.**

### §3.i — Estimated LOC

~60-100 compiler/runtime additions:
- Parser for `$controller` collection: ~15 LOC
- Codegen for factory call + lifecycle wiring: ~20-30 LOC
- Runtime controller registry per SFC instance: ~15-25 LOC
- Lifecycle dispatcher (declaration-order mount, LIFO dispose): ~10-20 LOC
- AihuControllerHost wrapper + injection: ~10-20 LOC

**0 LOC codemod** (additive — new collection).

---

## §4 — Updated ratify-now manifest (replaces r3 §3 categorization for changed rows)

| ID | Proposal | Verdict | Spec section affected | LOC delta | Notes |
|---|---|---|---|---|---|
| R1 | $prop reactivity fix + optional `attribute`/`reflect`/`converter` keys | RATIFY now | new spec §X.1 | +50 LOC compiler emit, +20 LOC runtime | CORRECTNESS bug — Auditor A row 11 |
| R2 | $lifecycle four-callback extension | RATIFY now | spec §X.2 | +10 LOC runtime dispatcher | additive — Auditor A row 16 |
| R3 | $show → `hidden` attribute | RATIFY now | §3.D.27 (existing) | +5 LOC compiler emit | semantics-preserving — Auditor A row 27 |
| R4 | $bind write-side verify | RATIFY now | §11 acceptance criterion | 0 LOC if present; +30 LOC if absent | verification only — Auditor A row 22 |
| **R5** | **$aria + auto-keyboard-promotion** | **RATIFY now** (was DEFER v0.4) | **new spec §X.4** (per §2 above) | **+80-120 LOC compiler/runtime** | **user-pulled into round 3** — Auditor B §4.1+§4.2 |
| **R6** | **$controller collection** | **RATIFY now** (was DEFER v0.4) | **new spec §X.5** (per §3 above) | **+60-100 LOC compiler/runtime** | **user-pulled into round 3** — Auditor B §5.2 + Auditor A §A10.4 |
| D1 | DSD in SSR | DEFER v0.4 | new spec | – | unchanged |
| D4 | $context (provide/inject) | DEFER v0.4 | new spec | – | unchanged (renumbered from r3 D4) |
| D5 | $form / @form (form-associated) | DEFER v0.4 | paired w/ R5 | – | unchanged — shares `attachInternals()` cache from R5 (work reduction in v0.4) |
| D6 | defineAihuSanitizer factory + TT chokepoint | DEFER v0.4 | new spec | – | unchanged |
| L1-L8 | (lower priority) | DEFER v0.5+ | – | – | unchanged from r3 |
| X1 | Customized built-ins | REJECT | n/a | – | unchanged from r3 |

**Total RATIFY-now LOC delta:** ~200-280 LOC compiler/runtime additions (was +85-115 in r3); **0 LOC codemod** (still 560 LOC base — all R1-R6 amendments are strictly additive, no userland .aihu source changes).

**Re-cut threshold check.**
- Architect spec base: 540 lines (under 600 ceiling — pass).
- Variant B trigger categories: 3 of 4 (sigil change, value-form change, structural addition; runtime contract preserved). r2 override stands — the round-3+round-4 RATIFY-now amendments are all additive (no new sigil, no value-form change, no structural template-side addition; only new collection-form macros and emit changes).
- Compiler/runtime grows ~30% larger than r3's projection. **Still well within Variant B's overall scope; no formal re-cut required.** The user-gate is the binding constraint.

---

## §5 — Updated Builder seam plan

Originally r3 anticipated 5 Builder rounds. With R5 + R6 added, propose the following 5-round seam:

### B1 — R1 ($prop reactivity fix + optional keys)

Single-defect, isolatable, affects every SFC that takes props. **Canonical first round** (most-impactful + most-isolated).
- ~50-80 LOC src + ~100-150 LOC tests
- Tests synthetic: parent sets attribute → child signal updates; parent sets property → child signal updates; reflect roundtrips; converter roundtrip on Date.
- Branch: `feat/template-syntax-v2-b1`

### B2 — R2 + R3 + R4 (additive @state v2 + emit fixes)

Small additive items in @state v2 collection-form parser + emit.
- ~30-50 LOC src + tests
- R4 may be 0 LOC if the write-side already wires; Builder verifies via Scout-style code path read.
- Branch: `feat/template-syntax-v2-b2`

### B3 — Variant B template syntax (parser + codegen + runtime + codemod)

The largest single Builder round; the spec's core.
- ~250-300 LOC src (parser + codegen + runtime for `{#if}`/`{#each}`/`{:else if}`/`{:else}`/`{:empty}` + `$on.click` rename)
- ~200 LOC tests
- ~560 LOC codemod (all of the budget — userland v1 → variant B transformation lands here)
- Sidecar `.aihu.ts` for type-safety: lands within B3, or split as B3.1 if scope creeps. Director default: B3.1 split (keeps B3's parser/codegen work uncoupled from sidecar emit).
- Branch: `feat/template-syntax-v2-b3` (with possible `feat/template-syntax-v2-b3-1` sub-branch)

### B4 — R5 ($aria + auto-keyboard + default-tabindex)

New ElementInternals path. `attachInternals()` cached call + per-aria-key emit + role-based key dispatch + default-tabindex codegen pass.
- ~80-120 LOC src + ~150 LOC tests including axe-core integration if available
- Tests synthetic: keyboard role components respond to Enter/Space; double-fire suppression on `<button>`; reactive aria-pressed update; default-tabindex injection.
- Branch: `feat/template-syntax-v2-b4`

### B5 — R6 ($controller collection)

Controller registry, lifecycle dispatcher, per-instance state. **Depends on B1 completing** (R6 acceptance criterion (iv) requires R1's reactive attributeChangedCallback wiring).
- ~60-100 LOC src + ~120 LOC tests
- Tests synthetic: declaration-order mount; LIFO dispose; reactive state from controller in @template; attributeChange fires on $prop update.
- Branch: `feat/template-syntax-v2-b5`

### Round bounds and discipline

Each round bounded ≤500 LOC src + tests per playbook lessons. **5 rounds total — at the iteration ceiling.** B3 is the biggest and closest to the bound (~750 LOC including codemod, but codemod is partition-able from src). **If any round triggers a Builder ↔ Verifier ping-pong loop, Director surfaces immediately for re-cut consideration.** The re-cut path is to split B3 into B3a (parser+codegen) + B3b (codemod) if the scope explodes.

### Codemod work

Lands as part of B3 only. R1-R2-R3-R4 are pure-additive. R5 + R6 are pure-additive new collections. **Existing .aihu files don't break under R1-R6;** the codemod only touches Variant B template-syntax migration (the `{#if}` / `{#each}` / `$on.click` rename / class array form lift), per r3 §3 manifest.

### Branch convention

Feature branch `feat/template-syntax-v2` off main; sub-branches `feat/template-syntax-v2-b1`, `-b2`, ..., `-b5`. PR each into the parent feature branch; final merge of `feat/template-syntax-v2` to main as one Variant-B-as-shipped commit.

---

## §6 — Synthesizer note

Synthesizer is **in flight** with stale categorization. The Synthesizer's r3 instructions (per Director r3 §6) routed D2 ($aria) + D3 ($controller) to DEFER-v0.4 placement in the master audit doc. **The master audit doc + topic_summary will be wrong on these two rows** when Synthesizer lands. **Do not interrupt Synthesizer** — let it complete, then patch.

### Patches Team Lead must apply post-Synthesizer-landing

Cite this director-note (r4) as the corrective record in each patch.

1. **§1 master doc — headline finding.** The "16 already-integrated / 6 integrable / 13 extrapolating / 3 platform-is-worse" framing remains accurate (D2 + D3 don't change those buckets — they're net-new sugar additions on top of the matrix, not re-categorizations of existing constructs). **Add one paragraph noting R5 + R6 are RATIFY-now sugar additions on top.**

2. **§3 master doc — sugar proposals.** Move D2 → R5 and D3 → R6 from the "deferred to v0.4" treatment into full RATIFY-now status. Pull the spec-section text from this director-note r4 §2 + §3 verbatim into the master doc's §3. Remove the v0.4-deferral framing for these two rows.

3. **§5 master doc — ratify-now manifest table.** Replace the four-row table (R1-R4) with the six-row table from this r4 §4. Update LOC totals: ~200-280 compiler/runtime; 0 codemod (560 unchanged).

4. **§6 master doc — deferred items.** Remove D2 + D3 from the v0.4 deferred-items roadmap section. Note that D5 ($form) shares `attachInternals()` cache with R5 (now landed) — work reduction for v0.4. Add a one-line cross-reference to R5's spec section.

5. **topic_summary.** Same treatment — surface the RATIFY-now manifest as 6/4/8/1 (not 4/6/8/1). Update durably-true facts to include `$aria` and `$controller` collections in the v0.3 ship list. Update open items to remove the v0.4 deferral for these two rows.

---

## §7 — Updated user-surface message (replaces r3 §5)

**To paste verbatim (Team Lead):**

> **Round-4 update on aihu template-syntax v2: $aria + $controller pulled into the v0.3 ship per your direction.**
>
> Updated manifest: **6 RATIFY-now / 4 DEFER-v0.4 / 8 DEFER-v0.5+ / 1 REJECT.** The six round-3 amendments now include declarative ARIA via `ElementInternals` (with auto-keyboard-promotion on `$on.click` for components with `$aria.role: 'button' | 'link' | 'menuitem' | 'tab'`) and the Lit-Reactive-Controller pattern as a `$controller` collection in `@state` v2. Both lower through the same `attachInternals()` allocation that v0.4 deferrals (`$form`) will reuse — landing them now reduces v0.4 work materially.
>
> **Spec-section text drafted** at `.team/director-notes/template-syntax-004.md` §2 (R5: $aria) + §3 (R6: $controller). Each section covers surface, lowering (cites Auditor A's ElementInternals platform mechanism), reactivity, type-safety, IS-NOT-IN scope, and Builder acceptance criteria. Auto-keyboard-promotion's edge cases are spelled out (no double-fire on native `<button>`; default-tabindex injection magic is documented explicitly).
>
> **Codemod budget unchanged at 560 LOC** — all six RATIFY-now amendments are strictly additive (existing .aihu files keep working). Compiler/runtime grows ~200-280 LOC over r3's projection; well within scope.
>
> **Builder seam plan: 5 rounds, at the iteration ceiling.** B1: $prop reactivity fix (canonical first). B2: $lifecycle/$show/$bind small additive. B3: Variant B template syntax + codemod (largest round). B4: $aria + auto-keyboard. B5: $controller (depends on B1). Branch convention: `feat/template-syntax-v2` parent, `-b1`...`-b5` sub-branches; final merge as one Variant-B-as-shipped commit.
>
> **Synthesizer is in flight with stale categorization** (instructed before your scope adjustment); Team Lead patches the master audit doc + topic_summary post-landing per r4 §6.
>
> **Go/no-go:** "Ratify the 6 round-3 amendments (R1-R6), accept the 5-round Builder seam plan with the proposed branch convention, and dispatch B1 ($prop reactivity fix) — yes/no?"

(Word count: 296.)

---

## §8 — Continuity check

Round 4 of governance. **Two user-directed scope adjustments this session:**
- r2: variant choice (user picked Variant B over Architect's Variant A recommendation, which was a substantive value-weighting shift).
- r4: ratify-now expansion (D2 + D3 → R5 + R6, lifting two sugar proposals from v0.4 into the v0.3 ship).

Both well-grounded:
- r2's variant choice was justified by Prober's cold-read intelligibility data + LLM-precedent density + the user's explicit "agentic-minded" non-negotiable.
- r4's ratify-now expansion is justified by the spec-section work being already mostly designed (Auditor A owned the ElementInternals lowering; Auditor B owned the design surface) and the work-reduction interaction with v0.4 deferrals.

**The audit-driven approach is producing high-signal proposals at the cost of an extended pre-Builder phase: 4 rounds of governance + research before any Builder dispatch.**

**Flag for Historian retro:** was this the right pre-Builder cadence, or did some governance rounds add limited value? My read:
- r1 (kickoff + Scout routing): high value, set the frame.
- r2 (Architect ↔ Prober reconciliation + variant pick): high value, surfaced the category error in Architect's "harmonize" framing.
- r3 (audit reconciliation): high value, the audit changed the user-surface message materially (16/38 already-integrated headline) AND surfaced the $prop reactivity correctness bug.
- r4 (this round, scope adjustment): user-driven, low director-creativity but necessary documentation.

**Three rounds of substantive governance is justified by user-directed scope expansion.** A fourth round purely for documentation (this one) is on the edge of analysis paralysis discipline; the load-bearing justification is that Synthesizer was in flight with stale categorization at the moment of user scope adjustment, and the patches need a written record. **If Builder is not dispatched in round 5, Director re-justifies or admits the discipline trip.**

---

## §9 — Iteration discipline

Counter still **0 of 5** (Builder ↔ Verifier sense). Builder phase begins post-user-approval of this r4 directive. No iteration concerns this round.

**Re-cut threshold:**
- Architect spec base: 540 lines (under 600 — pass).
- Trigger categories: 3 of 4 (unchanged from r2 override; R5 + R6 add new collections but not new sigils/value-forms/structural-template-changes). r2 override stands.
- Codemod budget: 560 LOC (unchanged).
- Compiler/runtime LOC: ~200-280 additional (was +85-115 in r3); ~30% growth but still under per-round 500-LOC ceiling when split across B1-B5 seams.
- **No re-cut required.**

**Hard gate per Director r1 §7:** Builder dispatch blocked until user approves direction. **Reconfirmed this round.** The user-surface go/no-go in §7 is the binding question.

**Re-cut paths:**
- If user approves R1-R6 + green-lights B1: round 5 = Builder B1 dispatch; counter goes to 1/5.
- If user wants to defer one of R5/R6 back to v0.4: Director r5 with revised manifest (no re-cut needed; smaller scope).
- If user wants to lift a v0.4 deferral (D1/D4/D5/D6) into round 4 RATIFY-now: Director r5 with re-cut consideration (LOC budget approaches threshold; v0.4 deferrals are larger-scope than R5/R6).
- If user defers Variant B entirely and wants v0.4 spike first: Director r5 captures that; counter stays 0/5; new track.

---

*End of round 4 director-note. Synthesizer continues uninterrupted; Team Lead patches per §6 post-landing. STATUS line + AGENTS.delta.db record below in companion outputs.*
