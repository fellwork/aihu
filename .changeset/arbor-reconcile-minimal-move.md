---
"@aihu/arbor": patch
---

Keyed `each()` now performs the **minimum** number of DOM moves on a reorder.
A 2-row swap in a 1000-row list went from **1994 DOM moves to 4**.

`_reconcileEach`'s reposition pass was a single left-to-right cursor with no
notion of a stable subsequence: it moved every scope that was not already
sitting at the cursor. Moving row 998 into slot 1 therefore displaced row 1,
which displaced rows 2–997, and each of those was relocated individually — at
two nodes apiece, because a row scope carries an `<!--e-->` anchor comment
alongside its content. O(n) DOM moves for an O(1) reorder.

The pass now runs patience sorting over the surviving scopes' current DOM
order to find the longest increasing subsequence — the rows already in the
right relative order — and moves only the rest. Instrumented counts on a
1000-row keyed list (DOM nodes moved; 2 per row scope):

| operation                | before | after |
| ------------------------ | -----: | ----: |
| swap rows 1 ↔ 998        | 1994   | **4** |
| swap 1↔498 **and** 501↔998 | 1988 | **8** |
| full reverse             | 1998   | 1998  |
| prepend one row          | 3      | 3     |
| append one row           | 1      | 1     |
| delete from the middle   | 0      | 0     |
| no-op re-render          | 0      | 0     |

Reverse is unchanged because a reversal genuinely has no stable subsequence
longer than one row — 999 moves is already optimal there.

Behaviour is otherwise identical. FEL-395's reference-identity teardown (a
row whose `item` reference changed is torn down and re-grown) and FEL-396's
`moveBefore()` preference are untouched; this change is only about *which*
surviving scopes get repositioned. A brand-new row is grown at the end of the
parent — past anything that follows the `each()` region — so it is explicitly
held out of the stable subsequence and always placed by the walk.

Introduced by `9195d20d`, the original v1 reconciler; pre-existing rather than
a regression. See `docs/plans/2026-07-25-swap1k-investigation.md` for the
measurement that isolated it: a framework-free control doing 997 moves instead
of 2 reproduced the regression with no framework code involved.

Internal cleanup rolled in: `ChildScope.key` was written on every row and read
nowhere, and `when()`'s child scope carried an `item: null` the conditional
path never compares. Both are `@internal` and are gone.
