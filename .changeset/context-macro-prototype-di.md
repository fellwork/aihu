---
"@aihu/compiler": minor
"@aihu/context": minor
---

`$context` now lowers onto `@aihu/context`'s prototype-chain provide/inject DI
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
- Because the new lowering rides the hierarchical DI added in #411 (with its
  SSR flat-map fallback), `$context` now works under SSR and is no longer
  timing-fragile on the client — unlike the old client-only event path, which
  required the consumer to be listening before the provider fired.
