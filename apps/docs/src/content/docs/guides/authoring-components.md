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

> **Grammar v2 — the prefix-less template.** One rule: naked keywords + naked HTML attributes + naked framework vocabulary. `{expr}` braces mean expression; quoted strings mean static; `$` retreats to `@state` macros only. Reactive attribute bindings are plain braces (`class={…}`, `href={…}`, `disabled={loading}`); events and two-way binds are colon directives (`on:click={…}`, `bind:value={…}`); control flow attaches to the element it governs (`if={…}`, `each={item of items}`). The entire v1 `$`-attribute layer, the Svelte-shaped block DSL and the `@html` block, `{{…}}` double braces, and the `<$…>` macro elements are hard compile errors (C601–C611), each carrying a precise fix hint. Run `npx aihu migrate <file>` to mechanically rewrite older sources.

### Text interpolation

- `{expr}` — reactive text node. Uses `nodeValue` for targeted updates (122x faster than `textContent` on targeted nodes).

### Event handlers

- `on:click={handlerName}` — attach an event listener (quoted identifier reference).
- `on:click={() => expr}` — attach an inline handler (curly expression).

A colon separates the directive from the event name: `on:<event>`. Dotted modifiers compose behavior: `on:click.prevent`, `on:submit.once` (supported: `.prevent`, `.stop`, `.self`, `.once`).

### Two-way binding

- `bind:value={signalName}` — two-way bind a writable signal to a form element. The name after the colon is the bound property: `bind:value`, `bind:checked`, etc.

### Conditional rendering

- `if={cond}` — remove/insert the element based on a boolean signal or expression.
- `elseif={cond}` / `else` — chain onto the **immediately preceding** `if`/`elseif` element sibling (only whitespace/comments may sit between — C610 otherwise).
- `show={cond}` — toggle visibility without removing from DOM.
- Wrap multi-element branches in `<group>` — the invisible fragment carrier.

### List rendering

- `each={item, i of items}` — render a list, item-first (`<binder> [, <index>] of <list-expr>`). Destructuring binders work: `each={[k, v] of entries}`. Pair with `key={…}` for stable reconciliation, and put `empty` on the immediately following sibling for the empty state:

```html
<li each={todo of todos} key={todo.id}>{todo.text}</li>
```

### HTML output

- `html={expr}` — render raw HTML from an expression (trusted content only).

### Memoization and DOM stability

- `key={expr}` — key for list reconciliation (pairs with `each`).
- `memo={expr}` — memoize a subtree; only re-renders when expr changes.
- `once` — boolean attribute; renders once and never re-renders.
- `raw` — boolean attribute; verbatim element, no macro processing.

### Class bindings

- `class={cond ? 'active' : ''}` — reactive whole-string class expression.
- `class:active={cond}` — per-class toggle; composes with a static `class="…"` base list (the toggle is authoritative when both address the same name).

### Special elements

**`<slot>`** — inserts slotted children provided by the parent:

```html
<slot name="header" />
```

Use `expose` to pass context to slot consumers:

```html
<!-- In UserList.aihu -->
<slot name="row" expose="user, index">
  <!-- default content -->
</slot>
```

**`<suspense>`** — wraps an async resource with a loading fallback:

```html
<!-- Simple: fallback attribute (component name) -->
<suspense fallback="Skeleton">
  <UserProfile />
</suspense>

<!-- Context-aware: slot form -->
<suspense>
  <UserProfile />
  <slot name="fallback">
    {loadAttempts > 3 ? <SlowConnection /> : <Spinner />}
  </slot>
</suspense>
```

The `fallback` attribute takes a component name (quoted string); `fallbackProps` may be added for static props. `fallback` attribute and `<slot name="fallback">` are mutually exclusive.

**`<shield>`** — isolates a subtree behind an error boundary:

```html
<shield>
  <UserProfile />
  <slot name="fallback">
    <ErrorPage error="shield.error" retry="shield.retry" />
  </slot>
</shield>
```

Exposes `shield.error` (Error) and `shield.retry` (function) to the fallback slot.

**`<guard>`** — conditionally renders based on an auth scope:

```html
<guard scope="admin" fallback="UnauthorizedPage">
  <AdminPanel />
</guard>
```

Attributes: `scope` (scope-name), `permissions`, `rateLimit`, `fallback` (component-ref), `redirect` (path), `onDeny` (function-ref). Exposes `guard.user`, `guard.reason`, `guard.path` to the fallback slot.

**`<warp>`** — renders children into a portal target:

```html
<warp to="#modal-root">
  <div>Portal content</div>
</warp>
```

### Attribute value forms

Every attribute value must be in one of two forms — bare unquoted values are forbidden:

```
✗ <button on:click=save>            ← parse error (bare value)
✓ <button on:click={save}>          ← handler reference
✓ <button on:click={() => save()}>  ← inline handler expression
```

Some attributes are boolean-only (present-or-absent): `once`, `raw`, `else`, `empty`, `disabled`, `required`, etc.

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

### Reading a `$prop` in a bare `@state` const

Reading a prop inside a plain `@state` `const`/`let` **compiles** — the prop getter (`const name = ctx.props.name`) is hoisted above the `@state` body, so there is no temporal-dead-zone hazard. (An earlier compiler release rejected this with a `C205` error on the premise that the binding was emitted *after* the body; that ordering was fixed and the diagnostic retired.)

The remaining reason to prefer `$computed` is reactivity, not compilation: a bare `const` captures the prop's value **once** at setup and never updates, whereas `$computed` re-reads the prop inside a thunk and stays reactive:

```
// compiles, but greeting is captured once and will not track prop changes
@state {
  $prop: { name: { default: 'world', type: 'string' } }
  const greeting = `Hello, ${name()}!`
}

// reactive — re-reads the prop whenever it changes
@state {
  $prop: { name: { default: 'world', type: 'string' } }
  $computed: {
    greeting: () => `Hello, ${name()}!`
  }
}
```

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

### W210 — `on:<non-event>` (use `html` for innerHTML)

`on:<name>` referencing anything that is not a real DOM event compiles to a dead `on<name>` handler that never fires; the compiler warns with **W210**. To set raw HTML reactively, use the `html` attribute, not an `on:` binding:

```
// ✗ W210 — on:innerHTML is not a DOM event → dead handler
<div on:innerHTML={markup}></div>

// ✓ use the html attribute
<div html={markup}></div>
```

For the full v0 → v1 mapping of every diagnostic, see the [Migration guide](migration.md).
