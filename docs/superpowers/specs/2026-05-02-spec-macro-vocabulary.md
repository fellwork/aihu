# Macro Vocabulary — `@aihu/compiler`

**Status:** Ratified 2026-05-02 (v1 reconciliation session)
**Spec version:** 0.1.2-draft (Amendment 01 + Amendment 02 applied inline)
**Phase:** N+M (assigned at scoping pass)
**Author:** Architect
**Depends on:** `@aihu/signals` (stable), `@aihu/arbor` (stable), `@aihu/runtime` (stable), `@aihu/data` (proposed)
**Consumes:** Block Structure Spec, Template Attribute Syntax Spec, Plugin Contract Spec
**Related specs:** Compiler Error Reference, Runtime Primitive Spec

> **Ratification note:** Migrated from `docs/spec-macro-vocabulary.md` to `docs/superpowers/specs/` on 2026-05-02. Amendment 01 (`@route` block clarification in §1) was already applied inline before migration. Original amendment doc preserved at `docs/superpowers/specs/applied-amendments/2026-05-02-AMD-01-applied.md`.

---

## 0. Posture

This spec defines the complete macro vocabulary for `.aihu` SFC files in v1. The vocabulary is closed: 38 macros across 4 blocks, fixed by language version. New macros require an RFC and version bump. Plugins MAY contribute namespaced macros (`@plugin.macro`) but those are documented in plugin specs, not here.

Each macro entry specifies:
- Block where it is valid
- Form (attribute, element, declaration, statement)
- Argument types per Template Attribute Syntax Spec §3
- Lowering: what the compiler emits
- Runtime behavior
- Error cases
- Examples

Macros are visually marked with the `$` prefix. The prefix is the discriminator between aihu macros and regular HTML, CSS, or TypeScript constructs.

---

## 1. Vocabulary Summary

| Block | Count | Macros |
|---|---|---|
| `@state` | 12 | `$prop`, `$computed`, `$resource`, `$effect`, `$effect.on`, `$watch`, `$action`, `$lifecycle.mount`, `$lifecycle.dispose`, `$expose`, `$shared`, `$cookie`, `$meta` (`$server` **retired** — see §2.12) |
| `@template` | 16 | `$if`, `$show`, `$each`, `$bind:*`, `$on:*`, `$key`, `$html`, `$raw`, `$once`, `$memo`, `$action` (form attr), `<$slot>`, `<$suspense>`, `<$shield>`, `<$guard>`, `<$warp>` |
| `@style` | 5 | `$reactive`, `$tokens`, `$global`, `$media`, `$when` |
| `@agent` | 6 | `$expose`, `$expose.write`, `$action`, `$scope`, `$rate-limit`, `$describe` |
| **Total** | **39** | |

**Note on counting:** This spec defines **38 macro forms** across **35 unique names**. Three names (`$expose`, `$action`, `$lifecycle`) appear in multiple blocks with block-determined semantics (see §1.1 below). Counting unique names: 35. Counting all forms (each block instance counted separately): 38. The "38 macros" figure used elsewhere in this spec refers to forms, not unique names. (`$server` was retired — see §2.12 — dropping both totals by one.)

**Note on `@route`:** A fifth structural block, `@route`, exists in aihu but contains no macros. It is valid only in page components (files under `src/pages/`) and contains route metadata as a TypeScript object literal. The `@route` block is documented in the Block Structure Spec §7.3; it is omitted from this spec's vocabulary because it is a structural data block, not a macro-bearing block. The "4 blocks" referenced throughout this spec refers to macro-bearing blocks (`@state`, `@template`, `@style`, `@agent`).

---

## 1.1 Block-Disambiguated Macros

Three macro names appear in multiple blocks with semantics determined by the block they appear in. The compiler infers the role from block context; no naming disambiguation is required.

### 1.1.1 `$expose`

| In block | Role | Lowering target |
|---|---|---|
| `@state` | Component-public surface (parent template refs) | `defineExpose({...})` |
| `@agent` | Agent-public surface (MCP resources) | `mcpServer.registerResource({...})` |

The two roles are orthogonal and may coexist:

```
@state {
  count: number = 0
  internal: string = 'private'
  
  $action reset() { count = 0 }
  
  $expose count, reset                  // exposed to parent component
}

@agent {
  $expose count                         // exposed to AI agents
  $action reset
  $scope authenticated
}
```

`count` is exposed in both senses: parent components can read it via template ref, AND agents can read it via MCP. The two `$expose` declarations are independent.

**Compiler inference rule:**
- `$expose` inside `@state` → emits `defineExpose`
- `$expose` inside `@agent` → emits MCP resource registration
- Same name in both blocks: both lowerings emitted; no conflict

**Validation:**
- `$expose` references in `@state` MUST be names declared in `@state`
- `$expose` references in `@agent` MUST be names declared in `@state` (agents only see component state)
- Cross-block reference (`@state` exposing something declared in `@agent`) is impossible because `@agent` declares nothing — it only references

### 1.1.2 `$action`

| In block | Role | Lowering target |
|---|---|---|
| `@state` | Declare a mutation function | `function name(...) { batch(() => {...}) }` |
| `@template` | Form submit handler attribute | `form.addEventListener('submit', ...)` |
| `@agent` | Expose action as MCP tool | `mcpServer.registerTool({...})` |

Three roles, fully disambiguated by location:

```
@state {
  $action save() { ... }                     // declares the action
  $action async createUser(data) { ... }     // declares another
}

@template {
  <form $action="createUser">                // form attr: references the action
    <input name="email" />
  </form>
}

@agent {
  $action save                               // exposes to agents as MCP tool
}
```

**Compiler inference rule:**
- `$action` as statement in `@state` → declares an action (creates a function)
- `$action` as attribute on `<form>` in `@template` → references an action (adds form handler)
- `$action` as statement in `@agent` → exposes an action as MCP tool

**Validation:**
- `$action name() { body }` syntax is only valid in `@state`
- `$action="name"` attribute is only valid on `<form>` elements in `@template`
- `$action name1, name2` reference syntax in `@agent` requires names declared in `@state`

The compiler distinguishes these forms by:
- **Block** (which block the macro appears in)
- **Position** (statement vs. attribute)
- **Form** (declaration with body vs. reference list vs. attribute value)

### 1.1.3 `$lifecycle`

| In block | Role | Lowering target |
|---|---|---|
| `@state` | Component lifecycle hook | `onMount` / `onCleanup` |

`$lifecycle` is included for completeness but currently appears in only one block. The sub-forms (`$lifecycle.mount`, `$lifecycle.dispose`) are documented in §2.8.

**Note:** This entry exists in this section because future plugins may extend `$lifecycle` to other blocks (e.g. `@agent.$lifecycle.connect` for agent connection events). Reserving the name in this section signals that future expansion is anticipated, not accidental.

---

## 1.2 Disambiguation Principles

The choice to disambiguate by block rather than by renaming follows three principles:

**1. Block context is already present in the file.** A reader sees `$expose` and immediately sees which block it's in. The block label (`@state` or `@agent`) provides the context. Renaming to `$expose-public` and `$expose-agent` would add visual noise without adding information.

**2. Conceptual unity is preserved.** "Expose" means "make this visible to a consumer." The consumer differs (parent component vs. agent), but the action is the same. Renaming would split conceptually-related macros into mechanically-related ones.

**3. Macro count stays bounded.** Disambiguation by block keeps the unique-name count at 36. Renaming would push it to 39. The vocabulary discipline (Rule 5 in the Block Structure Spec) is best served by keeping unique names low.

**The tradeoff:** Block-disambiguation requires the compiler to track block context during macro resolution. This is a small implementation cost: the parser already knows which block it's in. The cost is paid once in the compiler; the benefit (cleaner vocabulary) is paid every time a developer reads or writes a `.aihu` file.

**When to add a new name instead of disambiguating:**

If a macro's role differs *materially* between blocks (different argument types, different lowering complexity, different mental model), use a new name. The current three (`$expose`, `$action`, `$lifecycle`) all have the same mental model across blocks: "make this thing available," "do this thing," "respond to lifecycle." Future macros that lack this conceptual unity should use distinct names.

---

## 2. `@state` Block Macros

The `@state` block contains all component-internal logic. These macros declare reactive primitives, derived values, side effects, actions, and lifecycle hooks.

### 2.1 `$prop`

**Purpose:** Declare a component input from the parent.

**Form:** Declaration statement.

**Syntax:**
```
$prop name: type
$prop name: type = defaultValue
$prop name?: type           // optional, equivalent to "type | undefined"
```

**Lowering:**
```typescript
// Compiler emits at component setup:
const props = defineProps<{ name: type }>()
const name = computed(() => props.name ?? defaultValue)
```

`name` is wrapped in a computed signal so reads inside the component subscribe correctly. The compiler tracks which props are actually read in the template; unused props don't create signal subscriptions.

**Runtime behavior:**
- Reads of `name` inside `@state` or `@template` subscribe to prop changes
- The parent passes the prop value via standard component instantiation
- TypeScript types are enforced at compile time

**Error cases:**
- `$prop` outside `@state` block — error: "$prop is only valid in @state blocks"
- Missing type annotation — error: "$prop requires a type annotation"
- Default value type mismatch — TypeScript error

**Examples:**
```
@state {
  $prop title: string
  $prop count: number = 0
  $prop user?: User
  $prop config: { theme: string; debug: boolean } = { theme: 'light', debug: false }
}
```

### 2.2 `$computed`

**Purpose:** Declare a derived reactive value.

**Form:** Declaration statement.

**Syntax:**
```
$computed name = expression
$computed name: type = expression
```

**Lowering:**
```typescript
// Compiler emits:
const name = computed(() => expression)
```

The expression is wrapped in a `computed()` from `@aihu/signals`. Dependencies are auto-tracked at runtime via signal access.

**Runtime behavior:**
- Recomputes only when accessed AND dependencies have changed
- Memoized: identical recomputations return cached value
- Reads inside template subscribe the binding to the computed's value

**Error cases:**
- `$computed` outside `@state` — error
- Right-hand side has side effects (writes to other signals) — runtime error in dev mode
- Self-reference (`$computed x = x + 1`) — compile error: "computed cannot reference itself"

**Examples:**
```
@state {
  count: number = 0
  multiplier: number = 2
  
  $computed doubled = count * multiplier
  $computed greeting: string = `Hello, ${user.data?.name ?? 'guest'}`
  $computed isOverLimit = count > 100
}
```

### 2.3 `$resource`

**Purpose:** Declare an async data source with built-in loading, error, and data states.

**Form:** Declaration statement.

**Syntax:**
```
$resource name = fetcherCall(args)
$resource name: Resource<T> = fetcherCall(args)
```

**Lowering:**
```typescript
// Compiler emits:
const name = createResource(
  () => /* dependency tracker, derived from args */,
  () => fetcherCall(args)
)
```

The first argument is a key function: when it changes, the resource refetches. The compiler infers the key from the arguments to `fetcherCall`.

**Runtime behavior:**
- Resource exposes `.data`, `.loading`, `.error`, `.ready`, `.refetch()`
- On dependency change, re-runs fetcher; previous data is preserved during refetch (stale-while-revalidate)
- Reads of `.data`, `.loading`, etc. subscribe consumers to that specific aspect
- Integrates with `<$suspense>` boundary: any reads inside a suspense boundary trigger the boundary while loading

**Error cases:**
- `$resource` outside `@state` — error
- Fetcher call is not a known data plugin call — warning (no automatic key inference)
- Type annotation present without `Resource<T>` wrapper — error: "resource type must be Resource<T>"

**Examples:**
```
@state {
  $prop route: Route
  
  $resource user = data.user.query({ id: route.params.id })
  $resource posts = data.posts.list({ authorId: user.data?.id })
  $resource search = data.search.query({ q: searchTerm }) // refetches when searchTerm changes
}
```

### 2.4 `$effect`

**Purpose:** Declare a side effect that runs when its dependencies change.

**Form:** Statement.

**Syntax:**
```
$effect(() => { body })
$effect(() => body)         // single-expression form
```

**Lowering:**
```typescript
// Compiler emits:
effect(() => { body })
```

Direct passthrough to `@aihu/signals` `effect()`.

**Runtime behavior:**
- Runs immediately at component mount
- Auto-tracks dependencies: any signal read in the body causes re-run on signal change
- Cleanup: return a function to run before next execution and on dispose

**Error cases:**
- `$effect` outside `@state` — error
- Body returns a non-function (and not undefined) — warning: "effect cleanup must be a function or void"

**Examples:**
```
@state {
  count: number = 0
  
  $effect(() => {
    console.log('count changed:', count)
  })
  
  $effect(() => {
    const interval = setInterval(() => count++, 1000)
    return () => clearInterval(interval)
  })
}
```

### 2.5 `$effect.on`

**Purpose:** Declare a side effect with explicit dependencies (no auto-tracking).

**Form:** Statement.

**Syntax:**
```
$effect.on(dep1, dep2, ...) { body }
$effect.on(deps) { body }
```

**Lowering:**
```typescript
// Compiler emits:
effect(() => {
  // Read dependencies first (subscribes)
  const _d1 = dep1, _d2 = dep2
  // Then untracked body
  untrack(() => { body })
})
```

**Runtime behavior:**
- Runs when any of the listed dependencies change
- Body runs in untracked context: signals read inside the body do NOT add subscriptions
- Useful for cases where auto-tracking would over-subscribe

**Error cases:**
- Dependencies are not signals or computeds — runtime warning
- Empty dependency list — error: "$effect.on requires at least one dependency"

**Examples:**
```
@state {
  count: number = 0
  unrelated: string = ''
  
  $effect.on(count) {
    // Runs only on count change, even though unrelated is read
    console.log('count:', count, 'unrelated:', unrelated)
  }
}
```

### 2.6 `$watch`

**Purpose:** Imperative subscription to a value, with access to old and new values.

**Form:** Statement.

**Syntax:**
```
$watch(source, (next, prev) => { body })
$watch(source, (next, prev) => body)
```

**Lowering:**
```typescript
// Compiler emits:
let _prev = source
effect(() => {
  const _next = source
  if (_next !== _prev) {
    untrack(() => callback(_next, _prev))
    _prev = _next
  }
})
```

**Runtime behavior:**
- Runs callback when source changes; provides old and new values
- Does NOT run on mount (only on subsequent changes)
- Callback runs in untracked context

**Error cases:**
- Source is not a signal or computed — error
- Callback is not a function — error

**Examples:**
```
@state {
  $resource user = data.user.query({ id })
  editedName: string = ''
  
  $watch(user.data, (next, prev) => {
    if (next && next !== prev) {
      editedName = next.name
    }
  })
}
```

### 2.7 `$action`

**Purpose:** Declare a function that mutates state.

**Form:** Declaration statement.

**Syntax:**
```
$action name() { body }
$action async name() { body }
$action name(arg: type, ...) { body }
$action async name(args): ReturnType { body }
```

**Lowering:**
```typescript
// Compiler emits:
function name(...args) {
  return batch(() => {
    /* body */
  })
}
```

The body is wrapped in `batch()` from `@aihu/signals` to coalesce multiple signal writes into a single update tick.

**Runtime behavior:**
- Multiple signal writes inside the action update synchronously without intermediate effect runs
- Effects observe the final state after the action completes
- For async actions, batching applies to each synchronous block separately (between awaits)

**Error cases:**
- `$action` outside `@state` — error
- Action references undefined signal — TypeScript error
- Action shadows another action name — compile error

**Examples:**
```
@state {
  count: number = 0
  history: number[] = []
  
  $action increment() {
    count++
    history = [...history, count]
  }
  
  $action async save() {
    await api.save({ count })
    history = []
  }
  
  $action incrementBy(amount: number) {
    count += amount
  }
}
```

### 2.8 `$lifecycle.mount` and `$lifecycle.dispose`

**Purpose:** Run code at component mount and unmount.

**Form:** Statement.

**Syntax:**
```
$lifecycle.mount(() => { body })
$lifecycle.dispose(() => { body })
```

**Lowering:**
```typescript
// Compiler emits:
onMount(() => { body })   // for .mount
onCleanup(() => { body }) // for .dispose
```

These map to `@aihu/runtime` lifecycle hooks.

**Runtime behavior:**
- `mount` runs once after the component is added to the DOM
- `dispose` runs once before the component is removed
- Multiple `mount` and `dispose` blocks are permitted; they run in declaration order

**Error cases:**
- `$lifecycle.X` outside `@state` — error
- Wrong sub-form (e.g. `$lifecycle.start`) — error: "valid forms: $lifecycle.mount, $lifecycle.dispose"

**Examples:**
```
@state {
  ws: WebSocket | null = null
  
  $lifecycle.mount(() => {
    ws = new WebSocket(url)
    ws.addEventListener('message', handleMessage)
  })
  
  $lifecycle.dispose(() => {
    ws?.close()
  })
}
```

### 2.9 `$expose`

**Purpose:** Declare which values are accessible to a parent component via template ref.

**Form:** Statement.

**Syntax:**
```
$expose name1, name2, ...
$expose { name1, name2, ... }
```

**Lowering:**
```typescript
// Compiler emits:
defineExpose({ name1, name2, ... })
```

Equivalent to Vue's `defineExpose`. By default, all `@state` declarations are private to the component. `$expose` opts specific values into the public surface.

**Runtime behavior:**
- Parent components can access exposed values via template refs
- Exposed values are reactive: reads from the parent get the current value

**Error cases:**
- `$expose` outside `@state` — error
- Exposed name not declared in `@state` — error: "cannot expose undeclared name"

**Examples:**
```
@state {
  count: number = 0
  internal: string = 'private'
  
  $action reset() { count = 0 }
  
  $expose count, reset    // internal stays private
}
```

### 2.10 `$shared`

**Purpose:** Declare SSR-safe global state shared across components and survives hydration.

**Form:** Declaration statement.

**Syntax:**
```
$shared name: type = defaultValue
$shared(key) name: type = defaultValue
```

**Lowering:**
```typescript
// Compiler emits:
const name = useSharedState(key ?? 'auto-' + componentId + '-' + name, defaultValue)
```

Equivalent to Nuxt's `useState`. The state is keyed (by explicit key or auto-generated) and persists across SSR/CSR boundary via serialized hydration.

**Runtime behavior:**
- SSR: value is computed on the server and serialized in the response
- Hydration: client picks up the serialized value, no recomputation
- Client navigation: state persists across route changes if the key matches
- Multiple components with the same key share the same signal

**Error cases:**
- `$shared` outside `@state` — error
- Non-serializable default value (functions, classes) — runtime error during SSR
- Duplicate explicit key — error: "$shared key 'X' is already declared"

**Examples:**
```
@state {
  $shared currentUser: User | null = null
  $shared('cart') items: CartItem[] = []
  $shared theme: 'light' | 'dark' = 'light'
}
```

### 2.11 `$cookie`

**Purpose:** Declare a reactive binding to a cookie value.

**Form:** Declaration statement.

**Syntax:**
```
$cookie name: type
$cookie name: type = defaultValue
$cookie(options) name: type = defaultValue
```

**Lowering:**
```typescript
// Compiler emits:
const name = useCookie<type>('name', { defaultValue, ...options })
```

**Runtime behavior:**
- Reads return the cookie's current value
- Writes update the cookie and trigger reactivity
- Options include: `maxAge`, `path`, `domain`, `secure`, `sameSite`, `httpOnly`
- SSR-safe: server reads from request cookies; client reads from `document.cookie`

**Error cases:**
- `$cookie` outside `@state` — error
- Type incompatible with cookie value (cookies are strings) — compile error unless type is string or has a serializer

**Examples:**
```
@state {
  $cookie token: string = ''
  $cookie('user-prefs') prefs: { theme: string } = { theme: 'light' }
  $cookie({ maxAge: 86400 }) sessionId: string = ''
}
```

### 2.12 `$server` — **RETIRED**

> **Retired (chore/retire-server-macro).** The `$server` macro and its
> client-side `createServerCall` RPC bridge have been removed from the
> language. The feature never fully shipped: the compiler recognized
> `$server` only as a substring and, on a `--target client` build, emitted a
> `// [client build] $server macro reference elided` comment while leaving the
> `$server.*` reference untouched in the output — no server artifact and no
> `createServerCall` stub were ever generated, so the reference resolved to an
> undefined identifier at type-check / runtime. Rather than finish a
> half-wired surface, it is retired.
>
> **No drop-in replacement ships.** There is no `$server` equivalent for
> "declare an arbitrary function that runs server-only and is callable from
> the client over RPC." Server-only logic today lives in the shipped
> server-side surfaces — route/loader server code (`defineLoader`,
> `defineStreamRoute`), the governed data-access boundary
> (`createGovernedRegistry` / `defineGovernedFetch`), and `--target server`
> component emission — none of which is a 1:1 RPC replacement. **Open
> question flagged to the director:** if a first-class client→server RPC
> primitive is still wanted, it needs a fresh design; this section is retired
> plainly, not redirected to a specific successor.
>
> The historical `$server` syntax, lowering contract, and examples are
> preserved in git history and in the applied amendments
> (`applied-amendments/2026-05-02-AMD-02-applied.md`, `-AMD-03-applied.md`).

### 2.13 `$meta`

**Purpose:** Declare page metadata (title, description, OG tags, etc.).

**Form:** Statement.

**Syntax:**
```
$meta { title: 'Page Title' }
$meta { title, description, og: { ... } }
$meta(() => ({ title: dynamicTitle }))
```

**Lowering:**
```typescript
// Static form:
useHead({ title: 'Page Title' })

// Dynamic form:
useHead(() => ({ title: dynamicTitle }))
```

**Runtime behavior:**
- Static form: metadata applied at component mount
- Dynamic form: metadata is reactive; updates when dependencies change
- SSR: emitted into `<head>` of the response
- Multiple `$meta` blocks merge (later overrides earlier)

**Error cases:**
- `$meta` outside `@state` — error
- Unknown metadata field — warning (passes through but not type-checked)

**Examples:**
```
@state {
  $resource post = data.posts.get({ id: route.params.id })
  
  $meta(() => ({
    title: post.data?.title ?? 'Loading...',
    description: post.data?.excerpt,
    og: {
      title: post.data?.title,
      image: post.data?.coverImage,
    },
  }))
}
```

---

## 3. `@template` Block Macros

Template macros are either attributes on real elements or dedicated structural elements. The Template Attribute Syntax Spec (separate document) defines the value-form rules; this section defines what each macro does.

### 3.1 `$if` (attribute)

**Purpose:** Conditionally render an element and its subtree.

**Type:** `signal-ref | expression` (per Template Attribute Syntax §3.3)

**Lowering:**
```typescript
// Compiler emits:
createIfBoundary({
  path: 'computed-path-key',
  condition: () => $if-value,
  build: () => /* element subtree */,
  parent: parentEl,
})
```

`createIfBoundary` lives in `@aihu/arbor`. It manages mount/dispose of the subtree based on condition.

**Runtime behavior:**
- When condition is true, subtree is mounted
- When condition becomes false, subtree is disposed (effects cleaned up, DOM nodes removed)
- When condition becomes true again, subtree is rebuilt from scratch (no state preservation)

**Error cases:**
- Quoted form is not a known boolean signal — compile error
- On structural elements without a body — error

**Examples:**
```
<h1 $if="isVisible">Hello</h1>
<input $if={count > 0} placeholder="Enter value" />
```

### 3.2 `$show` (attribute)

**Purpose:** Toggle element visibility via CSS without DOM mount/dispose.

**Type:** `signal-ref | expression`

**Lowering:**
```typescript
// Compiler emits a CSS variable + effect:
// CSS in scoped block: .aihu-component[data-show-N="false"] { display: none }
effect(() => {
  parentEl.dataset.showN = String($show-value)
})
```

**Runtime behavior:**
- Element stays in the DOM
- `display: none` is toggled via data attribute and CSS rule
- All child effects continue running (subtree is not disposed)

**Error cases:** Same as `$if`.

**Examples:**
```
<dialog $show="isOpen">
  <p>Modal content</p>
</dialog>
```

### 3.3 `$each` (attribute)

**Purpose:** Render an element once per item in a list.

**Type:** `iteration` (string-only, per Template Attribute Syntax §3.3)

**Syntax:**
```
$each="items as item"
$each="items as item, index"
```

**Lowering:**
```typescript
// Compiler emits:
createEachBoundary({
  path: 'computed-path-key',
  list: () => items,
  key: (item) => /* from $key attr or item itself */,
  build: (item, index) => /* element subtree */,
  parent: parentEl,
})
```

`createEachBoundary` uses bitmap dispatch for diffing (per Runtime Primitive Spec).

**Runtime behavior:**
- Items added: new subtree mounted at correct position
- Items removed: subtree disposed
- Items reordered: subtrees moved (not rebuilt) when keys match
- Items mutated in place: subtree state preserved

**Error cases:**
- Iteration syntax malformed — error: "expected 'list as item' or 'list as item, index'"
- Curly form attempted — error: "$each requires quoted iteration syntax"
- List is not an array or array-like — runtime error

**Examples:**
```
<li $each="posts as post">{post.title}</li>
<li $each="users as user, i" $key="user.id">{i + 1}: {user.name}</li>
```

### 3.4 `$bind:*` (attribute)

**Purpose:** Two-way binding between an element property and a signal.

**Type:** `signal-ref` (quoted only, per Template Attribute Syntax §3.3)

**Syntax:**
```
$bind:value="signalName"
$bind:checked="signalName"
$bind:property="signalName"
```

**Lowering:**
```typescript
// Compiler emits:
effect(() => { el.value = signalName })           // signal -> DOM
el.addEventListener('input', () => {
  signalName = el.value                            // DOM -> signal
})
```

The event used (`input`, `change`, etc.) is determined by the property: `value` uses `input`, `checked` uses `change`, etc. Custom properties may require explicit configuration.

**Runtime behavior:**
- Signal changes update DOM property
- DOM events update signal
- No infinite loops: writes from the same source are deduplicated within a microtask

**Error cases:**
- Quoted value is not a writable signal — compile error
- Curly form attempted — error: "$bind requires writable signal reference"
- Property is unknown for the element type — warning

**Examples:**
```
<input $bind:value="name" />
<input type="checkbox" $bind:checked="agreed" />
<select $bind:value="selected">
  <option value="a">A</option>
  <option value="b">B</option>
</select>
```

### 3.5 `$on:*` (attribute)

**Purpose:** Attach a DOM event listener.

**Type:** `function-ref | expression`

**Syntax:**
```
$on:click="handlerName"
$on:submit={(e) => handleSubmit(e)}
$on:click.stop="handler"
$on:keydown.enter="onSubmit"
```

**Lowering:**
```typescript
// Compiler emits:
el.addEventListener('click', handler, options)
```

Event modifiers (`.stop`, `.prevent`, `.capture`, `.once`, `.passive`, key modifiers) are compiled to wrapping logic in the handler.

**Runtime behavior:**
- Standard DOM event listener
- Modifiers apply standard event handling (stopPropagation, preventDefault, etc.)
- Listener cleaned up on dispose

**Error cases:**
- Unknown modifier — warning
- Quoted value is not a function in scope — compile error

**Examples:**
```
<button $on:click="save">Save</button>
<form $on:submit.prevent="handleSubmit">
  <button type="submit">Submit</button>
</form>
<input $on:keydown.enter="onEnter" />
```

### 3.6 `$key` (attribute)

**Purpose:** Provide a stable identity for list reconciliation.

**Type:** `identifier | expression`

**Lowering:**
```typescript
// Compiler emits the key into the parent's createEachBoundary call:
createEachBoundary({
  ...,
  key: (item) => $key-value,
  ...
})
```

**Runtime behavior:**
- Used by `createEachBoundary` to match items between renders
- Items with matching keys preserve their subtree state
- Items with new keys get fresh subtrees

**Error cases:**
- `$key` on an element without an `$each` ancestor — warning: "$key has no effect outside $each"
- Duplicate keys at runtime — runtime error in dev mode

**Examples:**
```
<li $each="users as user" $key="user.id">{user.name}</li>
<Card $each="items as item" $key={item.uuid} item="item" />
```

### 3.7 `$html` (attribute)

**Purpose:** Render raw HTML content.

**Type:** `identifier | expression`

**Lowering:**
```typescript
// Compiler emits:
effect(() => { el.innerHTML = $html-value })
```

**Runtime behavior:**
- Sets innerHTML directly
- No sanitization is performed; the user is responsible for safety

**Error cases:**
- Used on a self-closing element — error
- Used alongside child content — warning: "$html overrides children"

**Security note:** This macro is the equivalent of React's `dangerouslySetInnerHTML` and Vue's `v-html`. The compiler emits a build warning when `$html` is used with non-trusted-typed content.

**Examples:**
```
<div $html="markdownContent" />
<div $html={sanitize(userInput)} />
```

### 3.8 `$raw` (attribute)

**Purpose:** Skip compilation of the element's subtree.

**Type:** Boolean-only (no value)

**Lowering:**
The compiler emits the subtree as-is, without parsing macros, attributes, or interpolations.

**Runtime behavior:**
- Subtree renders as static content
- Macros, bindings, and interpolations within are NOT processed

**Error cases:**
- `$raw` with a value — error: "$raw is boolean-only"

**Examples:**
```
<pre $raw>
  This {looks like} an interpolation but isn't.
  <button $on:click="..."> won't be compiled.
</pre>
```

### 3.9 `$once` (attribute)

**Purpose:** Render an element's subtree once, never update.

**Type:** Boolean-only (no value)

**Lowering:**
```typescript
// Compiler emits:
createOnceBoundary({
  path: 'computed-path-key',
  build: () => /* subtree */,
  parent: parentEl,
})
```

**Runtime behavior:**
- Subtree mounts once at component mount
- Never re-renders, even if signals it reads change
- No reactive subscriptions inside the subtree

**Error cases:**
- `$once` with a value — error
- Used alongside `$if` or `$show` — warning: "$once may behave unexpectedly with conditional rendering"

**Examples:**
```
<header $once>
  <h1>{title}</h1>      <!-- evaluated once at mount -->
  <Logo />
</header>
```

### 3.10 `$memo` (attribute)

**Purpose:** Memoize an element's subtree by explicit dependencies.

**Type:** `expression` (curly only)

**Syntax:**
```
$memo={[dep1, dep2]}
```

**Lowering:**
```typescript
// Compiler emits:
createMemoBoundary({
  path: 'computed-path-key',
  deps: () => [dep1, dep2],
  build: () => /* subtree */,
  parent: parentEl,
})
```

**Runtime behavior:**
- Subtree re-renders only when any dep changes (shallow equality)
- Useful for expensive subtrees that depend on a known set of values

**Error cases:**
- Quoted form attempted — error: "$memo requires curly expression"
- Empty dep array — warning: "$memo with no deps will never update"

**Examples:**
```
<ExpensiveChart $memo={[data, settings]} data="chartData" />
<ProductList $memo={[products, filterState]} items="products" />
```

### 3.11 `$action` (attribute on `<form>`)

**Purpose:** Bind a server action to a form's submit behavior.

**Type:** `function-ref | expression`

**Syntax:**
```
<form $action="serverActionName">...</form>
<form $action={(formData) => customSubmit(formData)}>...</form>
```

**Lowering:**
```typescript
// Compiler emits two artifacts (per Block Structure Spec §11.5):
// Server-side endpoint at _aihu-server/form-actions/{component-id}/{name}.ts
// Client-side handler:
el.addEventListener('submit', async (e) => {
  e.preventDefault()
  const formData = new FormData(el)
  await action(formData)
})
```

**Runtime behavior:**
- Form submission triggers the action with FormData
- Server actions (declared with `$server`) are called over RPC
- Standard HTML form behavior is suppressed (no page reload)

**Error cases:**
- Quoted name not a function — compile error
- Non-form element — error: "$action only valid on <form> elements"

**Examples:**
```
<form $action="createUser">
  <input name="email" />
  <input name="password" type="password" />
  <button type="submit">Sign up</button>
</form>
```

### 3.12 `<$slot>` (element)

**Purpose:** Children passthrough or named slot.

**Form:** Element.

**Syntax:**
```
<$slot />
<$slot name="header" />
<$slot name="header"><h1>Default</h1></$slot>
<$slot name="row" expose="user, index" />
```

**Lowering:**
```typescript
// In component definition:
const slotN = useSlot('name', defaultContent)
// At slot site:
slotN.render({ exposed: { user, index } })
```

**Runtime behavior:**
- Renders content provided by parent at the slot location
- If no parent content, renders default content (if any)
- Exposed values made available to consumer's slot template

**Error cases:**
- Multiple default slots in same component — error
- Multiple slots with same name — error
- `expose` references undefined identifier — error

**Examples:**
```
<!-- Card.aihu template -->
<article>
  <header>
    <$slot name="header">
      <h1>{defaultTitle}</h1>
    </$slot>
  </header>
  <main>
    <$slot />
  </main>
</article>

<!-- Consumer -->
<Card>
  <$slot name="header">
    <h2>Custom Title</h2>
  </$slot>
  <p>Body content</p>
</Card>
```

### 3.13 `<$suspense>` (element)

**Purpose:** Loading boundary for async data.

**Form:** Element.

**Attributes:**
| Attribute | Type | Required |
|---|---|---|
| `fallback` | `component-ref` | One of `fallback` or slot |
| `fallbackProps` | `object` | No |

**Lowering:**
```typescript
// Compiler emits:
createSuspenseBoundary({
  path: 'computed-path-key',
  fallback: () => Fallback,
  fallbackProps: () => fallbackProps,
  build: () => /* children subtree */,
  parent: parentEl,
})
```

**Runtime behavior:**
- Detects async resources read in subtree (via `Resource<T>` `.loading` and pending promises)
- While any tracked resource is loading, renders fallback
- Once all resources are ready, swaps to actual content
- Streaming SSR: renders content as soon as available, defers rendering of children that aren't ready

**Slot context:** `suspense.loading` (boolean)

**Examples:**
```
<$suspense fallback="Skeleton">
  <UserProfile />
</$suspense>

<$suspense fallback="Skeleton" fallbackProps={{ size: 'lg', delay: 300 }}>
  <Dashboard />
</$suspense>

<$suspense>
  <ContentArea />
  <$slot name="fallback">
    {loadAttempts > 3 ? <SlowLoadMessage /> : <Spinner />}
  </$slot>
</$suspense>
```

### 3.14 `<$shield>` (element)

**Purpose:** Error boundary.

**Form:** Element.

**Attributes:**
| Attribute | Type | Required |
|---|---|---|
| `fallback` | `component-ref` | One of `fallback` or slot |
| `onError` | `function-ref` | No |

**Lowering:**
```typescript
// Compiler emits:
createShieldBoundary({
  path: 'computed-path-key',
  fallback: () => Fallback,
  onError: opts.onError,
  build: () => /* children subtree */,
  parent: parentEl,
})
```

**Runtime behavior:**
- Catches errors thrown during render, in effects, and in unhandled `$resource` errors
- Does NOT catch errors in event handlers, timers, or its own fallback
- Renders fallback in place of failed subtree
- `onError` callback called with error and componentInfo

**Slot context:** `shield.error` (Error), `shield.retry` (function)

**Examples:**
```
<$shield fallback="ErrorMessage">
  <FlakyWidget />
</$shield>

<$shield onError="logError">
  <UserProfile />
  <$slot name="fallback">
    <ErrorPage error="shield.error" retry="shield.retry" />
  </$slot>
</$shield>
```

### 3.15 `<$guard>` (element)

**Purpose:** Access control boundary.

**Form:** Element.

**Attributes:**
| Attribute | Type | Required |
|---|---|---|
| `scope` | `scope-name` | Yes |
| `permissions` | `string` | No |
| `rateLimit` | `string` | No |
| `fallback` | `component-ref` | One of `fallback`, `redirect`, slot |
| `redirect` | `path` | One of `fallback`, `redirect`, slot |
| `onDeny` | `function-ref` | No |

**Lowering:**
```typescript
// Compiler emits:
createGuardBoundary({
  path: 'computed-path-key',
  scope: 'scope-name',
  permissions: ['perm1', 'perm2'],
  rateLimit: '100/min',
  fallback: () => Fallback,
  redirect: '/login',
  onDeny: opts.onDeny,
  build: () => /* children subtree */,
  parent: parentEl,
})
```

**Runtime behavior:**
- On mount: evaluates scope, permissions, rate limit against current user
- If denied: renders fallback or triggers redirect (per which is configured)
- Reactive: re-evaluates when auth state changes (logout while viewing protected content)
- Rate limit checked against user's request count for the matching scope

**Slot context:** `guard.user` (User | null), `guard.reason` (string), `guard.path` (string)

**Examples:**
```
<$guard scope="authenticated" fallback="LoginPrompt">
  <UserDashboard />
</$guard>

<$guard 
  scope="admin" 
  permissions="user:write,user:delete"
  fallback="UnauthorizedPage"
>
  <AdminPanel />
</$guard>

<$guard scope="authenticated" redirect="/login">
  <ProtectedPage />
</$guard>
```

### 3.16 `<$warp>` (element)

**Purpose:** Render content into a different DOM location.

**Form:** Element.

**Attributes:**
| Attribute | Type | Required |
|---|---|---|
| `to` | `selector | expression` | Yes |
| `$if` | `signal-ref | expression` | No (allows conditional) |

**Lowering:**
```typescript
// Compiler emits:
createWarpBoundary({
  path: 'computed-path-key',
  target: () => to,
  condition: () => $if,
  build: () => /* children subtree */,
})
```

**Runtime behavior:**
- Children render into the target element (queried by selector)
- Reactive: if `to` changes, content re-mounts at new location
- Component lifecycle: warped content's lifecycle is tied to the parent component, not the target
- SSR: warped content is emitted into the target element on the server

**Error cases:**
- Target selector matches no element — runtime warning, falls back to inline render
- Target selector matches multiple elements — uses the first match

**Examples:**
```
<$warp to="#modal-root">
  <Dialog />
</$warp>

<$warp to="body">
  <Toast message="alertText" />
</$warp>

<$warp to="#mobile-menu" $if="isMobile">
  <Navigation />
</$warp>
```

---

## 4. `@style` Block Macros

Style block macros bridge CSS with reactive values, design tokens, and conditional logic.

### 4.1 `$reactive`

**Purpose:** Bind a CSS property to a reactive expression.

**Form:** Function in CSS value position.

**Syntax:**
```css
selector { property: $reactive(expression) }
selector { property: $reactive(signalName) }
```

**Lowering:**
```css
/* Compiler emits in scoped CSS: */
.aihu-component { property: var(--reactive-N) }
```
```typescript
// Compiler emits effect:
effect(() => { rootEl.style.setProperty('--reactive-N', String(expression)) })
```

**Runtime behavior:**
- Single CSS custom property per `$reactive` call
- One effect per call updates the property
- No CSS recomputation: the browser handles the variable change

**Error cases:**
- Used outside `@style` — error
- Expression has no reactive dependencies — warning: "$reactive with static value"

**Examples:**
```
@style {
  h1 { color: $reactive(error ? 'red' : 'black') }
  .progress { width: $reactive(`${progress}%`) }
  button { background: $reactive(theme.primary) }
}
```

### 4.2 `$tokens`

**Purpose:** Import design tokens from project config.

**Form:** Statement.

**Syntax:**
```
$tokens(category1, category2, ...)
```

**Lowering:**
The compiler resolves tokens from `aihu.config.ts` `style.tokens` configuration and emits them as CSS custom properties or as inline values (depending on the lowering mode).

**Runtime behavior:**
- In `tokens` mode: tokens become CSS custom properties (--color-primary, etc.)
- In `tailwind` mode: tokens are mapped to Tailwind class equivalents
- In `plain` mode: tokens are inlined as raw values

**Error cases:**
- `$tokens` outside `@style` — error
- Unknown token category — error citing config

**Examples:**
```
@style {
  $tokens(spacing, color, typography)
  
  h1 {
    color: var(--color-primary)
    font-size: var(--type-scale-xl)
    margin-bottom: var(--space-4)
  }
}
```

### 4.3 `$global`

**Purpose:** Define styles outside the component scope.

**Form:** Block statement.

**Syntax:**
```
$global { rules }
```

**Lowering:**
Rules inside `$global` are emitted to the global stylesheet without component scoping.

**Runtime behavior:**
- Rules apply globally
- No automatic deduplication: multiple components emitting the same global rule will create duplicates

**Error cases:**
- `$global` outside `@style` — error
- Nested `$global` blocks — error

> **Amendment 02:** `$reactive` calls inside a `$global { }` block target `document.documentElement` rather than the component root. The component owns the effect lifecycle.

**Examples:**
```
@style {
  /* Component-scoped */
  root { padding: 2rem }
  
  $global {
    body { margin: 0 }
    * { box-sizing: border-box }
  }
}
```

### 4.4 `$media`

**Purpose:** Media query block.

**Form:** Block statement.

**Syntax:**
```
$media(query) { rules }
```

**Lowering:**
```css
/* Compiler emits: */
@media query { rules }
```

**Runtime behavior:**
- Standard CSS `@media` query
- Tokens and `$reactive` calls inside work as usual

**Error cases:**
- Malformed query — CSS-level error
- Nested `$media` — permitted, lowers to nested `@media`

**Examples:**
```
@style {
  h1 { font-size: 1.5rem }
  
  $media(min-width: 768px) {
    h1 { font-size: 2rem }
  }
  
  $media(prefers-color-scheme: dark) {
    root { background: $tokens(color.dark.bg) }
  }
}
```

### 4.5 `$when`

**Purpose:** Apply styles conditionally based on a signal's value.

**Form:** Block statement.

**Syntax:**
```
$when(signalName) { rules }
$when(expression) { rules }
```

**Lowering:**
```css
/* Compiler emits: */
.aihu-component[data-when-N="true"] { rules }
```
```typescript
// Plus an effect to toggle the data attribute:
effect(() => { rootEl.dataset.whenN = String(condition) })
```

**Runtime behavior:**
- Single data attribute per `$when` block
- One effect per block toggles the attribute
- Standard CSS attribute selector applies the rules

**Error cases:**
- `$when` outside `@style` — error
- Empty rules block — warning

**Examples:**
```
@style {
  $when(loading) {
    root { opacity: 0.5; pointer-events: none }
  }
  
  $when(error) {
    root { border: 2px solid red }
  }
  
  $when(user.role === 'admin') {
    .admin-only { display: block }
  }
}
```

---

## 5. `@agent` Block Macros

Agent block macros declare the component's surface to AI agents via MCP. The agent block lowers to server-side artifacts only (per Block Structure Spec §11.5).

### 5.1 `$expose`

**Purpose:** Mark a value as readable to agents.

**Form:** Statement.

**Syntax:**
```
$expose name1, name2, ...
$expose name1, name2, name3
```

**Lowering:**
Compiler generates MCP resource registrations:
```typescript
mcpServer.registerResource({
  uri: `component://component-id/name1`,
  name: 'name1',
  read: () => name1,
})
```

**Runtime behavior:**
- Each exposed name becomes an MCP resource
- Agents can read current value via MCP `resources/read` request
- Reads subscribe to changes; agents receive updates via SSE if subscribed

**Error cases:**
- Name not declared in `@state` — error
- Name shadows another component's exposure (in agent live-binding) — runtime warning

**Examples:**
```
@agent {
  $expose user, count, isEditing
  $expose translations, selectedTranslation
}
```

### 5.2 `$expose.write`

**Purpose:** Mark a value as readable AND writable by agents.

**Form:** Statement.

**Syntax:**
```
$expose.write name1, name2, ...
```

**Lowering:**
Compiler generates MCP resource with PATCH support:
```typescript
mcpServer.registerResource({
  uri: `component://component-id/name1`,
  name: 'name1',
  read: () => name1,
  write: (value) => { name1 = value },
})
```

**Runtime behavior:**
- Agents can write to the value via MCP request
- Writes go through the same path as user-driven writes (batched, reactive)
- Validation: types declared in `@state` are enforced at runtime

**Error cases:**
- Name not declared in `@state` — error
- Name is a computed (read-only by definition) — error: "computed values cannot be exposed for write"

**Examples:**
```
@agent {
  $expose user                    // read-only
  $expose.write editedName        // read-write
  $expose.write selectedItem      // read-write
}
```

### 5.3 `$action`

**Purpose:** Mark an action as invokable by agents (as MCP tools).

**Form:** Statement.

**Syntax:**
```
$action name1, name2, ...
```

**Lowering:**
Compiler generates MCP tool registrations:
```typescript
mcpServer.registerTool({
  name: 'name1',
  inputSchema: /* JSON Schema inferred from action's TypeScript signature */,
  handler: async (args) => name1(args),
})
```

**Runtime behavior:**
- Each exposed action becomes an MCP tool
- Agents call the tool with arguments matching the action's signature
- Return value sent back to agent
- Errors propagate as tool call errors

**Error cases:**
- Name not declared as `$action` in `@state` — error
- Action has non-serializable parameters — error

**Examples:**
```
@agent {
  $action save, reset, exportData
  $action createPost, deletePost
}
```

### 5.4 `$scope`

**Purpose:** Declare the auth scope required to access this component's agent surface.

**Form:** Statement.

**Syntax:**
```
$scope scopeName
```

**Lowering:**
Compiler attaches scope metadata to all resources and tools registered for this component:
```typescript
mcpServer.registerResource({
  ...,
  scope: 'authenticated',  // checked on every read
})
```

**Runtime behavior:**
- Every agent request to this component's resources/tools is checked against scope
- Failed checks return an MCP error
- Scope definitions come from `aihu.config.ts` `agent.scopes`

**Error cases:**
- Scope name not defined in config — compile error
- Multiple `$scope` declarations — error: "only one $scope per component"

**Examples:**
```
@agent {
  $expose user
  $action save
  $scope authenticated
}
```

### 5.5 `$rate-limit`

**Purpose:** Override the default rate limit for this component's agent surface.

**Form:** Statement.

**Syntax:**
```
$rate-limit "100/min"
$rate-limit "50/sec"
$rate-limit "unlimited"
```

**Lowering:**
Compiler attaches rate limit metadata:
```typescript
mcpServer.registerTool({
  ...,
  rateLimit: '100/min',
})
```

**Runtime behavior:**
- Per-component rate limit applies in addition to scope-level limits
- Tighter of the two limits wins
- Counted per user per component

**Error cases:**
- Malformed rate string — error
- Used without `$scope` — warning: "$rate-limit without $scope uses default scope"

**Examples:**
```
@agent {
  $expose user
  $action expensiveOperation
  $scope authenticated
  $rate-limit "10/min"
}
```

### 5.6 `$describe`

**Purpose:** Provide human-readable descriptions for agent-facing names.

**Form:** Statement.

**Syntax:**
```
$describe name "description string"
$describe { name1: "...", name2: "..." }
```

**Lowering:**
Compiler attaches descriptions to MCP resource/tool registrations:
```typescript
mcpServer.registerTool({
  name: 'save',
  description: 'Save the user's edited profile changes',
  ...
})
```

**Runtime behavior:**
- Descriptions are sent to agents in MCP `tools/list` and `resources/list` responses
- Used by LLMs to understand what each tool/resource is for
- Critical for agent reliability: undescribed tools are often misused

**Error cases:**
- Name not exposed via `$expose` or `$action` — error
- Empty description — warning

**Examples:**
```
@agent {
  $expose user, translations
  $action save
  
  $describe user "Currently displayed user record"
  $describe translations "List of available translations for the current verse"
  $describe save "Save the user's edited profile changes"
}
```

---

## 6. Macro Validity Matrix

Quick reference: which macros are valid in which blocks.

| Macro | `@state` | `@template` | `@style` | `@agent` | Disambiguated? |
|---|---|---|---|---|---|
| `$prop` | ✓ | | | | |
| `$computed` | ✓ | | | | |
| `$resource` | ✓ | | | | |
| `$effect` | ✓ | | | | |
| `$effect.on` | ✓ | | | | |
| `$watch` | ✓ | | | | |
| `$action` | ✓ (declares) | ✓ (form attr, references) | | ✓ (MCP tool, references) | Yes — see §1.1.2 |
| `$lifecycle.mount` | ✓ | | | | |
| `$lifecycle.dispose` | ✓ | | | | |
| `$expose` | ✓ (parent surface) | | | ✓ (agent surface) | Yes — see §1.1.1 |
| `$expose.write` | | | | ✓ | |
| `$shared` | ✓ | | | | |
| `$cookie` | ✓ | | | | |
| `$server` | — | | | | **Retired** — see §2.12 |
| `$meta` | ✓ | | | | |
| `$if` | | ✓ | | | |
| `$show` | | ✓ | | | |
| `$each` | | ✓ | | | |
| `$bind:*` | | ✓ | | | |
| `$on:*` | | ✓ | | | |
| `$key` | | ✓ | | | |
| `$html` | | ✓ | | | |
| `$raw` | | ✓ | | | |
| `$once` | | ✓ | | | |
| `$memo` | | ✓ | | | |
| `<$slot>` | | ✓ | | | |
| `<$suspense>` | | ✓ | | | |
| `<$shield>` | | ✓ | | | |
| `<$guard>` | | ✓ | | | |
| `<$warp>` | | ✓ | | | |
| `$reactive` | | | ✓ | | |
| `$tokens` | | | ✓ | | |
| `$global` | | | ✓ | | |
| `$media` | | | ✓ | | |
| `$when` | | | ✓ | | |
| `$scope` | | | | ✓ | |
| `$rate-limit` | | | | ✓ | |
| `$describe` | | | | ✓ | |

**Total: 35 unique macro names. 38 macro forms (counting `$expose` × 2 blocks + `$action` × 3 blocks).**

The compiler MUST enforce this matrix at parse time. Macros used in invalid blocks fail with a clear error citing this matrix.

---

## 7. Plugin Macro Contributions

Plugins MAY contribute macros via the namespaced form `@plugin-name.macro-name` (per the Plugin Contract Spec). Plugin macros:

- Use the same `$` prefix convention: `@forms.$field`, `@auth.$session`
- Are scoped to specific blocks declared in the plugin's manifest
- Follow the same value-form rules as core macros (per Template Attribute Syntax Spec)
- Cannot redefine or override core macros

Plugin macro vocabulary is documented in each plugin's spec, not here. Conformance: plugin macros that violate the form rules MUST be rejected at plugin load time.

---

## 8. Macro Lowering Performance

Each macro's lowering specifies what the compiler emits. The total runtime overhead per component is bounded by the macro count and lowering complexity.

### 8.1 Compile-time invariants

For every macro M used in a component:

- Lowering output is deterministic (same input -> same output)
- Lowering output is testable via snapshot tests
- Lowering output is independent of project size (no global compilation effects)

### 8.2 Runtime cost per macro

Approximate per-component runtime cost (for benchmarking and budget tracking):

| Macro | Cost | Notes |
|---|---|---|
| `$prop` | ~50ns per access | computed wrapper |
| `$computed` | ~100ns first eval, ~10ns cached | memoized |
| `$resource` | ~500ns + fetch time | createResource overhead |
| `$effect` | ~80ns per run | effect dispatch |
| `$bind:*` | ~30ns per direction | no V8 bailout |
| `$on:*` | ~5ns | addEventListener call |
| `$if` | ~150ns per toggle | mount/dispose |
| `$show` | ~10ns per toggle | CSS variable set |
| `$each` | ~3μs for 100 items diff | bitmap dispatch |
| `$memo` | ~20ns per dep check | Object.is comparison |
| `<$suspense>` | ~200ns per state change | mount/dispose fallback |
| `<$shield>` | ~100ns at boundary | try/catch wrapper |
| `<$guard>` | ~200ns + auth check | scope evaluation |
| `<$warp>` | ~80ns | DOM querySelector |
| `$reactive` (style) | ~15ns per change | setProperty call |

These numbers are targets. Compiler implementations MUST not exceed these by more than 2x without justification in the runtime primitive spec.

---

## 9. Open Questions

### 9.1 Should `$server` infer return type from body?

Currently the spec requires explicit return type annotation. TypeScript can infer return types in many cases. Allowing inference would reduce ceremony but risk implicit any.

**Proposed resolution:** Defer to v1+1. Start strict, relax based on usage data.

### 9.2 Should `$resource` support manual control?

Current `$resource` auto-tracks dependencies and refetches automatically. Some cases need manual control: "fetch only on this user action," "fetch on interval," etc.

**Proposed resolution:** Add `$resource.manual` and `$resource.interval` sub-forms in v2 if real demand emerges. v1 ships only the auto-tracked form.

### 9.3 Should `$effect` and `$effect.on` be separate macros?

Currently they're separate. The argument for separation: explicit deps catches bugs (forgetting a dep) at the call site. The argument against: two macros for one concept is redundant.

**Proposed resolution:** Keep separate. The cost (one extra macro in vocabulary) is small; the benefit (clearer intent at call site) is real.

### 9.4 Plugin macros: namespacing collision

If plugin A and plugin B both contribute `$field`, namespacing prevents collision (`@forms.$field` vs `@auth.$field`). But documentation gets confusing for users who use both.

**Proposed resolution:** Plugin Contract Spec to require unique macro names within the plugin ecosystem when possible. Add a registry that warns on overlapping plugin macro names at install time.

---

## 10. Verification

Compiler implementations MUST pass conformance tests covering:

- Each macro's lowering output (snapshot tests)
- Each macro's error cases (negative tests)
- Block validity matrix (per §6)
- Plugin macro registration and namespacing (per §7)
- Performance budgets (per §8.2 — measured benchmarks)

Conformance suite lives in `bench/compiler-conformance/macros/`. Every macro listed in this spec has a corresponding fixture.

---

## 11. Sign-off

Spec is binding once approved. Changes require an amendment with version bump.

**Spec version:** 0.1.0-draft
**Stable from:** TBD
**Reviewed by:** TBD
**Approved by:** TBD
