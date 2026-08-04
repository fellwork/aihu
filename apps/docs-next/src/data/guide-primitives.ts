/**
 * Primitives guide body. Ported from
 * apps/docs/src/content/docs/guides/primitives.md and SUBSTANTIALLY UPDATED —
 * the original described @aihu/primitives@0.0.1 with three Phase-1 components
 * and called the styled registry "roadmap-only". Both statements are now
 * wrong:
 *
 *   - @aihu/primitives is 0.2.1 and ships TWELVE behaviors: the original
 *     dialog/tooltip/button plus checkbox, input, label, popover, radio-group,
 *     separator, slider, switch, textarea — and `focus-trap` is now its own
 *     public subpath rather than a dialog internal.
 *   - @aihu/ui EXISTS (0.1.0) with a real registry of 40+ styled components,
 *     so "roadmap-only" is stale in the one direction that matters to a reader
 *     deciding whether to hand-roll.
 *
 * Behaviors below are verified against each primitive's own accessibility.md
 * and its exported define* signature (which vary meaningfully: defineSlider()
 * takes nothing, defineInput(tag = 'aihu-input') takes a tag, definePopover(
 * prefix = 'aihu') takes a PREFIX — a distinction the old page's uniform
 * "register with defineX()" phrasing hid).
 */
export const PRIMITIVES = `# Primitives

<strong><code>@aihu/primitives</code></strong> is a set of headless behavior primitives — WAI-ARIA APG patterns implemented as vanilla custom elements. Each emits DOM structure, ARIA wiring and <code>data-state</code> attributes, and owns its state on <code>@aihu/signals</code>.

Every primitive ships <strong>zero CSS</strong>. You style every part yourself, typically with the [css-engine](/guides/styling)'s utilities and <code>cn()</code>.

## Why headless

A headless primitive gives you the hard part — focus management, keyboard interaction, ARIA roles and relationships, open/close state — without imposing a look. Each piece reflects <code>data-state="open" | "closed"</code> and friends, so your CSS selectors drive appearance while the primitive guarantees the accessibility contract.

This mirrors the Radix/Ark root-and-pieces model: a root owns the state and provides it through a DOM-walk context; pieces inject it by walking up the real DOM, across shadow boundaries, nearest-provider-wins.

## The behaviors

### Overlays

<strong>Dialog</strong> — the APG <strong>Modal Dialog</strong> pattern. Pieces: <code>&lt;aihu-dialog-root&gt;</code>, <code>-trigger</code>, <code>-content</code>, <code>-backdrop</code>, <code>-close</code>, <code>-title</code>, <code>-description</code>. Focus trap with return-focus, Escape to close, outside-click to close when modal, and the full <code>role="dialog"</code> / <code>aria-modal</code> / <code>aria-labelledby</code> / <code>aria-describedby</code> set plus the trigger's <code>aria-haspopup</code> / <code>aria-expanded</code> / <code>aria-controls</code>. <code>defineDialog()</code>.

<strong>Popover</strong> — a <strong>non-modal</strong> disclosure. The trigger follows APG <strong>Disclosure</strong> wiring (<code>aria-expanded</code> + <code>aria-controls</code>); the panel takes the dialog role <em>without</em> <code>aria-modal</code>, and focus is not trapped. That difference is the whole point: use Popover when the page behind stays live, Dialog when it must not. <code>definePopover(prefix = 'aihu')</code> — note it takes a tag <em>prefix</em>, not a tag.

<strong>Tooltip</strong> — the APG <strong>Tooltip</strong> pattern. The trigger is <code>aria-describedby</code> the content (not labelled-by), the content is <code>role="tooltip"</code> and not focusable, Escape dismisses. Configurable <code>open-delay</code> / <code>close-delay</code> (700 / 300 ms). Placement reuses the css-engine's <code>position()</code> shim, so there is no floating-ui dependency. <code>defineTooltip()</code>.

### Form controls

<strong>Checkbox</strong> — APG <strong>Checkbox</strong>, including the tri-state <code>indeterminate</code> case. <code>&lt;aihu-checkbox-root&gt;</code> plus an <code>&lt;aihu-checkbox-indicator&gt;</code> styling hook. <code>defineCheckbox()</code>.

<strong>Switch</strong> — APG <strong>Switch</strong>. Deliberately a <em>sibling</em> of Checkbox rather than shared code: the ARIA contracts genuinely diverge (binary vs tri-state, and Enter behaves differently). <code>&lt;aihu-switch-root&gt;</code> + <code>&lt;aihu-switch-thumb&gt;</code>. <code>defineSwitch()</code>.

<strong>Radio group</strong> — APG <strong>Radio Group</strong>, built by <em>extending</em> <code>&lt;aihu-roving-focus&gt;</code>: the root <em>is</em> the roving-tabindex container. Pieces: root, <code>-item</code> (<code>role="radio"</code>), <code>-indicator</code>. <code>defineRadioGroup()</code>.

<strong>Slider</strong> — APG <strong>Slider</strong>, single-thumb. <code>defineSlider()</code>.

<strong>Input</strong> / <strong>Textarea</strong> — text controls over a shared base, wired into the form-control context below. <code>defineInput(tag = 'aihu-input')</code>, <code>defineTextarea(tag = 'aihu-textarea')</code>.

<strong>Label</strong> — label association that survives shadow boundaries, where a native <code>&lt;label for&gt;</code> would not. <code>defineLabel(tag = 'aihu-label')</code>.

<strong>Button</strong> — <code>AihuButton</code>, the APG <strong>Button</strong> pattern as a base class. On a non-native host it sets <code>role="button"</code> + <code>tabindex="0"</code> and handles Enter/Space to fire a synthetic click; a native <code>&lt;button&gt;</code> defers to native semantics. Reflects <code>aria-pressed</code>, <code>aria-disabled</code>, <code>data-state</code>, and inherits <code>disabled</code> from an ancestor form-control. It is a <em>base class</em>, not a pre-registered tag — extend it, or register a concrete element with <code>defineButton(tag)</code>.

<strong>Separator</strong> — <code>role="separator"</code> with orientation. <code>defineSeparator(tag = 'aihu-separator')</code>.

## Substrates

The lower-level pieces the behaviors compose on. Use them directly when building your own:

| Primitive | Subpath | Role |
|-----------|---------|------|
| DOM context | <code>@aihu/primitives/context</code> | Live ancestor-traversal context. The root-to-piece coordination mechanism. Self-contained — does <strong>not</strong> import <code>@aihu/context</code>. |
| Focus trap | <code>@aihu/primitives/focus-trap</code> | Tab-cycle containment with return-focus. Its own subpath, so you can trap focus without a dialog. |
| Presence gate | <code>@aihu/primitives/presence-gate</code> | Holds children mounted through an exit transition. |
| Roving focus | <code>@aihu/primitives/roving-focus</code> | Roving-<code>tabindex</code> management for composite widgets, configurable orientation. |
| Collection | <code>@aihu/primitives/collection</code> | Ordered registration of descendant items. |
| Config provider | <code>@aihu/primitives/config-provider</code> | Propagates <code>colorScheme</code> / <code>density</code> / <code>direction</code> to descendants. |
| Form control | <code>@aihu/primitives/form-control</code> | Shared label / description / validity wiring, plus the <code>disabled</code> context descendants inherit. |

## Styling them

Primitives are unstyled, so you bring the CSS. Style each <code>data-state</code> with utilities, and merge caller overrides with <code>cn()</code>:

~~~ts
import { defineDialog } from '@aihu/primitives/dialog'
import { cn } from '@aihu/css-engine/runtime/cn'

defineDialog()

const contentClass = cn('rounded-lg p-6 bg-surface shadow-lg', userClassName)
~~~

~~~html
<aihu-dialog-root>
  <aihu-dialog-trigger>Open</aihu-dialog-trigger>
  <aihu-dialog-backdrop class="fixed inset-0 bg-black/40 data-[state=closed]:opacity-0"></aihu-dialog-backdrop>
  <aihu-dialog-content class="rounded-lg p-6 bg-surface shadow-lg">
    <aihu-dialog-title>Title</aihu-dialog-title>
    <aihu-dialog-description>Body copy.</aihu-dialog-description>
    <aihu-dialog-close>Close</aihu-dialog-close>
  </aihu-dialog-content>
</aihu-dialog-root>
~~~

The primitive guarantees the focus trap, Escape, ARIA and <code>data-state</code>; your utilities supply the look.

## When not to hand-roll

<code>@aihu/ui</code> is a registry of styled components built on these primitives — you copy a component into your project and own the source, rather than depending on a black box. If you want a styled dialog, switch or slider rather than a headless one, start there and reach for primitives when you need a behavior the registry does not cover.

## See also

- [Styling](/guides/styling) — scoped output, variants, <code>cn()</code>
- [Theming](/guides/theming) — the tokens these components consume
- [@aihu/primitives](/api/primitives) — the export tables
`
