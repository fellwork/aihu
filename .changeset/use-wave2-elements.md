---
"@aihu/use": minor
---

feat(use): Wave 2 Elements — 4 shadow-DOM-correct CORE composables

`@aihu/use` grows the four Elements composables that were blocked on the
composed-tree event substrate (PR #564,
`docs/plans/2026-07-24-composed-tree-helper.md`):

- **`useClickOutside`** (alias `onClickOutside`) — fires when a
  `pointerdown`/`pointerup` gesture both land outside the target (and outside
  every `ignore` entry). The pointerdown/pointerup pairing stores two
  **booleans**, never the raw events — `composedPath()` is only populated
  during an event's own dispatch, so re-reading a stashed event after it
  finishes silently degrades back to the broken `event.target` up-walk.
- **`useActiveElement`** — a reactive `composedActiveElement`, drilled
  through open shadow roots to the truly-focused leaf (`document
  .activeElement` alone stops at the outermost host).
- **`useHover`** — `isEventInside` on `pointerover`/`pointerout`, with
  `relatedTarget` containment (via `composedContains`) to suppress
  descendant-to-descendant flicker, plus `delayEnter`/`delayLeave`.
- **`useMouseInElement`** — mouse position relative to a target, with
  `isOutside` driven by `isEventInside` (not bounding-box geometry) and
  `scroll`/`resize` re-derivation between pointer moves.

All four hit-test through `../shared/composed-tree.ts`'s
`isEventInside`/`isEventInsideAny`/`composedContains`/`composedActiveElement`
— never `Element.contains()` or a naive up-walk from `event.target`, both of
which give the wrong answer once a click/hover genuinely originates inside a
nested shadow element (`event.target` is retargeted UP to the outermost
shadow host, so a container below that host is never on the up-walk).

Every composable follows the house contract: `isClient`-guard-first SSR
no-ops, `tryOnScopeDispose`/manual `stop()` teardown, and CORE's
signals-only dependency rule (`scripts/dep-check.ts`). Tests exercise real
`attachShadow` boundaries (single and two-level-nested), not mocks — per the
repo's standing lesson that light-DOM-only tests have repeatedly passed
while shadow-DOM behaviour was broken. `useClickOutside` additionally has a
dedicated regression test for the "stores events, not booleans" bug class:
a genuine click two shadow roots deep, dispatched as two separate
`pointerdown`/`pointerup` events, only passes if pointerdown's hit-test
result was captured as a boolean during ITS OWN dispatch rather than
re-derived later from a stashed event whose `composedPath()` has since gone
empty.

`useContextMenu` (`@aihu/primitives`, same substrate, different package
layer) is intentionally not part of this PR.
