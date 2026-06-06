---
"@aihu/compiler": patch
---

Fix two `.aihu` codegen bugs surfaced by layouts + `<$link>`:

- **`<$link>` inside `$each`/`$if` threw `onMount: no owner`.** `createLinkBoundary`
  wired its click handler via `addEventListener` inside `onMount`, which needs the
  component-setup owner — absent in an each/if item factory — so a looped
  `<$link>` crashed the whole component. Click is now an owner-agnostic arbor
  `onClick` attr (and composes any author `$on.click`); the prefetch/aria-current
  `onMount` is guarded so looped links degrade gracefully (still navigate) instead
  of throwing.
- **Complex attribute bindings compiled eager (non-reactive).** `$class={fn() ? a : b}`
  (e.g. reading an imported/provided reactive getter the compiler can't see in
  `@state`) was emitted as a one-shot value and never re-ran — freezing layout
  toggles. Complex binding expressions are now thunk-wrapped like `$if`/`$show`;
  bare non-reactive identifiers and static literals stay eager.
