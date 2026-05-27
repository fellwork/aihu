# @aihu/context

Zero-dependency, DOM-free context system. Provides a React-style context API for passing values through a call tree without explicit prop-drilling, with first-class SSR support via per-request context maps.

## Install

```bash
npm install @aihu/context
# or
bun add @aihu/context
```

## API overview

| Name | Kind | Description |
|------|------|-------------|
| `createContext` | function | Create a typed context token with optional default |
| `provide` | function | Write a value into the active context map |
| `inject` | function | Read a value from the active context map |
| `setSsrContextMap` | function | Set the active context map (SSR entry point) |
| `clearSsrContextMap` | function | Clear the active context map (SSR teardown) |
| `runWithContext` | function | Run a function with an isolated context map |
| `ContextToken` | interface | Opaque token identifying a context slot |

## Functions

### createContext

```typescript
function createContext<T>(defaultValue?: T): ContextToken<T>
```

Creates a new opaque context token. The token is used with `provide` and `inject` to write and read values. Each call to `createContext` produces a unique token — two tokens created with identical default values are not interchangeable.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `defaultValue` | `T` | No | Value returned by `inject` when no explicit value has been provided. Defaults to `undefined`. |

**Returns** `ContextToken<T>` — a new unique context token.

---

### provide

```typescript
function provide<T>(token: ContextToken<T>, value: T): void
```

Writes `value` into the currently active context map under `token`. If no context map is active (i.e., `setSsrContextMap` or `runWithContext` has not been called), this is a no-op.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token` | `ContextToken<T>` | Yes | The token identifying the context slot. |
| `value` | `T` | Yes | The value to store. |

**Returns** `void`

---

### inject

```typescript
function inject<T>(token: ContextToken<T>): T | undefined
```

Reads the value associated with `token` from the active context map. Falls back to `token._default` if no entry exists for the token or if no map is active.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token` | `ContextToken<T>` | Yes | The token identifying the context slot to read. |

**Returns** `T | undefined` — the stored value, or `token._default` if absent.

---

### setSsrContextMap

```typescript
function setSsrContextMap(map: Map<symbol, unknown>): void
```

Sets the module-level active context map. Any subsequent calls to `provide` or `inject` will read from and write to this map. Replaces any previously active map. Prefer `runWithContext` in most SSR scenarios — it guarantees cleanup even on thrown errors.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `map` | `Map<symbol, unknown>` | Yes | The context map to activate. |

**Returns** `void`

---

### clearSsrContextMap

```typescript
function clearSsrContextMap(): void
```

Clears the active context map, setting it to `null`. Called automatically by `runWithContext` in its `finally` block. Call manually after `setSsrContextMap` if you are not using `runWithContext`.

**Returns** `void`

---

### runWithContext

```typescript
function runWithContext<R>(map: Map<symbol, unknown>, fn: () => R): R
```

Sets `map` as the active context map, executes `fn()`, then clears the map in a `finally` block — even if `fn` throws. This is the recommended SSR entry point: each request gets its own `Map`, making context leakage between concurrent requests impossible.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `map` | `Map<symbol, unknown>` | Yes | A per-request context map, typically `new Map()`. |
| `fn` | `() => R` | Yes | The function to execute inside the context. |

**Returns** `R` — the return value of `fn()`.

## Types

### ContextToken

```typescript
interface ContextToken<T> {
  readonly _id: symbol
  readonly _default: T | undefined
}
```

Opaque token returned by `createContext`. The `_id` symbol is unique per token and is used as the map key internally. The `_default` field holds the fallback value supplied to `createContext`. Treat both fields as read-only internals — do not construct `ContextToken` objects manually.

**Fields**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `_id` | `symbol` | Yes | Unique symbol key for this context slot. |
| `_default` | `T \| undefined` | Yes | Default value when no explicit value is provided. |

## Subpath exports

### ./ssr

```typescript
import { setSsrContextMap, clearSsrContextMap, runWithContext } from '@aihu/context/ssr'
```

Re-exports only the three SSR-specific functions: `setSsrContextMap`, `clearSsrContextMap`, and `runWithContext`. Use this subpath in server entry files to make the SSR intent explicit and to tree-shake `createContext`, `provide`, and `inject` from your server bundle if they are not needed there.

The `./ssr` subpath does **not** export `createContext`, `provide`, `inject`, or `ContextToken`. Import those from `@aihu/context` (the main entry).

## Usage

### Client-side: passing a theme value

```typescript
import { createContext, provide, inject } from '@aihu/context'

// Define a token once, export it for shared use
export const ThemeToken = createContext<'light' | 'dark'>('light')

// In a parent scope — set the value before rendering children
provide(ThemeToken, 'dark')

// In a child scope — read the value
const theme = inject(ThemeToken) // 'dark'
```

### SSR: per-request context isolation

```typescript
import { createContext, provide, inject, runWithContext } from '@aihu/context'

export const RequestIdToken = createContext<string>()

async function handleRequest(requestId: string): Promise<string> {
  const ctx = new Map<symbol, unknown>()
  return runWithContext(ctx, () => {
    provide(RequestIdToken, requestId)
    // Any code called here can inject(RequestIdToken)
    return inject(RequestIdToken) ?? 'unknown'
  })
}
```
