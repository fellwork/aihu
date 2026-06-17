---
"create-aihu": patch
---

fix(create-aihu): pin `@aihu/cli` to a caret that tracks this release

`create-aihu@0.1.1` froze an exact `@aihu/cli@0.7.0` dependency — a stale
`bun.lock`-resolved pin baked by `bun pm pack` at publish time (the changesets
Version PR bumps `package.json` but not `bun.lock`). Because the `agent`
template was added in `cli@0.8.0`, `npx create-aihu@latest --template agent`
resolved a cli with no agent template and failed. `publish-all.sh` now stamps
the `@aihu/cli` dependency from the live cli package version (`^x.y.z`) before
packing, so the delegator always resolves a cli that carries the current
templates regardless of lock state.
