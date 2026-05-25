# `form-control` — accessibility

`<aihu-form-control>` coordinates the **label / control / error association**
contract for a single form field. It emits ARIA onto the slotted control; it
imposes no role of its own and ships no CSS.

## Association contract

- **Control:** the first slotted `[data-fc-control]`, `<input>`, `<select>`,
  `<textarea>`, or `[role=textbox]`. Gets a stable `id` (from the `control-id`
  attribute, the control's own `id`, or a generated one).
- **Label:** a slotted `<label>` or `[data-fc-label]` is pointed at the control
  via `for`/`htmlFor`.
- **Description / error:** every slotted `[data-fc-description]` /
  `[data-fc-error]` is given an `id` and joined into the control's
  `aria-describedby`. `recomputeDescribedBy()` re-derives this when a message
  piece mounts/unmounts.

## State → ARIA

| Signal / attribute | ARIA on the control |
|---|---|
| `disabled` | `aria-disabled="true"` |
| `required` | `aria-required="true"` |
| `invalid`  | `aria-invalid="true"` |

State is published on `formControlContext`
(`{ disabled, required, invalid, controlId, describedById }`) so descendant
pieces (e.g. a headless `button`) inherit it reactively without prop-drilling.
