---
'@aihu/arbor': patch
'@aihu/runtime': patch
'@aihu/server': patch
'@aihu/compiler': patch
---

Fix defects found reviewing SSR child rendering.

- A server-rendered child host was duplicated on hydrate. It is the first
  element to carry both `data-aihu-path` and `data-aihu-ssr`, and `closest()`
  matches the element itself, so each host became its own path-map boundary and
  was re-materialized instead of adopted.
- Each render path held half the server-render environment: the compiled fast
  path had no effect scope (so `onCleanup`, `$stream` and most composables
  threw), the walker had no lifecycle window (so `onMount` threw). Both now open
  both.
- The walker resolved children at runtime-built paths (inside `{#each}`) that
  the compiled emitter declines, a byte divergence with a registry present.
- A shadow child's declarative template shipped only its authored `@style`
  block; css-engine utility CSS and design tokens are now folded into
  `__aihu_css__` too.
- Child renders are memoized and budgeted by output bytes, so a fan-out graph
  cannot exhaust build memory.
