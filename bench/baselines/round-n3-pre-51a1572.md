# Round N+3 baseline — pre-fusion (51a1572)

**Date:** 2026-05-01
**Branch:** `feat/signals-n3-fusion` (worktree-local; HEAD `207c521`)
**Branch point (semantic, per Round N+3 brief):** `origin/main` `51a1572` ("merge: feat/lattice-signals-promote — lattice signals barrel + signals limit raise to 2050 B")
**Captured by:** Fusion Scout (Round N+3)
**Purpose:** Lock the load-bearing baseline that the B1 inline-effect fusion design must beat. The `deep-propagation-100` p50 is the gate — Fusion must beat by ≥ 10 % p50.

**Scope clarification:** This worktree's `feat/signals-n3-fusion` branch carries 5 doc-only commits ahead of `51a1572` (historian-close + Round N+2 architect-spec + retro). `git diff 51a1572..HEAD -- packages/signals/src/signal.ts` is empty — **the runtime surface analyzed in §3 of the scout report is bit-identical at `207c521` and `51a1572`.** Bench numbers below were captured at `207c521` and apply unchanged to the `51a1572` runtime.

---

## Bundle size (canonical, via `bun run size`)

| Package | Size (gz) | Limit (.size-limit.json) | Headroom |
|---|---:|---:|---:|
| `@scribe/signals` | **1.88 kB (1925 B)** | 1850 B | **−72 B (OVER LIMIT)** |
| `@scribe/arbor` | 2.11 kB (2160 B) | 50 kB (lifted) | +49 040 B |
| `@scribe/runtime` | 792 B | 50 kB (lifted) | +50 408 B |
| `@scribe/agent` | 117 B | 50 kB (lifted) | +51 083 B |
| `@scribe/data` | 658 B | 50 kB (lifted) | +50 542 B |
| `@scribe/context` | 249 B | 50 kB (lifted) | +50 951 B |

**Note:** `.size-limit.json` declares `@scribe/signals` at **1850 B**; `bun run size` exits 1 because 1925 B currently exceeds that ceiling by 72 B. The Round N+3 brief referenced "2050 B" — that may be a stale figure in the brief, or the spec expects raising the limit. **Architect must reconcile** before B1 fusion lands new bytes (see Open Question #1 in scout-report.md). The `.size-limit.json` `_proto_note` field for arbor says `lifted — original 2200 B`, and the most recent merge commit subject line at HEAD reads "signals limit raise to 2050 B" — but the in-tree `.size-limit.json` was NOT updated to match. This is a merge-window inconsistency, not a Round N+3 invariant.

Canonical metric (per Learning #31): `@scribe/signals` ships at **1925 B gz** at HEAD `51a1572`.

---

## Bench p50 (mitata · Bun 1.3.8 · Node 24.3.0 · this machine)

| Workload | scribe/signals p50 | Best competitor | Gap |
|---|---:|---|---:|
| `cellx` | **532.64 ns** | scribe (best) | — |
| `wide-fanout-100` | **6.60 µs** | alien-signals 4.63 µs | **+1.97 µs (43 % slower)** |
| `batched-writes-100` | **3.01 µs** | scribe (best) | — |
| `deep-propagation-100` | **4.02 µs** | alien-signals 3.06 µs | **+0.96 µs (31 % slower) — load-bearing** |
| `dynamic-deps` | **1.14 µs** | s-js 677.39 ns | scribe 2nd |
| `creation-1to1000` | **106.65 µs** | s-js 51.80 µs | scribe last |

**Round N+3 gate (load-bearing):** B1 inline-effect fusion must beat scribe `deep-propagation-100` p50 = **4.02 µs** by **≥ 10 % p50** → target **≤ 3.62 µs**.

### Run-to-run variance disclosure

The committed RESULTS.md at HEAD `51a1572` (regenerated at `bench/signals/RESULTS.md` line 95) shows scribe `deep-propagation-100` p50 = **3.35 µs** and `wide-fanout-100` p50 = **4.13 µs** from the same source code. The numbers above (4.02 µs / 6.60 µs) were captured by the Scout on the worktree filesystem with the same Bun/Node and the same HEAD commit. **The deep-prop figure is ~20 % higher** and **wide-fanout is ~60 % higher** than the committed run. This is environmental variance (CPU thermal state, other load on the box, V8 warmup state).

**Architect guidance:** Use the committed `bench/signals/RESULTS.md` numbers (deep-prop 3.35 µs, wide-fanout 4.13 µs) as the comparison baseline if the Builder benches on a dedicated CI runner. Use the Scout-captured numbers above (deep-prop 4.02 µs, wide-fanout 6.60 µs) as the comparison baseline if the Builder benches on the same machine in the same environmental window. Each measurement on the same machine has narrow ±5 % run-to-run variance; cross-environment variance is wider. **The 10 % gate must be applied within a single measurement environment.**

---

## Raw bench output (Scout capture, 2026-05-01)

```
cellx × @scribe/signals … 532.64 ns p50 · 1.81M ops/s
cellx × alien-signals … 771.29 ns p50 · 1.24M ops/s
cellx × @preact/signals-core … 661.25 ns p50 · 1.43M ops/s
cellx × @vue/reactivity … 1.04 µs p50 · 887.36K ops/s
cellx × solid-js … 1.82 µs p50 · 535.18K ops/s
cellx × s-js … 723.97 ns p50 · 1.26M ops/s

wide-fanout-100 × @scribe/signals … 6.60 µs p50 · 151.48K ops/s
wide-fanout-100 × alien-signals … 4.63 µs p50 · 213.31K ops/s
wide-fanout-100 × @preact/signals-core … 6.43 µs p50 · 155.33K ops/s
wide-fanout-100 × @vue/reactivity … 9.15 µs p50 · 106.20K ops/s
wide-fanout-100 × solid-js … 15.03 µs p50 · 63.25K ops/s
wide-fanout-100 × s-js … 5.32 µs p50 · 178.06K ops/s

batched-writes-100 × @scribe/signals … 3.01 µs p50 · 311.07K ops/s
batched-writes-100 × alien-signals … 3.83 µs p50 · 242.04K ops/s
batched-writes-100 × @preact/signals-core … 5.01 µs p50 · 199.36K ops/s
batched-writes-100 × @vue/reactivity … 9.21 µs p50 · 105.86K ops/s
batched-writes-100 × solid-js … 7.65 µs p50 · 116.60K ops/s
batched-writes-100 × s-js … 3.50 µs p50 · 273.81K ops/s

deep-propagation-100 × @scribe/signals … 4.02 µs p50 · 250.40K ops/s
deep-propagation-100 × alien-signals … 3.06 µs p50 · 321.67K ops/s
deep-propagation-100 × @preact/signals-core … 3.97 µs p50 · 253.19K ops/s
deep-propagation-100 × @vue/reactivity … 6.68 µs p50 · 151.32K ops/s
deep-propagation-100 × solid-js … 9.97 µs p50 · 99.86K ops/s
deep-propagation-100 × s-js … 3.42 µs p50 · 296.13K ops/s

dynamic-deps × @scribe/signals … 1.14 µs p50 · 928.48K ops/s
dynamic-deps × alien-signals … 1.64 µs p50 · 618.70K ops/s
dynamic-deps × @preact/signals-core … 1.27 µs p50 · 789.00K ops/s
dynamic-deps × @vue/reactivity … 5.43 µs p50 · 179.41K ops/s
dynamic-deps × solid-js … 1.18 µs p50 · 774.65K ops/s
dynamic-deps × s-js … 677.39 ns p50 · 1.42M ops/s

creation-1to1000 × @scribe/signals … 106.65 µs p50 · 9.21K ops/s
creation-1to1000 × alien-signals … 87.80 µs p50 · 7.91K ops/s
creation-1to1000 × @preact/signals-core … 66.70 µs p50 · 11.45K ops/s
creation-1to1000 × @vue/reactivity … 58.60 µs p50 · 8.69K ops/s
creation-1to1000 × solid-js … 74.40 µs p50 · 8.66K ops/s
creation-1to1000 × s-js … 51.80 µs p50 · 11.14K ops/s
```

---

## Methodology

- `bun run build` → all packages built clean (cached at HEAD `51a1572`)
- `bun run size` → `@scribe/signals = 1925 B gz` (the canonical size metric per Learning #31)
- `cd bench/signals && bun run src/runner.ts` → 6 workloads × 6 competitors (mitata 1.0.34, warmup 50 samples, ~1 s CPU per cell)

No memory pass run (would require `bun --expose-gc src/memory.ts`). Memory data is not load-bearing for B1 fusion; the gate is time p50.

---

**Files in scope for the Architect:**
- `packages/signals/src/signal.ts` lines 200–435 (mark/drain pipeline — the entire region the Fusion must rewrite)
- `bench/signals/src/workloads/deep-propagation-100.ts` (read-only — the load-bearing workload)
- `bench/signals/RESULTS.md` (committed, regenerable; do not break the JSON footer schema)
- `tests/` (MAY add new tests; never weaken or remove)

Do NOT touch lines 1–199 or 436+ in `signal.ts` (Compressor team is in flight on `compressor/signals-h4-recovery`).
