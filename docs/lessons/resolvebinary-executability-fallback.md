# resolveBinary must gate on executability, not mere existence — a non-exec stub shadows the dev target/ fallback (EACCES)

**Topic:** css-engine
**Session:** 2026-05-25 (PR #226 — branch chore/refresh-bunlock-v0414)
**Category:** native-binaries, release-engineering, css-engine
**Severity:** high (broke CI: sfc-e2e x5, css-engine-hook x2, style-pack x1 on linux)

## Symptom

`spawn EACCES` (or `execFileSync` `EACCES`) when invoking a per-platform native binary, even though a candidate file at the expected path "exists." Happens in a workspace / partial install but not with a real prebuilt consumer install.

## Root cause

`resolveBinary()` accepted a candidate path on `existsSync()` alone. The R6c design pins `@aihu/css-engine-<platform>` packages as `optionalDependencies`; refreshing `bun.lock` made their **in-source PLACEHOLDER** `aihu-css-compile` (a zero-byte / non-executable stub) resolvable in the workspace. `resolveBinary()` saw it via `existsSync`, returned the stub, and `execFileSync` died with `EACCES` — **never falling through** to the working dev binary in `target/release|debug/`. The present-but-unusable stub *shadowed* the real fallback.

## Fix / recipe

Gate every candidate on **actual usability**, not existence, before returning it; fall THROUGH to the next candidate if it isn't a usable executable:

```ts
function isUsableExecutable(candidate: string): boolean {
  try {
    const st = statSync(candidate);
    if (!st.isFile() || st.size === 0) return false;        // reject empty/dir stubs
    if (process.platform === 'win32') return true;          // Windows: no exec bit; non-empty regular file suffices
    accessSync(candidate, fsConstants.X_OK);                // POSIX: must be executable
    return true;
  } catch {
    return false;
  }
}
```

Resolution order then becomes: platform-package binary **only if `isUsableExecutable`**, else fall through to `target/release/`, then `target/debug/`. Throw the structured "no binary" error **only when BOTH** a real platform exe AND the dev `target/` builds are absent. The real-prebuilt-binary consumer path is unchanged.

## How it bit us

The `bun.lock` refresh for the v0.4.14 release surfaced the placeholder stub; `resolveBinary()` returned it and died with EACCES, breaking 8 css-engine tests on linux CI and contributing to the v0.4.14 release failure. Fixed in `packages/css-engine/src/index.ts` with the `isUsableExecutable` gate; new `tests/resolve-binary.test.ts` (5 tests) proves the zero-byte/non-exec stub is rejected and the `target/` binary is accepted.

## Related

- `css-engine-ci-binary-build.md` — the CI-side requirement to actually build those binaries from source.
- `fresh-worktree-binaries.md` — sibling class of "the binary isn't where/what you think it is."
