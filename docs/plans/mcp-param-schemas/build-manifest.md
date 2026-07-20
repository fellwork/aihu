# DE5 — MCP action tools ship without parameter schemas (#429)

Branch `fix/mcp-param-schemas`. Derive each MCP action tool's `inputSchema`
from the `$action` handler's own signature, replacing the untyped
`{ properties: { args: { type: 'array' } } }` shape.

## Investigation (investigate-first)

### 1. Where `ActionSchema` is defined and where `inputSchema` is emitted

- `ActionSchema` (TS): `packages/agent/src/registry.ts`. Before this change it
  carried only `returns: Record<string, InputSchema>` and `describe?: string` —
  **no parameter information at all**, which is the defect.
- The MCP `inputSchema` is NOT built in the compiler. The compiler emits a
  `registerAgentMetadata({ tag, state, actions })` call (`emit.rs:
  emit_agent_metadata_registration`). `@aihu/agent-server`'s
  `buildToolDefinitions` (`packages/agent-server/src/mcp-server.ts`) is the ONLY
  reader of that registry and is where the literal
  `inputSchema.properties.args = { type: 'array' }` was hardcoded.
- Runtime dispatch (same file, `CallToolRequest` handler): reads
  `input.args ?? []` (a positional array) and forwards it to
  `agentServer.callTool(name, params, ctx)`; the compiled binding is
  `name: (args) => name(args)` (`emit_agent_binding_export`), i.e. **the action
  is always invoked with a single positional-array argument.**

### 2. What the CO1 primitive exposes

`packages/compiler/src/expr/handler_parse.rs` (factored out of CO1's
`prop_write.rs`) already ships the DE5 door: `handler_params(params, is_async)
-> Option<Vec<HandlerParam>>`. `HandlerParam` gives, per parameter:
`name: Option<String>` (`None` for a destructuring pattern), `type_text:
Option<String>` (verbatim TS annotation text, no leading `:`), `optional: bool`
(`x?`), `has_default: bool` (`x = …`), `rest: bool` (`...rest`). No second
parser was written — this is the same parse CO1 rewrites through, so the schema
cannot drift from the code (thesis §2, Derived). `arrow_args` / `arrow_is_async`
/ `running_code` (in `state_macros.rs`, already `pub`) provide the handler's
param string and async-ness from a collection entry.

### 3. TS-type → JSON-Schema mapping table

Implemented in `codegen/mcp_schema.rs::ts_type_to_json_schema`:

| TS annotation | JSON Schema |
|---|---|
| `string` | `{ type: 'string' }` |
| `number` | `{ type: 'number' }` |
| `boolean` | `{ type: 'boolean' }` |
| `object` | `{ type: 'object' }` |
| `string[]` / `Array<string>` / `ReadonlyArray<string>` (and number/boolean) | `{ type: 'array', items: { type: '<prim>' } }` |
| any other `T[]` / `Array<T>` | `{ type: 'array' }` (array known, items degraded) |
| *(no annotation)* | `{}` (permissive) |
| union / literal-union / generic / imported / `Record<…>` / inline object / fn type | `{}` (**degraded — never a guessed shape**) |

## Design decisions / degradations

- **Runtime dispatch preserved.** The schema changes to named properties; the
  action is still invoked positionally. `agent-server` marshals named arguments
  back into declared parameter order (`buildParamOrder` + the `order.map(...)`
  in the call handler). A tool with a derived schema is always marshalled
  positionally; only tools WITHOUT a derived schema read the legacy `args`
  array. Verified end-to-end (a named `{ by: 5 }` call advances the real signal
  by 5).
- **Degradations (all one-directional — degrade, never invent):**
  1. Untyped param → `{}` (nothing to assert).
  2. Union / literal-union / generic / imported / `Record` / inline-object / fn
     type → `{}`. Notably the todo-mvc `'all' | 'active' | 'completed'` filter
     degrades rather than being materialized as an enum.
  3. Non-primitive array element (`Foo[]`) → `{ type: 'array' }` (array kept,
     items dropped).
  4. Rest param (`...rest`) → `{ type: 'array' }`, never `required`.
  5. **Unnameable param** (destructuring pattern, `name: None`) → the whole
     action degrades: `param_schema_json` returns `None`, no `params` is
     emitted, and `agent-server` keeps the legacy `args: { type: 'array' }`
     schema for that tool. No property name is invented.
- **`required`**: a param is required unless optional, defaulted, or rest.

## Files changed

Compiler (Rust):
- `packages/compiler/src/codegen/mcp_schema.rs` — **new**. Type map +
  `param_schema_json`, with the (a)/(b)/(c) unit tests.
- `packages/compiler/src/codegen/mod.rs` — declare `pub mod mcp_schema`.
- `packages/compiler/src/codegen/emit.rs` — `AgentMembers.action_params` field;
  `collect_agent_members` derives the schema via `handler_params` +
  `param_schema_json`; `emit_agent_metadata_registration` threads `params:` into
  each action entry. New `agent_metadata_param_schema_tests` module (end-to-end).

Binary bump (mandatory, this is a Rust change):
- `packages/compiler/npm/{darwin-arm64,darwin-x64,linux-x64-gnu,linux-arm64-gnu,win32-x64-msvc}/package.json`
  — `version` 0.1.9 → 0.1.10 (5 manifests).
- `packages/compiler/package.json` — 5 `@aihu/compiler-*` `optionalDependencies`
  pins 0.1.9 → 0.1.10.

Non-compiler (TS) — necessary to make the derived schema actually ship:
- `packages/agent/src/registry.ts` — new `ActionParamsSchema` interface;
  `ActionSchema.params?`. (Carries the derived schema through the registry.)
- `packages/agent/src/index.ts` — re-export `ActionParamsSchema`.
- `packages/agent-server/src/mcp-server.ts` — `buildToolDefinitions` uses
  `action.params` when present (named properties + `required`), else the legacy
  `args` shape; `buildParamOrder` + call-handler marshalling of named args →
  positional. (This is the emission site; without it the derived schema would
  sit unused and the LLM would still see `args: array`.)
- `packages/agent-server/tests/agent-server.test.ts` — new end-to-end test:
  derived schema surfaces named inputs and marshals them positionally.

Nothing was changed that I was tempted to but surfaced instead: a2a/acp
transports do not build a per-parameter action `inputSchema` (they dispatch via
`handleToolCall` with `params`), so they were left untouched; `packages/mcp`'s
static dev tools are unrelated to component actions.

## Acceptance-test mapping

- **(a)** `(id: string, count: number)` → both required, typed named props:
  `mcp_schema::tests::required_typed_params_emit_named_properties_both_required`
  and end-to-end `agent_metadata_param_schema_tests::typed_required_params_reach_the_registration`.
- **(b)** `(x?: string)` not required:
  `mcp_schema::tests::optional_param_is_not_required` and
  `agent_metadata_param_schema_tests::optional_param_is_present_but_not_required`.
- **(c)** non-mappable degrades, does NOT invent a shape (bidirectional):
  `mcp_schema::tests::non_mappable_types_degrade_and_do_not_invent_a_shape`
  (all degrade to `{}`), `non_mappable_param_type_degrades_within_a_full_signature`,
  and `agent_metadata_param_schema_tests::non_mappable_param_degrades_to_permissive_without_a_shape`
  (asserts the union members are NOT materialized).

## Measured results

- `cargo test -p aihu-compiler`: **858 passed, 0 failed, 1 ignored**.
- `BASE_REF=main bun scripts/check-compiler-binary-bump.ts`: **ok**.
- `bun scripts/check-emit-parses.ts --expect-parse 0 --expect-compile 11`:
  **11 compile / 0 parse — matches baseline**.
- Invariants (all **0 findings**): `check:derived` (0/83 files),
  `check:attributed` (0), `check:governed` (0), `check:dual-audience` (0),
  `check:hydration-adoption` (0).
- TS: `tsc` clean on `@aihu/agent` + `@aihu/agent-server`; vitest
  **158 → 159 tests passing** (added the DE5 marshalling test).
