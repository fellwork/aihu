# `switch` — accessibility (WAI-ARIA APG Switch)

`<aihu-switch-root>` implements the
[APG Switch pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/);
`<aihu-switch-thumb>` is a pure styling hook (`aria-hidden="true"`, mirrors
`data-state`). Deliberately a SIBLING of checkbox, not shared code — the ARIA
contracts diverge (binary vs tri-state, Enter behavior). Ships no CSS.

## Roles & ARIA

| Attribute | Behavior |
|---|---|
| `role="switch"` | Set on connect unless the consumer supplied a role |
| `tabindex="0"` | Set on connect unless the consumer supplied one |
| `aria-checked` | `"true"` \| `"false"` — strictly binary, NEVER `"mixed"` |
| `aria-required="true"` | When required (own attribute ∥ inherited `formControlContext`) |
| `data-state` | `checked` \| `unchecked` |
| `data-disabled` | Presence when effectively disabled (own ∥ inherited) |
| `data-fc-control` | Stamped on connect so `<aihu-form-control>`'s control selector finds the HOST |

The host does NOT stamp `aria-disabled` — form-control owns `aria-*` on the
control; disabled is conveyed by `data-disabled` + suppressed activation.

## Keyboard

| Key | Behavior |
|---|---|
| `Space` | `preventDefault()` + toggles via a synthetic `click()` |
| `Enter` | ALSO toggles (APG Switch — the divergence from checkbox, where Enter is inert) |

Click suppression when disabled runs in the CAPTURE phase so it beats consumer
handlers (button precedent).

## State & form participation

- `checked` attribute: boolean presence, two-way reflected (dialog open-attr
  pattern). `default-checked` seeds ONCE on first connect (never reflected).
- Form participation rides `attachHiddenInput` (visually-hidden native
  checkbox): submits `value` (default `"on"`) under `name` when on; nothing
  when off.

## Events

`checked-change` (detail `{ checked: boolean }`, bubbles, composed) is
dispatched on USER-driven toggles only (clicks/keys). Programmatic
`setChecked()` / attribute writes do NOT emit (dialog precedent).

## Labelling

The host renders no visible text of its own — give it `aria-label` /
`aria-labelledby`, or associate an `<aihu-label>` (it forwards `click()` to
`role="switch"` hosts).
