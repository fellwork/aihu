---
"@aihu/css-engine": patch
---

Make `resolveBinary()` robust to a present-but-unusable per-platform stub.
R6c added `@aihu/css-engine-<platform>` packages as `optionalDependencies`,
and refreshing `bun.lock` made their in-source PLACEHOLDER `aihu-css-compile`
resolvable inside the workspace. The old resolver accepted that candidate on
`existsSync` alone, returned the non-executable placeholder, and then died with
`EACCES` inside `execFileSync` — never reaching the dev `target/` fallback (CI
`check` failures across `sfc-e2e`, `css-engine-hook`, and `style-pack`). The
candidate is now gated on `isUsableExecutable()`: a zero-byte / non-executable
stub is rejected (POSIX `accessSync(_, X_OK)`; on Windows, a non-empty regular
file) so resolution falls THROUGH to the monorepo `target/release|debug/`
binary. The structured "no binary" error is thrown only when BOTH a real
platform executable AND the dev `target/` are absent. The published-consumer
path is unchanged: a real per-platform executable is still used when installed.
