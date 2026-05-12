# aihu CSS Engine + Primitives + UI — Design

**Status:** Draft
**Date:** 2026-05-10
**Repo:** fellwork/aihu
**Scope:** A hard-fork of Tailwind v4 plus a primitive UI library and a shadcn-style registry, all integrated into the existing aihu monorepo and CLI.

---

## 1. Context

aihu today ships the reactive meta-framework: `.aihu` SFC compiler, signals, arbor, runtime, CLI, MCP, data layer. What it lacks is a **visual layer** — a CSS framework and primitive UI library that consumers reach for when building real applications. Today's `apps/docs` ships a hand-written 1,094-line `style.css` and three bespoke `.aihu` components scoped to the docs site. There is no reusable design system, no primitive component library, no integrated styling pipeline.

This spec defines that layer:

1. **`@aihu/css-engine`** — a hard fork of Tailwind v4. Owns the CSS engine, design tokens, variant emission, and scoped-output mode. Replaces the existing hand-written CSS.
2. **`@aihu/primitives`** — headless Web Component primitives ported from reka-ui's API surface. Provides ARIA, keyboard, and behavior; no visual styling.
3. **`@aihu/ui`** — styled recipes (the shadcn equivalent) built on `@aihu/primitives`, distributed via a `aihu add` CLI subcommand that copies source into the consumer's project.

All three packages live under `@aihu/*` and integrate into the existing `aihu` CLI as new subcommands.

The fork is *hard* — we diverge and own the engine. We do not vendor + rebase; we maintain the engine independently and take upstream Tailwind only as inspiration.

## 2. Foundation

- **Tailwind v4** source (Apache 2.0 / MIT) is the starting point for the engine fork. We retain the utility-class language, `@theme` directive, and variant syntax; we replace the scanner and emitter.
- **Rust + Cargo** workspace already exists in `packages/compiler/` (with `aihu-compiler` crate). The CSS engine extends that workspace with a new `aihu-css-core` crate.
- **`@aihu/compiler`** parses `.aihu` SFCs into structured ASTs. The CSS engine consumes those ASTs directly instead of scanning files with regex — this is the core performance and correctness divergence.
- **Storybook 9 (or current)** with `@storybook/web-components` + Vite builder.
- **Chromatic** for visual regression (OSS plan, aihu being public on GitHub).
- **floating-ui** (`@floating-ui/dom`) as the positioning floor under our progressive `anchor:` variant.
- **`@internationalized/date`** for Calendar primitives (Phase 5).
- **`@tanstack/virtual-core`** for Combobox/Listbox virtualization (Phase 4).

## 3. Goals

1. Replace the hand-written `apps/docs/style.css` with the new engine + tokens, dogfooding the new stack on the existing docs site.
2. Ship a hard fork of Tailwind v4 that emits CSS scoped to Web Components' shadow DOM, reads `.aihu` ASTs directly for scanning, and bakes aihu's design tokens in as defaults.
3. Ship headless primitive ports of the comprehensive 25 reka-ui primitives, plus a Phase 0 foundation set of utility primitives, all as `.aihu` SFCs in `@aihu/primitives`.
4. Ship styled recipes for those primitives via shadcn-style `aihu add` registry CLI, with the registry source under `@aihu/ui`.
5. Unify `tailwind.config.ts`, `components.json`, PostCSS config, and framework config into a single extended `aihu.config.ts`.
6. Storybook stories + Chromatic visual regression gate every shipped recipe before it merges.
7. Hit a measurable performance bar: < 200ms cold compile, < 30ms incremental compile, on a 50-SFC fixture project — a 10–25× improvement over vanilla Tailwind v4 on the same workload.

## 4. Non-goals (v1)

- No support for React, Vue, Svelte, or any non-Web-Component consumer framework. The class-extension model in §9 makes future adapters possible; we do not ship them.
- No external/third-party registries. The `aihu.config.ts → ui.registries` slot is schema-reserved but unimplemented; v1 consumes `@aihu/ui` only.
- No blocks (composite UI patterns like login forms, dashboards). The `type: 'block'` schema slot is reserved; v1 ships zero block content.
- No anchor positioning as a primary mechanism. We layer it as a progressive enhancement over floating-ui; we do not require it.
- No XState or formal state-machine library. Primitive state is `Ref`s in context with mutation methods, per reka-ui's proven pattern.
- No animation library beyond CSS view transitions (gated as progressive). Motion One or similar is deferred to Phase 3+.
- No i18n library integration. The single string-bearing primitive in v1 scope (Calendar in Phase 5) uses `@internationalized/date`; a broader i18n strategy is deferred.
- No marketing brand for the engine fork beyond `@aihu/css-engine`. A consumer-facing name can be picked during dogfooding; engineering does not depend on it.

## 5. Architecture overview

### 5.1 Workspace layout

Three new packages added to the aihu monorepo:

```
aihu/
├── packages/
│   ├── compiler/                   (existing — Rust + WASM SFC compiler)
│   ├── cli/                        (existing — extended with new commands)
│   ├── server/                     (existing — AihuConfig extended)
│   ├── data/                       (existing — reactive resources)
│   ├── signals/                    (existing — reactive primitives)
│   ├── css-engine/                 (NEW)
│   │   ├── src/                    TS layer: defineConfig, plugin types, programmatic compile
│   │   ├── crates/aihu-css-core/   Rust workspace: scanner, emitter, variant resolver
│   │   ├── runtime/                @aihu/css-engine/runtime — cn(), progressive shim
│   │   └── styles/                 Token CSS bundles: aihu-default.css, aihu-graphite.css
│   ├── primitives/                 (NEW)
│   │   └── src/                    Phase 0 utilities + reka-ported headless primitives
│   └── ui/                         (NEW)
│       └── registry/               Source files copied by `aihu add`
└── apps/
    ├── docs/                       (existing — dogfoods the new stack)
    └── storybook/                  (NEW — Storybook + Chromatic)
```

### 5.2 Package responsibilities

| Package | Purpose | Distribution |
|---|---|---|
| `@aihu/css-engine` | CSS engine fork, design tokens, scoped-output mode | Installable dep |
| `@aihu/css-engine/runtime` | `cn()` helper, progressive-features JS shim | Bundled with engine; tree-shakeable |
| `@aihu/primitives` | Headless WC primitives (reka-ui port) | Installable dep — classes only, no global tag registration |
| `@aihu/ui` | Styled recipe registry | Source copied via `aihu add`; consumers own the source |

### 5.3 Merge point

`@aihu/ui` recipes consume `@aihu/primitives` for behavior + `@aihu/css-engine` for styling tokens. The recipe `.aihu` files extend primitive classes and register them under consumer-chosen tag names (default prefix `aihu-`). This is where the parallel CSS-engine and primitive-port tracks converge.

## 6. CSS engine (`@aihu/css-engine`)

### 6.1 What we vendor from upstream Tailwind v4

- The Rust Oxide engine source (CSS generation core)
- The utility class language: `bg-*`, `text-*`, `border-*`, `rounded-*`, `flex-*`, etc.
- Variant syntax: `hover:`, `dark:`, `md:`, `[&>div]:`, etc.
- The `@theme` directive for token definitions
- The arbitrary-value bracket syntax: `bg-[#1a1d24]`, `w-[34ch]`
- License: MIT inherited from Tailwind; our additions also MIT.

### 6.2 What we rewrite

**The scanner.** Tailwind v4's Oxide scans files with regex/parser to find class names. We replace that with an **AST-consuming scanner** that reads structured ASTs from `@aihu/compiler`. The compiler already parses `.aihu` SFCs and distinguishes class attributes from reactive bindings (`$class:active={...}`) from string literals. Reading the AST is both faster and *correct* in ways regex cannot match.

**The config loader.** Extended to support unified `aihu.config.ts` (§6.6 below).

### 6.3 What we add — the WC-native divergences

**First-class shadow-DOM variants:**

| Variant prefix | Emits | Purpose |
|---|---|---|
| `host:` | `:host { ... }` | Style the custom element from inside its own shadow tree |
| `host-context-dark:` | inherited custom-property cascade (NOT `:host-context(.dark)`) | Cross-browser dark mode without Firefox-incompatible `:host-context()` |
| `slotted:` | `::slotted(...) { ... }` | Style slotted child content |
| `slotted-img:` | `::slotted(img) { ... }` | Slotted-child element-typed selectors |
| `part-*:` | `::part(name) { ... }` | Style named parts on the host |

**Scoped-output mode.** Each `.aihu` SFC's utility classes compile into CSS *embedded in that component's shadow DOM*. There is no global utility stylesheet shared across components. Bundle size drops because unused utilities never leak between components.

**Baked-in aihu tokens.** The default `@theme` ships aihu's brand tokens (extracted from the current `apps/docs/style.css`). Consumers get sensible light + dark theme defaults without writing config. Consumer `@theme` blocks override per-token.

### 6.4 Rust/TS split

- **Rust crate `aihu-css-core`** — the engine: scanner traits, utility generation, variant resolution, output emission. Lives in the same Cargo workspace as `aihu-compiler`. Shares fixtures + `insta` snapshot tests. Builds to native binary + WASM (for dev-tool integrations).
- **TS layer in `src/`** — public API: programmatic `compile()` entry, plugin types, integration with the `aihu` CLI commands. Thin wrapper that calls into the Rust core.

### 6.5 Performance optimizations

Concrete wins enabled by the fork's premises:

| Optimization | Why it works | Expected impact |
|---|---|---|
| Skip global stylesheet emission | Scoped-output mode means there's no shared stylesheet to build | Removes the largest single compile phase |
| Drop legacy vendor prefixes | Baseline is Chrome 113+/Safari 16.4+/Firefox 113+ | ~15–20% smaller output CSS, faster emitter |
| Drop `@supports` fallback chains | Same baseline reasoning | Simpler emitter, smaller output |
| Native CSS nesting in output | Baseline supports CSS nesting natively | Simpler emitter, slightly smaller output |
| `oklch()` emitted directly | Baseline supports it; no `rgb()` fallback | Better color quality, smaller output |
| AST-hashed per-SFC compilation cache | AST from compiler → hash → cache CSS by hash | Incremental rebuilds ~O(1) for unchanged SFCs |
| Rayon-parallel SFC compilation | Scoped mode makes each SFC independent | Multi-core scaling for large projects |
| Memoized utility expansion | `bg-accent` always expands to the same CSS | Hot-path constant-factor improvement |

**Target:** 10–25× faster cold compile on a 50-SFC project vs. vanilla Tailwind v4. **Near-instant incremental** (sub-30ms) for single-file edits.

### 6.6 Unified `aihu.config.ts`

The hard fork lets us collapse `tailwind.config.ts`, `postcss.config.js`, `components.json`, and the existing aihu config into one file. New fields extend `AihuConfig` in `@aihu/server`:

```typescript
// aihu.config.ts
export default defineAihuConfig({
  // existing fields (unchanged)
  rendering: { mode: 'ssr' },
  build:     { target: 'universal' },

  // NEW — replaces tailwind.config.ts
  theme: {
    extend: {
      colors: { brand: '#c8543a' },  // overrides baked aihu tokens
    },
    darkMode: 'class',
  },

  // NEW — replaces components.json
  ui: {
    registry: '@aihu/ui',            // source registry to pull from
    target:   './src/components',    // where `aihu add` copies sources
    style:    'aihu-default',        // active style pack
    prefix:   'aihu',                // custom-element prefix (configurable)
    registries: {},                  // RESERVED for v2 multi-registry support
  },

  // NEW — lockfile-style primitive version tracking
  primitives: {
    button: '^1.0.0',
    dialog: '^1.0.0',
  },

  // NEW — progressive-feature toggles (§6.7)
  features: {
    viewTransitions:   'auto',  // 'auto' | 'always' | 'never'
    anchorPositioning: 'auto',
    textWrapBalance:   'auto',
  },
})
```

PostCSS config disappears entirely — the engine handles its own pipeline. Type-checked end-to-end via TS.

### 6.7 Progressive features

The engine ships a built-in **progressive-features registry** so primitive authors write one line; the engine emits `@supports` wrapping, JS dispatch, and fallback emission.

**Authoring API — declarative variant prefix:**
```css
.dialog-content { @apply view-transition:scale-fade }
.popover        { @apply anchor:right-of-trigger }
.headline       { @apply text-balance: }
```

**Built-in feature registry (v1):**

| Variant prefix | Detection | Fallback | Cost |
|---|---|---|---|
| `view-transition:` | `@supports (view-transition-name: x)` | No-op (instant swap) | Pure CSS gate |
| `anchor:` | `@supports (anchor-name: --x)` + JS dispatch | floating-ui shim | ~2 KB runtime shared across primitives |
| `text-balance:` | None — CSS silent-ignores | Default wrapping | Zero |
| `popover:` | `@supports (popover: auto)` + JS dispatch | floating-ui shim + portal helper | Shares runtime with anchor |

**Engine internals:**
- Rust trait `ProgressiveFeature` defines `name`, `detect_css`, `detect_js`, `fallback_emitter`. Adding a new progressive feature: one trait impl + a registry registration.
- One shared runtime module emitted per build (`@aihu/css-engine/runtime/progressive.js`). Primitives import from it so floating-ui shim isn't duplicated.
- `aihu css doctor` surfaces active features and which primitives use them.

**Consumer config tri-state:**
- `'auto'` (default) — emit feature-gated CSS, use fallback when needed
- `'always'` — unwrap `@supports` gates, ship raw modern CSS (smaller output, consumer asserts support)
- `'never'` — strip modern emission, use fallback only (testing the floor)

### 6.8 Browser baseline

| Browser | Minimum supported | Released |
|---|---|---|
| Chrome / Edge | 113 | April 2023 |
| Safari | 16.4 | March 2023 |
| Firefox | 113 | May 2023 |

Three-year window from May 2026. Codified in:
- `package.json` `browserslist` on each new package
- Engine emitter — never produces vendor prefixes or `@supports` shims for features in-baseline
- Documentation — explicit support statement, no apology

**Features we use freely:** `:has()`, `:is()`, `:where()`, container queries, CSS nesting, `oklch()`, `color-mix()`, `backdrop-filter`, custom property cascade, `<dialog>` + `showModal()`, Constructable Stylesheets, Declarative Shadow DOM.

**Features held as progressive enhancement only:** anchor positioning, View Transitions, Popover API, `text-wrap: balance`.

**The `:host-context()` Firefox gap:** Firefox does not support `:host-context()`. The engine standardizes on **inherited CSS custom property cascade** for theming instead. The `dark:` variant compiles to custom-property toggles in the consumer's `:root` / `.dark` scope, not `:host-context` selectors. This works across all three browsers, performs better, and supports nested themes.

### 6.9 Style packs

Recipes use semantic token names (`bg-primary`, `text-muted-foreground`, `border-input`) — never raw color values. The mapping lives in a **style pack**, a single CSS file shipped by `@aihu/css-engine`:

```css
/* @aihu/css-engine/styles/aihu-default.css */
@theme {
  --color-primary:            oklch(0.55 0.22 28);
  --color-primary-foreground: oklch(0.98 0 0);
  /* ... full token map ... */
}
@theme dark {
  --color-primary:            oklch(0.7 0.2 28);
  --color-primary-foreground: oklch(0.15 0 0);
}
```

Consumers select active style pack via `aihu.config.ts → ui.style`. **No recipe changes when style packs swap.** This mirrors shadcn-ui's v2025 architectural shift away from duplicated component trees toward token-driven style variation.

**v1 ships two style packs:** `aihu-default` (extracted from current aihu brand tokens), `aihu-graphite` (monochrome variant; exact oklch values TBD during Phase 1).

**Extension hook:** `@aihu/css-engine` exports `defineStylePack()` so external orgs can ship their own.

## 7. Primitives (`@aihu/primitives`)

The reka-ui *API surface* ports; reka-ui's *implementation* doesn't. Vue's reactivity becomes aihu signals; Vue slots become Web Component slots; we exploit native browser primitives wherever Web Components let us replace JS with platform features.

### 7.1 Port mapping

| Layer | Reka-ui (Vue) | Aihu (Web Components) |
|---|---|---|
| Component naming | `<DialogRoot>`, `<DialogTrigger>` | `<dialog-root>`, `<dialog-trigger>` (recipes prefix per consumer config) |
| ARIA/DOM structure | Direct port | Direct port — same roles, same `data-state` attributes |
| Keyboard interactions | Reka behavior spec | Same logic; some replaced by native `<dialog>` / Popover API |
| Reactivity | Vue `ref`/`computed` | aihu `signal`/`computed` |
| Cross-piece state | Vue `provide`/`inject` | `createContext()` returning `[inject, provide]` pair, Symbol-keyed, DOM-walk lookup |
| Portaling | Vue Teleport (all cases) | Three-layer: native `<dialog>` for modals, Popover API + floating-ui for menus, fixed-position for toasts |

### 7.2 Authoring pattern: anatomy of a headless primitive

Each primitive is a `.aihu` SFC. Headless primitives have **empty or minimal `@style` blocks** — they own behavior, ARIA, and DOM structure, not appearance.

Example — Dialog (three pieces):

```aihu
<!-- packages/primitives/src/dialog/dialog-root.aihu -->
@state {
  import { signal } from '@aihu/signals'
  import { DialogContext } from './context'

  const [open, setOpen] = signal(false)
  const [provideDialogContext, _] = DialogContext.use(this)
  provideDialogContext({ open, setOpen })
}

@template {
  <slot />
}

@meta {
  name: 'dialog-root'
  pieces: ['dialog-trigger', 'dialog-content', 'dialog-close', 'dialog-title', 'dialog-description']
}
```

```aihu
<!-- packages/primitives/src/dialog/dialog-trigger.aihu -->
@state {
  import { DialogContext } from './context'
  const [_, injectDialogContext] = DialogContext.use(this)
  const dialog = injectDialogContext()
}

@template {
  <button
    type="button"
    aria-haspopup="dialog"
    $aria-expanded={dialog.open()}
    $data-state={dialog.open() ? 'open' : 'closed'}
    $on.click={() => dialog.setOpen(true)}>
    <slot />
  </button>
}
```

```aihu
<!-- packages/primitives/src/dialog/dialog-content.aihu -->
@state {
  import { effect } from '@aihu/signals'
  import { DialogContext } from './context'

  const [_, injectDialogContext] = DialogContext.use(this)
  const dialog = injectDialogContext()
  let dialogEl = null

  // Native <dialog> gives us focus trap, ESC, click-outside, top-layer free
  effect(() => {
    if (!dialogEl) return
    if (dialog.open() && !dialogEl.open)  dialogEl.showModal()
    if (!dialog.open() &&  dialogEl.open) dialogEl.close()
  })
}

@template {
  <dialog
    $ref={dialogEl}
    role="dialog"
    aria-modal="true"
    part="dialog"
    $data-state={dialog.open() ? 'open' : 'closed'}
    $on.close={() => dialog.setOpen(false)}>
    <slot />
  </dialog>
}
```

### 7.3 Cross-piece composition: `createContext`

Adopting reka-ui's pattern, ported to Web Components:

```typescript
// @aihu/primitives/context.ts
export function createContext<T>(name: string) {
  const key = Symbol(`aihu-context-${name}`)

  return {
    use(host: HTMLElement) {
      const provide = (value: T) => { (host as any)[key] = value }
      const inject = (): T => {
        let el: HTMLElement | null = host
        while (el) {
          if (key in el) return (el as any)[key]
          el = el.parentElement
        }
        throw new Error(`${name} context: no provider in ancestor chain`)
      }
      return [provide, inject] as const
    }
  }
}

// usage:
export const DialogContext = createContext<{ open: Signal<boolean>; setOpen: (v: boolean) => void }>('Dialog')
```

**Why DOM-tree walk, not module registry:** survives multiple roots on the same page, nested compositions, and SSR/hydration. The DOM is the source of truth.

### 7.4 Portaling & focus: three-layer strategy

| Primitive | Mechanism | Reason |
|---|---|---|
| Dialog, AlertDialog, Sheet | Native `<dialog>` + `showModal()` | Browser owns top-layer, focus trap, ESC, click-outside |
| Popover, DropdownMenu, Tooltip, Combobox dropdown | `popover:` progressive variant + floating-ui floor | Popover API in modern browsers; floating-ui fallback |
| Toast / Sonner | Fixed-position container at `document.body` end | No focus management needed; just stacking context |

The engine's `popover:` progressive variant (§6.7) handles dispatch. Primitives don't write portal logic — they declare `popover-of="..."` attributes and the runtime resolves.

### 7.5 ARIA conformance contract

Each primitive ships:
- `accessibility.md` — explicit mapping: WAI-ARIA APG pattern → DOM structure → keyboard map → screen reader behavior
- `accessibility.test.ts` — Playwright tests asserting accessibility-tree snapshots match via `@axe-core/playwright`
- `keyboard.test.ts` — keyboard interaction tests via `@testing-library/user-event`

**Graduation gate:** a primitive stays `-rc` until its accessibility tests pass against the relevant WAI-ARIA APG pattern. Non-negotiable. This is the contract that justifies porting reka-ui rather than inventing our own.

### 7.6 Phase 0 foundational utilities

These ship *before* Phase 1 — they're infrastructure that other primitives depend on:

| Primitive | Purpose |
|---|---|
| `presence-gate` | Exit-animation orchestrator (listens to `animationstart`/`end`/`cancel`, defers unmount). Port of reka-ui's `Presence`. |
| `form-control` | Visually-hidden native input for form participation. `closest('form')` detection. |
| `config-provider` | Root-level RTL/direction/locale signal provider |
| `roving-focus` | Reusable keyboard traversal helper (port of reka's `RovingFocus`) |
| `collection` | Sibling registration helper (port of reka's `Collection`) |

Plus the `createContext` utility module from §7.3 and the `cn()` runtime from §6.

### 7.7 Phase rollout — comprehensive 25 plus foundation

| Phase | Primitives |
|---|---|
| 0 | `presence-gate`, `form-control`, `config-provider`, `roving-focus`, `collection`, `createContext` utility |
| 1 | Button, Dialog, Tooltip (proves: utility composition, native-modal handoff, popover dispatch) |
| 2 | Input, Textarea, Label, Checkbox, Switch, RadioGroup, Separator |
| 3 | Popover, DropdownMenu, Sheet, AlertDialog, Accordion, Tabs |
| 4 | Select, Combobox, Toast, Alert, Avatar, Card, Badge, Skeleton |
| 5 | Calendar, DatePicker, Form (validation wrapper) |

Big-bang Track B runs Phase 0 + Phase 1 in parallel with the CSS engine fork (Track A). Phases 2–5 layer on as the engine stabilizes; each gets its own follow-up spec + plan.

## 8. State strategy

### 8.1 Data state — fully stateless

Primitives never own application data. They have no awareness of fetching, persistence, caching, or stores. The contract:

```
Consumer app ──data──→ Primitive ──events──→ Consumer app
              ↑                              ↓
              └──────── round trip ─────────┘
```

- Inputs come in via attributes/properties: `<select-root :value="user.role">`
- Changes go out via events: `<select-root @value-change="handleRoleChange">`
- Whatever sits between (signals, `@aihu/data` resources, fetched values, hard-coded constants) is the consumer's responsibility

### 8.2 UI state — uncontrolled by default, controlled mode opt-in

Pure stateless for UI state is hostile DX. Every primitive supports both modes:

| Mode | When consumer writes... | Where state lives |
|---|---|---|
| Uncontrolled (default) | `<dialog-root>` with no `open` attribute | Internal signal inside the primitive instance |
| Controlled (opt-in) | `<dialog-root open={signal()} @open-change={handler}>` | Consumer's signal — primitive is a pure view |
| Default value (init only) | `<dialog-root default-open="true">` | Internal signal, seeded once |

Pattern (identical across all stateful primitives):

```typescript
const [internalOpen, setInternalOpen] = signal(props.defaultOpen ?? false)

const isOpen  = computed(() => props.open !== undefined ? props.open : internalOpen())
const setOpen = (next: boolean) => {
  if (props.open === undefined) setInternalOpen(next)
  props.onOpenChange?.(next)
}
```

The `!== undefined` check distinguishes "consumer didn't provide" from "consumer provided false."

### 8.3 Per-layer state ownership

| Layer | Mechanism | Examples |
|---|---|---|
| Primitive UI state | `@aihu/signals` inside the primitive instance | Open/closed, focused index, hover, active tab |
| Cross-primitive coordination | `createContext` signals (§7.3) | Trigger reads Root's `open` signal |
| Form value coordination | `form-control` hidden input + `closest('form')` | `<select-root>` submits like native `<select>` |
| Consumer app data | `@aihu/data` OR `@aihu/signals` in app code OR anything | Fetched user, current route, server state |
| Persistent state | Consumer's storage layer | Never the primitive's job |

### 8.4 Imperative escape hatch

Every primitive exposes its key state as **properties on the element instance** (Web Components-native pattern, free):

```typescript
const dialog = document.querySelector('dialog-root')
dialog.open                  // getter
dialog.open = true           // imperative set (triggers same flow as attribute)
dialog.addEventListener('open-change', e => { ... })
```

## 9. Styled recipes (`@aihu/ui`)

### 9.1 Distribution model — shadcn-style registry

Recipes get copied into the consumer's project via `aihu add <name>`. Primitives stay a normal versioned dep (not copied). Consumers own and customize their copied recipe source.

### 9.2 Recipe anatomy

```aihu
<!-- @aihu/ui/registry/button/button.aihu -->
@meta {
  name: 'aihu-button'
  variants: {
    variant: ['default', 'destructive', 'outline', 'ghost', 'link']
    size:    ['sm', 'md', 'lg', 'icon']
  }
  slots: ['button']
}

@state {
  import { cn } from '@aihu/css-engine/runtime'
  const props = $props
  const variant = props.variant ?? 'default'
  const size    = props.size    ?? 'md'
}

@template {
  <button
    type="button"
    data-slot="button"
    $data-variant={variant}
    $data-size={size}
    $disabled={props.disabled}
    class={cn('aihu-button', props.class)}>
    <slot />
  </button>
}

@style {
  .aihu-button {
    @apply inline-flex items-center justify-center
           rounded-md font-medium select-none
           transition-colors disabled:opacity-50 disabled:pointer-events-none;
  }

  .aihu-button[data-variant="default"]     { @apply bg-primary text-primary-foreground hover:bg-primary/90 }
  .aihu-button[data-variant="destructive"] { @apply bg-destructive text-destructive-foreground hover:bg-destructive/90 }
  .aihu-button[data-variant="outline"]     { @apply border border-input bg-background hover:bg-accent }
  .aihu-button[data-variant="ghost"]       { @apply hover:bg-accent hover:text-accent-foreground }
  .aihu-button[data-variant="link"]        { @apply text-primary underline-offset-4 hover:underline }

  .aihu-button[data-size="sm"]   { @apply h-8  px-3 text-xs }
  .aihu-button[data-size="md"]   { @apply h-9  px-4 text-sm }
  .aihu-button[data-size="lg"]   { @apply h-10 px-8 text-sm }
  .aihu-button[data-size="icon"] { @apply h-9  w-9 }
}
```

**Engine-side compile-time work:**
- Reads `@meta.variants` → generates `button.d.ts` with typed props
- Scans `@style` → emits only used utilities, scoped to this SFC's shadow DOM
- Validates `[data-variant="x"]` selectors match values declared in `@meta.variants` — typos caught at build time
- Emits custom element registration

### 9.3 The `cn()` runtime

Shipped from `@aihu/css-engine/runtime`. ~20 lines, no deps. The property map is **generated at engine build time** from the utility-class registry — when a new utility is added, the merger knows. No `tailwind-merge` dependency, no missed-utility bugs.

### 9.4 Custom element prefix — configurable

Web Components spec requires a hyphen in tag names. The prefix is the consumer's choice:

```typescript
// aihu.config.ts
ui: {
  prefix: 'aihu',  // default; produces <aihu-button>
  // prefix: 'acme',  // → <acme-button>
}
```

```bash
aihu add button --prefix acme        # one-off override
aihu rename --from aihu --to acme    # sweep existing recipes
```

The CLI's transformer pipeline substitutes during copy. After copy, the consumer's source has hard-coded tag names they fully own.

**The class-extension trick** prevents global tag-name conflicts. Primitives in `@aihu/primitives` export *classes*; they don't register tags. Recipes extend the class and register under the prefix-dependent name:

```typescript
import { DialogRootElement } from '@aihu/primitives/dialog'

class AihuDialogRoot extends DialogRootElement {
  // styling, slot tagging, variant handling
}
customElements.define(`${PREFIX}-dialog-root`, AihuDialogRoot)
```

This also enables Phase 4+ rename and future React/Vue adapters.

### 9.5 Registry schema (v1)

```typescript
type RegistryItemType = 'ui' | 'block' | 'style' | 'theme' | 'lib'

interface RegistryItem {
  name:                  string
  type:                  RegistryItemType
  description?:          string
  files:                 RegistryFile[]
  dependencies?:         string[]
  registryDependencies?: string[]
  variants?:             VariantMap
  meta?:                 Record<string, unknown>
}

interface RegistryFile {
  path:   string
  source: string
  type:   'component' | 'style' | 'lib' | 'block'
}
```

| Type | What it is | Examples |
|---|---|---|
| `ui` | Single styled recipe | `button`, `dialog`, `input` |
| `block` | Composite recipe (multiple `ui` items) | `login-form`, `dashboard-shell` (post-v1) |
| `style` | CSS-only token bundle | `aihu-default`, `aihu-graphite` |
| `theme` | Style + matching typography config | `aihu-default-serif` (post-v1) |
| `lib` | Standalone TS helper module | `use-clipboard.ts`, `date-utils.ts` |

The structurally allowed `registries: {}` field in `aihu.config.ts` exists but is unimplemented in v1.

### 9.6 The `aihu add` CLI

New subcommands on the existing `aihu` binary:

```bash
aihu add button                         # add one recipe
aihu add button dialog input            # add several
aihu add login-form                     # block — pulls registry deps
aihu add --style aihu-graphite          # add a style pack
aihu add button --dry-run               # show what would be written
aihu add button --diff                  # show diff against existing file
aihu add --update                       # re-pull tracked primitives at pinned versions
aihu list                               # show available items
aihu list --installed                   # show what consumer has + version
aihu rename --from aihu --to acme       # sweep tag names
aihu css build                          # explicit engine build
aihu css doctor                         # progressive-features audit
```

CLI flow:
1. Read `aihu.config.ts → ui.{registry, target, prefix}`
2. Resolve registry items + their `registryDependencies` transitively
3. Preflight: check for collisions in target dir
4. Write files via transformer pipeline (handles prefix substitution, import alias resolution)
5. Update `aihu.config.ts → primitives` lockfile section
6. Print "added N files."

### 9.7 Per-recipe rollout

Recipe phases lag primitive phases by one (recipes depend on primitives):

| Phase | Recipes |
|---|---|
| 1 | `aihu-button`, `aihu-card`, `aihu-badge`, `aihu-separator` |
| 2 | `aihu-dialog`, `aihu-tooltip`, `aihu-input`, `aihu-label`, `aihu-textarea`, `aihu-checkbox`, `aihu-switch` |
| 3 | `aihu-popover`, `aihu-dropdown-menu`, `aihu-tabs`, `aihu-accordion`, `aihu-sheet`, `aihu-alert-dialog`, `aihu-radio-group`, `aihu-avatar` |
| 4 | `aihu-select`, `aihu-combobox`, `aihu-toast`, `aihu-alert`, `aihu-skeleton`, `aihu-form` |
| 5 | `aihu-calendar`, `aihu-date-picker` |
| post-v1 | Blocks: `login-form`, `dashboard-shell`, `data-table`, etc. |

## 10. Testing & quality gates

Six test surfaces, in priority order. Each surface has a gate that blocks merge.

### 10.1 Visual regression — top priority

Promoted from "Phase 2+ optional" to **Phase 1 mandatory.** Visual diffs catch what other tests miss: spacing drift, color shifts, focus-ring inconsistency, hairline misalignment, dark-mode contrast bugs, animation jank.

**Tool:** Chromatic. Aihu is public on GitHub → Chromatic OSS plan (free; ~5K snapshots/month allotment).

**Matrix per canonical story:**

| Axis | Values | Count |
|---|---|---|
| Browser | Chromium, WebKit, Firefox | 3 |
| Style pack | `aihu-default`, `aihu-graphite` | 2 |
| Theme mode | light, dark | 2 |
| Viewport | desktop 1280×720, mobile 375×667 | 2 |

**Full matrix per canonical story = 24 screenshots.** Variant-specific stories (`Hover`, `Focus`, `Disabled`, `KeyboardOpen`) test against single canonical config (1 screenshot each).

**Required visual stories per primitive (graduation gate):**

- `Default` — full matrix
- `Variants` — full matrix
- `States` — full matrix
- `Hover` — canonical
- `Focus` — canonical
- `Disabled` — canonical
- `DarkMode` — canonical
- For overlays: `Open` — full matrix
- For overlays: `OpenWithLongContent` — canonical

**CI flow:**
- `bun run build-storybook` produces static build
- `bunx chromatic --project-token $TOKEN --auto-accept-changes main` uploads + diffs
- PR check fails if unapproved diffs exist
- Reviewer approves in Chromatic UI; PR check goes green
- Baselines auto-update on merge to main

**Animation handling:** Chromatic disables CSS animations by default. Stories specifically testing animation set `parameters: { chromatic: { delay: 500 } }` to capture final state. Each animation-bearing primitive gets a separate `ReducedMotion` story for motion-sensitive users.

### 10.2 Storybook play functions (interaction tests)

Every shipped recipe + primitive ships `.stories.ts` co-located. Play functions exercise behavior via `@storybook/test` (Testing Library + Vitest matchers + Playwright runner).

**Required stories per primitive (subsumes the §10.1 visual requirements):**

| Story | Required for | Coverage |
|---|---|---|
| `Default` | All | Basic render; autodocs primary |
| `Variants` | Recipes with variant matrix | One render per `@meta.variants` value |
| `States` | Stateful primitives | One render per state |
| `<Interaction>FiresHandler` | Anything that emits events | Play asserts event fires |
| `KeyboardActivation` | Anything keyboard-operable | Tab, Enter, Space, arrows, Escape, Home, End per APG |
| `FocusManagement` | Overlay primitives | Focus trap on open, return on close, ESC dismissal |
| `FormParticipation` | Form primitives | `closest('form')` submission carries value |
| `RTLBehavior` | Anything with directional keyboard nav | Arrow keys flip in `dir="rtl"` |
| `DarkMode` | All recipes | Renders correctly with `.dark` on documentElement |

**Required-story-set CI gate:** a script reads `@meta` for each recipe + primitive, asserts the matching stories exist. Missing required story → blocked merge.

### 10.3 ARIA / axe automated checks

`@storybook/addon-a11y` runs axe-core against every story automatically. Failed axe checks block merge. This subsumes the standalone Playwright + `@axe-core/playwright` setup proposed earlier.

### 10.4 Engine emitter snapshots (Rust)

`packages/css-engine/crates/aihu-css-core/tests/` uses `insta` snapshot tests for emitter output. Fixture: `.aihu` SFC. Snapshot: emitted scoped CSS. Catches regressions in utility expansion, variant compilation, progressive-feature gating, tree-shaking.

```rust
#[test]
fn emit_button_scoped_css() {
    let sfc = load_fixture("button.aihu");
    let output = engine::compile(&sfc, &default_style_pack());
    insta::assert_snapshot!(output);
}
```

Matches `@aihu/compiler`'s existing `insta` conventions; same review workflow (`cargo insta review`).

### 10.5 Recipe portability (fresh-project harness)

A Playwright harness creates a temp aihu project, runs `aihu add <recipe>` against the local registry, builds the project, asserts the recipe renders correctly across browsers. Catches CLI bugs and any drift between registry source and what consumers actually receive.

### 10.6 Performance benchmarks

`packages/css-engine/bench/` (matching aihu's existing `bench/` pattern):
- Cold compile time across a 50-SFC fixture project
- Incremental compile time for single-file edits
- Output CSS size per recipe at each style pack
- AST cache hit rate

Benchmarks run on every PR; regressions > 10% block merge.

### 10.7 Per-package size budgets

New rows added to `.size-limit.json`:

| Package | Budget (gzipped) |
|---|---|
| `@aihu/css-engine` Rust core | n/a — emitted, not bundled |
| `@aihu/css-engine/runtime` | < 1 KB |
| `@aihu/primitives` total | < 4 KB tree-shakable per primitive |
| `@aihu/ui` | n/a — source-distributed |

## 11. Open decisions

These are deliberately unfrozen at spec time; the implementation plan surfaces the right moment to decide each.

| Decision | Why deferred |
|---|---|
| Marketing brand for the engine (a "Powered by ___" name) | Engineering name `@aihu/css-engine` doesn't depend on it. Pick during first dogfooding pass. |
| Exact token values in `aihu-graphite` style pack | Design exercise during Phase 1 |
| Whether Dialog uses slot-default or named slots for header/body/footer | Decide during Phase 2 when Dialog actually lands |
| Animation library beyond view transitions | Phase 1–2 don't need it. Pick when Toast/AlertDialog land in Phase 3–4. |
| i18n strategy for string-bearing primitives | No string-bearing primitive ships in Phase 1–3. Decide before Phase 5 (Calendar). |
| React/Vue adapters | Not in scope for v1. Class-extension model makes this easy when demand emerges. |
| Multi-registry consumer support | Schema reserves the slot; v1 only consumes `@aihu/ui`. Lights up in v2 when a second registry exists. |
| Block content (`login-form`, `dashboard-shell`) | Schema supports `type: 'block'`; v1 ships zero blocks. Build them once primitives are mature. |
| Reka's expanded surface (Color*, Editable, Rating, Splitter, Stepper, Tree, etc.) | All post-v1. Architecture supports adding them. |
| `aihu css doctor` output destination (stdout vs file) | Decide when the command has content worth ferrying. |

## 12. First-milestone scope

The follow-up implementation plan detail this milestone task by task.

### 12.1 Track A — CSS engine fork

- Fork Tailwind v4 source into `packages/css-engine/`
- Rust crate `aihu-css-core` in the shared workspace with `aihu-compiler`
- AST-consuming scanner (reads from `@aihu/compiler` output)
- `@theme` directive with aihu brand tokens as baked default
- Scoped-output mode emitter
- WC-native variants: `host:`, `host-context-dark:` (inherited custom-property cascade), `slotted:`, `part-*:`
- Progressive features: `view-transition:`, `anchor:`, `text-balance:`, `popover:`
- `cn()` runtime helper (`@aihu/css-engine/runtime`)
- Engine integration into `aihu` CLI: `aihu css build`, `aihu css doctor`
- Two style packs: `aihu-default`, `aihu-graphite`

### 12.2 Track B — primitives & registry

- `packages/primitives/` with Phase 0 utility set:
  - `presence-gate`, `form-control`, `config-provider`, `roving-focus`, `collection`
  - `createContext` utility module
- `packages/primitives/` Phase 1 primitives: Button, Dialog, Tooltip
- `packages/ui/registry/` with Phase 1 recipes:
  - `aihu-button`, `aihu-card`, `aihu-badge`, `aihu-separator`
- `aihu add` subcommand with `--dry-run`, `--diff`, `--prefix`
- `aihu rename` subcommand
- `aihu.config.ts` extended with `theme`, `ui`, `primitives`, `features` fields

### 12.3 Testing & documentation infrastructure

- Storybook 9 workspace at `apps/storybook` with `@storybook/web-components` + Vite builder
- `@storybook/addon-a11y` + `@storybook/test-runner` wired into CI
- One example `.stories.ts` for each Phase-1 recipe demonstrating convention
- Required-story-set CI gate (script asserts mandated stories exist per recipe)
- Required-visual-story-set CI gate
- Chromatic project configured, project token in GitHub Actions secrets
- GitHub Action `visual.yml` running Chromatic on every PR + post-merge to main
- Baseline visual snapshots for Phase-1 recipes across full matrix (~78 screenshots per recipe)
- `docs/css-engine/` — architecture, divergences, baseline, variant authoring
- `docs/primitives/` — pattern guide, context/composition, four Phase-0 utilities
- `docs/ui/` — four Phase-1 recipes with live examples
- Updated `apps/docs` migrating at least one existing page from hand-written `style.css` to the new engine

### 12.4 Acceptance criteria

This first milestone ships when:

- All four Phase-1 recipes render correctly across Chromium/Firefox/WebKit with 0 axe violations
- `aihu add button --prefix acme` successfully installs `<acme-button>` in a fresh project
- Engine emits a 50-SFC fixture project in < 200ms cold, < 30ms incremental
- Per-package size budgets pass
- `apps/docs` builds with the new engine replacing the existing hand-written `style.css` for at least one page
- Chromatic baselines established and CI gate active for the four Phase-1 recipes
- Required-story-set CI gate passes — every recipe has its mandated functional + visual coverage
- Required-visual-story-set CI gate passes

Subsequent phases (Phase 2 primitives + recipes, then 3, 4, 5) get their own specs + plans, each iterating against the foundation built here.

## 13. Anti-goals

Enthusiasm traps to resist mid-build:

- **Don't generalize beyond Web Components in v1.** The class-extension model makes future React/Vue adapters cheap; building them now diffuses focus.
- **Don't ship blocks in v1.** Block content (`login-form`, etc.) is post-launch. Building them now risks under-baking primitives that need to change as we learn.
- **Don't ship the full 25 primitives in the first milestone.** Phase 1 = 3 primitives + 4 recipes. The big-bang is concurrent CSS engine + primitive tracks, *not* "build everything at once."
- **Don't reach for a state machine library.** Reka-ui's 60+ primitives prove that refs + context + context methods scale. Reaching for XState is the boomerang.
- **Don't reach for CVA / clsx / tailwind-merge as deps.** Our engine has compile-time access; the ~20-line `cn()` is owned in-house.
- **Don't pick a marketing brand for the engine before dogfooding.** Engineering name is `@aihu/css-engine`; ergonomics don't depend on naming.
- **Don't add a third style pack to v1.** Two is enough to prove the architecture. Community packs can ship via `defineStylePack()` post-launch.
- **Don't add anchor positioning as a required feature.** Progressive enhancement only. Floating-ui is the floor.
- **Don't relax the visual-regression gate to "we'll do it after we ship."** This is the most important test surface; that's why it's mandatory from Phase 1.
- **Don't override the WAI-ARIA APG patterns for "better UX."** Reka-ui's behavior maps are the contract; deviating means breaking screen-reader workflows users depend on.

## 14. References

- Tailwind v4 — upstream source we fork from. License: MIT.
- Reka-ui (formerly Radix Vue) — primitive API surface we port. Repository: github.com/unovue/reka-ui.
- shadcn-ui — registry CLI architecture and recipe distribution model we mirror. Repository: github.com/shadcn-ui/ui.
- Web Components specs: Custom Elements v1, Shadow DOM v1, ARIA in HTML.
- WAI-ARIA Authoring Practices Guide (APG) — primitive behavior contracts.
- `floating-ui` — positioning engine under our progressive `anchor:` variant.
- `@internationalized/date` — locale/timezone foundation for Phase 5 date primitives.
- aihu existing specs: `2026-04-23-aihu-v0-vertical-slice-design.md`, `2026-05-05-spec-live-binding.md`, etc. — establish the SFC compiler, signals, and runtime that this design builds on.
