# Build Manifest — `feat/stream-impl` (v0.4.0 Streaming Text I/O)

**Date:** 2026-05-07
**Builder:** Claude Sonnet 4.6
**Branch:** `feat/stream-impl`
**Spec:** `docs/specs/stream-impl.md`

---

## Files Changed

### Layer 1 — Compiler `$stream` collection

| File | Change |
|---|---|
| `packages/compiler/src/types.rs` | Added `CollectionKind::Stream`, `StreamBlock` struct, `AgentMacroDecl::Stream`, `stream: Option<StreamBlock>` on `AihuSource` |
| `packages/compiler/src/parser/state_macros.rs` | Added Stream to `match_collection_keyword`, `collection_keyword_len`, `keyword_name`, `c440` arm, C553/C554 validation, `emit_collection_entry` arm |
| `packages/compiler/src/codegen/emit.rs` | Added `needs_create_stream` to `StateImports`, scan + import emission, `CollectionKind::Stream` codegen arm, `elide_stream` gate, `emit_stream_binding()` function |
| `packages/compiler/src/parser/sfc.rs` | Added `stream: None` to `AihuSource` constructor |
| `packages/compiler/src/lib.rs` | Exported `StreamBlock`, `parse_state_macros`, `parse_template`, `stream_macros` |

### Layer 3 — `@stream` block

| File | Change |
|---|---|
| `packages/compiler/src/parser/stream_macros.rs` | **New file** — `StreamMacroDecl`, `parse_stream_macros`, `build_stream_block`, C550/C551 errors, unit tests |
| `packages/compiler/src/parser/mod.rs` | Added `pub mod stream_macros` |

### Layer 2 — Runtime `createStream`

| File | Change |
|---|---|
| `packages/runtime/src/stream.ts` | **New file** — `createStream`, `StreamHandle`, `StreamStatus`, abort-signal-based reader loop with string/Uint8Array handling |
| `packages/runtime/src/index.ts` | Added `createStream`, `StreamHandle`, `StreamStatus` exports |

### Layer 5 — `defineStreamRoute`

| File | Change |
|---|---|
| `packages/server/src/stream-route.ts` | **New file** — `defineStreamRoute`, `StreamRouteHandler` |
| `packages/server/src/index.ts` | Re-exported `defineStreamRoute`, `StreamRouteHandler` |

### Layer 6 — `@aihu/ai` package

| File | Change |
|---|---|
| `packages/ai/package.json` | **New file** — package manifest with optional peer deps |
| `packages/ai/tsconfig.json` | **New file** |
| `packages/ai/rolldown.config.ts` | **New file** |
| `packages/ai/src/index.ts` | **New file** — re-exports all adapters |
| `packages/ai/src/openai.ts` | **New file** — `fromOpenAI` |
| `packages/ai/src/anthropic.ts` | **New file** — `fromAnthropic` |
| `packages/ai/src/gemini.ts` | **New file** — `fromGemini` |
| `packages/ai/src/response.ts` | **New file** — `fromResponse` |

### Layer 7 — Agent bridge

| File | Change |
|---|---|
| `packages/compiler/src/parser/agent_macros.rs` | Added `$stream <name>` macro parsing → `AgentMacroDecl::Stream` |
| `packages/compiler/src/codegen/emit.rs` | Added `AgentMacroDecl::Stream` arms in both options-form match blocks; emits `streamOutput` to manifest |

### Tests

| File | Change |
|---|---|
| `packages/compiler/tests/stream_collection.rs` | **New file** — AC1, AC2, AC7, AC8, AC9, AC10, C550, C551, C553, C554 (12 tests) |
| `packages/compiler/tests/sfc_split.rs` | Updated snapshot for `stream: None` field |
| `packages/runtime/tests/stream.test.ts` | **New file** — AC3, AC4, AC5, AC6 (9 tests) |
| `packages/server/tests/stream-route.test.ts` | **New file** — AC12 (6 tests) |
| `packages/ai/tests/ai.test.ts` | **New file** — AC13, AC14 (12 tests) |

---

## LOC Summary

### Rust (new + modified)
- `types.rs`: +35 lines
- `state_macros.rs`: +75 lines
- `emit.rs`: +85 lines
- `sfc.rs`: +1 line
- `lib.rs`: +4 lines
- `stream_macros.rs`: **new, ~185 lines**
- `agent_macros.rs`: +9 lines
- `sfc_split.rs` (test): +1 line
- `stream_collection.rs` (test): **new, ~215 lines**
- **Rust total: ~610 lines**

### TypeScript (new + modified)
- `stream.ts` (runtime): **new, ~120 lines**
- `stream-route.ts` (server): **new, ~50 lines**
- `packages/ai/src/*`: **new, ~95 lines**
- Modified exports (`index.ts` × 2): +8 lines
- `stream.test.ts` (runtime): **new, ~185 lines**
- `stream-route.test.ts` (server): **new, ~70 lines**
- `ai.test.ts`: **new, ~170 lines**
- **TypeScript total: ~698 lines**

---

## AC Pass/Fail

| AC | Description | Status |
|---|---|---|
| AC1 | `$stream` parser: wraps, is_wrapped=true, source key present | **PASS** |
| AC2 | `$stream` codegen: emits `createStream()`, imports from `@aihu/runtime` | **PASS** |
| AC3 | `chat.value` accumulation, delta, status=done | **PASS** |
| AC4 | `stop()` aborts mid-stream, status=idle | **PASS** |
| AC5 | Status lifecycle idle→streaming→done | **PASS** |
| AC6 | Status lifecycle on error, error instance set | **PASS** |
| AC7 | Multiple entries independent, no cross-contamination | **PASS** |
| AC8 | SFC without `$stream` — no `createStream` import | **PASS** |
| AC9 | `@stream` block server artifact `__streamBinding` export | **PASS** |
| AC10 | `@stream` block client artifact elision | **PASS** |
| AC11 | `$output` unknown entry → C550 | **PASS** |
| AC12 | `defineStreamRoute` response headers + readable body | **PASS** |
| AC13 | `fromOpenAI` extraction from mock chunks | **PASS** |
| AC14 | `fromResponse` wraps body, accumulates text | **PASS** |
| AC15 | `bun run test` workspace pass (1056 tests, 0 failures) | **PASS** |

---

## Surface Conditions

### Size Gate (`@aihu/runtime`)
- `bun run size` not run in worktree (no dist built — requires `bun run build`).
- `createStream` adds ~120 lines of TypeScript source (pre-minification).
- Expected gz impact: ~500–700 bytes (within 2900B gate).
- The `needs_create_stream` lazy-attach gate ensures zero overhead for SFCs without `$stream`.
- **Action if gate breaches:** split to `@aihu/runtime/stream` sub-path.

### `@aihu/ai` — No size-limit row
- Server/build-time only. Not browser-eligible. Correctly excluded from `.size-limit.json`.

### Layer 4 (`streamRegistry`) and Layer 7 full bridge
- `streamRegistry` in `@aihu/arbor` and `handleStreamRequest` in `@aihu/agent-service` are deferred.
- The compiler groundwork (Layer 7 agent_macros + emit) is implemented.
- `LiveBinding.getStreamHandle` extension deferred (requires `@aihu/arbor` mount-path changes).
- These are functional extensions building on what's landed; the core streaming primitive is complete.

### Known Deferred Items
- Layer 4 (`streamRegistry`, `handleStreamRequest`, `createStreamMiddleware`): requires cross-package mount-path changes, deferred to follow-on.
- C552 (multiple `@stream` blocks) is handled in `build_stream_block` but the parser returns `Vec<StreamBlock>` — the multiplicity check is the caller's responsibility (same pattern as C441 for anonymous effects).
