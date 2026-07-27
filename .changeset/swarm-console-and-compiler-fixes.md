---
'@aihu/compiler': patch
'@aihu/use': minor
---

Two compiler correctness fixes and the new `useSwarm` composable.

**`@aihu/compiler` (patch)**

- **FEL-440** — agent registration is now a codegen *input* rather than
  post-hoc string surgery on the emitted JS. The old path matched a literal
  runtime-import string and silently returned the input unchanged when it did
  not match, so a component whose imports differed at all shipped with its
  agent surface quietly missing. A registration that cannot be applied is now
  a compile-time fact, not a silent no-op.
- **FEL-441** — `$ref` `onMount` callbacks are hoisted ahead of `@state`
  `onMount` callbacks, so a `ref={}` read inside a `@state` mount handler is
  populated instead of `null`. The ordering was previously incidental.

Both fixes require the platform binary packages, so `@aihu/compiler-*` moves to
0.1.40 and `@aihu/compiler-native-*` to 0.1.5 in lockstep — the FEL-414 rule
that an unbumped manifest is silently never published.

**`@aihu/use` (minor)**

- New `useSwarm()` composable: a reactive view over a Server-Sent Events
  stream, exposing `state`, `agents`, `contracts`, `yourMove`, `connected` and
  `close`. Follows the ratified named-getter convention and the `isClient`
  no-op invariant — under SSR it returns static defaults and **never**
  constructs an `EventSource`, which is covered by a paired must-fail test
  rather than asserted. Byte-budgeted at 610 B (measured 574 B gzipped).
