---
"@aihu/primitives": patch
---

Fix `queryTabbables`' tab-order reconstruction to match the real HTML
sequential-focus-navigation algorithm instead of reordering each
focus-navigation scope in place at its original composed-DFS position.

Previously, a nested shadow root's content stayed pinned at the document
position its host originally occupied, rather than traveling WITH the host
once the host's own scope was reordered by tabindex. This diverged from the
platform's real Tab sequence in exactly the scenario this module exists to
get right — a positive-`tabindex` element and a shadow host interacting in
the same scope:

- A natural host before a positive-`tabindex` sibling: returned `[b, x, a]`
  where the browser visits `[b, a, x]`.
- A positive-`tabindex` host: returned `[host, a, x]` where the browser
  enters the host's shadow tree immediately after the host, visiting
  `[host, x, a]`.

Both cases made `createFocusTrap`'s first/last-tabbable bookkeeping disagree
with native Tab traversal, causing the trap to wrap at the wrong edges.

`queryTabbables` now builds a real scope tree during the walk: each open
shadow root is a nested scope whose HOST is a member of the parent scope
(ordered there by the host's own `tabindex`, even when the host itself isn't
tabbable); each scope's direct members are ordered by tab rules (positive
`tabindex` ascending, ties in tree order, then naturals in tree order); and
each host's already-ordered nested scope is spliced in immediately after it
in the parent's ordered sequence — not left at its original DFS slot.

Corrected the `orderScope` doc comment's cross-scope invariant claim
accordingly (a nested scope moves with its host; it does not keep its
original relative document position) and added regression tests for both
confirmed cases.
