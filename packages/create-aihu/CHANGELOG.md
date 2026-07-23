# create-aihu

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @aihu/cli@1.0.1

## 0.1.5

### Patch Changes

- Updated dependencies [[`9dd7654`](https://github.com/fellwork/aihu/commit/9dd7654678da1149705e21324f6b30e9baafcd4b), [`dd8cfd6`](https://github.com/fellwork/aihu/commit/dd8cfd639f42ddb05468fe07b6d4f4420a80a8bf), [`80531dc`](https://github.com/fellwork/aihu/commit/80531dcc4dfc43bc9cd399bbb8ab4520efb8f15a)]:
  - @aihu/cli@1.0.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418)]:
  - @aihu/cli@0.8.3

## 0.1.3

### Patch Changes

- Updated dependencies [[`ce3b9a9`](https://github.com/fellwork/aihu/commit/ce3b9a9de72bc2439294df4089d430e8220fc388)]:
  - @aihu/cli@0.8.2

## 0.1.2

### Patch Changes

- [#376](https://github.com/fellwork/aihu/pull/376) [`d48a7ad`](https://github.com/fellwork/aihu/commit/d48a7ad12851ee30b869ee5f8f234038d97c9aff) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix(create-aihu): pin `@aihu/cli` to a caret that tracks this release

  `create-aihu@0.1.1` froze an exact `@aihu/cli@0.7.0` dependency — a stale
  `bun.lock`-resolved pin baked by `bun pm pack` at publish time (the changesets
  Version PR bumps `package.json` but not `bun.lock`). Because the `agent`
  template was added in `cli@0.8.0`, `npx create-aihu@latest --template agent`
  resolved a cli with no agent template and failed. `publish-all.sh` now stamps
  the `@aihu/cli` dependency from the live cli package version (`^x.y.z`) before
  packing, so the delegator always resolves a cli that carries the current
  templates regardless of lock state.

- Updated dependencies [[`d48a7ad`](https://github.com/fellwork/aihu/commit/d48a7ad12851ee30b869ee5f8f234038d97c9aff)]:
  - @aihu/cli@0.8.1

## 0.1.1

### Patch Changes

- Updated dependencies [[`6a0d8e4`](https://github.com/fellwork/aihu/commit/6a0d8e426fa2ab53c37fa5d1d4e6ae63ca671e0d), [`6a0d8e4`](https://github.com/fellwork/aihu/commit/6a0d8e426fa2ab53c37fa5d1d4e6ae63ca671e0d)]:
  - @aihu/cli@0.8.0

## 0.1.0

### Minor Changes

- [#371](https://github.com/fellwork/aihu/pull/371) [`e9ddb91`](https://github.com/fellwork/aihu/commit/e9ddb910422b5f14dbf5f8ecd7e449789f4cf30d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the `create-aihu` entry-point package so `npm create aihu` / `npx create-aihu` / `bun create aihu` resolve on npm (previously 404). Thin delegator to @aihu/cli's scaffolder.
