---
'@aihu/runtime': minor
---

Make shadow-mode components safe to hydrate from Declarative Shadow DOM.

`defineElement` attached a shadow root unconditionally in the constructor, so a
host whose root the parser had already attached (`<template
shadowrootmode="open">`) failed to upgrade: the second `attachShadow` throws
`NotSupportedError` over an imperative root, and over a declarative one empties
it — deleting the server tree it was meant to adopt. It now attaches only when
no root exists.

First-render adoption was likewise gated on `shadowRoot === null`, so a
shadow-mode component could only ever discard a server template and mount
fresh. A `data-aihu-ssr`-marked host whose template lives in a populated shadow
root now hydrates into that root, with mount/adopt sharing one container. The
discard fallback clears both the host and its root, so an unadoptable template
can never render twice.

Adds `SHADOW_ROOT_MODE`, the single source for the DOM `ShadowRootMode` aihu
attaches with, so the SSR emitter's `shadowrootmode` value can be pinned to it
rather than duplicated.

Additive and dormant: no server emits DSD yet, and client-only mounts are
unchanged.
