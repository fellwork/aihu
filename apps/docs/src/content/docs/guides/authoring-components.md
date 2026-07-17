# Authoring Components

A `.aihu` Single File Component (SFC) is composed of named blocks. Each block uses the `@blockname { ... }` syntax.

## @state block

The `@state` block declares the reactive contract of the component. All macros use the **v2 collection-form**: each macro keyword appears at most once per `@state` block and takes a single object whose keys are entry names.

### Macros

**`$prop`** — a public, reactive property settable from HTML attributes. Always wrapped (bare form forbidden).

```
$prop: {
  name: {
    default: value,
    type?: "TypeAnnotation",   // required when default can't carry the TS type
    describe?: "human-readable description",
    expose?: { read?: true, write?: true }
  }
}
```

Use `expose: { read: true }` to expose the prop value to agents. Add `write: true` to also allow agents to set it.

---

**`$computed`** — a derived, read-only signal. Re-evaluates when dependencies change. Supports bare (no metadata) or wrapped (with metadata) form.

```
$computed: {
  // bare — value-thunk, no metadata
  name: () => expr,
  // wrapped — add describe/expose
  namedWithMeta: { value: () => expr, describe?: "...", expose?: { read?: true } }
}
```

The `type:` key is not valid for `$computed`. Annotate the thunk's return type inline when needed: `value: (): T[] => []`.

---

**`$action`** — a named method on the component. Bare (no metadata) or wrapped.

```
$action: {
  // bare handler
  doSomething: (args) => { /* body */ },
  // wrapped — add describe/expose to surface to agents
  doSomethingExposed: {
    handler: (args) => { /* body */ },
    describe?: "human-readable description",
    expose?: { read?: true, write?: true }
  }
}
```

---

**`$effect`** — runs a side effect when tracked signals change. Two valid forms per `@state` block:

```
// anonymous — macro keyword takes a single function directly
$effect: () => { /* side effect body */ }

// named collection — auto-tracks deps (bare) or explicit deps (wrapped)
$effect: {
  logData: () => { console.log(data()) },                        // bare — auto-tracks
  updateList: { on: [data], value: () => { updateList(data()) } } // wrapped — explicit deps
}
```

Both forms may coexist in the same `@state` block. Two anonymous `$effect:` lines in one block is a parse error.

---

**`$resource`** — binds an async fetcher to a reactive signal. Returns a 3-state loader: `{ pending, value, error }`. Bare or wrapped.

```
$resource: {
  // bare fetcher-thunk
  data: () => fetchUsers(),
  // wrapped — add describe/expose
  user: { value: () => fetchUser(userId), describe?: "...", expose?: { read?: true } }
}
```

---

**`$lifecycle`** — lifecycle hooks. Always bare functions; wrapped form is forbidden.

```
$lifecycle: {
  mount:   () => { /* runs after first DOM mount */ },
  dispose: () => { /* runs on unmount */ }
}
```

Only `mount` and `dispose` are valid keys. `describe`, `expose`, `value`, and `handler` are forbidden on lifecycle entries.

### Complete example

```
@state {
  $prop: {
    count: { default: 0, describe: 'Current counter value', expose: { read: true } }
  }

  $computed: {
    doubled: () => count * 2,
    isHigh: { value: () => count > 100, describe: 'True when count exceeds 100', expose: { read: true } }
  }

  $action: {
    increment: {
      describe: 'Add 1 to the counter',
      expose: { read: true, write: true },
      handler: () => { count++ }
    },
    reset: () => { count = 0 }
  }

  $lifecycle: {
    mount:   () => console.log('mounted'),
    dispose: () => console.log('unmounted')
  }

  $effect: () => { document.title = `Count: ${count}` }
}
```

### `describe:` and `expose:` — agent visibility

`describe:` and `expose:` are per-name keys on `$prop`, `$computed`, `$action`, and `$resource` entries. They replace the old `@agent`-level `$expose` and `$describe` macros (which are C440 errors in v2).

- `describe: "text"` — makes the entry visible in the agent's capability description.
- `expose: { read: true }` — the agent can read this value.
- `expose: { read: true, write: true }` — the agent can read and write this value (props, actions).

## @template block

The `@template` block defines the DOM output using aihu's template DSL.

> **Tag naming.** Components compile to native custom elements, so every component tag must normalize to a hyphenated name: multi-word PascalCase kebab-cases automatically (`<UserCard>` → `user-card`), hyphenated tags pass through lowercased, and **referencing a single-word component tag is a hard compile error (C450)** (`<Comment>`) — use a hyphenated tag (e.g. `<x-comment>`) or an explicit hyphenated `@meta name`. Full rules and examples: [Composition guide, "Tag naming"](composition.md#tag-naming).

> **Amendment 04 (v1.0.8) — `$`-prefixed reactive bindings.** Every reactive HTML attribute binding is `$`-prefixed: `$class={…}`, `$href={…}`, `$on.click=…`, `$bind.value=…`. The legacy colon-form event/bind aliases (`$on` + colon + event, error **C305**), the Vue-shape `:attr=` alias (**C304**), and plain-curly attribute bindings (`class={…}` without `$`, **C306**) are hard parse errors in v1.0. Component prop-passing (`<UserCard user={u} />`) keeps the plain-curly form and is unaffected. Run `npx aihu migrate <file>` to mechanically rewrite pre-v1.0.8 sources.

### Text interpolation

- `{expr}` — reactive text node. Uses `nodeValue` for targeted updates (122x faster than `textContent` on targeted nodes).

### Event handlers

- `$on.click="handlerName"` — attach an event listener (quoted identifier reference).
- `$on.click={() => expr}` — attach an inline handler (curly expression).

A dot separates the directive from the event name: `$on.<event>`.

### Two-way binding

- `$bind.value="signalName"` — two-way bind a writable signal to a form element. The name after the dot is the attribute: `$bind.value`, `$bind.checked`, etc.

Signal name must be a quoted identifier reference (not curly form).

### Conditional rendering

- `$if="cond"` — remove/insert element from DOM based on a boolean signal or expression.
- `$if={expr}` — curly expression form for non-signal conditions.
- `$show="cond"` — toggle visibility without removing from DOM.

### List rendering

- `$each="items as item, i"` — render a list. Uses quoted iteration syntax. Pair with `$key` for stable reconciliation:

```html
<li $each="todos as todo" $key="todo.id">{todo.text}</li>
```

### HTML output

- `$html="expr"` — render raw HTML from a signal/identifier reference.
- `$html={expr}` — render raw HTML from an expression.

### Memoization and DOM stability

- `$key="expr"` — key for list reconciliation (use inside `$each`).
- `$memo={expr}` — memoize a subtree; only re-renders when expr changes. Requires curly form.
- `$once` — boolean attribute; renders once and never re-renders.
- `$raw` — boolean attribute; treat content as raw HTML (no escaping).

### Class bindings

- `$class={cond ? 'active' : ''}` — `$`-prefixed curly expression for dynamic classes. Plain `class={…}` (no `$`) is a hard parse error (C306) in v1.0.

### Special elements

**`<$slot>`** — inserts slotted children provided by the parent:

```html
<$slot name="header" />
```

Use `expose` to pass context to slot consumers:

```html
<!-- In UserList.aihu -->
<$slot name="row" expose="user, index">
  <!-- default content -->
</$slot>
```

**`<$suspense>`** — wraps an async resource with a loading fallback:

```html
<!-- Simple: fallback attribute (component name) -->
<$suspense fallback="Skeleton">
  <UserProfile />
</$suspense>

<!-- Context-aware: slot form -->
<$suspense>
  <UserProfile />
  <$slot name="fallback">
    {loadAttempts > 3 ? <SlowConnection /> : <Spinner />}
  </$slot>
</$suspense>
```

The `fallback` attribute takes a component name (quoted string); `fallbackProps` may be added for static props. `fallback` attribute and `<$slot name="fallback">` are mutually exclusive.

**`<$shield>`** — isolates a subtree behind an error boundary:

```html
<$shield>
  <UserProfile />
  <$slot name="fallback">
    <ErrorPage error="shield.error" retry="shield.retry" />
  </$slot>
</$shield>
```

Exposes `shield.error` (Error) and `shield.retry` (function) to the fallback slot.

**`<$guard>`** — conditionally renders based on an auth scope:

```html
<$guard scope="admin" fallback="UnauthorizedPage">
  <AdminPanel />
</$guard>
```

Attributes: `scope` (scope-name), `permissions`, `rateLimit`, `fallback` (component-ref), `redirect` (path), `onDeny` (function-ref). Exposes `guard.user`, `guard.reason`, `guard.path` to the fallback slot.

**`<$warp>`** — renders children into a portal target:

```html
<$warp to="#modal-root">
  <div>Portal content</div>
</$warp>
```

### Attribute value forms

Every attribute value must be in one of two forms — bare unquoted values are forbidden:

```
✗ <button $on.click=save>            ← parse error
✓ <button $on.click="save">          ← quoted identifier reference
✓ <button $on.click={() => save()}>  ← curly expression
```

Some attributes are boolean-only (present-or-absent): `$once`, `$raw`, `disabled`, `required`, etc.

## @style block

The `@style` block defines component-scoped styles with reactive capabilities.

### `$reactive(signal)`

Binds a CSS custom property value to a signal. Updates reactively without JavaScript in the template:

```
@style {
  $global {
    :root {
      --color-primary:    $reactive(primary);
      --color-on-primary: $reactive(onPrimary);
      --color-surface:    $reactive(surface);
    }
  }
  .host { color: $reactive(textColor); }
}
```

`$global { ... }` hoists styles out of the shadow root to the document root.

### `$media(query)`

A responsive breakpoint block. Compiles to a standard `@media` rule but participates in the reactive style system:

```
@style {
  $media(max-width: 480px) {
    label { grid-template-columns: 1fr; }
  }
}
```

### Standard CSS

All standard CSS is valid inside `@style`. Styles are scoped to the component shadow root by default (unless `$global` is used).

## @agent block

The `@agent` block is a vestigial cross-cutting block. Per-name agent metadata (`describe:`, `expose:`) lives on `@state` collection entries, not here.

`@agent` now holds only two cross-cutting declarations:

```
@agent {
  $scope "user:read"     // agent permission scope
  $rate-limit 100        // requests per minute
}
```

Both are optional. The entire block may be omitted. For full agent authoring details — tool exposure, MCP compliance, and the agent capability contract — see [Authoring Agents](authoring-agents.md).

## Common diagnostics

The compiler enforces the v1 grammar with named diagnostics. The hard errors `C304` (Vue-shape `:attr=`), `C305` (colon-form event/bind alias), `C306` (plain-curly attribute binding), and `C107` (HTML-tag SFC framing) are covered by the Amendment 04 callout under [@template](#authoring-components). Three more are easy to hit and worth calling out:

### C205 — reading a `$prop` in a bare `@state` const (the common one)

A plain `@state` `const`/`let` is emitted *before* the prop bindings, so reading a prop there throws at runtime (temporal dead zone). The compiler rejects it with **C205** and steers you to `$computed`, where the read happens inside a thunk:

```
// ✗ C205 — prop read in a plain const
@state {
  $prop: { name: { default: 'world', type: 'string' } }
  const greeting = `Hello, ${name()}!`
}

// ✓ read the prop inside $computed
@state {
  $prop: { name: { default: 'world', type: 'string' } }
  $computed: {
    greeting: () => `Hello, ${name()}!`
  }
}
```

aihu does not re-order codegen to hide this — `$computed` is the supported path for any value derived from a prop.

### C204 — unknown `@block`

The only recognized top-level blocks are `@state`, `@template`, `@style`, `@agent`, `@route` (plus the deprecated `@layout` shorthand). Any other `@<name>` header is an unknown block (**C204**). The most common offender is a v0 `@props` block — the hint steers you to declare props via `$prop:` inside `@state`:

```
// ✗ C204 — there is no @props block
@props { name: { default: 'world' } }

// ✓ declare props via $prop: inside @state
@state {
  $prop: { name: { default: 'world', type: 'string' } }
}
```

### C450 — single-word component tag (custom elements need a hyphen)

A component tag (or a component's resolved name) that normalizes to a single hyphen-less word can never be a valid custom-element name, so the compiler rejects it with **C450**. `<UserCard>` kebab-cases fine (`user-card`), but `<Comment>` resolves to `comment` — no hyphen, hard error:

```
// ✗ C450 — 'Comment' resolves to 'comment', which has no hyphen
<Comment item={c} />

// ✓ use a hyphenated tag (and file stem), or set a hyphenated @meta name
<x-comment item={c} />
```

See [Composition guide, "Tag naming"](composition.md#tag-naming) for the full normalization table.

### W210 — `$on.<non-event>` (use `$html` for innerHTML)

`$on.<name>` referencing anything that is not a real DOM event compiles to a dead `on<name>` handler that never fires; the compiler warns with **W210**. To set raw HTML reactively, use `$html`, not an `$on` binding:

```
// ✗ W210 — $on.innerHTML is not a DOM event → dead handler
<div $on.innerHTML="markup"></div>

// ✓ use $html
<div $html="markup"></div>
```

For the full v0 → v1 mapping of every diagnostic, see the [Migration guide](migration.md).
