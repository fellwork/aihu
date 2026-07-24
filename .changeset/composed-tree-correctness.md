---
"@aihu/primitives": patch
---

Fix `composed-tree.ts`'s upward walk (`composedParent`) to consult
`assignedSlot`, so it agrees with the slot-aware downward walk
(`composedChildren`/`walkComposedTree`). Previously, `composedParent` only
hopped `ShadowRoot -> .host`, never resolving a slotted node to its `<slot>` —
so `composedContains`, `composedClosest`, and `composedCompareOrder` (all
built on `composedParent`) silently disagreed with `queryTabbables` for any
slotted subtree.

This broke `createFocusTrap` in exactly the shadow-DOM-opt-in scenario it
exists to support: a focus-trap container living inside a shadow tree that
receives its content via `<slot>`. `queryTabbables` found the slotted
focusable, but `composedContains`'s `!composedContains` guard fired on every
Tab press, force-refocusing the first element and trapping the user on it —
Tab could never reach the other slotted controls.

It also silently degraded `<aihu-collection>`'s DOM-order sort
(`sortDomOrder` / `composedCompareOrder`, used by `roving-focus` and
`radio-group`) for light-DOM siblings slotted under a single shadow host: the
ancestor chains diverged at the host with no common ancestor found, and the
comparator fell back to `0`, silently reverting to registration order instead
of rendered order.

Added upward-walk slot-boundary tests (`composedContains`/`composedClosest`
across a `<slot>`, and a `composedCompareOrder` probe for two slotted
siblings under a shared shadow host) — the existing slot-boundary coverage
only exercised the downward walk (`walkComposedTree`).
