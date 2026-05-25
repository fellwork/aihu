# `button` — accessibility (WAI-ARIA APG Button)

`AihuButton` is the headless base for the WAI-ARIA APG
[Button](https://www.w3.org/WAI/ARIA/apg/patterns/button/) pattern. It is NOT a
registered tag in this package — Plan 5 recipes register the concrete
`<aihu-button>` that extends it and adds styling. Ships no CSS.

## Native vs synthetic behavior

| Host | Behavior |
|---|---|
| Native `<button>` | Defers to native role + Enter/Space activation; the base only manages `data-state` + toggle state |
| Non-native (e.g. `<div is-aihu-button>` / a custom tag) | Sets `role="button"` + `tabindex="0"`; handles **Enter** and **Space** to fire a synthetic `click` (the APG Button keyboard contract) |

## State → ARIA

| Aspect | ARIA |
|---|---|
| Toggle button (`pressed` attribute present) | `aria-pressed="true|false"`, toggled on activation |
| Disabled (`disabled` attribute, or inherited from a disabled `form-control`) | `aria-disabled="true"` and activation is suppressed (Enter/Space/click do nothing) |

`data-state` reflects `disabled` / `on` / `off` / `idle` for the consumer to
style. Disabled state is inherited reactively from a `FormControlContext`
ancestor, so a button inside a disabled `form-control` is disabled without extra
wiring.
