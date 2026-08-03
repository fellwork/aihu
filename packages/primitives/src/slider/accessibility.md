# `slider` — accessibility (WAI-ARIA APG Slider)

`<aihu-slider-root>` implements the
[APG Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) —
**single-thumb only**. Ships no CSS.

## Roles & ARIA

| Attribute | Behavior |
|---|---|
| `role="slider"` | Set on connect unless the consumer supplied a role |
| `tabindex="0"` | Set on connect unless the consumer supplied one |
| `aria-valuemin` | Reflects `min` (default `0`) |
| `aria-valuemax` | Reflects `max` (default `100`) |
| `aria-valuenow` | Reflects the current (clamped, step-rounded) value |
| `aria-orientation` | Set to `"horizontal"` on connect unless the consumer supplied one |
| `data-disabled` | Presence when `disabled` |

The host renders no visible text of its own — give it `aria-label` /
`aria-labelledby`.

## Keyboard

| Key | Behavior |
|---|---|
| `ArrowLeft` / `ArrowDown` | Decrement by `step` |
| `ArrowRight` / `ArrowUp` | Increment by `step` |
| `Home` | Jump to `min` |
| `End` | Jump to `max` |
| `PageDown` | Decrement by `step * 10` (clamped to `min`) |
| `PageUp` | Increment by `step * 10` (clamped to `max`) |

Every recognized key `preventDefault()`s. When `disabled`, keydown handling is
suppressed ENTIRELY — no `preventDefault()`, no value change, no event.

## Pointer

`pointerdown` on the host begins a drag: value is computed from the pointer's
X position relative to `this.getBoundingClientRect()`, clamped to
`[min, max]` and rounded to the nearest `step`. The drag is tracked via
`pointermove`/`pointerup` listeners added to `document` (so the drag continues
even if the pointer leaves the host), removed on `pointerup` and on
`disconnectedCallback`. Suppressed when `disabled`.

## State

- `min` / `max` / `value` / `step` attributes: two-way reflected (dialog
  open-attr pattern) — a programmatic `setAttribute('value', …)` write clamps
  and step-rounds through the same path as `setValue()`.
- `value` defaults to `"50"`, `min` to `"0"`, `max` to `"100"`, `step` to
  `"1"`.
- `setValue(next)`: signal + reflected `value` attribute write. Does NOT emit
  `value-change` (dialog/switch precedent — programmatic writes are silent).

## Events

`value-change` (detail `{ value: number }`, bubbles, composed) is dispatched
on USER-driven changes only (keyboard + pointer drag) — mirrors switch's
`checked-change` convention. Programmatic `setValue()` / attribute writes do
NOT emit.

## What's NOT included

- **No dual-thumb / range support.** This primitive is single-thumb only —
  `before-after` (the one registry consumer this slice) only needs one
  divider position. A range slider is a different primitive, not modeled
  here.
- **No vertical-orientation visual styling.** The `aria-orientation` attribute
  exists and can be set to `"vertical"` by a consumer, but aihu ships no CSS
  for it — a vertical slider needs the consumer to author its own layout/drag
  math on top of this primitive (the drag math here is X-axis only).
- **Not form-associated.** Deliberate simplification: a comparison-slider
  divider position isn't form data in this primitive's scope. No hidden input,
  no `name`/`FormData` participation, no `formControlContext` inheritance.
