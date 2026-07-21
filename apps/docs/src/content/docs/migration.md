# Migration (v0 → v1 → v2)

aihu v1 (shipped 2026-05-03, grammar Amendment 04 at v1.0.8) finalized the `.aihu` SFC grammar. Pre-v1 sources written against the older HTML-tag framing or the v0 macro forms will not compile against the current `@aihu/compiler`. This page consolidates every breaking change and maps each old form to its v1 replacement.

> **Codemod first.** Most of these are mechanical. Run `npx aihu migrate <file>` (or point it at a directory) to rewrite pre-v1.0.8 sources automatically, then read the rest of this page for the cases the codemod flags but cannot resolve. Under the hood this is `migrateFile` / `migrateFiles` from `@aihu/cli`.

## 1. Block framing — no HTML tags (C107)

v0 SFCs used HTML-tag framing (`<template>`, `<script setup>`, `<style>`). v1 uses `@blockname { … }` blocks. HTML-tag framing is rejected as **C107**.

```
// before (v0)
<script setup>
  const [count, setCount] = signal(0)
</script>
<template>
  <button>{count}</button>
</template>

// after (v1)
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
}
@template {
  <button>{count}</button>
}
```

The only recognized top-level blocks are `@state`, `@template`, `@style`, `@agent`, `@route` (plus the deprecated-but-valid `@layout` shorthand). Any other `@<name>` block is an unknown-block error (**C204**) — including `@props`, whose hint steers you to declare props via `$prop:` inside `@state`.

## 2. Props — `@props` → `$prop:` inside `@state` (C204)

There is no `@props` block. Declare props with the `$prop:` collection form inside `@state`:

```
// before (v0)
@props {
  name: { default: 'world', type: 'string' }
}

// after (v1)
@state {
  $prop: {
    name: { default: 'world', type: 'string' }
  }
}
```

## 3. Reading a prop — prefer `$computed` for reactive derivations

Reading a prop inside a plain `@state` `const`/`let` **compiles** — the prop getter is hoisted above the `@state` body, so there is no temporal-dead-zone error. (An earlier release rejected this with a `C205` error; that codegen ordering was fixed and the diagnostic retired.) The reason to still prefer `$computed` is reactivity: a bare `const` captures the prop's value once at setup and never updates, while `$computed` re-reads it inside a thunk and stays reactive:

```
// compiles — but greeting is captured once and will not track prop changes
@state {
  $prop: { name: { default: 'world', type: 'string' } }
  const greeting = `Hello, ${name()}!`   // reads a prop in a bare const
}

// reactive derivation (recommended)
@state {
  $prop: { name: { default: 'world', type: 'string' } }
  $computed: {
    greeting: () => `Hello, ${name()}!`   // reads the prop inside a thunk
  }
}
```

## 4. Reactive attribute bindings — `$`-prefixed (C304 / C305 / C306)

Amendment 04 requires every reactive HTML attribute binding to be `$`-prefixed. The old aliases are hard parse errors:

| Old form | v1 form | Error if left unmigrated |
|----------|---------|--------------------------|
| `:href="expr"` (Vue-shape colon attr) | `$href={expr}` | **C304** |
| `:on` + colon-form event/bind aliases | `$on.click=…`, `$bind.value=…` | **C305** |
| `class={cond ? 'a' : ''}` (plain curly attr) | `$class={cond ? 'a' : ''}` | **C306** |

Component prop-passing keeps the plain-curly form (`<UserCard user={u} />`) and is unaffected.

## 5. Raw HTML — `$html` (W210)

To set element innerHTML reactively, use the `$html` binding — not an `$on.<name>` handler against a non-event:

```
// wrong — $on.innerHTML is not a DOM event → W210 (dead handler)
<div $on.innerHTML="markup"></div>

// right
<div $html="markup"></div>     // or $html={expr}
```

`$on.<name>` referencing anything that is not a real DOM event compiles to a dead `on<name>` handler that never fires; the compiler warns with **W210**.

## 6. Agent surface — per-name `describe:` / `expose:` (C440)

The v0 `@agent`-level macros are removed. `$expose`, `$expose.write`, agent-bare `$action`, and `$describe` are rejected with **C440**. Agent metadata now lives as per-name keys on the `$prop` / `$computed` / `$action` / `$resource` collection entries:

```
// before (v0 → C440)
@agent {
  $expose count
  $describe "the counter"
}

// after (v1)
@state {
  $action: {
    increment: {
      describe: 'Add 1 to the counter',
      expose: { read: true, write: true },
      handler: () => setCount(count() + 1),
    },
  }
}
```

`@agent` now holds only cross-cutting declarations (`$scope`, `$rate-limit`).

## 7. Migration (v1 → v2) — the macro-vocabulary pass

v2 (spec 2026-05-05, "macro vocabulary v2") collapses the per-declaration `$macro name …` forms inside `@state` into **collection form** — one `$<macro>: { … }` object per macro kind — and finishes the `@agent` fold-in started in §6. Sources written against the transitional v1 forms fail with **C440** (retired `@state`/`@agent` macro forms), **C001** (`unknown keyword` inside `@agent`), or **C500** (quoted-form `$`-attr reserved for built-ins).

**Codemod first, again.** The macro-simplification codemod is wired into the CLI:

```sh
npx aihu migrate --v2 <files...>          # v0→v1 passes, then the v1→v2 macro pass
npx aihu migrate --v2 --dry-run <files...>  # preview without writing
```

The same pass can be run standalone from a checkout via
`bun packages/compiler/js/codemods/macro-simplification/run-migration.ts [--dry-run] <files...>`.
Both are idempotent — re-running on already-v2 source is a no-op.

What the pass rewrites (each of these appeared in the examples corpus):

**`$lifecycle` — colon and call forms → one collection.**

```
// before (v1 — either form)
$lifecycle.mount: {
  connect()
}
$lifecycle.dispose(() => disconnect())

// after (v2)
$lifecycle: {
  mount: () => {
    connect()
  },
  dispose: () => disconnect(),
}
```

**`@agent` per-name macros → `describe:` / `expose:` on `@state` entries.** `$expose name`, `$expose name: <description>`, `$describe`, agent-bare `$action`, and ad-hoc tool declarations (`getX: { description: "…" }`) are all retired; the `@agent` block is dropped entirely when nothing but `$scope` / `$rate-limit` remains. See §6 for the target shape.

**Quoted `$let` → curly form (C500).** The quoted `$attr="…"` form is reserved for built-in macros; `$let` passes a prop value and must use the curly form:

```
// before (v1 → C500)          // after (v2)
<item-card $let="item" />      <item-card $let={item} />
```

**Curly-form DOM event handlers → `$on.<event>` (C306).**

```
// before (v1 → C306)                       // after (v2)
<button onclick={() => bump()}>+1</button>  <button $on.click={() => bump()}>+1</button>
```

### Cases the codemod cannot resolve (hand-edit)

- **`$action name: <arrow>` colon form** (e.g. `$action send: async () => { … }`) — rewrite by hand to a collection entry: `$action: { send: { describe: '…', expose: { read: true, write: true }, handler: async () => { … } } }`.
- **`@agent` metadata naming a plain `signal()` binding** — `expose:`/`describe:` attach to *collection entries* (`$prop` / `$computed` / `$action` / `$resource`). A raw `const [x, setX] = signal(…)` has no entry to carry them; either wrap the value in a `$computed` entry or accept that the name is not agent-exposed. Plain `function f() { … }` helpers that should stay agent-callable are worth converting to `$action` entries by hand.
- **Stale template macro spellings** the codemod does not own: `$attr.<name>={…}` → `$<name>={…}` (e.g. `$attr.disabled` → `$disabled`), and dot-form class toggles `$class.name={…}` → the colon-namespaced `$class:name={…}`.

## 8. The binary shadow API and light-DOM pages (the DA4 flip)

> **Breaking (major), one change with two faces.** The shadow value set collapsed to a **binary** `ShadowMode = 'light' | 'shadow'` (`'open'`, `'closed'`, and `'none'` no longer exist), **and** pages and layouts now default to `'light'`. Leaf components keep shadow DOM.

**The new vocabulary.**

- `'shadow'` → shadow DOM. Internally `attachShadow({ mode: 'open' })` — open is the **only** browser mode aihu's composition and hydration can use, which is why `'closed'` is gone rather than renamed: a closed root makes `this.shadowRoot === null`, so aihu's light-DOM detection (`shadowRoot === null`) misclassified it and content rendered into the host anyway. `this.shadowRoot` is the non-null root.
- `'light'` → no shadow root; content renders in the light DOM. `this.shadowRoot === null` — detection is now unambiguous in both directions.

Token migration is mechanical: `'open'` → `'shadow'`, `'none'` → `'light'`, `'closed'` → `'shadow'` (it never actually encapsulated in aihu). This applies to the `$shadow` macro, the plugin-global `shadowMode` config (`css: { shadowMode }` in `viteAihuPlugin` / `shadowMode` on `aihuCompilerPlugin`), the runtime's `defineElement(tag, Ctor, { shadowMode })`, and the CLI's `--shadow` flag (`light|shadow`).

**The new defaults.** Page-level components — those with an `@route` block — and layout SFCs (files under `src/layouts/`) default to `'light'`. Leaf components (buttons, inputs, design-system primitives — anything without `@route`) default to `'shadow'`. The precedence chain is:

1. An explicit `$shadow: 'light' | 'shadow'` macro always wins.
2. Otherwise, an explicit plugin-global `shadowMode` config applies.
3. Otherwise, an `@route` block makes the component a **page** — and a file under the layouts dir makes it a **layout** — → `'light'`.
4. Otherwise it is a **leaf** → `'shadow'` (behaviorally unchanged from the old `'open'` default).

**Why light-DOM pages.** AI crawlers do not execute JavaScript, so a page's primary content must reach them as server-rendered *light* DOM. Declarative Shadow DOM does not reliably fix this — spec-compliant extractors read a `<template shadowrootmode>` subtree as empty. Light DOM for page content is the structural fix, and it independently simplifies hydration.

**What to check after upgrading.**

- **Retired tokens fail loudly:** `$shadow: 'open' | 'closed' | 'none'` is now a C471 compile error; `css.shadowMode` with an old token throws at config validation; `--shadow` with an old token warns and falls back to the default.
- **A page you want back in shadow DOM:** pin it — `$shadow: 'shadow'` in `@state`. The pin outranks everything, including plugin-global config.
- **Page `@style` blocks now join the global cascade.** A light-DOM page's authored styles are no longer trapped in a shadow root, so bare element selectors (`h1 { … }`, `a { … }`) apply **app-wide**. Scope them under a page root class (`<main class="my-page">` + `.my-page h1 { … }`) — this is how the repo's own examples were migrated.
- **An explicit plugin-global `shadowMode` is honored as before** — it outranks the new page/layout default (only a per-file `$shadow` pin outranks it).

**W472 is retired.** The phase-1 warning that announced this flip no longer exists: the behavior it predicted is the behavior. A `$shadow`-less `@route` page simply *is* light DOM now.

Under the hood, an unpinned page compiles with a `// @aihu:shadow-default light` marker (distinct from the `$shadow` pin marker `// @aihu:shadow <mode>`) so the Vite plugin can rank the implicit default *below* an explicit plugin-global config. New apps scaffolded with `aihu app` pin `$shadow: 'light'` on the generated index page, which is simply explicit about the default; css-engine scaffolds carry the wizard's `--shadow` choice as an explicit `css: { shadowMode }` block.

## Diagnostic quick reference

| Code | Meaning | Fix |
|------|---------|-----|
| C107 | HTML-tag SFC framing (`<template>`, `<script setup>`) | use `@state` / `@template` / `@style` blocks |
| C204 | unknown `@block` (e.g. `@props`) | use a recognized block; declare props via `$prop:` in `@state` |
| C304 | Vue-shape `:attr=` alias | `$attr={expr}` |
| C305 | colon-form event/bind alias | `$on.click=…`, `$bind.value=…` |
| C306 | plain-curly attribute binding (`class={…}`) | `$class={…}` |
| C440 | removed v1 agent macros (`$expose`, `$describe`, …) | per-name `describe:` / `expose:` on collection entries |
| C500 | quoted `$`-attr that is not a built-in macro (`$let="x"`) | curly form: `$let={x}` |
| W210 | `$on.<non-event>` → dead handler | use `$html` for innerHTML, or a real event |

## See also

- [Authoring Components](#authoring-components) — the full v1 block + binding grammar, with a Common diagnostics section
- [Authoring Agents](#authoring-agents) — the v1 `@agent` surface
- [Getting Started](#getting-started) — a from-scratch v1 SFC
