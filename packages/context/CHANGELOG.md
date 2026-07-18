# @aihu/context

## 0.2.0

### Minor Changes

- [#417](https://github.com/fellwork/aihu/pull/417) [`b279f74`](https://github.com/fellwork/aihu/commit/b279f74b34cd4e901be1cfa5d70c212cf604dfc1) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `$context` now lowers onto `@aihu/context`'s prototype-chain provide/inject DI
  instead of the old DOM-CustomEvent mechanism.

  - `@aihu/context` gains `contextKey(key)`: an interning helper that returns one
    stable `ContextToken` per string key, module-global, so the string-keyed
    `$context` macro and separately compiled components all resolve the same
    token.
  - The compiler emits synchronous setup-body calls —
    `provide(contextKey('theme'), (factory)())` for `provide` entries and
    `const locale = inject(contextKey('locale'))` for `consume` entries — plus a
    single combined `import { provide, inject, contextKey } from '@aihu/context'`
    (deduped with the magna `inject` import). The `__aihu_ctx_provide` /
    `__aihu_ctx_request` event contract is removed, and `$context` no longer
    forces an `onMount` import.
  - Because the new lowering rides the hierarchical DI added in [#411](https://github.com/fellwork/aihu/issues/411) (with its
    SSR flat-map fallback), `$context` now works under SSR and is no longer
    timing-fragile on the client — unlike the old client-only event path, which
    required the consumer to be listening before the provider fired.

- [#411](https://github.com/fellwork/aihu/pull/411) [`8c80d98`](https://github.com/fellwork/aihu/commit/8c80d9844503c248ecf5fb2c0b3ec5ab06128d5e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Hierarchical provide/inject on the client.

  `inject()` now resolves through the component tree: an ancestor's `provide()` is
  visible to its descendants, scoped to the subtree (siblings don't see it, a
  nearer provider overrides a farther one), and it crosses shadow boundaries. The
  value is whatever you provided — provide a signal and descendants read it
  reactively, for free.

  The mechanism is the Solid/Vue-grade one: each component instance holds a
  `provides` object whose prototype chain IS the ancestor context tree. A component
  that provides nothing shares its parent's object by reference (zero allocation);
  the first `provide()` does one `Object.create`. `inject()` is a single
  prototype-chain lookup — no per-lookup tree walk. The parent is resolved once at
  connect via a single shadow-host hop, which is correct under lazy/async component
  registration too (it runs after upgrade).

  Backward-compatible: the flat SSR context path (`setSsrContextMap` /
  `runWithContext`) is unchanged, and the client hierarchical path only engages
  during a component's setup. `createContext` / `provide` / `inject` keep their
  signatures.
