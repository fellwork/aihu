---
"@aihu/css-engine": patch
---

Fix publishing pipeline so `@aihu/css-engine-<platform>` tarballs ship `aihu-css-compile` with the executable bit set. `actions/download-artifact@v4` does not preserve POSIX mode bits, so the `chmod 0755` performed in `build-css-native` was lost in transit and the `publish-css-native` job published `-rw-r--r--` binaries. Consumers on Bun could not auto-repair this (postinstall scripts are blocked by default for untrusted deps), surfacing as a "binary not found" error from `resolveBinary()`. The next release will be the first to ship correctly-mode'd tarballs across all 4 platforms; existing releases stay broken and require the documented `chmod +x` workaround.
