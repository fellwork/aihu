# `presence-gate` — accessibility

**No ARIA role; structural only.** `<aihu-presence-gate>` is a mount/unmount
gate, not a landmark or widget. It imposes no `role` and emits no CSS.

- It reflects `data-state="open" | "closed"` so consumers can target
  `[data-state=closed]` for exit-animation styling.
- It keeps children mounted across a close until a `transitionend` /
  `animationend` fires on the gate, so screen-reader-relevant content is not
  yanked from the accessibility tree before an exit animation completes.
- It provides the `presenceContext` (`present` signal) so descendant widget
  pieces (e.g. a dialog's content) can react to presence without prop-drilling.
- Any ARIA semantics belong to the consuming widget (e.g. `dialog-content`
  sets `role="dialog"`), not to the gate.
