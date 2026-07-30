# @aihu/magna

## 0.2.6

### Patch Changes

- [#715](https://github.com/fellwork/aihu/pull/715) [`9bba4bb`](https://github.com/fellwork/aihu/commit/9bba4bbf177bcd266502ab9181e91478f1710704) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix ReDoS-vulnerable regex patterns and a prototype-pollution gap found by CodeQL code scanning.

  - `@aihu/app`: `applyHeadConfig`'s `<meta>`-tag matching no longer uses a
    `\s+[^>]*attr...[^>]*` nested-quantifier regex over the whole `index.html`
    string (catastrophic backtracking on pathological/repetitive input) — it
    now scans tag boundaries with one unambiguous pass, then tests the
    attribute within just that bounded tag.
  - `@aihu/router`: the file-router's segment builder no longer strips a
    route's extension with a `\.[^/]+$/`-anchored regex (same backtracking
    class) — a plain `lastIndexOf`-based split instead.
  - `@aihu/compiler`: `_isLayoutFile`'s trailing-slash trim no longer uses a
    `\/+$/`-anchored regex — measured 45s on a 200k-character pathological
    input before the fix, sub-millisecond after. The state-wrapper codemod
    (`migrate.ts`/`verify.ts`) also now fully escapes identifiers before
    embedding them into `RegExp` constructors (previously escaped only `$`).
  - `@aihu/cli`: the `full` template's scaffolded `server.ts` had the same
    trailing-slash ReDoS shape in a generated string — fixed so scaffolded
    apps don't inherit it.
  - `@aihu/magna`: `setBuildFlag` (a public function accepting an arbitrary
    dot-notation key) now rejects `__proto__`/`constructor`/`prototype`
    segments, closing a prototype-pollution gap in its public contract.

## 0.2.5

### Patch Changes

- Updated dependencies [[`ad6921a`](https://github.com/fellwork/aihu/commit/ad6921a018ef4a479f6540278e549aa9a8cab387)]:
  - @aihu/signals@0.5.0
  - @aihu-plugin/data@2.0.5

## 0.2.4

### Patch Changes

- Updated dependencies [[`18e5f6d`](https://github.com/fellwork/aihu/commit/18e5f6dda93772877690e88e8c217dcdcf4bddc2), [`ea8d2eb`](https://github.com/fellwork/aihu/commit/ea8d2ebb91c28132f399a708e2bd88877072d1db)]:
  - @aihu/signals@0.4.0
  - @aihu-plugin/data@2.0.4

## 0.2.3

### Patch Changes

- Updated dependencies [[`80531dc`](https://github.com/fellwork/aihu/commit/80531dcc4dfc43bc9cd399bbb8ab4520efb8f15a)]:
  - @aihu-plugin/data@2.0.3

## 0.2.2

### Patch Changes

- Updated dependencies [[`b279f74`](https://github.com/fellwork/aihu/commit/b279f74b34cd4e901be1cfa5d70c212cf604dfc1), [`8c80d98`](https://github.com/fellwork/aihu/commit/8c80d9844503c248ecf5fb2c0b3ec5ab06128d5e), [`514336d`](https://github.com/fellwork/aihu/commit/514336da5892c29e9e02d7a6391bb06c62d688c3)]:
  - @aihu/context@0.2.0
  - @aihu/signals@0.3.0
  - @aihu-plugin/data@2.0.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f)]:
  - @aihu/signals@0.2.0
  - @aihu-plugin/data@2.0.1

## 0.2.0

### Minor Changes

- [#241](https://github.com/fellwork/aihu/pull/241) [`ca3431c`](https://github.com/fellwork/aihu/commit/ca3431cd53fe6af284272f1c33ec845014a7baca) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add @aihu/magna greenfield package skeleton: dep-free GraphQL fetch, resource composition over @aihu-plugin/data, JWT relay via getToken config, and a beforeCompile SDL pipeline with graceful skip when magna-gqlmin is absent.

  Add @aihu/auth size-limit row (pre-existing gap fix — v0.1.1 shipped browser code without a budget row).
