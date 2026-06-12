# @aihu-plugin/drizzle

## 0.1.1

### Patch Changes

- Updated dependencies [[`5a94938`](https://github.com/fellwork/aihu/commit/5a949381544afd8276a0f6f5dba10cc4561b1d1a)]:
  - @aihu/server@0.2.1

## 0.1.0

### Minor Changes

- [#208](https://github.com/fellwork/aihu/pull/208) [`f2f9b22`](https://github.com/fellwork/aihu/commit/f2f9b2249c7b8256016e61b4cbc091d87a57980f) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add `@aihu-plugin/drizzle` — a server-only Drizzle ORM data adapter.

  `createDrizzleResource(db, queryFn, options?)` produces a
  `(key: string) => Promise<T>` fetcher compatible with `@aihu-plugin/data`'s
  `createResource`, and `drizzleLoader(db, queryFn)` produces a `DefinedLoader`
  for `@aihu/server`'s `defineLoader` / `defineRoute`. Works with Postgres,
  SQLite, and libSQL/Turso handles. `drizzle-orm` and its drivers are OPTIONAL
  peer dependencies referenced via `import type` only, so importing the package
  never breaks when no Drizzle peer is installed. Ships a no-op registration
  shim (`drizzle()` → `Plugin`, `serverOnly: true`) per the Plugin Contract.

### Patch Changes

- Updated dependencies [[`f2005e2`](https://github.com/fellwork/aihu/commit/f2005e222bc720a8cbc69ed81cfafa0cab8d8ced), [`90d3174`](https://github.com/fellwork/aihu/commit/90d3174896ee03cf1756f5b92d125be45d13983f)]:
  - @aihu/server@0.2.0
