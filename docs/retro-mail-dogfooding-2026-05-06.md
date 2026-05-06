# Retro: mail SPA dogfooding (aihu defect track)

**Session date**: 2026-05-06
**Repos touched**: `fellwork/aihu` (worktree at `c:\git\fellwork\aihu-b6.4-migration`), `fellwork/mail` (`c:\git\fellwork\mail`)
**Live target**: https://inbox.fellwork.com (current bundle: `index-CYg_chQ3.js`)
**Releases shipped**: `v0.2.3`, `v0.2.4`, `v0.2.5`
**Final state**: GREEN. Round 4 verifier reports 5/5 acceptance PASS across all 9 mail routes. 0 uncaught JS errors live.

## Round summary

| Round | Defect class                                     | Shipped version            | Outcome                                                                 |
|-------|--------------------------------------------------|----------------------------|-------------------------------------------------------------------------|
| 1     | Owner-context / setup-scope                      | `@aihu/app@0.1.1`, `@aihu/compiler@0.1.3` (`v0.2.3`) | "Uncaught Ee: no owner" closed; 4/6 acceptance PASS.                    |
| 2     | Compiler emit correctness (A, B, C)              | `@aihu/app@0.1.2`, `@aihu/compiler@0.1.4` (`v0.2.4`) | TDZ ordering, reactive attr thunks, islands artifact republished. 5/7. |
| 3     | Verifier-only                                    | (none)                     | A/B/C confirmed closed. Defect D surfaced on parameterized routes.      |
| 4     | Compiler/router protocol coordination (D)        | `@aihu/compiler@0.1.5` (`v0.2.5`)              | 5/5 acceptance PASS at live URL.                                        |

## Defects closed

### Defect A — TDZ in compiled setup body
- **What broke**: `Cannot access 'X' before initialization` thrown on island/component mount when an `onMount` registration or function definition referenced a `@state` declared later in source.
- **Why it broke**: compiler was emitting setup-body declarations in source order; `@state` and `@prop` came after the registrations that closed over them.
- **How fixed**: setup body now emits all `state` / bare class-property declarations before function defs and effect/onMount registrations. Bare class-property declarations downgrade `const` → `let` so action and lifecycle reassignments don't throw.
- **Where it lives**: `packages/compiler/src/emit/setup.ts` (declaration ordering pass) and the prop/state lowering in the same module.

### Defect B — reactive attribute bindings emitted as raw values
- **What broke**: attribute bindings that referenced `@state` names rendered the initial value but never updated when state changed.
- **Why it broke**: attribute bindings were emitted as plain values; runtime's `_applyAttrs` only enters its reactive code path (Path 2) when given a single-element thunk array.
- **How fixed**: template attribute bindings referencing `@state` lower to `[() => (expr)]` — a one-element thunk array. Runtime detects the getter and subscribes.
- **Where it lives**: `packages/compiler/src/emit/template.ts` (attribute lowering); runtime path in `packages/runtime/src/dom/attrs.ts` (`_applyAttrs`).

### Defect C — stale `islands` artifact masking Round 1's fix
- **What broke**: Round 1's `viteAihuPlugin({ islands: false })` default was in source but absent from the consumed package; islands path still ran and produced the residual owner errors.
- **Why it broke**: published `dist/` for `@aihu/compiler@0.1.3` was stale relative to source; the `islands: false` default never made it into the tarball.
- **How fixed**: republished as `@aihu/compiler@0.1.4` after a clean build. No source change needed beyond Round 2's other work.
- **Where it lives**: `packages/compiler/src/vite/plugin.ts` (`viteAihuPlugin` default); the actual fix is the build-and-publish.

### Defect D — `$prop` collection-form unconditionally `JSON.parse`s
- **What broke**: `/contact/:id` and `/thread/:id` crashed on mount with `Cannot read properties of undefined (reading 'id')`.
- **Why it broke**: compiler's `$prop` collection form emitted `JSON.parse(getAttribute(name))` for every prop regardless of declared type. Router stamps flat per-attribute params per A4 protocol (raw strings); `JSON.parse("test-id")` falls back to `{}`.
- **How fixed**: `$prop` collection-form now emits primitive-type-aware reads. `string` → `getAttribute(name) ?? ''`. `number` → `Number(...)`. `boolean` → presence check. Complex types still `JSON.parse` with `{}` fallback. Mail authoring migrated from `$prop route: { params: { id: string } }` to `$prop id: { type: string }`.
- **Where it lives**: `packages/compiler/src/emit/props.ts` (`emitPropCollection`); mail consumers `src/pages/contact/[id].aihu` and `src/pages/thread/[id].aihu`.

## What worked methodologically

- **Cross-route chunk shape audit (sentinel-based)** caught Defect C in Round 3 that Round 2's verifier missed. Spot-checking individual chunks for shape consistency — same prelude, same import topology, same sentinel — surfaces drift that route-by-route smoke tests don't.
- **Verifying Builder STATUS reports against artifacts** revealed Round 1's published dist hadn't actually included the source fix. STATUS reports compile pass, source pass, and tests pass; they don't verify the published tarball matches source. Treat those three as orthogonal axes.
- **Director's scope-shift call between Rounds 3 and 4** correctly classified Defect D as a different topic — coordination contract bug between compiler and router, not a compiler-emit-correctness bug. That justified a fresh Builder dispatch instead of folding it into the A/B/C pass.
- **One-Builder-multiple-defects vs one-defect-one-Builder calibration**: A+B+C in one Builder pass converged cleanly because they all touched the compiler's emit layer with overlapping context. D got its own dispatch because it spanned two repos and required a coordination decision (which side adapts: compiler or router?). The heuristic: bundle when context overlaps; split when ownership or contracts cross.

## What we'd do differently next time

- **Verifier briefs should audit cross-cutting properties of compiled output**, not only the targeted fixes. Round 1's brief was scoped to its four fixes; A/B/C slipped past. Round 2 added "spot-check chunks for shape consistency" and caught everything. Make this part of the standard verifier brief template.
- **Verifier briefs must supply concrete values for parameterized routes.** Round 2 used `:id` placeholder URLs and never actually exercised the param-stamping path; Round 3 used `test-id` and immediately surfaced Defect D. Param routes need real test fixtures every round.
- **Republishing to fix a stale CI artifact is a known-good escape hatch but masks the real bug.** The underlying CI question — build cache, rolldown config drift, publish-skipped-stage — is a follow-up worth owning. A post-build assertion that the published `dist/` contains a known-current sentinel from source would catch this class.

## Open follow-ups (surfaced, not claimed)

- **`$prop` declared with primitive type but reassigned in `$action` body still emits `const`**, causing Rolldown to reject `count = 0` in `examples/live-counter.aihu`. The `examples` workflow has `continue-on-error: true` and currently fails on this. Round 2 made bare class-property declarations `let`, but the typed `$prop` form is still `const`. Pre-existing v2 macro issue, **not a regression of Round 4**. PR #108 is open with a fix; out of scope for this session.
- **Phantom "stale dist on first publish" bug from Round 2** deserves a CI sanity check. Candidate: post-build assertion that published `dist/` contains the latest source sentinel (e.g. a hash of a known constant). Cheap to implement; would have caught Defect C before it shipped.
