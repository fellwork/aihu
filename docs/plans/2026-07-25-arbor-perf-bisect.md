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

The short version: **all three are the same story, and it is a measurement
story, not a runtime one.** There is no arbor performance regression. There is a
benchmark that spent two months measuring nothing, a gate reading the noisiest
statistic available to it, and a headline product claim sourced from the
resulting number.

---

## 0. TL;DR

| # | Question | Verdict |
| --- | --- | --- |
| A | 07-22 `mount-*` regression | **No regression. No commit to name.** Across 5 workloads the whole `331b0151`→main delta is **−1.0 % … +5.4 %**, every one of them *inconsistent in sign* and ≤ a byte-identical control arm. On `mount-10k-leaves` the "effect" (+5.4 %) is smaller than the +9.5 % measured between two arms that **execute identical code**. |
| B | `attr-thrash` +474x, `update-1-of-10k` +26x | **NOT a regression.** The 2026-05-25 baseline recorded an **inert no-op** — 0 DOM writes/op. Caused by `3a875483` (a workspace-resolution *fix*) making the bench measure real work for the first time. |
| C | `nodeValue` 122x faster than `textContent` | **Does not hold.** Same-node `nodeValue` vs `textContent` measures **0.83x — a tie.** End-to-end vs the bench's own vanilla adapter: **~12x**, not 122x. The published figure came from the same dead-binding row as (B). |

**The baseline does need regenerating — it is invalid, not merely stale — but
fix the harness (§5 R6) and the docs (§2) first, or the re-baseline freezes both
mistakes in place.** No arbor code fix is a precondition; see §6.

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

### Exactly which baseline rows are invalid

Counting real DOM mutations per timed op at `a16fa989`, as committed vs. with
`baseUrl` added and nothing else changed:

| workload | as recorded (2026-05-25) | with bindings live | baseline row |
| --- | --- | --- | --- |
| `mount-10k-leaves` | 10,000 `nodeValue` | 10,000 | **valid** (static leaves) |
| `mount-deep-100x10` | 1,010 `nodeValue` | 1,010 | **valid** (static leaves) |
| `mount-wide-1000` | 1,000 `nodeValue` | 1,000 | **valid** (mount-only; the effect fires once either way) |
| `krausest-1k-cycle` | 2,000 `nodeValue` | 2,100 | **partially invalid** — the entire update phase (100 writes) was lost |
| `update-1-of-10k-leaves` | **0** | 1 | **INVALID — measured a total no-op** |
| `attr-thrash-100x100` | **0** `setAttribute` | 10,000 | **INVALID — measured a total no-op** |

So two of the six baseline rows are pure fiction, one is missing its update
phase, and three are sound. Note this also means the three `mount-*` rows are
*not* explained by the binding bug — see §3.

**Verdict (B): not a regression.** `git log a16fa989..HEAD -- bench/arbor/`
is **empty** — the workload definitions are byte-identical. What changed is that
the benchmark started doing the work it always claimed to do. The `+474x` and
`+26x` are the cost of correctness arriving, and `3a875483` is a fix, not a
regression. It should never have been compared against the old baseline at all.

### A second fidelity problem, found along the way

Because the bench loads **source**, and `NODE_ENV` is unset under
`bun bench/arbor/src/runner.ts`, `packages/signals` is measured with
**`__DEV__ === true`**:

```ts
// packages/signals/src/signal.ts:3
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
// …
if (__DEV__) read[__HOST] = host          // signal.ts:524  — per signal() creation
if (__DEV__) read[__HOST] = node          // computed.ts:214 — per computed() creation
```

In the shipped `dist`, rolldown's `define` folds these to `false` and DCEs them.
In the bench they run, adding a property store (and a hidden-class transition) to
**every signal creation**. `mount-wide-1000` and `krausest-1k-cycle` create 1,000
signals per op; `attr-thrash-100x100` creates 10,000. The bench therefore
overstates signal-creation cost relative to what users actually install. This is
pre-existing, not a regression — but it means bench numbers are not
publishable as product claims without qualification.

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

### 3.2 The structural argument, made before measuring

**Neither suspect can move `mount-deep-100x10` or `mount-10k-leaves`, because
those two workloads create zero effects.** Both build their trees from
`leaf(String(i))` — a plain string, not a Signal — and `materialize.ts` takes the
non-reactive branch:

```ts
// packages/arbor/src/materialize.ts
if (Array.isArray(value)) {
  // Signal<string> — wire reactive update via mountEffect(...)
} else {
  textNode.nodeValue = value as string | null   // <- static leaves land here
}
```

No `mountEffect`, therefore no `effect()`, therefore nothing in `effect.ts`,
`scope.ts`, or `_mountEffect` is reached. Against that:

* **A → B (`061eefb3`)** changes `arbor/src/hydrate.ts` and
  `signals/src/computed.ts`. `hydrate.ts` is only *re-exported* from `index.ts`
  — `mount.ts` and `materialize.ts` never import it — and these workloads create
  no computeds. **Arms A and B execute identical code on these two workloads;
  only the loaded module bytes differ.** That makes A → B a rigorous control.
* **B → C (`18e5f6dd`)** adds exactly one thing to this path: a
  `runWithoutScope(() => { … })` wrapper around the whole `_materialize` call —
  **one extra function call per mount op**, against an op costing 3–70 ms.

So before measuring, the prediction is: no resolvable effect on either workload.

### 3.3 Results — interleaved, fresh process per sample

Two passes. Pass 1 used the gate's own statistic (`p50`, `min_cpu_time` 1e9) and
was inconclusive for the reason §5 explains. Pass 2 raised the budget to 2 s
(12 → ~146 samples/cell) and reports **`min`**, which is the appropriate
estimator when noise is one-sided.

Reported as the **median of per-rep paired ratios** — within one rep the four
arms run seconds apart under near-identical load, so the pairing cancels most
common-mode variation. "consistent" means the delta held the same sign in ≥80 %
of reps.

**Pass 2 — `mount-deep-100x10`, `mount-10k-leaves` (15 reps/arm, `min`)**

| arm | n | median of per-process `min` | min–max |
| --- | ---: | ---: | ---: |
| `mount-deep-100x10` A `331b0151` | 15 | 3.32 ms | 3.16–3.59 ms |
| `mount-deep-100x10` B `061eefb3` | 15 | 3.22 ms | 2.64–3.40 ms |
| `mount-deep-100x10` C `18e5f6dd` | 15 | 3.32 ms | 2.75–3.41 ms |
| `mount-deep-100x10` D main | 15 | 3.33 ms | 3.10–3.74 ms |
| `mount-10k-leaves` A `331b0151` | 15 | 62.44 ms | 40.02–92.75 ms |
| `mount-10k-leaves` B `061eefb3` | 15 | 65.37 ms | 32.79–98.27 ms |
| `mount-10k-leaves` C `18e5f6dd` | 14 | 67.50 ms | 49.32–79.55 ms |
| `mount-10k-leaves` D main | 14 | 68.78 ms | 50.93–102.63 ms |

**Pass 3 — the workloads that DO create effects (9 reps/arm, `min`)**

| workload | A | B | C | D |
| --- | ---: | ---: | ---: | ---: |
| `mount-wide-1000` (1k signals + 1k effects/op) | 9.59 ms | 9.78 ms | 9.46 ms | 9.82 ms |
| `krausest-1k-cycle` (1k effects + 100 updates/op) | 25.78 ms | 26.50 ms | 26.68 ms | 26.22 ms |
| `update-1-of-10k-leaves` | 464 ns | 458 ns | 460 ns | 460 ns |

**Paired deltas — every arm transition, all five workloads**

| workload | A→B (#514) | B→C (#524) | **A→C (the whole window)** | C→D (byte-identical control) |
| --- | ---: | ---: | ---: | ---: |
| `mount-deep-100x10` | −3.8 % | +1.6 % | **−1.0 %** | +0.9 % |
| `mount-10k-leaves` | **+9.5 %** | −0.1 % | **+5.4 %** | +3.1 % |
| `mount-wide-1000` | −2.2 % | +4.3 % | **+2.6 %** | −4.7 % |
| `krausest-1k-cycle` | +2.1 % | −0.1 % | **+0.2 %** | −0.5 % |
| `update-1-of-10k-leaves` | −0.8 % | +1.1 % | **+0.2 %** | +0.5 % |

**Every single cell in that table is "inconsistent"** — no comparison, including
the controls, held its sign in ≥80 % of reps.

### 3.4 Verdict

**(A): there is no regression at `061eefb3` or `18e5f6dd`, and none anywhere in
the 07-22 window.** Across all five workloads the entire A→C delta spans
**−1.0 % to +5.4 %**, and in every case it is comparable to or *smaller than* a
control arm:

* On `mount-10k-leaves` the apparent +5.4 % is **smaller than the +9.5 %
  measured between arms A and B — which execute identical code** (§3.2). It is
  also only marginally above the +3.1 % from the byte-identical C→D control.
* On `mount-deep-100x10` the delta is **negative** (−1.0 %); arm C is if
  anything a hair faster than the last known-good commit.
* On `krausest-1k-cycle` — the workload CI reports at **+30…57 %** — the
  measured delta is **+0.2 %**, a 4/4 coin flip.

The prediction from §3.2 held: the two `mount-*` workloads create zero effects,
so the effect-scope commit had nothing to slow down, and the measurement agrees.

**The CI numbers in the brief's table are not measuring a code change.** They
are `p50`-of-~12-samples against an invalid baseline, on a runner whose noise
floor for those workloads is several hundred percent (§4). The apparent
"sharp regression inside one day" is the gate resampling its own noise.

*Named commit: none. There is no regression commit to name.*

---

## 4. Per-workload noise floors

Measured on this machine, same session, arms that differ by nothing meaningful.
"spread" = (max − min) / min across per-process results within one arm.

| workload | `min` spread (worst arm) | `p50` spread, 2 s budget | `p50` spread, **gate's 1 s budget** | control C→D (`min`) |
| --- | ---: | ---: | ---: | ---: |
| `update-1-of-10k-leaves` | **8.6 %** | 19 % | n/a | +0.5 % |
| `mount-deep-100x10` | 28.9 % | 275 % | **1,176 %** | +0.2 % |
| `krausest-1k-cycle` | 31.3 % | 25 % | **970 %** | −1.7 % |
| `mount-wide-1000` | 64.2 % | 44 % | **1,155 %** | +3.7 % |
| `mount-10k-leaves` | 199.7 % | 127 % | **534 %** | +1.1 % |

Three things this table says:

1. **The gate's configuration is the worst of every available option.** The
   right-hand column — `p50` at `min_cpu_time: 1e9`, exactly what
   `runner.ts` + `gate.ts` do today — is 534–1,176 % on four of five workloads.
   The 10 % threshold is not "a bit tight"; it is two orders of magnitude
   inside the noise.
2. **Changing the statistic buys more than any threshold change.** `min` at a
   2 s budget takes `mount-deep-100x10` from 1,176 % to 28.9 % and
   `update-1-of-10k-leaves` to 8.6 %.
3. **Only one workload is genuinely tight.** `update-1-of-10k-leaves` at 8.6 %
   spread (449–487 ns) is the sole candidate for a 10 %-class gate — and
   ironically it is the workload whose baseline row is pure fiction (§1).

Caveat, stated plainly: this machine was heavily loaded during measurement
(load average 30–98, other build jobs running). That inflates the absolute
spreads. It does **not** invalidate the comparisons — arms were interleaved
within each rep and the controls absorb common-mode drift — and CI runners are
themselves noisy shared hardware, so these figures are not unrepresentative of
the environment the gate actually runs in.

---

## 5. Recommended gate policy

The gate has five independent defects. Threshold is the *least* important one.

**D1 — the baseline is invalid, not merely stale.** Two of six rows recorded
no-ops (§1). No threshold makes a comparison against fiction meaningful.

**D2 — a checked-in baseline cannot track the runner.** Hardware, Bun, and JSDOM
all move; `RESULTS.md` does not. Every such drift shows up as a "regression" on
whichever PR happens to be open.

**D3 — the estimator is unstable.** `min_cpu_time: 1e9` against a 50–100 ms/op
workload yields **~10–12 samples**, and the gate reads `p50` of those. On the
data here, per-process `p50` spreads **534–1,176 %** while per-process `min`
spreads **~2–8 %** on the same runs. The gate is reading the noisiest available
statistic.

**D4 — one process per cell.** Per-process variance (JIT, GC, scheduler) is
never averaged out; the run is a single sample of a very wide distribution.

**D5 — the threshold.** 10 % is below the noise floor by a wide margin, so the
gate fires constantly and `[bench-bump]` becomes routine — which is exactly how
a real regression would slip through unnoticed.

### Recommendations, in priority order

**R1 (highest value) — replace the checked-in baseline with a same-job A/B
against the merge base.** Build PR head *and* merge base in the same CI job and
measure them interleaved, fresh process per sample. This kills D1 and D2
outright: there is no stale artifact and no cross-hardware comparison. This is
the single change that would make the gate trustworthy, and it is what this
investigation had to do by hand to get any signal at all.

**R2 — gate on `min`, not `p50`, and collect enough samples.** Raise
`min_cpu_time` so each cell yields ≥100 samples (2 s was sufficient here:
12 → 146 samples on `mount-deep-100x10`). Under one-sided noise — the scheduler
and GC can only *add* time — the minimum is the best estimator of true cost.

**R3 — ≥5 fresh processes per (workload, arm); gate on the median of
per-process minima; interleave arms within each rep.**

**R4 — require directional consistency, not just magnitude.** A failure should
need the delta to hold the same sign in ≥80 % of reps (a sign test), not merely
exceed a percentage once. Both control arms in §3 would pass a naive threshold
test on some workloads and fail this one.

**R5 — tier the workloads.** With R1–R4 in place:

| workload | ms/op | measured behaviour | recommendation |
| --- | ---: | --- | --- |
| `update-1-of-10k-leaves` | ~0.0005 | thousands of samples, tight | **GATE** |
| `mount-deep-100x10` | ~3–9 | tight on `min`, wild on `p50` | **GATE on `min` only** |
| `mount-10k-leaves` | ~65–100 | ~12 samples at 1 s budget | **report-only** until R2 lands |
| `mount-wide-1000` | ~20–35 | 1,038 % `p50` spread | **report-only** |
| `krausest-1k-cycle` | ~50–90 | 969 % `p50` spread | **report-only** |
| `attr-thrash-100x100` | ~20–260 | 16x range across reps; ~10 samples | **report-only — never gate** |

`attr-thrash-100x100` in particular is unfit for gating in any configuration:
one op is 10,000 signal writes plus 10,000 JSDOM `setAttribute` calls, so a
1 s budget buys ~10 samples and GC dominates every one of them.

**R6 — set `NODE_ENV=production` in the bench scripts, or measure `dist`.**
Decide explicitly which artifact the bench is about (§1, §2) and write it down
in `HARNESS.md`. Today it silently measures unminified source with signals in
dev mode — which is neither what ships nor what `.size-limit.json` governs.

**R7 — demote `[bench-bump]` from habit to exception.** It is currently
load-bearing *because* the gate is broken; R1–R5 are what make it rare. Once
they land, require a one-line justification in the commit body and have the gate
print the measured delta alongside the override so the bypass is auditable.

---

## 6. Re-baselining: not yet, and not blindly

**Should the baseline be regenerated? Yes — it is provably invalid (§1), and
leaving it in place means the gate keeps comparing against fiction.**

**Must anything be fixed first? Yes — but not in `packages/arbor`.** The
ordering that matters:

1. **Fix the harness first (R6), then re-baseline.** Re-baselining today would
   permanently bless (a) a bench that measures source rather than the shipped
   artifact and (b) signals running in dev mode. Those two choices would get
   frozen into the numbers every future PR is judged against.
2. **Correct the published 122x claim before or with the re-baseline (§2).**
   `RESULTS.md` is the cited source for a headline product claim in `README.md`
   and `CLAUDE.md`. Regenerating the file without fixing the docs would leave
   six public statements sourced to a number the new file no longer contains.
3. **No arbor code fix is required as a precondition.** This is the one piece of
   good news: §3 finds no arbor regression that re-baselining would bless. The
   `mount-*` deltas CI reports are noise, and the two extreme deltas are the
   binding fix. There is nothing here to hold the re-baseline hostage to.
4. **Prefer R1 to re-baselining at all.** If the gate moves to a same-job A/B
   against the merge base, `bench/*/RESULTS.md` stops being a gate input and
   becomes a published-numbers artifact only. That is a better end state than a
   freshly-blessed baseline that will be stale again in a month — which is
   precisely how the repo arrived here.

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
