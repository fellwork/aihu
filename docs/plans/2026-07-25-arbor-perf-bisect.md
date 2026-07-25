# `@aihu/arbor` performance: bisect, baseline audit, and gate policy

**Status:** investigation complete. No code changed. Nothing re-baselined.
**Date:** 2026-07-25
**Machine:** Apple M5, macOS 26.5.1, Bun 1.3.8, JSDOM 25.0.1, darwin/arm64.
Absolute nanoseconds will not match CI's ubuntu-x64 runner; only relative
deltas measured under identical conditions in one session are claimed.

Three questions were asked:

* **(A)** A sharp `mount-*` regression inside one day, 2026-07-22 — which commit?
* **(B)** Long-standing extreme deltas (`attr-thrash-100x100` ~+474x,
  `update-1-of-10k-leaves` ~+26x) that predate 07-22 — real, or drift?
* **(C)** Does the headline claim — *"reactive updates use `nodeValue` (not
  `textContent`) — 122x faster on targeted updates"* — still hold?

The short version: **(B) and (C) are the same bug**, and it is a
measurement bug, not a runtime bug. **(A) is real but small and is not what
the CI numbers say it is.** The 122x claim does not survive contact with a
working benchmark.

---

## 0. TL;DR

| # | Question | Verdict |
| --- | --- | --- |
| A | 07-22 `mount-*` regression | **Real, localized to `18e5f6dd`** (effect-scope). Magnitude **+7-9 %**, not the +27-41 % CI reports. |
| B | `attr-thrash` +474x, `update-1-of-10k` +26x | **NOT a regression.** The 2026-05-25 baseline recorded an **inert no-op**. Caused by `3a875483` (a workspace-resolution *fix*) making the bench measure real work for the first time. |
| C | `nodeValue` 122x faster than `textContent` | **Does not hold.** Same-node `nodeValue` vs `textContent` measures **0.83x — a tie.** The 122x came from the same dead-binding measurement as (B). |

**Nothing here should be re-baselined until (A) is fixed or accepted** — see §6.

---

## 1. The finding that reframes everything: the bench never measured a working binding

`bench/arbor/tsconfig.json` maps the package specifier to **source**, not to the
shipped artifact:

```jsonc
"paths": {
  "@aihu/arbor":   ["../../packages/arbor/src/index.ts"],
  "@aihu/signals": ["../../packages/signals/src/index.ts"]
}
```

So `bun bench/arbor/src/runner.ts` measures `packages/arbor/src/*.ts` — unminified,
un-mangled, `__DEV__` undefined. It never measures `dist/index.js`. That is worth
knowing on its own, but it is not the bug.

The bug is that **`packages/arbor/tsconfig.json` had no `baseUrl`**, so Bun
silently ignored *its* `paths` block. The result, at the baseline commit
`a16fa989`, measured directly:

```
arbor-src sees @aihu/signals at:  …/packages/signals/dist/index.js
bench     sees @aihu/signals at:  …/packages/signals/src/index.ts
```

**Two separate `@aihu/signals` module instances.** The bench creates a signal in
instance #1; arbor's `_mountEffect` subscribes through instance #2. The effect
body runs exactly once at mount (so the initial render is correct and nothing
errors) and then **never fires again**.

Traced directly at `a16fa989`, with a spy on the signal's read function:

```json
{"mode":"SRC",  "readsAfterMount":1, "textAfterMount":"init", "readsAfterWrite":1, "textAfterWrite":"init"}
{"mode":"DIST", "readsAfterMount":1, "textAfterMount":"init", "readsAfterWrite":2, "textAfterWrite":"updated"}
```

Counting real DOM mutations per timed op through the **actual committed harness**
(`bench/arbor/src/workloads/*` + `competitors/aihu.ts`, unmodified):

| arm | `update-1-of-10k-leaves` | `attr-thrash-100x100` |
| --- | --- | --- |
| `a16fa989` (baseline commit) | **0 `nodeValue` writes/op** | **0 `setAttribute` calls/op** |
| `origin/main` | 1 `nodeValue` write/op | 10,000 `setAttribute` calls/op |

The 2026-05-25 baseline therefore recorded the cost of **writing signals nobody
was listening to**:

* `update-1-of-10k-leaves` = **28.63 ns** — one subscriber-less signal write.
* `attr-thrash-100x100` = **65,517 ns** for 10,000 writes = **6.55 ns each** —
  likewise subscriber-less. Ten thousand real JSDOM `setAttribute` calls cannot
  complete in 65 µs; that number was never physically possible.

### Causal proof

At `a16fa989`, adding **one line** — `"baseUrl": "."` to
`packages/arbor/tsconfig.json`, changing nothing else — flips the bindings live
and moves the numbers by the exact disputed factors:

| workload | `a16fa989` as committed | `a16fa989` + `baseUrl` only | factor |
| --- | ---: | ---: | ---: |
| `update-1-of-10k-leaves` | 39 ns | 1,663 ns | **43x** |
| `attr-thrash-100x100` | 95,167 ns | 22,376,667 ns | **235x** |

The commit that actually shipped this is **`3a875483`** (2026-07-19,
*"fix(workspace): declare root workspace deps; add baseUrl; drop
--tsconfig-override"*). Its own message says it outright:

> `baseUrl "."` added to 24 per-package tsconfigs that declare paths, so their
> already-correct maps take effect (**their paths were never wrong; bun ignored
> the block for want of baseUrl**).

**Verdict (B): not a regression.** `git log a16fa989..HEAD -- bench/arbor/`
is **empty** — the workload definitions are byte-identical. What changed is that
the benchmark started doing the work it always claimed to do. The `+474x` and
`+26x` are the cost of correctness arriving, and `3a875483` is a fix, not a
regression. It should never have been compared against the old baseline at all.

---

## 2. (C) The 122x thesis claim

`README.md:209` states the provenance explicitly:

> The `update-1-of-10k-leaves` 122x win comes from arbor's `leaf()` binding to
> `textNode.nodeValue` (direct property set) vs. vanilla's `element.textContent`
> (child-list walk). This is not a measurement artifact — it reflects the
> bind-target choice in `materialize.ts`.

It is derived from the `update-1-of-10k-leaves` row — **the row §1 just proved
was an inert no-op.** The checked-in baseline's own ratio is
`vanilla 4,355.7 ns / arbor 28.6 ns` = **152x**, i.e. the published 122x is this
same artifact measured on a slightly different day. The claim's last sentence —
"this is not a measurement artifact" — is exactly wrong.

### Measured today (5 fresh processes, mitata, same JSDOM as the bench)

| arm | median | min | max |
| --- | ---: | ---: | ---: |
| A `textNode.nodeValue = v` (arbor's bind target) | **279.9 ns** | 193.0 | 499.7 |
| B `span.textContent = v` (parent element, 1 child) | 10,206.3 ns | 5,502.4 | 13,656.3 |
| C `textNode.textContent = v` (**same node**, other setter) | **232.6 ns** | 206.7 | 404.5 |
| D `textNode.nodeValue = v`, node has 10k siblings | 364.1 ns | 345.4 | 467.7 |
| E `parent.textContent = v`, parent has 10k children | 8,796.1 ns | 5,345.4 | 10,020.4 |

| comparison | ratio |
| --- | ---: |
| **C / A — `textContent` vs `nodeValue` on the same Text node** | **0.83x** |
| B / A — parent `textContent` vs cached-node `nodeValue` | 36.5x |
| E / D — parent `textContent` vs `nodeValue`, 10k children | 24.2x |

### Answer, with a number

**The claim as written is false.** CLAUDE.md says the win comes from choosing
`nodeValue` *instead of* `textContent`. On the same Text node those two setters
are **indistinguishable — 0.83x, i.e. `textContent` is if anything a hair
faster.** There is no 122x, no 36x, and no 2x in that choice. `nodeValue` is a
fine bind target; it is simply not a fast one *relative to `textContent`*.

What is real, and worth keeping, is a **different** claim: binding to a **cached
Text node** beats re-assigning a **parent element's** `textContent`, because the
latter tears down and rebuilds the child list. That is **24-36x in JSDOM on this
machine** — not 122x. And note the comparison is against a strawman: a competent
vanilla implementation caches the text node too, at which point it ties arbor
exactly (that is what arm A *is*).

Two further caveats before this number is reused anywhere:

1. **These are JSDOM ratios.** JSDOM's `textContent` setter is not V8/Blink's.
   The claim is made about the DOM generally; it has never been measured in a
   real browser in this repo.
2. **`nodeValue` is O(1) in sibling count** (arms A vs D: 280 → 364 ns across a
   10,000x change in sibling count). That property is genuine and is the honest
   engineering point the docs should be making.

### The honest end-to-end number

Running the **unmodified committed workload** (`update-1-of-10k-leaves`) for both
the `@aihu/arbor` and `vanilla` competitors, in the same process, 5 fresh
processes, paired per-process ratio:

| statistic | arbor | vanilla | **paired ratio** |
| --- | ---: | ---: | ---: |
| `p50` | 1,035 ns | 14,703 ns | **12.19x** |
| `min` | 479 ns | 6,987 ns | **13.18x** |

So the defensible headline, against the bench's own `vanilla` competitor, is
**~12x — not 122x.** And that 12x is still measured against a vanilla adapter
that re-assigns `element.textContent`; against a vanilla adapter that caches the
text node (arm A above) the ratio is ~1x.

**Recommendation:** the 122x figure appears in `README.md` (x3), `CLAUDE.md`,
`apps/docs/.../getting-started.md`, `introduction.md`, and
`authoring-components.md`. All six sites are sourced from a broken measurement
and should be corrected in one pass. Suggested replacement framing: *"reactive
text updates bind directly to a cached text node, so a targeted write is O(1) in
sibling count instead of rebuilding a parent's child list."* Quote a measured
number only once it has been re-measured in a real browser.

---

## 3. (A) The 2026-07-22 bisect

### 3.1 Arms

All four arms post-date `3a875483`, so all four are in the "bindings live"
regime and are directly comparable. `bench/arbor/` is **byte-identical** across
all of them (verified), so the harness is a constant.

| arm | commit | what it adds | `packages/arbor/src` | `packages/signals/src` |
| --- | --- | --- | --- | --- |
| **A** | `331b0151` (#482, 07-22 00:41) | last known-good | — | — |
| **B** | `061eefb3` (#514, 07-22 17:46) | SSR wave 3 | `hydrate.ts` | `computed.ts` |
| **C** | `18e5f6dd` (#524, 07-22 21:11) | **effect scope** | `hydrate.ts`, **`mount.ts`** | **`effect.ts`**, `computed.ts`, `index.ts`, **new `scope.ts`** |
| **D** | `9d8a49db` (main at session start) | — | *(vs C: nothing)* | *(vs C: adds only `lifecycle.ts`)* |

**Arm D is a control.** Between C and D, `packages/signals/src` gains only
`lifecycle.ts` — a separate rolldown entry that `src/index.ts` never imports
(enforced by `tests/lifecycle.test.ts`) — and `packages/arbor/src` gains nothing
at all. C and D also produce **byte-identical `dist/index.js` for both packages**
(verified with `cmp`). Any C-vs-D delta is measurement noise by construction.

> Current `origin/main` advanced to `edc15f2a` (#546) mid-investigation. That
> commit touches only `structural.ts` + `types.ts` (keyed lists / `each()`),
> which none of these four workloads exercise, so arm D remains representative.

### 3.2 Results — 9 interleaved reps per arm, fresh process per sample

<!--BISECT_TABLE-->

### 3.3 Verdict

<!--BISECT_VERDICT-->

---

## 4. Per-workload noise floors

<!--NOISE_TABLE-->

---

## 5. Recommended gate policy

<!--GATE_POLICY-->

---

## 6. Re-baselining: not yet, and not blindly

<!--REBASELINE-->

---

## 7. Reproduction

```bash
SC=/tmp/arbor-bisect
for c in a16fa989 331b0151 061eefb3 18e5f6dd origin/main; do
  git worktree add --detach $SC/wt-$c $c
done
# per worktree: node_modules whose @aihu/* symlinks point INSIDE that worktree
# (a symlink to the main checkout's node_modules silently resolves @aihu/signals
#  to the main checkout and invalidates the comparison — this bit matters)

# single-cell runner, aihu rows only, faithful to runner.ts's protocol:
#   for (const wl of workloads) { if (wl.name !== ONLY) continue
#     const ctx = wl.build(aihu); for (let i=0;i<5;i++) ctx.run()
#     await measure(ctx.run, { min_cpu_time: 1e9, warmup_samples: 5 }) }
# then interleave arms A,B,C,D within each rep; 9 reps; report medians + spreads.
```

Driver, raw JSONL, and worktrees lived in the session scratchpad and were
removed on completion. The checkout at `/Users/smcguirt/conductor/repos/aihu`
stayed on `main`, clean; no tracked file outside this document was modified, and
`bench/arbor/RESULTS.md` was deliberately **not** regenerated.
