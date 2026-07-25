# Verify: PR #549 signals bench — controlled A/B against main

**Question:** Does PR #549 (`feat/signals-lifecycle-contract`, head `1a8fb814`) introduce a
real performance regression in `@aihu/signals`, or is the CI `bench` failure noise against a
stale baseline?

**Method:** Both branches built and measured on the SAME machine in the SAME session,
interleaved. The checked-in `bench/signals/RESULTS.md` baseline (2026-05-25, `a16fa989`) is
NOT used as a control anywhere in this experiment.

**Machine:** Apple M5, macOS 26.5.1, Bun 1.3.8, darwin/arm64. Absolute ns will not match
CI's ubuntu-x64; only the relative delta under identical conditions is claimed.

---

## 1. Structural finding (established before any measurement)

The reactivity core in #549 is **unchanged**. `git diff origin/main…1a8fb814 -- packages/signals/src`
returns exactly one entry: a NEW file `src/lifecycle.ts`. `signal.ts`, `computed.ts`,
`effect.ts`, `batch.ts`, `scope.ts`, `untrack.ts`, `errors.ts`, `index.ts` are byte-identical.
There is **no per-signal ownership bookkeeping on any hot path** — `lifecycle.ts` is a
`WeakMap<EffectScope, LifecycleHost>` in a separate entry that `src/index.ts` never imports
(enforced by `tests/lifecycle.test.ts`).

What DOES change is the **build shape**. `rolldown.config.ts` goes single-entry →
multi-entry (`index` + `lifecycle`), so rolldown splits `scope.ts` into a shared chunk:

| build | files | raw bytes |
| --- | --- | ---: |
| main | `dist/index.js` | 5,913 |
| #549 | `dist/index.js` + `dist/scope-D-id5w3e.js` + `dist/lifecycle.js` | 5,132 + 976 + 244 |

`dist/index.js` on #549 now opens with
`import{a as e,c as t,i as n,l as r,n as i,o as a,r as o,s,t as c}from"./scope-D-id5w3e.js"` —
i.e. `getCurrentScope`, `setCurrentScope`, `runWithScope`, `runWithoutScope`, the scope
cleanup register/unregister pair, AND the live `_currentScope` binding itself are now
**cross-module** references. Effect execution clears the current scope (signals P0-1) and
computed/effect creation registers a scope cleanup, so this boundary sits directly on the
propagation and creation hot paths, and the minifier can no longer inline across it.

### The control this buys us

Rebuilding **#549's source** with **main's single-entry rolldown config** produces a
`dist/index.js` that is **`cmp`-byte-identical to main's**. That gives a third arm whose
bytes are provably the same as arm A — a pure noise-floor probe run inside the same
interleave. Any A-vs-C delta is by construction measurement noise.

---

## 2. Arms

| arm | what it is |
| --- | --- |
| **A_main** | `origin/main` (`e207ba97`) → `packages/signals/dist/index.js` |
| **B_549split** | `1a8fb814` → `packages/signals/dist/index.js` (+ shared `scope-*.js` chunk) |
| **C_549single** | `1a8fb814` source built with main's single-entry config — **byte-identical to A** |

**Harness equivalence check (the caveat, answered):** one single driver
(`bench/signals/src/ab.ts` in the main worktree) loads the library under test from an
absolute `SIGNALS_DIST` path. The bench source tree is byte-identical between the two
branches (`git diff … -- bench/` is empty), and the driver reproduces `runner.ts`'s exact
protocol (50 manual warm-up calls, `mitata.measure` with `min_cpu_time: 1e9`,
`warmup_samples: 50`). Both arms execute the same harness bytes and the same public API
(`signal`/`computed`/`effect`/`batch`); the ESM chunk is resolved at module-load time,
before any measurement, so no per-op module resolution is added. **The A/B is valid as
constructed** — the split is a real property of the artifact consumers import, not a
harness mismatch. (One genuine reporting artifact does exist, see §6.)

Each rep is a fresh `bun` process. Order within a rep is A, B, C — note that arm C runs
**last** and shows ~0 % delta, which rules out monotonic thermal drift as the explanation
for anything B shows.

---

## 3. Run 1 — all 6 workloads, 7 interleaved reps each (21 processes)

### Raw p50 per rep (ns)

| workload | arm | r1 | r2 | r3 | r4 | r5 | r6 | r7 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cellx | A_main | 907 | 791 | 770 | 853 | 765 | 803 | 812 |
| cellx | B_549split | 909 | 767 | 918 | 762 | 798 | 764 | 916 |
| cellx | C_549single | 763 | 773 | 774 | 769 | 766 | 762 | 765 |
| wide-fanout-100 | A_main | 8,951 | 10,045 | 9,351 | 11,444 | 12,592 | 12,137 | 10,143 |
| wide-fanout-100 | B_549split | 8,630 | 9,806 | 8,982 | 12,221 | 11,621 | 11,213 | 9,612 |
| wide-fanout-100 | C_549single | 9,407 | 10,024 | 11,637 | 11,379 | 10,339 | 11,959 | 9,633 |
| batched-writes-100 | A_main | 9,228 | 8,541 | 8,775 | 10,320 | 9,833 | 10,485 | 8,162 |
| batched-writes-100 | B_549split | 9,150 | 9,395 | 7,920 | 10,309 | 11,250 | 10,115 | 8,735 |
| batched-writes-100 | C_549single | 8,004 | 7,759 | 9,358 | 10,371 | 10,224 | 9,801 | 8,346 |
| deep-propagation-100 | A_main | 7,658 | 5,770 | 6,284 | 7,279 | 6,755 | 6,375 | 6,035 |
| deep-propagation-100 | B_549split | 6,141 | 5,658 | 6,360 | 6,788 | 7,327 | 7,644 | 5,990 |
| deep-propagation-100 | C_549single | 5,861 | 6,091 | 6,767 | 6,493 | 7,267 | 6,871 | 6,142 |
| dynamic-deps | A_main | 752 | 767 | 753 | 772 | 762 | 758 | 755 |
| dynamic-deps | B_549split | 774 | 776 | 788 | 782 | 786 | 799 | 777 |
| dynamic-deps | C_549single | 753 | 769 | 777 | 768 | 760 | 761 | 758 |
| creation-1to1000 | A_main | 84,792 | 86,333 | 86,500 | 86,250 | 84,875 | 84,417 | 88,041 |
| creation-1to1000 | B_549split | 88,583 | 86,166 | 90,916 | 85,250 | 84,458 | 88,708 | 88,833 |
| creation-1to1000 | C_549single | 87,583 | 88,667 | 88,166 | 85,417 | 86,042 | 85,792 | 85,708 |

### Medians, spreads, deltas

| workload | A med | A min–max | A spread | B med | B min–max | B spread | C med | **B vs A** | C vs A (noise floor) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cellx | 803 | 765–907 | 17.7 % | 798 | 762–918 | 19.6 % | 766 | **−0.6 %** | −4.6 % |
| wide-fanout-100 | 10,143 | 8,951–12,592 | 35.9 % | 9,806 | 8,630–12,221 | 36.6 % | 10,339 | **−3.3 %** | +1.9 % |
| batched-writes-100 | 9,228 | 8,162–10,485 | 25.2 % | 9,395 | 7,920–11,250 | 35.4 % | 9,358 | **+1.8 %** | +1.4 % |
| deep-propagation-100 | 6,375 | 5,770–7,658 | 29.6 % | 6,360 | 5,658–7,644 | 31.2 % | 6,493 | **−0.2 %** | +1.8 % |
| dynamic-deps | 758 | 752–772 | 2.7 % | 782 | 774–799 | 3.2 % | 761 | **+3.2 %** | +0.4 % |
| creation-1to1000 | 86,250 | 84,417–88,041 | 4.2 % | 88,583 | 84,458–90,916 | 7.3 % | 86,042 | **+2.7 %** | −0.2 % |

**The noise floor is the headline.** Within a single condition, on one machine, in one
session: `wide-fanout-100` spans 36 %, `batched-writes-100` 25–35 %, `deep-propagation-100`
30 %. A 10 % gate cannot resolve anything on those three workloads. `cellx`, `dynamic-deps`
and `creation-1to1000` are the tractable ones (2.7–19.6 % spread).

---

## 4. Run 2 — focused, 12 interleaved reps each, low-noise workloads only (36 processes)

| workload | arm | n | median | IQR | min–max |
| --- | --- | ---: | ---: | ---: | ---: |
| cellx | A_main | 12 | 780 | 764–807 | 750–850 |
| cellx | B_549split | 12 | 783 | 772–813 | 767–926 |
| cellx | C_549single | 12 | 782 | 771–793 | 750–875 |
| dynamic-deps | A_main | 12 | 752 | 749–758 | **741–762** |
| dynamic-deps | B_549split | 12 | 777 | 773–793 | **772–845** |
| dynamic-deps | C_549single | 12 | 752 | 749–756 | 735–766 |
| creation-1to1000 | A_main | 12 | 86,416 | 85,791–87,709 | 84,917–87,958 |
| creation-1to1000 | B_549split | 12 | 91,146 | 89,500–94,209 | 84,333–395,108 |
| creation-1to1000 | C_549single | 12 | 86,562 | 85,375–321,226 | 84,459–387,410 |

| workload | **B vs A** | C vs A (same bytes as A) |
| --- | ---: | ---: |
| cellx | **+0.31 %** | +0.16 % |
| dynamic-deps | **+3.31 %** | +0.02 % |
| creation-1to1000 | **+5.47 %** (median) / **+3.5 %** (GC-outlier-trimmed mean) | +0.17 % / −0.4 % |

`dynamic-deps` raw p50 per rep, sorted by arm:

```
A_main       741 745 747 749 750 752 752 753 754 758 761 762   (max 762)
B_549split   772 772 773 773 775 777 777 785 788 793 802 845   (min 772)
C_549single  735 747 748 749 749 751 752 752 752 756 756 766
```

**Zero overlap** between A and B across 24 independent processes, while C — byte-identical
to A, and run last in every rep — lands exactly on top of A. This is not noise.

`creation-1to1000` has GC outliers in both B and C (three samples each in the 320–395 µs
range); the median and a trimmed mean both survive them and agree on direction.

---

## 5. Required per-workload answer: is the main-vs-#549 delta larger than the within-condition spread?

| workload | B vs A delta | within-condition spread | control arm C | **exceeds noise?** |
| --- | ---: | ---: | ---: | :---: |
| `batched-writes-100` | +1.8 % | 25–35 % | +1.4 % | **NO** |
| `creation-1to1000` | +5.5 % (median, n=12); IQRs 85.8–87.7k vs 89.5–94.2k do not overlap | 4–7 % | +0.2 % | **YES** |
| `cellx` | +0.3 % (n=12) | 18–20 % (n=7) / 6 % (n=12) | +0.2 % | **NO** |
| `wide-fanout-100` | −3.3 % (faster) | 36 % | +1.9 % | **NO** |
| `deep-propagation-100` | −0.2 % | 30 % | +1.8 % | **NO** |
| `dynamic-deps` | +3.3 %; ranges 741–762 vs 772–845 **disjoint** | 2.7–3.2 % | +0.02 % | **YES** |

None of the three workloads CI flagged as newly failing on #549 (`cellx` +10.0 %,
`batched-writes-100` +27.2 %, `wide-fanout-100` +20.7 %) reproduces here. The two workloads
that DO show a real effect are +3.3 % and +5.5 % — **both below the gate's 10 % threshold.**

---

## 6. Cause, and the one genuine artifact

**Cause of the real delta: the rolldown code-split, not the lifecycle logic.** Arm C proves
it — the identical #549 source built single-entry is indistinguishable from main. Moving
`scope.ts` into a shared chunk turns `getCurrentScope` / `setCurrentScope` /
`registerScopeCleanup` / the `_currentScope` live binding into cross-module references and
blocks cross-chunk inlining. `dynamic-deps` (subscription churn → scope touches per op) and
`creation-1to1000` (scope registration per created node) are exactly the two workloads that
touch that boundary hardest, which is a coherent mechanism, not a coincidence.

**Cheap fix if the team wants the 3–5 % back:** keep `index` single-entry and have
`dist/lifecycle.js` import `getCurrentScope` from the package entry as an *external*
(`external: ['@aihu/signals']` on the lifecycle build) rather than letting rolldown hoist
`scope.ts` into a shared chunk. This preserves the "zero bytes in `dist/index.js`" goal and
the single-module-instance requirement for `_currentScope`, without putting a chunk boundary
on the core hot path. Do NOT solve it by duplicating `scope.ts` into both bundles — that
would create two `_currentScope` instances and break ownership.

**Genuine reporting artifact (size axis, not time):** `bench/signals/src/runner.ts`
`collectSizes()` stats `packages/signals/dist/index.js` as a raw file, so the bench's
"Bundle size (gz)" table now under-reports `@aihu/signals` by the ~976 B `scope-*.js` chunk.
The `.size-limit.json` gate is unaffected — size-limit re-bundles from the entry, which is
why `scripts/__bundle-sizes.json` moved only 2,232 → 2,234 B. Worth a follow-up so the
published-size claim in `RESULTS.md` stays honest.

**The CI failure itself is stale-baseline + runner noise.** `main@9a7729d6` fails 3 of 6
workloads against the same 2026-05-25 baseline while containing none of #549's changes, and
#549 is *better* than main on two workloads CI reports as regressions. The 10–27 % CI deltas
are ~4–8× larger than the largest real effect measured here. `bench/signals/RESULTS.md`
needs regenerating on the current runner regardless of what happens to #549.

---

## 7. VERDICT

### (a) REAL REGRESSION

**Honest numbers:** `#549` is measurably slower than `main` on **2 of 6 workloads**:

- **`dynamic-deps`: +3.3 %** — 752 → 777 ns median, n=12 per arm, ranges disjoint
  (741–762 vs 772–845), byte-identical control arm at +0.02 %.
- **`creation-1to1000`: +5.5 %** median (+3.5 % trimmed mean) — 86,416 → 91,146 ns, n=12,
  IQRs disjoint, control arm at +0.2 %.

The other four workloads (`cellx`, `wide-fanout-100`, `batched-writes-100`,
`deep-propagation-100`) show **no effect** — |delta| ≤ 3.3 % against 18–36 % within-condition
spread.

Two things this verdict is NOT saying:

1. It is **not** a validation of the CI failure. The specific CI numbers
   (`batched-writes-100` +27.2 %, `wide-fanout-100` +20.7 %, `cellx` +10.0 %) do not
   reproduce and are stale-baseline artifacts. Both real deltas are **under** the gate's
   10 % threshold.
2. It is **not** caused by the lifecycle ownership contract. The reactivity core source is
   byte-identical; the entire effect comes from the multi-entry rolldown split hoisting
   `scope.ts` into a shared chunk, and it disappears completely when the same source is
   built single-entry.

**Recommended disposition:** the regression is real, small, sub-threshold, and has a cheap
targeted fix (§6). Either land the `external`-based build fix on #549, or land #549 as-is
with `[bench-bump]` and file the build-shape fix as a follow-up — but do not record
"3–5 % core slowdown" as noise, and regenerate the bench baseline either way.

---

### Reproduction

```bash
SC=/tmp/bench-ab
git worktree add --detach $SC/wt-main origin/main
git worktree add --detach $SC/wt-549  1a8fb814
# build signals in each (rolldown -c && node scripts/mangle-dist.mjs)
# arm C: rebuild wt-549 with wt-main's rolldown.config.ts -> dist-single
cmp $SC/wt-main/packages/signals/dist/index.js \
    $SC/wt-549/packages/signals/dist-single/index.js   # byte-identical
# then interleave A,B,C x N reps of the mitata protocol from runner.ts,
# swapping only the loaded dist path.
```

Driver + raw JSONL lived in the session scratchpad; worktrees removed on completion.
The user checkout at `/Users/smcguirt/conductor/repos/aihu` stayed on `main`, clean —
no tracked file was modified by this experiment.
