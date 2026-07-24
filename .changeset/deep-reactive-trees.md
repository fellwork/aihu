---
"@aihu/reactive": minor
---

Introduce `@aihu/reactive`: fine-grained Proxy-backed deep reactive trees on
`@aihu/signals` (docs/plans/2026-07-24-deep-reactivity.md).

Two entries:

- `.` — `reactive`/`isReactive`/`unwrap`/`mutate`/`reconcile`. A Solid-shaped
  node model (lazily allocated per-`(object, key)` tracking cells, allocated
  on the first proxy touch whether tracked or not) with Vue-shaped write
  ergonomics (plain `obj.key = value` assignment, no `setStore(...)` path
  tuples). `@aihu/signals` is `external` — zero bytes added to the signals
  core row.
- `./helpers` — `toSignal`/`toSignals`/`toReactive`/`reactivePick`/
  `reactiveOmit`/`reactiveComputed`, the tree ↔ tuple bridge.

Purely additive: no shipped composable's contract changes. Note the
`@aihu/store` setup-store `isReactive()` detection follow-on (design doc
§7.2 item 3) is tracked separately, not included here.
