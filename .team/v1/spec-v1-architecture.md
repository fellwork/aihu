# Scribe v1 — Architecture Specification

**Status:** DRAFT — authoring session 2026-04-30
**Prerequisite reading:** `.team/phase-3/spec-arbor.md`, `.team/agent-readiness/spec-agent-readiness.md`, `.team/compiler/plan-compiler.md`
**Governs:** All new packages and compiler additions targeting v1. Supersedes informal sub-project notes in phase-3 and phase-5 specs.

---

## 0. Why this spec exists

Three architectural questions arose during v1 planning that need locked answers before any v1 Builder starts:

1. **Agentic behavior** — should it be inside components or a layered service above them?
2. **Data protocol** — how does the framework handle async state without locking to magna?
3. **Dual-surface components** — how does one SFC serve both human UI interaction and agent programmatic interaction from the same signal graph?

The answers here constrain the compiler (`<agent>` block grammar, codegen), the new packages (`@scribe/data`, `@scribe/context`, `@scribe/agent-service`), and the v1 reconciler. They must be agreed before any of those projects spec.

---

## 1. Layered architecture

The full v1 stack is five layers. **Layers 0–3 are the framework. Layer 4 is adapters. No layer imports from a layer above it.**

```
Layer 4 │ Adapters        @scribe/agent-service  @scribe/data-fetch  @fellwork/magna-scribe
        │                 @scribe/agent-mcp       @scribe/data-ws     @scribe/agent-a2a
        │                 (all optional, all swappable, none in browser bundle)
────────┤
Layer 3 │ Surface         @scribe/agent           @scribe/data
        │                 AgentManifest + registry  createResource protocol
        │                 Declared capabilities     DataSource<T> interface
        │                 (agent block emits here)  (adapters satisfy here)
────────┤
Layer 2 │ Runtime         @scribe/runtime         @scribe/context
        │                 defineComponent           provide / inject
        │                 defineElement             signal-keyed context tree
────────┤
Layer 1 │ DOM             @scribe/arbor
        │                 branch / leaf / mount / when / each
        │                 path keys on every _mountEffect
────────┤
Layer 0 │ Reactive        @scribe/signals
        │                 signal / computed / effect / batch / untrack
```

**Hard rules:**
- Layer 0–2 ship in the browser bundle. Size budget enforced by `size-limit`.
- Layer 3 (`@scribe/agent`, `@scribe/data`) is browser-safe but not required in every app.
- Layer 4 is **server/edge only**. None of it enters the browser bundle.
- `@fellwork/magna-scribe` is not in `packages/` — it lives in a separate repo. Scribe has zero knowledge of magna.

---

## 2. Component surfaces

A `.scribe` SFC has three surfaces, all derived from one signal graph:

```
<script setup>   →   Signal Graph   →   <template>   (visual surface — for humans)
                                    →   <agent>      (agent surface — for AI/agents)
                                    →   props/events (programmatic surface — for parent components)
```

**Signals are the shared truth.** The template is a reactive projection of signal state into the DOM. The agent surface is a typed, schema-annotated projection of signal state into a serializable manifest plus live bindings. The programmatic surface is the custom element's `observedAttributes` + `CustomEvent` protocol.

Nothing in the signal graph is automatically exposed to agents. The `<agent>` block is an **explicit allowlist**. Signals not listed there are private.

---

## 3. AgentManifest format

`AgentManifest` is the serializable, wire-transmittable description of a component's agent surface. It travels to other agents over MCP, A2A, ACP, or any protocol. It never contains function references.

### 3.1 TypeScript types

```typescript
// @scribe/agent — public export in v1

export interface AgentManifest {
  /** Custom element tag name. */
  tag: string
  /** Human and agent readable summary of what this component does. */
  describes?: string
  /** Observable state declarations. */
  state?: Record<string, AgentStateDecl>
  /** Callable action declarations. */
  actions?: Record<string, AgentActionDecl>
  /**
   * Open index signature — forward-compatible with new protocol fields.
   * ACP, A2A, and future protocols may add top-level keys here.
   * Compilers and adapters MUST preserve unknown keys on serialization.
   */
  [key: string]: unknown
}

export interface AgentStateDecl {
  /** Human-readable description for the consuming agent. */
  description: string
  /** JSON Schema (draft-07) describing the signal value type. */
  schema: JSONSchema7
  /** Whether an agent can read this value. Always true if declared. */
  readable: true
  /** Whether an agent can write this value directly (not via an action). */
  writable: boolean
  /**
   * When true, this state emits a stream of updates rather than a snapshot.
   * The adapter must subscribe rather than snapshot.
   */
  streaming?: boolean
}

export interface AgentActionDecl {
  /** Human-readable description of what the action does. */
  description: string
  /** JSON Schema for action arguments (omit if action takes no args). */
  inputSchema?: JSONSchema7
  /**
   * JSON Schema for the return value.
   * void actions omit this; async actions declare the resolved type;
   * streaming actions declare the per-chunk type wrapped in StreamDecl.
   */
  outputSchema?: JSONSchema7 | StreamDecl
  /**
   * Whether this action streams incremental results.
   * Sync and Promise-returning actions: false.
   * AsyncIterable / ReadableStream actions: true.
   */
  streaming: boolean
  /**
   * Informational precondition — a signal expression that must be true
   * before the action is valid. Not enforced by the runtime; used by
   * agent services to avoid redundant calls and for documentation.
   * Example: "status === 'idle'"
   */
  pre?: string
  /**
   * Signals that this action pre-fills before calling the underlying function.
   * Agent-facing invocations receive these as named arguments;
   * the adapter calls the corresponding setters before the action body runs.
   * Example: ["name", "email"] → adapter calls setName(args.name), setEmail(args.email)
   */
  sets?: string[]
}

export interface StreamDecl {
  kind: 'stream'
  /** Schema for each emitted chunk. */
  chunkSchema: JSONSchema7
  /** Schema for the terminal/final value (if any). */
  finalSchema?: JSONSchema7
}

// Convenience re-export so adapters don't need a separate json-schema dep.
export type JSONSchema7 = {
  type?: string | string[]
  enum?: unknown[]
  properties?: Record<string, JSONSchema7>
  items?: JSONSchema7
  required?: string[]
  description?: string
  [key: string]: unknown
}
```

### 3.2 Discovery endpoint

`AgentManifest` objects are aggregated by the agent service and exposed per-protocol:

| Protocol | Endpoint | Notes |
|---|---|---|
| MCP | `/.well-known/mcp/server-card.json` | Already shipped. Tools map to `actions`, resources to `state`. |
| A2A (Google) | `/.well-known/agent.json` | New adapter needed. `AgentManifest` maps to AgentCard format. |
| ACP | `/.well-known/acp/agent-card.json` | New adapter needed. Capability block maps from manifest. |
| `llms.txt` | `/llms.txt` | Already shipped. Components section populated from registry. |

**The manifest is the source. Adapters translate. The manifest never changes per-protocol.**

### 3.3 Protocol compatibility

All three protocols can be satisfied by adapters that translate from `AgentManifest`:

| Concern | MCP | A2A | ACP | Scribe manifest field |
|---|---|---|---|---|
| Capability advertisement | `tools[]` | AgentCard `skills[]` | `capabilities` | `actions` |
| State observation | `resources[]` | Task streaming | Event streaming | `state` (streaming: true) |
| Action invocation | `tools/call` | Task submit | Message send | `actions[name]` |
| Streaming result | (in progress) | Task update stream | SSE | `streaming: true` |
| Auth | `auth` block | AgentCard auth | Bearer/OAuth | `McpAuthConfig` |

**Action return types map to protocol invocation models:**

```typescript
// Sync   → MCP tools/call, OpenAI tool call
() => T

// Async  → ACP message, A2A task (resolved on completion)
() => Promise<T>

// Stream → A2A task streaming updates, ACP SSE
() => AsyncIterable<T>   |   () => ReadableStream<T>
```

The Layer 4 adapter negotiates: if the protocol expects sync and the action returns `Promise`, the adapter awaits. If the protocol expects streaming and the action is sync, the adapter wraps in a single-value stream.

---

## 4. `<agent>` block grammar

The `<agent>` block is an optional fourth top-level block in a `.scribe` SFC alongside `<script setup>`, `<template>`, and `<style>`.

### 4.1 Grammar (EBNF sketch)

```
agent-block    ::= '<agent>' NL agent-body '</agent>'
agent-body     ::= describes? state-section? actions-section? extension*
describes      ::= 'describes:' STRING NL
state-section  ::= 'state:' NL (INDENT state-decl NL)+
actions-section::= 'actions:' NL (INDENT action-decl NL)+
extension      ::= IDENT ':' VALUE NL   -- passes through to AgentManifest index sig

state-decl     ::= IDENT ':' STRING '->' type-expr writable?
writable       ::= '(writable)'
type-expr      ::= ts-type-expression   -- parsed by OXC type parser

action-decl    ::= IDENT ('(' param-list ')')? ':' STRING NL
                   (INDENT action-modifier NL)*
action-modifier::= 'returns:' type-expr
               |   'pre:' expr
               |   'sets:' ident-list
               |   'streaming'
param-list     ::= param (',' param)*
param          ::= IDENT ':' type-expr
```

### 4.2 Full example

```scribe
<script setup name="x-contact-form">
import { signal } from '@scribe/signals'

const [name, setName] = signal('')
const [email, setEmail] = signal('')
const [status, setStatus] = signal<'idle' | 'submitting' | 'done' | 'error'>('idle')
const [_retries, _setRetries] = signal(0)  // internal — not in <agent> block

async function submit() {
  setStatus('submitting')
  try {
    await fetch('/api/contact', {
      method: 'POST',
      body: JSON.stringify({ name: name(), email: email() })
    })
    setStatus('done')
  } catch {
    setStatus('error')
  }
}
</script>

<template>
  <form @submit.prevent="submit">
    <input :value="name" @input="e => setName(e.target.value)" placeholder="Name" />
    <input :value="email" @input="e => setEmail(e.target.value)" placeholder="Email" />
    <button type="submit" :disabled="status === 'submitting'">
      {{ status === 'submitting' ? 'Sending…' : 'Send' }}
    </button>
  </form>
</template>

<agent>
  describes: "Contact form — fills in and submits name + email to /api/contact"

  state:
    status: "Submission status" -> 'idle' | 'submitting' | 'done' | 'error'

  actions:
    submit(name: string, email: string): "Fill and submit the contact form"
      sets: name, email
      pre: status === 'idle'
      returns: Promise<{ status: 'done' | 'error' }>
</agent>
```

`_retries` is never listed → private. `name` and `email` signals appear in the action's `sets:` list but not in the `state:` section → an agent can set them via the action but cannot read their current value directly.

### 4.3 Privacy model

| Signal listed in `state:` | Listed in action `sets:` | Agent can read | Agent can set |
|---|---|---|---|
| Yes (no `(writable)`) | — | ✓ | ✗ |
| Yes (`(writable)`) | — | ✓ | ✓ |
| No | Yes (via action) | ✗ | ✓ via action only |
| No | No | ✗ | ✗ |
| Not listed anywhere | — | ✗ | ✗ |

**Default: if no `<agent>` block exists, nothing is exposed. Opt-in, not opt-out.**

### 4.4 Compiler artifacts per component

For every `.scribe` file with an `<agent>` block, the compiler emits three exports alongside the standard custom element class:

```typescript
// 1. Custom element — unchanged from v0
export class XContactForm extends HTMLElement { ... }

// 2. Static manifest — serializable, frozen, safe to transmit
export const __agentManifest__: AgentManifest = {
  tag: 'x-contact-form',
  describes: 'Contact form…',
  state: {
    status: {
      description: 'Submission status',
      schema: { enum: ['idle', 'submitting', 'done', 'error'] },
      readable: true,
      writable: false,
      streaming: false,
    }
  },
  actions: {
    submit: {
      description: 'Fill and submit the contact form',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, email: { type: 'string' } },
        required: ['name', 'email'],
      },
      outputSchema: {
        type: 'object',
        properties: { status: { enum: ['done', 'error'] } },
      },
      streaming: false,
      pre: "status === 'idle'",
      sets: ['name', 'email'],
    }
  }
}

// 3. Live bindings factory — NOT serializable, called by agent service at mount time
export function __agentBindings__(element: XContactForm): AgentBindings {
  // accesses the element's closed-over signal scope
  // returns live Signal refs + wrapped action functions
}
```

`AgentBindings` (runtime type, `@scribe/agent` v1):
```typescript
export interface AgentBindings {
  tag: string
  state: Record<string, Signal<unknown>>
  actions: Record<string, (...args: unknown[]) =>
    unknown | Promise<unknown> | AsyncIterable<unknown>>
}
```

---

## 5. Dual-mode action codegen

When the compiler sees an action with `sets:` in the `<agent>` block, it generates two calling paths from one setup function:

**Human path** (DOM event binding — unchanged):
```typescript
// Button onclick wires directly to setup's submit()
// name and email are read from signal state at call time
button.addEventListener('submit', (e) => {
  e.preventDefault()
  submit()
})
```

**Agent path** (emitted in `__agentBindings__` factory):
```typescript
actions: {
  submit: async (args: { name: string; email: string }) => {
    // Pre-fill signals from args (compiler-generated from `sets: name, email`)
    setName(args.name)
    setEmail(args.email)
    // Call the setup function
    await submit()
    // Capture post-action state (compiler-generated from `returns:`)
    return { status: status() }
  }
}
```

The `sets:` expansion looks up the setter for each named signal using the naming convention: `name` → `setName`, `email` → `setEmail` (same convention as OQ-C3 signal identity). If the convention doesn't match (renamed destructure), the `<agent>` block must use an explicit `setter:` modifier.

---

## 6. Data protocol — `@scribe/data`

### 6.1 Design constraints

- Works with any async backend: REST, GraphQL, WebSocket, IndexedDB, magna, mock
- Backend adapters live in separate packages (`@scribe/data-fetch`, `@fellwork/magna-scribe`, etc.)
- Ships in the browser bundle — size budget ~0.4 kB gz
- Signal-native: `DataState<T>` is a `Signal<...>`, not a separate observable
- SSR-aware: server-fetched data serializes into `__scribe_state__`, client rehydrates without re-fetch

### 6.2 Core types

```typescript
// @scribe/data — public surface

export type DataState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready';     readonly data: T }
  | { readonly status: 'error';     readonly error: unknown }
  | { readonly status: 'streaming'; readonly data: T; readonly done: false }

export interface DataSource<T> {
  /** Reactive state — read inside effects/computeds to subscribe. */
  readonly state: Signal<DataState<T>>
  /** Trigger a refetch regardless of cache state. */
  refetch(): void
  /**
   * Mark this resource's cache entry stale.
   * Next read will refetch. Does not trigger an immediate fetch.
   */
  invalidate(): void
}

export interface ResourceOptions<T> {
  /** Initial value before first fetch completes. */
  initialValue?: T
  /** Ms before a cached value is considered stale. Default: 0 (always fresh). */
  staleTime?: number
  /** Ms to keep value in cache after last subscriber. Default: 300_000 (5 min). */
  cacheTime?: number
  /** Custom equality — if returns true, no re-render on refetch. */
  equals?: (a: T, b: T) => boolean
}

/**
 * Create a reactive data resource.
 *
 * @param key   - Reactive cache key. null/undefined disables fetching (idle).
 *                Change the key signal to refetch with a new key.
 * @param fetcher - Any async function: fetch(), GraphQL client, WebSocket, etc.
 *                  Backend-agnostic by design.
 * @param options - Cache and equality options.
 */
export function createResource<T>(
  key: Signal<string | null | undefined>,
  fetcher: (key: string) => Promise<T>,
  options?: ResourceOptions<T>,
): DataSource<T>
```

### 6.3 SSR dehydration / client rehydration

During SSR, `renderToString` collects all `DataSource` instances whose state is `'ready'` and serializes them keyed by their current key value:

```html
<script type="application/json" id="__scribe_state__">
  { "resources": { "/api/user/1": { "status": "ready", "data": { "id": 1, "name": "Alice" } } } }
</script>
```

On the client, before any `createResource` fetcher fires, the runtime checks `__scribe_state__` for a matching key. If found, the resource initializes as `status: 'ready'` with the server-fetched data — no network round-trip.

This is backend-agnostic: magna, REST, GraphQL, any adapter that uses `createResource` gets SSR dehydration for free.

### 6.4 Adapter pattern

```typescript
// @scribe/data-fetch  (separate package, ~0.2 kB)
export function fromFetch<T>(
  url: Signal<string | null>,
  options?: RequestInit,
): DataSource<T>

// @fellwork/magna-scribe  (separate repo, not in scribe monorepo)
export function fromMagna<T>(
  document: TypedDocumentNode<T>,
  variables: Signal<VariablesOf<T> | null>,
): DataSource<T>

// @scribe/data-ws  (separate package)
export function fromWebSocket<T>(
  url: Signal<string | null>,
  message: Signal<unknown>,
): DataSource<T>   // status goes 'streaming' as messages arrive
```

All adapters satisfy `DataSource<T>`. Components use `DataSource<T>` — they never import the adapter directly.

---

## 7. Context API — `@scribe/context`

Required by both `@scribe/data` (cache store) and `@scribe/agent-service` (service handle). Unblocks both.

### 7.1 Design

Signal-based provide/inject. Context is a typed token. Providing creates a signal in the component tree; injecting subscribes to the nearest ancestor's signal.

```typescript
// @scribe/context — ~0.2 kB gz

export interface ContextToken<T> {
  readonly _brand: unique symbol
  readonly defaultValue: T | undefined
}

export function createContext<T>(defaultValue?: T): ContextToken<T>

// In a parent component's setup():
export function provide<T>(token: ContextToken<T>, value: Signal<T> | T): void

// In a child component's setup():
export function inject<T>(token: ContextToken<T>): Signal<T>
// throws if no provider and no defaultValue
```

Context propagates through the custom element tree via a hidden attribute on the element host, keyed by a token ID. Injection traverses `parentElement` until it finds a provider or hits the document root.

---

## 8. Agent service — `@scribe/agent-service`

**Layer 4. Server/edge only. Zero browser bundle footprint.**

The agent service discovers mounted components (via the `AgentManifest` registry + `__agentBindings__` factories), aggregates their capabilities, and exposes them over one or more protocols.

### 8.1 Responsibilities

- Enumerate all registered `AgentManifest` objects from `@scribe/agent`
- When a component mounts: call `__agentBindings__(element)` to get live bindings
- When a component unmounts: release bindings (GC)
- Route inbound protocol calls to the correct action binding
- Route state observation subscriptions to the correct signal
- Stream signal updates to subscribed agents using the protocol's streaming mechanism
- Aggregate manifests into a single app-level manifest for discovery

### 8.2 Protocol adapters

Each protocol is a separate package that takes an `AgentService` instance:

```typescript
// @scribe/agent-mcp  — already partially done via @scribe/agent-readiness
mountMcpAdapter(service: AgentService, options: McpOptions): void

// @scribe/agent-a2a  — Google A2A protocol
mountA2aAdapter(service: AgentService, options: A2aOptions): void

// @scribe/agent-acp  — ACP protocol
mountAcpAdapter(service: AgentService, options: AcpOptions): void
```

One `AgentService`, multiple protocol adapters. Adding a new protocol = new adapter package, no changes to components or `@scribe/agent`.

---

## 9. New packages required for v1

| Package | Layer | Browser? | Size target | Unblocks |
|---|---|---|---|---|
| `@scribe/context` | 2 | ✓ | ~0.2 kB gz | `@scribe/data`, `@scribe/agent-service` |
| `@scribe/data` | 3 | ✓ | ~0.4 kB gz | client data fetching, SSR rehydration |
| `@scribe/agent-service` | 4 | ✗ | no constraint | A2A/ACP/MCP routing |
| `@scribe/data-fetch` | 4 | ✓ (thin) | ~0.2 kB gz | fetch-backed resources |
| `@scribe/agent-a2a` | 4 | ✗ | no constraint | A2A protocol |
| `@scribe/agent-acp` | 4 | ✗ | no constraint | ACP protocol |

`@fellwork/magna-scribe` is a separate repository. It depends on `@scribe/data` as a peer. No scribe package may import from it.

---

## 10. Browser bundle budget update

Adding `@scribe/context` and `@scribe/data` to the client-side layer:

| Package | v0 | v1 target | Delta |
|---|---|---|---|
| `@scribe/signals` | 1.55 kB | 1.55 kB | — |
| `@scribe/arbor` + reconciler | 1.29 kB | ~1.8 kB | +0.5 kB (when/each) |
| `@scribe/runtime` + HMR | 0.48 kB | ~0.6 kB | +0.1 kB |
| `@scribe/context` | — | ~0.2 kB | new |
| `@scribe/data` | — | ~0.4 kB | new |
| **Combined** | **3.46 kB** | **~4.55 kB** | +1.1 kB |

The current 4.0 kB hard budget needs revisiting for v1. Proposed: raise browser layer budget to **5.0 kB gz**, retaining the "under 5 kB for the full reactive + DOM + data + context stack" positioning. This is still well under Svelte (~6 kB), Solid (~7 kB), Vue (~10 kB), React (~45 kB).

---

## 11. Compiler additions required for v1

The v0 compiler (Phases C-0 through C-4) handles `<script setup>` and `<template>`. v1 compiler additions:

| Addition | Phase | Blocks |
|---|---|---|
| `<agent>` block parser | New C-5 | AgentManifest emission, `__agentBindings__` factory |
| Dual-mode action codegen | C-5 | Agent-facing action with `sets:` pre-fill |
| `<style>` block → shadow root injection | C-5 | Scoped styles |
| `<slot>` in template → slot element passthrough | C-5 | Slots |
| Props via `defineProps()` → `observedAttributes` | C-5 | Component props |
| TypeScript template type-checking | C-6 | TS-checked templates |
| Source map: `.scribe` → `.ts` (deferred from C-4) | C-4 | Dev experience |

---

## 12. Open questions (must resolve before affected specs)

| OQ | Question | Affects |
|---|---|---|
| OQ-V1 | Raise browser bundle budget from 4.0 → 5.0 kB gz? | All v1 browser packages |
| OQ-V2 | `<agent>` block: YAML-style DSL vs. TypeScript annotations vs. auto-derived? | Compiler C-5, `AgentManifest` |
| OQ-V3 | Context propagation mechanism: DOM attribute traversal vs. custom element registry? | `@scribe/context` |
| OQ-V4 | `createResource` cache: module-level singleton vs. context-provided store? | `@scribe/data` |
| OQ-V5 | Streaming action return type: `AsyncIterable<T>` only, or also `ReadableStream<T>`? | `AgentActionDecl`, adapters |
| OQ-V6 | SSR dehydration: opt-in per-resource or automatic for all `createResource` calls? | `@scribe/data`, SSR pass |

Recommended resolutions (not binding — Architect must ratify per spec):
- OQ-V1: YES — 5.0 kB
- OQ-V2: YAML-style DSL for v1, TypeScript annotations as v2 option (simpler parser)
- OQ-V3: DOM attribute traversal (no global registry, works with SSR)
- OQ-V4: Context-provided store (composable, testable)
- OQ-V5: `AsyncIterable<T>` only in v1 (`ReadableStream` wrapper utility provided)
- OQ-V6: Opt-in (`{ ssr: true }` in `ResourceOptions`) for v1; automatic in v2

---

*Authored: 2026-04-30. Draft — requires Architect ratification before any v1 Builder dispatch.*
