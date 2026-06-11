# `separator` — accessibility (WAI-ARIA APG Separator)

`<aihu-separator>` implements the **static** (non-focusable) variant of the
WAI-ARIA APG [Separator](https://www.w3.org/WAI/ARIA/apg/patterns/separator/)
pattern. It renders no children of its own and ships no CSS — consumers style
it via `data-orientation`. The focusable variant (window splitter) is out of
scope.

## State → ARIA

| Aspect | ARIA |
|---|---|
| Default | `role="separator"` (a consumer-supplied `role` attribute is respected) |
| `decorative` attribute present | `role="none"` — the element is purely visual and is removed from the accessibility tree |
| `orientation="vertical"` | `aria-orientation="vertical"` |
| `orientation="horizontal"` (default) | **no** `aria-orientation` — horizontal is the ARIA default for separators, so the attribute is removed (Radix parity) |

`data-orientation="horizontal|vertical"` is always reflected for styling.
Toggling `decorative` / `orientation` at runtime updates the ARIA reactively.

## Keyboard

None. The static separator is not focusable (no `tabindex` is set) and has no
keyboard handlers.
