---
'@aihu/arbor': minor
---

`hydrate()` now adopts server-rendered structural segments (`each`/`if` content) IN PLACE instead of replacing them.

Previously the walker located a structural segment by its `<!--aihu:s:PATH-->` … `<!--aihu:/s:PATH-->` delimiters, removed the server's DOM, and materialized fresh nodes into its position (adopt-by-replace). Now `_adoptStructural` claims the segment's existing DOM into live reconciler child scopes and wires the same reconcile effect a fresh materialize would, with the state pre-seeded so the effect's first run confirms the adopted DOM:

- **Keyed lists** match rows BY KEY: each client item's row is located through the `data-aihu-path` the server stamped from the same key (`PATH.list.<key>`), so matching is position-independent. Client-only keys are created by the first reconcile run in position; server-only rows are swept out; adopted rows carry truthful `anchor`/`disposers`/`appendedNodes`/`item`/`pos` bookkeeping, so post-hydration appends, removes, and reorders operate on the adopted DOM correctly.
- **Conditionals** adopt when the client condition agrees with the server's rendered branch; on disagreement (client-divergent state such as a media query or localStorage) the server content is discarded and the reconciler rebuilds from client truth at the anchor. `elseif`/`else` arms are sibling `when()`s and resolve independently.
- **Fallback** is always the whole segment: shapes that cannot be claimed safely (unkeyed lists, spine-level element leaves, mid-claim divergence, markerless output) fall back to the previous adopt-by-replace behavior — content still appears exactly once, in order, merely un-adopted.

On apps/docs' `/guides/getting-started`, the 73 prerendered elements inside structural segments (sidebar sections, nav links, per-link `if` arms) now survive hydration instead of being rebuilt.

The structural marker pair and `data-aihu-path` scheme are unchanged; no server emission changes are required. `@aihu/arbor`'s size-limit row rises 3350 B → 4000 B to fund the adopter: measured 3963 B gzipped against a 3349 B baseline (+614 B), and the old budget had 1 B of headroom before this change, so the increase could not be absorbed.
