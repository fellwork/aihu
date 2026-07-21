# primitives-showcase

> Headless behavior from **`@aihu/primitives`**, styled by you.

Wires three WAI-ARIA APG patterns from the published
[`@aihu/primitives`](../../packages/primitives) package — each a vanilla custom
element that owns focus, keyboard, and ARIA wiring while emitting **zero CSS**:

| Primitive | Import | Pattern |
|---|---|---|
| Button | `@aihu/primitives/button` | APG Button — `defineButton()`, Enter/Space activation, `aria-pressed` toggle |
| Dialog | `@aihu/primitives/dialog` | APG Dialog (Modal) — `defineDialog()`, focus trap, return focus, Escape, backdrop dismiss |
| Tooltip | `@aihu/primitives/tooltip` | APG Tooltip — `defineTooltip()`, `aria-describedby`, hover/focus open, Escape dismiss (positioned by the css-engine `position()` shim) |

The primitives are registered in `@state`; the elements are rendered in
`@template`; **all** styling lives in `@style` and targets the `data-state`
attributes each primitive reflects (`open`/`closed`, `on`/`off`). Rendered with
`shadowMode: 'light'` so the primitives' DOM-walk context and the styles share
one light-DOM tree.

## Run

```bash
cd examples/primitives-showcase
bun install
bun run dev    # http://localhost:5115
```

## Agent surface

`wired` (computed) exposes the list of primitives read-only; `closeAll`
exposes read+write so an agent can dismiss the open dialog/tooltip — the
inline `expose:` discovery contract every aihu example carries.
