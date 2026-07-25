---
"@aihu/compiler": patch
---

Fix a compiler codegen bug where `let x = state(init)` (the `@state`
reactive-declaration wrapper dialect) was reordered into a temporal-dead-zone
`ReferenceError` at runtime.

The compiler emitted every `@state` macro declaration — including `state()`
signal-tuple declarations — into a single `macro_code` block spliced AFTER
the entire plain-body of user code, regardless of where the author actually
wrote the `let x = state(init)` line. Any plain-body statement that
synchronously ran before setup finished and read `x` (e.g. a function defined
and immediately invoked in `@state`, like `docs-shell.aihu`'s
`seedFromPrerender()` reading `activePage()`) hit
`ReferenceError: Cannot access 'x' before initialization` — the emitted JS
declared the signal 30+ lines after the code that used it, even though the
author declared it first. `packages/runtime/src/define-component.ts`'s
`connectedCallback` catches and re-throws that setup error, so the shadow DOM
never rendered; this broke the apps/docs site's `docs-shell`/`playground-embed`
components (13 Playwright failures across layout/mobile/navigation/prerender/
playground specs) since PR #497 (the `@state` wrapper-model migration).

Fixed by splicing each `let x = state(init)` declaration back into the
plain-body text INLINE, at its original source position, instead of
deferring it to the trailing `macro_code` block. A blanket hoist above all
of plain-body (the same shape as the existing `$prop`-binding hoist for
issue #279 / "Bug 8") is NOT sound here: `signal(init)` evaluates `init`
eagerly, and `init` may call an earlier plain-body helper (exactly the
`pageFromLocation()` case in docs-shell.aihu) — hoisting the signal above ALL
of plain-body would just relocate the TDZ onto that helper instead of fixing
it. Splicing in place preserves the author's ordering in both directions.

Also fixes a shadow-tracking gap this splice exposed: `expr/state_rw.rs`'s
scope-aware read/write rewrite pass now walks the spliced declaration too
(it's part of the same plain-body AST), so without a targeted
`visit_variable_declarator` override it would treat `const [x, __x_set] =
signal(init)`'s own binding identifiers as an ordinary local shadow and stop
rewriting later bare reads/writes of `x` in the rest of the body.
