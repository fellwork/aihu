# Authoring Components

A `.aihu` Single File Component (SFC) is composed of named blocks. Each block uses the `@blockname { ... }` syntax introduced in v0.5.

## @state block

The `@state` block declares the reactive contract of the component.

### Macros

- `$prop name: Type = default` — a public property. Settable from HTML attributes. Reactive.
- `$computed name = expr` — a derived signal. Re-evaluates when its dependencies change.
- `$resource name = fetcher(signal)` — binds an async resource to a signal. Returns a 3-state loader: `{ pending, value, error }`.
- `$effect { ... }` — runs a side effect when tracked signals change.
- `$lifecycle.mount { ... }` — runs after the component is first mounted to the DOM.
- `$lifecycle.cleanup { ... }` — runs when the component is unmounted.
- `$action name(args) { ... }` — a named action method on the component.

### Example

```
@state {
  $prop count: number = 0
  $computed doubled = count * 2
  $effect { console.log('count is', count) }
  $lifecycle.mount { console.log('mounted') }
  $action increment() { count++ }
}
```

## @template block

The `@template` block defines the DOM output using aihu's template DSL.

### Interpolation

- `{{ expr }}` — reactive text node. Uses `nodeValue` for targeted updates.

### Attribute bindings

- `$attr:name="expr"` — bind an attribute to a reactive expression.
- `$on:event="handler"` — attach an event listener.
- `$ref:name` — capture a DOM element reference into the state bag.

### Conditional rendering

- `$show="cond"` — toggle display without removing from DOM.
- `$when="cond"` ... `$else` — conditional branch; removes/inserts DOM nodes.

### List rendering

- `$each="item of list"` — render a list. Keyed by identity by default.

### Special elements

**`<$slot>`** — inserts slotted children provided by the parent:

```html
<$slot name="header" />
```

**`<$suspense>`** — wraps an async resource with a loading fallback:

```html
<$suspense source={resource} fallback={<span>Loading...</span>}>
  <span>{{ resource.value.name }}</span>
</$suspense>
```

Backed by `createSuspenseBoundary(source, fallback, loaded)` from `@aihu/arbor`.

**`<$shield>`** — isolates a subtree behind a shield boundary:

```html
<$shield>
  <template #main><div>Main content</div></template>
  <template #fallback><div>Shield fallback</div></template>
</$shield>
```

Backed by `createShieldBoundary(() => main, (shield) => fallback)`.

**`<$guard>`** — conditionally renders based on a check function:

```html
<$guard check={isAuthenticated}>
  <template #main><div>Protected content</div></template>
  <template #fallback><div>Please log in</div></template>
</$guard>
```

Backed by `createGuardBoundary(check, () => main, (guard) => fallback)`.

**`<$warp>`** — renders children into a portal target (stub in v0.5):

```html
<$warp target="#modal-root">
  <div>Portal content</div>
</$warp>
```

Backed by `createWarpBoundary(target, () => children)`.

## @style block

The `@style` block defines component-scoped styles with reactive capabilities.

- `$reactive` — marks a CSS property as driven by a signal.
- `$media` — a responsive breakpoint block.
- `$when` — conditional style application.

```
@style {
  :host {
    color: $reactive(textColor);
  }
  $media (max-width: 600px) {
    :host { font-size: 14px; }
  }
  $when (isDark) {
    :host { background: #111; }
  }
}
```

## @agent block

The `@agent` block exposes the component as an MCP agent. See [Authoring Agents](authoring-agents.md) for full details.

```
@agent {
  $expose greet(name: string) -> { message: string } "Greet a user by name"
  $scope /api/greet
  $rate-limit 100
  $describe "Greeting agent for the home page"
}
```
