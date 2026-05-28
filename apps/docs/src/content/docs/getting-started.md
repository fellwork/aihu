# Getting Started

## Hello World walkthrough

After scaffolding (see [Installation](installation.md)), open `src/pages/index.aihu`. The scaffolded template uses the v2 macro vocabulary:

```
@state {
  $prop: {
    name: { default: 'world', type: 'string' }
  }
}

@template {
  <div>Hello {name}</div>
}

@route {
  path: /
  name: home
}
```

### The `@state` block

`@state` declares the reactive state for the component using the v2 collection-form macro vocabulary. Each macro keyword takes an object whose keys are entry names.

**Props** — declared with `$prop`. Every entry must have at least a `default` or `type` key:

```
@state {
  $prop: {
    name: { default: 'world', type: 'string' }
  }
}
```

Props are reactive and can be set from outside the component as HTML attributes. Add `expose: { read: true, write: true }` to expose a prop to the agent surface.

**Computed values** — declared with `$computed`. The bare form uses a thunk:

```
@state {
  $prop: {
    name: { default: 'world', type: 'string' }
  }

  $computed: {
    greeting: () => `Hello, ${name()}!`
  }
}
```

**Actions** — declared with `$action`. Bare form is a handler function; the wrapped form adds `describe` and `expose` metadata:

```
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)

  $action: {
    increment: {
      describe: 'Add 1 to the counter',
      expose: { read: true, write: true },
      handler: () => setCount(count() + 1),
    },
  }
}
```

**Effects** — anonymous effects use the bare function form:

```
@state {
  $effect: () => { console.log('count changed') }
}
```

Named effects (with optional dependency pinning) use the collection form:

```
@state {
  $effect: {
    logCount: () => { console.log(count()) },
  }
}
```

### The `@template` block

`@template` defines the component's DOM structure using aihu's template DSL:

- `{expr}` — interpolates a reactive expression. Updates use `nodeValue` for 122× faster targeted writes.
- `$href={expr}` — binds an HTML attribute reactively (`$`-prefixed curly; one per attribute).
- `$on.click="handler"` — attaches an event listener.
- `$show` — toggles visibility based on a boolean signal.
- `$each` — renders a list of items.

> **Amendment 04 (v1.0.8).** Reactive HTML attribute bindings must be `$`-prefixed (`$class={…}`, `$href={…}`). Plain-curly attributes (`class={…}`, error **C306**), the colon-form event/bind aliases (**C305**), and the Vue-shape `:attr=` alias (**C304**) are hard parse errors in v1.0. HTML-tag SFC framing (`<template>`, `<script setup>`) is rejected as **C107**. Run `npx aihu migrate <file>` to upgrade older sources.

### The `@agent` block

`@agent` declares the component's cross-cutting agent metadata. In v2, per-property `describe` and `expose` keys live on the `@state` entries directly. The `@agent` block holds only scope and rate-limit constraints:

```
@agent {
  $scope 'counter'
  $rate-limit 60
}
```

### The `@route` block

`@route` registers the component as a page route:

```
@route {
  path: /
  name: home
}
```

During build, the Rust compiler emits a `.route.json` sidecar alongside each compiled SFC. `viteRouterIntegration()` in `vite.config.ts` reads these sidecars at build time and assembles the route manifest into `virtual:aihu-routes` — route manifests are fully static after build with no filesystem scanning at runtime.

### HMR in development

Edit `src/pages/index.aihu` and the browser updates live — no full reload. Vite watches `.aihu` files; when you save, only the affected reactive subtree is re-evaluated.

## A complete example: live counter

The canonical minimal SFC (from `examples/live-counter/live-counter.aihu`):

```
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)

  $action: {
    increment: {
      describe: 'Add 1 to the counter',
      expose: { read: true, write: true },
      handler: () => setCount(count() + 1),
    },
    decrement: {
      describe: 'Subtract 1 from the counter',
      expose: { read: true, write: true },
      handler: () => setCount(count() - 1),
    },
    reset: {
      describe: 'Reset the counter to 0',
      expose: { read: true, write: true },
      handler: () => setCount(0),
    },
  }
}

@template {
  <section class="counter">
    <h1>Count: {count}</h1>
    <div class="controls">
      <button $on.click="decrement">-</button>
      <button $on.click="reset">Reset</button>
      <button $on.click="increment">+</button>
    </div>
  </section>
}

@style {
  .counter { display: grid; gap: 0.75rem; padding: 1.5rem; }
  button   { flex: 1; padding: 0.5rem 0.75rem; cursor: pointer; }
}
```

This is ~40 LOC, has an agent surface (all three actions are agent-callable), and uses only signals from `@aihu/signals` directly in `@state`.

## Next steps

- [Authoring Components](authoring-components.md) — full reference for `@state`, `@template`, `@style`, and `@agent` blocks.
- [Reactivity](reactivity.md) — the `signal`, `computed`, and `effect` primitives from `@aihu/signals`.
- [Authoring Agents](authoring-agents.md) — how to expose component state and actions to AI agents via MCP.
