---
'@aihu/cli': patch
---

Correct the scaffold's `trustedDependencies` — it named the one package that no
longer needs it, and omitted the one that does.

Every scaffold emitted `trustedDependencies: ['@aihu/compiler']`, justified by a
comment stating that `@aihu/compiler`'s postinstall downloads and arch-validates
the native binary. Re-measured against the published tarball, that is no longer
true: `npm view @aihu/compiler@1.2.0 scripts` lists `build`, `build:native`,
`build:wasm`, `typecheck`, `prepublishOnly` and a codemod — **no install script
of any kind**. It was deleted in #370, which replaced the postinstall with
per-platform `optionalDependencies`. The same holds for every published
`@aihu/*` package and every platform artifact under `packages/*/npm/*`: none has
`install`, `preinstall` or `postinstall`.

`esbuild` is what a scaffold actually postinstalls, reached transitively through
vite 6, and it was named only on the pnpm side (`pnpm-workspace.yaml`'s
`allowBuilds`, where it is not optional — pnpm exits 1 with
`ERR_PNPM_IGNORED_BUILDS` before the first build). It is now named on the bun
side too, so the two files agree and the manifest states its own requirement
rather than depending on bun's built-in allow-list — which does currently
contain it (`bun pm default-trusted`, 367 entries, checked), but which is not
visible in the project and not a promise to a reader. Under `vite ^8` there is
no esbuild at all and the entry is simply unused; `^6 || ^8` means one manifest
has to cover both installs.

`@aihu/compiler` is kept as a forward guard, now labelled as one instead of
carrying a false claim: that delivery mechanism has already changed once, and a
blocked script does not fail at install time — it resurfaces much later as
ENOEXEC inside `run build`.

Also verified, because the whole change depends on it: naming packages in
`trustedDependencies` does **not** disable bun's built-in list. A probe project
depending on `esbuild@0.25.12` with `trustedDependencies: ['@aihu/compiler']`
still ran esbuild's script — `bun pm untrusted` reported 0 untrusted, and the
binary resolved.
