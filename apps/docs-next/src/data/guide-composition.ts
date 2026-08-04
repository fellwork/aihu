/**
 * Composition & Injection guide body. Ported from
 * apps/docs/src/content/docs/guides/composition.md. The original was largely
 * ACCURATE — tag naming/C450, route-scoped registration, the composable model,
 * and the prototype-chain injection mechanism all still hold — so it is kept
 * close to verbatim. Three updates:
 *
 *   - @aihu/use (0.6.0, ~65 composables) did not exist when this was written.
 *     A guide that teaches "extract a use* function" without saying one is
 *     probably already written is teaching people to reinvent useClickOutside.
 *     Added, with the division of labour: @aihu/router owns routing
 *     composables, @aihu/use owns the rest.
 *   - The SSR section said provide/inject "works during server rendering via
 *     runWithContext" and stopped there. That understated the problem: no
 *     component in a PRERENDERED tree provides anything, because <router> and
 *     the app root are client constructs. The real mechanism is pre-populating
 *     the map through SsrOptions.contextSetup, which @aihu/app's prerenderer
 *     now does for RouteContext.
 *   - Cross-links retargeted to the docs-next IA.
 */
export const COMPOSITION = `# Composition & Injection

aihu has first-class support for the two halves of composition: <strong>composables</strong> — reusable functions bundling reactive logic — and <strong>hierarchical injection</strong> — providing a dependency to a subtree and injecting it anywhere below.

## Tag naming

Every <code>.aihu</code> component compiles to a native custom element, and the platform requires custom-element names to contain a hyphen. The compiler normalizes tags for you, with one hard rule:

> <strong>Single-word component names are a hard compile error (C450).</strong> A single word can never become a valid custom-element name. Multi-word PascalCase kebab-cases automatically; already-hyphenated tags pass through lowercased; plain lowercase HTML/SVG tags are never touched.

| You write | Compiles to |
|---|---|
| <code>&lt;UserCard&gt;</code> | <code>user-card</code> |
| <code>&lt;APIClient&gt;</code> | <code>api-client</code> |
| <code>&lt;HTMLParser&gt;</code> | <code>html-parser</code> |
| <code>&lt;my-widget&gt;</code> | <code>my-widget</code> |
| <code>&lt;Comment&gt;</code> | <strong>error C450</strong> — <code>comment</code> has no hyphen |
| <code>&lt;div&gt;</code>, <code>&lt;linearGradient&gt;</code> | untouched (plain HTML/SVG) |

A component's own resolved name (<code>@meta name</code> → <code>@route name</code> → file stem) normalizes the same way, so <code>UserCard.aihu</code> defines <code>user-card</code>.

<strong>Fixing a C450:</strong> pick a hyphenated tag, or keep the file name and set an explicit <code>@meta { name: 'hn-comment' }</code>.

> <strong>Passing props: one consequence.</strong> Plain-curly attribute props (<code>comment={item}</code>) are only accepted on a <strong>PascalCase</strong> reference. On a hyphenated reference you must <code>$</code>-prefix them. Both normalize to the same element, so pick whichever you prefer.

## Route-scoped component registration

You never write a boot file importing every component. The compiler records which components each page references, and the router's Vite plugin turns those into a compile-time registry (<code>virtual:aihu-components</code>) of tag → lazy import. On navigation, <code>@aihu/app</code> registers the matched route's components <strong>before the page renders</strong>.

Don't do this:

~~~ts
// src/main.ts — DON'T
import './components/hn-comment.js'
import './components/vote-button.js'
import { createApp } from '@aihu/app/client'
createApp()
~~~

Every such line drags that component into the <strong>entry</strong> chunk, so every page pays for every component — exactly the cost the registry exists to avoid. Just reference the tag:

~~~html
@template {
  <hn-comment comment={item} />
}
~~~

Only the components the active route uses are loaded. The registry is <strong>transitive</strong>: a component's loader also loads its own nested children, because the compiler emits a child as a bare tag with no import — so without that closure a nested element would stay an inert unknown element. A referenced tag with no registry entry (an element you registered globally) is skipped silently.

## Composables

An <code>@state</code> block <em>is</em> your component's setup function. A plain function you call from <code>@state</code> therefore runs inside setup, with the full reactive surface: signals, lifecycle hooks bound to the calling component, and injection.

> <strong>Look before you write one.</strong> <code>@aihu/use</code> ships ~65 composables — <code>useClickOutside</code>, <code>useElementSize</code>, <code>useIntersectionObserver</code>, <code>useDebounced</code>, <code>useClipboard</code>, <code>useReducedMotion</code> and so on. <code>@aihu/router</code> owns the routing ones (<code>useRoute</code>, <code>useRouter</code>, <code>useRouteParams</code>); <code>@aihu/use</code> owns essentially everything else. Check both before hand-rolling.

For logic genuinely specific to your app, extract a <code>use*</code> function:

~~~ts
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
~~~

~~~html
@state {
  import { useCounter } from '../composables/use-counter.ts'
  const { count, inc } = useCounter(10)
}

@template {
  <button on:click={inc}>{count()}</button>
}
~~~

Everything a composable returns stays reactive: <code>count</code> is a signal, so the template tracks it.

### Rules of thumb

- <strong>Name them <code>use*</code></strong> — the convention signalling "this touches reactive state and/or lifecycle".
- <strong>Call them synchronously at the top of <code>@state</code></strong>, never inside a callback or conditional. Lifecycle hooks and <code>inject</code> resolve against the currently-setting-up component, which is only correct during setup.
- <strong>Return the reactive surface, not snapshots.</strong> Return <code>count</code>, not <code>count()</code>.
- <strong>Two call sites is the threshold.</strong> Duplicated reactive logic drifts, and the copies stop agreeing — which is worse than the duplication, because now one of them is quietly wrong.

## Hierarchical injection

<code>@aihu/context</code> provides tree-scoped dependency injection. An ancestor <code>provide</code>s; any descendant <code>inject</code>s. It is scoped to the subtree, a nearer provider overrides a farther one, and it crosses shadow boundaries.

~~~ts
import { createContext } from '@aihu/context'

export interface Api { base: string }
export const ApiContext = createContext<Api>({ base: '/api' })
~~~

Provide it at a layer boundary:

~~~html
@state {
  import { provide } from '@aihu/context'
  import { ApiContext } from '../context/api.ts'
  provide(ApiContext, { base: '/api/v2' })
}
~~~

Inject it anywhere below, directly or inside a composable:

~~~ts
import { inject } from '@aihu/context'
import { ApiContext } from '../context/api.ts'

export function useApi() {
  return inject(ApiContext) // nearest ancestor's value, or the default
}
~~~

<code>inject</code> returns the token's default when nothing provided it, so a component works standalone and gains the injected layer under a provider.

### Reactive injection

Provide a <strong>signal</strong> and descendants read it reactively — no extra machinery:

~~~html
@state {
  const [theme, setTheme] = signal('dark')
  provide(ThemeContext, theme)   // the signal itself, not its value
}
~~~

~~~html
@state {
  const theme = inject(ThemeContext)   // () => 'dark' | 'light'
}
@template {
  <div class={theme()}>…</div>
}
~~~

### How it works

Each component instance holds a <code>provides</code> object whose prototype chain <em>is</em> the ancestor context tree. A component providing nothing shares its parent's object by reference (zero cost); the first <code>provide</code> does one <code>Object.create</code>. <code>inject</code> is a single prototype-chain lookup — no per-injection tree walk. The parent resolves once at connect via a shadow-host hop, so lazily-registered components still find their ancestors.

### On the server

Server rendering uses a <strong>flat per-request map</strong> instead of the prototype chain — same <code>provide</code>/<code>inject</code> API, different storage. <code>runWithContext(map, fn)</code> activates one for the duration of a render.

There is a wrinkle worth understanding for prerendering. A prerendered tree has <strong>no provider components in it at all</strong> — <code>&lt;router&gt;</code> and the app root are client constructs, so anything they would provide is simply absent on the server. The mechanism for that case is <em>pre-populating</em> the map before the walk, via <code>SsrOptions.contextSetup</code>:

~~~ts
await renderToString(component, {
  contextSetup: () => provideRouteContext({ router, current: () => match }),
})
~~~

<code>@aihu/app</code>'s prerenderer does exactly this for <code>RouteContext</code>, which is why <code>useRoute()</code> and active-link state resolve correctly in statically generated HTML rather than being <code>null</code> until hydration.

### Separating logical layers

~~~
<app-root>            provide(AuthContext, authService)
  <dashboard>         provide(DataContext, dataStore)   // scoped to the dashboard
    <widget>          const data = useData(); const user = useAuth()
~~~

<code>useData()</code> and <code>useAuth()</code> are one-line composables wrapping <code>inject</code>, so consumers never touch tokens directly and never prop-drill.

## See also

- [Authoring Components](/guides/authoring-components) — the SFC blocks in depth
- [Reactivity](/guides/reactivity) — signals, computed, effects
- [SSR & Hydration](/guides/ssr-hydration) — the server rendering model
- [@aihu/context](/api/context) · [@aihu/use](/api/use)
`
