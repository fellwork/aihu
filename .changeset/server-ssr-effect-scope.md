---
"@aihu/server": patch
---

fix(server): dispose setup-created effects per SSR render (effect-scope plan §3)

SSR runs a component's full setup body by calling the `component()` factory —
bypassing `defineComponent`'s component scope — so any `effect()`/`computed()`
created there (directly or via a composable) leaked per request. Both factory
seams now wrap the call in a per-render detached `effectScope`:

- `renderToStream` (TS path): the scope stays alive through the async walk and
  suspended boundaries, and is stopped exactly once on every terminal path —
  walk done, last-boundary close, sync factory throw, walk/boundary errors,
  and the consumer's `cancel()` (client disconnect / streaming timeout with a
  boundary still pending).
- `renderToStringNative`: scope wraps the factory; serialization, the state
  script's signal reads, and the dialect-guard TS fallback all complete before
  the finally-phase `stop()`. A throwing user disposer is reported via
  `console.error`, never masking an in-flight render error.

Rendered bytes are unchanged — the wrap affects lifecycle only. `@aihu/signals`
is a new dependency and is external in both build entries (a bundled private
copy would split the `_currentScope` module-global and silently break scope
adoption). The compiled ssr-string fast path never calls setup and needs no
wrap.
