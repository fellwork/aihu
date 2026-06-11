# `label` — accessibility (label↔control association)

`<aihu-label>` is the headless labelling primitive (Radix Label parity). There
is no APG "label" pattern — the contract is the HTML `<label>` association +
activation behavior, re-created for targets a native label cannot reference
(custom elements, `role=checkbox/switch/radio` hosts). Ships no CSS.

## Association contract

| Situation | Wiring |
|---|---|
| Inside `<aihu-form-control>` | The label stamps `data-fc-label` + a stable `id` on itself; the form-control re-wires and sets `aria-labelledby="<labelId>"` on the slotted control (and publishes `labelId` on `formControlContext`) |
| Standalone + `for="<id>"` (or context `controlId`) resolves | The label sets `aria-labelledby="<own id>"` on the target |
| Target in a different root (shadow boundary) | **Skipped** — ARIA IDREFs cannot cross shadow boundaries. Use `aria-label` (or `ElementInternals`) on the target instead |
| Host is a native `<label>` | Native `for`/`htmlFor` semantics are left alone; only the context wiring above applies |

The target is re-resolved per interaction (`for` attribute →
`getElementById` in the label's root; else `formControlContext.controlId`),
so late-mounted or replaced controls are picked up.

## Interaction forwarding (native `<label>` parity)

| Event | Behavior |
|---|---|
| `mousedown` with `detail > 1` | `preventDefault()` — no text selection on double-click |
| `click` → target is a native text control (`input` other than checkbox/radio, `textarea`, `select`) | `target.focus()` |
| `click` → target is a native checkbox/radio OR a custom host with `role="checkbox" | "switch" | "radio"` | `target.click()` |
| `click` originating on a nested interactive child (`button`, `input`, `select`, `textarea`, `a`) that is not the target | Not forwarded |
| Target has `aria-disabled="true"` or `.disabled` | Not forwarded |

The label itself takes no role, no `tabindex`, and no keyboard handlers —
labels are not interactive stops; activation flows to the control.
