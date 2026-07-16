---
"@aihu/compiler": patch
---

Actually ship the compiled binary. The Rust `aihu-compile` binary is delivered via
the `@aihu/compiler-<platform>` packages, whose version is independent of this JS
glue package. Those platform packages were pinned at `0.1.1`, and `release.yml`
skips any version already on npm — so every Rust fix since `0.1.1` was rebuilt but
never published, and consumers kept loading the stale `0.1.1` binary (published
before any of them).

This bumps all five platform packages to `0.1.2` and repoints the glue's
`optionalDependencies` at `0.1.2`, so the current binary finally installs. That
binary carries **three** fixes that had silently not shipped:

- regex-aware block delimiting (`/\{/`, `/}/`, `//` in HTML/CSS) — 0.10.0
- `$prop` typed as a Signal accessor in the type-check surface — 0.10.0
- the `{a} {b}` whitespace-preservation fix (#400) — 0.10.1

Same failure mode as the earlier "ship spread fix by bumping platform binary
packages" — the platform bump is a manual step that is easy to miss.
