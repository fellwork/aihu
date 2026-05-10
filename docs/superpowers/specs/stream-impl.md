# Spec: Streaming Text I/O — Implementation Design (v0.4.0)

**Status:** DRAFT — for Builder dispatch
**Date:** 2026-05-07
**Author:** Stream Architect (read-only research; no source files modified)
**Symmetric with:** `docs/superpowers/specs/live-binding-impl.md` (`$live` / `@agent` block)
**Feeds into:** fellwork agentic communication keystone

---

## Problem

aihu components have no first-class primitive for consuming a streaming text source — an AI provider response, a server-sent event feed, or a raw `ReadableStream<string>` body — and wiring it into reactive DOM. Today, an author must manually manage `ReadableStream` reader loops, signal updates, error states, and abort lifecycles inside `$action` bodies. This is error-prone, verbose, and untestable at the spec level.

Separately, there is no standard way for a server component to declare that it *emits* a stream to its consumer — the symmetric server-side capability to `@agent`'s tool-call surface. And there is no thin adapter layer normalizing OpenAI, Anthropic, and Gemini SDK stream types to `ReadableStream<string>` — so every app reinvents the extraction.

This spec closes all three gaps:

1. **`$stream` collection** in `@state` — client + server, a reactive streaming primitive parallel to `$resource` but for `ReadableStream<string>`.
2. **`@stream` block** — server-side component-level streaming output declaration, symmetric with `@agent`.
3. **`@aihu/ai` package** — thin, pure adapter functions from SDK-specific stream types to `ReadableStream<string>`.
4. **`defineStreamRoute`** in `@aihu/server` — a first-class route handler for streaming HTTP responses.
5. **`@agent` → `$stream` bridge** — the keystone that wires agent tool-call responses directly into a component's reactive stream signals.

---

## Scope

### In scope for v0.4.0

- `$stream` collection parser (`packages/compiler/src/parser/state_macros.rs`) — new `CollectionKind::Stream` variant
- `$stream` codegen lowering (`packages/compiler/src/codegen/emit.rs`) — emits `createStream()` call per entry, or inline lowering if no runtime dep is chosen (see Open Questions §1)
- `@stream` block — compiler parser + codegen (server artifact only); elided from client artifact via `elide_stream` gate, symmetric with existing `elide_agent`
- `__streamBinding` named export in server artifact
- `streamRegistry` and `handleStreamRequest` in `@aihu/agent-service`
- `defineStreamRoute` + `createStreamMiddleware` in `@aihu/server`
- `packages/ai/` new package with `fromOpenAI`, `fromAnthropic`, `fromGemini`, `fromResponse` adapters
- `@agent` → `$stream` bridge documentation and call-path spec

### Deferred to v0.5.0 or later

- MCP streaming tools — explicitly deferred; do not spec here
- `ReadableStream<Uint8Array>` (binary) support — `$stream` v0.4.0 is `string` only (see Open Questions §3)
- `$stream` over WebSocket transport
- Multi-output `@stream` (one component streaming multiple named outputs simultaneously)
- `@aihu/ai` automatic SSE parsing (server-sent events with `data:` prefix stripping)

---

## Architecture layers

### Layer 1 — Compiler: `$stream` collection

#### 1.1 Syntax

```aihu
@state {
  $stream: {
    chat: {
      source: () => fetch('/api/chat', { method: 'POST', body: body }).then(r => r.body),
      describe: 'AI chat response stream',
    }
  }
}
```

The collection-form follows the exact same metadata-bag shape as `$resource`, `$prop`, and `$action`. The `source` key is a `() => Promise<ReadableStream<string>>` factory. `describe` is optional documentation metadata (no runtime effect — identical to the `describe:` key in other collections).

The bare form (no metadata bag) is NOT supported for `$stream` — source factories are always named. A bare entry like `chat: () => fetch(...)` MUST produce compile error `C553`.

#### 1.2 Parser changes (`packages/compiler/src/parser/state_macros.rs`)

Add `Stream` to `CollectionKind`:

```rust
pub enum CollectionKind {
    Prop,
    Computed,
    Action,
    Resource,
    Effect,
    Lifecycle,
    Event,
    Stream,   // new — v0.4.0
}
```

Register the keyword in `match_collection_keyword`:

```rust
("stream", CollectionKind::Stream),
```

And `collection_keyword_len`:

```rust
CollectionKind::Stream => 6,
```

And `keyword_name`:

```rust
CollectionKind::Stream => "stream",
```

And `c440` (v1-rejection diagnostic for `$stream name = ...` bare form):

```rust
CollectionKind::Stream => (
    "$stream: { <name>: { source: () => ..., describe?: '...' } }",
    "$stream name = ...",
    "see docs/superpowers/specs/stream-impl.md §1.2",
),
```

Bare-entry validation: `$stream` entries MUST use the wrapped form (`is_wrapped == true`). A bare entry triggers `C553: $stream entry '<name>' must use wrapped form { source: () => ... }`. Add this check in `emit_state_macro_entry` (or equivalent per-entry validation).

Validation of required `source:` key: if an entry in a `$stream` collection does not have a `source:` key in its metadata bag, emit `C554: $stream entry '<name>' missing required 'source' key`.

#### 1.3 Codegen lowering (`packages/compiler/src/codegen/emit.rs`)

**`StateImports` additions:**

```rust
struct StateImports {
    // ... existing fields ...
    needs_create_stream: bool,   // new
}
```

Set `needs_create_stream = true` in `scan_state_imports` when `CollectionKind::Stream` is encountered.

**Import emission in `build_function_imports`:**

When `needs_create_stream` is set, add `createStream` to the `@aihu/runtime` import line. This is the lazy-attach pattern identical to `createResource`: SFCs without a `$stream` collection never import `createStream` and incur zero runtime overhead.

**Lowered output** (emitted inside the `setup()` closure):

For each entry `name` in the `$stream` collection with `source: <factory>`:

```typescript
const <name> = createStream(<factory>)
```

Where `createStream` is the runtime function (from `@aihu/runtime`) that returns the reactive stream object with `.value`, `.delta`, `.status`, `.error`, `.start()`, and `.stop()` getters/methods.

The full inline expansion (used when the "inline lowering" option from Open Question §1 is chosen — see that section) is:

```typescript
// Generated for: $stream: { chat: { source: () => fetch(...).then(r => r.body) } }
const _chat_value = signal('')
const _chat_delta = signal('')
const _chat_status = signal('idle')
const _chat_error = signal(null)
let _chat_abort = null

const chat = {
  get value() { return _chat_value() },
  get delta() { return _chat_delta() },
  get status() { return _chat_status() },
  get error() { return _chat_error() },
  async start(source) {
    _chat_abort?.abort()
    _chat_abort = new AbortController()
    _chat_status('streaming')
    _chat_value('')
    _chat_delta('')
    _chat_error(null)
    try {
      const _src = source
        ? (typeof source === 'function' ? await source() : source)
        : await (async () => fetch(...).then(r => r.body))()
      const reader = _src.pipeThrough(new TextDecoderStream()).getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done || _chat_abort.signal.aborted) break
        _chat_delta(value)
        _chat_value(_chat_value() + value)
      }
      _chat_status(_chat_abort.signal.aborted ? 'idle' : 'done')
    } catch (e) {
      _chat_error(e)
      _chat_status('error')
    }
  },
  stop() { _chat_abort?.abort() },
}
onCleanup(() => _chat_abort?.abort())
```

The codegen emits the `source` factory verbatim from the `source:` key in the metadata bag (`entry.meta.iter().find(|(k,_)| k == "source").map(|(_,v)| v)`).

**Multiple entries:** Each entry in the `$stream` collection produces its own independent block of private signal variables and the public accessor object. They share no state. Variable names are prefixed with `_<name>_` to prevent collisions between entries.

**SFCs without `$stream`:** Produce identical output to pre-spec compile. `needs_create_stream` is false; no `createStream` import is added; no new lines appear in the `setup()` closure.

#### 1.4 Key design decisions

- **Signal updates are synchronous per chunk** inside the reader loop. Each `_chat_delta(value)` and `_chat_value(...)` call is a synchronous signal write. The reactive scheduler batches co-microtask signal writes, so if multiple signals update within the same microtask they coalesce into one render tick. In practice each chunk read produces two signal writes (`delta` + `value`); these run in the same synchronous turn and are batched by the scheduler.

- **`_chat_abort` is component-instance-scoped.** It is a plain `let` variable in the `setup()` closure, initialized to `null`. Each component mount creates its own `AbortController` on the first `start()` call. There is no shared state across instances.

- **`stop()` sets status to `'idle'`, not `'error'`.** Abort is intentional user action, not a failure. This is encoded in the `_chat_status(_chat_abort.signal.aborted ? 'idle' : 'done')` branch in the read loop exit path.

- **`chat.value` is a getter, not a raw signal.** The public surface (`chat.value`, `chat.delta`, etc.) uses JavaScript getters that call the underlying signal. This mirrors how `$prop` entries expose signal values without exposing the raw setter to template code. Authors cannot accidentally overwrite `chat.value` from template expressions.

- **The `source` factory is re-evaluated on each `start()` call.** When `start()` is called without an argument, the inline factory (`async () => fetch(...).then(r => r.body)`) is re-invoked. This means it captures whatever closure state is current at call time — e.g., a current message list or form input value. This is the same contract as `$resource`'s fetcher re-evaluation.

- **`chat.value` resets to `''` on each `start()` call.** See Open Question §2 for the alternative (conversation accumulation across starts). The v0.4.0 decision is reset-on-start for token streaming; callers that want conversation history maintain it in a separate `$prop` or `$computed`.

---

### Layer 2 — Runtime: `createStream` in `@aihu/runtime`

#### 2.1 The `createStream` function

`createStream` is exported from `@aihu/runtime`. It takes a source factory and returns a `StreamHandle` object:

```typescript
type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

interface StreamHandle {
  readonly value: string       // getter — calls _value()
  readonly delta: string       // getter — calls _delta()
  readonly status: StreamStatus // getter — calls _status()
  readonly error: Error | null  // getter — calls _error()
  start(source?: ReadableStream<string> | (() => Promise<ReadableStream<string>>)): Promise<void>
  stop(): void
}

function createStream(
  factory: () => Promise<ReadableStream<string>>
): StreamHandle
```

Implementation is a direct extraction of the inline lowering (§1.3) into a reusable factory function. The compiler can choose either to call `createStream(factory)` (runtime dep) or emit the expansion inline (no runtime dep). See Open Question §1.

If the `createStream` runtime function is chosen:

- `createStream` is added to `@aihu/runtime/src/index.ts` exports
- It uses `signal` from `@aihu/signals` internally
- `onCleanup` hook is registered inside `createStream` to abort on component dispose
- Size impact: ~600–900 bytes gz added to `@aihu/runtime` (see §Size budget)

#### 2.2 `onCleanup` integration

The `onCleanup(() => _chat_abort?.abort())` call in the lowered code ensures that if the component is unmounted mid-stream (navigation, conditional render, manual dispose), the reader loop exits cleanly on the next `{ done, value } = await reader.read()` tick via the aborted signal. No listener leak; no dangling `ReadableStreamDefaultReader`.

#### 2.3 Multiple `$stream` entries

Each entry's signals and abort controller are fully independent. There is no coordination between entries. The codegen emits one block per entry with entry-name-prefixed variable names.

Example for `$stream: { chat: {...}, summary: {...} }`:

```typescript
const _chat_value = signal('') ; const _chat_delta = signal('') ; /* ... */
const chat = { /* ... */ }
const _summary_value = signal('') ; const _summary_delta = signal('') ; /* ... */
const summary = { /* ... */ }
```

---

### Layer 3 — Compiler: `@stream` block

#### 3.1 Syntax

```aihu
@stream {
  $output: chat              // required — names the $stream entry to wire
  $scope: authenticated      // optional — same scope enforcement as @agent
  $mime: text/plain          // optional — MIME type hint
}
```

`@stream` is structurally symmetric with `@agent`. It is a block-level declaration, not an `@state` collection entry.

#### 3.2 Parser (`packages/compiler/src/parser/stream_macros.rs` — new file)

Parse a `StreamBlock` struct:

```rust
pub struct StreamBlock {
    pub output: String,             // from $output — required
    pub scope: Option<String>,      // from $scope — optional
    pub mime: Option<String>,       // from $mime — optional
}

pub enum StreamMacroDecl {
    Output(String),
    Scope(String),
    Mime(String),
}
```

Compile errors:
- `C550` — `$output` references a `$stream` entry name not found in `@state`: `C550: @stream $output '<name>' references unknown $stream entry`
- `C551` — `@stream` block present with no `$output` macro: `C551: @stream block requires $output`
- `C552` — Multiple `@stream` blocks in one SFC: `C552: only one @stream block per SFC`

The C550 check requires cross-referencing the parsed `@state` block's `$stream` collection entries with the `@stream` block's `$output` value. This cross-reference is performed in the `parse` phase after both blocks are available.

#### 3.3 Codegen (`packages/compiler/src/codegen/emit.rs`)

**Server artifact:** Append `__streamBinding` export after the component setup function:

```typescript
export const __streamBinding = {
  tag: 'chat-widget',
  output: 'chat',           // the $stream entry name
  scope: 'authenticated',   // undefined if $scope absent
  mime: 'text/plain',       // default: 'text/plain; charset=utf-8'
}
```

`mime` defaults to `'text/plain; charset=utf-8'` when `$mime` is absent.

`__streamBinding` MUST only appear in server artifacts. The `elide_stream` gate in `emit()` mirrors the existing `elide_agent` gate:

```rust
let elide_stream = target == BuildTarget::Client && unit.source.stream.is_some();
```

When `elide_stream` is true, a comment is prepended: `// [client build] @stream block elided`. No `__streamBinding` export is emitted.

**Client artifact:** The `@stream` block produces zero runtime bytes in the client build. grep check over assembled client bundles for `__streamBinding` MUST return zero results (AC8).

**Files that change:**
- `packages/compiler/src/parser/stream_macros.rs` — new file (~100 lines)
- `packages/compiler/src/types.rs` — add `StreamBlock` struct; add `stream: Option<StreamBlock>` to `CompileUnit` (or `SourceUnit`)
- `packages/compiler/src/codegen/emit.rs` — add `emit_stream_binding(unit, tag_name, stream)` function (~40 lines); add `elide_stream` gate; extend fixture test assertions

**Estimated LOC:**
- `stream_macros.rs`: ~120 lines (parser + error types)
- `types.rs`: ~25 lines
- `emit.rs`: ~60 lines (new function + gate + test assertion)
- Total: ~200 lines of Rust

---

### Layer 4 — Runtime: `streamRegistry` and `handleStreamRequest`

#### 4.1 `streamRegistry` in `@aihu/arbor`

Alongside the existing `componentInstanceRegistry` (from live-binding), add a module-private `streamRegistry`:

```typescript
interface StreamBinding {
  tag: string
  output: string
  scope: string | undefined
  mime: string
  getStream: () => StreamHandle
  dispose$: () => boolean
}

const streamRegistry: Map<string, StreamBinding[]> = new Map()
```

When `mount()` detects `__streamBinding` on the component's server artifact, it constructs a `StreamBinding` and calls `registerStreamBinding`. The `getStream` closure captures the component instance's named `$stream` entry (by closing over the `setup()` scope's accessor object).

`registerStreamBinding` follows the same capacity-cap pattern as `registerLiveBinding` (from live-binding spec §6.9): max 1000 entries per tag, WARN log on excess.

`onCleanup` removes the binding from the registry on component unmount.

#### 4.2 `handleStreamRequest` in `@aihu/agent-service`

```typescript
async handleStreamRequest(
  tag: string,
  outputName: string,
  req: Request,
  ctx: RequestContext,
): Promise<Response>
```

Call path:
1. Look up `streamRegistry.get(tag)` — if empty, return `{ error: 'no live stream: <tag>', code: 404 }`
2. Check `binding.scope` against `ctx.userId` + auth plugin (same `checkScope` as `handleToolCall`) — if fails, return 403
3. Get `binding.getStream()` — the live `StreamHandle`
4. If `handle.status === 'streaming'`, pipe the in-progress stream. Otherwise call `handle.start()` and pipe
5. Return a streaming `Response`:

```typescript
return new Response(handle.value /* initial */ + streamToReadableStream(handle), {
  headers: {
    'Content-Type': binding.mime,
    'Transfer-Encoding': 'chunked',
    'X-Aihu-Tag': tag,
    'X-Aihu-Output': outputName,
  },
})
```

The body is a `ReadableStream<Uint8Array>` that enqueues chunks as the `delta` signal fires. Implementation: create a `ReadableStream` whose `start(controller)` polls `handle.delta` via an `effect()` subscription, enqueueing each non-empty delta, and closes when `handle.status === 'done' || 'error'`.

#### 4.3 `createStreamMiddleware` in `@aihu/server`

```typescript
import { createStreamMiddleware } from '@aihu/server'

const streamMiddleware = createStreamMiddleware(agentService)

// Mount alongside asMiddleware():
const handler = composeMiddleware([
  agentService.asMiddleware(),
  streamMiddleware,
])
```

Route path: `POST /__aihu/streams/pipe` with body `{ tag: string, output: string }`.

`createStreamMiddleware` delegates to `agentService.handleStreamRequest`.

---

### Layer 5 — `defineStreamRoute` in `@aihu/server`

#### 5.1 API

```typescript
import { defineStreamRoute } from '@aihu/server'

export default defineStreamRoute(async (req) => {
  const body = await req.json()
  const stream = await openai.chat.completions.create({ stream: true, ... })
  return fromOpenAI(stream)   // @aihu/ai adapter → ReadableStream<string>
})
```

#### 5.2 Implementation

```typescript
type StreamRouteHandler = (req: Request) => Promise<ReadableStream<string>>

function defineStreamRoute(handler: StreamRouteHandler): Route {
  return defineRoute('*', async (req, ctx) => {
    const stream = await handler(req)
    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  })
}
```

`X-Accel-Buffering: no` disables nginx proxy buffering. `Cache-Control: no-cache` prevents intermediate caches from holding the stream.

`defineStreamRoute` is added to `packages/server/src/` as `stream-route.ts` and re-exported from `packages/server/src/index.ts`.

#### 5.3 Error handling

If `handler` throws, `defineStreamRoute` catches and returns `500` with body `{ error: 'stream handler error' }` (same `serverError` pattern as `api.ts`). If the stream source closes with an error mid-stream, the `Response` body closes abruptly — clients that detect this (via SSE or chunked transfer EOF) must handle reconnect themselves. A future `defineStreamRoute` v2 will expose a structured error event.

---

### Layer 6 — `@aihu/ai` package

#### 6.1 Package layout

```
packages/ai/
  package.json    name: "@aihu/ai", version: "0.1.0", type: "module"
  src/
    index.ts      re-exports all adapters
    openai.ts     fromOpenAI(stream) → ReadableStream<string>
    anthropic.ts  fromAnthropic(stream) → ReadableStream<string>
    gemini.ts     fromGemini(stream) → ReadableStream<string>
    response.ts   fromResponse(res: Response) → ReadableStream<string>
```

**Not browser-eligible.** No row in `.size-limit.json`. Server/build-time only.

#### 6.2 `fromOpenAI`

```typescript
// openai.ts
import type { Stream } from 'openai/streaming'
import type { ChatCompletionChunk } from 'openai/resources'

export function fromOpenAI(
  stream: AsyncIterable<ChatCompletionChunk> | Stream<ChatCompletionChunk>
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) controller.enqueue(text)
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}
```

#### 6.3 `fromAnthropic`

```typescript
// anthropic.ts
import type { MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages'

export function fromAnthropic(
  stream: AsyncIterable<MessageStreamEvent>
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const text = event.delta.text
            if (text) controller.enqueue(text)
          }
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}
```

#### 6.4 `fromGemini`

```typescript
// gemini.ts
import type { GenerateContentStreamResult } from '@google/generative-ai'

export function fromGemini(
  stream: AsyncIterable<GenerateContentStreamResult>
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          if (text) controller.enqueue(text)
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}
```

#### 6.5 `fromResponse`

```typescript
// response.ts
export function fromResponse(res: Response): ReadableStream<string> {
  if (!res.body) throw new TypeError('fromResponse: Response has no body')
  return res.body.pipeThrough(new TextDecoderStream())
}
```

For raw `fetch()` responses. Also used internally by the `$stream` default source pattern when the author writes `source: () => fetch(...).then(r => r.body)` and wants typed text chunks.

#### 6.6 Peer dependencies

`@aihu/ai` does NOT bundle the AI SDKs. They are peer dependencies:

```json
{
  "peerDependencies": {
    "openai": ">=4.0.0",
    "@anthropic-ai/sdk": ">=0.20.0",
    "@google/generative-ai": ">=0.3.0"
  },
  "peerDependenciesMeta": {
    "openai": { "optional": true },
    "@anthropic-ai/sdk": { "optional": true },
    "@google/generative-ai": { "optional": true }
  }
}
```

Each adapter file imports from the respective SDK. Consumers install only the SDKs they use. Type-only imports (`import type { ... }`) prevent runtime errors when a peer is absent (the type is erased at runtime; the adapter is only called if the SDK is present).

#### 6.7 Zero framework deps

`@aihu/ai` imports nothing from `@aihu/*`. It uses only the Web Streams API (available in all modern runtimes and Bun). It is safe to use in any Node.js/Bun/Cloudflare Workers context.

---

### Layer 7 — `@agent` → `$stream` bridge

This is the keystone that makes fellwork's agentic communication concrete. It wires an `@agent` action that returns a `ReadableStream` directly into a component's `$stream` reactive signals.

#### 7.1 SFC authoring pattern

```aihu
@state {
  $stream: {
    reply: {
      source: () => null,     // initially idle; started by agent dispatch
      describe: 'Agent streaming reply',
    }
  }
}

@agent {
  $stream: reply              // wire agent responses → 'reply' $stream entry
  $scope: authenticated
}
```

The `$stream: reply` macro inside `@agent` is parsed as `AgentMacroDecl::Stream(String)` and stored in `AgentBlock::stream_output: Option<String>`.

#### 7.2 Compiler emission

The `__agentBinding` export gains a new `streamOutput` field when `$stream` is declared inside `@agent`:

```typescript
export const __agentBinding = {
  tag: 'chat-widget',
  actions: { /* ... */ },
  reads:   { /* ... */ },
  writes:  { /* ... */ },
  scope:   'authenticated',
  streamOutput: 'reply',    // new — the $stream entry name to pipe into
}
```

#### 7.3 Full call path

```
MCP tool call (JSON-RPC 2.0)
  ↓
handleToolCall('chat-widget/askQuestion', { prompt: '...' }, ctx)
  ↓ [agent-service.ts]
  checkScope(binding, ctx)          → 403 if fails
  checkRateLimit(binding, ctx)      → 429 if exhausted
  ↓
LiveBinding.callAction('askQuestion', [{ prompt: '...' }])
  ↓ [component setup() closure]
  action body executes:
    return fetch('/api/ai', { method: 'POST', body: JSON.stringify(args) })
           .then(r => fromResponse(r))   // → ReadableStream<string>
  ↓
callAction returns ReadableStream<string>
  ↓ [agent-service.ts — stream bridge, new logic]
  if (binding.streamOutput && result instanceof ReadableStream) {
    const streamHandle = binding.getStreamHandle(binding.streamOutput)
    streamHandle.start(result)          // non-awaited — fires and returns
    return { streaming: true, output: binding.streamOutput }
  }
  ↓
MCP tool response: { streaming: true, output: 'reply' }
  ↓
[component's $stream 'reply' entry]
  _reply_status('streaming')
  per-chunk: _reply_delta(chunk), _reply_value(accumulated)
  on done: _reply_status('done')
  ↓
reactive render: template expressions reading reply.value update each chunk
```

#### 7.4 `LiveBinding` extension

The `LiveBinding` interface gains one new method:

```typescript
interface LiveBinding {
  // ... existing fields ...
  getStreamHandle(name: string): StreamHandle | null
}
```

`getStreamHandle` is populated in `__agentBinding` alongside `reads` and `writes`, via a `streams` field:

```typescript
export const __agentBinding = {
  tag: 'chat-widget',
  // ...
  streams: {
    reply: () => reply,   // closes over the $stream accessor from setup()
  },
}
```

`LiveBinding.getStreamHandle(name)` calls `__agentBinding.streams[name]()` to get the live `StreamHandle`.

#### 7.5 Security boundary

The stream-output bridge follows the same `checkScope` + `checkRateLimit` ordering as the normal `handleToolCall` path. A successful scope check is a prerequisite for calling `streamHandle.start()`. An unauthenticated caller cannot trigger streaming even if they know the entry name.

`streamHandle.start()` is called fire-and-forget (not awaited) before the MCP response is returned. The MCP caller receives `{ streaming: true, output: 'reply' }` immediately and can subscribe to updates via the component's live-binding reads (`reads.reply_status`, `reads.reply_value`) through subsequent tool calls, or via a separate HTTP streaming endpoint (`handleStreamRequest`).

---

## Acceptance criteria (for the Builder)

1. **AC1 — `$stream` parser:** `cargo test -p aihu-compiler` includes a test asserting that `$stream: { chat: { source: () => fetch('/api/chat').then(r => r.body), describe: 'chat' } }` parses to `CollectionKind::Stream` with one entry named `chat`, `is_wrapped: true`, and `source` key present in metadata.

2. **AC2 — `$stream` codegen signals:** The compiler fixture for a `$stream: { chat: { source: ... } }` SFC emits code containing `signal('')` (for `_chat_value` and `_chat_delta`), `signal('idle')` (for `_chat_status`), `signal(null)` (for `_chat_error`), and both `start` and `stop` function bodies.

3. **AC3 — `chat.value` accumulation:** Unit test in `@aihu/runtime` (or `@aihu/arbor`): feed a `ReadableStream<string>` with three chunks `['Hello', ' ', 'world']` into `createStream`; after all chunks, `handle.value === 'Hello world'`; `handle.delta === 'world'`; `handle.status === 'done'`.

4. **AC4 — `stop()` aborts mid-stream:** Unit test: start a `createStream` with an infinite ReadableStream; call `stop()`; assert `handle.status === 'idle'` and `handle.value` is the partial accumulation (whatever was received before stop).

5. **AC5 — Status lifecycle (success):** Unit test: `idle → streaming` on `start()`; `streaming → done` after stream closes. Assert each status value is seen in order.

6. **AC6 — Status lifecycle (error):** Unit test: provide a stream that throws; assert `handle.status === 'error'` and `handle.error` is the thrown `Error` instance after rejection.

7. **AC7 — Multiple entries no cross-contamination:** SFC with `$stream: { a: { source: ... }, b: { source: ... } }` emits independently prefixed variables (`_a_value`, `_b_value`, etc.); `a.start()` does not affect `b.status`.

8. **AC8 — SFC without `$stream` unchanged:** A fixture SFC without a `$stream` collection produces byte-identical compiler output to pre-spec. The `@aihu/runtime` import line does NOT contain `createStream`. (Regression gate — run before and after the parser change; diff must be empty.)

9. **AC9 — `@stream` block server artifact:** A fixture SFC with `@stream { $output: chat $scope: authenticated }` and `@state { $stream: { chat: { source: ... } } }` produces a server artifact containing `export const __streamBinding = { tag: '...', output: 'chat', scope: 'authenticated', mime: 'text/plain; charset=utf-8' }`.

10. **AC10 — `@stream` block client artifact elision:** The same SFC's client artifact contains no occurrence of the string `__streamBinding`. CI grep check validates this over assembled bundles (parallel to the live-binding `__agentBinding` grep check from AC1 of that spec).

11. **AC11 — `$output` unknown entry → C550:** An SFC with `@stream { $output: nonexistent }` and no `$stream: { nonexistent: ... }` in `@state` produces compile error `C550`.

12. **AC12 — `defineStreamRoute` response headers:** `defineStreamRoute(async () => readableStream)` invoked with a mock `Request` returns a `Response` with `Content-Type: text/plain; charset=utf-8` and a readable body. (Unit test in `@aihu/server`.)

13. **AC13 — `fromOpenAI` extraction:** Unit test in `@aihu/ai`: construct a mock `AsyncIterable<ChatCompletionChunk>` with `choices[0].delta.content` values `['foo', 'bar']`; `fromOpenAI(mock)` produces a `ReadableStream<string>` whose chunks are `['foo', 'bar']`.

14. **AC14 — `fromResponse` wraps body:** `fromResponse(new Response('hello world'))` returns a `ReadableStream<string>` whose accumulated text is `'hello world'`.

15. **AC15 — `@aihu/ai` builds cleanly:** `bun run build` in `packages/ai/` exits with code 0 and produces `dist/index.js`. `bun run test` across the workspace passes (no regressions from new package or changed files).

---

## Implementation sequence

The layers have these dependencies:

```
Compiler Layer 1 ($stream parser)
  → Compiler Layer 3 (@stream block)      (parallel)
  → Runtime Layer 2 (createStream)        (parallel)
      → @aihu/server Layer 5              (depends on Layer 2 types)
      → Runtime Layer 4 (registry)        (depends on Layer 2 types)
          → agent bridge Layer 7          (depends on Layers 1+2+4)
@aihu/ai Layer 6                          (fully independent)
```

**Recommended sequence:**

1. **`@aihu/ai` package** (0.5 day): Fully independent. No compiler or runtime deps. Unblocks AC13, AC14, AC15 immediately. Write and ship first to clear the adapter surface.

2. **Types first** (1 day): Add `CollectionKind::Stream`, `StreamBlock`, `stream: Option<StreamBlock>` to `CompileUnit`, `StreamHandle` interface in `@aihu/runtime`. Fixes the interface contract that both compiler and runtime work against.

3. **Compiler `$stream` parser** (1–2 days): Add `Stream` to `CollectionKind`, keyword registration, bare-form rejection, source-key validation. Compiler fixture tests AC1, AC2, AC7, AC8.

4. **Runtime `createStream`** (1–2 days): Implement `createStream` in `@aihu/runtime`. Unit tests AC3, AC4, AC5, AC6.

5. **Compiler `@stream` block** (1 day): `stream_macros.rs` parser, `emit_stream_binding`, `elide_stream` gate. Tests AC9, AC10, AC11. Can parallel with step 4.

6. **`defineStreamRoute` + `createStreamMiddleware`** (1 day): Depends on Step 2 types. Tests AC12.

7. **`streamRegistry` + `handleStreamRequest`** (1–2 days): Depends on Steps 3+4. Extends `@aihu/arbor` mount path.

8. **Agent bridge Layer 7** (1–2 days): Depends on live-binding (existing) + Steps 3+4+7. Extends `LiveBinding` with `getStreamHandle`; extends `__agentBinding` codegen.

9. **Integration + workspace test run** (0.5 day): AC15 full workspace pass; CI grep check.

**Can Layers 1, 3, and 6 be parallelized?**

Yes. After step 2 (types), the compiler parser (step 3), the `@stream` block compiler (step 5), and `@aihu/ai` (step 1) can all proceed in parallel worktrees. The compiler work (steps 3, 5) and the runtime work (step 4) can also overlap after types are fixed.

---

## Size budget

Per `.size-limit.json` conventions: `@aihu/runtime` has a `2900 B` gz limit; `@aihu/arbor` has a `2200 B` gz limit (ignoring `@aihu/signals`). `@aihu/agent-service` has a `600 B` limit. `@aihu/ai` is server/build-time only and MUST NOT get a size row.

| Package | Addition | Rationale |
|---|---|---|
| `@aihu/runtime` | ~600–900 bytes gz | `createStream` function: 4 signals, reader loop, abort controller, `onCleanup` registration. Lazy-attach: only imported when `$stream` collection is present. |
| `@aihu/arbor` | ~200–300 bytes gz | `streamRegistry` Map, `registerStreamBinding`, capacity check. Lazy-attach: only called when `__streamBinding` detected at mount. |
| `@aihu/agent-service` | ~150–250 bytes gz | `handleStreamRequest`, stream bridge logic in `handleToolCall`. Still within the `600 B` limit; monitor. |
| `@aihu/server` | ~100–150 bytes gz | `defineStreamRoute`, `createStreamMiddleware`. Server-side only; no size row. |
| `@aihu/ai` | N/A (server-only) | New package; NOT browser-eligible; no size row. |
| `@aihu/signals` | 0 bytes | No new signal primitives; `$stream` uses existing `signal()`. |

**Size gate action:** After implementation, run `bun run size` and confirm `@aihu/runtime` stays within `2900 B`. If `createStream` pushes it over, split into a tree-shakeable sub-export (`@aihu/runtime/stream`) so SFCs without `$stream` import nothing. The `needs_create_stream` flag in the compiler's import emitter already supports conditional import of `createStream` only when the collection is used.

**The lazy-attach guarantee:** The `needs_create_stream` flag in `StateImports` ensures `createStream` is only added to the import line when the SFC uses `$stream`. An SFC without `$stream` in its `@state` block never imports `createStream`, so the runtime function is tree-shaken from that component's bundle.

---

## Alternatives considered

### Inline lowering vs. `createStream()` runtime function

The generated code could expand the full signal/loop body inline (no `createStream` import) or delegate to a `createStream()` call in `@aihu/runtime`. The tradeoff:

- **Inline:** Zero new runtime dep for `@aihu/runtime`; each component carries its own reader-loop code. Bundle size grows linearly with number of `$stream` entries across the whole app. For apps with many streaming components this is worse.
- **`createStream()`:** One function in `@aihu/runtime`; all `$stream` entries across the app share the implementation. Better for multi-component apps. Adds ~600–900 bytes to `@aihu/runtime` unconditionally (even if only one component uses `$stream`), though the `needs_create_stream` lazy-attach gate limits this to apps that actually use the feature.

Recommendation: `createStream()` in `@aihu/runtime`, gated by `needs_create_stream`. See Open Question §1.

### `$stream` as a `$resource` extension

`$resource` already exists (`CollectionKind::Resource`) and lowers to `createResource()`. One option is extending `$resource` to accept `ReadableStream` sources. This was rejected because:

- `$resource` is semantically a one-shot async data fetch with `loading`/`error`/`data` states. `$stream` is an ongoing read loop with `streaming`/`done`/`error` states and chunk-level `delta`. Conflating them would make `$resource` harder to reason about and the states would be inconsistent.
- The `start()`/`stop()` imperative API on `$stream` has no analog in `$resource` (which is declarative and re-fetches automatically).
- `$resource` resolves to a single value `T`; `$stream` accumulates to a growing `string`. Different update semantics.

### `ReadableStream<Uint8Array>` as the base type

Using `ReadableStream<Uint8Array>` (the browser's native stream type from `fetch().body`) would avoid the `pipeThrough(new TextDecoderStream())` step and make binary streaming possible. This was deferred because:

- 100% of current use cases (AI text completions) are string-based.
- The `TextDecoderStream` step is cheap and keeps the reactive surface typed as `string`, which is what template expressions consume.
- Binary streaming is a separate feature with different ergonomics (Uint8Array signals, blob accumulation).
- See Open Question §3.

### Bidirectional streaming (WebSocket-based)

`$stream` could be extended to support WebSocket connections for bidirectional streaming. Deferred: the current keystone use case is unidirectional AI response streaming (server → client). Bidirectional transport is a v0.6+ concern.

### Per-instance `@stream` port numbering

An alternative `@stream` syntax would allow multiple named outputs:

```aihu
@stream {
  $output: { reply: chat, summary: summaryChat }
}
```

This was simplified to a single `$output` (a single named entry) for v0.4.0. See Open Question §4 regarding multi-output.

---

## Open questions (Director input required before Builder starts)

**1. Inline lowering vs. `createStream()` runtime function (BLOCKING)**

Should `$stream` entries lower to a `createStream(factory)` call importing from `@aihu/runtime`, or should the compiler emit the full signal/loop expansion inline with no new runtime dep?

- **Option A (`createStream()`):** Cleaner compiler output; shared implementation; ~600–900 bytes added to `@aihu/runtime` (gated by `needs_create_stream` lazy-attach). Recommended.
- **Option B (inline):** No new runtime dep; each SFC carries its own reader loop (~250–400 bytes per SFC with `$stream`); bundle grows linearly with `$stream` usage. Better if the runtime budget is tight.

Recommendation: Option A. The `createStream()` approach is consistent with how `createResource()` works for `$resource`.

**2. `chat.value` reset-on-start vs. accumulate-across-starts (BLOCKING)**

When `chat.start()` is called a second time (e.g., user sends a new message), should `chat.value` reset to `''`, or should it retain the previous conversation's accumulated text?

- **Reset (v0.4.0 proposal):** Each `start()` resets `_chat_value('')`. Conversation history must be maintained by the author in a separate `$prop` or `$computed`. Simpler implementation; clearer semantics.
- **Accumulate:** `chat.value` never resets; it concatenates across all `start()` calls. Conversational use cases get history "for free" but the signal grows unboundedly and there is no way to clear it without calling a hypothetical `chat.reset()` method.

Recommendation: Reset. Authors who want history maintain it explicitly:
```aihu
$prop: { messages: { default: [] } }
// in @template: bind reply.value to append to messages on done
```

**3. `ReadableStream<string>` only vs. also `ReadableStream<Uint8Array>` (LOW PRIORITY)**

v0.4.0 spec assumes `ReadableStream<string>` throughout (with `pipeThrough(new TextDecoderStream())`). Should `$stream` also accept `ReadableStream<Uint8Array>` natively (without the TextDecoder step)?

Impact: the `source:` factory return type would become `Promise<ReadableStream<string | Uint8Array>>`, and `createStream` would auto-detect and pipe through `TextDecoderStream` when needed. Adds complexity; low value for current use cases.

Recommendation: Defer to v0.5.0. `string` only for v0.4.0.

**4. Multiple `@stream` outputs in one SFC (DESIGN QUESTION)**

The spec currently restricts one `@stream` block per SFC (C552). Should a future version allow a component to declare multiple streaming outputs? If so, the `streamRegistry` and `handleStreamRequest` API would need to support named output lookup.

Recommendation: Reserve the design space; confirm C552 is correct for v0.4.0 and document the limitation in the SFC authoring guide.

**5. `$stream` source returning `null` (BEHAVIOR QUESTION)**

The agent bridge pattern uses `source: () => null` to indicate "no automatic source; only started by agent dispatch". Should the compiler treat a `null`-returning source as a valid no-op (`start()` with no arg does nothing if source returns null), or should it emit a `C555: $stream source returned null` runtime warning?

Recommendation: `null` return from source should be treated as "do nothing on null-start" — `start()` with no source and a null-returning factory is a no-op. No error; `status` stays `'idle'`. Document this as the agent-wired pattern.

**6. `@stream` block and `@agent` block coexistence (INTERACTION)**

Can a single SFC have both an `@stream` block (declaring a streaming output surface) and an `@agent` block (declaring an MCP tool-call surface) simultaneously? The current spec implies yes (they are independent declarations). Confirm: should C5xx diagnostics cover the case where `@agent` has `$stream: reply` but no `@stream` block is present (or vice versa)?

Recommendation: Allow both blocks in one SFC. `@agent { $stream: reply }` without a corresponding `@stream` block is valid — the agent can start the stream internally without exposing it as an HTTP streaming endpoint. Add an optional INFO-level diagnostic (not an error) when `@agent { $stream: ... }` is present but no `@stream` block is declared.
