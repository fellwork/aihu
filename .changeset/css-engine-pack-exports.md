---
"@aihu/css-engine": minor
---

Make the two built-in style packs importable both ways. Previously only
`defineStylePack()` was exported (from `.`); the shipped `styles/*.css` bundles
were published as `files` but unreachable through `exports` (a bare
`import '@aihu/css-engine/styles/aihu-default.css'` threw
`ERR_PACKAGE_PATH_NOT_EXPORTED`).

New `exports` entries:

- `./packs` — `aihuDefault` and `aihuGraphite` as `StylePack` objects (the same
  `defineStylePack()` shape external orgs use) plus a `builtinPacks` registry.
  Read `.tokens` / `.dark` or emit `.toCss()`.
- `./styles/aihu-default.css`, `./styles/aihu-graphite.css` (and a `./styles/*`
  glob) — the CSS bundles now resolve through `exports`, so Vite/bundlers inline
  them directly.

The `./packs` objects are the SOURCE OF TRUTH for the `styles/*.css` bundles:
each `.css` file is GENERATED from `pack.toCss()` (`bun run gen:style-packs`,
wired into the package build + `prepublishOnly`), so the JS objects and the CSS
files can never drift. A `style-pack.test.ts` parity test asserts
`pack.toCss()` byte-equals each shipped file.

Build/dev-time-only package — zero browser-bundle impact, no `.size-limit.json`
row (the pure-data `./packs` entry rides on the existing `@aihu/css-engine`
build-dev-only classification).
