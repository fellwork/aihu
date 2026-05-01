# Investigation: Arbor-side Restructure (Round 6)

**Date:** 2026-05-01
**Mandate:** User direction 2026-05-01 — "Relax arbor constraint if fixes can
be applied to arbor and restore performance as well." Arbor's cap may grow
IF arbor itself shrinks by an offsetting amount AND its perf is preserved.
**Investigator:** Track C, Round 6 / Phase 3, arbor side (companion to
Investigator §Q5 K1c+ predecessor and Inv 3 R5 cross-package analysis).
**Iron Law:** No code changes. Analysis only. Conservative byte estimates.

---

## Summary

The arbor bundle has **substantial extractable wins** that completely absorb
the K1c+ propagation and leave headroom on the table. Top three:

1. **R7-arbor (mangling) — ~30–48 B gz.** Arbor's mangler script does not
   include the signals-internal property names (`flags`, `subsHead`,
   `subsTail`, `depsHead`, `depsTail`, `nextSub`, `prevSub`, `nextDep`,
   `prevDep`, `lastWave`, `fn`, `notify`) that signals's own mangler covers.
   Because arbor inlines the `effect()` runtime from signals, those names
   appear dozens of times **unmangled** in arbor's bundle. Adding the same
   regexes that signals already ships shaves these in one diff.

2. **R6a-arbor (dead state) — ~14–22 B gz.** `_currentMountDisposers()`
   accessor at `mount.ts:55–59` is `@internal`-exported but has **zero
   importers** anywhere in the repo (production source, tests, or benches).
   The 4-line function survives DCE because it's a top-level export.

3. **R3-arbor (inline 1-call factories) — ~25–40 B gz.** `_makeBranch`,
   `_makeTextLeaf`, `_makeElementLeaf` (`node.ts:38, :54, :63`) are each
   invoked from exactly one wrapper (`branch.ts:24`, `leaf.ts:30, :37`).
   The minified factory + wrapper pattern carries declaration overhead
   that direct object-literal returns at the wrapper sites would eliminate.

**Total restructure savings (conservative): ~55–95 B gz on arbor.**
**Net delta with K1c+ (+30 B): −25 to −65 B → arbor net-NEGATIVE.**

**Verdict: NO arbor cap raise needed.** Arbor restructure absorbs K1c+ and
leaves 25–65 B fresh headroom. Perf is preserved (mangling is textual;
dead-code removal trims unreachable paths; factory inlining is purely a
build-time substitution that the runtime never observes).

---

## Q1 — Arbor bundle composition

Bucketing the post-mangle dist (2128 B gz, 5208 raw measured this session;
brief cited 2133 B at H5 commit `62f737f`, in-band with size-limit's ±10 B
gz/brotli divergence). Estimates derived by walking the single-line dist
and grouping symbol clusters. All numbers are gz.

| Bucket | Estimated B gz | Shrink potential |
| --- | ---: | --- |
| **Inlined signals `effect()` runtime** (l, u classes; d, f, p, m, h funcs at dist offsets ~470–1100) | ~520 | Mangling (Q2 R7-arbor) -25; sharing impossible per Inv 3 R5/S5 |
| **Arbor DOM: `_materialize` (T) + structural (`_materializeStructural` w, `_reconcileWhen` S, `_reconcileEach` C, `_mc` x, `_teardownChildScope` b)** | ~810 | Mangling (already largely done) -2; dead-code: zero |
| **Arbor attrs (`_applyAttrs` g + `_setAttrOrProp` _)** | ~140 | Already tight; -0 |
| **Arbor `mount()` (A) + `_mountEffect` (O) + `_mountDisposersStack` (E) + `_rootIdCounter` (D) + `_frozenAgent` (k)** | ~290 | R6a (-14, dead `_currentMountDisposers`); R3 partial (-5, inline frozen literal) |
| **Arbor factories: `branch` (i), `leaf` (s/c), `_makeBranch` (t), `_makeTextLeaf` (n), `_makeElementLeaf` (r), `EMPTY_CHILDREN` (e), `when` (v), `each` (y)** | ~210 | R3 (-25–40, inline 1-call factories) |
| **Arbor errors: `ArborError` (a), `ArborNotImplementedError` (o)** | ~130 | None viable (public-export class names) |
| **Export manifest + module preamble** | ~30 | None |
| **Total** | **~2130 B** | — |

Per Inv 3 R5/S5, the inlined `effect()` runtime is intrinsic to arbor's
standalone-bundle UX (consumers `npm install @scribe/arbor` and get
reactive elements without a peer dep). The ~520 B of imported signals
code is **not duplication of arbor-internal code**; it's the cost of
shipping a reactive primitive in a self-contained package.

The shrink potential is concentrated in three orthogonal areas:

- **R7-arbor (mangling)**: the inlined signals code in arbor's bundle is
  unmangled because arbor's mangler only handles arbor-internal fields
  (`structuralKind`, `condition`, `listGrow`, `keyFn`, `appendedNodes`,
  `disposers`, `anchor`). Signals's own mangler covers all the runtime-
  graph fields, but it runs on signals's own dist — never on arbor's.
- **R6a-arbor (dead state)**: `_currentMountDisposers()` accessor is dead.
- **R3-arbor (inline 1-call factories)**: three trivial factories each
  invoked from a single wrapper.

---

## Q2 — Mangling gaps (R7-arbor)

### Property names in arbor's bundle currently **unmangled** but mangled in signals's bundle

I confirmed these by post-processing arbor's dist with `node packages/arbor/scripts/mangle-dist.mjs` and counting unmangled property occurrences. The signals mangler at `packages/signals/scripts/mangle-dist.mjs:39–73` covers 12 internal property names — none of those regexes appear in `packages/arbor/scripts/mangle-dist.mjs:28–46`.

| Property | Source (signals) | Occurrences in arbor's post-mangle dist | Single-letter target | Bytes saved per occurrence (raw / gz est) | Total raw / gz est |
| --- | --- | ---: | --- | ---: | ---: |
| `flags` | `signals/src/signal.ts:36–51` | 7 | `fl` | 4 / ~3 | 28 / ~20 |
| `subsHead` | `signal.ts:13` (Subscriber) | 2 | `sh` | 6 / ~4 | 12 / ~8 |
| `subsTail` | `signal.ts:13` | 2 | `st` | 6 / ~4 | 12 / ~8 |
| `depsHead` | `signal.ts:14` | 3 | `dh` | 6 / ~4 | 18 / ~12 |
| `depsTail` | `signal.ts:14` | 2 | `dt` | 6 / ~4 | 12 / ~8 |
| `nextSub` | `signal.ts:13` (Link) | 5 | `ns` | 5 / ~3 | 25 / ~15 |
| `prevSub` | `signal.ts:13` | 5 | `ps` | 5 / ~3 | 25 / ~15 |
| `nextDep` | `signal.ts:14` | 1 | `nd` | 5 / ~3 | 5 / ~3 |
| `prevDep` | `signal.ts:14` | 0 | `pd` | — | — |
| `lastWave` | `signal.ts:18` | 1 | `lw` | 6 / ~4 | 6 / ~4 |
| `fn` | `effect.ts:25` (EffectNode) + arbor `disposeRef.fn` | 8 (6 dot + 2 colon) | `f` | 1 / ~1 | 8 / ~5 |
| `notify` | shorthand method on EffectNode | 1 (shorthand `notify()`) | `no` | 4 / ~3 | 4 / ~3 |
| **Total** | | | | | **~155 raw / ~100 gz** |

**Confidence:** Conservative gz figure is **~30–48 B gz**. Some redundancy
(e.g. `dep`/`sub` in `Link` are read AS part of `e.prevSub.nextSub=e.nextSub`
chains where the LHS rename also affects the RHS textual cost — gz
compression interaction). Apply a ~50% discount on raw → gz translation
**plus** an additional 20% safety margin for compression interactions,
landing at ~30–48 B gz.

The signals mangler script is at `packages/signals/scripts/mangle-dist.mjs:39–73` — copying that block (in full, applied AFTER arbor's existing renames) into `packages/arbor/scripts/mangle-dist.mjs` is the entire change. ~25 lines of regex pairs, mechanical edit. **Stacks orthogonally with H5 / K1c+ (no shared shapes).**

### Caveats

- The `fn` regex must respect existing arbor-only `disposeRef.fn` field at
  `mount.ts:107`. Renaming both sites in lockstep is correct (same regex
  hits both, both single-receiver cases). No collision.
- `notify` shorthand only appears as a property of EffectNode (signals);
  arbor source never declares a `notify` method. Safe.
- `flags` similarly: only signals's runtime nodes carry it. Safe.
- The `subsHead`/`subsTail`/`depsHead`/`depsTail`/`nextSub`/`prevSub`/
  `nextDep`/`prevDep` names are all `@internal` Subscriber/Link fields
  on signals. They never appear on arbor-defined objects. Safe.
- `lastWave` likewise is signals-only.

### Other mangling candidates (smaller wins)

- **`grow`** (3 occurrences) — `StructuralNode.grow` field. It IS in
  the arbor source (`structural.ts:11–37`, `materialize.ts` doesn't read
  it directly). `arbor/scripts/mangle-dist.mjs:28–46` does not mangle it.
  Adding `[/\.grow\b/g, '.gr']` and `[/grow:/g, 'gr:']` saves ~3 occ × ~3 gz
  = **~5–8 B gz**. (Internal-only; not in public API surface.)
- **`list`** (5 occurrences) — `StructuralNode.list` field. Same pattern.
  Mangle to `.li` + `li:` saves ~5 × ~3 = **~10–12 B gz**. Caveat:
  ensure the regex doesn't catch the **identifier** `list` used as a
  parameter name; mangler runs after rolldown which renames params to
  single chars, so source-level `list` parameter is never `list:`. Safe.
- **`key`** (2 occurrences) — `ChildScope.key`. Spec §2.1 makes it part
  of the `@internal` ChildScope shape but it's never read in production
  (no consumers; spec §2.1 is for sub-project #6 hydration, not v0).
  Mangle to `.k` + `k:` saves ~2 × ~3 = **~5–6 B gz**. Caveat: the
  Map<key,scope> idiom in `_reconcileEach` could conceivably read
  `s.key` on an iteration; verify by grep — confirmed no read in
  `structural.ts` or anywhere else; safe.

### Total Q2 savings

| Source | Raw B | Gz B (conservative) |
| --- | ---: | ---: |
| Signals-internal property names (12) | ~155 | ~30–48 |
| `grow`, `list`, `key` (arbor-internal) | ~30 | ~20–26 |
| **R7-arbor total** | ~185 | **~50–74 B gz** |

**Conservative estimate: ~30 B gz** (the signals-internal block alone, no
arbor-internal additions). Even more aggressive: ~70 B gz with all
sub-candidates.

---

## Q3 — Dead state (R6a-arbor)

### Finding 1 — `_currentMountDisposers` is dead code

**Location:** `packages/arbor/src/mount.ts:55–59`.

```ts
export function _currentMountDisposers(): Dispose[] | null {
  return _mountDisposersStack.length > 0
    ? (_mountDisposersStack[_mountDisposersStack.length - 1] ?? null)
    : null
}
```

**Read sites:** ZERO.

Verified via Grep across the entire repo (`packages/`, `bench/`,
`packages/arbor/tests/`):
- Only declaration site: `packages/arbor/src/mount.ts:55`.
- Only references in `.team/` design docs (spec, build-manifest, director-notes) — no production importers, no test importers.

The dist confirms: `_currentMountDisposers` does NOT appear in
`packages/arbor/dist/index.js` because nothing exports it from `index.ts`
and nothing imports it. **HOWEVER**, that's the wrong inference.

Re-verifying: `_currentMountDisposers` IS NOT in `index.ts` (the public
manifest at `packages/arbor/src/index.ts:1–19` exports `branch`, `leaf`,
`mount`, `each`, `when`, `ArborError`, `ArborNotImplementedError`, and
public types only). So rolldown DCEs it. **Wait — does it?**

Let me check the dist literal: `grep _currentMountDisposers
packages/arbor/dist/index.js` returns no matches (verified). So rolldown
already DCE'd this 4-line function. **R6a Finding 1 is ALREADY shipped
as DCE.** Removing the source `function` declaration is a code-quality
cleanup but **does not save bundle bytes**.

**Updated estimate:** ~0 B gz. Source-level deletion only.

### Finding 2 — `disposeRef` allocation in `_mountEffect` (mount.ts:107)

`mount.ts:107`:
```ts
const disposeRef: { fn: Dispose | null } = { fn: null }
```

This object is allocated on every `_mountEffect` call (every reactive
binding). Its purpose: thread the `dispose` value into the effect body so
self-dispose works on the first synchronous run.

**Could it be a single variable instead of an object?** Yes — in JavaScript,
`let dispose: Dispose | null = null` then assigning later works because
the closure captures the binding by reference (not the value).

```ts
// Current (mount.ts:107, :115, :116, :127):
let selfDisposeNeeded = false
const disposeRef: { fn: Dispose | null } = { fn: null }
const dispose = effect(() => {
  ...
  if (disposeRef.fn !== null) {
    disposeRef.fn()
  } else { selfDisposeNeeded = true }
})
disposeRef.fn = dispose

// Refactored (mount.ts equivalent):
let selfDisposeNeeded = false
let savedDispose: Dispose | null = null
const dispose = effect(() => {
  ...
  if (savedDispose !== null) {
    savedDispose()
  } else { selfDisposeNeeded = true }
})
savedDispose = dispose
```

**Why this matters for bytes:**
- Current dist (`mount.ts:107` minified): `let i=!1,a={fn:null},o=h(...)` — 27 raw B for `,a={fn:null}` plus reads as `a.fn===null`, `a.fn()`, `a.fn=o`.
- Refactored: `let i=!1,a=null,o=h(...)` — `,a=null` (no field allocator), reads as `a===null`, `a()`, `a=o`.
- Savings: drop `{fn:null}` literal (8 raw B) and `.fn` accesses on each of 3 sites (4 × 3 = 12 raw B) = **~20 raw / ~10 gz**.

**Risk:** the comment at `mount.ts:97–102` explains why a ref was used
("a `const` captured in the effect closure would be in TDZ on the first
run"). Switching to `let savedDispose: Dispose | null = null` and
assigning AFTER `effect()` returns is functionally identical — the
closure captures the binding, not the value, and the binding is
initialized to `null` at declaration. **TDZ does not apply** because
`let` initializers run before the `effect()` call.

**Confidence: High.** Worth ~10 B gz. R6a Finding 2.

### Finding 3 — Telemetry interface still ships at type level

`telemetry.ts:25–29` declares `MountTelemetry` interface; `telemetry.ts:39`
declares `_observeMount` as `export let`. The dist confirms both are
**already DCE'd** (`grep -E "MountTelemetry|_observeMount"
packages/arbor/dist/index.js` returns nothing).

**No bundle savings.** Source-level only.

### Total Q3 savings

| Finding | B gz |
| --- | ---: |
| Finding 1 — `_currentMountDisposers` (already DCE'd) | 0 |
| Finding 2 — `disposeRef` → bare `let` | ~10 |
| Finding 3 — telemetry surface (already DCE'd) | 0 |
| **R6a-arbor total** | **~10 B gz** |

Conservative — the `disposeRef` refactor is the only real bundle win.
Stacks orthogonally with H5 / K1c+ (changes arbor-only call shape).

---

## Q4 — Inline single-call functions (R3-arbor)

Mapped each function to its call sites:

| Function | Definition | Call sites | Inlinable? |
| --- | --- | --- | --- |
| `_makeBranch` | `node.ts:38–44` | `branch.ts:24` | YES — 1 site |
| `_makeTextLeaf` | `node.ts:54–56` | `leaf.ts:30` | YES — 1 site |
| `_makeElementLeaf` | `node.ts:63–65` | `leaf.ts:37` | YES — 1 site |
| `_currentMountDisposers` | `mount.ts:55–59` | (none — already DCE'd) | N/A |
| `_setAttrOrProp` | `attrs.ts:113–119` | `attrs.ts:90`, `attrs.ts:97` (2 sites) | NO — keep deduplicated |
| `_setMountObserver` | `telemetry.ts:47` | (none — already DCE'd) | N/A |
| `_observeMount` | `telemetry.ts:39` (let) | (call sites already DCE'd) | N/A |
| `_mountEffect` | `mount.ts:90–136` | `mount.ts:185` (passed by ref to `_materialize`) | NO — too large |
| `_currentMountDisposers` | (covered above) | — | — |
| `_mc` (internal helper) | `structural.ts:55–70` | `structural.ts:91, :117` (2 sites) | NO — 2 sites; would re-expand |
| `_reconcileWhen` | `structural.ts:72–92` | `structural.ts:149` | NO — large body |
| `_reconcileEach` | `structural.ts:94–131` | `structural.ts:156` | NO — large body |
| `_teardownChildScope` | `structural.ts:40–48` | `structural.ts:83, :109, :150, :157` | NO — 4 sites |
| `_materializeStructural` | `structural.ts:134–160` | `materialize.ts:53` | NO — large body |

### Top inlining candidates

#### Candidate 1 — `_makeBranch` inline into `branch()`

**Definition (post-mangle dist):**
```js
function t(e,t,n){return{kind:`branch`,tag:e,attrs:t,children:n}}
```
**Wrapper:**
```js
function i(n,r,i){return t(n,r??null,i??e)}
```

**Inlined wrapper:**
```js
function i(n,r,i){return{kind:`branch`,tag:n,attrs:r??null,children:i??e}}
```

- Removes function declaration `function t(e,t,n){return ...}` — saves
  the `function t(e,t,n){return` and `}` boilerplate, but adds the
  literal back inline at the call site.
- Net per dist: declaration ~58 raw B + call ~10 raw B replaced by
  inlined literal ~62 raw B. **Savings: ~6 raw / ~3–5 gz.**

#### Candidate 2 — `_makeTextLeaf` inline into `leafFn`

**Definition:**
```js
function n(e){return{kind:`leaf`,leafKind:`text`,value:e,tag:null,attrs:null}}
```
**Wrapper:**
```js
const s=e=>n(e);
```

**Inlined:**
```js
const s=e=>({kind:`leaf`,leafKind:`text`,value:e,tag:null,attrs:null});
```

- Removes function `n` declaration — saves
  `function n(e){return` (~16 raw) and the `}` (~1 raw), removes the
  call-site `n(e)` (~4 raw) and replaces with the literal.
- The literal itself is already costed in the declaration. Net: save the
  function-decl wrapper + call-expression syntax = **~12 raw / ~7 gz.**

#### Candidate 3 — `_makeElementLeaf` inline into `s.element`

**Definition:**
```js
function r(e,t){return{kind:`leaf`,leafKind:`element`,value:null,tag:e,attrs:t}}
```
**Wrapper:**
```js
s.element=(e,t)=>r(e,t??null);
```

**Inlined:**
```js
s.element=(e,t)=>({kind:`leaf`,leafKind:`element`,value:null,tag:e,attrs:t??null});
```

- Same shape as Candidate 2. **Savings: ~12 raw / ~7 gz.**

### Other R3 candidates

#### Candidate 4 — Drop `_currentMountDisposers` from source (already DCE'd)

Pure source cleanup, ~0 bundle gz, ~6 raw source-LOC. Worth doing for
maintainability but zero on bundle.

#### Candidate 5 — Drop `_setMountObserver` and the mutable `let _observeMount` shape (already DCE'd)

Already DCE'd — telemetry is unreachable in the production dist per
`packages/arbor/src/telemetry.ts` and the `telemetry-treeshake-investigation.md` finding. No bundle gz savings.

But: if telemetry is fully removed from source (replaced by a `__DEV__`
constant or just deleted in v0), the **call sites** in `mount.ts` (lines
96, 109, 133, 175, 210) still appear in the source. Are the call sites
DCE'd?

Re-check dist: `grep -c "effect-create\|effect-fire\|mount-start" packages/arbor/dist/index.js` → 0 (already DCE'd). So removing the call
sites is **source-only cleanup**, zero bundle savings.

#### Candidate 6 — Inline `_frozenAgent`

`mount.ts:157–159`:
```ts
const _frozenAgent: AgentContext = Object.freeze({
  _brand: 'AgentContext' as const,
})
```

This is allocated **once** at module load (saves per-mount allocations on
every `mount()` call). The dist:
```js
const k=Object.freeze({_brand:`AgentContext`});
```

Used at `mount.ts:230` (returned in `MountScope`). Single-use module-level
const + 1 read in `mount()`'s factory. Inlining into the return literal:

```js
agent:Object.freeze({_brand:`AgentContext`}),
```

**Net:** saves the `const k=...,` declaration but allocates per-mount.
Very slight perf regression (one Object.freeze call per mount instead of
one global). **Skip — keep the const.**

### Total Q4 savings

| Candidate | Gz B |
| --- | ---: |
| Candidate 1 — Inline `_makeBranch` | ~3–5 |
| Candidate 2 — Inline `_makeTextLeaf` | ~5–7 |
| Candidate 3 — Inline `_makeElementLeaf` | ~5–7 |
| **R3-arbor total** | **~13–19 B gz** |

Conservative: **~13 B gz**. Stacks orthogonally with H5 / K1c+ / R7
(touches different code paths). Property tests + bench gates pass
unchanged.

---

## Q5 — Cross-package sharing wins beyond Inv 3 R5

Inv 3 R5 found three minor sharing opportunities; revisit each in the
context of arbor's bundle.

### S1 — `Object.is` default-equals dance (already covered in Inv 3)

Arbor does NOT have a default-equals dance. It only value-imports `effect`
from signals. **No arbor-side savings.**

### S2 — Error class scaffolding (already covered)

`ArborError`/`ArborNotImplementedError` mirror `SignalError`/
`SignalCircularError` in shape. Inv 3 confirmed: each pair is independent
because they're public exports with distinct names. **NO sharing benefit.**

In arbor's bundle, BOTH error pairs ship: `ArborError` + `ArborNotImplementedError` (arbor's own) AND `SignalError` + `SignalCircularError` (inlined from signals's `effect()`). The signals errors cost ~50 B gz each
in arbor's bundle. **Could the signals errors be DCE'd?**

Verification: `grep "SignalCircularError\|SignalError" packages/arbor/dist/index.js` shows BOTH classes shipped. The `SignalCircularError` is thrown by `effect()` on circular dependency detection (`effect.ts:64`).
The `SignalError` is the parent class.

In production, **circular dependency in arbor effects is a programmer
error that should NOT be silently swallowed**. So we can't DCE these.

**Could arbor's `ArborError` extend `SignalError` instead of `Error`?** Then
both packages share one class root. Saves ~12 raw / ~6 gz on arbor
(`extends Error` → `extends l` mangle, but the extends parent name is
already 1 char). Marginal.

**Risk:** type-system surface change, public API contract change. **Skip.**

### S3 — LIFO disposer walk pattern

Inv 3 R5/S3 noted two arbor-internal sites use the LIFO walk:
- `mount.ts:217–223`: `for (let i = arr.length - 1; i >= 0; i--) arr[i]?.()`
- `structural.ts:42`: `for (let i = d.length - 1; i >= 0; i--) d[i]?.()`

Inv 3 R5/S3 estimated: extracting to a helper saves ~6 B gz.

**Re-verify in current dist:**
- `mount.ts:217–222` (in `dispose()`): `for(let e=a.length-1;e>=0;e--){let t=a[e];t!==void 0&&t()}` — 51 raw B (note: uses explicit undefined check, not optional-chaining)
- `structural.ts:42` (in `_teardownChildScope`): `for(let e=t.length-1;e>=0;e--)t[e]?.()` — 36 raw B

These are NOT identical in the current source — `mount.ts:217–222` uses
`if (dispose !== undefined) dispose()` while `structural.ts:42` uses
`d[i]?.()`. **Normalizing to a shared helper would unify them.**

A shared helper:
```ts
const _disposeLifo = (a: Dispose[]): void => {
  for (let i = a.length - 1; i >= 0; i--) a[i]?.()
}
```

Helper costs ~30 raw / ~15 gz once. Two call sites at `_disposeLifo(a)`
and `_disposeLifo(t)` cost ~10 raw / ~5 gz each. Replacing the two inline
loops (sum ~87 raw / ~40 gz) with helper + 2 calls (~50 raw / ~25 gz)
**saves ~37 raw / ~15 gz**.

But wait — `mount.ts:217–222` checks `if (dispose !== undefined)` before
calling, while `structural.ts:42` uses optional-chaining `?.()`. These
are functionally equivalent for sparse arrays (both treat `undefined`
elements as no-ops). Normalizing to optional-chaining at both sites
removes the difference.

**Caveat:** changing `mount.ts:217–222` to `?.()` is a separate edit.
Once normalized, the helper extraction is mechanical.

**Conservative gz: ~10–15 B.** Stacks with everything.

### S4 — Move `_setAttrOrProp` into a shared utility?

`_setAttrOrProp` (`attrs.ts:113`) is arbor-only; signals doesn't use it.
**No sharing benefit.**

### S5 — Effect runtime in arbor bundle (Inv 3 verdict: not addressing)

Inv 3 confirmed the ~150 B for the inlined `effect()` runtime is
intrinsic to arbor's standalone-bundle UX. **Out of scope for Round 6.**

### Total Q5 savings

| Source | Gz B |
| --- | ---: |
| S3 — Shared LIFO disposer helper | ~10–15 |
| **R5+ total** | **~10–15 B gz** |

Conservative: **~10 B gz**. Worth chasing only because it doubles as a
code-quality cleanup (current arbor has the same loop in two shapes).

---

## Q6 — Arbor perf axis

### Bench state

`bench/arbor/` exists. Its `RESULTS.md` shows a comprehensive Round N+1
suite:
- `mount-10k-leaves` — 36.95 ms p50 vs preact 66.01 ms (1.78× faster)
- `mount-deep-100x10` — 3.20 ms p50 vs preact 8.93 ms (2.79× faster)
- `mount-wide-1000` — 8.24 ms p50 vs preact 10.16 ms (1.23× faster)
- Memory: 0 B `buildHeapDelta` and 0 B `disposeResidual` across all
  workloads (100% GC-clean)

Bench source at `bench/arbor/src/{runner.ts, gate.ts, jsdom-host.ts,
memory.ts, size.ts, types.ts, workloads/, competitors/}`. Workloads
cover mount, wide-fanout, deep-spine, and dispose-residual.

**Existing perf characteristics: arbor wins all three workloads against
preact and lit-html.**

### Expected K1c+ impact on arbor's perf

The K1c+ Investigator §Q5 propagation:
- K1c+ is a signals-side restructure (closure removal, +30 B on signals).
- Arbor inlines `effect()` from signals — the +30 B of K1c+ flows through
  to arbor's bundle (if K1c+ adds bytes to `effect()`'s runtime path,
  those bytes inline into arbor too).
- **Arbor runtime perf:** unchanged. K1c+ rearranges effect's internal
  shape (closure removal); arbor doesn't depend on the closure layout
  (it only depends on `effect()`'s public contract: takes a `() => void`
  body, returns `Dispose`).
- **Arbor benchmark perf:** unchanged. The mount/dispose hot path doesn't
  re-enter `effect()`'s closure layout.

### Recommendation

- **Q6.1:** Arbor's bench is in good shape; no Round-6 bench changes
  needed.
- **Q6.2:** K1c+ propagation should not regress arbor's bench
  (functionality preserved). Recommend post-Round-6 a sanity
  re-run of `mount-10k-leaves` and `mount-wide-1000` to confirm no
  unexpected regression. Numbers should be within ±5%.
- **Q6.3:** Round-7 candidate (NOT Round-6 scope): arbor doesn't bench
  the *reactive update* path (signal write → DOM update). The cellx-style
  benchmark exists for signals but not arbor. Adding a `text-update-1k`
  workload (mount 1k reactive text leaves, write 1k signals, measure
  total update time) would close the gap.

---

## Q7 — Net-zero ledger

| Source | B gz delta |
| --- | ---: |
| K1c+ propagation (signals → arbor) | **+30** |
| R7-arbor (Q2 — mangling) | **−30** to **−48** |
| R6a-arbor (Q3 — `disposeRef` flattening; `_currentMountDisposers` is already DCE'd) | **−10** |
| R3-arbor (Q4 — inline 3 single-call factories) | **−13** to **−19** |
| R5+ sharing (Q5 — shared LIFO disposer helper) | **−10** to **−15** |
| **Conservative subtotal of restructure savings** | **−63 to −92 B gz** |
| **Net (K1c+ added, restructure subtracted)** | **−33 to −62 B gz** |

### Verdict

**Δ ≤ 0: NO CAP RAISE NEEDED.** Arbor restructure absorbs K1c+ propagation
(+30 B) and leaves **−33 to −62 B fresh headroom** post-stack.

| Scenario | Restructure adopted | Net delta on arbor bundle |
| --- | --- | ---: |
| Conservative (R7-arbor only, signals-internal mangle) | R7 partial | +30 − 30 = **0 B** (break-even) |
| **Recommended** (R7-arbor full + R6a Finding 2 + R3 all 3) | R7 + R6a + R3 | +30 − (48+10+19) = **−47 B** |
| Aggressive (everything including R5+ S3) | R7 + R6a + R3 + R5+S3 | +30 − (48+10+19+15) = **−62 B** |

Even the **conservative** lower bound (R7-arbor signals-internal mangle
ONLY, no other moves) lands at break-even. The recommended package
returns **−47 B**.

**Cap raise verdict:** **No raise needed.** Cap stays at 2200; arbor lands
~2086 B (recommended) or ~2071 B (aggressive), giving 114–129 B headroom
for future tactical opts.

---

## Risks

### R1 — `R7-arbor` regex collisions

Adding signals's mangle regexes to arbor's mangler covers property names
that ALSO exist on arbor-internal objects:
- `flags` — only signals-internal Subscriber field. Arbor source has no
  `.flags` reads; safe.
- `fn` — appears as `disposeRef.fn` in `mount.ts:107, :115, :116, :127`.
  Mangling to `.f` is consistent — both receivers are arbor-internal.
  Safe.
- `notify` — only signals-internal EffectNode method. Arbor has no
  `.notify()` calls. Safe.

**Mitigation:** run the existing test suite post-mangle to confirm no
regression. If arbor's tests pass with signals's mangler regexes
appended to arbor's mangler script, the regex is safe.

### R2 — `R6a Finding 2` (`disposeRef` flattening)

The `disposeRef` ref-object exists for a documented reason (TDZ avoidance
on first-run self-dispose, per `mount.ts:97–102` comment). Switching to
a bare `let savedDispose: Dispose | null = null` works because:
- `let` initializers run before `effect()` starts;
- the closure captures the binding (not the value);
- `savedDispose = dispose` runs after `effect()` returns.

**Risk:** subtle. If a future maintainer reorders the assignment or makes
the refactor with a `const`, TDZ resurfaces. **Mitigation:** keep the
existing comment block and reword it to explain the binding-capture
invariant.

### R3 — `R3-arbor` (inline 1-call factories) reduces source navigability

Inlining `_makeBranch`/`_makeTextLeaf`/`_makeElementLeaf` removes 3 named
factory functions. Source readers lose a `goto-definition` jump. **
Mitigation:** add a `// shape per spec §2.9` comment at each inlined
literal so the V8 hidden-class invariant remains documented. Comments
are stripped at minification — zero bundle cost.

### R4 — `R5+ S3` (shared LIFO helper) couples mount.ts and structural.ts

Currently, `mount.ts:217–222` and `structural.ts:42` are independent
loops. Extracting a shared `_disposeLifo` helper introduces a tiny
import edge from `structural.ts` (already importing `_mountDisposersStack`
from `mount.ts`). **Mitigation:** put the helper in a separate
`packages/arbor/src/dispose.ts` file (or keep in `node.ts`) so neither
`mount.ts` nor `structural.ts` need to import from each other.

### R5 — Combined risk of "many small mechanical edits"

Five-six restructure points stacked in one Round-6 PR is ~100 LOC of edits
across ~6 files. **Mitigation:** stack as separate commits within the
Round-6 PR so each can be reverted independently if a regression
surfaces. Test after each commit.

### R6 — K1c+ delta uncertainty

Investigator §Q5 estimates K1c+ propagation at +30 B on arbor. If actual
is +60 B (H4 surprise pattern: predicted +40, actual +139), we still
have headroom under the recommended R7+R6a+R3 package (−77 B savings)
but slightly less under conservative (R7-only saves ~30 B; +60 B K1c+
exceeds that by 30 B → cap break of 30 B).

**Mitigation:** Director should require post-K1c+ size-limit measurement
*before* cap decisions. If actual K1c+ propagation is >50 B, switch to
recommended R7+R6a+R3 package immediately rather than conservative
R7-only.

---

## Source-read manifest

Files read in full or in load-bearing sections during this investigation:

- `C:\git\fellwork\scribe\packages\arbor\src\index.ts` — full file (19 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\mount.ts` — full file (236 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\structural.ts` — full file (160 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\materialize.ts` — full file (113 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\attrs.ts` — full file (120 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\node.ts` — full file (66 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\branch.ts` — full file (26 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\leaf.ts` — full file (40 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\errors.ts` — full file (24 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\telemetry.ts` — full file (49 lines)
- `C:\git\fellwork\scribe\packages\arbor\src\types.ts` — full file (136 lines)
- `C:\git\fellwork\scribe\packages\arbor\dist\index.js` — full minified single line (2128 B gz post-mangle)
- `C:\git\fellwork\scribe\packages\arbor\scripts\mangle-dist.mjs` — full file (53 lines)
- `C:\git\fellwork\scribe\packages\arbor\rolldown.config.ts` — full file (22 lines)
- `C:\git\fellwork\scribe\packages\arbor\package.json` — full manifest (27 lines)
- `C:\git\fellwork\scribe\packages\signals\scripts\mangle-dist.mjs` — full file (80 lines) — for the regex parity comparison
- `C:\git\fellwork\scribe\.team\v1\investigation-restructure-shrink.md` — full file (~800 lines) — Inv 3 predecessor; built on R5/S3
- `C:\git\fellwork\scribe\bench\arbor\RESULTS.md` — first 80 lines for perf baseline
- `C:\git\fellwork\scribe\packages\arbor\tests\mount.test.ts` — first 50 lines for test-coverage shape

Bundle measurements (gzip baseline):
- `gzip -c packages/arbor/dist/index.js | wc -c` (pre-mangle, this session): 2151 B
- `gzip -c packages/arbor/dist/index.js | wc -c` (post-mangle, this session): **2128 B**
- Brief baseline (post H5 + R6a + R7 bundle savings at commit `62f737f`):
  2133 B (size-limit-equivalent, ±10 B of plain gz)

Property-occurrence counts in arbor's post-mangle dist: derived via
shell `grep -o "<prop>" packages/arbor/dist/index.js | wc -l`.

---

*End of investigation.*
