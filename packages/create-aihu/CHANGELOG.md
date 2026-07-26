# create-aihu

## 0.1.7

### Patch Changes

- [#603](https://github.com/fellwork/aihu/pull/603) [`37b1403`](https://github.com/fellwork/aihu/commit/37b14030de6111839ea2d509a1c5b23bf1a39517) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `pnpm create aihu` and `yarn create aihu` failing on every template.

  `bin.mjs` resolved the delegate with `createRequire(import.meta.url).resolve('@aihu/cli')`
  — a CJS resolution against a package whose exports map declares only `types`
  and `import`. With no `require` condition, Node's CJS resolver cannot satisfy
  it:

  ```
  Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
    .../create-aihu@0.1.6/node_modules/@aihu/cli/package.json
  ```

  Every pnpm and yarn scaffold hit this, including `--template minimal`. npm and
  bun happened to mask it through hoisting rather than avoid it.

  Switched to `import.meta.resolve()`, which honours the `import` condition. The
  file was already ESM and already used `import.meta.url`, so the native resolver
  was available the whole time.

  Verified minimally against a synthetic ESM-only exports map:
  `require.resolve()` exits 1 with ERR_PACKAGE_PATH_NOT_EXPORTED;
  `import.meta.resolve()` exits 0 and runs the delegate.

- Updated dependencies [[`5720298`](https://github.com/fellwork/aihu/commit/572029884dca3bc381f09936431afcd28ae989f3), [`8aa12dc`](https://github.com/fellwork/aihu/commit/8aa12dc1412125635880b09fe7b8f8a36fb6c7a4), [`2dff3b5`](https://github.com/fellwork/aihu/commit/2dff3b5df8d8cead0e14446e9c4bbbc0cbc9d747), [`c8c1d71`](https://github.com/fellwork/aihu/commit/c8c1d714a9a221708ab6db3399c1e6e13d63f7ab), [`2dff3b5`](https://github.com/fellwork/aihu/commit/2dff3b5df8d8cead0e14446e9c4bbbc0cbc9d747), [`bef4c66`](https://github.com/fellwork/aihu/commit/bef4c66fb59c8d9224d131e158106713cdb0da05), [`3ed4072`](https://github.com/fellwork/aihu/commit/3ed407299c68644cb522d919204b4f4a3f96025e), [`9286182`](https://github.com/fellwork/aihu/commit/9286182f38211a61344d46d9a38ef4821605bf93)]:
  - @aihu/cli@1.1.0

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
