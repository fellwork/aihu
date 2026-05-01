# Arbor Bundle Investigation
**Date:** 2026-05-01
**Investigator:** Agent (Sonnet 4.6)
**Branch:** main HEAD 20d66b7

---

## Bundle composition

| Metric | Value |
|---|---|
| `packages/arbor/dist/index.js` raw | 5,224 B |
| `packages/arbor/dist/index.js` gz (level 9) | 2,154 B |
| `packages/arbor/dist/index.js` gz (size-limit canonical, esbuild) | **2,117 B** |
| Cap | 2,200 B |
| Headroom | **83 B** |

### Signals vs. arbor-native split

Rolldown inlines `@scribe/signals` into the arbor bundle, but **only `effect` and its subscriber-tracking machinery** are inlined — arbor's source only imports `effect` as a runtime value (all other signals imports are type-only and erased). `signal`, `computed`, `batch`, `$state`, and `untrack` are fully tree-shaken.

| Section | Raw bytes | Est. gz (proportional) |
|---|---|---|
| Arbor factories (node/branch/leaf/errors) | 694 B | ~334 B |
| Signals inlined (effect + subscriber tracking only) | 722 B | ~361 B |
| Arbor DOM + reconciler + mount | 3,813 B | ~1,457 B |
| **Total** | **5,229 B** | **~2,154 B** |

The signals standalone bundle (`packages/signals/dist/index.js`) is 4,576 B raw / 1,732 B gz. Only ~722 B raw / ~361 B gz of that enters arbor because `effect` carries far less code than the full signals surface.

---

## Per-module cost estimate

| Module | Lines | Est. gz contribution | Notes |
|---|---|---|---|
| `node.ts` + `branch.ts` + `leaf.ts` + `errors.ts` | 130 | ~334 B gz | All in factories section (bytes 0–689 of dist) |
| `attrs.ts` | 119 | ~276 B gz | `_applyAttrs`, `_setAttrOrProp` |
| `materialize.ts` | 112 | ~260 B gz | Recursive `_materialize` |
| `structural.ts` | 160 | ~372 B gz | `_reconcileWhen`, `_reconcileEach`, `_teardownChildScope` |
| `mount.ts` | 235 | ~546 B gz | `_mountEffect` (with error-boundary disposeRef), `mount()` |
| `telemetry.ts` | 49 | **0 B gz** | Fully tree-shaken (no `Date.now`, no event strings in bundle) |
| `@scribe/signals` (inlined) | — | ~361 B gz | `effect` + subscriber tracking only |
| **Total** | **756 src lines** | **~2,149 B gz** | Joint compression: 2,154 B |

Methodology: raw-byte proportional scaling of individual gz measurements to the joint-compressed total. Source line counts for the DOM section (attrs / materialize / structural / mount). Validated: sum reconciles to within 5 B of measured joint gz.

---

## Cap lineage

| Date | Commit | Arbor cap | Signals cap | Reason |
|---|---|---|---|---|
| 2026-04-24 | `1a4143e` | 2,048 B | 1,024 B | Initial size gate |
| 2026-04-28 | `29fe64d` | 2,048 B | 1,024 B | Arbor Phase 3 (mount/branch/leaf/attrs) — held |
| 2026-04-28–29 | `3cad822` | 2,048 B | 1,600 B | Signals deep-perf wins; signals cap raised |
| 2026-04-30 | `9b829e8` | 2,048 B | 1,700 B | Signals cellx/deep-perf growth; signals cap raised again |
| 2026-04-30 | `8223dbb` | 2,048 B | 1,700 B | Error bounds + Context plan — held |
| 2026-04-30 | `9195d20` | **2,200 B** | 1,850 B | Plan 1.1 reconciler (when/each) + signals cap raised for deepchain |
| 2026-05-01 | `20d66b7` | **2,200 B** | 1,850 B | Tooling fix (no size change) — current |

The arbor cap was raised **once**: from 2,048 B → 2,200 B (+152 B) to absorb the Plan 1.1 reconciler (when/each) implementation. The reconciler contributed all of `structural.ts` (~372 B gz).

---

## Slot cost estimate

Plan 1.4 `slot()` is a new arbor primitive that emits a `<slot>` DOM element:

```
slot(name?: string): Leaf
```

The canonical implementation follows the existing `leaf.element()` pattern — it delegates to `_makeElementLeaf('slot', attrs)`, which is already in the bundle:

```
// Minified form (approximately):
const slot = n => r('slot', n !== void 0 ? { name: n } : null)
// where r = _makeElementLeaf (already present)
```

Marginal gz cost was measured by injecting simulated implementations into the built dist and re-gzipping:

| Implementation approach | Marginal gz (level 9) | Notes |
|---|---|---|
| Leaf-style (delegates to `_makeElementLeaf`) | **+3 B** | Reuses all existing patterns |
| DOM-direct (`document.createElement('slot')`) | +15 B | New call site, slightly less reuse |
| Roadmap budget | ≤ 50 B | Conservative upper bound |
| Conservative canonical estimate (esbuild) | **10–30 B** | esbuild minifies 29 B better than rolldown |

The roadmap states `slot() adds ≤ 50 B gz`. The simulation confirms this is conservative by 2–5×. The leaf-style approach (reusing `_makeElementLeaf`) costs approximately **10–25 B gz** under esbuild canonical measurement.

### Headroom arithmetic

| Scenario | Post-slot canonical gz | Headroom remaining |
|---|---|---|
| Realistic (25 B) | 2,142 B | **58 B** |
| Roadmap worst-case (50 B) | 2,167 B | **33 B** |
| Stretch worst-case (70 B) | 2,187 B | **13 B** |
| Over-cap threshold | — | cap = 2,200 B |

All scenarios stay within the 2,200 B cap.

---

## Reclaim opportunities

### What is already optimized

- **Telemetry**: `_observeMount`, `_setMountObserver`, all event strings (`effect-create`, `effect-fire`, `mount-start`, etc.) and `Date.now()` calls are **fully tree-shaken** — zero bytes in the built dist.
- **Signals tree-shaking**: only `effect` is inlined; `signal`, `computed`, `batch`, `$state`, `untrack` are absent.
- **Error boundary disposeRef**: the `selfDisposeNeeded` pattern is minified to 2 variables and a branch; no overhead from the full source-level indirection.

### Potential savings (with trade-offs)

| Opportunity | Est. savings | Trade-off / Blocker |
|---|---|---|
| Path key strings under `__DEV__` guard | ~49 B gz (measured) | Breaks Plan 3.2 hydration (keys needed for SSR rehydration) |
| Remove `ArborNotImplementedError` export | ~15 B gz (est.) | Breaks public API; needed for `serialize()` stub in Plan 3.2 |
| Replace comment strings `'w'`/`'e'` with `''` | ~5 B gz (est.) | Loses when/each debuggability in DevTools |
| Remove error boundary path in `_mountEffect` | ~30 B gz (est.) | Removes Plan 4.2 feature — already shipped |

**No reclaim is recommended.** The path-key saving (~49 B gz) is the only meaningful option, but it directly conflicts with Plan 3.2 (full hydration) which requires stable path keys in production. The bundle is already lean; the telemetry path is fully tree-shaken.

---

## Recommendation

**PROCEED with Plan 1.4 at the current 2,200 B cap.**

Evidence:

1. **83 B headroom** exists today (2,117 B / 2,200 B cap).
2. `slot()` implemented as a thin wrapper over `_makeElementLeaf` costs **10–30 B gz** under realistic esbuild canonical measurement. Even the conservative roadmap budget of 50 B leaves 33 B to spare.
3. There are no reclaim opportunities that don't trade off planned features or API surface.
4. RAISE_CAP is premature — the current cap absorbs slot() with margin even at the worst-case estimate.
5. RECLAIM_FIRST is wasteful — the only reclaim of consequence (path key guard) conflicts with Plan 3.2 and cannot be done safely.

The Builder for Plan 1.4 should:
- Implement `slot()` as `_makeElementLeaf('slot', name !== undefined ? { name } : null)` — purely delegating to the existing path.
- Verify `bun run size` passes at ≤ 2,200 B after implementation.
- If size exceeds cap (very unlikely): consider whether DOM-direct `document.createElement('slot')` can be avoided by routing through the Leaf materialization path.

---

## Key numbers for Round 5 Director

| Metric | Value |
|---|---|
| Current canonical gz | 2,117 B |
| Cap | 2,200 B |
| Headroom | **83 B** |
| Signals inlined contribution | ~361 B gz (effect only; full signals is NOT inlined) |
| Arbor-native contribution | ~1,792 B gz |
| Largest single module | `mount.ts` (~546 B gz) |
| Second largest | `structural.ts` (~372 B gz) |
| Telemetry overhead | **0 B** (fully tree-shaken) |
| slot() realistic cost | 10–30 B gz |
| slot() roadmap budget | ≤ 50 B gz |
| Post-slot headroom (realistic) | 58 B |
| Post-slot headroom (roadmap worst) | 33 B |
| **Recommendation** | **PROCEED — current cap is sufficient** |
