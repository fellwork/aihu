---
'@aihu/compiler': minor
---

Export the resolved shadow mode from the server target as `__aihu_shadow__`.

Server-target modules already export `__aihu_light_scope__` and `__aihu_tag__`
so an SSR/SSG caller never re-derives what the compiler already resolved. The
shadow mode joins them, in aihu's own vocabulary (`'light' | 'shadow'`).

An SSR caller rendering a NESTED custom element has to emit two different
shapes: a light component's tree is the host element's own children, while a
shadow component's tree belongs inside a `<template shadowrootmode="open">` so
the browser attaches a declarative shadow root while parsing. Choosing wrong is
not cosmetic — light-DOM children under a host that later calls `attachShadow`
are discarded on upgrade ("adopt or discard, never slot-project"), so the
content would paint and then vanish.

The exported value is `effectiveShadow`, the same resolution that already
drives `_injectShadowMode` and the css-fold branch (plugin config > per-file
directive > page/layout default). Exporting it keeps one source rather than
letting a consumer infer the mode from the presence of `__aihu_light_scope__`,
which is an inference, not a signal.

Deliberately NOT the DOM's `ShadowRootMode` (`'open' | 'closed'`) — a different
enum that merely shares the word "mode". The translation to `shadowrootmode`
happens once, at serialization, in the renderer. Client target is unchanged: it
stamps its mode into `defineElement` options directly and needs no export.
