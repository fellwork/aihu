# @aihu/use

Utility, sensor, and state composables for aihu — the VueUse analog, built on [`@aihu/signals`](/docs/api-reference) (signals + effect scope) and nothing else. Every composable is its own subpath entry with its own size budget, and is SSR-safe by construction.

## Install

```bash
bun add @aihu/use
# or
npm install @aihu/use
```

## Quick start

Import from the per-composable subpath so you only pay for what you use:

```ts
import { useMouse } from '@aihu/use/useMouse'

const { x, y } = useMouse()
```

The barrel (`@aihu/use`) re-exports every **root** composable and is convenient in app code, but the subpath entry is what keeps the shipped bytes proportional to what you actually imported.

The namespaced families — `math/`, `motion/`, `router/`, `integrations/` — are **subpath-only** and are deliberately not re-exported from the barrel, since `router/` and `integrations/` carry optional peer dependencies. Import those from their own subpath:

```ts
import { useClamp } from '@aihu/use/math/useClamp'   // ✓
import { useClamp } from '@aihu/use'                 // ✗ not exported
```

## Reading composable values in templates: call the getter — `{x()}`

Composables return **getters** — usually an object of named ones, sometimes a tuple (`useToggle`) or a single bare getter (`usePrevious`, `useSupported`). They are signals under the hood, so in `.aihu` templates they are read **with parens**:

```aihu
<span>{x()} / {y()}</span>   <!-- ✓ reactive -->
<span>{x} / {y}</span>       <!-- ✗ renders the getter's source text -->
```

This differs from `@state`-declared names, which read bare (`{count}`) because the compiler tracks them. A destructured composable return is not in that map, so the bare form lowers to `leaf(x)` — the leaf receives the getter **function** itself and the DOM renders the function's **source text** (you will literally see something like `() => ...` on the page).

**`state()` reads bare; imported-composable getters read `{x()}`.** This is the single most common mistake — when you see function source rendered in the DOM, add the parens.

## SSR safety: the `isClient` no-op invariant

A composable creates **no listener, effect, or timer when `isClient` is `false`**. Server-side it returns static getters of its initial value and no-op handles instead.

aihu's SSR path runs the full setup body server-side with zero DOM, so this invariant is what makes composables safe inside SSR'd components with no special-casing on your side.

The guards live in `@aihu/use/shared`:

```ts
import {
  isClient,
  defaultWindow,
  defaultDocument,
  defaultNavigator,
  tryOnScopeDispose,
  tryOnMounted,
  toValue,
  unrefElement,
} from '@aihu/use/shared'
```

### Note on `toValue`

`toValue` unwraps `T | (() => T)` and **never inspects arrays** — a `[get, set]` signal tuple is structurally an array of functions and cannot be discriminated from a legitimate array value. Pass the read half (`tuple[0]`), and wrap a function-typed value in a getter (`() => fn`).

## Two target rules shared by all sensors

- **`null` means "nothing"; only an omitted (`undefined`) target falls back to `window`.** An explicit `null` target registers no listener.
- **A getter target only rebinds if it reads a signal.** A getter like `() => document.getElementById('x')` runs once and never re-runs — it looks reactive but isn't.

## Composables

### Core

| Entry | What it does |
|---|---|
| `useEventListener` | Attach a listener with scope-owned auto-cleanup **and** a manual `stop()`. Getter targets (`$ref`, signal reads) rebind reactively. Handler event types are inferred from the DOM event maps for `Window` / `Document` / `HTMLElement` targets. |
| `useEventListenerMap` | Attach several event/handler pairs to one target in a single call. |
| `useMouse` | Reactive mouse position (`client` / `page` / `screen` coordinates, configurable target and initial value). |
| `useScroll` | Reactive scroll position (`x` / `y`) for an element or the window. Position only — no direction. |
| `useWindowSize` | Reactive viewport width/height. |
| `useElementSize` | Element dimensions via `ResizeObserver`. |
| `useElementVisibility` | Whether an element is in the viewport, via `IntersectionObserver`. |
| `useDocumentVisibility` | Reactive `document.visibilityState`. |

### State

| Entry | What it does |
|---|---|
| `useCounter` | Counter with `inc` / `dec` / `set` / `reset`. |
| `useToggle` | Boolean with a toggle setter. |
| `usePrevious` | The previous value of a reactive source. |
| `useLocalStorage` | Signal backed by `localStorage`, synced across tabs. |
| `useClipboard` | Copy text to the system clipboard. Returns `copy` / `copied` / `isSupported` — write-only, there is no clipboard read. |

### Time and scheduling

| Entry | What it does |
|---|---|
| `useNow` | Reactive current time. |
| `useIntervalFn` | `setInterval` with scope-owned cleanup, `pause` / `resume`. |
| `useTimeoutFn` | `setTimeout` with scope-owned cleanup, `start` / `stop`. |
| `useRafFn` | `requestAnimationFrame` loop with scope-owned cleanup. |
| `useDebounced` | Debounced view of a reactive source. |
| `useThrottle` | Throttled view of a reactive source. |

### Browser and environment

| Entry | What it does |
|---|---|
| `useMediaQuery` | Reactive `matchMedia` result. |
| `usePreferredDark` | Whether the user prefers a dark color scheme. |
| `useColorScheme` | Resolved color scheme with an explicit override. |
| `useSupported` | Whether a given browser capability is available. |

### Utilities

| Entry | What it does |
|---|---|
| `watch` | Watch a reactive source and run a callback on change. |

### Namespaced entries

| Entry | What it does |
|---|---|
| `@aihu/use/math/useClamp` | Clamp a reactive number between reactive bounds. |
| `@aihu/use/motion/useReducedMotion` | Whether the user prefers reduced motion. |
| `@aihu/use/router/useRouteParams` | Reactive route params from [`@aihu/router`](/docs/api-reference). |
| `@aihu/use/integrations/useJwt` | Decode a JWT. Takes a plain `string`, decoded once per call — the returned `payload` / `error` signals settle when the async `jwt-decode` import resolves; a changing token is not tracked. |

## How it relates

- [`@aihu/signals`](/docs/api-reference) — the only runtime dependency. Composables are signals plus effect scope; there is no separate reactivity system here.
- [`@aihu/reactive`](/docs/packages/reactive) — deep reactive trees. Composables return flat getter objects; `@aihu/reactive` is the right tool when you need nested, per-key tracking.

The package README is the authoritative per-composable reference: [packages/use](https://github.com/fellwork/aihu/tree/main/packages/use).
