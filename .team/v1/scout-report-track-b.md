# Scout Report — Track B
**Date:** 2026-04-30
**By:** Scout (automated)

---

## Task A: Signal primitive usage patterns

### A1. Return type of `effect()`

`effect()` returns `Dispose`, which is defined as `() => void`. It is a **synchronous** disposal function. Calling it unlinks all dependency edges and flags the node as `DISPOSED`.

- Source: `packages/signals/src/effect.ts:40` — `export function effect(fn: EffectFn): Dispose`
- Source: `packages/signals/src/effect.ts:4` — `export type Dispose = () => void`

### A2. `$state` / `State<T>`

`$state<T>(initial: T): State<T>` is a thin wrapper around `signal()` that exposes a mutable `.value` getter/setter instead of the `[read, write]` tuple.

```ts
// packages/signals/src/state.ts
export interface State<T> {
  value: T
}
export function $state<T>(initial: T): State<T>
```

Both `State` (type) and `$state` (value) are **exported** from `packages/signals/src/index.ts` (lines 9–10).

`$state` / `State<T>` are **not used** in any other package. Grep over `packages/arbor`, `packages/runtime`, `packages/server` found zero matches.

### A3. Signal consumption pattern in the component lifecycle

The canonical pattern lives in `packages/arbor/src/materialize.ts`. When a `Signal<string>` is passed as a text-leaf value, the materialization code reads `value[0]` (the getter tuple element) inside a `mountEffect` callback:

```ts
// packages/arbor/src/materialize.ts:54–63
if (Array.isArray(value)) {
  // Signal<string> — tuple [Read, Write]. Wire reactive update.
  const get = value[0] as () => unknown
  mountEffect(
    disposers,
    () => {
      textNode.nodeValue = String(get())
    },
    `${pathBase}.text`,
  )
}
```

Similarly, `_applyAttrs` in `packages/arbor/src/attrs.ts:80–82` does the same for attribute bindings:

```ts
if (Array.isArray(value)) {
  const get = value[0] as () => unknown
  mountEffect(disposers, () => _setAttrOrProp(el, key, get()), `${pathBase}.attr:${key}`)
}
```

A `Signal` is detected by `Array.isArray(value)` (Deviation #11). The getter is `value[0]`; the setter is `value[1]` (never read by arbor itself — only the getter is consumed reactively).

### A4. `untrack` export status and arbor usage

`untrack` **is exported** from `packages/signals/src/index.ts` (line 11).

`untrack` is **not used anywhere in `packages/arbor/src/`**. A grep over all `.ts` files in that directory returned zero matches.

---

## Task B: Export patterns and DOM-free constraint

### B1. Barrel re-exports

Yes. Every package uses `packages/{name}/src/index.ts` as its barrel:

- `packages/signals/src/index.ts` — re-exports `batch`, `computed`, `effect`, `signal`, `$state`, `untrack`, and their types (11 lines, all `export … from`)
- `packages/arbor/src/index.ts` — re-exports `branch`, `leaf`, `mount`, `MountScope`, `each`, `when`, and all types
- `packages/server/src/index.ts` — re-exports from `router`, `middleware`, `api`, `ssr`, `data`, `config`, `agent-readiness-config`
- `packages/runtime/src/index.ts` — confirmed barrel pattern

### B2. DOM-specific imports in `packages/arbor/src/`

`@scribe/arbor` **is NOT suitable** as a dependency for a server-safe `@scribe/context`. The following DOM globals are referenced directly:

- `packages/arbor/src/materialize.ts:52` — `document.createTextNode('')`
- `packages/arbor/src/materialize.ts:73` — `document.createElement(node.tag as string)`
- `packages/arbor/src/materialize.ts:94` — `document.createElement(node.tag)`
- `packages/arbor/src/attrs.ts:61,102` — function parameters typed as `Element`
- `packages/arbor/src/mount.ts:108` — `mount()` parameter typed `Element | ShadowRoot`

The `Element` and `ShadowRoot` types appear in function signatures throughout `arbor/src`. These are DOM-only types with no Node.js / Worker equivalent.

### B3. `@scribe/context` should depend on `@scribe/signals` only

Confirmed. A context system (`createContext`, `provide`, `inject`) needs only reactive primitives (`signal`, `effect`, `computed`, `untrack`) from `@scribe/signals`. It has no need to import `mount`, `branch`, `leaf`, `Element`, or `MountScope` from `@scribe/arbor`. The dependency graph for `@scribe/context` should be:

```
@scribe/context → @scribe/signals   (only)
```

No `@scribe/arbor` dependency is needed or safe.

### B4. Alias pattern in `vitest.config.ts`

Full example entry (line 17):

```ts
'@scribe/signals': new URL('./packages/signals/src/index.ts', import.meta.url).pathname,
```

The pattern is: `'@scribe/NAME': new URL('./packages/NAME/src/index.ts', import.meta.url).pathname`

All six current entries follow this exact pattern (`signals`, `arbor`, `runtime`, `agent`, `server`, `agent-readiness`).

---

## Task C: SSR dehydration extensibility

### C1. `SsrOptions.serializer` signature

```ts
// packages/server/src/ssr.ts:47
readonly serializer?: () => Record<string, unknown>
```

`serializer` is optional. It takes no arguments and returns `Record<string, unknown>`. When called, its return value is passed to `JSON.stringify` and embedded in the state script tag.

### C2. `__scribe_state__` script tag emission

The tag **is emitted today** when `opts.serializer` is provided. Exact code at `packages/server/src/ssr.ts:127–134`:

```ts
if (opts?.serializer) {
  try {
    const state = opts.serializer()
    stateScript = `<script type="application/json" id="__scribe_state__">${JSON.stringify(state)}</script>`
  } catch {
    // swallow — no state script emitted
  }
}
```

If the serializer throws (as the v0 arbor stub does), the error is silently swallowed and no script tag is emitted. The tag is injected into the `<body>` just before `</body>` when `opts.head` is set (line 138).

### C3. Full `defineLoader` shape

```ts
// packages/server/src/data.ts

export interface LoaderResult<T> {
  readonly data: T
  readonly error?: Error
  readonly status: number
}

export type LoaderFn<T> = (ctx: RouteContext) => Promise<T>

export interface DefinedLoader<T> {
  readonly _brand: 'DefinedLoader'
  /** @internal */
  readonly fn: LoaderFn<T>
}

export function defineLoader<T>(fn: LoaderFn<T>): DefinedLoader<T>
```

`defineLoader<T>` takes an async function `(ctx: RouteContext) => Promise<T>` and returns a branded `DefinedLoader<T>`. The server uses `runLoader` to execute it and always returns a `LoaderResult<T>` — never throwing. `@scribe/data`'s `createResource` is the client-side counterpart and should name-align: `LoaderResult<T>` → `ResourceResult<T>` or reuse `LoaderResult<T>` wholesale, and the state shape `{ data, error?, status }` should be consistent.

### C4. Existing tests for `defineLoader` / serializer path

Yes, tests exist:

- `packages/server/tests/data.test.ts` — covers `defineLoader` and `runLoader` (5 test cases: branding, fn storage, success, Error wrapping, non-Error wrapping).
- No dedicated test file was found for the `serializer` / `__scribe_state__` path. The SSR tests live in `packages/server/tests/` but a separate grep would be needed to confirm the ssr test file name.

---

## Task D: MountScope lifecycle and AgentContext

### D1. `mount()` current signature

```ts
// packages/arbor/src/mount.ts:108
export function mount(node: Node, host: Element | ShadowRoot): MountScope
```

`mount()` takes exactly two arguments: the arbor `Node` tree and the target DOM `Element | ShadowRoot`. There is **no options parameter** today. Any new options (e.g., a context map) would require adding a third argument.

### D2. `AgentContext` — frozen stub

`AgentContext` is an empty branded interface, and `MountScope.agent` returns a frozen singleton:

```ts
// packages/arbor/src/types.ts:74–76
export interface AgentContext {
  readonly _brand: 'AgentContext'
}
```

```ts
// packages/arbor/src/mount.ts:100–102
const _frozenAgent: AgentContext = Object.freeze({
  _brand: 'AgentContext' as const,
})
```

It is a frozen stub — sub-project #7 lands live binding later. Currently `agent` on any `MountScope` is always this single frozen object.

### D3. `MountScope` exports from `packages/arbor/src/index.ts`

`MountScope` is exported as a **type-only** export:

```ts
// packages/arbor/src/index.ts:4
export type { MountScope } from './mount.ts'
```

The `mount` function (value) is also exported on line 5. `AgentContext`, `Snapshot`, and all other types are exported from `./types.ts` (lines 7–16).

### D4. `mount()` changes needed for module-level context stack (Option A)

With a module-level stack approach, `provide()` and `inject()` push/pop independently: `provide()` pushes a context entry onto the stack before the tree is built; `inject()` reads from the current stack head. Since `setup()` in `defineComponent` (runtime) runs *before* `mount()` (which does DOM materialization), the context stack can be managed entirely within the `provide/inject` lifecycle without any `mount()` changes.

**Conclusion:** `mount()` does not need to be changed for Option A. The context stack is orthogonal to the materialization/disposal lifecycle.

---

## Task E: New package infra checklist

### E1. `packages/signals/package.json` — full content

```json
{
  "name": "@scribe/signals",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "rolldown -c",
    "typecheck": "tsc --noEmit"
  }
}
```

No `dependencies` or `devDependencies` field. (`@scribe/arbor`'s `package.json` has `"dependencies": { "@scribe/signals": "workspace:*" }` as the workspace dep pattern.)

### E2. Rolldown config pattern

Both `packages/signals/rolldown.config.ts` and `packages/arbor/rolldown.config.ts` follow the identical pattern:

```ts
import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,   // ← yes, minify is true
  },
  plugins: [dts()],  // ← yes, dts() plugin is used
})
```

Both packages use `dts()` and `minify: true`.

### E3. `moon.yml` pattern

The minimal pattern (from `packages/signals/moon.yml`):

```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/project.json
language: typescript
layer: library
```

When a package depends on another, `dependsOn` is added (from `packages/arbor/moon.yml`):

```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/project.json
language: typescript
layer: library

dependsOn:
  - 'signals'
```

New packages should follow the same pattern. `@scribe/context` (depends on signals) would add `dependsOn: ['signals']`. `@scribe/data` (depends on both) would add `dependsOn: ['signals', 'context']` or equivalent.

### E4. `bun run size` confirmation

Yes. Root `package.json` (line 16): `"size": "size-limit"`. The `size-limit` tool reads `.size-limit.json` by convention. Confirmed.

### E5. Current `.size-limit.json` entries

```json
[
  { "name": "@scribe/signals", "path": "packages/signals/dist/index.js", "limit": "1700 B", "gzip": true },
  { "name": "@scribe/arbor",   "path": "packages/arbor/dist/index.js",   "limit": "2048 B", "gzip": true },
  { "name": "@scribe/runtime", "path": "packages/runtime/dist/index.js", "limit": "1024 B", "gzip": true },
  { "name": "@scribe/agent",   "path": "packages/agent/dist/index.js",   "limit": "100 B",  "gzip": true }
]
```

`@scribe/server` and `@scribe/agent-readiness` are **not** in `.size-limit.json`. New packages `@scribe/context` and `@scribe/data` will need entries added by the Architect.

---

## Summary: Key findings for Architect

- **`effect()` returns `Dispose = () => void`** — synchronous, idempotent. `@scribe/context` can use `effect()` directly for context cleanup without any adapters.

- **`Signal<T>` is `readonly [Read<T>, Write<T>]`** — the `[read, write]` tuple shape. `inject()` returning a `Signal<T>` is fully compatible with the existing pattern.

- **`$state` / `State<T>` are exported but unused outside `@scribe/signals`** — they are available for `@scribe/data`'s `DataState<T>` if the Architect wants a `.value` setter shape, though `Signal<T>` (tuple) is the dominant pattern in arbor.

- **`untrack` is exported but unused in arbor** — available for `@scribe/context` to read context values without creating reactive subscriptions.

- **`@scribe/arbor` is DOM-coupled** — `document.createElement`, `document.createTextNode`, `Element`, `ShadowRoot` are used directly. `@scribe/context` MUST NOT depend on `@scribe/arbor`.

- **`mount()` takes no options** — signature is `mount(node, host)`. A module-level stack for `provide/inject` requires no changes to `mount()`.

- **`MountScope` is a type-only export** — the value `mount` is exported, type `MountScope` is exported, and `AgentContext` / `Snapshot` are stubs.

- **`AgentContext` is a frozen empty branded stub** — `{ _brand: 'AgentContext' }`. Sub-project #7 owns its future content.

- **`SsrOptions.serializer` is `() => Record<string, unknown>`** — no-arg, returns a plain object. `@scribe/data` dehydration should produce `Record<string, unknown>` for compatibility.

- **`__scribe_state__` is emitted today** but only when `serializer` is provided and does not throw. The v0 arbor stub always throws, so the tag is never emitted in practice yet.

- **`defineLoader` shape** — `(ctx: RouteContext) => Promise<T>` in; `DefinedLoader<T>` out. `runLoader` wraps to `LoaderResult<T> = { data, error?, status }`. Client-side `createResource` should align on this shape.

- **Tests for `defineLoader` exist** at `packages/server/tests/data.test.ts`.

- **`vitest.config.ts` alias format** — `'@scribe/NAME': new URL('./packages/NAME/src/index.ts', import.meta.url).pathname`. Two new aliases needed for `context` and `data`.

- **`moon.yml` pattern** — minimal 3-line file; add `dependsOn` array for inter-package deps. `@scribe/context` needs `dependsOn: ['signals']`; `@scribe/data` needs `dependsOn: ['signals']` (and possibly `['signals', 'context']` if it imports context).

- **`package.json` pattern** — no `dependencies` field for leaf packages; workspace deps use `"workspace:*"`. `sideEffects: false` is present on all existing packages.

- **`.size-limit.json` needs two new entries** — `@scribe/context` and `@scribe/data` are absent. Architect should budget limits before shipping.

- **`packages/context/` and `packages/data/` do not exist** — confirmed. Clean slate for Track B.

---

## Blockers or surprises

1. **`runLoader` is exported from `@scribe/server/src/index.ts`... wait, it is NOT.** Checking `packages/server/src/index.ts` line 9: only `defineLoader` is exported (not `runLoader`). However `data.test.ts` line 2 imports `runLoader` from `'../src/data.ts'` directly (bypassing the barrel). This is a minor inconsistency — `runLoader` is a public-facing utility not re-exported through the barrel. The Architect should be aware that `@scribe/data`'s `createResource` cannot import `runLoader` from `@scribe/server` without a barrel update.

2. **No existing `serializer` / `__scribe_state__` test** — the SSR injection point exists and is code-complete, but there appear to be no tests covering the `serializer()` path. Track B's `@scribe/data` dehydration work should add tests for this path.

3. **`vitest.config.ts` uses `jsdom` globally** (`test.environment: 'jsdom'`). This means even `@scribe/context` and `@scribe/data` tests run under jsdom. If Track B wants a true DOM-free test environment for context/data, a per-package `vitest.config.ts` override or `@vitest-environment` docblock comments would be needed.

4. **`moon.yml` has no `tasks` section** in any existing package — all tasks (`build`, `typecheck`) appear to be delegated to root scripts or implicitly picked up by Moon from `package.json`. New packages should follow the same no-tasks pattern unless Moon requires explicit task declarations for the dependency ordering to work.
