# Getting Started

## Hello World walkthrough

After scaffolding (see [Installation](installation.md)), open `src/pages/index.scribe`. The v0.8 template looks like this:

```
@state {
  $prop name: string = 'world'
}

@template {
  <div>Hello {{ name }}</div>
}

@route {
  path: /
  name: home
}
```

### The `@state` block

`@state` declares the reactive state for the component:

- `$prop name: string = 'world'` — declares a component property named `name` with a default value of `'world'`. Props are reactive and can be set from outside the component as HTML attributes.

You can add computed values and effects in the same block:

```
@state {
  $prop name: string = 'world'
  $computed greeting = `Hello, ${name}!`
  $effect { console.log('name changed to', name) }
}
```

### The `@template` block

`@template` defines the component's DOM structure using scribe's template DSL:

- `{{ expr }}` — interpolates a reactive expression. Updates use `nodeValue` for 122× faster targeted writes.
- `$attr:foo="val"` — binds an attribute reactively.
- `$on:click="handler"` — attaches an event listener.
- `$show` — toggles visibility based on a boolean signal.
- `$each` — renders a list of items.

### The `@route` block

`@route` registers the component as a page route:

```
@route {
  path: /
  name: home
}
```

During build, the Rust compiler emits a `.route.json` sidecar alongside each compiled SFC. `viteRouterIntegration()` in `vite.config.ts` reads these sidecars at build time and assembles the route manifest.

### HMR in development

In dev mode, Vite watches `.scribe` files. When you save a change, only the affected reactive subtree is re-evaluated — no full page reload needed. Edit the `name` default value or the template expression and the browser updates immediately.

## Next steps

- [Authoring Components](authoring-components.md) — full reference for `@state`, `@template`, and `@style` blocks.
- [Routing and Layouts](routing-layouts.md) — file-based routing, layouts, and middleware.
- [Reactivity](reactivity.md) — the signals, computed, and effect primitives.
