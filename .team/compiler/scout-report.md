# Scout Report — Compiler Track
**Date:** 2026-04-30
**Role:** Scout (read-only)
**Scope:** Runtime + arbor + signals signatures; Rust toolchain state

---

## defineComponent signature (ACTUAL)

```typescript
// packages/runtime/src/define-component.ts
export function defineComponent(setup: Setup): typeof HTMLElement
```

Takes a **single `Setup` function**, NOT an object `{ tag, setup }`.
Returns `typeof HTMLElement` (a class, not a component descriptor).

```typescript
// packages/runtime/src/types.ts
export type Setup = (ctx: SetupContext) => Branch | Leaf
export interface SetupContext {
  readonly host: ShadowRoot | Element
  readonly element: HTMLElement
}
```

---

## defineElement signature (ACTUAL)

```typescript
// packages/runtime/src/define-element.ts
export function defineElement(
  name: string,
  Ctor: typeof HTMLElement,
  options?: DefineOptions,
): void
```

Wraps `Ctor` to attach a shadow root, then calls `customElements.define(name, Wrapped)`.
Returns **void** — it is a registration side-effect, not a component descriptor.

```typescript
export interface DefineOptions {
  shadowMode?: ShadowMode  // 'open' | 'closed' | 'none'
}
```

---

## CRITICAL DISCREPANCY: Plan output vs actual API

The plan shows compiler emitting:
```typescript
export default defineComponent({
  tag: 'x-counter',
  setup(ctx) { ... }
})
```

**This is wrong on three counts:**
1. `defineComponent` takes `setup: Setup` (a function), NOT `{ tag, setup }` (an object).
2. `defineComponent` returns a class — you'd `export default` a class, which is unusual but valid.
3. The tag is registered via `defineElement(name, Ctor)`, not via `defineComponent`.

**The actual two-call pattern is:**
```typescript
defineElement('x-counter', defineComponent(ctx => { ... return branch(...) }))
```

Or the compiler emits a full class extending HTMLElement and calls `defineElement` directly,
per `define-element.ts`'s own comment:
> "The compiler emits, at module level: `defineElement('hello-aihu', HelloAihu)`
> where `HelloAihu extends HTMLElement` is fully authored by the compiler."

**The Architect must decide which form the compiler uses.** Both work; they differ in what the compiler generates.

---

## branch() signature (ACTUAL)

```typescript
export function branch(tag: string | null, attrs?: AttrMap, children?: ChildList): Branch
```

```typescript
export type AttrMap = Record<string, string | number | boolean | Signal<unknown> | EventHandler>
export type ChildList = ReadonlyArray<Branch | Leaf>
export type EventHandler = (event: Event) => void
```

Event handling rule: `key.startsWith('on') && typeof value === 'function' && !Array.isArray(value)` → `addEventListener`.
Signal in attrs: `Array.isArray(value)` → reactive attribute.
Static: `string | number | boolean`.

`tag === null` → fragment (children appended directly to parent, no wrapper element).

---

## leaf() signature (ACTUAL)

```typescript
export interface LeafFactory {
  (value: Signal<string> | string): Leaf
  element(tag: string, attrs?: AttrMap): Leaf
}
```

**Signal type is `Signal<string>` NOT `Signal<unknown>`.**

The plan shows `leaf([count, setCount])` where `count` is `() => number` (Signal<number>).
TypeScript will complain — `Signal<number>` is not assignable to `Signal<string>`.
Runtime discrimination is `Array.isArray(value)`, so it works at runtime.

**Open question for Architect:** should the compiler cast, should `leaf` be widened to `Signal<unknown>`, or should v0 only support string-typed signals in templates?

---

## mount() signature (ACTUAL)

```typescript
export function mount(node: Branch | Leaf, host: Element | ShadowRoot): MountScope
```

The compiler-emitted class calls `mount()` directly from `@aihu/arbor`.
**Unlike hand-authored `defineComponent`, compiler-emitted classes do NOT need `_setMount` wiring** — they import `mount` directly.

---

## signal() return type (ACTUAL)

```typescript
// packages/signals/src/signal.ts (via index.ts)
export type Signal<T> = readonly [Read<T>, Write<T>]
export type Read<T> = () => T
export type Write<T> = <U extends T>(next: ...) => void
export function signal<T>(initialValue: T, options?: SignalOptions<T>): Signal<T>
```

`const [count, setCount] = signal(0)` → `count: Read<number>`, `setCount: Write<number>`.

---

## Exports summary (what the compiler must import)

**From `@aihu/arbor`:**
- `branch` (function)
- `leaf` (function + `.element` method)
- `mount` (function)

**From `@aihu/runtime`:**
- `defineElement` (for compiler-emitted output, registers the component)
- `defineComponent` (for `defineComponent` + `defineElement` two-call pattern)

**From `@aihu/signals`:**
- `signal` (function)

---

## Rust toolchain state

- **Cargo.toml**: Does NOT exist anywhere in the repo.
- **.prototools**: Pins only `bun = "1.3.8"` and `node = "22.12.0"`. No Rust pin.
- **rust-toolchain.toml**: Does NOT exist at repo root.
- **packages/compiler/**: Does NOT exist yet.

**Phase C-0 prerequisite:** Rust toolchain must be added to `.prototools` (or a `rust-toolchain.toml` created). The Architect brief should specify the Rust version and tool setup.

---

## Do-not-break list

1. **Compiler-emitted code must import `mount` directly from `@aihu/arbor`** — NOT via `_setMount`. The `_setMount` injection pattern is only for `defineComponent` (hand-authored). Compiler-emitted classes are standalone HTMLElement subclasses.
2. **`leaf()` typed as `Signal<string>`** — passing `Signal<number>` will require a type cast or API adjustment.
3. **`AttrMap` event handlers: `on` prefix + function value + not Array** — compiler must emit `{ onclick: fn }` not `{ click: fn }` for `@click` directives.
4. **Shadow root:** `defineElement` attaches it in the constructor wrapper. Compiler-emitted `connectedCallback` reads `this.shadowRoot` (open mode default). Closed mode is a v0 limitation.
5. **`mount` returns `MountScope`** with `.dispose()`. Compiler-emitted `disconnectedCallback` must call `this.#scope?.dispose()`.
6. **`branch(null, ...)` for fragments** — no-wrapper tag. Compiler must handle root fragments (template root without a single element wrapper).

---

## Open questions surfaced

**HIGH — OQ-C9 (new): Which emit pattern does the compiler use?**
- Option A: `defineElement('tag', defineComponent(setup_fn))` — simpler, one-liner.
- Option B: compiler emits a full `class X extends HTMLElement { ... }` with explicit `connectedCallback`, etc., then calls `defineElement('tag', X)` — per `define-element.ts` comment.
Option A reuses `defineComponent`; Option B is what the `define-element.ts` docs describe.

**HIGH — OQ-C10 (new): Signal type width for `leaf()`**
- `leaf()` accepts `Signal<string>`. Counter template `{{ count }}` where `count: () => number` — type mismatch.
- Options: (a) add type cast in emitted code `leaf([count, setCount] as Signal<string>)`, (b) compiler only handles `signal<string>`, (c) widen `leaf()` to `Signal<unknown>` (requires runtime change).
- Likely answer: emit a cast in v0; widen in v1.

**MEDIUM — OQ-C11 (new): Rust toolchain version**
- No Rust pin exists. Builder must add `rust = "1.xx.x"` to `.prototools` and create `Cargo.toml` workspace member.
- Recommended: latest stable Rust (1.87+).

---

## STATUS
DONE — all required signatures read. Critical discrepancy between plan's conceptual output and actual API identified (OQ-C9). Phase C-0 can proceed with clarifications routed to Architect.
