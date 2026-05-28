# Migration (v0 → v1)

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

## 3. Reading a prop — use `$computed`, not a bare const (C205)

This is the migration trap most likely to bite. A prop read inside a plain `@state` `const`/`let` throws at runtime (the prop binding is emitted *after* the plain `@state` body, so the read hits a temporal-dead-zone error). The compiler surfaces this as **C205** and steers you to `$computed`, where the read happens inside a thunk:

```
// before (throws at runtime → C205)
@state {
  $prop: { name: { default: 'world', type: 'string' } }
  const greeting = `Hello, ${name()}!`   // reads a prop in a bare const
}

// after (v1)
@state {
  $prop: { name: { default: 'world', type: 'string' } }
  $computed: {
    greeting: () => `Hello, ${name()}!`   // reads the prop inside a thunk
  }
}
```

aihu deliberately does NOT re-order codegen to paper over this — the supported path is `$computed`.

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

## Diagnostic quick reference

| Code | Meaning | Fix |
|------|---------|-----|
| C107 | HTML-tag SFC framing (`<template>`, `<script setup>`) | use `@state` / `@template` / `@style` blocks |
| C204 | unknown `@block` (e.g. `@props`) | use a recognized block; declare props via `$prop:` in `@state` |
| C205 | prop read in a plain `@state` const/let (TDZ) | read the prop in `$computed: { x: () => prop() }` |
| C304 | Vue-shape `:attr=` alias | `$attr={expr}` |
| C305 | colon-form event/bind alias | `$on.click=…`, `$bind.value=…` |
| C306 | plain-curly attribute binding (`class={…}`) | `$class={…}` |
| C440 | removed v1 agent macros (`$expose`, `$describe`, …) | per-name `describe:` / `expose:` on collection entries |
| W210 | `$on.<non-event>` → dead handler | use `$html` for innerHTML, or a real event |

## See also

- [Authoring Components](#authoring-components) — the full v1 block + binding grammar, with a Common diagnostics section
- [Authoring Agents](#authoring-agents) — the v1 `@agent` surface
- [Getting Started](#getting-started) — a from-scratch v1 SFC
