---
'@aihu/compiler': patch
'@aihu/server': patch
'@aihu/mcp': patch
---

Rename the remaining legacy `SCRIBE_*` environment variables and markers to the
`AIHU_*` family (following `SCRIBE_VERSION` → `AIHU_VERSION` in #516). No
deprecated aliases — aihu has no external consumers.

- `SCRIBE_NATIVE_SKIP` → `AIHU_NATIVE_SKIP` (documented SSR native-loader escape
  hatch), plus the internal `SCRIBE_NATIVE_MISSING` / `SCRIBE_NATIVE_LOAD_FAILED`
  diagnostic codes → `AIHU_NATIVE_MISSING` / `AIHU_NATIVE_LOAD_FAILED`.
- `SCRIBE_COMPILE_BIN` → `AIHU_COMPILE_BIN`, **consolidated with** the existing
  `AIHU_COMPILE_BIN` drive-test override into a single variable. The sidecar
  `resolveBinPath()` / `resolveSpawnBinPath()` resolution and the drive/differential
  tests now both read one `AIHU_COMPILE_BIN`.
- `SCRIBE_STATIC_ISLAND` audit marker → `AIHU_STATIC_ISLAND`.
