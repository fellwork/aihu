---
"@aihu/cli": patch
---

Fix two scaffold-output bugs surfaced by the e2e harness:

- `rolldown.config.ts`: quote the input key so kebab-case app names (`my-app`)
  don't produce a JS parse error. Was emitting `input: { my-app: 'src/main.ts' }`
  which fails at config load with "Expected , or } but found -".
- `rolldown.config.ts`: import `aihuCompilerPlugin` from `@aihu/compiler` (the
  package's main export) instead of `@aihu/compiler/plugin` — the latter
  subpath doesn't exist in the published `exports` map.

After this release, `bunx @aihu/cli app <name>` followed by `bun install` and
`bun run build` succeeds end-to-end against fresh npm.
