# `roving-focus` — accessibility

`<aihu-roving-focus>` implements the **WAI-ARIA roving-tabindex** focus
management pattern. It manages `tabindex` + focus movement only; it imposes no
role and ships no CSS.

## Roving-tabindex contract

- Exactly one registered item has `tabindex="0"` (the current); every other item
  has `tabindex="-1"`. The composite widget is therefore a single Tab stop.
- Arrow keys move the current index and call `element.focus()` on the new
  current:
  - `orientation="horizontal"` → ArrowLeft/ArrowRight (RTL-aware via `dir`)
  - `orientation="vertical"` → ArrowUp/ArrowDown
  - `orientation="both"` → all four
- `Home` / `End` jump to the first / last item.
- `loop` wraps past the ends.
- `dir` (own attribute, else the nearest `config-provider`) flips horizontal
  arrow direction for RTL.

## Pairs with which roles

`roving-focus` supplies the focus mechanics for composite widgets; the consumer
sets the role and item roles per APG: `role="toolbar"`, `role="menu"` /
`menuitem`, `role="radiogroup"` / `radio`, `role="tablist"` / `tab`,
`role="listbox"` / `option`, etc. The primitive deliberately does not assume
one so it can back any of them.
