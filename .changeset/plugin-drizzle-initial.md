---
"@aihu-plugin/drizzle": minor
---

Add `@aihu-plugin/drizzle` — a server-only Drizzle ORM data adapter.

`createDrizzleResource(db, queryFn, options?)` produces a
`(key: string) => Promise<T>` fetcher compatible with `@aihu-plugin/data`'s
`createResource`, and `drizzleLoader(db, queryFn)` produces a `DefinedLoader`
for `@aihu/server`'s `defineLoader` / `defineRoute`. Works with Postgres,
SQLite, and libSQL/Turso handles. `drizzle-orm` and its drivers are OPTIONAL
peer dependencies referenced via `import type` only, so importing the package
never breaks when no Drizzle peer is installed. Ships a no-op registration
shim (`drizzle()` → `Plugin`, `serverOnly: true`) per the Plugin Contract.
