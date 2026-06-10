# `input` — accessibility (native handoff)

`<aihu-input>` is the headless single-line text control. There is no APG
"input" pattern — the contract is the NATIVE `<input>` handoff (the
Dialog-wraps-native principle): the host adopts (or creates) a real light-DOM
`<input>` child and that native element is the source of truth for editing,
focus, and form participation. Ships no CSS.

## Why native handoff

A real light-DOM `<input>` gives screen-reader semantics, caret/IME/selection
behavior, autofill, validation, and `closest('form')` participation for free —
no hidden input, no role emulation. The host is a coordination wrapper only:
it takes no role and no tabindex of its own.

## Ownership rule (aria-* vs native props)

| Concern | Owner |
|---|---|
| `aria-disabled` / `aria-required` / `aria-invalid` / `aria-describedby` / `aria-labelledby` on the control | `<aihu-form-control>` (its control selector finds the inner native element) |
| `native.disabled` / `native.required` (real semantics + form behavior) | `<aihu-input>` — merged own attribute ∥ inherited `formControlContext` |

The input never stamps `aria-*` — doing so would fight the form-control's
reactive reflection on the same element.

## Attributes & state

- `value` — two-way reflected (dialog open-attr pattern): attribute → native +
  signal; `setValue()` → native + signal + attribute. Typing does NOT rewrite
  the attribute (native parity).
- `default-value` — seeds ONCE on first connect, only when the native value is
  empty. Never reflected.
- Forwarded to the native child when present on the host: `type`, `name`,
  `placeholder`, `autocomplete`, `inputmode`, `pattern`, `min`, `max`, `step`,
  `minlength`, `maxlength`, `readonly`. Consumer-preset attributes on a
  pre-supplied child are never clobbered unless the host attribute is present.
- `data-state` on the host: `disabled` | `readonly` | `idle`.

## Events & focus

- Native `input` events sync the value signal and dispatch `value-change`
  (detail `{ value }`, bubbles, composed) from the HOST.
- `host.focus()` delegates to the native child.
- `<aihu-label>` focuses native text controls on click — works unchanged here
  because the resolved control IS the native element.
