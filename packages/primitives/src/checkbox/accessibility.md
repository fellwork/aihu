# `checkbox` — accessibility (WAI-ARIA APG Checkbox, tri-state)

`<aihu-checkbox-root>` implements the
[APG Checkbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/)
including the mixed-state variant; `<aihu-checkbox-indicator>` is a pure
styling hook (`aria-hidden="true"`, mirrors `data-state`). Ships no CSS.

## Roles & ARIA

| Attribute | Behavior |
|---|---|
| `role="checkbox"` | Set on connect unless the consumer supplied a role (e.g. `menuitemcheckbox`) |
| `tabindex="0"` | Set on connect unless the consumer supplied one |
| `aria-checked` | `"true"` \| `"false"` \| `"mixed"` — reactive tri-state |
| `aria-required="true"` | When required (own attribute ∥ inherited `formControlContext`) |
| `data-state` | `checked` \| `unchecked` \| `indeterminate` |
| `data-disabled` | Presence when effectively disabled (own ∥ inherited) |
| `data-fc-control` | Stamped on connect so `<aihu-form-control>`'s control selector finds the HOST (it precedes `input` in the selector, so the host wins over the hidden input) |

The host does NOT stamp `aria-disabled` — form-control owns `aria-*` on the
control; disabled is conveyed by `data-disabled` + suppressed activation.

## Keyboard

| Key | Behavior |
|---|---|
| `Space` | `preventDefault()` (no page scroll) + toggles via a synthetic `click()` (button precedent) |
| `Enter` | `preventDefault()` and does NOT activate — APG/Radix: Enter is reserved for form submission near checkboxes |

Click suppression when disabled runs in the CAPTURE phase so it beats consumer
handlers (button precedent). Activation from `mixed` lands on CHECKED (Radix
rule) — indeterminate is an author-set state, never a user-cycled one.

## State & form participation

- `checked` attribute: absent = unchecked, `"mixed"` = indeterminate, any
  other value (including empty) = checked. Two-way reflected (dialog open-attr
  pattern): attribute writes update state; toggles update the attribute.
- `default-checked` seeds ONCE on first connect (signal only, never
  reflected); the `checked` attribute wins when both are present.
- Form participation rides `attachHiddenInput` (visually-hidden native
  checkbox): submits `value` (default `"on"`) under `name` only when fully
  checked — **indeterminate submits as UNCHECKED** (native parity).

## Events

`checked-change` (detail `{ checked: boolean | 'mixed' }`, bubbles, composed)
is dispatched on USER-driven toggles only (clicks/keys). Programmatic
`setChecked()` / attribute writes do NOT emit — matching the dialog precedent
where `open` reflection is silent and events describe user intent.

## Labelling

The host renders no visible text of its own — give it `aria-label` /
`aria-labelledby`, or associate an `<aihu-label>` (it forwards `click()` to
`role="checkbox"` hosts and respects `data-disabled` via the capture-phase
suppression).
