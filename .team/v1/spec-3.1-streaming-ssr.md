# Spec 3.1 — Streaming SSR

**STATUS: READY FOR BUILDER**

**Track:** C
**Plan:** 3.1
**Author:** Architect agent
**Date:** 2026-04-30
**Branch:** `feat/v1-ssr-signals`

---

## §1 Summary

Plan 3.1 adds `renderToStream` — a `ReadableStream<string>`-returning function that walks the same arbor `Branch | Leaf` component tree as `renderToString` but can suspend at async data boundaries and flush resolved HTML chunks as they become available. It introduces two new types (`DataSource<T>` and `StreamOptions`) in a new file `packages/server/src/stream-types.ts`, and refactors `renderToString` into a thin drain wrapper over `renderToStream` so that the two functions share the same rendering path with no behavioral divergence. All existing `SsrOptions` semantics are preserved unchanged: `opts.head` produces full `<!DOCTYPE html>` document structure, `opts.hydratable` emits `data-aihu-path` attributes on every branch node, and `opts.serializer` injects the `__aihu_state__` script tag. The `DataSource<T>` interface is defined locally in `@aihu/server` with no dependency on Track B; Track B's `createResource` will implement this interface when it ships.

---

## §2 `DataSource<T>` interface

### File: `packages/server/src/stream-types.ts`

```typescript
import type { SsrOptions } from './ssr.ts'

/**
 * Describes an async data boundary that renderToStream can suspend on.
 * Track B's createResource will implement this interface.
 * Defined here to allow Track C to build and test independently.
 */
export interface DataSource<T> {
  /** Current resolution state. */
  readonly status: 'pending' | 'ready' | 'error'

  /** The resolved value. Defined only when status === 'ready'. */
  readonly value?: T

  /** The rejection reason. Defined only when status === 'error'. */
  readonly error?: unknown

  /**
   * Register a callback to be invoked exactly once when status transitions
   * to 'ready' or 'error'. Returns a dispose function that cancels the
   * registration if called before the transition fires.
   */
  onReady(cb: () => void): () => void
}

/**
 * Options for renderToStream. Extends SsrOptions with streaming-specific fields.
 *
 * v1: no new fields beyond SsrOptions. timeout is explicitly excluded from v1
 * because renderToStream does not implement per-boundary timeouts; callers that
 * need a timeout must race the returned ReadableStream externally (e.g., via
 * AbortController + Response). This is documented as a v2 concern.
 */
export interface StreamOptions extends SsrOptions {}
```

**Rationale for no `timeout` field in v1:** The Director's spec gap analysis (track-c-round-001.md §3 item 5) asked whether `timeout?: number` is needed. For v1, `renderToStream` does not implement a per-boundary timeout internally because doing so correctly requires an abort/cancel path through the `ReadableStream` controller and a way to cancel pending `onReady` registrations. The existing `onReady` already returns a dispose function that enables cancellation, but the timeout plumbing itself adds non-trivial complexity. Callers can achieve equivalent behavior by wrapping the stream with a racing `Promise.race` or `AbortSignal`. The field is explicitly excluded (not merely omitted) so the Builder does not add it without a spec update.

---

## §3 How `renderToStream` encounters a `DataSource`

### Tree structure review

The existing `renderNode` handles two node kinds:

- `{ kind: 'leaf', text: string }` — terminal text node
- `{ kind: 'branch', tag: string, attrs: Record<string, string | boolean>, children: unknown[] }` — element node with recursive children

### Decision: Option A — new optional field on `Branch`

**Chosen:** Option A — add `dataSource?: DataSource<unknown>` as an optional field on the `branch` node kind.

**Definition of an async branch:**

```typescript
// Conceptual — this is the runtime shape renderToStream checks for.
// No changes to arbor's exported types are required for v1 (see rationale below).
interface AsyncBranch {
  kind: 'branch'
  tag: string
  attrs: Record<string, string | boolean>
  children: unknown[]
  dataSource?: DataSource<unknown>
}
```

When `renderToStream` encounters a `branch` node and `dataSource` is present, it treats that branch as an async boundary:

1. The branch's own opening tag and pre-children HTML are enqueued immediately (with `data-aihu-path` if hydratable).
2. If `dataSource.status === 'ready'`, the children are rendered synchronously using the resolved data via `dataSource.value` and enqueued immediately.
3. If `dataSource.status === 'error'`, the stream is errored immediately.
4. If `dataSource.status === 'pending'`, a flush is emitted, `onReady` is registered, and on callback the children are rendered and the closing tag is enqueued. The stream closes after all pending boundaries resolve.

**Why Option A over Option B and Option C:**

- **Option B** (new `{ kind: 'async', ... }` node kind) requires `renderNode` to handle a third `kind` and requires arbor to export this new kind in its public types. This is a wider surface change.
- **Option C** (a special `Leaf` carrying a `DataSource`) is semantically wrong: `DataSource` wraps a subtree that produces a `Branch | Leaf`, not a text value. Forcing it through a `Leaf` shape creates a confusing double-meaning for the `leaf` kind.
- **Option A** requires the fewest changes: `renderNode` already dispatches on `obj.kind === 'branch'` and accesses `obj` as a `Record<string, unknown>`. Adding a `dataSource` check at the top of the `branch` arm is a local, non-breaking addition. No new `kind` is needed. No arbor type changes are required for v1 — `renderToStream` reads `dataSource` off the raw object using a runtime duck-type check, consistent with how `renderNode` already reads `tag`, `attrs`, and `children`.

**Impact on `_materialize`:** There is no `_materialize` function in the current `ssr.ts`. The existing `renderNode` function is the tree walker. `renderToStream` will introduce an async variant of `renderNode` — called `renderNodeAsync` in this spec — that handles the `dataSource` field. The synchronous `renderNode` remains unchanged and is used by the drain path in `renderToString`.

---

## §4 `renderToStream` API and algorithm

### Signature

```typescript
export function renderToStream(
  component: ComponentDescription,
  opts?: StreamOptions,
): ReadableStream<string>
```

The function is synchronous (not `async`). It constructs and returns a `ReadableStream<string>` immediately. All async work happens inside the stream's `start` callback.

### Step-by-step algorithm

#### Step 1 — Constructor pattern (push controller)

```typescript
return new ReadableStream<string>({
  start(controller) {
    // All rendering logic runs here
  }
})
```

`ReadableStream` is constructed with an underlying source object whose `start(controller)` method is called synchronously by the runtime. The `controller.enqueue(chunk: string)` method pushes a chunk. `controller.close()` signals end-of-stream. `controller.error(reason)` signals a stream error. Backpressure: v1 ignores backpressure — `enqueue` is called unconditionally. The WHATWG `ReadableStream` internal queue buffers chunks if the consumer is slow. This is explicitly acceptable for v1 (see Director note §3 item 2).

#### Step 2 — Synchronous tree walk

Inside `start(controller)`:

```
1. Resolve the component:
   - If component is a function: call component() to obtain the root node.
     If the call throws, call controller.error(err) and return.
   - If component is { toHtml() }: call component.toHtml() to obtain a string.
     If the call throws, call controller.error(err) and return.

2. If the component was a { toHtml() } provider:
   - Enqueue the toHtml() string directly (no async boundaries possible).
   - Emit state script and document wrapper as appropriate (see Steps 6–7).
   - controller.close() and return.

3. If the component was a factory (function), the result is an arbor node.
   Pass it to renderNodeAsync().
```

#### Step 3 — `renderNodeAsync` — handling a `DataSource` boundary

`renderNodeAsync` is an internal `async` function (not exported) with signature:

```typescript
async function renderNodeAsync(
  node: unknown,
  path: string,
  hydratable: boolean,
  controller: ReadableStreamDefaultController<string>,
): Promise<void>
```

When called on a node:

```
1. If node is not an object, or has no 'kind' field: enqueue '' and return.

2. If kind === 'leaf':
   - Enqueue node.text (or '' if not a string). Return.

3. If kind === 'branch':
   a. Build the opening tag string (tag + attrs + optional data-aihu-path),
      identical to the synchronous renderNode logic.
   b. Check for dataSource field:
      - If absent or not an object: treat as synchronous branch.
        Enqueue opening tag.
        For each child at index i: await renderNodeAsync(child, `${path}.${i}`, hydratable, controller).
        Enqueue closing tag. Return.
      - If present: proceed to async boundary handling below.

4. Async boundary handling (dataSource present):
   a. Enqueue the opening tag (same as synchronous).
   b. If dataSource.status === 'error':
      - Call controller.error(dataSource.error). Return (do not close; controller.error terminates).
   c. If dataSource.status === 'ready':
      - Render children synchronously using the existing synchronous renderNode,
        passing dataSource.value as a context value available to the children.
        (For v1: children are the static node.children array; the DataSource value
        is available on node.dataSource.value but renderNodeAsync does not inject it
        into children — children are the already-constructed arbor nodes in the tree.
        The DataSource boundary in v1 signals a streaming flush point; child content
        is already present in node.children as rendered arbor nodes.)
      - For each child: await renderNodeAsync(child, ...).
      - Enqueue closing tag. Return.
   d. If dataSource.status === 'pending':
      - Register a one-shot callback: const dispose = dataSource.onReady(callback).
      - The callback (async):
          i.  If dataSource.status === 'error': controller.error(dataSource.error). Return.
          ii. For each child: await renderNodeAsync(child, ...).
          iii. Enqueue closing tag.
          iv. Decrement a pending-boundary counter. If counter reaches 0 and the
              synchronous walk is complete: emit state script, emit document close,
              call controller.close().
      - Increment the pending-boundary counter. Return from renderNodeAsync
        (the synchronous walk continues past this boundary; the callback will
        resolve it asynchronously).
```

#### Step 4 — Synchronous fast-path (no `DataSource` boundaries)

When `renderNodeAsync` encounters no `dataSource` fields during the walk, all `await renderNodeAsync(...)` calls resolve immediately (no microtask suspension occurs because there are no pending sources). The entire tree is enqueued in a single microtask tick. After the walk, the state script and document wrapper are emitted, and `controller.close()` is called. The stream consumer receives all chunks without waiting for any async resolution.

This path is functionally equivalent to the current `renderToString` logic and must produce byte-for-byte identical output for the same inputs.

#### Step 5 — Error handling when factory throws

If `component()` throws synchronously inside `start(controller)`:

```typescript
try {
  const root = component()
  // ... continue walk
} catch (err) {
  controller.error(err)
  return
}
```

`controller.error(err)` causes the stream to enter an errored state. The consumer's `for await` loop (or `.pipeTo` chain) will receive the error. This is consistent with how `renderToString` (post-refactor) would surface the error as a rejected `Promise`.

If an async child walk throws (from `renderNodeAsync`) after the stream has started, the error is caught in the `onReady` callback and forwarded to `controller.error`. A thrown error in any part of the walk terminates the stream with an error signal; partial chunks already enqueued remain in the consumer's buffer.

#### Step 6 — `opts.head` produces full document structure

After the component tree walk completes and all pending boundaries resolve:

```
if (opts?.head) {
  // The document wrapper is assembled and split across pre- and post-body chunks:
  // Chunk 1 (emitted BEFORE the root node walk):
  //   `<!DOCTYPE html><html${lang}><head>${headHtml}</head><body>`
  // Chunk 2 (emitted AFTER the root node walk and state script):
  //   `</body></html>`
}
```

This means `renderToStream` must emit the document preamble chunk before starting the tree walk, not after. The algorithm inside `start(controller)` is:

```
1. If opts.head: enqueue preamble chunk.
2. Walk the tree (Steps 2–5 above).
3. After all boundaries resolved: enqueue state script (if serializer present).
4. If opts.head: enqueue `</body></html>`.
5. controller.close().
```

The `buildHead` function from `ssr.ts` is reused unchanged.

#### Step 7 — `opts.hydratable` produces `data-aihu-path` attributes

The `hydratable` flag is threaded through `renderNodeAsync` identically to `renderNode`. When `hydratable` is `true`, each `branch` node's opening tag receives `data-aihu-path="${path}"` appended to its attribute string. The path encoding (`"0"`, `"0.0"`, `"0.1"`, etc.) is identical to the synchronous walker. No additional streaming-boundary markers are emitted in v1 (deferred to v2 per OQ-V6 resolution).

---

## §5 `renderToString` refactor

`renderToString`'s public signature is unchanged:

```typescript
export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string>
```

The body is replaced with a drain loop over `renderToStream`:

```typescript
export async function renderToString(
  component: ComponentDescription,
  opts?: SsrOptions,
): Promise<string> {
  const stream = renderToStream(component, opts)
  const chunks: string[] = []
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return chunks.join('')
}
```

**Why not `for await...of`:** The WHATWG `ReadableStream` does not implement the async iterable protocol natively in all target runtimes listed at the top of `ssr.ts` (Workers, Deno, Bun, Node ESM). Using `getReader()` + `reader.read()` is the most portable pattern and works in all four runtimes. If a future spec update confirms async iterable support across all targets, the loop can be simplified.

**Behavior invariant:** Every existing `renderToString` test must pass without modification after this refactor. The drain loop produces a single concatenated string identical to what `renderToString` returned before.

**`SsrOptions` vs `StreamOptions`:** `renderToString` continues to accept `SsrOptions`. Since `StreamOptions extends SsrOptions` with no additional fields in v1, `renderToStream` accepts `opts?: StreamOptions` and `opts?: SsrOptions` are structurally identical at runtime. No cast is needed.

---

## §6 File changes

### Files to create

| File | What it contains |
|---|---|
| `packages/server/src/stream-types.ts` | `DataSource<T>` interface, `StreamOptions` interface (extends `SsrOptions`). No implementation code. ~25 lines. |
| `packages/server/tests/ssr-stream.test.ts` | Six streaming tests (see §7). |

### Files to modify

| File | Changes |
|---|---|
| `packages/server/src/ssr.ts` | (1) Import `StreamOptions` from `./stream-types.ts`. (2) Add internal `renderNodeAsync` function. (3) Add exported `renderToStream` function. (4) Replace `renderToString` body with drain loop. No changes to `renderNode`, `buildHead`, `escapeAttr`, `SsrOptions`, `MetaTag`, `LinkTag`, `HeadConfig`, or `ComponentDescription`. |
| `packages/server/src/index.ts` | Add three new exports: `export type { DataSource, StreamOptions } from './stream-types.ts'` and `export { renderToStream } from './ssr.ts'`. |

### Files not to touch

- `packages/server/src/router.ts`
- `packages/server/src/middleware.ts`
- `packages/server/src/api.ts`
- `packages/server/src/data.ts`
- `packages/server/src/config.ts`
- `packages/server/src/agent-readiness-config.ts`
- `packages/server/src/types.ts`
- All files outside `packages/server/`

---

## §7 Tests

All six tests go in `packages/server/tests/ssr-stream.test.ts`. Test style follows the existing `ssr.test.ts` and `compliance/ssr-output.test.ts` patterns: `import { describe, it, expect } from 'vitest'`, import from `'../src/ssr.ts'` (or `'../src/stream-types.ts'` for type-shape tests).

### Helper: drain a ReadableStream to a string

```typescript
async function drain(stream: ReadableStream<string>): Promise<string> {
  const chunks: string[] = []
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return chunks.join('')
}
```

---

### Test 1 — Synchronous component streams full document

**Name:** `renderToStream — synchronous { toHtml() } component yields full output`

**What it proves:** When no `DataSource` boundaries exist, `renderToStream` produces the same output as `renderToString` would for an identical call. This is the synchronous fast-path (§4 Step 4).

**Expected output shape:**

```typescript
const stream = renderToStream(
  { toHtml: () => '<p>Hello</p>' },
  { head: { title: 'Test' } },
)
const result = await drain(stream)
expect(result).toMatch(/^<!DOCTYPE html>/)
expect(result).toContain('<title>Test</title>')
expect(result).toContain('<p>Hello</p>')
expect(result).toContain('</body></html>')
```

---

### Test 2 — Already-ready `DataSource` streams synchronously

**Name:** `renderToStream — branch with status:'ready' DataSource streams without suspension`

**What it proves:** A branch node carrying a `DataSource` whose `status` is already `'ready'` is rendered synchronously — no microtask suspension, no `onReady` registration. The stream completes with the full HTML in one pass.

**Setup:** Construct a `DataSource<string>` stub with `status: 'ready'`, `value: 'resolved content'`, `error: undefined`, `onReady: () => () => {}`. Attach it to a branch node.

**Expected output shape:**

```typescript
// The branch's inner children are present in the output.
// The stream does not hang; await drain() resolves immediately.
expect(result).toContain('<div') // the branch's tag
expect(result).not.toContain('pending')
```

---

### Test 3 — Pending `DataSource` yields chunks in order

**Name:** `renderToStream — pending DataSource: pre-boundary HTML arrives before resolution, post-boundary HTML arrives after`

**What it proves:** The stream emits the document preamble and any synchronous HTML before the pending boundary, then emits the resolved boundary content after `onReady` fires. Chunk order is correct.

**Setup:** Create a controllable `DataSource` stub:

```typescript
let resolve!: () => void
const source: DataSource<null> = {
  status: 'pending' as 'pending' | 'ready' | 'error',
  value: undefined,
  error: undefined,
  onReady(cb) {
    resolve = () => { (source as any).status = 'ready'; cb() }
    return () => {}
  },
}
```

**Algorithm:**

```typescript
const stream = renderToStream(
  () => ({
    kind: 'branch',
    tag: 'div',
    attrs: {},
    children: [{ kind: 'leaf', text: 'async content' }],
    dataSource: source,
  }),
  { head: { title: 'Async' } },
)

// Collect chunks as they arrive (not drain — capture order)
const chunks: string[] = []
const reader = stream.getReader()
// Read first chunk (preamble)
const first = await reader.read()
chunks.push(first.value!)
// Now resolve the pending source
resolve()
// Drain the rest
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  if (value) chunks.push(value)
}
reader.releaseLock()

expect(chunks[0]).toContain('<!DOCTYPE html>') // preamble came first
expect(chunks.join('')).toContain('async content') // resolved content present
expect(chunks.join('')).toContain('</body></html>') // document closed
```

---

### Test 4 — Factory throws closes stream with error

**Name:** `renderToStream — component factory that throws causes stream error, not unhandled rejection`

**What it proves:** If `component()` throws synchronously, the `ReadableStream` enters an errored state. The consumer receives the error via the stream (not as an unhandled rejection). No chunks are emitted.

**Expected output shape:**

```typescript
const stream = renderToStream(() => {
  throw new Error('factory exploded')
})
const reader = stream.getReader()
await expect(reader.read()).rejects.toThrow('factory exploded')
reader.releaseLock()
```

---

### Test 5 — `opts.head` produces full document structure in stream output

**Name:** `renderToStream — opts.head produces <!DOCTYPE html>, <html>, <head>, <body> in correct order`

**What it proves:** The document scaffolding produced by `renderToStream` with `opts.head` is structurally correct: `<!DOCTYPE html>` first, `<html lang="...">` with correct lang attribute, `<head>` block with title, meta, and link tags before `<body>`, and `</body></html>` at the end.

**Expected output shape:**

```typescript
const result = await drain(renderToStream(
  { toHtml: () => '<main>content</main>' },
  {
    head: {
      title: 'Full Doc',
      lang: 'en',
      meta: [{ name: 'viewport', content: 'width=device-width' }],
      links: [{ rel: 'stylesheet', href: '/app.css' }],
    },
  },
))
expect(result).toMatch(/^<!DOCTYPE html><html lang="en">/)
const headStart = result.indexOf('<head>')
const headEnd = result.indexOf('</head>')
const bodyStart = result.indexOf('<body>')
expect(headStart).toBeLessThan(headEnd)
expect(headEnd).toBeLessThan(bodyStart)
expect(result.slice(headStart, headEnd)).toContain('<title>Full Doc</title>')
expect(result.slice(headStart, headEnd)).toContain('name="viewport"')
expect(result.slice(headStart, headEnd)).toContain('rel="stylesheet"')
expect(result).toMatch(/<\/body><\/html>$/)
```

---

### Test 6 — `opts.hydratable` produces `data-aihu-path` attributes in stream output

**Name:** `renderToStream — opts.hydratable: true emits data-aihu-path on branch nodes`

**What it proves:** The `hydratable` flag is honored in streaming mode. Branch nodes receive `data-aihu-path` attributes identical to those emitted by `renderToString` with the same flag.

**Expected output shape:**

```typescript
const result = await drain(renderToStream(
  () => ({
    kind: 'branch',
    tag: 'section',
    attrs: {},
    children: [
      {
        kind: 'branch',
        tag: 'p',
        attrs: {},
        children: [{ kind: 'leaf', text: 'hi' }],
      },
    ],
  }),
  { hydratable: true },
))
expect(result).toContain('data-aihu-path="0"')
expect(result).toContain('data-aihu-path="0.0"')
```

---

## §8 Node ESM `ReadableStream` decision

### Finding

`packages/server/package.json` does not contain an `engines` field. The minimum Node version for the aihu mono-repo is therefore not declared at the package level.

The comment at the top of `packages/server/src/ssr.ts` specifies the target runtimes as: **Workers, Deno, Bun, Node ESM.** `ReadableStream` is a WHATWG global available natively in:

- Cloudflare Workers: yes (always available globally)
- Deno: yes (globally available since Deno 1.x)
- Bun: yes (globally available)
- Node ESM: globally available since **Node 18.0.0** (added to the global scope in Node 18.0.0 as part of the WHATWG Streams API implementation; in Node 16 it exists only as `require('stream/web').ReadableStream` and is NOT a global)

### Decision

**Use `ReadableStream` directly as a global — no import required — and add an `engines` field to `packages/server/package.json` declaring `"node": ">=18.0.0"`.**

Rationale:

1. Node 16 reached end-of-life on 2023-09-11. Supporting it in new v1 features is unjustified maintenance cost.
2. All other specified runtimes (Workers, Deno, Bun) have always exposed `ReadableStream` as a global.
3. Adding `"engines": { "node": ">=18.0.0" }` to `package.json` documents this decision as a hard constraint and causes `npm install` / `pnpm install` to warn when run on an older Node.

### Required package.json change

```json
// packages/server/package.json — add engines field:
"engines": {
  "node": ">=18.0.0"
}
```

This is a one-line config change. The Builder must include it as part of the 3.1 commit.

### Exact import pattern

```typescript
// No import needed. Use directly:
return new ReadableStream<string>({ ... })
```

If the Builder discovers a TypeScript `lib` configuration that does not include `ReadableStream` in scope, the correct fix is to ensure `"lib"` in `tsconfig.json` includes `"DOM"` or `"WebWorker"` (either provides the WHATWG `ReadableStream` type), or add `/// <reference lib="dom" />` at the top of `ssr.ts`. Do NOT import from `'stream/web'`.

---

## §9 Resolved open questions

### OQ-V5 — Streaming return type

**RESOLVED.** `renderToStream` returns `ReadableStream<string>` — bare WHATWG type, no wrapper. Rationale: maximum interop with standard `Response` / fetch APIs; wrapping adds bytes and reduces composability. A richer ergonomics wrapper (e.g., `AihuStream`) is deferred to v2 if desired.

### OQ-V6 — SSR dehydration in streaming mode

**RESOLVED.** `renderToStream` inherits existing `hydratable` / `data-aihu-path` behavior unchanged. The same `renderNode`-equivalent logic that emits `data-aihu-path` attributes on branch nodes in `renderToString` is replicated in `renderNodeAsync`. No additional streaming-boundary dehydration markers (e.g., `data-aihu-stream-boundary`) are emitted in v1. Streaming-boundary dehydration is deferred to v2.

---

## Appendix — Backpressure stance (explicit)

Per Director note track-c-round-001.md §3 item 2: v1 ignores backpressure. `renderToStream` calls `controller.enqueue()` unconditionally without checking `controller.desiredSize`. The WHATWG `ReadableStream` internal queue absorbs all chunks. This is acceptable for v1 because:

1. SSR responses are typically consumed immediately by a server writing to an HTTP response, where the OS TCP buffer provides natural backpressure at the network layer.
2. Implementing cooperative backpressure requires transforming `renderNodeAsync` into a coroutine that yields between chunks — significant additional complexity.

A v2 spec may revisit this by gating `enqueue` calls on `controller.desiredSize > 0` using a loop with `await new Promise(...)`.
