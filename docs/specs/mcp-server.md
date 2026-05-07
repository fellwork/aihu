# Spec: @aihu/mcp — aihu MCP Server

## Problem

Coding agents working with `.aihu` SFCs today have no machine-readable interface to the compiler or the framework's idiom library. They must guess whether generated source is valid, rely on the build pipeline to surface errors (which requires a full Vite/bun build loop), and have no ergonomic way to retrieve canonical usage patterns. The `@aihu/agent-readiness` package generates static discovery files (`llms.txt`, `mcp-server-card.json`) but provides no runtime MCP tools. The `.mcp.json` already templated in `packages/templates/cf-team/template/` registers `aihu mcp serve` — a command that does not yet exist. Shipping an MCP server with `aihu_example` and `aihu_validate` closes this gap: agents can instantly retrieve idiomatic snippets and get structured compiler diagnostics without spinning up a full build, dramatically improving the agent iteration loop.

## Scope (this spec)

**In scope:**
- New package `packages/mcp/` exposing `@aihu/mcp`
- Tool `aihu_example(intent: string)` — returns a canonical `.aihu` snippet from the cookbook
- Tool `aihu_validate(source: string, filename?: string)` — runs the compiler on a source string and returns structured errors or compiled output
- stdio MCP transport, registered via `aihu mcp serve` subcommand in `@aihu/cli`
- `.mcp.json` registration format (already present in `packages/templates/cf-team/template/`)
- Acceptance criteria for a Builder

**Explicitly out of scope:**
- HTTP/SSE transport (future — serve mode for remote agents)
- Embedding into `@aihu/agent-readiness` (this is a runtime process, not a static generator)
- MCP Resources or Prompts (only Tools in v0)
- Cookbook authoring / curation (parallel builder task)
- WASM compiler distribution (v1 resolution item per `packages/compiler/js/index.ts`)
- Source maps (`transform()` returns `map: null` today)
- Authentication / OAuth (public localhost tool, no auth needed for stdio)

## Package structure

**Recommendation: new package `packages/mcp/`**

Rationale:

1. **`@aihu/agent-readiness` is a build-time/static-generation library**, not a runtime process. It exports pure functions (`generateLlmsTxt`, `generateMcpServerCard`) called during Vite builds or SSR request handling. Adding a persistent stdio server process to that package would violate its zero-runtime-server contract and complicate its bundle-size gate (it is browser-eligible today).

2. **`packages/mcp/` is a build-time-only package** (it runs on the developer's machine, not in the browser). It must NOT add a row to `.size-limit.json` per the policy in `.size-limit.README.md` — server-side and build-time-only packages are excluded from the size gate.

3. **Single responsibility**: `@aihu/mcp` is the MCP server process. It imports `@aihu/compiler` as a runtime dep (to shell out to `aihu-compile`), reads the cookbook directory, and speaks the MCP stdio protocol. None of these responsibilities belong in the static-generation package.

4. **CLI integration**: the `aihu mcp serve` subcommand lives in `@aihu/cli` (`packages/cli/src/commands/`) and simply spawns or imports `@aihu/mcp`'s entry point. The MCP package does not depend on the CLI; the CLI depends on the MCP package.

**MCP SDK version:** Use `@modelcontextprotocol/sdk` v1.x (the official TypeScript SDK). Pin to `^1.0.0`. The SDK provides `Server`, `StdioServerTransport`, and the `CallToolRequestSchema` / `ListToolsRequestSchema` types used in the implementation. It is a `dependencies` entry (not devDependency) in `packages/mcp/package.json` because it is required at runtime.

**Zero-dep constraint:** `@aihu/mcp` must not depend on any browser-runtime packages (`@aihu/signals`, `@aihu/arbor`, `@aihu/runtime`). Its only workspace dep is `@aihu/compiler` (for the binary path resolution) and the MCP SDK.

```
packages/mcp/
  package.json          name: "@aihu/mcp", version: "0.1.0"
  src/
    index.ts            Server entry point (exported for programmatic use)
    tools/
      example.ts        aihu_example tool handler
      validate.ts       aihu_validate tool handler
    cookbook.ts         Cookbook index loader
    compiler.ts         Compiler invocation + error parsing
  bin/
    serve.ts            CLI entry point: `node bin/serve.js` or `bun bin/serve.ts`
  tsconfig.json
  rolldown.config.ts
```

## Tool 1: aihu_example

### Intent

Returns a canonical `.aihu` SFC snippet from the cookbook that best matches a given natural-language intent string. Agents call this when they need an idiomatic starting point (e.g., "counter with signal", "todo list with CRUD", "component with $prop and $lifecycle"). The tool does not generate new code — it retrieves pre-authored, compiler-validated examples.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "intent": {
      "type": "string",
      "description": "Natural-language description of the component pattern sought. Examples: 'counter with signal and action', 'todo list with each and computed', 'component exposing agent surface'."
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional array of keyword tags to narrow the search (e.g., ['$prop', '$lifecycle', 'router'])."
    }
  },
  "required": ["intent"]
}
```

### Implementation

**Recommendation: Option C — build-time index, runtime reads the file.**

Rationale for each option:

- **Option A (filesystem at runtime):** Read `cookbook/` at request time by scanning for `.aihu` files and matching intent against filename + embedded frontmatter. Simple but requires the cookbook directory to be present at the path the MCP server was started from. Works for local dev (the cookbook is in the repo) but breaks when the MCP server is installed globally without the cookbook.

- **Option B (build-time embedded JSON blob):** At publish time, bundle all cookbook examples as a JSON blob embedded in the `dist/` output. The tool returns from the in-memory object — no filesystem reads. Downside: cookbook examples cannot be updated without republishing the package. The cookbook will grow to ~20 files; embedding all source strings adds ~30–50 KB to the bundle (acceptable for a server-side-only package) but means the examples are frozen at publish time.

- **Option C (recommended — build-time index, runtime reads the file):** At build time, generate a `cookbook-index.json` that records each example's filename, description, and keyword tags (sourced from a frontmatter comment block at the top of each `.aihu` file). At runtime, the tool loads this index (bundled into `dist/`), matches intent against tags + description using simple keyword overlap scoring, then reads the winning file from the cookbook directory. Falls back to the embedded source string in the index when the filesystem path is unavailable (global install).

**Keyword matching algorithm:** Tokenize `intent` (lowercase, split on whitespace/punctuation). Score each index entry by counting how many tokens appear in the entry's `tags` array and `description` string. Return the highest-scoring entry. Ties broken by entry order in the index (which should reflect curation priority). This is O(n × m) over ~20 examples × ~10 tokens — negligible cost.

**Cookbook frontmatter format** (embedded comment at top of each `.aihu` file):

```
<!-- @cookbook
description: Minimal counter with signal and increment action
tags: signal, action, counter, minimal, 7guis
-->
```

The build step (`bun scripts/build-cookbook-index.ts`) scans `cookbook/**/*.aihu`, parses the frontmatter block, and writes `packages/mcp/src/cookbook-index.json`.

### Output

```json
{
  "type": "object",
  "properties": {
    "source": {
      "type": "string",
      "description": "Full .aihu SFC source code of the matching example."
    },
    "filename": {
      "type": "string",
      "description": "Basename of the source file (e.g., 'live-counter.aihu')."
    },
    "description": {
      "type": "string",
      "description": "Human-readable description of what this example demonstrates."
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Keyword tags associated with this example."
    }
  },
  "required": ["source", "filename", "description"]
}
```

When no example scores above zero, the tool returns an MCP error with code `NOT_FOUND` and message `"No cookbook example matched intent: <intent>. Available tags: <tag list>"`.

## Tool 2: aihu_validate

### Intent

Compiles a `.aihu` source string using the aihu Rust compiler and returns either the compiled TypeScript output (on success) or a structured array of diagnostics (on error). Agents call this after generating or modifying `.aihu` source to verify correctness before writing to disk or proceeding to build.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "source": {
      "type": "string",
      "description": "Full .aihu SFC source string to compile."
    },
    "filename": {
      "type": "string",
      "description": "Optional virtual filename for the source (used as the component tag stem and in diagnostic messages). Defaults to 'component.aihu'."
    }
  },
  "required": ["source"]
}
```

### Implementation

**Recommendation: Option B — shell out to `aihu-compile --machine-errors`.**

Rationale for each option:

- **Option A (import `transform()` from `@aihu/compiler`):** `transform()` calls `execFileSync` internally — it is synchronous and blocking. More critically, it throws a plain `Error` on compilation failure where `.message` is the raw stderr string from the Rust process. There are no structured fields on the error object. Extracting `{code, line, col}` via regex is fragile and duplicates parsing that the `--machine-errors` flag handles canonically. The LSP spec (`docs/specs/lsp-language-server.md`) explicitly rejected this option for the same reasons.

- **Option B (recommended — shell out to `aihu-compile --machine-errors`):** Spawn the compiler binary directly using `execFile` (async, non-blocking). Pass `--stdin`, `--tag <stem>`, `--path <filename>`, and `--machine-errors`. On success (exit 0), stdout contains the compiled TypeScript. On failure (exit 1), stderr contains a JSON array of diagnostic objects matching the `--machine-errors` schema defined in the LSP spec. The MCP server catches the process error, parses stderr as JSON, and returns the structured array. This is consistent with the LSP server's `compileWithDiagnostics()` pattern.

- **Option C (WASM):** Ruled out — the Rust WASM target does not exist and is a v1 resolution item.

**Invocation pattern** (in `packages/mcp/src/compiler.ts`):

```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename } from 'node:path'

const execFileAsync = promisify(execFile)

// Binary path reuses the same resolution logic as packages/compiler/js/index.ts:
// env var SCRIBE_COMPILE_BIN ?? resolve(dirname(import.meta.url), '../../compiler/bin/aihu-compile[.exe]')
// The MCP package is a sibling of @aihu/compiler in the workspace; in a published
// install, @aihu/compiler is a dependency and the bin is at node_modules/.bin/aihu-compile.

export interface AihuDiagnostic {
  code: string
  message: string
  hint?: string
  fix?: string
  from: { line: number; character: number }
  to: { line: number; character: number }
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export type ValidateResult =
  | { valid: true; code: string }
  | { valid: false; errors: AihuDiagnostic[] }

export async function compileSource(
  source: string,
  filename: string,
): Promise<ValidateResult> {
  const stem = basename(filename, '.aihu')
  try {
    const { stdout } = await execFileAsync(
      binPath,
      ['--stdin', '--tag', stem, '--path', filename, '--machine-errors'],
      { input: source, encoding: 'utf8' },
    )
    return { valid: true, code: stdout }
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? ''
    try {
      const errors: AihuDiagnostic[] = JSON.parse(stderr)
      return { valid: false, errors }
    } catch {
      // Fallback: wrap plain-text error as a single synthetic diagnostic.
      // Remove when --machine-errors is guaranteed on all binary versions.
      return {
        valid: false,
        errors: [
          {
            code: 'UNKNOWN',
            message: stderr.trim() || 'Compilation failed (no stderr)',
            from: { line: 0, character: 0 },
            to: { line: 0, character: 0 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          },
        ],
      }
    }
  }
}
```

**Binary path resolution:** In the workspace, resolve relative to `packages/compiler/bin/aihu-compile[.exe]` (same sibling-package path used by the compiler's own JS wrapper). In a published npm install, resolve via `node_modules/.bin/aihu-compile` (installed by `@aihu/compiler`'s `bin` field). Check `process.env.SCRIBE_COMPILE_BIN` first as an override, matching the existing convention in `packages/compiler/js/index.ts`.

### Output schema

**On success:**

```json
{
  "valid": true,
  "code": "import { defineComponent, defineElement } from '@aihu/runtime'\n..."
}
```

**On error:**

```json
{
  "valid": false,
  "errors": [
    {
      "code": "C440",
      "message": "C440 — old-spec macro form rejected for `$prop`...",
      "hint": "v2 grammar: `$<macro>: { name: { ... }, ... }`",
      "fix": "see docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md",
      "from": { "line": 4, "character": 2 },
      "to":   { "line": 4, "character": 18 },
      "range": {
        "start": { "line": 4, "character": 2 },
        "end":   { "line": 4, "character": 18 }
      }
    }
  ]
}
```

The `AihuDiagnostic` shape is identical to the `--machine-errors` JSON schema defined in `docs/specs/lsp-language-server.md` § "Compiler integration". The MCP server and LSP server share this type definition; it should be extracted to `packages/compiler/js/types.ts` and re-exported from both downstream consumers (tracked as an open question below).

## Server entry point

**Transport:** stdio. The MCP server uses `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`. This is the standard transport for CLI-integrated MCP servers and is what Claude Code, Cursor, and other MCP hosts expect when registering via `.mcp.json`.

**Registration in `.mcp.json`:**

The template at `packages/templates/cf-team/template/.mcp.json` already contains:

```json
{
  "mcpServers": {
    "aihu": {
      "command": "aihu",
      "args": ["mcp", "serve"],
      "cwd": "."
    }
  }
}
```

This is the correct final form. The `aihu mcp serve` subcommand must be added to `@aihu/cli` (`packages/cli/src/commands/`) as a new `serve.ts` file. The command's handler imports and starts `@aihu/mcp`'s stdio server.

**Server initialization** (in `packages/mcp/src/index.ts`):

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  { name: 'aihu', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

// Register tools...
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...] }))
server.setRequestHandler(CallToolRequestSchema, async (request) => { ... })

// Start
const transport = new StdioServerTransport()
await server.connect(transport)
```

**Process lifecycle:** The server process runs until stdin closes (MCP host disconnects). No HTTP port is bound. No background threads. The process inherits the user's `PATH` so `aihu-compile` is resolvable via `node_modules/.bin/`.

**Timeout:** Each `execFileAsync` call to the compiler must have a timeout (recommended: 10 000 ms). If the compiler does not exit within the timeout, return a synthetic error diagnostic with code `TIMEOUT`.

## Acceptance criteria (for the Builder)

1. `packages/mcp/package.json` exists with `name: "@aihu/mcp"`, `version: "0.1.0"`, `type: "module"`, a `bin.serve` entry pointing to `dist/bin/serve.js`, and `@modelcontextprotocol/sdk` as a runtime dependency.

2. `bun run build` in `packages/mcp/` produces `dist/index.js` and `dist/bin/serve.js` without errors.

3. `aihu mcp serve` (via `@aihu/cli`) starts the MCP server process. The process reads from stdin and writes to stdout in MCP stdio framing. It must not exit immediately (it waits for the MCP host to close stdin).

4. Sending a `tools/list` MCP request returns exactly two tools: `aihu_example` and `aihu_validate`, each with a `description` and `inputSchema` matching this spec.

5. `aihu_example` called with `{ intent: "counter with signal" }` returns a result with `source`, `filename`, and `description` fields. `filename` ends in `.aihu`. `source` is a non-empty string containing `@state` or `@template`.

6. `aihu_example` called with `{ intent: "xyzzy irrelevant nonsense" }` returns an MCP error response (not a tool result) with a message containing `"No cookbook example matched"`.

7. `aihu_validate` called with a valid minimal `.aihu` source (e.g., a component with `@state {}` and `@template { <p>hello</p> }`) returns `{ valid: true, code: "..." }` where `code` is a non-empty TypeScript string containing `defineElement`.

8. `aihu_validate` called with a source string containing a v1 macro (`$prop label: String`) returns `{ valid: false, errors: [...] }` where `errors` is a non-empty array and `errors[0].code` matches a `C4xx` pattern.

9. `aihu_validate` called with `{ source: "not valid aihu at all @@@@" }` returns `{ valid: false, errors: [...] }` — it must not crash the MCP server process. The server must continue handling subsequent tool calls after a compiler error.

10. The `aihu_validate` call respects the `filename` parameter: if `filename: "my-widget.aihu"` is provided, the tag stem `my-widget` appears in the compiled output's `defineElement('my-widget', ...)` call.

11. `bun run test` in `packages/mcp/` passes a test suite covering: cookbook index loading, intent keyword matching (exact tag match, partial match, no match), `compileSource` happy path (mocked binary), `compileSource` error path with valid JSON stderr, `compileSource` fallback for non-JSON stderr, and `compileSource` timeout handling.

12. The `.mcp.json` in `packages/templates/cf-team/template/` requires no changes — `aihu mcp serve` is already registered there and the server must answer to that exact invocation.

## Alternatives considered

**Extending `@aihu/agent-readiness`:** The agent-readiness package is a pure static-generation library consumed by Vite builds and SSR handlers. Adding a stdio server process to it would require adding `@modelcontextprotocol/sdk` as a runtime dep, introducing a persistent process model into a package designed for short-lived request handlers, and potentially triggering a size-gate violation (the package is browser-eligible). A dedicated `packages/mcp/` package is the cleaner separation.

**HTTP/SSE transport instead of stdio:** SSE is appropriate for remote/cloud MCP deployments. For a local dev tool invoked by `aihu mcp serve`, stdio is universally supported by MCP hosts (Claude Code, Cursor, VS Code), requires no port allocation, no CORS configuration, and no authentication. HTTP/SSE can be added as a second transport in a future version.

**Embeddings for intent matching in `aihu_example`:** Semantic embedding lookup would give better recall for paraphrased intents. However, it requires either a bundled embedding model (~50–150 MB) or an outbound HTTP call to an embedding API. Both are inappropriate for a local dev tool that must work offline and start instantly. Keyword overlap over ~20 examples is sufficient for v0; the cookbook is small enough that a motivated user can call `aihu_example` with a few different intent strings if the first attempt misses.

**Using `transform()` directly for `aihu_validate`:** See Implementation rationale above. `transform()` is synchronous (blocks the event loop), throws unstructured errors, and does not expose the `--machine-errors` JSON path. The async subprocess approach via `execFileAsync` is the only correct choice.

**Single `@aihu/compiler` package with MCP embedded:** The compiler package's role is to expose `transform()` and the Vite plugin. Adding an MCP server entry point to it would merge two different consumers (build-time plugin integration vs. runtime tool server) and make the package boundary unclear. Separate packages keep the responsibility division explicit.

## Open questions

1. **`AihuDiagnostic` type sharing:** The `--machine-errors` JSON schema is defined in prose in `docs/specs/lsp-language-server.md` and will be re-implemented independently in both `packages/vscode-aihu/` (LSP server) and `packages/mcp/`. Should `AihuDiagnostic` be extracted to `packages/compiler/js/types.ts` and re-exported from `@aihu/compiler`? This would create a single source of truth but adds a runtime type dep for consumers that only need the interface. Team Lead decision needed before the Builder starts.

2. **Cookbook directory location at runtime:** The cookbook will live at `cookbook/` in the repo root (parallel builder task). When `@aihu/mcp` is installed globally (e.g., `bun install -g @aihu/mcp` for use outside the monorepo), the cookbook directory is absent. The fallback (Option C — embed source strings in the index) must be implemented from day one rather than deferred. Confirm with Team Lead that the build step that embeds source strings into `cookbook-index.json` is in scope for the initial Builder task.

3. **`--machine-errors` flag availability:** The flag was added in `feat/agent-dx-compiler-diag` (now merged per the spec instructions). The Builder should verify the flag is present in the binary on the current branch before implementing the fallback-free path. If `--machine-errors` is not yet in the binary, the fallback regex parser (as described in `docs/specs/lsp-language-server.md`) must remain until the Rust change lands.

4. **`aihu mcp serve` CLI subcommand ownership:** The `.mcp.json` template already calls `aihu mcp serve`, but `packages/cli/src/commands/` does not yet have a `serve.ts` (or equivalent) that routes this subcommand to `@aihu/mcp`. This is an implicit dependency of this spec on the CLI package. Clarify whether the Builder for this spec owns the CLI subcommand stub, or whether that is a separate task.

5. **Timeout value for compiler invocation:** The spec recommends 10 000 ms. For very large `.aihu` sources, the Rust binary may take longer. Should the timeout be configurable via an environment variable (`AIHU_MCP_COMPILE_TIMEOUT_MS`)? Recommend yes, to avoid hard-coding a value that may be wrong for slow CI machines.

6. **MCP protocol version:** The `@aihu/agent-readiness` `McpServerCard` uses `protocolVersion: '2025-06-18'`. The `@modelcontextprotocol/sdk` package version pinned should be compatible with this protocol version. The Builder must verify the SDK version supports the `2025-06-18` protocol and document the pinned version in `packages/mcp/package.json`.
