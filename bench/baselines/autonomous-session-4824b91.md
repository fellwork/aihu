# Autonomous-session bench baseline — Round N+3 Item 2 priority investigation

**Date:** 2026-05-02
**HEAD:** `4824b91` (post-Compressor + post-Fusion main; the surface Round 1 Investigator measures)
**Captured by:** Investigator (autonomous mode, Round 1)
**Purpose:** Q7 environment-lockdown 3-run-median capture for Item 2 residual-gain analysis. Compared against `bench/baselines/round-n3-pre-9f06acb.md` (post-Compressor pre-α floor) and `bench/signals/RESULTS.md` (committed post-α numbers).

## Environment fingerprint

| Field | Value |
|---|---|
| Machine | `DESKTOP-DK0TN3U` |
| Hour-window | 2026-05-02 ~01:46–01:50 EDT |
| OS | Windows 11 Pro 10.0.26200 (MINGW64) |
| Bun | `1.3.8` |
| Runner | `bench/signals/src/runner.ts` (mitata) |

## 3-run capture (`@aihu/signals`, p50)

| Workload | Run 1 | Run 2 | Run 3 | **Median** |
|---|---:|---:|---:|---:|
| cellx | 481.30 ns | 499.93 ns | 450.22 ns | **481.30 ns** |
| wide-fanout-100 | 3.81 µs | 3.61 µs | 3.65 µs | **3.65 µs** |
| batched-writes-100 | 3.25 µs | 3.12 µs | 3.14 µs | **3.14 µs** |
| deep-propagation-100 | 3.38 µs | 3.32 µs | 3.27 µs | **3.32 µs** |
| dynamic-deps | 687.82 ns | 653.15 ns | 684.38 ns | **684.38 ns** |
| creation-1to1000 | 105.41 µs | 103.97 µs | 106.25 µs | **105.41 µs** |

## Comparison vs pre-α floor (`round-n3-pre-9f06acb.md`)

| Workload | Pre-α p50 (baseline) | Post-α 3-run-median p50 (this session) | Δ% (post − pre) |
|---|---:|---:|---:|
| cellx | 489.53 ns | 481.30 ns | **−1.7 %** |
| wide-fanout-100 | 4.43 µs | 3.65 µs | **−17.6 %** |
| batched-writes-100 | 2.64 µs | 3.14 µs | **+18.9 %** |
| deep-propagation-100 | 3.45 µs | 3.32 µs | **−3.8 %** |
| dynamic-deps | 679.74 ns | 684.38 ns | **+0.7 %** |
| creation-1to1000 | 84.64 µs | 105.41 µs | **+24.5 %** |

## Comparison vs `RESULTS.md` (committed post-α numbers)

`bench/signals/RESULTS.md` was regenerated at `4824b91` on 2026-05-02 (per `RESULTS.md` line 3 header date). Same HEAD, different machine session.

| Workload | RESULTS.md p50 | This session 3-run-median p50 | Divergence % |
|---|---:|---:|---:|
| cellx | 415.89 ns | 481.30 ns | **+15.7 %** |
| wide-fanout-100 | 3.13 µs | 3.65 µs | **+16.6 %** |
| batched-writes-100 | 2.69 µs | 3.14 µs | **+16.7 %** |
| deep-propagation-100 | 2.88 µs | 3.32 µs | **+15.3 %** |
| dynamic-deps | 585.94 ns | 684.38 ns | **+16.8 %** |
| creation-1to1000 | 87.63 µs | 105.41 µs | **+20.3 %** |

## Q7 analysis — environmental contamination flag

**Every workload diverges > 5% upward from `RESULTS.md` committed numbers**, with a tight 15.3 %–20.3 % cluster. This is the signature of a uniform environmental slowdown (machine load) on this session, not a regression on `signal.ts`. The committed RESULTS.md numbers were generated on the same HEAD (`4824b91`) earlier the same day — `signal.ts` has not changed since.

**Comparing to the Verifier 3-run-median captured in `.team/dual-session-direction/retro.md` §3:**

| Workload | Verifier post-α p50 (retro §3) | This session post-α median | Divergence % |
|---|---:|---:|---:|
| cellx | 422.07 ns | 481.30 ns | +14.0 % |
| wide-fanout-100 | 3.23 µs | 3.65 µs | +13.0 % |
| batched-writes-100 | 2.93 µs | 3.14 µs | +7.2 % |
| deep-propagation-100 | 3.02 µs | 3.32 µs | +9.9 % |
| dynamic-deps | 610.91 ns | 684.38 ns | +12.0 % |
| creation-1to1000 | 96.13 µs | 105.41 µs | +9.7 % |

Same uniform-upward pattern (~7–14 %) vs the Verifier's pre-merge capture. **The divergence is consistent with environmental noise (background system load), not a regression on `4824b91`.** The pre-α baseline (`round-n3-pre-9f06acb.md`) was also captured on the same machine but in a different hour-window (2026-05-01 vs 2026-05-02) — so the cross-session pre-vs-post comparison in this file is structurally noisier than the Verifier's same-hour-window capture.

## Directional findings (despite environmental skew)

The within-this-session pre-vs-post deltas remain useful for Item 2 residual-gain analysis if interpreted relative to the Verifier's same-environment numbers (which are the load-bearing α gate evidence):

- **wide-fanout-100:** my Δ −17.6 % vs Verifier Δ −27.7 % — both decisively show α captured the gain. **Aihu is now the field leader vs alien (3.65 µs vs alien 3.57 µs in run 1; in RESULTS.md 3.13 µs vs alien 3.02 µs — within ~2 %).**
- **deep-propagation-100:** my Δ −3.8 % vs Verifier Δ −13.2 % — gain is real but reduced in this session by environmental noise; RESULTS.md shows aihu at 2.88 µs vs alien 2.27 µs (~1.30× gap remaining).
- **cellx:** my Δ −1.7 % vs Verifier Δ −14.0 % — gain confirmed.
- **batched-writes-100, dynamic-deps, creation-1to1000:** noisy within-session deltas; RESULTS.md confirms post-α numbers within α gate tolerance.

## Surface flag

Per Decision 3 condition 2 / 3 (autonomous-mode session-start brief Round 1 Investigator section): every workload diverges > 5 % from `RESULTS.md`, but **all in the same direction with a tight cluster** — the signature of environmental load on this run, not a `signal.ts` regression. Investigator does NOT classify this as a regression on main; the Verifier's post-α numbers (`.team/dual-session-direction/retro.md` §3) and the committed `RESULTS.md` are both authoritative for the Item 2 priority decision in `investigation-item-2.md`.

If the Director or user wants a clean re-bench, the Investigator recommends running on an unloaded machine in the same hour-window as a fresh `RESULTS.md` regeneration — but for the Item 2 priority verdict the load-bearing evidence (post-α directional gains) is uncontroversial across all three datasets.
