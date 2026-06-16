---
"@aihu/compiler": patch
---

Stop force-packing a publisher-arch native binary into the `@aihu/compiler` npm
tarball. The `bin` target is now a committed ESM shim (`bin/aihu-compile.mjs`)
that resolves the platform `aihu-compile` executable at runtime; the native
binaries ship via per-platform `optionalDependencies`
(`@aihu/compiler-<platform>`), mirroring `@aihu/css-engine`. The published
tarball now contains the JS shim and no native binary. The `postinstall`
download hook is removed in favor of optionalDependency resolution.
