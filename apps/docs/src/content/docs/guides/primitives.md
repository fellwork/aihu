# Primitives

**`@aihu/primitives`** is a set of headless behavior primitives — WAI-ARIA APG patterns implemented as vanilla custom elements. Each primitive emits DOM structure, ARIA wiring, and `data-state` attributes, and owns its state on `@aihu/signals`. It ships **zero CSS**: you style every part yourself, typically with the [css-engine](#styling)'s `cn()` + style packs.

> **Status:** `@aihu/primitives@0.0.1` is published. Behaviors below are available today. The styled component registry built on top of them (`@aihu/ui` / `aihu add`) is roadmap-only — see [the registry note](#styling).

## Why headless

A headless primitive gives you the hard part — focus management, keyboard interaction, ARIA roles/relationships, open/close state — without imposing any look. Each piece reflects `data-state="open"|"closed"` (and friends), so your CSS selectors drive the appearance while the primitive guarantees the accessibility contract. This mirrors the Radix/Ark "root ↔ piece" model: a root element owns the state and provides it via a DOM-walk context; the pieces inject it by walking up the real DOM (across shadow boundaries), nearest-provider-wins.

## Phase-1 components

### Dialog

The WAI-ARIA APG **Modal Dialog** pattern. Pieces: `<aihu-dialog-root>` (state owner), `<aihu-dialog-trigger>`, `<aihu-dialog-content>`, `<aihu-dialog-backdrop>`, `<aihu-dialog-close>`, `<aihu-dialog-title>`, `<aihu-dialog-description>`. Provides focus-trap + return-focus, Escape-to-close, outside-click-to-close (when modal), and `role="dialog"` / `aria-modal` / `aria-labelledby` / `aria-describedby` plus the trigger's `aria-haspopup` / `aria-expanded` / `aria-controls`. Register with `defineDialog()`.

### Tooltip

The WAI-ARIA APG **Tooltip** pattern. Pieces: `<aihu-tooltip-root>`, `<aihu-tooltip-trigger>`, `<aihu-tooltip-content>`. The trigger is `aria-describedby` the content (not labelled-by), the content has `role="tooltip"` and is not focusable, and Escape dismisses. Open/close honors configurable `open-delay` / `close-delay` (default 700 / 300 ms). Placement reuses the css-engine's `position()` shim — the tooltip carries no positioning math and adds no floating-ui dependency. Register with `defineTooltip()`.

### Button

`AihuButton` — a headless button base class implementing the APG **Button** pattern. When the host is not a native `<button>`, it sets `role="button"` + `tabindex="0"` and handles Enter / Space to fire a synthetic click; native `<button>` defers to native semantics. Reflects `aria-pressed` (toggle), `aria-disabled`, and `data-state`, and inherits `disabled` from an ancestor `form-control`. It is a base class, not a pre-registered tag — extend it or register a concrete element with `defineButton(tag)`.

## Phase-0 substrates

The lower-level building blocks the Phase-1 components compose on. Use them directly when building your own primitives.

| Primitive | Subpath | Role |
|-----------|---------|------|
| DOM context | `@aihu/primitives/context` | Live ancestor-traversal context (`createDomContext` / `provideContext` / `injectContext`) — the root↔piece coordination mechanism. Self-contained; does NOT import `@aihu/context`. |
| Presence gate | `@aihu/primitives/presence-gate` | Mount/unmount gate that holds children through an exit transition (the Radix `Presence` pattern). `definePresenceGate()`. |
| Roving focus | `@aihu/primitives/roving-focus` | Roving-`tabindex` focus management for composite widgets, configurable `Orientation`. `defineRovingFocus()`. |
| Collection | `@aihu/primitives/collection` | Ordered registration of descendant items (for lists, menus, etc.). `createCollection()` / `defineCollection()`. |
| Config provider | `@aihu/primitives/config-provider` | Propagates `colorScheme` / `density` / `direction` to descendants via context. `defineConfigProvider()`. |
| Form control | `@aihu/primitives/form-control` | Shared label/description/validity wiring + a `disabled` context that descendants (e.g. button) inherit. `defineFormControl()`. |

## Consumer pattern — `cn()` + a style pack

Primitives are unstyled, so you bring the CSS. The intended pairing is the css-engine: style each `data-state` with utility classes, and merge any runtime overrides with `cn()`.

```ts
import { defineDialog } from '@aihu/primitives/dialog'
import { cn } from '@aihu/css-engine/runtime/cn'

defineDialog()

// merge a base recipe string with a caller-provided override (last-wins)
const contentClass = cn('rounded-lg p-6 bg-surface shadow-lg', userClassName)
contentEl.className = contentClass
```

```html
<aihu-dialog-root>
  <aihu-dialog-trigger>Open</aihu-dialog-trigger>
  <aihu-dialog-backdrop class="fixed inset-0 bg-black/40 data-[state=closed]:opacity-0"></aihu-dialog-backdrop>
  <aihu-dialog-content class="rounded-lg p-6 bg-surface shadow-lg">
    <aihu-dialog-title>Title</aihu-dialog-title>
    <aihu-dialog-description>Body copy.</aihu-dialog-description>
    <aihu-dialog-close>Close</aihu-dialog-close>
  </aihu-dialog-content>
</aihu-dialog-root>
```

The primitive guarantees focus trap, Escape, ARIA, and `data-state`; your utility classes (resolved by the css-engine at build time, or merged at runtime with `cn()`) supply the look.

## See also

- [Styling](#styling) — the css-engine, `cn()`, style packs, scoped output
- [API Reference](#api-reference) — full `@aihu/primitives` export tables
