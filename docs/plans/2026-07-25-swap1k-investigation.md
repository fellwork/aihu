# `05_swap1k`: why aihu measures ~159 ms where vanilla measures ~15 ms

**Status:** investigation complete. No code changed. Nothing re-baselined.
**Date:** 2026-07-25
**Verdict: (b) PRE-EXISTING architectural cost in keyed reconciliation.**
**#546 is not the cause and is not a regression on this workload.**
**Blocks:** FEL-407 (correcting the "122x faster than vanilla" claim).

**Machine:** Apple M5, macOS 26.5.1, Bun 1.3.8, Chrome 150.0.7871.186, JSDOM
25.0.1, darwin/arm64. Load average **22–49 for the entire session** (concurrent
agent sessions). Absolute milliseconds are therefore **indicative only**. Every
comparison below is interleaved within one session with a fresh Chrome process
per (rep, arm), so common-mode load cancels; the ratios are the claim.

---

## 0. TL;DR

| question | answer |
| --- | --- |
| Does the jsfb `swapRows` preserve row object identity? | **Yes — all 1000 of 1000.** `arr.slice()` is a shallow copy. |
| Does #546's reference-identity check re-grow rows here? | **No. `lgrow` invocations for one swap: 0.** |
| How many DOM moves does one 2-row swap perform? | **1994.** Correct is **2**. |
| Was that count different before #546? | **No — 1994 at the parent commit too.** Dates to `9195d20d`, the original v1 reconciler. |
| Which `_moveNode` path does the harness's Chrome take? | **`moveBefore`, 1994/1994 calls.** Chrome 150 has it natively; the fallback is never taken. |
| Is #546 slower? | **No.** JS-sync phase **0.41x (2.4x faster, 7/7 reps)**; layout-inclusive **1.046x** — a ~5 % shift of work from JS into style/layout, net ≈ neutral. |
| What explains the ~10x gap? | **The move count, and nothing else.** Framework-free vanilla code doing 997 moves instead of 2 measures **1.009x of aihu** (6/7 reps) — statistically identical. |

**The 159 ms is real, it is not noise, it is not #546, and it is not "framework
overhead". It is a naive left-to-right reposition loop in `_reconcileEach` that
performs O(n) DOM moves for an O(1) reorder.**

---

## 1. The `swapRows` implementation — identity is preserved

`bench/js-framework-benchmark/keyed/aihu/src/main.ts:175-183`:

```ts
on('swaprows', () => {
  const arr = data[0]()
  if (arr.length <= 998) return
  const next = arr.slice()
  const tmp = next[1] as Row
  next[1] = next[998] as Row
  next[998] = tmp
  data[1](next)
})
```

`arr.slice()` is a **shallow** copy: a new array, the same 1000 `Row` objects.
Verified by instrumentation, not by inspection:

```
next[1]   === arr[998] (same ref): true
next[998] === arr[1]   (same ref): true
row objects surviving by reference: 1000 / 1000
```

**The prime hypothesis is falsified for this workload.** #546 replaced
`if (sc.has(k)) continue` with `if (existing.item === items[i]) continue`. Every
one of the 1000 rows passes that reference comparison, so every one of them takes
`continue` exactly as it did before. The per-row factory is never re-entered.

### 1.1 The #546 review's warning is nonetheless correct — it just isn't this

The review raised that a derived list would re-grow every row. It does. Same
harness, same swap, on `arr.map(r => ({ ...r }))`:

| arm | `lgrow` calls | `removeChild` | `createElement` |
| --- | ---: | ---: | ---: |
| **pre-#546** (`9d8a49db`) | 0 | 0 | 0 |
| **#546** (`edc15f2a`) | **1000** | 2000 | 8000 |

That is a genuine, merged behaviour change: any consumer whose list is produced
by `.map()`, re-parsed JSON, or an immutable store now re-grows every row on
every update. It is worth a follow-up ticket on its own merits — **it is not,
however, what `05_swap1k` measures**, because the jsfb entry uses `slice()`.

---

## 2. Instrumented counts for one swap

Harness: `jsdom` 25.0.1, the jsfb entry replicated verbatim (`rowNode`, `each`,
`mount`, the `swaprows` body above), with `Node.prototype.insertBefore /
appendChild / removeChild` and `document.createElement / createComment /
createTextNode` counted, and `lgrow` counted at the row factory.

**`01_run1k` (build 1000 rows), for scale**

```
lgrow: 1000   appendChild: 11000   createElement: 8000
insertBefore: 1000   createComment: 1000   createTextNode: 2000
```

**`05_swap1k` — swap index 1 ↔ 998, correct behaviour is 2 moves, 0 re-grows**

| counter | `9d8a49db` (pre-#546) | `edc15f2a` (#546) | correct |
| --- | ---: | ---: | ---: |
| **`lgrow` (row re-grows)** | **0** | **0** | 0 |
| **DOM node moves** | **1994** | **1994** | **2** |
| `appendChild` | 0 | 0 | 0 |
| `removeChild` | 0 | 0 | 0 |
| `createElement` | 0 | 0 | 0 |

Correctness was verified on both arms: exactly 2 of 1000 DOM rows differ from the
pre-swap order, and positions 1 and 998 hold each other's rows. **The output is
right. The route to it is 997x longer than it needs to be.**

### 2.1 Where 1994 comes from

`packages/arbor/src/structural.ts:251-265` — the reposition pass:

```ts
let ref: globalThis.Node | null = anc.nextSibling
for (let i = 0; i < items.length; i++) {
  const k = kfn(items[i])
  const s = sc.get(k)
  if (!s) continue
  const nl = s.appendedNodes
  if (s.anchor !== ref) _moveNode(par, s.anchor, ref)
  else ref = s.anchor.nextSibling
  for (const n of nl) n === ref ? (ref = n.nextSibling) : _moveNode(par, n, ref)
  ref = (nl[nl.length - 1] ?? s.anchor).nextSibling
}
```

This is a single left-to-right pass that moves any scope not already sitting at
`ref`. It has **no notion of a longest stable subsequence**, so it does not ask
"which rows are already in the right relative order?" — it only asks "is this row
at the cursor?".

Walk the swap through it. Each row scope occupies **two** nodes: a `<!--e-->`
anchor comment plus the `<tr>`.

* `i = 0` — row 0 is already at the cursor. No move.
* `i = 1` — row 998's scope is moved from DOM position 998 to before row 1.
  **2 moves.** Row 1 is now physically at position 2, but belongs at 998.
* `i = 2…997` — rows 2 through 997 are each one slot to the *right* of the
  cursor, because row 1 is still sitting in front of them. Each is moved past it.
  **2 × 996 = 1992 moves.**
* `i = 998` — row 1 has been passively left behind at exactly the right place.
  No move. `i = 999` — no move.

**2 + 1992 = 1994.** Displacing one row displaces every row behind it, and the
algorithm pays for each one individually.

### 2.2 This is original, not new

`git diff 9d8a49db edc15f2a -- packages/arbor/src/structural.ts` shows the loop's
control flow is byte-for-byte unchanged; the only edit is the call target:

```diff
-    if (s.anchor !== ref) par.insertBefore(s.anchor, ref)
+    if (s.anchor !== ref) _moveNode(par, s.anchor, ref)
     else ref = s.anchor.nextSibling
-    for (const n of nl) n === ref ? (ref = n.nextSibling) : par.insertBefore(n, ref)
+    for (const n of nl) n === ref ? (ref = n.nextSibling) : _moveNode(par, n, ref)
```

`git log -S 'let ref: globalThis.Node | null = anc.nextSibling'` names a single
commit: **`9195d20d` — "Plan 1.1 (reconciler)"**, the original v1 implementation.
The O(n)-move behaviour has been in `each()` since the reconciler was written.

---

## 3. `moveBefore` vs fallback — which path Chrome takes

`_moveNode` feature-detects per call. Counted in the actual measurement browser
(**Chrome 150.0.7871.186**, `Element.prototype.moveBefore` present), counters
armed only for the duration of the swap:

| arm | `moveBefore` | `insertBefore` | native `moveBefore` available |
| --- | ---: | ---: | --- |
| `edc15f2a` (#546) | **1994** | 0 | yes |
| `9d8a49db` (pre) | 0 | **1994** | yes |
| vanilla reference | 0 | **2** | yes |

**The fallback is never silently taken.** All 1994 calls take the `moveBefore`
branch; the guard (`node.parentNode !== null && node.getRootNode() ===
par.getRootNode()`) passes for every row. The second candidate cause is ruled
out — but note this also means #546 *did* change which platform API executes 1994
times per swap, which is why it must still be measured rather than assumed inert.
It was (§4).

---

## 4. The #546 A/B

**Arms**

| arm | commit | notes |
| --- | --- | --- |
| `pre` | `9d8a49db` | parent of #546 |
| `546` | `edc15f2a` | #546 as merged |
| `vanilla` | — | reference keyed implementation, 2-move swap |
| `vanilla-naive` | — | **control**: identical vanilla code, identical final DOM, but placed with arbor's left-to-right walk (997 moves). No arbor code. |

**Method.** Each arm is `bun build --format=iife --minify` of that worktree's own
`bench/js-framework-benchmark/keyed/aihu/src/main.ts`, with `node_modules/@aihu/*`
shims resolving **inside that worktree** — a symlink to the main checkout would
silently resolve `@aihu/signals` to the wrong tree and invalidate the comparison
(the failure mode documented in `2026-07-25-arbor-perf-bisect.md` §7). Each arm is
served as a self-contained page carrying the Bootstrap-3 subset the real jsfb page
uses, including the two structural selectors that make a reorder expensive to
restyle (`.table-striped > tbody > tr:nth-of-type(odd)`, `.table-hover > tbody >
tr:hover`). Driven over CDP: **fresh Chrome process per (rep, arm)**, arm order
rotated per rep, 5 warmup + 10 measured swaps per process, `min` per process (the
appropriate estimator under one-sided noise), median of per-process minima across
7 reps, plus a per-rep paired ratio and a sign test.

Three timings per swap:

* **`sync`** — the click handler's own JS+DOM work.
* **`layout`** — `sync` plus a forced style-recalc + layout flush
  (`tbody.offsetHeight`). This is the honest estimator; it has no frame quantum.
* **`paint`** — until after the next paint. Carries a ~16.7 ms frame floor, which
  compresses every ratio; reported for completeness only.

**Results — median of per-process minima, 7 reps, load 41→35**

| arm | `sync` | `layout` | `paint` | `layout` spread |
| --- | ---: | ---: | ---: | ---: |
| `pre` `9d8a49db` | 3.90 ms | 22.10 ms | 27.50 ms | 11 % |
| `546` `edc15f2a` | 1.60 ms | 23.20 ms | 28.60 ms | 5 % |
| **`vanilla-naive`** (control) | 1.50 ms | **22.90 ms** | 28.60 ms | 10 % |
| `vanilla` | 0.10 ms | **2.80 ms** | 18.90 ms | 27 % |

**Paired ratios — median of per-rep ratios, with sign test**

| comparison | `sync` | `layout` | `paint` |
| --- | ---: | ---: | ---: |
| **`546` / `pre`** | **0.410x** (0/7 slower) | **1.046x** (5/7) | 1.040x (5/7) |
| `546` / `vanilla` | 16.0x (7/7) | **8.214x** (7/7) | 1.511x (7/7) |
| `pre` / `vanilla` | 38.0x (7/7) | 7.893x (7/7) | 1.463x (7/7) |
| **`vanilla-naive` / `vanilla`** | 14.0x (7/7) | **8.138x** (7/7) | 1.521x (7/7) |
| **`546` / `vanilla-naive`** | 1.133x (7/7) | **1.009x** (6/7) | 1.011x (6/7) |

A confirming 9-rep run at load 37→44 gave the same picture: `546/pre` layout
**1.050x** (8/9), `546/vanilla` layout **8.593x** (9/9), `546/pre` sync
**0.417x** (0/9).

### 4.1 Reading the table

**#546 is not a regression on `05_swap1k`.** `moveBefore` is materially *cheaper*
than `insertBefore` in the JS phase — **0.41x, 2.4x faster, 0/7 reps slower**,
which is exactly what one expects when the platform stops doing a
remove-then-insert. It hands some of that back in style/layout: **+4.6 %**,
directionally consistent at 5/7 and 8/9 but small enough to sit near the arms'
own 5–11 % spread. Net effect on a 159 ms row: order **7 ms**. That is not a 10x
gap and it is not the finding.

**The control is the whole answer.** `vanilla-naive` contains **no arbor code**.
It is the same vanilla implementation, reaching the same final DOM, differing
only in that it places rows with arbor's left-to-right walk (997 element moves)
instead of 2 targeted ones. It measures **1.009x of aihu@546** — indistinguishable
— and **8.138x of vanilla**, reproducing essentially the entire gap.

So the causal chain is closed without touching `packages/arbor`:

> move count 2 → 997 costs 8.1x, in framework-free code.
> aihu performs 1994 moves and costs 8.2x.
> aihu and the 997-move control are within 1 %.

**Framework overhead in `05_swap1k` is ~1 %. The other 700 % is the move count.**

### 4.2 On absolute numbers

Reported jsfb: aihu **159 ms**, vanilla **15 ms** — a **10.6x** ratio. Measured
here: **8.2x** on `layout`. The ratio reproduces; the absolute milliseconds do
not, and are not claimed to. This harness is headless, has no compositor doing
real raster, carries a CSS subset rather than the full `currentStyle.css`, and
ran on a machine at load 22–49. Those differences move the absolute numbers and
compress the ratio slightly. **The ratio is the transferable result** — and 8.2x
measured under a load average of 40 is a lower bound on a clean machine, not an
upper one.

For orientation only, not as a published figure: the `layout` deltas above imply
~20 ms of the swap is move-count cost and ~3 ms is irreducible. Scaled onto the
reported row, a minimal-move reconciler would put `05_swap1k` in the same class
as vanilla rather than 10x above it.

---

## 5. Verdict

**(b) PRE-EXISTING ARCHITECTURAL COST IN KEYED RECONCILIATION.**

Ruled out, each with a measurement rather than an argument:

* **(a) #546 regression** — the jsfb `swapRows` preserves all 1000 row
  references (`arr.slice()`), so the new identity check re-grows **0** rows;
  `lgrow` is 0 on both arms. The move count is **1994 on both arms**. The timing
  A/B puts #546 at **0.41x on JS** and **1.046x layout-inclusive** — cheaper where
  it matters most, ~5 % dearer in layout. *(One caveat that is genuinely #546's:
  derived lists **do** now re-grow every row — §1.1. Separate ticket, not this
  row.)*
* **(c) harness/implementation artifact** — the jsfb entry is a faithful,
  idiomatic keyed implementation; correctness was verified (exactly 2 rows move,
  positions 1 and 998 swap). The `<!--e-->` anchor comment doubles the move count
  (1994 rather than 997), which is arbor's design, not the entry's. The
  framework-free control reproduces the gap **without any aihu code at all**,
  which no harness artifact could do.
* **(d) noise** — per-process `min` spreads are **5–11 %** on `layout` for the
  arms in question, against an **8.2x** effect held in **7/7** and **9/9** reps.
  Two independent runs at different load agree to within 5 %. This is roughly two
  orders of magnitude outside the noise.

### Mechanism, in one sentence

`_reconcileEach`'s reposition pass is a single left-to-right walk that moves every
scope not currently at the cursor, so relocating one row forces every row behind
it to be moved individually — O(n) DOM moves for an O(1) reorder — and each row
costs two moves because its scope carries an anchor comment alongside its content.

### Fix shape (not implemented here — separate PR)

1. **Longest-increasing-subsequence placement.** Compute the LIS of the surviving
   scopes' current DOM order and move only the rows outside it, walking
   right-to-left. This is what Vue 3, Solid, and Inferno do. It takes `05_swap1k`
   from 1994 moves to 2, and is the single change that closes this gap. It is
   bytes, not architecture — the size-limit row for `@aihu/arbor` is the real
   design constraint and should be checked as part of the change.
2. **Second-order: drop the per-row anchor comment** where a scope's content is a
   single node. Halves the move count on every reorder and removes 1000 comment
   nodes from `01_run1k`. Independent of (1) and strictly smaller in value.
3. **Do not "fix" `_moveNode`.** It is measurably a win (0.41x on JS) and its
   feature detection resolves correctly in the target browser (1994/1994 native).

### Consequence for FEL-407

`05_swap1k` is **explained**. The row is not measuring a regression, a broken
binding, or noise — it is measuring a real, reproducible, pre-existing property of
`each()` that has been present since `9195d20d`. Nothing about it contaminates the
`update-1-of-10k-leaves` correction, and it does not block publishing an honest
end-to-end figure, provided that figure is not sourced from or extrapolated to
keyed reordering. If the corrected claim is to say anything about keyed lists, it
must say this: **aihu's keyed `each()` is currently ~8x vanilla on reorder-heavy
workloads, and that is a known algorithmic gap with a known fix, not a
measurement artifact.**

---

## 6. Reproduction

```bash
SP=<scratchpad>
git worktree add --detach $SP/wt-pre 9d8a49db
git worktree add --detach $SP/wt-546 edc15f2a
# per worktree: node_modules/@aihu/{arbor,signals} shims that re-export
#   <that worktree>/packages/<p>/src/index.ts  — a symlink to the main
#   checkout's node_modules resolves @aihu/signals to the WRONG tree and
#   silently invalidates the comparison.

# instrumented counts (jsdom): replicate main.ts verbatim, count lgrow +
#   Node.prototype.{insertBefore,appendChild,removeChild} + document.create*
bun instrument-swap.ts      # -> lgrow 0, insertBefore 1994

# browser: bun build --format=iife --minify each arm's main.ts, inline into a
#   page carrying the Bootstrap-3 subset (table-striped / table-hover matter),
#   drive over CDP with a fresh Chrome per (rep, arm), rotate arm order per rep.
#   __countSwap()            -> moveBefore vs insertBefore split
#   __timeSwapsLayout(5,10)  -> {sync, layout, paint} per swap
# report median of per-process minima + per-rep paired ratios + sign test.
```

Driver, page generators, raw JSONL, and worktrees lived in the session scratchpad
and were removed on completion. The checkout at
`/Users/smcguirt/conductor/repos/aihu` was on `feat/docs-next-prod-cutover` and
dirty at session start; it was not touched. No file outside this document was
modified, and no benchmark baseline was regenerated.
