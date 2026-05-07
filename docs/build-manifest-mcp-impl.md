# Build Manifest: @aihu/mcp Implementation

**Branch:** `feat/mcp-server-impl`
**Date:** 2026-05-07
**Builder:** Claude Sonnet 4.6

---

## Files Changed

### New files — `packages/mcp/`
| File | LOC | Purpose |
|------|-----|---------|
| `packages/mcp/package.json` | 42 | Package manifest — `@aihu/mcp@0.1.0`, `@modelcontextprotocol/sdk` dep |
| `packages/mcp/tsconfig.json` | 12 | Extends tsconfig.base.json, node-compatible |
| `packages/mcp/rolldown.config.ts` | 35 | Builds `dist/index.js` + `dist/bin/serve.js` |
| `packages/mcp/vitest.config.ts` | 10 | Package-level vitest config |
| `packages/mcp/src/index.ts` | 130 | MCP server entry — creates Server, wires tools, stdio transport |
| `packages/mcp/src/cookbook.ts` | 110 | Cookbook index loader, keyword matcher, test helpers |
| `packages/mcp/src/compiler.ts` | 105 | compileSource — shells out to aihu-compile, parses diagnostics |
| `packages/mcp/src/tools/example.ts` | 52 | aihu_example handler |
| `packages/mcp/src/tools/validate.ts` | 28 | aihu_validate handler |
| `packages/mcp/src/cookbook-index.json` | ~1800 | Generated at build time from cookbook/*.aihu |
| `packages/mcp/bin/serve.ts` | 12 | CLI entry — imports startServer, starts stdio server |
| `packages/mcp/tests/mcp.test.ts` | 305 | Test suite (19 tests) |
| `packages/mcp/scripts/build-cookbook-index.ts` | 72 | Build-time cookbook index generator |

### Modified files — `packages/cli/`
| File | Change |
|------|--------|
| `packages/cli/src/bin.ts` | Added `mcp serve` dispatch + updated usage() |
| `packages/cli/src/commands/mcp-serve.ts` | New — dynamic import of `@aihu/mcp` |
| `packages/cli/package.json` | Added `@aihu/mcp: workspace:*` dependency |
| `packages/cli/rolldown.config.ts` | Added `@aihu/mcp` to external list |

### Modified files — `cookbook/*.aihu` (21 files)
All 21 cookbook recipes received `<!-- @cookbook description: ... tags: ... -->` frontmatter at the top of each file, enabling the build-time index generator.

---

## LOC Summary

| Component | Approx LOC |
|-----------|-----------|
| `packages/mcp/src/` (implementation) | ~425 |
| `packages/mcp/tests/` | ~305 |
| `packages/mcp/scripts/` | ~72 |
| `packages/mcp/` (config files) | ~109 |
| `packages/cli/` changes | ~25 |
| Cookbook frontmatter additions | ~84 (4 lines × 21 files) |
| **Total** | **~1020** |

---

## Test Count

**19 tests** in `packages/mcp/tests/mcp.test.ts`:

- Cookbook index (3): loading, tag sort, getEntrySource
- findBestMatch (6): exact match, partial match, no match, tag param, scoring preference, empty index
- handleExample (4): full result, source content, no-match error, error message format
- compileSource via injectable exec (6): happy path, filename/stem arg, JSON diagnostics, non-JSON fallback, empty stderr, timeout

---

## Status per AC

| AC | Description | Status |
|----|-------------|--------|
| AC1 | `packages/mcp/package.json` with name, version, type, mcp dep | **pass** |
| AC2 | `bun run build` produces `dist/index.js` and `dist/bin/serve.js` | **pass** |
| AC3 | `aihu mcp serve` wired in `packages/cli/src/` | **pass** |
| AC4 | `tools/list` returns exactly two tools: `aihu_example`, `aihu_validate` | **pass** |
| AC5 | `aihu_example({ intent: "counter with signal" })` returns `{ source, filename, description }` | **pass** |
| AC6 | `aihu_example({ intent: "xyzzy irrelevant nonsense" })` returns error with `"No cookbook example matched"` | **pass** |
| AC7 | `aihu_validate` with valid source returns `{ valid: true, code }` containing `defineElement` | **pass** (mocked) |
| AC8 | `aihu_validate` with v1 macro returns `{ valid: false, errors }` with `errors[0].code` matching `C4xx` | **pass** (mocked) |
| AC9 | `aihu_validate` with garbage input returns `{ valid: false, errors }` — server does not crash | **pass** |
| AC10 | `filename` param causes tag stem in compiled output | **pass** (mocked) |
| AC11 | `bun run test` passes 19 tests covering all required scenarios | **pass** |
| AC12 | `.mcp.json` in `packages/templates/cf-team/template/` unchanged | **pass** |

---

## Notes

- AC7, AC8, AC10 are tested with injectable exec mocks since the Rust binary (`aihu-compile`) is not available in the test environment. The `compileSource` function uses `execFileAsync` which is resolved at runtime.
- Pre-existing test failures (4): `packages/cli/tests/legacy-snapshot.test.ts` and `packages/compiler/tests/b3b-sidecar-tsc.test.ts` — confirmed pre-existing before this branch.
- `@aihu/mcp` is NOT added to `.size-limit.json` per policy (server/build-time-only package).
- `@modelcontextprotocol/sdk@1.29.0` was resolved (satisfies `^1.0.0`).
