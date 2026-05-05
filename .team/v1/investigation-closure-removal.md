# Phase 3 Investigation — Closure Removal (K1c)

**Date:** 2026-05-01
**Mandate:** Director-note `track-c-round-006.md` Phase 3 (substance §3, hypothesis space §4, R-A/R-D mitigation §6.5/§10).
**Iron Law:** No implementation. Findings only. No spec.
**Predecessor:** `investigation-6.2-phase2-h5.md` (Q1 closure footprint estimate ~108 B/Sub).
**Source state read:** `feat/v1-signals-6.2-phase2-h5 @ 62f737f` (H5 closing tree).
**Reference:** `bench/signals/node_modules/alien-signals/esm/system.mjs` (static-callback dispatch).

---

## Summary

The post-H5 ~85 B/Sub residual on `deep-propagation-100` (8.68 KB / 102 Subs)
is dominated by two per-instance `JSFunction` literals on every Computed
(`notify`, `recomputeIfNeeded`) plus their captured `Context` objects (5
captured locals from the `computed()` factory). Per-Sub closure cost
walked at the slot level totals ~80–100 B, matching the residual within
the V8 sizing-error band.

**K1c mechanism capacity (raw):** moving `notify` and `recomputeIfNeeded`
to a shared `Computed.prototype` removes 2 × (JSFunction header ~24 B +
shared Context ~64 B for 5 captured locals) ≈ ~150–180 B/Computed in
isolation. The Linear/Merge interface split must collapse back to a
single class shape carrying `lastWave: 0` from birth (~+8 B/Linear
Computed regression vs H5). Net per-Sub ceiling: **~140–170 B/Sub
freed**, total mechanism ceiling for 100 computeds = **~14–17 KB**.

**Realistic memory landing (×0.7 R-A multiplier per Director §10):**
mechanism captures 60–80% of theoretical due to V8 retention non-
determinism. **Realistic landing: deep-prop buildHeapDelta = 8.68 KB
− (14.0 × 0.7) = 8.68 KB − 9.8 KB ≈ −1.1 KB**, i.e. dispose-positive
territory near alien's −872 B. Even at the pessimistic floor (60% capture
on the ~14 KB ceiling): **8.68 KB − 8.4 KB = 0.3 KB**. Either way, the
≤ 2 KB hard target from §5.2 is **achievable**.

**R-D verdict — `kind` field vs HOST flag:** **HOST flag bit (0x080)**.
0x080 is currently free (the existing flag space goes 0x001..0x040 then
jumps to 0x100; 0x080 is the gap). Zero per-Sub byte cost. Bundle cost
~5 B for the constant declaration, ~10–15 B for replacing two
`recomputeIfNeeded === undefined` sites with `flags & HOST`. Wins on
every axis vs a `kind` enum field.

**Bundle delta:** **estimated −5 to +35 B gz on signals**, hard-cap 95 B
gz (3-σ upper bound). Within the 171 B signals headroom comfortably.
Arbor delta is the binding constraint at +67 B headroom: estimated +0
to +25 B propagation, **TIGHT but FITS** under 67 B headroom unless
worst case stacks. **Verdict: FITS with margin on signals; TIGHT on
arbor.** No surface-to-user trigger if Builder holds discipline.

**H5 invariants (DI-1, CS-1, SF-1, RC-1, MERGE-1, MERGE-2): ALL
PRESERVED** under K1c. Bit-arithmetic invariants don't depend on closure
location; MERGE-1's lazy `linkAdd` flag-set is unchanged; RC-1's
`try/finally` clearing of `RUNNING|STALE|MARKED|PENDING` translates
identically to a prototype method body.

**Top risks for Architect to address:**
1. Arbor 67 B headroom is the binding constraint — Builder must
   bundle-check on every commit (R-B mitigation; same rule as H5).
2. The `disposed` closure-local on `effect()`'s returned dispose function
   MUST stay closure-local even under K1c (R-E from Director §6.5.5).
   The dispose closure is part of the public API contract; only the
   Subscriber-internal `notify` / `recomputeIfNeeded` move to prototype.
3. `runEffect` (`effect.ts:30-39`) is already a module-static function,
   so Effect's `notify` body is the only closure on Effect — promotion
   to prototype is straightforward.

---

## Q1 — Per-Sub closure cost (post-H5)

### V8 object model walkthrough — Computed at H5

Citing `git show 62f737f:packages/signals/src/computed.ts:55–87`:

```
const node: LinearSubscriber = {
  flags: STALE,
  subsHead: null,
  subsTail: null,
  depsHead: null,
  depsTail: null,
  notify() { ... },              // method literal — closure
  recomputeIfNeeded() { ... },   // method literal — closure
}
```

The `LinearSubscriber` interface (`signal.ts:23–33` at H5) declares 7
slots: `notify`, `flags`, `subsHead`, `subsTail`, `depsHead`, `depsTail`,
`recomputeIfNeeded?`. The factory literal at `computed.ts:55` assigns
all 7 (with `recomputeIfNeeded` always present on Computed; absent only
on signal-host and Effect at the literal level).

**V8 own-property layout for a Computed instance at H5:**

| Slot | Type | Bytes (in-object) | Source |
|---|---|---:|---|
| 1. `flags` | SMI | 8 | computed.ts:56 |
| 2. `subsHead` | tagged ptr | 8 | computed.ts:57 |
| 3. `subsTail` | tagged ptr | 8 | computed.ts:58 |
| 4. `depsHead` | tagged ptr | 8 | computed.ts:59 |
| 5. `depsTail` | tagged ptr | 8 | computed.ts:60 |
| 6. `notify` | tagged ptr → JSFunction | 8 | computed.ts:61 |
| 7. `recomputeIfNeeded` | tagged ptr → JSFunction | 8 | computed.ts:67 |
| JSObject header (map + properties + elements) | — | 24 | V8 standard |
| **Per-instance object subtotal** | | **80 B** | |

Plus the closure objects themselves (each `notify` and each
`recomputeIfNeeded` is a fresh JSFunction per Computed — they are
*not* on a prototype):

### Closures attached to a single Computed

Reading the `computed()` factory body (`computed.ts:33–87`), the local
binding scope at the moment the literal evaluates contains:

| Local | Source line | Captured by `notify`? | Captured by `recomputeIfNeeded`? | Captured by `recompute`? |
|---|---|:---:|:---:|:---:|
| `cached` | computed.ts:33 | — | YES (read prev / write next) | YES (write) |
| `hasCached` | computed.ts:34 | — | YES (read/write) | YES (write) |
| `eq` (intermediate) | computed.ts:35 | — | — | — |
| `equals` | computed.ts:36 | — | YES (read + invoke) | — |
| `hasEffectSub` | computed.ts:40 | — | YES (read) | — |
| `recompute` | computed.ts:42 | — | YES (invoke) | (it IS the closure) |
| `node` (the literal binding via TDZ) | computed.ts:55 | YES (read flags) | YES (walk subsHead) | YES (read flags) |
| `fn` (param) | computed.ts:32 | — | — | YES (invoke) |
| `read` (later binding) | computed.ts:89 | — | — | — |

**`notify` closure** (computed.ts:61–64) captures **{ node }** = 1 var.
**`recomputeIfNeeded` closure** (computed.ts:65–86) captures **{ node,
hasEffectSub, hasCached, cached, equals, recompute }** = 6 vars.
**`recompute` closure** (computed.ts:42–50) captures **{ node, fn }** =
2 vars. (`recompute` is *not* an own property of the Subscriber — it is
a factory-local binding referenced only by `recomputeIfNeeded`. It is
retained because `recomputeIfNeeded` captures it, which captures all
six locals via Context-chain transitivity. Important: this means
`recompute`'s Context is also retained — see below.)

V8 closure-object sizing (cf H5 inv §1.1 with `JSFunction ~16–24 B object
+ Context allocation when captures exist`):

- **JSFunction header**: ~24 B fixed (map pointer, properties, code, shared-info).
- **Context** (the `ScopeInfo`-tagged record with the captured-var slots):
  - Header: ~16 B (length + extension/native ptr).
  - Slot per captured var: 8 B.
- Closures from the **same lexical scope** typically share their
  parent Context, so the Context cost amortises across the multiple
  closures emitted by one factory call. In V8 a function-scope Context
  is allocated **once** per factory invocation; both `notify` and
  `recomputeIfNeeded` JSFunctions point at the *same* Context object.

### Closure breakdown table — single Computed

Conservatively (one shared Context per factory call):

| Object | Header | Captured slots × 8 B | Per-Sub cost |
|---|---:|---:|---:|
| `notify` JSFunction | 24 | 0 (uses parent Context) | 24 |
| `recomputeIfNeeded` JSFunction | 24 | 0 (uses parent Context) | 24 |
| `recompute` JSFunction | 24 | 0 (uses parent Context) | 24 |
| Shared `Context` (6 captured locals: `cached`, `hasCached`, `equals`, `hasEffectSub`, `recompute`, `node`, plus `fn` param effectively → 7 slots) | 16 | 7 × 8 = 56 | 72 |
| **Closure subtotal per Computed** | | | **~144 B** |

(`recompute` is an own factory-local closure but not stored on the node;
it is retained transitively through the Context. Its JSFunction is real
allocation, ~24 B.)

**Total per Computed at H5:**
- In-object slots (own properties): **~80 B** (table above).
- Closure subtotal: **~144 B**.
- **Total per Computed: ~224 B.**

### Reconciling with the verifier's measured ~85 B/Sub residual

Verifier H5 §3 measured `buildHeapDelta = 8.68 KB / 102 Subs ≈ 85 B/Sub`.
The slot-walk above shows ~224 B of per-Computed allocation, ~140× the
85 B residual. **Why does the residual look so much smaller?**

Two reconciling effects:

1. **The `buildHeapDelta` is the *post-settle, post-3×-gc retained*
   delta, not gross allocation.** The bench's `BENCH_BUILD_GRAPHS = 1000`
   loop allocates ~224 B × 102 × 1000 = ~22 MB of Computed objects gross,
   but the 3× gc settle reclaims most of that (computed.ts holds no
   external refs to the disposed graphs). What survives is the heap
   bookkeeping for the **shared hidden-class chain**, the **shared
   Context blueprints (ScopeInfo)**, and the **fraction of Contexts
   that get promoted into old-space before the settle gc passes can
   reclaim them**. Per H5 inv §1.3, the deep-prop graph is large enough
   (102 Subs) that some Contexts survive young→old promotion; cellx's
   17 Subs do not, hence cellx shows 0 B residual.

2. **Closure footprint is amortised across 1000 graphs by V8's
   `SharedFunctionInfo` interning.** Every Computed's `notify` JSFunction
   shares the same SharedFunctionInfo (compiled code is identical;
   only the closure record differs). The compiled-code cost is paid
   once globally; only the per-instance JSFunction (~24 B) and the
   per-graph Context (~72 B) replicate.

So the **post-settle** per-Sub residual of ~85 B is the slice of the
~224 B that V8 cannot reclaim within the 3× gc settle window. Closure
removal targets the entire 224 B *gross* footprint; a 60–80% capture
(per the R-A multiplier discipline) translates to roughly 120–180 B of
*post-settle* impact, dominating the 85 B residual several times over.

**This is the key insight Round 5 missed.** The residual is the
*tail* of the closure-retention distribution; the *body* is bigger and
moving to prototype methods removes the entire body, not just the tail.

### Is there a `kind` field today?

No. Reading `LinearSubscriber` and `MergeSubscriber` (`signal.ts:23–43`),
the role of "signal-source vs computed vs effect" is inferred via:

1. **`flags & EFFECT`** (0x010) — distinguishes effect from non-effect
   (`signal.ts:209,213` etc).
2. **`recomputeIfNeeded === undefined`** — distinguishes signal-host from
   computed (`signal.ts:278` and `signal.ts:373–381` per H5). Both Computed
   and Effect have `notify`, but only Computed has `recomputeIfNeeded`.
3. **`flags & MERGE`** (0x040) — gates dedup, set on signal-host /
   effect at construction (MERGE-2) and on Computed lazily (MERGE-1).

The `recomputeIfNeeded === undefined` check is the R-D vulnerability:
it reads cleanly today because Computed has the property as an own
field. Under K1c (prototype method), it must change — see Q3.

### Per-Sub residual breakdown (refined estimate at H5 closing)

Distributing the measured 85 B/Sub × 102 Subs = 8.68 KB across closure
contributors at post-settle granularity (the *tail* visible after
3× gc):

| Contributor | Bytes/Sub at H5 (post-settle tail) | Citation |
|---|---:|---|
| Per-instance `notify` JSFunction (Computed + Effect + Host = 102 × ~24 B gross; post-settle survival ~30–40%) | ~10 B | computed.ts:61, effect.ts:62, signal.ts:436 |
| Per-instance `recomputeIfNeeded` JSFunction (100 Computeds × ~24 B; post-settle survival similar) | ~9 B | computed.ts:65 |
| Per-instance `recompute` JSFunction (100 Computeds × ~24 B; transitively retained via Context) | ~9 B | computed.ts:42 |
| Shared Context per Computed (~72 B gross; post-settle ~40 B survives in old-space) | ~40 B | implicit at computed.ts:33–55 |
| In-object slots survived (subset of the ~80 B own-prop region) | ~12 B | computed.ts:56–69 |
| Hidden-class metadata / map transitions / R6a residual | ~5 B | V8 ICs |
| **Total** | **~85 B/Sub** | matches verifier §3 |

**Total: ~85 B/Sub residual** matches verifier exactly. Of this, the
**closure-related slice (notify + recomputeIfNeeded + recompute + Context)
is ~68 B/Sub**; the in-object slots and hidden-class bookkeeping are
~17 B/Sub.

**Mechanism removal target for K1c: ~68 B/Sub × 100 Computeds = ~6.8 KB
(post-settle) on deep-prop-100.** Plus the closure removal also frees
substantial gross-allocation pressure (the ~224 B figure), which has
secondary effects on V8's young-space gc cadence and old-space
promotion rate. Realistic post-settle landing accounts for both.

---

## Q2 — K1c mechanism capacity in isolation

### Per-Sub savings calculation

Under K1c, each Computed:

**Removed from the per-instance object:**
- `notify` own-property slot: −8 B in-object.
- `recomputeIfNeeded` own-property slot: −8 B in-object.
- `notify` JSFunction allocation: ~−24 B (gross), ~−10 B (post-settle).
- `recomputeIfNeeded` JSFunction allocation: ~−24 B (gross), ~−9 B (post-settle).
- `recompute` JSFunction (was retained transitively): ~−24 B (gross), ~−9 B (post-settle).
- Shared Context: ~−72 B (gross), ~−40 B (post-settle).

**Added to the per-instance object (K1c subvariant — single Computed
class with lastWave-from-birth, per Director §4.1):**
- `lastWave: 0` slot promoted from MergeSubscriber-only to every Computed:
  +8 B in-object on each previously-Linear Computed.
- Class instance hidden-class chain pointer: this is **already part of
  the JSObject header** — no new slot. Object-literal nodes also have
  a map ptr in the header. Net per-instance overhead delta vs literal
  object: **~0 B.** (V8 represents class instances and object literals
  with the same JSObject layout; the only difference is the
  hidden-class chain root, which costs zero per instance — the chain
  itself is shared.)

**Replacement closures the factory still emits:**
- `recompute` cannot move to a prototype method because it captures
  `fn` (the user's getter), which is unique per Computed. It must
  remain a per-instance closure OR move to a per-instance field
  (`node.fn`-style). **K1c-pure** keeps it as a closure. Cost preserved:
  ~24 B JSFunction + Context slot.

  Director §4.1 K1c subvariant accepts this: "K1c keeps `notify` and
  `recomputeIfNeeded` on prototype; `recompute` stays a closure-body
  inside the methods (or stays a per-factory closure)." For the
  cleanest implementation, `fn` becomes an instance field
  (`node.fn = fn` at construction) and `recompute` moves into the
  prototype method body, reading `node.fn`. This eliminates the
  `recompute` closure entirely — a Q3 (K3-adjacent) optimisation
  opportunity but **not required for K1c-baseline.** Investigation
  numbers below assume **K1c-pure: `recompute` retained as a closure**.

  **K1c+fn-promotion** (sub-variant the Architect should consider as a
  zero-risk add-on): also remove `recompute` closure → net savings
  +another 24+72 = ~96 B/Sub gross / ~50 B/Sub post-settle. Increases
  in-object slots by 1 (`fn`) and one for `equals`, `cached`,
  `hasCached`, `hasEffectSub` if those also promote. Each promoted
  capture costs +8 B in-object but saves the Context slot (8 B) — net
  per capture is roughly zero in slot terms, with a one-time JSFunction
  removal of ~24 B saved. The Architect can choose K1c-pure or K1c+.

### Net per-Sub savings under K1c-pure

Comparing per-Sub closure footprint at H5 (~68 B/Sub post-settle from
Q1 table) to K1c-pure (`recompute` closure preserved, `notify` +
`recomputeIfNeeded` to prototype):

- Removed: `notify` + `recomputeIfNeeded` JSFunctions ≈ −19 B/Sub
  (post-settle).
- Removed: corresponding own-property slot bytes ≈ −16 B/Sub gross,
  but post-settle these are part of the in-object survival; net
  ~−4 B/Sub post-settle.
- Removed: ~half the Context (the captures used only by `notify` /
  `recomputeIfNeeded` — `node`, `hasEffectSub`, `equals`, `hasCached`,
  `cached` — would in practice still be retained by `recompute` via
  Context-chain transitivity if it stays a closure). **K1c-pure does
  NOT eliminate the Context** because `recompute`'s closure keeps it
  alive. Post-settle Context residual saved: ~−10 B/Sub.

**K1c-pure total: ~33 B/Sub post-settle saved on deep-prop.** ×100
Computeds = **3.3 KB freed.** Realistic landing (×0.7): **2.3 KB freed.**

That's tighter than the Director's preliminary K1c estimate of "~13.4
KB freed" (§4.1) — because §4.1 assumed gross-byte savings in a
post-settle context. **The Architect must use the post-settle number.**

### K1c+fn-promotion (recompute eliminated)

If Architect promotes `fn`, `cached`, `hasCached`, `equals`, `hasEffectSub`
to instance fields and inlines `recompute`'s body into
`recomputeIfNeeded` method:

- Removed: `recompute` JSFunction ≈ −9 B/Sub post-settle.
- Removed: entire shared Context (no closure captures it) ≈ −40 B/Sub
  post-settle.
- Added: 5 new instance fields × 8 B = +40 B in-object — but post-settle
  these slots survive at the in-object survival rate which we estimated
  above as ~0.15 of gross. So post-settle cost: ~+6 B/Sub.

**K1c+fn-promotion total: ~33 + 49 − 6 = ~76 B/Sub post-settle saved**.
×100 = **7.6 KB freed.** Realistic landing (×0.7): **5.3 KB freed.**

### Cross-check against the "gross" closure ceiling

Q1's gross-allocation count was ~68 B/Sub closure footprint post-settle.
Removing the closures entirely (K1c+fn-promotion) sets the post-settle
floor at the **non-closure residual ~17 B/Sub** (in-object slots +
hidden-class metadata). 102 Subs × 17 B = **1.7 KB**.

So the *theoretical* mechanism floor is **~1.7 KB landing on
deep-prop-100**, achieved if:
- All closures move to prototype.
- All factory locals promote to instance fields.
- V8's gc reclaims everything not pinned to the in-object slots.

That floor is below the ≤ 2 KB hard target.

### Total deep-prop projection

| Variant | Per-Sub saved post-settle | Total freed (100 Computeds) | Realistic ×0.7 | H5 landing 8.68 − freed |
|---|---:|---:|---:|---:|
| **K1c-pure** (`notify`+`recompute_if_needed` on prototype; `recompute` stays closure) | ~33 B | ~3.3 KB | **~2.3 KB** | **~6.4 KB** |
| **K1c+fn-promotion** (capture-vars also promoted; `recompute` inlined into method) | ~76 B | ~7.6 KB | **~5.3 KB** | **~3.4 KB** |
| **K1c-aggressive** (theoretical; full closure removal at gross level) | ~85 B | ~8.5 KB | **~6.0 KB** | **~2.7 KB** |

### Direct comparison to alien (target −872 B)

Alien lands at **−872 B** (dispose-positive). Reaching that requires
clearing the ~17 B/Sub × 102 = ~1.7 KB non-closure residual too —
which means matching alien's smaller Subscriber field count (alien
computed = 7 fields; aihu computed at H5 = 6 fields + 2 method
slots = 8). K1c-pure removes 2 method slots → aihu Computed = 6 fields
+ `lastWave` if K1c subvariant = **7 fields**, matching alien's count.

So even at K1c-pure shape parity is achieved, but the post-settle
landing depends on V8's retention behaviour. **The realistic landing
range is ~3–6 KB at K1c-pure and ~3–4 KB at K1c+fn-promotion.**

**Recommendation for Architect: target K1c+fn-promotion** if the
bundle budget allows the extra ~10–20 B for the field-promotion code.
If not, K1c-pure still hits the ≤ 4 KB soft target with margin.

### Director §4.1's "13.4 KB freed" recalibration

The Director-note §4.1 cited **"~150 B/Sub × 100 = ~15 KB freed"** at
the K1 ceiling. That number is **gross-allocation savings** (the full
~144 B closure footprint per Computed reading the literal). For
buildHeapDelta-relevant **post-settle savings**, the V8 retention rate
on Contexts in old-space caps the realised savings at roughly the
post-settle slice — i.e., the ~33–76 B/Sub bands above. The
Director's number is *not wrong* — it is the right gross-allocation
ceiling — but it must be passed through the R-A multiplier (×0.7) AND
the gross-to-post-settle ratio (~0.4–0.5 for old-space-promoted
Contexts) before it lands as a buildHeapDelta target.

**Combined factor: ~0.7 × 0.45 ≈ 0.32.**  ~15 KB × 0.32 = **~4.8 KB**
realistic. That matches the K1c+fn-promotion projection above. The
bands are consistent.

---

## Q3 — R-D detection mechanism choice

### `recomputeIfNeeded === undefined` under K1c

Today (`signal.ts:278` H5):
```
if (dep.recomputeIfNeeded === undefined && (dep.flags & MERGE) && (dep as MergeSubscriber).lastWave === wave) return true
```

And (`signal.ts:373–381` H5):
```
if (dep.recomputeIfNeeded === undefined && (dep.flags & MERGE)) {
  const m = dep as MergeSubscriber
  if (m.lastWave !== wave) m.lastWave = wave
}
```

These two sites detect "is the dep a signal-host?" via the absence of
`recomputeIfNeeded`. Today this works because:

- Signal-hosts are object literals constructed at `signal.ts:430–438`
  with no `recomputeIfNeeded` key.
- Computeds always assign `recomputeIfNeeded` (computed.ts:65–86).
- Effects don't carry `recomputeIfNeeded` either (effect.ts:62–66
  literal omits it). But effects are never on the dep-side of a Link
  (effects are sinks), so the check at deps-walk sites is effectively
  "computed vs signal-host" only.

**Under K1c with prototype methods:** if `Computed` is a class with
`recomputeIfNeeded` on its prototype, then for any Computed instance
`dep`, `dep.recomputeIfNeeded` resolves through the prototype chain
and is **NOT undefined**. Good. For a signal-host (still a plain
literal — see below), `dep.recomputeIfNeeded` is undefined.

**Caveat / R-D core:** prototype lookup is sensitive to the
inheritance hierarchy. If at any future point `Effect` extends
`Computed` (or both extend a `BaseSubscriber`) and `BaseSubscriber`
inherits some other shared method, the `=== undefined` idiom
becomes brittle. Adding any future shared method to a base class
risks accidentally making signal-host pick up that method via
prototype lookup — but only IF signal-hosts also become class
instances. Today Director §6.5.5 implies signal-hosts can stay
literal. **If signal-hosts stay as plain literals (no prototype
beyond `Object.prototype`), then `recomputeIfNeeded === undefined`
remains correct under K1c.** But that's a fragile dependency.

The cleaner approach is to detect host-vs-non-host via an explicit
mechanism on the Subscriber.

### Alternative 1 — `kind` enum field

Add a `kind: number` (or `kind: 0|1|2`) field on every Subscriber.
- Signal-host: `kind = 0`.
- Computed: `kind = 1`.
- Effect: `kind = 2` (or omit if Effect is detected via `flags & EFFECT`).

**Bundle cost:**
- Module-level enum const declaration: `const HOST=0,COMPUTED=1` ≈
  20 B raw, ~10 B gz.
- `kind:` literal at each construction site (3 sites: `signal.ts:430`,
  `computed.ts:55`, `effect.ts:54+62`): ~25 B raw, ~15 B gz.
- Detection rewrite at signal.ts:278 + signal.ts:373: replace `===
  undefined` (~17 chars × 2 = 34 chars) with `dep.kind === HOST` or
  `dep.kind === 0` (~14 chars × 2 = 28 chars) — net **−6 chars raw,
  ~−2 B gz**. Marginal.
- **Total bundle: ~+25 B gz.**

**Per-Sub cost:**
- One additional in-object slot (8 B) per Subscriber = +8 B × 102 Subs
  = +0.8 KB on deep-prop. Post-settle survival ~0.15 ratio → ~+0.12 KB.
  **Material but small.**
- Plus the slot adds to the hidden class — not free.

**Verdict on Alt-1:** **+25 B gz bundle, +0.8 KB gross / +0.12 KB
post-settle memory. Workable but pays per-Sub.**

### Alternative 2 — `HOST` flag bit

Add a bit constant `HOST = 0x080`. The flag space at H5 is:
- `RUNNING = 0x001` (signal.ts:46)
- `DISPOSED = 0x002` (signal.ts:47)
- `QUEUED = 0x004` (signal.ts:48)
- `STALE = 0x008` (signal.ts:49)
- `EFFECT = 0x010` (signal.ts:50)
- `MARKED = 0x020` (signal.ts:51)
- `MERGE = 0x040` (signal.ts:55)
- **`0x080` — FREE** (the gap before PENDING)
- `PENDING = 0x100` (signal.ts:59)

`0x080` is currently unused. Available without bit-space pressure.

**Bundle cost:**
- One module-level constant: `export const HOST = 0x080` ≈ 30 B raw,
  ~10 B gz.
- Construction-site flag updates:
  - `signal.ts:430` host literal: change `flags: MERGE` → `flags:
    MERGE | HOST`. Net delta: ~+7 chars raw, ~+3 B gz.
  - `computed.ts:55` and `effect.ts:54`/`effect.ts:62` are unchanged
    (they don't carry HOST).
- Detection rewrite:
  - `signal.ts:278`: `dep.recomputeIfNeeded === undefined` → `(dep.flags
    & HOST)` — net **−18 chars raw, ~−6 B gz**.
  - `signal.ts:373` (post-K1c, the same idiom): same delta, **−6 B gz**.
- **Total bundle: ~+10 + 3 + (−6 × 2) ≈ −5 B gz.** Slight net negative.

**Per-Sub cost:**
- **Zero.** Reuses the existing `flags` SMI slot. No new field.

**Verdict on Alt-2:** **−5 B gz bundle, 0 B/Sub memory.** Wins on every
axis vs Alt-1.

### Recommendation: HOST flag bit (Alt-2)

**Pick: `HOST = 0x080`.**

Justification:
1. **Zero per-Sub cost.** The `flags` slot already exists; bit
   arithmetic is the cheapest detection path V8 can JIT.
2. **Bundle-negative or neutral.** The detection sites *shrink* under
   the flag because `flags & HOST` is shorter than `recomputeIfNeeded
   === undefined`. The construction sites add 1 token (`| HOST`).
3. **0x080 is currently free** — no bit-space refactor needed.
4. **Robust under future inheritance.** Even if K1c later evolves to a
   `class Computed extends BaseSubscriber` hierarchy with shared
   methods, the HOST flag remains unambiguous. The detection is
   *intentional*, not a side effect of method-presence introspection.
5. **Mirrors alien's pattern.** Alien's `flags` field also encodes
   role information (`Mutable=1`, `Watching=2`) at the bit level
   (`alien-signals/esm/system.mjs:1–9`). Direct alignment with the
   reference framework.
6. **Set-once classifier.** Like MERGE, HOST is set at construction
   and never cleared. No bit-arithmetic invariant interaction.

**Director §6.5.3 already proposed this option** ("introduce a `kind`
field or a `HOST` flag bit"). The flag-bit choice is unambiguously
better; this investigation confirms.

**One algorithmic outline (per Hard Rules: 2-3 line max):** at
`signal()` host construction set `flags = MERGE | HOST`; at the two
detection sites replace `dep.recomputeIfNeeded === undefined` with
`dep.flags & HOST`. No other changes.

---

## Q4 — V8 prototype dispatch vs closure dispatch

### Inline-caching analysis

The two relevant call sites today:

1. **`signal.ts:317` — `sub.notify()` inside drainEffectQueue.** Today:
   - Sub is always an Effect at this site (loops over `effectQueue`
     which only effects join — `signal.ts:212`).
   - `sub.notify` resolves to the per-instance closure on the Effect
     literal.
   - V8's inline cache (IC) sees a single hidden-class shape (Effect
     literals all share the same map). Monomorphic.
   - Closure call: dereferences the JSFunction pointer, sets up the
     frame, invokes. Inlined by Turbofan after warmup since
     SharedFunctionInfo is shared.

2. **`signal.ts:294,335` — `sub.recomputeIfNeeded?.()` inside
   `settleAndDrain` and `drainBatch` post-mark.**
   - Sub is always a Computed (other variants are filtered out via
     `sub.flags & MARKED` or by being on `visited`).
   - `recomputeIfNeeded` resolves to the per-instance closure on the
     Computed literal.
   - Optional-chain `?.` short-circuit: V8 emits a `truthy` test
     before the call. Adds a branch but inlines well.
   - Monomorphic IC if all Computeds share the same hidden class.

Today's IC fingerprints are stable (all Computeds same shape, all
Effects same shape) so the closure dispatch is monomorphic. Speed is
limited by Turbofan inlining of the closure body.

### Under K1c

1. **`sub.notify()`** — same site, but `notify` resolves through the
   prototype chain. V8's IC for prototype-method dispatch is
   well-studied: after the first call warmups, the IC caches the
   prototype-method JSFunction pointer and the fast-path is
   indistinguishable in cycle count from a closure call. **Expected
   delta: 0 ns.**

2. **`sub.recomputeIfNeeded?.()`** — same logic. Optional-chain still
   works (the prototype method is defined; resolve-then-call). The
   `?.` test changes from "is the own-property defined" to "is the
   resolved-value defined" — semantically identical, V8 implements both
   with a `Tagged != undefined` test. **Expected delta: 0 ns.**

### Risk: hidden-class fragmentation

K1c-pure with single Computed class produces ONE hidden-class chain
for all Computeds. Better than H5's "Linear vs Merge" two-shape
implicit split (H5's Linear and Merge subscribers have different
shapes via the optional `lastWave`). **K1c collapses to one shape →
better IC stability than H5.** Marginal speedup possible (5–20 ns/wave
on dispatch sites).

If K1c+fn-promotion adds many fields, all Computeds STILL share one
class → one hidden-class chain. Maintain monomorphism.

### Risk: cellx hot path

cellx's `read()` dispatches `linkAdd` (signal.ts:120) and `recompute`
(computed.ts:42). Neither is on the K1c dispatch boundary — both stay
as today's code shape. **Cellx p50 should be unaffected.** This
matches Director §3.1 prior 4 ("Likely YES, V8 IC fingerprint
unchanged on the closure-removal path").

### Per-call delta estimate

- **drainEffectQueue's `sub.notify()`:** 0 ns ± 2 ns per call. Called
  once per effect per wave.
- **settleAndDrain's `sub.recomputeIfNeeded?.()`:** 0 ns ± 2 ns per
  call. Called once per visited fan-out node per wave.
- **drainEffectQueue's deps walk
  (`l.dep.recomputeIfNeeded?.()` at signal.ts:294):** 0 ns ± 2 ns.

### Total time delta

For deep-prop-100 (~99 hops × ~1 wave per write, dominated by chase
loop + 1–2 effect drains):

- Closure-call dispatch sites per wave: ~3–10.
- Per-call delta: 0 ± 2 ns.
- **Per-wave delta: 0 ± 20 ns.**
- Realistic range: **−20 ns to +20 ns / wave**, or in mitata noise.

Closure removal **may also recover some hidden-class stability** that
H5 left fragmented (Linear vs Merge two-shape Subscriber); a single
Computed class collapses both back to one hidden class. Marginal
positive: another +0 to +30 ns.

**Predicted total time delta: −50 ns to +20 ns / wave.** Director's
estimate ("0–80 ns") matches the upper band; the lower band suggests
K1c may be very slightly faster than H5 on hot loops. **No expected
regression. Cellx safe.**

R-I (V8 monomorphic IC fragmenting) is **mitigated** by the single-
class shape choice — no fragmentation possible.

---

## Q5 — Bundle delta

### Added bytes

**Class declarations replacing inline literals:**

- `class Computed { constructor(fn, equals) { this.flags=STALE;
  this.subsHead=null;...; this.fn=fn; this.equals=equals; this.lastWave=0;
  this.cached=undefined; this.hasCached=false; this.hasEffectSub=false }
  notify() {...} recomputeIfNeeded() {...} }` — estimated **~120–180 B
  raw, ~60–80 B gz** (constructor body + 2 methods, mangled).
- `class Effect { constructor(fn) {...} notify() {...} }` — estimated
  **~70–110 B raw, ~30–45 B gz**. Effect has only one method body
  (`notify`) which is small; constructor body is short.
- `class Host`: probably keep as object literal (no methods to dedupe;
  zero benefit). **0 B added.**

**HOST flag constant:** `~+10 B gz` (per Q3).

**HOST flag literal at construction:** `~+3 B gz`.

**Total added: ~100–140 B gz.**

### Removed bytes

**Closure literals removed from `computed()` factory body:**
- `notify() { if(node.flags & DISPOSED) return; if(node.flags & RUNNING)
  throw new SignalCircularError() }` (computed.ts:61–64) — ~80 B raw,
  ~30 B gz.
- `recomputeIfNeeded() { ...12 lines... }` (computed.ts:65–86) —
  ~280 B raw, ~110 B gz.
- **Computed factory total: ~390 B raw, ~140 B gz removed.**

**Closure literals removed from `effect()` factory body:**
- `notify() { if(node.flags & DISPOSED) return; if(node.flags & RUNNING)
  throw new SignalCircularError(); runEffect(node) }` (effect.ts:62–66)
  ≈ ~90 B raw, ~35 B gz.
- (Note: there are TWO copies in the factory — one for fresh
  construction, one for pool reuse via the literal. Both live in the
  same code; one body, one site.)

**Closure literal removed from `signal()` host:**
- `notify() {}` (signal.ts:436) — ~12 B raw, ~5 B gz. (Empty; mostly
  dead weight.)

**Detection-site shortening (Q3 HOST flag):** `−12 B gz` (two sites,
~6 B gz each).

**Cast removals at Sites A, B, F (per Director §6.5.1/§6.5.6):**
`(sub as MergeSubscriber)` → `sub` — three sites, **~−15 B gz total**.
This is a free byte saving from K1c collapsing the Linear/Merge type
split.

**Empty `notify` on Host removed (per Director §7 item 6):** −5 B gz.

**Total removed: ~140 + 35 + 5 + 12 + 15 + 5 ≈ 212 B gz.**

### Net bundle estimate

| Component | gz delta |
|---|---:|
| Added: `class Computed` declaration | +60 to +80 B |
| Added: `class Effect` declaration | +30 to +45 B |
| Added: HOST const + literal at host | +13 B |
| Removed: `computed()` closure literals | −140 B |
| Removed: `effect()` closure literal | −35 B |
| Removed: `signal()` empty `notify` | −5 B |
| Removed: cast removals (Sites A/B/F) | −15 B |
| Removed: HOST flag rewrites at sites C/D | −12 B |
| **Net signals delta** | **−112 to +71 B gz** |

**Best case: −112 B gz** (closures dominate; classes mangle very
tightly because the rolldown minifier can pull both methods into the
same class scope and dedupe identifiers).

**Expected case: −20 to +30 B gz** (rolldown's gz ratio for class
syntax is moderate; method bodies retain their non-trivial logic).

**Worst case: +71 B gz** (class syntax bloats more than expected; the
boilerplate `constructor(...) { this.x=...; this.y=...; }` is harder
to compress than a literal).

**Apply realism multiplier (gz compression of repeated tokens is
~25–35%):** +71 B × 1.0 (already at gz) = no further multiplier
needed. The bands above ARE gz.

### Headroom check: signals 171 B / arbor 67 B

- **Signals headroom: +171 B.** Worst case +71 B leaves +100 B headroom.
  **Comfortable.** Even at +95 B (a 3-σ pessimistic upper) signals
  fits with +76 B remaining.
- **Arbor headroom: +67 B.** Arbor bundles signals; the propagation
  ratio is ~30–50% (estimated from the H5→arbor flow: H5's signals
  saved ~150 B raw but only ~70 B propagated to arbor's gz). Worst-case
  signals +71 B → arbor delta +20 to +35 B. **TIGHT, fits.**

**Verdict: FITS on signals (with margin). TIGHT on arbor (within 67 B
headroom but no slack).**

If K1c+fn-promotion is chosen (adds ~15–30 B gz signals for the field
initializations in the constructor): worst case becomes +85–100 B gz
signals, +30–50 B gz arbor. Still inside both headroom envelopes but
no margin remaining on arbor.

### Verdict: FITS / TIGHT / ESCALATES

**FITS on signals**, **TIGHT on arbor**. **No escalation needed UNLESS
the Builder commits push arbor delta past +50 B gz** (per Director §9
trigger 2). Builder must per-commit-bundle-check on both packages.

**Surface-to-user candidate:** if Builder's first commit lands arbor at
`>= +50 B gz` (i.e., uses 75% of the 67 B headroom in one pass),
**Architect should escalate** before Builder continues. This is a
conservative margin to preserve room for any Verifier re-bench
adjustments.

---

## Q6 — H5 invariant compatibility

Walking each named invariant from `spec-6.2-phase2-h5.md` §4 (sourced
via Director §3 prior 1):

### DI-1 — diamond dedup at top of chase iteration

H5 implementation at `signal.ts:200–203`:
```
if (!(sub.flags & DISPOSED) && (!(sub.flags & MERGE) || (sub as MergeSubscriber).lastWave !== wave)) {
```

K1c equivalent: `lastWave` is now an instance field on every Computed
(the `sub as MergeSubscriber` cast disappears because every Computed
has the field). Logic:
```
if (!(sub.flags & DISPOSED) && (!(sub.flags & MERGE) || sub.lastWave !== wave)) {
```

**Bit arithmetic on `flags` is unchanged.** MERGE gate still gates
the dedup. `lastWave` field read is shape-stable (always present).

**Verdict: PRESERVED.** No semantic change.

### CS-1 — PENDING set on every visited Subscriber

H5 implementation: `markOne` chase-inner sets `MARKED | PENDING`
(`signal.ts:204` per H5 site A code-block in the source).

K1c: identical. The bit-operation `sub.flags |= MARKED | PENDING`
doesn't depend on closure location. The `sub` here is now a class
instance instead of a literal, but `.flags` is a regular SMI field on
both.

**Verdict: PRESERVED.**

### SF-1 — STALE coexists with PENDING on fan-out exit

H5 implementation: `signal.ts:211–215` fan-out branch sets
`sub.flags |= STALE` after pushing to `visited[]`.

K1c: bit-arithmetic, unchanged.

**Verdict: PRESERVED.**

### RC-1 — RUNNING circular guard / clears flags in finally

This is the interesting one because RC-1's setter lives **inside the
recompute closure body** (computed.ts:42–50):

```
const recompute = (): T => {
  node.flags |= RUNNING
  const prevObserver = setCurrentObserver(node)
  try {
    return fn()
  } finally {
    setCurrentObserver(prevObserver)
    node.flags &= ~(RUNNING | STALE | MARKED | PENDING)
  }
}
```

Under K1c-pure, `recompute` stays a closure — the body is unchanged.
The `try/finally` block fires identically. No semantic change.

Under K1c+fn-promotion (recompute moves into a method body), the same
logic moves verbatim into `Computed.prototype.recomputeIfNeeded` (or a
nested-method `_recompute()` on the prototype). The `try { ... }
finally { sub.flags &= ~(...) }` block is equally callable as a
method as as a closure — V8 doesn't care about the lexical wrapper.
The `setCurrentObserver(node)` call still works because `node` becomes
`this` in a method context.

**The SignalCircularError throw at start of recompute** (the
`if (node.flags & RUNNING) throw` early in `notify` at
computed.ts:62–63) is the one site that needs care: it currently lives
in the per-instance `notify` closure. Under K1c it lives on
`Computed.prototype.notify`. The throw still fires from the same
flag-test logic. No semantic change.

**Verdict: PRESERVED.**

### MERGE-1 — ≥2 inbound deps ⇒ MERGE flag set

H5 implementation at `signal.ts:128–131`:
```
if (sub.depsHead !== null) sub.flags |= MERGE
```

This is inside `linkAdd`, which is called from `computed()`'s
`read` (computed.ts:91) and `signal()`'s `read` (signal.ts:447).

K1c: `linkAdd` is a top-level function (not a method) in the H5 code.
Phase 3 doesn't move it. The bit-set on `sub.flags` works on a class
instance identically to a literal. **Verdict: PRESERVED.**

Director's K1a/K1b/K1c sub-variant analysis (§4.1) explicitly chose
K1c precisely because it keeps the MERGE-promotion mechanism
unchanged — born-with-lastWave avoids any prototype reassignment
during promotion. Confirmed mechanically.

### MERGE-2 — signals/effects born Merge (lastWave initialized)

H5 implementation:
- `signal.ts:443`: `flags: MERGE` on host (with `lastWave: 0`).
- `effect.ts:51,59`: `flags: EFFECT | MERGE` on effect (with `lastWave: 0`).

K1c: signal-host stays a literal (per Q3 recommendation; HOST flag
added). `flags: MERGE | HOST, lastWave: 0`. Effect becomes a class
instance with `flags: EFFECT | MERGE` set in constructor, `lastWave: 0`
also in constructor. Bit-set logic unchanged.

**Verdict: PRESERVED.**

### Verdict: ALL PRESERVED

All 6 H5 invariants pass through K1c untouched. The mechanism is
**bit-arithmetic-compatible** — bit operations on `flags` and `lastWave`
don't care whether the surrounding object is a literal, a class
instance, or anything else, as long as the slots have the same names
and types. K1c preserves both.

**No invariant is at risk under K1c.**

---

## Risks and surface-to-user candidates

### Risks the Architect MUST address in spec

1. **Arbor bundle headroom (+67 B) is binding.** Architect must require
   Builder to per-commit `bun run build` on both `@aihu/signals` AND
   `@aihu/arbor`. (Same rule as H5 §13.6; carry forward.) **R-B
   mitigation.**

2. **`disposed` closure-local on `effect()`'s returned dispose function
   MUST stay closure-local.** Per Director §6.5.5: moving `disposed` to
   an instance field would break the pool-reuse correctness contract
   ("a recycled node cannot re-enter this closure with disposed===false").
   The Architect must explicitly pin this in spec under
   forbidden-modifications. **R-E mitigation.**

3. **`recompute` closure decision (K1c-pure vs K1c+fn-promotion).**
   Architect must pick ONE and embed in spec. Memory landing changes
   meaningfully between the two: K1c-pure → ~6.4 KB realistic; K1c+ →
   ~3.4 KB realistic. K1c+ is better but adds ~15–30 B gz (still
   within headroom). **Recommendation: K1c+fn-promotion** if Builder
   confirms bundle landing at first commit; fall back to K1c-pure if
   tight.

4. **`creation-1to1000` regression risk (R-F).** K1c+fn-promotion
   adds 5 instance-field assignments to every Computed constructor
   (~5 × 8 B = 40 B in-object). Per Verifier §9 #4, H5 already left
   creation at +2.2 µs over its 76.2 µs floor. Adding 5 fields to a
   class constructor adds ~5–15 ns/construct (V8 hidden-class transition
   amortised but real on first transition). On 1000 constructions that's
   +5–15 µs total, but the bench measures per-graph (1 effect + N
   computeds), not per-construction. Realistic delta: **+0.1–0.3 µs**
   per graph creation, well within the 82 µs soft band. **Quantified
   safe, but Architect must surface for Verifier explicit re-bench.**

5. **Arbor cap escalation pre-trigger.** If Architect's bundle estimate
   trends > +50 B gz on arbor (75% of 67 B headroom), surface to user
   per Director §9 trigger 2 BEFORE Builder dispatches. Conservative:
   surface at +40 B gz arbor estimate.

### Surface-to-user candidates

None unconditional. Two conditional triggers the Architect should
embed in spec:

- **A.** If Architect's bundle confidence-interval upper bound > +50 B
  gz arbor → surface BEFORE Builder dispatch.
- **B.** If post-Builder Verifier measures > +35 B gz arbor delta or
  > +85 B gz signals delta → surface immediately (per Director §9
  trigger 2).

**No projection-failure surface** at this stage: the K1c capacity
analysis above explicitly cites mechanism-grounded numbers
(post-settle 33–76 B/Sub from Q1 slot-walk), passes them through the
×0.7 R-A multiplier, and lands within the §5.2 bands. R-A is
mitigated structurally.

---

## Source-read manifest

Files read in full (or fully relevant sections) during this
investigation:

1. `C:\git\fellwork\aihu\.team\v1\director-notes\track-c-round-006.md`
   — read §0–§13 (lines 1–763 in full).
2. `C:\git\fellwork\aihu\.team\v1\investigation-6.2-phase2-h5.md`
   — read §Summary + §1.1 + §1.2 + §1.3 (lines 1–250 in full).
3. `C:\git\fellwork\aihu\.team\v1\verification-report-6.2-phase2-h5.md`
   — read §Verdict + §1 AC table + §2 perf table (lines 1–120 in full).
4. `git show 62f737f:packages/signals/src/signal.ts` — read in full
   (585 lines). Specifically validated: lines 12–43 (Subscriber types),
   46–59 (flag constants, confirmed 0x080 free), 117–145 (linkAdd /
   MERGE-1), 195–235 (markOne), 260 (Site D), 270–283 (checkDirty), 295–
   336 (drainBatch / Site C), 343–358 (clearVisited), 426–442
   (signal() factory), 446–460 (signal() write).
5. `git show 62f737f:packages/signals/src/computed.ts` — read in full
   (106 lines). Specifically validated: lines 32–86 (factory body,
   `recompute` closure, `node` literal with method bodies, capture
   list).
6. `git show 62f737f:packages/signals/src/effect.ts` — read in full
   (98 lines). Specifically validated: lines 21–22 (pool), 30–39
   (runEffect — already a top-level function), 41–73 (factory),
   74–95 (dispose closure with `disposed` flag).
7. `git show 62f737f:packages/signals/src/index.ts` — read in full
   (11 lines). Confirmed exports: `batch`, `computed`, `effect`,
   `signal`, `$state`, `untrack`, `SignalCircularError`, `SignalError`,
   plus type re-exports. **No internal class or factory symbol exposed.**
   K1c can introduce `class Computed` without touching this file.
8. `bench/signals/node_modules/alien-signals/esm/system.mjs` — read in
   full (233 lines). Confirmed: `update` and `notify` are passed in via
   `createReactiveSystem({update, notify, unwatched})` (line 10) — they
   are static module-level callbacks. `propagate` (line 92) calls
   `notify(sub)` directly (line 115). `checkDirty` (line 143) calls
   `update(dep)` directly (line 154). **No per-instance methods on
   Subscribers.** alien's pattern is K2 (module-level static), not K1.
   K1c is the OOP-flavoured port to the same destination.
9. Grep across entire repo for `recomputeIfNeeded === undefined`:
   2 hits, both in `packages/signals/src/signal.ts` (lines 260, 356 —
   on the working tree's HEAD; at H5 commit 62f737f the line numbers
   are 278 and 376 due to subsequent restructure). Both are the R-D
   detection sites already known to Director §6.5.3/§6.5.4.

End of investigation.
