# Composition & Injection: route-scoped registration, composables, hierarchical DI

**Date:** 2026-07-16
**Status:** DRAFT (for review)
**Scope:** `@aihu/compiler`, `@aihu/runtime`, `@aihu/context`, `@aihu/router`, docs

## Problem

Two related gaps surfaced from the fellwork web app:

1. **Registration is global and eager.** An `.aihu` SFC compiles to a custom
   element, and *something* must `define()` it before its tag renders — so
   registration is an inherently global side-effect list. Today that list is
   `client.ts` eagerly importing all 25 components at boot. There is no
   route-scoped registration story.

2. **No clean way to separate logical layers for injection.** Vue-style
   composition — extracting reactive logic into reusable functions, and layering
   dependencies via provide/inject — is only half-present, and the injection half
   is fragmented (see below).

## What already exists (verified against the code)

- **Composables already work.** `@state` lowers *directly* to the component's
  setup body: `defineComponent((_ctx) => { <@state> })`. A `const { x } = useX()`
  in `@state` runs inside setup, so a composable's signals, its `onMount` /
  `onCleanup` (which bind to the current instance via the `_cur` pointer), and its
  `inject()` all work. The mechanism is there; convention, a helper, and docs are
  not.

- **Injection exists in two inconsistent forms, neither cleanly hierarchical:**
  - `@aihu/context` (`createContext` / `provide` / `inject`) is a **single flat
    ambient map**, built for SSR (`setSsrContextMap` / `runWithContext`). On the
    client there is no tree scoping.
  - The `$context` macro lowers to **DOM `CustomEvent` bubbling**
    (`__aihu_ctx_provide`, `bubbles`/`composed`) — tree-shaped but event-based,
    timing-fragile (the consumer must be listening before the provider fires —
    breaks under async/lazy upgrade), and inverted from Vue's data-flow.

- **The compiler knows the tag graph.** It parses every template; `Element { tag }`
  nodes carry the referenced tags. It already emits a per-page `.route.json`
  sidecar, and the router already lazy-imports each page and reads those sidecars.

- **The prop-on-upgrade landmine is fixed** (#406). A prop assigned to an element
  before its tag is `define()`d used to shadow the prototype accessor on upgrade.
  The element constructor now performs the standard upgrade rescue, so lazy /
  async component registration is safe by construction.

## Plan

Four pieces, shippable independently, in dependency order.

### 1. Route manifest — DONE (#409)

The compiler emits a `components` member into `.route.json`: the custom-element
tags a page references. Additive, backward-compatible, runtime JS unchanged.

### 2. Router: route-scoped registration

When the router loads a route's chunk, it reads `route.json.components`, resolves
each tag to a component module via a **tag → module registry**, and
`await import()`s it (which runs `defineElement`). This replaces the global
`client.ts` import-all.

- The registry is built the same way the route table already is: a build-time
  scan of the components directory, resolving each file's tag with the same
  `resolve_tag` priority the compiler uses (`@meta name` → `@route name` → file
  stem), emitted as a virtual module (mirrors `virtual:aihu-routes`).
- Registration completes before the route's view renders, so the page's existing
  `$if={loaded()}`-style gate can key off a `componentsReady()` signal — no lazy
  islands needed for the common case.
- **Open question (O1):** tag naming. `<Comment>` (PascalCase) is not a valid
  custom-element name (needs a hyphen). Either normalize PascalCase → a hyphenated
  tag at both the reference site and registration, or require component tags to be
  hyphenated and lint the rest. Resolve before wiring the registry so the manifest
  tags and the registry keys agree.

### 3. Hierarchical DI — unify on prototype-chained `provides`

Replace both context mechanisms with one tree-scoped system, using the approach
Solid and Vue converged on: **prototype-chained `provides` objects**. No
per-lookup tree traversal.

**Mechanism:**
- Each component instance holds a `provides` object (on a symbol, beside the
  existing `PROPS_SYM` / lifecycle state).
- A component that provides nothing holds a **reference** to its parent's
  `provides` — zero allocation.
- The first `provide(token, v)` does `provides = Object.create(parentProvides)`
  once, then sets the key.
- `inject(token)` is a single property read: `instance.provides[token._id]` — a
  prototype-chain lookup, which V8 inline-caches. Effectively O(1); the "tree
  walk" collapses into the engine's prototype walk.

**Parent resolution (the aihu-specific part):**
- `_cur` is cleared *before* a component mounts its children, so a setup-time
  owner stack does not capture parent → child. Resolve the parent from the DOM at
  connect instead: one hop up through the shadow host
  (`this.getRootNode().host`, falling back to `parentElement`) to the nearest
  ancestor component, and inherit its `provides`.
- One hop, not a walk: the ancestor's `provides` is *already* prototype-linked to
  its own ancestors, so a single reference gives the whole chain.
- Correct under lazy/async upgrade: resolution runs at connect (post-upgrade), the
  ancestor is already in the DOM, and #406 covers props.

**SSR:** no DOM server-side, so the chain is built from the render-owner stack
(deterministic top-down); `runWithContext` / `setSsrContextMap` seed the root.
Same API in both environments.

**Unification:**
- The flat `@aihu/context` map becomes the **root** `provides` object — app-level
  singletons still work (provide at root, inject anywhere).
- The `$context` macro lowers to the same `provide` / `inject` calls instead of
  dispatching DOM events. The `__aihu_ctx_provide` event path is removed.
- `createContext<T>` (typed tokens) and `token._default` are reused as-is.

**SOTA features kept:** reactive injection falls out for free (provide a *signal*,
descendants inject and read it reactively — no special machinery); typed tokens;
defaults; SSR parity; shadow-DOM crossing.

- **Open question (O2):** migration for existing `$context` users. The macro's
  author-facing surface (`provide` / `consume`) stays; only its lowering changes.
  A deprecation window for the event path if any consumer depends on the event
  directly (none known in-repo).

### 4. Composable blessing + docs

- A thin, typed `useX` convention — composables are plain functions called in
  `@state`; document that they may use signals, lifecycle, and inject, and that
  the value returned is reactive when it wraps signals.
- Optionally a tiny helper for the common "provide a signal as a layer" pattern.
- Docs: a Composition guide (composables) and an Injection/Layers guide
  (hierarchical provide/inject), plus a note on route-scoped registration.

## Sequencing

1. **#409 route manifest** — merged/in review.
2. **Router registration** — depends on O1 (tag naming) + #409.
3. **DI runtime** (prototype-chain provides + connect-time resolution) — the core;
   independently testable in `@aihu/runtime`.
4. **DI compiler** (`$context` → new lowering) — depends on 3; depends on O2.
5. **Composables + docs** — mostly independent; can land alongside 3–4.

## Risks

- **O1 tag naming** is load-bearing for the router piece; settle it first.
- The DI change touches a public surface (`@aihu/context`, `$context`). Keep the
  author API stable; change only internals + lowering. Ship behind tests that
  prove client hierarchy, SSR parity, and reactive injection before removing the
  event path.
- Prototype-chain provides must not leak across SSR requests — the root object is
  per-request (already the `runWithContext` contract).
