---
'@aihu/app': patch
'@aihu/router': patch
'@aihu/cli': patch
'@aihu/compiler': patch
'@aihu/magna': patch
---

Fix ReDoS-vulnerable regex patterns and a prototype-pollution gap found by CodeQL code scanning.

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
