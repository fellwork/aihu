# ARCHIVED — Architect A first-pass spec (class-based shape)

**Status:** Superseded. Do not consume.
**Date archived:** 2026-04-26
**Reason:** Written before Team Lead pivoted the framework to functional-components-first with type-safety and concern-separation principles. Kept as a reference for the rewrite — `untrack` design (§1.1), scope-collector mechanism (§2.2), and disposal-order rationale (§1.5) remain valid and should be lifted into the new spec.

---

## What's reusable from this draft

- **`untrack` Phase 3 prep** — implementation, semantics, 3 unit tests, size estimate (~30 B gz). Authorized by Team Lead Call 1; lift verbatim.
- **Scope-collector via `_activeMountDisposers` module-level slot + `_mountEffect`** — Team Lead Call 2A. Mechanism is unchanged regardless of authoring shape; lift verbatim.
- **LIFO disposal order with rationale** — independent of class-vs-functional shape. Lift verbatim.
- **AttrMap detection precedence** (`on*`-fn → `Array.isArray` Signal → primitive) — independent of authoring shape. Lift verbatim.
- **Wide-fanout Phase 2 retro address** (§2.5) — arbor introduces no intermediate `computed`. Lift verbatim.
- **`ArborError` / `ArborNotImplementedError` typed error classes** — independent of shape. Lift verbatim.
- **Size budget 2048 B gz, CI trigger fix, Moon 2.x conventions** — all tooling unchanged. Lift verbatim.

## What needs rework

- **`branch` / `leaf` / `mount` as the authored primitives** — replace with `defineComponent(setup): Component` plus an internal tree layer.
- **`MountScope` exposed as the consumer API** — wrap inside the component runtime; consumers see component lifecycle, not raw mount scope.
- **File layout** — collapse to one-component-per-file (or whatever concern-split the Team Lead settles).
- **§7 Open Questions** — Q1 (peek), Q2 (fanout profiling), Q3 (event listener cleanup) all still apply; add new questions for component-shape edge cases.

---

## Original draft (raw archive — not for builder consumption)

The first-pass spec body covered: branch/leaf/mount/MountScope as the authored API, 16 deviations, 3 open questions. Full text was captured in the agent transcript at `.claude/projects/c--git-fellwork-api/tasks/aeea4ca32c2b6bc4a.output`. If the new spec author needs the full prose for reference, recover it from there.
