---
"@aihu/use": patch
---

Fix `scripts/dep-check.ts` and `packages/use/rolldown.config.ts` so
`@aihu/use`'s allowed-externals check and rolldown `external` option are
subpath-aware instead of exact-string match.

Both compared an import specifier against the allowed-package set with a
plain `Set.has(spec)` / array membership check, so a subpath import like
`@aihu/signals/lifecycle` (a real published subpath, added by #549) failed
the allowed-package test even though `@aihu/signals` itself is permitted.
`scripts/dep-check.ts`'s `checkUseSubpathPurity` would reject the import and
fail `bun run check:deps`; `rolldown.config.ts`'s `external` array wouldn't
externalize it either, so rolldown would silently inline the module into
every consuming entry, inflating that entry's `.size-limit.json` row.

Both now match on the package-name boundary — `spec === pkg ||
spec.startsWith(pkg + '/')` — so a declared package's subpaths pass while an
unrelated package that merely shares a string prefix still does not.
`@aihu/use` remains signals-only by policy: `@aihu/runtime` (and anything
else not explicitly allowed) is still rejected by both checks.

This unblocks the `@aihu/use` Wave work that adopts the new
`@aihu/signals/lifecycle` contract (FEL-390, FEL-392, FEL-393).
