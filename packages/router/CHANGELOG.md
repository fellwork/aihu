# @aihu/router

## 0.1.6

### Patch Changes

- [#218](https://github.com/fellwork/aihu/pull/218) [`41c5e35`](https://github.com/fellwork/aihu/commit/41c5e355a55ca91872ac66ffb7375d1dd20570cc) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Thread per-route `<head>` metadata from the compiler's `.route.json` sidecar
  through to `RouteDefinition` and the generated `virtual:aihu-routes` module
  (B2 of the SEO `<head>` arc).

  Adds and exports a new `RouteHead` type (`title`, `description`, `canonical`,
  `og`, `twitter`, `jsonld`) and an optional `head?: RouteHead` field on
  `RouteDefinition` and the build-time `RouteSidecar`. `head` is added to the
  `SK` sidecar-key allowlist so it survives into `virtual:aihu-routes` — without
  it the key would be silently dropped. Routes with no `head:` stay backward
  compatible (`head` is `undefined`).

  Type-only addition; the runtime/browser bundle size is unchanged. Downstream
  consumers (SSG prerender, client-nav head updater) import `RouteHead` from
  `@aihu/router`.

- Updated dependencies [[`f2005e2`](https://github.com/fellwork/aihu/commit/f2005e222bc720a8cbc69ed81cfafa0cab8d8ced), [`90d3174`](https://github.com/fellwork/aihu/commit/90d3174896ee03cf1756f5b92d125be45d13983f)]:
  - @aihu/server@0.2.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`ec9f59b`](https://github.com/fellwork/aihu/commit/ec9f59b345116576b58f85298501d43d9ac33d61)]:
  - @aihu/server@0.1.4

## 0.1.4

### Patch Changes

- Updated dependencies [[`afead86`](https://github.com/fellwork/aihu/commit/afead86a982ca8df290f2970e3a16f5f003c0c03)]:
  - @aihu/server@0.1.3

## 0.1.3

### Patch Changes

- Updated dependencies [[`ac63d4b`](https://github.com/fellwork/aihu/commit/ac63d4b9a2a5296de8a20b80049e2c5bbc493880)]:
  - @aihu/server@0.1.2

## 0.1.2

### Patch Changes

- [#153](https://github.com/fellwork/aihu/pull/153) [`f2421b1`](https://github.com/fellwork/aihu/commit/f2421b17a534d518c4f21c22d7f5e47a45c030da) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Scaffold install path fixes.

  `@aihu/cli`:

  - `aihu app <name>` now emits `package.json` with `latest` ranges for all `@aihu/*` deps instead of the aspirational `^1.0.0` (no 1.x exists on npm; the old pins broke `bun install` immediately).
  - Adds the missing `@aihu/app` (used by `src/main.ts`) and `@aihu/compiler` (used by `rolldown.config.ts`) to the generated dependency list.
  - Drops the malformed `bun@1` `packageManager` fallback — detects bun via `globalThis.Bun?.version`, omits the field when no real version is detectable.
  - Generates `.vscode/extensions.json` (recommends `fellwork.vscode-aihu`) and `.vscode/settings.json` (file association for `.aihu`) so new adopters get language support out of the box.

  `@aihu/router`, `@aihu/app`:

  - Republish so transitive pins point at clean versions. Previously `@aihu/router@0.1.1` pinned `@aihu/server@0.1.0` (carries the `workspace:*` leak) and `@aihu/app@0.1.4` peer-pinned `@aihu/router@0.1.0` (also leaked). Combined effect: `bun install` of any scaffolded app failed at the workspace-protocol resolution step. Both republish with deps targeting the post-leak versions.
