# Pre-flight bench baseline — Round N+3 Fusion (post-Compressor)

**Date:** 2026-05-01
**HEAD:** `9f06acb` (Architect spec commit on `feat/signals-n3-fusion`)
**Branch base:** post-Compressor `main` (`f2c5ff9`)
**Captured by:** Builder (Mode 2, Round 3)
**Supersedes:** `bench/baselines/round-n3-pre-51a1572.md` (Scout's pre-Compressor baseline; 56 B Compressor recovery missing).

## Why this file exists

Per Q7 environment-lockdown discipline (Architect spec §8 anti-pattern, Director mid-session note Decision 4 Q7), fusion bench measurement uses pre/post numbers captured on the **same machine in the same hour-window**. Scout's prior baseline at `round-n3-pre-51a1572.md` was captured before Compressor's H4-tactical landings (54d73d7, e005a47) which closed 56 B of byte recovery; the `signal.ts` mark/drain pipeline at `9f06acb` is the load-bearing post-Compressor surface that Round N+3 fusion will modify.

This file records the load-bearing baseline numbers immediately before the α (alien-style lazy) fusion rewrite begins.

## Size (canonical via `bun run size`)

| Package | Size | Limit | Headroom |
|---|---:|---:|---:|
| `@aihu/signals` | **1956 B** | 1970 B | +14 B |

(Computed from `1.91 kB` reported with `+14 B headroom` against the 1970 B limit.)

## Bench (p50, `bun run src/runner.ts` from `bench/signals/`)

Same machine, same session, captured immediately before any source modification.

| Workload | `@aihu/signals` p50 |
|---|---:|
| `cellx` | **489.53 ns** |
| `wide-fanout-100` | **4.43 µs** |
| `batched-writes-100` | **2.64 µs** |
| **`deep-propagation-100`** | **3.45 µs** |
| `dynamic-deps` | **679.74 ns** |
| `creation-1to1000` | **84.64 µs** |

## Bench gates for Round N+3 (per spec §1.2)

- **deep-propagation-100:** post p50 ≤ 0.90 × 3.45 µs = **≤ 3.105 µs** (≥ 10 % faster).
- **All others:** post p50 within ±5 % (or better):
  - cellx: 465.05 ns — 514.01 ns
  - wide-fanout-100: 4.21 µs — 4.65 µs
  - batched-writes-100: 2.51 µs — 2.77 µs
  - dynamic-deps: 645.75 ns — 713.73 ns
  - creation-1to1000: 80.41 µs — 88.87 µs

## Competitor field (informational)

For situational context — fusion targets the aihu-vs-self delta, not closing the alien gap.

| Workload | aihu | alien | preact | vue | solid | s-js |
|---|---:|---:|---:|---:|---:|---:|
| cellx | 489.53 ns | 728.34 ns | 601.34 ns | 970.07 ns | 1.56 µs | 650.83 ns |
| wide-fanout-100 | 4.43 µs | 3.21 µs | 4.64 µs | 5.72 µs | 10.83 µs | 3.96 µs |
| batched-writes-100 | 2.64 µs | 3.76 µs | 4.50 µs | 8.22 µs | 6.86 µs | 2.89 µs |
| deep-propagation-100 | 3.45 µs | 2.12 µs | 3.27 µs | 4.89 µs | 6.50 µs | 2.59 µs |
| dynamic-deps | 679.74 ns | 1.35 µs | 928.49 ns | 3.98 µs | 1.06 µs | 483.79 ns |
| creation-1to1000 | 84.64 µs | 97.40 µs | 58.76 µs | 89.93 µs | 72.50 µs | 73.63 µs |
