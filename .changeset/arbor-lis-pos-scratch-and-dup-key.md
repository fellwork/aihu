---
'@aihu/arbor': patch
---

Fix two order-integrity regressions in the FEL-408 minimal-move keyed
reconciler (found by adversarial review of a993aa19; see
docs/plans/2026-07-25-lis-adversarial-review.md):

- A mid-reconcile `lgrow()` throw (the supported no-`onError` retry flow) left
  LIS scratch run-lengths in `ChildScope.pos`; the next clean reconcile
  trusted them as DOM positions and silently committed wrong row order. The
  catch path now resets processed rows' `pos` to -1 so the retry repositions
  them cursor-style.
- With a duplicate key whose refs differ, the reposition walk re-inserted a
  torn-down scope's disposed nodes (a zombie row with dead effects). The walk
  now skips any scope whose anchor is no longer attached.

Both repros are locked as regression tests that fail on the pre-fix reconciler.
