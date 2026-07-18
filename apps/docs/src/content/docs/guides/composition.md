# Composition & Injection

aihu has first-class support for the two halves of Vue-style composition:
**composables** — reusable functions that bundle reactive logic — and
**hierarchical injection** — providing a dependency to a subtree and injecting
it anywhere below.

## Tag naming

Every `.aihu` component compiles to a **native custom element**, and the
platform requires custom-element names to contain a hyphen. The compiler
normalizes component tags for you — with one hard rule you must know:

> **Single-word component names are a hard compile error (C450).**
> A single word can never become a valid custom-element name. Multi-word
> PascalCase kebab-cases automatically; already-hyphenated tags pass through
> lowercased; plain lowercase HTML/SVG tags are never touched.

| You write | Compiles to |
|---|---|
| `<UserCard>` | `user-card` |
| `<APIClient>` | `api-client` |
| `<HTMLParser>` | `html-parser` |
| `<my-widget>` | `my-widget` |
| `<Aihu-Button>` | `aihu-button` |
| `<Comment>` | **error C450** — `comment` has no hyphen |
| `<div>`, `<linearGradient>` | untouched (plain HTML/SVG) |

A component's own resolved name (`@meta name` → `@route name` → file stem) is
normalized the same way, so `UserCard.aihu` defines `user-card`. A **reference**
to a single-word tag (`<Comment>` in a template) is the hard C450 error; a
single-word *file name* on its own only warns (the element it would define,
`comment`, has no hyphen and can't register at runtime) — give it a hyphenated
`@meta name` to silence it.

**Fixing a C450:** pick a hyphenated tag — reference it as `<x-comment>` (and
name the file `x-comment.aihu`), or keep the file name and set an explicit
hyphenated `@meta name`:

```
@meta { name: 'hn-comment' }
```

References, the route manifest's `components` list, and the registered
element name all agree on the normalized tag, so `<UserCard>` in a template
always matches the `user-card` element that `UserCard.aihu` defines.

> **Passing props: one consequence to know.** Plain-curly attribute props
> (`comment={item}`) are only accepted on a **PascalCase** reference —
> `<UserCard comment={item}>`. On a **hyphenated** reference you must
> `$`-prefix them: `<user-card $comment={item}>`. Both normalize to the same
> `user-card` element, so pick whichever you prefer — PascalCase for
> plain-curly ergonomics, or a hyphenated tag with `$`-props.

See also [Authoring Components](authoring-components.md).

## Route-scoped component registration

You never write a boot file that imports every component. The compiler records
which components each page references — every `route.json` carries a
`components` array of [normalized tags](#tag-naming) — and the router's Vite
plugin turns those into a compile-time registry (`virtual:aihu-components`) of
tag → lazy import. On navigation, `@aihu/app` imports the matched route's
referenced components from that registry and registers their custom elements
**before the page renders**, so a page's children are always defined when it
mounts.

Before (hand-written eager entry):

```typescript
// src/main.ts — DON'T do this
import './components/hn-comment.js'
import './components/vote-button.js'
import { createApp } from '@aihu/app/client'
createApp()
```

After — just reference the tag; the router registers it:

```html
@template {
  <hn-comment $comment={item} />
}
```

Only the components the active route actually uses are loaded — a tag not
referenced by the current page costs nothing. A `components` tag with no
registry entry (e.g. an element you registered globally yourself) is skipped
silently.

## Composables

An `@state` block *is* your component's setup function. So a plain function you
call from `@state` runs inside setup, which means it can use the full reactive
surface: signals, lifecycle hooks (bound to the calling component), and
injection. This is exactly what a Vue composable is.

Extract shared logic into a `use*` function:

```typescript
// src/composables/use-counter.ts
import { signal } from '@aihu/signals'
import { onMount, onCleanup } from '@aihu/runtime'

export function useCounter(start = 0) {
  const [count, setCount] = signal(start)

  const inc = () => setCount(count() + 1)
  const dec = () => setCount(count() - 1)

  // Lifecycle hooks bind to the component that CALLED the composable.
  onMount(() => console.log('counter mounted'))
  onCleanup(() => console.log('counter disposed'))

  return { count, inc, dec }
}
```

Then use it in any component:

```html
@state {
  import { useCounter } from '../composables/use-counter.ts'
  const { count, inc } = useCounter(10)
}

@template {
  <button $on.click={inc}>{count()}</button>
}
```

Everything a composable returns stays reactive: `count` is a signal, so the
template tracks it. The composable can call `signal`, `computed`, `effect`,
`onMount`/`onCleanup`, and `inject`/`provide` — the same tools available directly
in `@state`.

### Rules of thumb

- **Name them `use*`** — the convention that signals "this touches reactive
  state and/or lifecycle."
- **Call them synchronously at the top of `@state`**, not inside a callback or a
  conditional. Lifecycle hooks and `inject` resolve against the currently-setting-up
  component, which is only correct during setup.
- **Return the reactive surface, not snapshots.** Return the signal (`count`),
  not its current value (`count()`), so callers stay reactive.

## Hierarchical injection

`@aihu/context` provides tree-scoped dependency injection. An ancestor
`provide`s a value; any descendant `inject`s it. It is scoped to the subtree —
siblings don't see it, and a nearer provider overrides a farther one — and it
crosses shadow boundaries.

```typescript
// A typed token with a default.
import { createContext } from '@aihu/context'

export interface Api { base: string }
export const ApiContext = createContext<Api>({ base: '/api' })
```

Provide it at a layer boundary:

```html
@state {
  import { provide } from '@aihu/context'
  import { ApiContext } from '../context/api.ts'
  provide(ApiContext, { base: '/api/v2' })
}
```

Inject it anywhere below — directly or inside a composable:

```typescript
// src/composables/use-api.ts
import { inject } from '@aihu/context'
import { ApiContext } from '../context/api.ts'

export function useApi() {
  return inject(ApiContext) // the nearest ancestor's value, or the default
}
```

`inject` returns the token's default when no ancestor provided it, so a component
works standalone and gains the injected layer when mounted under a provider.

### Reactive injection

Provide a **signal** and descendants read it reactively — no extra machinery:

```html
@state {
  const [theme, setTheme] = signal('dark')
  provide(ThemeContext, theme)   // provide the signal itself
}
```

```html
@state {
  const theme = inject(ThemeContext)   // () => 'dark' | 'light'
}
@template {
  <div $class={theme()}>…</div>   // tracks setTheme() updates
}
```

### How it works

Each component instance holds a `provides` object whose prototype chain *is* the
ancestor context tree. A component that provides nothing shares its parent's
object by reference (zero cost); the first `provide` does one `Object.create`.
`inject` is a single prototype-chain lookup — there is no per-injection tree walk.
The parent is resolved once at connect via a shadow-host hop, so lazily-registered
components resolve their ancestors correctly too.

### Separating logical layers

Compose the two features to structure an app into layers — a data layer, an auth
layer, a theme layer — each providing into the subtree that needs it, and each
consumed through a `use*` composable:

```
<app-root>            provide(AuthContext, authService)
  <dashboard>         provide(DataContext, dataStore)   // scoped to the dashboard
    <widget>          const data = useData(); const user = useAuth()
```

`useData()` and `useAuth()` are one-line composables wrapping `inject`, so
consumers never touch the tokens directly and never prop-drill.

### SSR

The same `provide`/`inject` API works during server rendering via
`runWithContext`. On the server the flat per-request context map applies (see
`@aihu/context`); the tree-scoped hierarchy above is the client runtime path.
