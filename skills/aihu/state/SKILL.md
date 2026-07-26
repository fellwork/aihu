# aihu `@state` — component logic

The `@state` block declares a component's reactive model in TypeScript plus a
small set of compiler intrinsics. Intrinsics are bare identifiers the compiler
recognizes (no import needed); an authored import of the same name shadows the
intrinsic.

One signature everywhere: `wrapper(config?, valueOrFn)` — the optional metadata
bag comes FIRST, the running code last (the `node:test` convention). Swapping
them is C622 with an auto-fix.

## Binding intrinsics — `const|let name = wrapper(…)`

| Intrinsic | Declares | Notes |
|---|---|---|
| `state(initial)` | private reactive state | `let count = state(0)` |
| `prop({ default, describe?, expose?, attribute?, reflect? })` | public, host-settable prop | part of the component's public/agent surface |
| `derived(fn)` | memoized pure computation | never cause side effects inside |
| `action(config?, fn)` | named mutation/command | the only place that should write state in response to events |
| `resource(fn)` | async data with `.loading` / `.error` / `.value` | replaces hand-rolled loading/error flags |
| `controller(fn)` | reusable host-lifecycle controller | `hostConnected`/`hostDisconnected` (observers etc.) |
| `route()` / `prop<RouteData>()` | route data in pages | see `@route` below |
| `consume(key)` | read a context value from an ancestor | pairs with `provide()` |
| `stream(...)` | streaming source | exists, but zero example coverage — avoid until the cookbook covers it |

## Statement intrinsics — called at `@state` top level

`effect`, `onMount`, `onDispose`, `onAdopt`, `onAttributeChange`, `aria`,
`provide`, `form`, `event`, `beforeNavigate`, `afterNavigate`.

Rules that matter:

- **Timers and subscriptions start in `onMount`, never at `@state` top level**
  (setup also runs during SSR), and are always cleaned up in `onDispose`.
- **`provide()` must run during setup** — not inside `onMount`; descendants
  connecting during mount would miss the scope.
- **Debounce in `effect()`, never in `derived()`** — derivations must be pure.
- `aria()` declares host ARIA once (`aria({ role: 'dialog', modal: 'true', label: '…' })`)
  instead of scattering attributes on inner wrappers.

## Reads and writes

- Read intrinsic-declared names bare: `if (loading) …`, `items.length`,
  `tabs.find(t => t.id === activeId)`. The compiler derives the reactive read.
- Write with plain assignment or `++`/`--`, on `state`/`prop` only. Replace,
  don't mutate in place: `tasks = [...tasks, item]`, `tasks = tasks.filter(…)`.
- Composable returns (`const { x, y } = useMouse()`) are getters — read them
  with parens: `x()`. Bare `useMouse()` calls auto-import their `@aihu/use`
  subpath entry; do not import the barrel.
- Plain (non-reactive) locals are fine: `let _timerId: number | null = null`.

## Worked example — async fetch with an exposed action

```aihu
@state {
  let city = prop({
    default: 'London',
    describe: 'City name to retrieve weather forecast for',
    expose: 'read',
  })

  let forecast = state('')
  let loading = state(false)
  let errorMsg = state('')

  const fetchForecast = action(
    { describe: 'Fetch the latest forecast for the current city',
      expose: 'read write' },
    async () => {
      loading = true
      errorMsg = ''
      try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        forecast = await res.text()
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : String(e)
      } finally {
        loading = false
      }
    })
}

@template {
  <div>
    <h2>Weather — {city}</h2>
    <group if={loading}><p>Fetching…</p></group>
    <group elseif={errorMsg}><p>{errorMsg}</p></group>
    <group else><p>{forecast || 'Press refresh.'}</p></group>
    <button on:click={fetchForecast} disabled={loading}>Refresh</button>
  </div>
}
```

For plain data loading prefer `resource()` over hand-rolled flags:

```aihu
@state {
  const url = prop({ default: '/api/resource' })

  const data = resource(async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })
}

@template {
  <div>
    <group if={data.loading}><p>Loading…</p></group>
    <group elseif={data.error}><p>Error: {data.error.message}</p></group>
    <group else><pre>{JSON.stringify(data.value, null, 2)}</pre></group>
  </div>
}
```

## Lifecycle example — interval clock

```aihu
@state {
  let seconds = state('00')
  let _timerId: number | null = null

  const tick = action(() => {
    seconds = String(new Date().getSeconds()).padStart(2, '0')
  })

  onMount(() => {
    tick()
    _timerId = setInterval(() => tick(), 1000) as unknown as number
  })
  onDispose(() => {
    if (_timerId !== null) clearInterval(_timerId)
  })
}

@template {
  <span role="timer" aria-live="off">:{seconds}</span>
}
```

## Imports, directives, pages

- `import … from '…'` lines are allowed inside `@state` (top of block). All
  framework packages live under `@aihu/*` — there is no `@scribe/*` scope
  (pre-rename; any such import fails the build).
- Naked directives configure the component: `shadow: 'light' | 'shadow'`,
  `base: SomeClass`, `extract: { … }`.
- Pages (files under `src/pages/`) may add an `@route { }` block —
  a TS object literal: `path: "/user/[id]"`, `name:`, `ssr: true`, `layout:`.
  `@route` outside `src/pages/` is C500.

## One dialect per file

Old files may use the legacy `$`-collection macros (`$action: { name: fn }`,
`count: number = 0`). That dialect still compiles on its own, but mixing it with
wrapper intrinsics in the same `@state` block is C625. Write new code in the
wrapper dialect only.
