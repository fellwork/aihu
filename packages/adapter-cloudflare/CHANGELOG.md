# @aihu/adapter-cloudflare

## 3.0.1

### Patch Changes

- Updated dependencies [[`0ab1988`](https://github.com/fellwork/aihu/commit/0ab1988b5f546f2050fa3eaea1b0ac1a26a32f96)]:
  - @aihu/app@2.0.1

## 3.0.0

### Patch Changes

- Updated dependencies [[`eaadd45`](https://github.com/fellwork/aihu/commit/eaadd459118055e422e4ae025ceaa72be39ee17c)]:
  - @aihu/app@2.0.0

## 2.0.0

### Patch Changes

- Updated dependencies []:
  - @aihu/app@1.0.0

## 1.0.2

### Patch Changes

- Updated dependencies [[`22234fa`](https://github.com/fellwork/aihu/commit/22234fa1d34e913d84bcdbcc9c2bcf1fb315186b)]:
  - @aihu/app@0.3.2

## 1.0.1

### Patch Changes

- Updated dependencies []:
  - @aihu/app@0.3.1

## 1.0.0

### Patch Changes

- Updated dependencies [[`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4)]:
  - @aihu/app@0.3.0

## 0.1.10

### Patch Changes

- [#215](https://github.com/fellwork/aihu/pull/215) [`c171aab`](https://github.com/fellwork/aihu/commit/c171aab4c1fc1b07b6ad35d7a3198d5bf5465f42) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix SSR mode emitting an unresolvable `_worker.js`. When `cloudflare({ ssr:
true })` ran, the generated worker did `import routes from
'./routes-manifest.js'` but the adapter never wrote that file, so `wrangler
pages dev` failed with `Could not resolve "./routes-manifest.js"` and CI fell
  back to an empty SPA shell (bad for SEO + agents). The adapter now serializes
  `AdapterContext.routes` into a `routes-manifest.js` (default-exporting the
  routes array consumed by `createRequestRouter`) and writes it to `outDir`
  before `_worker.js`, keeping the filename in sync with the handler's import
  specifier. The SSR test now exercises the real handler-source + manifest
  emission (replacing the stub that masked the gap) and asserts the worker's
  import resolves.
- Updated dependencies [[`f2005e2`](https://github.com/fellwork/aihu/commit/f2005e222bc720a8cbc69ed81cfafa0cab8d8ced), [`0628885`](https://github.com/fellwork/aihu/commit/0628885ae3948bf6432a44102f92a00ce60f040b), [`e1a6cfc`](https://github.com/fellwork/aihu/commit/e1a6cfcc9e50688592d580cd515b60c8faa50839)]:
  - @aihu/app@0.2.0

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @aihu/app@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @aihu/app@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @aihu/app@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [[`2aedc11`](https://github.com/fellwork/aihu/commit/2aedc113385896a0c9deefd6bd9e17d0f71fff4b)]:
  - @aihu/app@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [[`f2421b1`](https://github.com/fellwork/aihu/commit/f2421b17a534d518c4f21c22d7f5e47a45c030da)]:
  - @aihu/app@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @aihu/app@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @aihu/app@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`82954a5`](https://github.com/fellwork/aihu/commit/82954a576a3f558133ee9cdb18df233c3b991972)]:
  - @aihu/app@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`4dea3a4`](https://github.com/fellwork/aihu/commit/4dea3a4d98509742553dc654ef023cd6f8189edb)]:
  - @aihu/app@0.1.1
