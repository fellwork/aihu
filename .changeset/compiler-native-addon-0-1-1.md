---
"@aihu/compiler": patch
---

Bump the `@aihu/compiler-native-<platform>` napi addon packages `0.1.0` → `0.1.1`
(all five platforms) and repoint `@aihu/compiler`'s `optionalDependencies` at the
new version, so the `@state` wrapper-dialect TDZ codegen fix (#552) actually
reaches consumers.

Without this bump the patch release is a **silent no-op for every downstream
user**. `.github/workflows/release.yml`'s `publish-compiler-napi` job is
idempotent by version:

```bash
existing=$(npm view "${pkg_name}@${pkg_version}" version 2>/dev/null || true)
if [ -n "$existing" ]; then
  echo "${pkg_name}@${pkg_version} already published — skipping"
  continue
fi
```

`@aihu/compiler-native-*@0.1.0` was published 2026-07-23 — *after* the regression
landed — so it carries the buggy codegen, and a `v*` tag push would have printed
"already published — skipping" for all five platforms and shipped nothing. The
addon is the surface that matters: `packages/compiler/js/native.ts` loads it
in-process and `envelope.ts` **prefers it over any locally built binary** unless
`AIHU_COMPILE_BIN` or `AIHU_COMPILER_NATIVE=0` is set, so consumers (and CI jobs
that don't pin those vars) keep getting the broken output even after the Rust fix
lands.

These packages sit outside the workspace glob (`packages/*` does not match
`packages/compiler/npm-native/*`), so Changesets never versions them — only the
`--snapshot canary` lane restamps them, via `scripts/stamp-platform-snapshot.ts`.
Stable releases require this manual bump, exactly like the
`packages/compiler/npm/*` CLI binary packages that `check:compiler-binary-bump`
guards. Note that guard only covers `packages/compiler/npm/`, not
`npm-native/` — which is why this gap was not caught automatically.

Also refreshes `bun.lock`, whose `packages/compiler` manifest mirror still
recorded the pre-#552 CLI platform pins (`0.1.30`) alongside the addon pins.
