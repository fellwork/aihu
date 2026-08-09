---
'@aihu/templates-cf-team': minor
'@aihu/cli': minor
---

Widen every template's `vite` pin from `^6.0.0` to `^6 || ^8`.

Vite 8 was genuinely unsafe until the OXC strip fix that shipped alongside this:
vite 8 made esbuild an **optional peer** while still *exporting*
`transformWithEsbuild`, the compiler's strip chain tested only that the function
existed, and a **fresh** `^8` install (which has no esbuild at all) therefore
threw inside the strip and — through a swallowing `catch` — handed rolldown
un-stripped TypeScript. Every output mode runs a client build, so `spa`,
`static` and `ssr` all failed. That is fixed at the source rather than pinned
around: `transformWithOxc` is used whenever present, and a failed strip is now
fatal instead of silent. Vite 6 cannot regress — it does not export
`transformWithOxc` at all, so it keeps taking the esbuild branch.

Measured before widening, four **fresh** installs (no lockfile, no
`node_modules` — the defect is invisible on an incremental `bun add vite@8`,
where esbuild survives from the previous resolution), each driven past `build`:

| template | vite 6 | vite 8 |
| --- | --- | --- |
| `minimal` | scaffold/install/typecheck/build/dev/preview all pass | same |
| `ssr` | + the built `_worker.js` imports and answers 200 | same |

Vite 7 is deliberately **not** in the range. No cell of the scaffold matrix has
ever installed it, so listing it would be a compatibility claim with nothing
behind it. `^6 || ^8` names exactly the two majors `ci-ok`'s
`scaffold-consistency` job builds on every PR.

The range now lives in one place — `EXTERNAL_RANGES` in
`scripts/sync-template-versions.ts` — rather than in the four manifests that
each carried their own copy.
