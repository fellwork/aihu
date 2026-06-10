# `textarea` — accessibility (native handoff)

`<aihu-textarea>` is the headless multi-line text control. There is no APG
"textarea" pattern — the contract is the NATIVE `<textarea>` handoff, shared
with `<aihu-input>` via `AihuTextControlBase` (see
`../input/accessibility.md` for the full rationale): the host adopts (or
creates) a real light-DOM `<textarea>` child which owns editing, focus, and
form participation. Ships no CSS.

## Ownership rule (aria-* vs native props)

Identical to input: `<aihu-form-control>` owns `aria-*` on the control (its
selector finds the inner native element); `<aihu-textarea>` owns the native
props — merged disabled/required (own attribute ∥ inherited
`formControlContext`) are written as `native.disabled` / `native.required`,
never as `aria-*`.

## Attributes & state

- `value` — two-way reflected (dialog open-attr pattern); typing does NOT
  rewrite the attribute (native parity).
- `default-value` — seeds ONCE on first connect, only when the native value is
  empty. Never reflected.
- Forwarded to the native child when present on the host: `name`,
  `placeholder`, `rows`, `cols`, `minlength`, `maxlength`, `readonly`,
  `autocomplete`. Consumer-preset attributes on a pre-supplied child are never
  clobbered unless the host attribute is present.
- `data-state` on the host: `disabled` | `readonly` | `idle`.

## Events & focus

- Native `input` events sync the value signal and dispatch `value-change`
  (detail `{ value }`, bubbles, composed) from the HOST.
- `host.focus()` delegates to the native child.
