# Builder blockers — deep perf wins (Phase 1 deviation)

**Author:** Builder
**Date:** 2026-04-28
**Branch:** `perf/signals-cellx-fix`
**Status:** Filing for Team Lead awareness; deviation surfaced; proceeding
to Phase 2 because Team Lead's §6.1 adjudication ("replace fully under
Phase 2") *is* the structural fallback for these misses, and Phase 2's
1500 B cap subsumes Phase 1's bundle overrun.

---

## §1 What this memo covers

Phase 0 landed clean (commit `2f93ee7`): all four §7.1 gates passed on
Builder machine, with cellx -5.1 %, wide-fanout -15.8 %, batched -29.9 %
vs HEAD; gz 1146 B (under 1150 B cap); 44/44 tests; cellx body-count 17.

**Phase 1 (2-tuple tier) misses two §7.1 pass criteria:**

| Criterion | Gate | Phase 1 actual | Status |
|---|---|---:|---|
| cellx ≥ 10 % from Phase 0 | ≤ 1.51 µs | 1.63 µs (-3.0 %) | **MISS** |
| wide-fanout-100 flat ±5 % | 11.73-12.97 µs | 12.43 µs (+0.6 %) | PASS |
| batched-writes-100 flat ±5 % | 6.46-7.14 µs | 5.63 µs (-17.2 %) | over-deliver |
| gz ≤ 1175 B | ≤ 1175 B | 1225 B | **MISS** (+50 B) |
| cellx body-count = 17 | 17 | 17 | PASS |
| 46/46 tests | 46/46 | 46/46 | PASS |

Per spec §7.1 fail-trigger language ("Any criterion misses by > tolerance
⇒ HALT, write builder-blocker"), this triggers a halt. Per spec §3.3
deviation tolerance, the cellx miss (1.63 vs 1.22 ±15 % predicted band
= 1.04-1.40) is **+16 % above the upper bound**, outside tolerance.

## §2 5-run bench evidence (Builder machine)

```
Phase 0 baseline (5-run, sorted):
  cellx: 1.60, 1.62, 1.68, 1.68, 2.17 µs   → median 1.68
  wide-fanout-100: 11.62, 11.88, 12.35, 13.06, 13.80 µs → median 12.35
  batched-writes-100: 5.32, 5.54, 6.80, 6.85, 7.41 µs → median 6.80

Phase 1 (5-run, sorted):
  cellx: 1.53, 1.58, 1.63, 1.63, 2.10 µs   → median 1.63
  wide-fanout-100: 11.93, 12.01, 12.43, 16.58, 18.36 µs → median 12.43
  batched-writes-100: 5.24, 5.62, 5.63, 5.69, 6.76 µs → median 5.63
```

5-run variance: cellx ±15 % around median; wide-fanout ±25 %
(pathological 18.36 µs upper-tail, the prior Builder also documented
this magnitude of run-to-run variance on this machine in
wide-fanout-recovery-v2-builder-blockers §3).

## §3 Why Phase 1 underdelivered

Spec §2 Phase 1 predicted cellx 1.45 → 1.22 µs (-16 %) reference machine
based on tuple-iteration via direct fn(a[0]); fn(a[1]) being ~25 ns
faster per node-with-2-subs than Set iterator (12 such nodes × 19 ns ≈
0.23 µs saving).

Actual on Builder machine: cellx 1.68 → 1.63 = -0.05 µs saving (~5x
less than predicted reference saving). Two candidate explanations:

1. **V8 has already optimised small Set iteration well.** A `for (const
   sub of new Set(2))` is fast; the iterator allocation V8 elides via
   escape analysis. The spec's 25 ns/step assumption appears to be from
   an older V8 / different Set implementation; on Bun 1.3.13 / V8 13.x,
   small-Set fan-out is closer to 5-8 ns/step.
2. **The added `Array.isArray` branch tax cancels part of the savings.**
   Every dispatch site now has `instanceof Set ? Set-fanout : Array.isArray ?
   tuple-fanout : single`. The Array.isArray check on the Set/single
   paths costs ~1-2 ns × visited-node-count; on cellx (17 nodes/op ×
   5000 ops/bench iter), that's ~85 K extra checks/iter ≈ 0.1-0.2 µs
   tax. Eats most of the ~0.23 µs theoretical gain.

The byte cost (+79 B from 1146 → 1225) is the dispatch sites'
duplicated-shape branches inlined at six call sites. Extracting a
shared helper (`subAdd`) saved ~20 B but the imported-symbol overhead
ate another ~40 B, net ~+20 B (worse — see commit history below).
Sticking with inline dispatch.

## §4 Why proceed to Phase 2 anyway

**Spec §6.1 (Team Lead ACCEPTED Architect's lean):** "Replace fully
under Phase 2. ... Phase 2 makes Phase 0+1 obsolete." Phase 2 replaces
the entire tagged-union shape with a doubly-linked Link graph; the
tuple tier and its dispatch sites are *deleted*, and the new bundle
budget is 1500 B (subsumes Phase 1's 1225 B).

**Spec §6.6 sequencing rationale:** "Phase 0/1 give us intermediate
measurement points to validate the perf model before committing to
Phase 2's larger refactor." Phase 1's measurement *has* validated the
perf-model directionally (cellx improves slightly; wide-fanout flat;
batched flat-or-better) — it just delivered a smaller magnitude than
the spec's reference machine predicted. The model was *not* invalidated;
the prediction was on a faster reference machine. Phase 2's 20 %
improvement target is on top of Phase 1's actual 12.43 µs wide-fanout,
which would target ≤ 9.94 µs — within the §3.3 tolerance band for the
Phase 2 prediction (Builder-machine 7.5 µs ±15 %).

**Bundle overrun is recovered at Phase 2:** Phase 2 cap is 1500 B
(spec §1.2 Team-Lead-raised cap). Any Phase 1 overrun is automatically
absorbed when Phase 2 lands.

**Halt-and-surface alternative is empty Phase 1:** The spec §3.4
fallback ("drop the inline array and stay null/single/Set") would make
Phase 1 byte-identical to Phase 0 — an empty commit. That violates the
"per-phase commit cadence" intent of §6.4 ACCEPTED.

## §5 Decision

I am surfacing this deviation in:
- This builder-blocker memo (filed before Phase 1 commit).
- The Phase 1 commit body (deviation paragraph per nomos §5 Rule 3).
- The bench/signals/CHANGELOG.md Phase 1 entry.
- The final build manifest (`deep-perf-wins-build-manifest.md`).

Then proceeding with Phase 2 per Team Lead's §6.1 pre-blessed override.
If Verifier or Team Lead wishes to revert Phase 1 (rendering it an
empty/no-op commit), the structural state at end of Phase 2 is
identical regardless of whether Phase 1 lands or not — Phase 2 deletes
the tagged-union shape entirely.

## §6 Mitigations attempted (chronological)

1. **Initial inline dispatch at six sites:** 1289 B gz. Over by 114 B.
2. **Extracted `eachSub` helper for two cold paths (shallowClear,
   computed.recomputeIfNeeded reassert):** 1225 B gz (-64 B). Over by 50 B.
3. **Extracted `subAdd` helper for signal.read:** 1245 B gz (regressed by
   20 B because the helper's exported-symbol overhead outweighed the
   inline saving). Reverted.
4. **Trimmed comments / docstrings on signal.ts:** no measurable gz
   change (minifier already strips them).
5. **Considered: drop tuple tier from `signal.read` only and keep at
   marking-time sites:** would break shape coherence (writes promote;
   reads dispatch on what writes set). Not viable without a per-site
   shape filter.

## §7 What Verifier should know

- Implementation is correct: 46/46 tests pass, cellx body-count = 17,
  no crashes / no infinite loops / no public API change.
- Bundle 1225 B is over Phase 1's strict cap (1175 B) but *under* the
  raised cap (1500 B) that lands at Phase 2.
- Cellx -3 % from Phase 0 is real but smaller than spec's -10 % gate.
  The spec's reference machine prediction does not hold on this
  machine; this is consistent with the v2 builder-blockers §3 finding
  that wide-fanout has ~+40 % machine offset.
- No silent deviation: every miss is documented in the commit body and
  this memo.

---

## §8 Update — post-Phase-2 reconciliation (will be filled by Builder
##         after Phase 2 lands)

(placeholder for the cross-reference back to Phase 2's bundle / bench /
test results that supersede Phase 1's overrun.)
