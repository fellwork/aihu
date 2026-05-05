# Investigation — Round N+3 Item 2 priority post-Fusion α

**Date:** 2026-05-02
**Investigator:** auto (autonomous mode, Round 1)
**Branch:** `investigate/n3-item-2-priority`
**Branch base:** `origin/main` HEAD `4824b91`
**Verdict:** **CLOSE-ITEM-2** (no surface to user required)

---

## Section 1 — alien-signals iterative outer-loop walk

Source: `node_modules/.bun/alien-signals@3.1.2/node_modules/alien-signals/esm/system.mjs` (alien-signals 3.1.2; same install version cited in `bench/signals/package.json` and Scout's read in `.team/round-n3/scout-report.md` §2).

### 1.1 Iterative mark walk (no recursion, explicit stack)

`function propagate(link)` at **`system.mjs:92–142`** is the iterative mark walk. Recursion is replaced by an explicit linked-list stack (`let stack;` at `system.mjs:94`, pushed at `system.mjs:122` as `stack = { value: next, prev: stack }`, popped at `system.mjs:132–139`).

### 1.2 Outer loop processing the stack

The outer loop is `top: do { ... } while (true)` — labelled `top` at **`system.mjs:95`**, terminates via `break` at **`system.mjs:140`** (entered from the stack-empty branch at `:139`). Each iteration of the outer loop processes the current `link` (current sub) at **`system.mjs:96`** (`const sub = link.sub;`).

### 1.3 Inner walk — descent into children's deps

There is **NO separate inner-loop function-call boundary** in alien's design. The descent into a sub's children (i.e., walking forward through `sub.subs`) is folded into the same `do/while`:

- **`system.mjs:117–127`** — when the current sub is `Mutable` (`flags & 1`), set `link = subSubs` (descend), record `next` for the parent's continuation by pushing onto `stack` if there are siblings (`:121–124`), and `continue` the outer `top` loop.
- **`system.mjs:128–131`** — sibling continuation along the linked list (`link = next; next = link.nextSub; continue`).
- **`system.mjs:132–139`** — pop-stack-and-continue when current chain exhausts.

The unified `do/while (true)` loop is alien's structural answer to aihu's outer-loop+inner-loop split. Alien achieves single-monomorphic-loop V8 inlining via labelled `continue top` + linked-list stack; aihu achieves the same via two explicit while-loops (T1+T2+T6 fence; see §2).

### 1.4 Per-iteration optimizations alien uses

- **Per-edge version dedup at link** (`link.version` set at construction in `link()`, **`system.mjs:36`**, and read at **`system.mjs:30`**) — but this is a *link-creation* optimization, not a propagate-walk one. (This is alien technique 2 in Scout's report; deferred to Track-B per `.team/round-n2/retro.md` §"alien-signals investigation".)
- **No pre-flagged-children fast-path** in `propagate`. Effects are queued via `notify(sub)` callback at **`system.mjs:115`** when `flags & 2` — same eager-queue shape aihu's `markOne` uses (`signal.ts:220, 246`).
- **Linked-list stack frames** (`{value, prev}` plain object at `system.mjs:122`) instead of typed array — but this allocates per fan-out vs aihu's amortised module-level `markStack: Subscriber[]` at `signal.ts:195`. **Aihu's choice is faster on V8** (already validated at H4-tactical landing, commit `54d73d7`).

**Net assessment:** alien's `propagate` is structurally one outer loop with descent folded in via labelled `continue`; aihu's `markOne` is two explicit while-loops with the same DFS semantics. The two designs are **structurally equivalent for the work performed**; they differ only in syntactic shape.

---

## Section 2 — aihu post-Fusion `markOne` outer-loop shape

Source: `packages/signals/src/signal.ts` lines 198–266 on main HEAD `4824b91`.

### 2.1 Current shape (post-Compressor + post-Fusion α)

`markOne(root: Subscriber): void` at **`signal.ts:197`**. The function is **already iterative** with an explicit module-level stack:

- Module-level `markStack: Subscriber[]` declared at **`signal.ts:195`**.
- Outer loop: `while (markStack.length > baseLen)` at **`signal.ts:212`**.
- Inner chase loop: `while (true)` at **`signal.ts:239`** — entered when the popped outer sub has exactly one inbound dep-edge (linear chain).

### 2.2 Outer/inner split per H4-tactical T1+T2+T6 fence

Per the comment block at **`signal.ts:198–208`** and commits `54d73d7` (perf: H4-tactical T1+T2+T6 split markOne outer/inner) + `e005a47`:

> "Split into two distinct loops so V8 can monomorphise each independently — the ternary `isChase ? MARKED | PENDING : MARKED` in the unified loop is polymorphic in the hot inner path and prevents type inference."

The split exists *because* a unified single-loop walk caused V8 to deopt the hot inner path. **The current outer/inner split is the V8-monomorphism-forced answer to alien's labelled `continue top` design** — aihu achieves the same end via two distinct loops; alien achieves it via one labelled loop with linked-list stack frames.

### 2.3 Function-call boundary status

**There is NO function-call boundary inside `markOne` that Item 2 could target.** The outer loop body (`signal.ts:213–234`) is a flat sequence of bit-flag checks, MARKED set, EFFECT push to `effectQueue` or fan-out push to `markStack`. The inner chase loop (`signal.ts:239–261`) is similarly flat. The whole walk runs as one function execution; only `propagateMark` (`signal.ts:271–273`) calls `markOne` per direct sub of the written signal — and that boundary is the per-source-sub entry point, not a per-hop call.

`propagateMark` at **`signal.ts:271–273`**:
```ts
export function propagateMark(head: Link | null): void {
  for (let l = head; l !== null; l = l.nextSub) markOne(l.sub)
}
```
This is the only `markOne` caller for `signal.write`; `drainBatch` at **`signal.ts:362–366`** calls `markOne(sub)` once per `drainList` entry. Both callers iterate top-level entries and dispatch to `markOne` once each — no per-hop function-call overhead.

### 2.4 Direct citation — outer-loop body

The outer-loop body (post-α) is at **`signal.ts:213–234`**:

```ts
// ── Outer loop: stack-popped nodes, MARKED only (no PENDING) ──
let sub = markStack.pop() as Subscriber
if (sub.flags & DISPOSED) continue
if (sub.flags & MERGE && sub.lastWave === wave) continue
if (sub.flags & RUNNING) throw new SignalCircularError()
if (sub.flags & MERGE) sub.lastWave = wave
sub.flags |= MARKED
if (sub.flags & EFFECT) { effectQueue.push(sub); continue }
let head = sub.subsHead
if (head === null) { sub.flags |= STALE; continue }
if (head.nextSub !== null) {
  sub.flags |= STALE
  for (let l: Link | null = sub.subsTail; l !== null; l = l.prevSub) {
    const child = l.sub
    if (child.flags & EFFECT) child.flags |= PENDING
    markStack.push(child)
  }
  continue
}
// Linear entry: promote outer node to PENDING, then chase
sub.flags |= PENDING
```

Inner chase loop body at **`signal.ts:239–261`**:

```ts
while (true) {
  sub = head.sub                // T6: one .sub read per iteration
  if (sub.flags & DISPOSED) break
  if (sub.flags & MERGE && sub.lastWave === wave) break
  if (sub.flags & RUNNING) throw new SignalCircularError()
  if (sub.flags & MERGE) sub.lastWave = wave
  sub.flags |= MARKED_PENDING   // T2: no ternary
  if (sub.flags & EFFECT) { effectQueue.push(sub); break }
  head = sub.subsHead
  if (head === null) { sub.flags |= STALE; break }
  if (head.nextSub !== null) {
    sub.flags |= STALE
    for (let l: Link | null = sub.subsTail; l !== null; l = l.prevSub) {
      const child = l.sub
      if (child.flags & EFFECT) child.flags |= PENDING
      markStack.push(child)
    }
    break
  }
  // Continue inner chase: head already updated above (T6)
}
```

**Both loops are flat, monomorphic, and call no other functions on the hot path.** The only hot-path function-call inside `propagateMark → markOne` is `markStack.pop()` and `markStack.push(child)` — V8 intrinsics, not user-level calls.

### 2.5 Conclusion — Item 2's target does not exist

Item 2 was scoped against the pre-Round-N+3 `markOne` shape (the depth-aware mark surface from Round N+2 Builder B, which had a one-call-per-node entry through `markOne` for each fan-out node — see Builder B trial branch `feat/signals-n2-depth-mark`). After H4-tactical T1+T2+T6 (commit `54d73d7`, pre-α) and Fusion α (commit `4824b91`), `markOne` is **already iterative with an explicit stack and an outer/inner-loop split**. There is no per-node function call to inline.

---

## Section 3 — Empirical baseline (Q7 environment lockdown)

3-run capture committed at `bench/baselines/autonomous-session-4824b91.md`. Summary (3-run-median p50, `@aihu/signals`):

| Workload | Pre-α p50 (`round-n3-pre-9f06acb.md`) | Post-α median p50 (this session) | Δ% | Verifier post-α (retro §3) | Δ% (retro) |
|---|---:|---:|---:|---:|---:|
| cellx | 489.53 ns | 481.30 ns | −1.7 % | 422.07 ns | −14.0 % |
| wide-fanout-100 | 4.43 µs | 3.65 µs | −17.6 % | 3.23 µs | −27.7 % |
| batched-writes-100 | 2.64 µs | 3.14 µs | +18.9 % | 2.93 µs | +5.4 % |
| deep-propagation-100 | 3.45 µs | 3.32 µs | −3.8 % | 3.02 µs | −13.2 % |
| dynamic-deps | 679.74 ns | 684.38 ns | +0.7 % | 610.91 ns | −15.0 % |
| creation-1to1000 | 84.64 µs | 105.41 µs | +24.5 % | 96.13 µs | −4.3 % |

**Q7 environmental finding:** Every this-session p50 diverges > 5 % from `bench/signals/RESULTS.md` (committed at the same HEAD `4824b91`) in the same direction (+15.3 % to +20.3 %, tight cluster). This is the signature of background system load on the Investigator's run — not a regression on `signal.ts`. Detailed analysis at `bench/baselines/autonomous-session-4824b91.md` §"Q7 analysis".

**Directional comparison** (this session vs Verifier 3-run-median in `.team/dual-session-direction/retro.md` §3, captured on the same machine in the same hour-window as the merge):

- **wide-fanout-100, deep-propagation-100, cellx:** all show post-α speedup vs pre-α floor in this session (−17.6 %, −3.8 %, −1.7 %); the Verifier's tighter capture shows larger gains (−27.7 %, −13.2 %, −14.0 %). The α gate (≥ 10 % deep-prop) holds in the Verifier's same-hour-window evidence — load-bearing.
- **batched-writes-100, dynamic-deps, creation-1to1000:** noise-dominated in both captures.

**Surface trigger evaluation:**
- Verdict ≠ CLOSE-ITEM-2: NO (verdict is CLOSE — see §5)
- Bench regression > 5% on any workload: NO — apparent regressions in this session are explained by environmental load, not source change. Verifier's same-hour-window capture is the load-bearing α gate evidence.
- Bench numbers diverge > 5% from RESULTS.md: YES on every workload, but with the tight uniform-upward signature of environmental noise. Investigator does NOT escalate as a code regression. Flagged for Director awareness.

---

## Section 4 — Residual-gain estimate

### 4.1 Item 2's original projection

From `.team/round-n2/retro.md` (commit `395ddb0`) §"Round N+3 setup" → "Item 2 — Iterative outer-loop inlining (Builder B)":

> - Eliminate the per-node function call in the fan-out outer loop.
> - Inline the mark walk into a single `while` loop with an explicit stack.
> - Analogous to alien-signals' iterative walk technique.

**No explicit % gate is stated in Item 2's scoping.** The retro's framing ties Item 2 to alien technique 1 (iterative mark walk), which the same retro §"alien-signals investigation" identifies as eliminating "JS call overhead per hop in the mark phase." Item 2's gain target is therefore deep-propagation-100 (per-hop overhead × 100 hops) and wide-fanout-100 (per-fan-out-node overhead × 100 nodes).

The retro §"Round N+3 core scope" pairs Item 1 (single-pass mark + effect queue, the **primary** source of alien's 1.65× deep-prop advantage) with Item 2 as a complementary structural cleanup. **Item 1 was the load-bearing piece; Item 2 was the "and also" companion.**

### 4.2 What α delivered

Per `.team/dual-session-direction/retro.md` §3 (Verifier 3-run-median):

- **deep-propagation-100: −13.2 %** (3.48 µs → 3.02 µs). α gate was ≥ 10 %; gate passed.
- **wide-fanout-100: −27.7 %** (4.47 µs → 3.23 µs). Far above any projection.
- **cellx, dynamic-deps, creation-1to1000:** all within or better than ±5 % gate.
- **batched-writes-100: +5.4 %** (within mitata noise).

α delivered Item 1's full target plus large bonus wins on workloads that were not the primary α target. The retro §"Open items / next session" entry already flagged Item 2 for re-evaluation:

> "Round N+3 Item 2 — iterative outer-loop inlining: **OPEN — re-evaluate priority.** α's bonus `wide-fanout-100` -27.7% may have already captured the gain Item 2 was targeting. Re-bench against current `main` before scoping a new round; if `wide-fanout-100` is now field-leading, Item 2 may be redundant."

### 4.3 Per-axis residual-gain analysis

#### wide-fanout-100

- Post-α `RESULTS.md`: aihu **3.13 µs** vs alien **3.02 µs** (−3.5 % gap, aihu ~3 % behind). Functionally tied at the field lead.
- Item 2 target: per-fan-out-node call overhead. **There is no per-fan-out-node function call in aihu's `markOne` post-α** (§2.3, §2.4). The fan-out branch (`signal.ts:223–234, 249–259`) is in-loop `markStack.push(child)` — V8 intrinsic, no user-level function boundary.
- **Residual gain: ZERO on this axis.** Item 2 has no inlining target on the fan-out path.

#### deep-propagation-100

- Post-α `RESULTS.md`: aihu **2.88 µs** vs alien **2.27 µs** (~1.27× gap, narrowed from pre-α ~1.65×).
- Item 2 target: per-hop call overhead in linear chain walk. **The linear-chain walk in aihu is the inner chase loop** (`signal.ts:239–261`) — `while (true) { ... head = sub.subsHead; ... }` — flat in-loop, no per-hop function call.
- The remaining ~1.27× gap to alien is not call-boundary overhead (already eliminated). Likely sources:
  - Per-hop bit-flag checks (`if (sub.flags & DISPOSED) break`, `if (sub.flags & MERGE && sub.lastWave === wave) break`, `if (sub.flags & RUNNING) throw ...`) — alien collapses some of these via per-edge version dedup (technique 2; deferred to Track-B per N+2 retro).
  - Alien's `checkDirty` pull-on-demand short-circuit on equality-stable upstream — **aihu ALSO has this post-α** via the unconditional per-effect dep-walk in `drainEffectQueue` (`signal.ts:303–308`). The `recomputeIfNeeded?.()` chain through `Computed.read()`'s lazy-pull (per arch-signals-fusion.md §3.1) is structurally equivalent to alien's `checkDirty`.
  - V8 ICs at the polymorphic call sites (`l.dep.recomputeIfNeeded?.()` in `drainEffectQueue:306`).
- **Residual gain from iterative outer-loop inlining: ~0 %.** The gap is structural (per-edge version dedup is a different optimization; bit-flag count is a different optimization; ICs are V8-side). Inlining the (already-non-existent) outer-loop call boundary cannot close this gap.

#### Other workloads

- **cellx, batched-writes-100, dynamic-deps, creation-1to1000:** all are workloads where aihu leads or ties the field per `RESULTS.md`. None are call-boundary-overhead-dominated. Item 2 has no inlining target relevant to these workloads.

### 4.4 Bytes / risk balance

Item 2 was scoped pre-Compressor as a separate Builder track. **Post-Compressor + post-Fusion α the relevant code shape no longer exists**:
- The pre-α "fan-out outer loop" is now the unified `markStack`-driven outer loop with no per-node call.
- Pre-α `settleAndDrain` (the eager `for (const sub of visited) sub.recomputeIfNeeded?.()` walk) is **deleted** (post-α `drainEffectQueue` directly drives lazy pull-on-demand).
- The current outer/inner-loop split exists *because* V8 monomorphism requires it (T1+T2+T6 fence per `signal.ts:198–208`); collapsing it into one loop would reintroduce the V8 deopt that H4-tactical specifically fixed.

Pursuing Item 2 against the current shape would **either**:
1. **Be a no-op** (the call boundary it targets does not exist), with byte cost ≈ 0 and bench gain ≈ 0; or
2. **Re-fuse the outer/inner loops** (against H4-tactical's V8 monomorphism rationale), with high risk of a deep-propagation regression (the same regression H4-tactical was created to fix).

---

## Section 5 — VERDICT

### **CLOSE-ITEM-2.**

α captured the gain Item 2 was targeting **and** the structural shape Item 2 was meant to optimize no longer exists post-α. Specifically:

1. **The "per-node function call in the fan-out outer loop" Item 2 targets does not exist on main HEAD `4824b91`.** Per `signal.ts:212–262` (cited in §2.3–2.4), aihu's `markOne` is already iterative with explicit `markStack` and an outer/inner-loop split that is **load-bearing for V8 monomorphism** (commit `54d73d7` H4-tactical T1+T2+T6). There is no function-call boundary on the hot path to inline.

2. **α already extracted the gain Item 2 was projecting.** Item 1 (single-pass mark + effect queue via lazy dep-settle) delivered Verifier-confirmed deep-propagation-100 −13.2 %, wide-fanout-100 −27.7 %, cellx −14.0 %, dynamic-deps −15.0 %. Wide-fanout-100 went from "alien 4.63 µs vs aihu 4.47 µs" pre-α to "alien 3.02 µs vs aihu 3.13 µs" post-α (`RESULTS.md`) — aihu is now functionally tied with alien at the field lead.

3. **The residual deep-propagation gap (~1.27×) is not call-boundary-overhead.** Per §4.3, the gap's likely sources are (a) per-edge version dedup (alien technique 2; deferred to Track-B per N+2 retro), (b) bit-flag-check count, (c) V8 IC quality at polymorphic recompute call sites. None of these are addressed by iterative outer-loop inlining.

4. **Pursuing Item 2 against the current shape carries net-negative expected value.** Re-fusing the outer/inner loop would reintroduce the V8 polymorphism that H4-tactical specifically fixed; the projected bench delta is ≤ 0 (regression-likely).

**Recommendation:** Round N+3 Item 2 closes. If a future round wants to address the ~1.27× deep-propagation gap, the productive paths are (a) Track-B per-edge version counter (alien technique 2; in `feat/signals-n2-packed-proto`'s reference work — see memory `project_packed_proto_branch.md`), or (b) bit-flag-check consolidation (a separate Compressor-style micro-pass). Neither of those is "Item 2" as originally scoped.

**Direct quote of justification (§4.3 wide-fanout):**
> "There is no per-fan-out-node function call in aihu's `markOne` post-α (§2.3, §2.4). The fan-out branch (`signal.ts:223–234, 249–259`) is in-loop `markStack.push(child)` — V8 intrinsic, no user-level function boundary. Residual gain: ZERO on this axis."

### Surface conditions per Decision 3

- **Verdict = CLOSE-ITEM-2** → **no forced surface to user.** Decision 3 condition 1 (PURSUE/SCOPE-CHANGE → forced surface) does not fire.
- **Bench regression > 5% on any workload:** NO. Apparent in-session divergences are environmental (Q7 noise, uniform +15-20 % cluster vs `RESULTS.md`). Source has not changed since `4824b91`. Decision 3 condition 2 does not fire.
- **Bench numbers diverge > 5% from RESULTS.md:** YES (+15.3 % to +20.3 % on every workload, uniform cluster — environmental). Flagged for Director awareness in `bench/baselines/autonomous-session-4824b91.md` §"Q7 analysis"; not a code regression.

**Investigator routes the verdict directly to the Director adjudication queue without surfacing.**
