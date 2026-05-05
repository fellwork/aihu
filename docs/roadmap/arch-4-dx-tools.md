# Architecture Spec — DX Tooling, Language Server, Agentic Surface

**Author:** Architect A4 · **Date:** 2026-05-05 · **Scope:** Work-stream 4

## 0. Framing — Two Audiences, One System

**Human developers** need: instant IntelliSense, `aihu dev`, browser DevTools, compiler binary <5s on install. None exist today (only TextMate grammar + 14 snippets).

**AI agents** (Claude/Cursor/Copilot/Zed/MCP-capable) need: machine-queryable surface to learn the framework. Without it, agents working in Aihu projects produce confidently wrong code. With it, single prompts produce working components.

**Critical insight:** both audiences share infrastructure (LSP parses + type-checks; MCP server uses same compilation registry). Deliver both or partial delivery leaves adoption unsolved.

## 1. Pre-Condition Audit

- **`packages/vscode-aihu/`** — TextMate scopes are a published contract (do NOT replace; reuse for fallback)
- **`packages/compiler/js/postinstall.ts`** — Download logic exists for 4 platforms. **TODO-001 is resolved in CI infrastructure** — only gap is no `v*` tag pushed yet. Tag `v1.0.0` and existing workflow runs.
- **Missing platform:** `aarch64-linux` not in postinstall mapper or release matrix — add via `cross` crate
- **`packages/compiler/src/types.rs`** — `CompileError` already carries `line/col/message/code/hint/fix` (exact LSP `PublishDiagnostics` shape)
- **`packages/agent-service/src/agent-service.ts`** — `handleToolCall` stub coordination: agent-host (dev-time MCP) MUST NOT invoke live components — it's build-time tooling, not runtime. Stub coordination NOT triggered by this architecture.
- **`packages/cli/src/bin.ts`** — Zero-dep switch pattern preserved by extending switch directly

## 2. Language Server — `@aihu/language-server`

### 2.1 Approach: Volar-Style Virtual File Generation

Rejected alternatives:
- **Custom LSP from scratch** — would re-implement TS type-checking (100k+ LOC); error quality never reaches TS level
- **tsserver plugin only** — can't surface `.aihu`-specific structural errors, can't cross-block (template ↔ state) type-check, can't go-to-def from `<MyComp>` template references

**Volar pattern:** generate virtual TS/HTML/CSS files from `.aihu` source, feed virtual TS to TypeScript language service, map diagnostics back to original `.aihu` offsets via source maps. Volar's `@volar/language-core` provides the protocol.

### 2.2 Package Layout

```
packages/language-server/
  src/
    server.ts             # stdio LSP entry (bin: aihu-language-server)
    plugin.ts             # AihuLanguagePlugin implementing Volar's LanguagePlugin<T>
    virtual-file.ts       # AihuSource → virtual files generator
    source-map.ts         # offset ↔ virtual offset mapping
    diagnostics.ts        # aihu-specific structural checks
    completions.ts        # macro completion items
    hover.ts              # hover docs (sourced from Macro Vocabulary Spec)
    code-actions.ts       # quick-fixes, refactors
    compiler-bridge.ts    # invokes aihu-compile binary, LRU caches by content hash
```

Deps: `@volar/language-core`, `@volar/language-server`, `vscode-languageserver-protocol`. Build-time/dev-time only (NOT subject to dep-free thesis — never in browser bundle).

### 2.3 Virtual File Generation

For `Counter.aihu` with `@state`/`@template`/`@style`/`@agent` blocks:
- **`Counter.__state__.ts`** — `@state` body with macros lowered: `$prop name: string` → `const name: string = undefined as any`, `$computed doubled = count * 2` → `const doubled = count * 2`, `$action inc() { count++ }` → `function inc() { count++ }`. Type-checking scaffold, not executable.
- **`Counter.__template__.tsx`** — `@template` wrapped in TSX; `{{ expr }}` → `{expr}`, `$if={cond}` → conditional render expr, `$each="items as item"` → `.map()` call. Component refs `<MyComp />` resolved against project component registry.
- **`Counter.__style__.css`** — `@style` body verbatim; delegated to `vscode-css-languageservice`. `$reactive`/`$media`/`$when` macros stripped before CSS service (their values type-check in state virtual file).
- **`Counter.__agent__.ts`** — `@agent` body lowered; `$expose count` checked against state symbol table; agent-specific diagnostics (M3 — see OQ-DX-03)

### 2.4 Compiler Bridge

`compiler-bridge.ts` invokes the `aihu-compile --check` binary via the existing safe-spawn pattern in `packages/compiler/js/index.ts`. LRU cache by SHA-256 of source content (200 entries). Does NOT re-implement parsing — uses binary as parse/check oracle.

### 2.5 v1.1 Capabilities

**M2 (basics):**
- Hover docs for all 39 macros (data sourced from `docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` at build time)
- Macro completion in each block, prop completion in `@template` for registered components
- Diagnostics: `$state` outside `@state`, unknown macro, duplicate block, unclosed block, cross-block reference to undeclared identifier

**M3 (advanced):**
- Go-to-definition from `<MyComp />` to source `.aihu` file
- Find references for component tags + signal names
- Cross-block type checking — `{{ count.toFixed(2) }}` flagged when `count: string`
- Code actions: "Convert to `$computed`", "Extract component", "Add `$describe`", "Wrap in `<$suspense>`"

### 2.6 VS Code Extension Integration

Existing `packages/vscode-aihu/` extension gets `LanguageClient` activation. New `src/extension.ts` uses `vscode-languageclient/node`'s `LanguageClient` with stdio transport pointing at `require.resolve('aihu-language-server')`.

TextMate scopes remain the syntactic fallback (not removed).

### 2.7 Editor Parity

`aihu-language-server` npm binary is the cross-editor delivery mechanism:
- **VS Code:** existing extension activates LSP client (M2)
- **Neovim:** lspconfig snippet at `editors/nvim-lspconfig.lua` (M2)
- **Helix:** `languages.toml` snippet at `editors/helix-languages.toml` (M2)
- **Zed:** dedicated extension at `packages/zed-aihu/` (M3)
- **IntelliJ/WebStorm:** LSP4IJ plugin docs at `editors/intellij-lsp4ij.md`

## 3. CLI Extensions — `@aihu/cli`

All additions extend `bin.ts` switch. ZERO new runtime deps. Each command in `packages/cli/src/commands/{name}.ts`. Bundlers loaded via dynamic `import()` (CLI binary loads instantly regardless).

| Command | Purpose |
|---|---|
| `aihu dev` | Detects bundler from `aihu.config.ts`; spawns `vite` or `rolldown --watch`; passes `--port`/`--host`/`--open` |
| `aihu build` | Same detection; passes through to production build with `--target universal\|client\|server` |
| `aihu deploy` | Reads `config.adapter`; CF → `wrangler deploy`, Vercel → `vercel --prod`; clear error if no adapter |
| `aihu check` | (1) `aihu-language-server --check **/*.aihu`, (2) biome if detected, (3) `bun run size`, (4) agent-readiness `isAgentReady()` |
| `aihu add <plugin>` | Installs `@aihu/<plugin>`, edits `aihu.config.ts` (regex-based, no AST parser, same as `migrate.ts`) |
| `aihu inspect` | Opens browser DevTools page on localhost:4822 |
| `aihu generate <kind>` | Interactive scaffolders for `component`/`page`/`agent`/`plugin`/`composable` via `readline` (zero-dep). `aihu generate agent` writes full `@agent` block + service wiring |
| `aihu mcp serve` | Starts `@aihu/agent-host` MCP server (§6) |

## 4. Pre-Built Compiler Binaries (TODO-001 Resolution)

### 4.1 Current state
**The gap is operational, not architectural.** `release.yml` already cross-compiles 4 targets and uploads to GitHub Releases. `postinstall.ts` already fetches from `releases/latest/download/aihu-compile-{platform}`. **Tag `v1.0.0` and existing workflow runs.**

### 4.2 Missing aarch64-linux
Add `linux/arm64` case to `postinstall.ts` `resolveAsset()` mapping to `aihu-compile-linux-arm64`. Add to release matrix with `cross` crate cross-compilation.

### 4.3 SHA256 verification
`postinstall.ts` has `TODO(v1.x)` for digest verification. Release workflow publishes `{asset}.sha256` sidecars. Postinstall verifies via `crypto.createHash('sha256')` (Node built-in, zero-dep).

### 4.4 npm Platform Packages (deferred to v1.2)
`@aihu/compiler-darwin-arm64` etc. with optionalDependencies pattern (mirror `@aihu/server-{platform}`). Postinstall fallback simpler for v1.1; ship platform packages if install perf becomes an issue.

### 4.5 TTHW Impact
With pre-built binaries on `releases/latest/download` redirect: `npm install @aihu/compiler` → postinstall → ~3-8s. **TTHW_UI ≤5 min achievable: `npm create aihu` + `aihu dev` ≈ 2 min cold.**

### 4.6 WASM Build for Homepage Playground (NEW — per `_user-directives.md` Directive 1)
The homepage interactive playground (arch-1 M1) needs `aihu-compile` running in-browser. Add to release workflow:
- WASM target via `wasm-bindgen`: `aihu-compile.wasm` artifact published alongside platform binaries
- Loadable from CDN or bundled into `apps/docs/public/`
- Compile latency target: <200ms for 50-line `.aihu` source
- Bundle: WASM lazy-loaded; first-visit overhead <1MB total

This is M1 priority alongside pre-built binaries (NOT deferred to M3) — it's the gating dependency for the flagship "flex" deliverable.

## 5. Browser DevTools — `aihu inspect`

### 5.1 Approach: Built-in inspector page (NOT a browser extension)
Browser extensions require store review, per-browser maintenance, MV3 migration. The inspector runs as a page served by `aihu inspect` at `localhost:4822` and injected into the dev server as `/__aihu/devtools` when `NODE_ENV=development`.

### 5.2 Data Source
Dev server exposes WebSocket at `ws://localhost:PORT/__aihu/ws` streaming structured events:
- `component:register` (when `registerAgentMetadata` fires) → `AgentMetadata`
- `signal:update` (signal `set` calls) → `{ tag, name, value }`
- `effect:run` → `{ tag, name, deps }`
- `resource:fetch` → `{ tag, name, status }`

Events emitted by injecting `dev-bridge.ts` module into every `.aihu` component in dev builds (Vite plugin in `packages/compiler/js/index.ts` alongside HMR instrumentation; `__DEV__` guard for production tree-shake).

### 5.3 Inspector Panels
- **Component Tree** — hierarchical custom elements list with `AgentMetadata.description`, current signal values, agent-readiness badge
- **Signal Graph** — directed graph of signal → computed → effect (vanilla SVG force-directed, no D3 dep)
- **Agent Registry** — live `getAllAgentMetadata()` with "Test Call" button POST-ing to `/__aihu/tools/call`. Returns `{ stub: true }` until arch-3 live-binding lands; inspector shows the stub clearly.
- **Network** — intercepts `createResource` fetches; shows URL, status, time, payload size

### 5.4 Package
`packages/devtools/` (build-time only): `panel.html` (single-file inline CSS+JS), `ws-client.ts`, panel implementations, `vite-plugin.ts` injecting `/__aihu/devtools` route + WS endpoint.

`viteDevtoolsPlugin()` added to Vite config generated by `aihu dev`.

## 6. Agentic Surface — `@aihu/agent-host`

### 6.1 Architecture: Standalone MCP Server Package
Ships as separate `packages/agent-host/` with bin `aihu mcp serve`. NOT bundled into:
- `@aihu/agent-service` (runtime package, 600B size budget)
- `@aihu/cli` (zero-dep at runtime)

`@aihu/agent-host` depends on `@aihu/agent` (registry), `@aihu/compiler` (validation), `@aihu/language-server` (type-checking). Does NOT depend on `@aihu/agent-service` — the host is dev-time MCP that helps agents WRITE Aihu code; agent-service is runtime middleware that serves agent calls from deployed apps.

### 6.2 Layout

```
packages/agent-host/
  src/
    server.ts             # MCP server entry; uses @modelcontextprotocol/sdk
    tools/                # 9 tool implementations (one file each)
    resources/            # 4 resource providers
    prompts/              # 3 prompt templates
  bin/serve.ts
```

`aihu mcp serve` → stdio (default; suitable for `.mcp.json` in Cursor/Claude Desktop/VS Code MCP).
`aihu mcp serve --sse --port 3099` → SSE (remote agents).

### 6.3 9 Tools

| Tool | Purpose |
|---|---|
| `list_components()` | Scans `src/components/**/*.aihu`, reads `@agent` blocks, extracts tags |
| `get_component_metadata(tag)` | Full `AgentMetadata` + source path + raw `@agent` text + compile errors |
| `list_macros()` | Static — 39 macros with descriptions/examples (build-time extracted from Macro Vocabulary Spec) |
| `get_spec(name)` | Returns full markdown of `block-structure`/`template-attribute-syntax`/`macro-vocabulary`/`plugin-contract` |
| `validate_aihu_file(path)` | `aihu-compile --check` → `CompileError[]` mapped to `{ line, col, message, code, hint, fix }[]` |
| `compile_aihu_file(path)` | Returns emitted JS — useful for understanding macro lowering |
| `run_test(name)` | `bun test --grep <name>` with 30s timeout |
| `get_size_report()` | Reads `.size-limit.json`, runs `bun run size`, returns structured results |
| `get_agent_manifest()` | `createAgentService({ manifests: getAllAgentMetadata() })` — REQUIRES `getAllAgentMetadata()` export added to `@aihu/agent` (prerequisite, not blocker) |

### 6.4 4 Resource Types

URI scheme:
- `aihu://docs/{page}` — `docs/site/*.md` as `text/markdown`
- `aihu://specs/{spec-name}` — 4 spec files + applied amendments
- `aihu://examples/{example}/{file}` — `.aihu` files in `examples/`
- `aihu://components/{tag}` — `AgentMetadata` as JSON, dynamic per project

### 6.5 3 Prompts

- `scaffold_component` — args `{ name, has_agent?, has_style? }`; prompts agent to produce valid `.aihu` SFC
- `explain_template` — args `{ source }`; prompts agent to explain `@template` block referencing template-attribute-syntax spec
- `how_to` — args `{ task }`; seeds with relevant spec text (macro vocabulary + block structure)

### 6.6 `.mcp.json` Auto-Configuration

`aihu generate agent` and `create-aihu` write to project root:
```json
{
  "mcpServers": {
    "aihu": { "command": "aihu", "args": ["mcp", "serve"], "cwd": "." }
  }
}
```
Cursor/Claude Desktop/VS Code MCP all read this convention. One file, all clients.

## 7. Implementation Map

### Create
- `packages/language-server/` (full structure §2.2)
- `packages/agent-host/` (full structure §6.2)
- `packages/devtools/` (panel.html, ws-client.ts, vite-plugin.ts)

### Modify
- `packages/vscode-aihu/package.json` — `activationEvents`, `main`, LSP client dep
- `packages/vscode-aihu/src/extension.ts` — NEW: `LanguageClient` startup
- `packages/cli/src/bin.ts` — extend switch
- `packages/cli/src/commands/{dev,build,deploy,check,add,inspect,generate,mcp}.ts` — NEW
- `packages/agent/src/index.ts` — add `getAllAgentMetadata()` export (prerequisite for `get_agent_manifest`)
- `packages/compiler/js/postinstall.ts` — `linux/arm64` case
- `.github/workflows/release.yml` — `aarch64-unknown-linux-gnu` + SHA256 sidecars + **WASM target for playground**
- `packages/compiler/js/index.ts` — inject `dev-bridge.ts` events in dev builds
- `create-aihu` template — add `.mcp.json` to scaffold output

## 8. Phased Delivery

### M1 — TTHW Unblock + WASM Compiler (week 1, P0)
- [ ] Tag `v1.0.0` to trigger existing release workflow
- [ ] Verify all 4 platform binaries on `releases/latest/download/`
- [ ] Add aarch64-linux to release matrix + postinstall
- [ ] SHA256 sidecar generation + verification
- [ ] **WASM build of `aihu-compile` for homepage playground (P0 alongside binaries — gates arch-1 M1 flagship deliverable)**
- [ ] `aihu dev` and `aihu build` commands
- [ ] `create-aihu` ships `.mcp.json` in default template
- [ ] Measure + record TTHW_UI in `docs/tthw-log.md`

### M2 — LSP Basics + Other CLI Commands (weeks 2-4)
- `packages/language-server/` with virtual-file, source-map, compiler-bridge
- `@state` virtual file generation
- Hover docs for all 39 macros
- Macro completion in each block
- Structural diagnostics
- VS Code extension activates LSP
- Publish to marketplace
- Neovim + Helix configs
- Latency test: completion <100ms p95
- `aihu deploy`, `aihu check`, `aihu add`, `aihu generate` commands

### M3 — LSP Advanced (weeks 5-8)
- `@template` virtual file generation
- Cross-block type checking
- Go-to-definition + find references
- Code actions
- 50% public-export hover coverage
- Zed extension draft

### M4 — Agentic Surface (weeks 6-9, parallel with M3)
- Add `getAllAgentMetadata()` to `@aihu/agent`
- `packages/agent-host/` with 9 tools, 4 resources, 3 prompts
- `aihu mcp serve` CLI
- `aihu generate agent` scaffolder
- Test: Cursor + `.mcp.json` → `list_components()` works
- Test: `validate_aihu_file` returns correct `CompileError[]` for fixture
- Measure TTHW_MCP target ≤10 min
- Document MCP setup in `docs/site/installation.md`

### M5 — DevTools (weeks 8-12)
- `packages/devtools/` package
- `dev-bridge.ts` event emission in compiler dev transforms
- Component Tree, Signal Graph, Agent Registry, Network panels
- `aihu inspect` CLI
- Document in `docs/site/developer-tools.md`

## 9. Success Metrics

| Metric | Target |
|---|---|
| TTHW_UI | ≤5 min (M1) |
| TTHW_MCP | ≤10 min (M4) — agent → working scaffold from single prompt |
| LSP completion latency | <100ms p95 |
| Pre-built binary fetch | <5s on `npm install` |
| Hover coverage | ≥50% public exports (M3) |
| MCP tools | 9 |
| MCP resources | 4 types |
| Editors | VS Code + Neovim + Helix (M2), Zed (M3), IntelliJ docs (M2) |
| **Playground compile latency** | **<200ms for 50-line `.aihu` (M1, gates arch-1 homepage)** |

## 10. Critical Details

### Error Handling
LSP server NEVER crashes editor. Try/catch all paths in `plugin.ts`/`virtual-file.ts`/`compiler-bridge.ts`. Returns empty result on failure. If `aihu-compile` binary absent (TODO-001 window), returns single diagnostic: "Run: npm install @aihu/compiler".

### Performance
- Completion <100ms p95: macros are static, no subprocess call needed
- Compiler binary call: cache by SHA-256 of file content; no-change keystrokes skip binary entirely
- `list_components()`: file-watcher invalidated cache; rescan on create/delete only

### Security
- MCP local stdio: no auth needed
- SSE transport: bind `localhost` by default; `--host 0.0.0.0` explicit flag
- `compile_aihu_file` + `run_test`: paths normalized, no `..` traversal escape; 30s hard timeout on `run_test`

### Dep-Free Boundary
- `@aihu/language-server`, `@aihu/agent-host`, `@aihu/devtools` — NOT subject (dev/editor tooling, never in browser bundles)
- `@aihu/cli` additions — CLI binary only, never imported as runtime library

### Do-Not-Break Checklist
- TextMate scopes unchanged
- `postinstall.ts` exit-0 on failure preserved
- `handleToolCall` stub untouched (agent-host is separate package)
- `AgentMetadata` index signature `[key: string]: unknown` preserved
- `__aihu_plugin: true` brand preserved

## 11. Open Questions

- **OQ-DX-01:** Use `@volar/language-server` (M2) vs `@volar/language-core` directly (refactor if conflicts)
- **OQ-DX-02:** `aihu check` invokes LSP as subprocess (M1, simpler) vs imports module (M3, faster)
- **OQ-DX-03:** `@agent` virtual file deferred to M3; M2 covers state/template via compiler-bridge structural diagnostics
- **OQ-DX-04:** MCP `--sse` server uses plain Node http (NOT `@aihu/server` — it's dev tooling, not production)

---

*M1 priority — alongside pre-built binaries — is the WASM `aihu-compile` build, gating arch-1's flagship homepage playground.*
