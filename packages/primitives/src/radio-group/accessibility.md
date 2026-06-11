# `radio-group` — accessibility (WAI-ARIA APG Radio Group)

`<aihu-radio-group-root>` implements the
[APG Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) by
EXTENDING `<aihu-roving-focus>` — the root IS the roving-tabindex container.
`<aihu-radio-group-item>` is the `role="radio"` option;
`<aihu-radio-group-indicator>` is a pure styling hook (`aria-hidden="true"`,
mirrors its OWN enclosing item's `data-state`). Ships no CSS.

## Roles & ARIA

### Root

| Attribute | Behavior |
|---|---|
| `role="radiogroup"` | Set on connect unless the consumer supplied a role |
| `orientation="both"` | Default reflected on connect when absent (all four arrows work); consumer-set values win |
| `loop` | Default ON, reflected on connect when absent (APG wrap); consumer-set values win |
| `aria-required="true"` | When required (own attribute ∥ inherited `formControlContext`) |
| `aria-disabled="true"` | When effectively disabled (own ∥ inherited) |
| `data-state` | _(none — selection state lives on the items)_ |
| `data-disabled` | Presence when effectively disabled |
| `data-fc-control` | Stamped on connect so `<aihu-form-control>`'s control selector finds the ROOT (it precedes `input` in the selector, so the root wins over the hidden input) |

**Interplay with form-control:** `<aihu-form-control>` also writes
`aria-required` / `aria-disabled` / `aria-invalid` onto `[data-fc-control]`
(the root). This is not a fight: the root's effect tracks the SAME
form-control signals and asserts the effective superset (own ∥ inherited), and
because the form-control ancestor connects (and creates its effect) first, the
root's effect runs after it on any shared change — the effective value wins.
`aria-invalid` and `aria-describedby` remain exclusively form-control-owned;
the root never writes them. This mirrors the checkbox precedent for
`aria-required` and extends it to `aria-disabled` because group-level disabled
must be conveyed on the `radiogroup` element itself.

### Item

| Attribute | Behavior |
|---|---|
| `role="radio"` | Set on connect unless the consumer supplied a role |
| `tabindex` | Managed by the roving base: exactly ONE item carries `0` |
| `aria-checked` | `"true"` \| `"false"` — reactive, from `radioGroupContext.value() === value` |
| `aria-disabled="true"` | When effectively disabled (own ∥ group). Item-owned: form-control targets the ROOT, never the items, so there is no ownership conflict here (unlike the checkbox host) |
| `data-state` | `checked` \| `unchecked` |
| `data-disabled` | Presence when effectively disabled |

Disabled items **unregister from the roving collection** (the substrate has no
disabled convention, so the item owns this): arrows skip them entirely, they
hold `tabindex="-1"`, and activation is suppressed in the CAPTURE phase
(checkbox/button precedent). Re-enabling re-registers reactively.

An item with no `value` attribute stays registered (focusable, part of the
arrow order) but is **unselectable** — arrows land on it without changing the
selection, clicks/Space do nothing. Keeping it in the focus order preserves
the roving invariant for partially-authored markup.

## Keyboard

| Key | Behavior |
|---|---|
| `ArrowRight` / `ArrowDown` | Move focus to the next item AND select it (APG). RTL (own `dir` attr or inherited config-provider) flips the horizontal pair |
| `ArrowLeft` / `ArrowUp` | Move focus to the previous item AND select it |
| `Home` / `End` | Jump to the first/last item AND select it |
| `Space` | `preventDefault()` (no page scroll) + selects the focused item when unchecked (no toggle-off) |
| `Enter` | `preventDefault()` and does NOT activate — APG: Enter is reserved for form submission |

Selection-on-navigation is implemented by overriding the base
`setCurrent(index, focus)`: the `focus = true` path (arrows/Home/End) selects
the landed item; `focus = false` (tab-stop bookkeeping) never selects. Note a
programmatic `root.setCurrent(i)` call (default `focus = true`) is therefore
treated as user navigation and selects + emits — use `setValue()` for silent
programmatic selection.

## Focus management

- Exactly one item has `tabindex="0"` at all times (roving base invariant).
- **Tab-stop-follows-checked:** a root effect moves the tab stop to the
  checked item whenever one exists (via `setCurrent(idx, false)`) — at mount
  this happens WITHOUT moving `document.activeElement`. With nothing checked
  the tab stop defaults to item 0 (base behavior).
- Clicking an item moves the tab stop to it without a synthetic focus call —
  the click focuses naturally.

## State & form participation

- `value` attribute on the root: two-way reflected (dialog open-attr
  pattern) — attribute writes update the selection; user selection updates
  the attribute. `null` selection removes the attribute.
- `default-value` seeds ONCE on first connect (signal only, never reflected);
  the `value` attribute wins when both are present.
- Form participation rides `attachHiddenInput` with ONE root-owned
  visually-hidden native radio: submits `value` under `name` only when a
  selection exists — **no selection submits nothing** (native parity).

## Events

`value-change` (detail `{ value: string }`, bubbles, composed) is dispatched
on USER-driven selection only (clicks/keys). Programmatic `setValue()` /
attribute writes do NOT emit — checkbox/dialog precedent. Re-selecting the
already-checked value does not re-emit.

## Labelling

`role="radiogroup"` needs an accessible name — give the root `aria-label` /
`aria-labelledby`. Items render no native text semantics — give each
`aria-label` or text content. `<aihu-label>` forwards `click()` to
`role="radio"` hosts and respects `aria-disabled="true"` (which disabled items
set), so label-click selection works and disabled items stay inert.
