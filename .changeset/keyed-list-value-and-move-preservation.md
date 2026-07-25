---
"@aihu/arbor": patch
"@aihu/runtime": patch
---

Fix two related keyed-list / node-identity defects (FEL-395, FEL-396):

- **FEL-395** — `each()`'s reconciler skipped re-growing a row whenever its
  key was unchanged, even when the underlying item was a brand-new object
  with different field values. Since row bodies capture their item by value
  at grow time, replacing a list with new objects sharing the same keys left
  stale field values rendered in the DOM forever. `_reconcileEach` now
  reference-compares the incoming item against the value each `ChildScope`
  was last grown from, and re-grows on a mismatch.

- **FEL-396** — moving a component within a keyed `each()` (e.g. a reorder)
  destroyed all of its state: inputs lost their values, disclosures closed,
  scroll position reset, entry animations replayed, `$resource` re-fetched,
  and `onMount` side effects re-ran. The reconciler now repositions existing
  rows via the WHATWG `moveBefore()` API where the host supports it (Chrome/
  Edge 133+, Firefox 144+ — not yet in Safari, and not in jsdom, so the
  runtime feature-detects per call and falls back to `insertBefore`, today's
  behavior, everywhere else). `moveBefore` only preserves state for a custom
  element whose class defines `connectedMoveCallback` — an empty body is
  sufficient opt-in — so both of `@aihu/runtime`'s `defineComponent` class
  forms and `defineElement`'s wrapper class now define one.

  Caveat: `connectedMoveCallback` runs neither `_build()` nor
  `connectedCallback`, so a moved component's DI/context (`provide`/`inject`)
  chain does NOT re-resolve — it keeps whatever ancestor `provides` object it
  resolved at first connect, even if the move relocates it under a different
  provider.

  Review follow-up: unlike `insertBefore`, a real `moveBefore()` throws
  `HierarchyRequestError` when handed a node that isn't still attached under
  the same root as the move target — a hazard reachable for a compiler-
  emitted bare-structural row body (`each(..., (item, i) => when(...))`,
  what `{#each}{#if}...{/if}{/each}` lowers to): the nested `when()`'s live
  content nodes land in the outer row's `appendedNodes` snapshot at grow
  time, and that snapshot goes stale (keeps a detached reference) once the
  nested `when()` toggles off, without the outer row itself changing. The
  reposition helper now only takes the `moveBefore` branch for nodes that
  are still attached under the reorder target's root, falling back to
  `insertBefore` otherwise (today's behavior). The underlying staleness —
  `appendedNodes` never getting refreshed when a row's top-level structural
  toggles — is a separate, pre-existing defect, filed apart from this guard.
