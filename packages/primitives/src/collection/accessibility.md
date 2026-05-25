# `collection` — accessibility

**Structural; no ARIA.** `<aihu-collection>` is a descendant-registration
substrate, not a widget. It imposes no role and ships no CSS.

- Descendants `register(el)` on connect and call the returned disposer on
  disconnect; the collection keeps its `items` signal in **DOM order**
  (re-sorted via `compareDocumentPosition` on every registration), so consumers
  iterate items in the order a sighted/AT user perceives them.
- It provides `collectionContext` (`{ register, items }`) which higher-level
  primitives consume — e.g. `roving-focus` enumerates collection items to manage
  roving tabindex. Any ARIA roles (`toolbar`, `menu`, `listbox`, …) belong to
  the consuming widget, not the collection.
