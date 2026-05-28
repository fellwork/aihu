---
"@aihu/cli": minor
"@aihu/app": patch
---

Scaffold `@aihu/css-engine` out of the box, with a shadow-mode choice.

`aihu app <name>` gains two flags on the legacy scaffold path:

- `--css <engine|none>` (with `--css-engine` as a boolean alias for
  `--css engine`) — includes `@aihu/css-engine` in `dependencies` and emits a
  utility-class starter page (`flex gap-4 max-w-7xl mx-auto p-8`, `text-3xl
  font-bold`, …) instead of the hand-written `@style` starter.
- `--shadow <open|closed|none>` — the shadow mode threaded into the compiler
  when css-engine is on (default `open`). `--shadow` without `--css engine`
  warns and is ignored.

The `create-aihu` interactive wizard asks the same two questions. The default
css-engine mode is `open` (scoped shadow fold), which is the compiler default —
so the default css-engine scaffold writes **no** `css` block; only
`closed`/`none` emit an explicit `css: { shadowMode }`. The plain (no-flag)
scaffold output is unchanged.

`@aihu/app` patch: corrected the `CssConfig` JSDoc — `@aihu/css-engine` is
scoped by design and works in any shadow mode (its utilities fold into each
component's shadow style); `shadowMode: 'none'` is only needed for
global-cascade frameworks (Tailwind/UnoCSS/Pico) or to style light-DOM /
external (slotted) children. (Wording only; no type or validation change.)
