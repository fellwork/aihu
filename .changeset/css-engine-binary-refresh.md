---
"@aihu/css-engine": patch
---

Refresh native platform binaries to 0.1.3. The published `@aihu/css-engine-*`
platform packages were frozen at 0.1.2 and predated the utility PRs #268–#275
(space/grid/border-width families, divide-x/y, position+leading/tracking scales,
ring widths, motion utilities, group:/peer: + aria-/data- variants, container
queries) — consumers resolving the 0.1.2 binary compiled against a stale utility
table. Bumped all four platform packages (`darwin-arm64`, `darwin-x64`,
`linux-x64-gnu`, `win32-x64-msvc`) to 0.1.3 and updated the `optionalDependencies`
pins so the next `v*` release rebuilds and republishes the binaries at current
`main` (the `publish-css-native` job is idempotent and would otherwise skip
0.1.2). No API or CLI change — binary content only.
