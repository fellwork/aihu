---
'@aihu/compiler': patch
---

Recognize `onCleanup` as an alias for `onDispose` in the wrapper dialect's statement-call surface, so it no longer silently compiles to an unimported identifier.

`onCleanup` is a real, importable `@aihu/runtime` export — the runtime primitive `onDispose` itself lowers to. A bare call to it inside a wrapper-dialect `@state` body therefore reads as legitimate code, but only `onDispose` was in the compiler's recognized statement-call surface (`onMount`/`onDispose`/`onAdopt`/`onAttributeChange`), so the codegen never wired the runtime import for a bare `onCleanup(...)`. It compiled cleanly (no error, no warning — the type-check surface separately declares `onCleanup` as an ambient global for a different reason, so `aihu-tsc` doesn't catch it either) and threw `ReferenceError: onCleanup is not defined` in `setup()` on every mount.

This isn't hypothetical: fellwork-web shipped a real fix for a window-listener leak (docs/state-layer-audit-2026-07-31.md, L8) using a bare `onCleanup(...)` call across 8 route pages on 2026-07-31, and every one of them has thrown on every page load in production since — the entire client-side interactive layer (word-click study, notes, highlights, bookmarks, verse nav) dead behind a static SSR-rendered page, unnoticed for ~3 days because nothing exercises a real custom-element boot in a browser.

`onCleanup(...)` and `onDispose(...)` now lower to the identical `dispose` lifecycle entry — same codegen, same import wiring. Regression test: `state_wrappers::tests::on_cleanup_is_recognized_as_an_on_dispose_alias`.
