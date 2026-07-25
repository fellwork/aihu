# Adversarial review: `a993aa19` minimal-move keyed reconciliation (FEL-408)

**Reviewer stance:** refute, not confirm. **Date:** 2026-07-25.
**Subject:** `perf(arbor): minimal-move keyed reconciliation` (PR #579), merged to `main`, gating a release.
**Method:** the merged diff was read, then every claim was attacked with executable tests
run against BOTH `a993aa19` and its parent `79243546` in separate worktrees —
exhaustive permutation enumeration, an independent O(n²) LIS oracle, 2,100+
model-based fuzz trials across two `_moveNode` lanes, directed error-path and
degenerate-input repros, a local same-machine bench A/B, and a re-run of the
bypassed CI bench gate comparison from the PR's own uploaded artifact.

## Headline

**Two regressions introduced by this commit are CONFIRMED with failing repros
(both pass on the parent commit). The mainline algorithm — the LIS itself — is
correct and optimal under heavy adversarial testing. A verified 2-line fix heals
both defects, keeps all 52 tests green (including every FEL-408 move-count
assertion), and fits the 3300 B size row with +6 B to spare.**

Separately, the `[bench-bump]` override's stated justification does not match
the CI evidence it bypassed: the gate had **six** failing rows, not two, and the
two rows the commit message reports as WINs measured as +27.7 % / +29.5 %
**failures** in the very CI run that was overridden. A local A/B shows this
commit itself regresses nothing — but the override's factual record is wrong,
and FEL-409's baseline regeneration is about to bless two months of
unattributed drift on the four valid rows.

---

## Attack 1 — correctness of the subsequence implementation

### 1a. Predecessor-free reconstruction: **CONFIRMED-CORRECT**

**What was tried.** The claim — "when a row recorded length w+1, `t[w]` held the
value of the nearest earlier w-row and was strictly smaller" — was attacked
three ways:

1. **Exhaustive enumeration**: every permutation of n = 1..6 (873 total), fresh
   mount each, asserting (a) exact final DOM order and (b) `insertBefore` count
   `== 2 · (n − LIS)` where LIS comes from an **independent textbook O(n²) DP**,
   not the implementation under test. Any invalid (non-monotonic) chain would
   surface as wrong order or as a move the walk refuses to make. All pass.
2. **Chained permutations** (pos persistence): 400 random 4-step chains at n=6,
   order + optimality asserted at every step. All pass.
3. **Proof check** (independent of the author's argument): rows recording the
   same patience length have non-increasing `pos` values in processing order
   (if a later same-length row had a larger value it would have extended to
   length+1). A row recording w+1 therefore has SOME earlier w-row with smaller
   value, and the NEAREST earlier w-row has the smallest value among them — so
   the right-to-left first-match is always a valid link. The argument holds;
   here `pos` values are additionally distinct (assigned from distinct walk
   indices), which removes even the tie caveat.

**Verdict: CONFIRMED-CORRECT** — and the move counts are exactly minimal, not
merely "small": the `2·(n − LIS)` equality held for all 873 exhaustive
permutations and all 1,600 chained steps.

### 1b. `pos` doubling as scratch: **DEFECT — confirmed failing repro**

The predicted hazard is real, and it is the worse kind: **silently wrong DOM
order**, not extra moves.

If `lgrow`/materialize throws mid-reconcile (item i), the catch path rethrows —
but every already-processed survivor in `sl[0..i-1]` has had `pos` overwritten
with its patience **run length** (a small scratch integer), while unprocessed
survivors retain real positions. The final walk — the only thing that restores
`pos` to a real index — never runs. The next reconcile then computes an "LIS"
over garbage, flags rows as already-in-order that are not, **skips their
moves**, and commits a DOM order that contradicts the list. The walk then
stamps `pos = i` as if the order were right, so the corruption self-conceals.

This is not a hypothetical error path: **existing test E3
(`tests/structural.test.ts`, "no onError → error propagates to the writer;
committed items and retry stay consistent") explicitly blesses
throw-then-retry as a supported flow and asserts state stays consistent for
retry.** This commit breaks that guarantee for ordering.

**Failing repro (S1/S2 in the review rig — fails on `a993aa19`, passes on the
parent commit):**

```ts
const sig = signal(['c', 'b', 'a'])
mount(branch('ul', undefined, [each(sig, (i) => i, (i) => {
  if (i === 'boom') throw new Error('grow-boom')
  return branch('li', undefined, [leaf(i)])
})]), host)                                   // DOM: c b a — pos c=0 b=1 a=2

expect(() => sig[1](['a', 'c', 'b', 'boom'])).toThrow('grow-boom')
// patience scratch now: a.pos=0, c.pos=0, b.pos=1; DOM unchanged [c,b,a]

sig[1](['a', 'b'])                            // clean retry, exactly like E3
// scratch says [a(0), b(1)] is an increasing chain -> ZERO moves
// ACTUAL DOM: <li>b</li><li>a</li>  — list says [a, b].  Parent commit: [a, b].
```

Variant S2 (`sig[1](['a','b','c'])` after the same throw) yields `[b, c, a]`.
With `onError` set the throwing effect self-disposes (pre-existing `_mountEffect`
behavior, old and new), so the corrupt state is never re-read — the defect
requires the no-`onError` retry flow, which is precisely the one E3 tests.

**Verdict: DEFECT.** New in `a993aa19`; the parent's cursor walk re-derived
order from scratch every pass and could not be poisoned.

---

## Attack 2 — semantic preservation (FEL-395 / FEL-396)

**What was tried.**
- `git show a993aa19 -- packages/arbor/src/structural.ts` contains **no hunk
  touching `_moveNode`** — it is byte-identical, including the FEL-396
  detached-node guard. Confirmed by diff inspection, not description.
- All 28 pre-existing structural tests (FEL-395 T10/T11, FEL-396 shim +
  fallback + stale-detached-node, E1-E4, W1-W4, FEL-408 move counts) pass on
  the merged code.
- **Re-grown adjacent to repositioned** (the asked-for interaction): a targeted
  test reorders survivor `c` to the front while replacing its new neighbour `b`
  with a same-key different-ref object. Result: order exact, exactly one
  re-grow (`b`), survivor repositioned through `moveBefore`. Pass.
- A parity test (6 rows, rotate-by-one under a spec-faithful `moveBefore` shim
  that throws on detached nodes) shows every reposition of a surviving row goes
  through `moveBefore` — `insertBefore` is reached only via the shim's internal
  delegate (call-count parity), never directly for a live row.
- The FEL-395 reference-identity teardown motion (teardown + re-grow on ref
  mismatch) was further exercised by fuzz op 4 (random same-key ref
  replacement mixed with shuffles) across hundreds of trials.

**Verdict: CONFIRMED-CORRECT** for the supported (unique-key) input space.
**With one carve-out — duplicate keys, below — where FEL-395's teardown now
interacts with the new `sl` cache to resurrect disposed DOM.**

### Duplicate keys: **DEFECT (degenerate input) — confirmed failing repro**

`sc` is keyed by `kfn`, so duplicate keys always collapsed to one scope. The
old walk did `sc.get(k)` per item, so it could only ever touch the LIVE scope.
The new pass-1 caches `sl[i] = s` — and when a LATER occurrence of the same key
carries a different item ref, FEL-395 **tears that scope down** and re-grows,
while `sl[earlier]` still points at the disposed scope. The walk then calls
`_moveNode` on the disposed scope's anchor/nodes, whose `insertBefore` fallback
**re-inserts disposed DOM** (disposers already ran — a zombie row with dead
effects).

```ts
const sig = signal([b])                        // keys: (i) => i.id
mount(... each(sig, i => i.id, i => branch('li', undefined, [leaf(i.label)])) ...)
sig[1]([{id:'a',label:'A1'}, b, {id:'a',label:'A2'}])
// merged code:  <li>A1</li><li>B</li><li>A2</li>   — 3 rows for 2 keys;
//               A1 is disposed DOM re-inserted (its effects are dead)
// parent commit: <li>B</li><li>A2</li>             — 2 rows, no resurrection
```

Duplicate keys are user error and arguably out of contract (the old behavior
was also odd — the dup landed at its last occurrence). But "odd order" became
"disposed nodes re-entering the document", which is a categorically worse
failure mode, and nothing validates keys at the boundary. At minimum this
deserves a documented UB statement or a dev-mode duplicate-key warning.

---

## Attack 3 — edge cases

All run on the merged code; every one passes:

- **Empty list; single row; all-new keys; total turnover; shrink-to-zero and
  regrow** — targeted tests, pass.
- **Multi-node rows** (`appendedNodes.length > 1`, fragment of two `<li>`s) —
  dedicated fuzz lanes (500 trials), pass.
- **Trailing siblings after the region + leading sibling** — every fuzz trial
  mounts `[leaf('lead'), each(...), <hr>]` and asserts the `<hr>` stays
  terminal after every step, including brand-new rows born past it. Pass.
- **Adjacent `each()` regions in one parent** — both append fresh scopes to the
  END of the shared parent (past the other region); 60 interleaved
  shuffle/insert/delete/reverse steps keep both regions exact. Pass.
- **Nested `each()` in `each()`** — outer reorder preserves inner lists; inner
  reorder still works after the outer scope was repositioned (per-instance
  `pos` does not leak). Pass.
- **`when()` inside `each()`** (branch-wrapped) — toggle off, reorder, toggle
  back on, reorder again. Pass. (The bare-structural variant's stale
  `appendedNodes` resurrection is pre-existing, documented in the FEL-396 test,
  and unchanged by this commit.)
- **Fuzz**: 2,100+ randomized trials total (mixed shuffle/reverse/insert/
  delete/ref-replace/clear/rebuild/rotate; lists up to 24 rows; seeds fixed for
  reproducibility) in BOTH `_moveNode` lanes — plain `insertBefore` and a
  spec-faithful `moveBefore` shim that throws `HierarchyRequestError` on any
  detached node. Zero failures.

**The predicted "second fuzz bug" exists but random fuzzing cannot find it**:
the author's 3,000-trial fuzz (and mine) draws from ops that never throw
mid-grow and never emit duplicate keys. Both confirmed defects live exactly in
the blind spot of that op set. Verdict for the in-contract input space:
**CONFIRMED-CORRECT**; out-of-contract findings are the two defects above.

---

## Attack 4 — the `[bench-bump]` override

**What was tried.** Pulled the PR's own CI artifact (`bench-arbor-results`,
run 30170519791) and re-ran the exact comparison the bypassed gate would have
run (`bun src/gate.ts` against `origin/main:bench/arbor/RESULTS.md`):

```
FAIL mount-10k-leaves:        49043682 → 62624158 ns  (+27.7 %)
FAIL mount-deep-100x10:        4318938 →  5591259 ns  (+29.5 %)
FAIL mount-wide-1000:         12686487 → 17856268 ns  (+40.8 %)
FAIL update-1-of-10k-leaves:        29 →      751 ns  (+2523.3 %)
FAIL attr-thrash-100x100:        65517 → 27094781 ns  (+41255.3 %)
FAIL krausest-1k-cycle:       31164500 → 47553361 ns  (+52.6 %)
```

Findings, separated carefully:

1. **The fictional-baseline argument for the two named rows is sound.** The
   bisect doc's causal chain (missing `baseUrl` → two `@aihu/signals`
   instances → 0 DOM writes/op at the baseline commit; one-line flip moves the
   numbers by the disputed factors) is coherent and its arithmetic checks out
   (6.55 ns per JSDOM `setAttribute` is indeed impossible). Those two rows were
   never valid comparisons.
2. **But the override's stated scope is false.** The commit message says "The
   two failing rows…". The gate it bypassed had **six** failing rows. Four of
   them are rows whose baselines the bisect doc itself classifies as **valid**
   (`mount-*`) or only ~5 % contaminated (`krausest`: 2,000 of 2,100 mutations
   were real at baseline — the binding bug cannot explain +52.6 %).
3. **The claimed WINs are contradicted by the run that was overridden.** The
   message reports `mount-10k-leaves −13.4 %` and `mount-deep-100x10 −18.2 %`;
   the bypassed CI comparison measured **+27.7 %** and **+29.5 %** on those
   rows. The WIN numbers evidently come from a local M5 session and do not
   reproduce even locally in this review (see 4).
4. **This commit itself regresses nothing** — verified directly, same machine,
   same session, arbor-only, parent vs merged (2-3 runs each, p50 ns):

   | workload | parent | merged | delta |
   | --- | ---: | ---: | ---: |
   | mount-10k-leaves | 20.03/20.83 M | 20.05/20.14/20.31 M | ~0 |
   | mount-deep-100x10 | 1.845/1.839 M | 1.812/1.818/1.813 M | −1.5 % |
   | mount-wide-1000 | 4.87/4.75 M | 4.83/4.80/4.94 M | ~0 |
   | update-1-of-10k-leaves | 245.9/245.1 | 256.5/257.0/253.0 | +4 % (≈10 ns, noise) |
   | attr-thrash-100x100 | 4.80/4.92 M | 4.95/4.82/4.76 M | ~0 |
   | krausest-1k-cycle | 12.05/12.29 M | 11.95/12.16/12.30 M | ~0 |

   (Also note: the claimed −13.4 %/−18.2 % WINs don't reproduce here either —
   mount rows are flat. Dead-field deletion appears to be worth ~0, as one
   would expect of two property writes.)

   **To state the record plainly: EVERY number in that gate output — the
   FAILs and the WINs alike — is noise against a baseline already proven
   untrustworthy.** The merge commit (and the release discussion that quoted
   it) reported the −13.4 %/−18.2 % rows as a genuine unlooked-for win from
   deleting dead fields. That claim is wrong twice over: the same rows
   measured +27.7 %/+29.5 % in the bypassed CI run itself, and the controlled
   parent-vs-merged A/B shows the commit is flat on all six workloads. Numbers
   quoted from a gate one has already proven broken carry no evidential
   weight in either direction; the record should carry this paragraph, not
   the WIN claim. Likewise the committed `[bench-bump]` justification ("the
   two failing rows") is factually wrong — the artifact shows six — even
   though its CONCLUSION (no regression from this commit) independently
   survives via the A/B above. FEL-409 must not inherit either the WIN claim
   or the two-row account.)
5. **The residual risk is the four valid rows' +27.7…+52.6 % against the
   May 25 CI baseline.** Same mitata/Bun/JSDOM versions on both runs, so it is
   either GitHub-runner hardware variance or real code drift on `main`
   accumulated May 25 → Jul 22 (the bisect doc's question A only cleared
   `331b0151`→main, i.e. Jul 22 → Jul 25). Unattributed. **FEL-409's
   regeneration will bless whatever these numbers are and erase the
   evidence.** Before regenerating, run the bench on the SAME CI runner at
   both `a16fa989`'s tree and current main to split hardware drift from code
   drift on the valid rows.

**Verdict:** override argument **sound for 2 of the 6 rows it silenced,
UNVERIFIED for the other 4**; the commit message's account of the gate state is
factually wrong (a records problem, not a performance problem — the local A/B
clears this commit itself). No release-blocking perf regression found.

### Written instruction for FEL-409 (baseline regeneration)

**Do not regenerate the arbor bench baselines until a same-runner
attribution run has been performed and its result recorded:**

1. On ONE CI runner (same workflow, back-to-back jobs), run the bench at the
   `a16fa989` tree AND at current `main`.
2. Compare the four valid-baseline rows (`mount-10k-leaves`,
   `mount-deep-100x10`, `mount-wide-1000`, `krausest-1k-cycle`). The
   checked-in May baseline vs the July artifact shows +27.7 % … +52.6 % on
   these rows with identical mitata/Bun/JSDOM versions — so the delta is
   either GitHub-runner hardware variance or real code drift on `main`
   between 2026-05-25 and 2026-07-22 (the bisect doc only cleared
   Jul 22 → Jul 25).
3. If the same-runner comparison is flat, the drift was hardware; regenerate
   freely and note it. If it is not flat, bisect BEFORE regenerating —
   regeneration would bless a real regression and erase the only evidence.

This is the one step that turns the May→July drift from "silently blessed"
into "attributed"; it costs one CI job.

---

## Attack 5 — the size raise (3200 → 3300 B)

**What was tried.**
- Rebuilt on the merged tree: `@aihu/arbor` **3.19 kB / 3300 B (+29 B
  headroom)** — matches the commit's claim exactly. Row measured through the
  repo's own `scripts/size.ts`.
- Mangle audit: the new `[/\.pos\b/, '.p']` / `[/\bpos:/, 'p:']` (and `item`)
  patterns leave zero unmangled sites in dist and cannot hit `.position`/
  `dispose`/`.items` substrings (word-boundary anchored, verified by grep on
  the built dist).
- **Cheaper formulations probed:**
  - *Greedy monotonic cursor* (keep rows whose `pos` exceeds the max seen —
    no `t` array, no reconstruction): fails the headline case itself — for
    swap 1↔998 it keeps `[0, 998]` and moves ~996 scopes. Not a formulation,
    a regression.
  - *Merge the reconstruction into the walk* by running the patience pass
    right-to-left and reconstructing left-to-right inside the walk (~25 B
    saved by deleting the middle loop): requires iterating grow/teardown in
    REVERSE list order, which changes the commit ordering that E4 locks
    ("earlier items committed, in-flight aborted") and the teardown ordering
    the author separately rejected at 18 B. Semantics-breaking; correctly
    rejected in spirit.
  - *Drop the `-2` sentinel* (new rows straight to `-1`, guard reconstruction
    with `w >= 0 &&`): byte-neutral at best, and the current form is the one
    that provably cannot mistake a fresh row for a stable one. No win.
- The exact per-alternative byte figures in the commit (2/13/18/15-20 B) were
  not re-measured (**UNVERIFIED**, low value); the end-state measurement and
  the alternatives' correctness properties were.

**Verdict: CONFIRMED** — the measured size is as claimed and this review found
no cheaper formulation that preserves the documented semantics. Note the
defect fix below consumes 23 of the 29 spare bytes.

---

## The fix (verified, not merely proposed)

Two lines heal both defects; all 52 tests pass with them (22 adversarial + 2
supplementary + 28 pre-existing, including every FEL-408 move-count
assertion), and the built package measures **3.22 kB (+6 B headroom)**:

```diff
   } catch (err) {
     _abortChild(cd, ca, par)
+    for (const sn of sl) sn.pos = -1   // scratch is not a position; movers-only next pass
     throw err
   }
   ...
   for (let i = 0; i < n; i++) {
     const s = sl[i]!
+    if (s.anchor.parentNode !== par) continue  // dup-key: never walk a disposed scope
     const nl = s.appendedNodes
```

The catch-path reset degrades the NEXT post-throw reconcile to move-everything
(cursor-equivalent, always order-correct) and costs nothing on the happy path.
The walk guard makes disposed-scope resurrection impossible by construction.
Regression tests to carry with the fix: S1/S2 (throw-then-retry ordering) and
D2 (duplicate-key resurrection) from the review rig; both currently FAIL on
`main` and PASS on the parent commit.

---

## Go / no-go

**NO-GO on releasing `main` as-is.** Not because the algorithm is wrong — it
is provably and empirically right, and genuinely optimal — but because the
commit introduces two order-integrity regressions with concrete repros, one of
them (S1/S2) inside a retry flow the repo's own E3 test declares supported,
both silent, both absent on the parent commit. Wrong DOM order with no error
is this framework's worst failure class.

The distance to GO is small and verified: land the 2-line fix plus the S1/S2/
D2 regression tests (fits the size row at +6 B), then release. **Update: that
fix is now PR #581 (`fix/lis-pos-scratch-and-dup-key`) — both fixes, the
repros as regression tests R1/R1b/R2 (confirmed to fail on the unfixed
reconciler: 3 failed | 28 passed), the `pos` invariant documented at its
declaration, and a `@aihu/arbor` patch changeset; measured 3.22 kB gz (+6 B
headroom).** If the release
cannot wait even for that, the honest fallback is reverting `a993aa19` — but
given the fix is already validated end-to-end, patching is strictly better.

Independent of the release: correct the `[bench-bump]` record (six rows, not
two; the WIN claims do not survive contact with the bypassed run), and gate
FEL-409's baseline regeneration on a same-runner May-tree-vs-main comparison
so two months of unattributed drift on the four valid rows is explained, not
blessed.

---

### Evidence inventory

- Review rig (worktree-local, reproducible; seeds fixed):
  `packages/arbor/tests/lis-adversarial.test.ts` (22 tests: exhaustive n≤6 +
  DP-oracle optimality, 400 chained, 1,300-trial fuzz x2 lanes, FEL-395/396,
  edges, D1/D2, S1/S2) and `lis-adversarial2.test.ts` (adjacent regions,
  500-trial large-list fuzz). Merged code: 19/22 + 2/2 pass — failures are
  exactly D2, S1, S2. Parent commit: the same repros all pass.
- Bench A/B harness: arbor-only p50 over all six workloads, run in both
  worktrees same-session (table above).
- Bypassed-gate replay: PR artifact `bench-arbor-results` vs
  `origin/main:bench/arbor/RESULTS.md` through the repo's own
  `bench/arbor/src/gate.ts` (output above).
- Size: `bun scripts/size.ts` on the merged tree (3.19 kB) and with the fix
  applied (3.22 kB).
